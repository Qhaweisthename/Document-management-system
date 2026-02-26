const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const aiExtractionService = require('../services/aiExtractionService');

// ============ PRODUCTION-READY CONFIGURATION ============
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_DIR = process.env.NODE_ENV === 'production' 
  ? '/tmp/uploads' // Render's temporary directory
  : path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  console.log(`📁 Created upload directory: ${UPLOAD_DIR}`);
}

// Configure storage with production support
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const fileExt = path.extname(file.originalname);
    const fileName = `${uniqueId}${fileExt}`;
    cb(null, fileName);
  }
});

// File filter - accept only PDFs and images
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, JPEG, PNG files are allowed.'), false);
  }
};

// Configure multer with production settings
const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: fileFilter
}).single('document');

/**
 * Upload a new document
 * Only admins and approvers can upload
 */
const uploadDocument = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Log request for debugging
    console.log('📤 Upload request received:', {
      hasFile: !!req.file,
      body: req.body,
      user: req.user?.id
    });

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('📁 File saved:', {
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      path: req.file.path
    });

    const { 
      vendor_id, 
      document_type, 
      date, 
      amount, 
      vat, 
      invoice_number 
    } = req.body;

    // Validate required fields
    if (!vendor_id || !document_type || !date || !amount || !vat || !invoice_number) {
      // Delete uploaded file if validation fails
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Missing required fields' });
    }

    await client.query('BEGIN');

    // Check for duplicates before inserting
    const duplicateCheck = await checkForDuplicates(invoice_number, vendor_id, amount);
    
    if (duplicateCheck.isDuplicate) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Duplicate document detected',
        duplicate: duplicateCheck
      });
    }

    // Insert document into database
    const result = await client.query(
      `INSERT INTO documents 
       (filename, filepath, document_type, vendor_id, date, amount, vat, invoice_number, status, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [
        req.file.originalname,
        req.file.path,
        document_type,
        vendor_id,
        date,
        amount,
        vat,
        invoice_number,
        'pending',
        req.user.id
      ]
    );

    const document = result.rows[0];

    // Create first approval step (Reviewer)
    await client.query(
      `INSERT INTO approvals (document_id, step, status, role) 
       VALUES ($1, 1, 'pending', 'approver')`,
      [document.id]
    );

    // Log the workflow start
    await client.query(
      `INSERT INTO document_logs (document_id, log_type, details) 
       VALUES ($1, 'info', $2)`,
      [document.id, JSON.stringify({
        action: 'approval_workflow_started',
        step: 1,
        message: 'Document submitted for Step 1 (Reviewer) approval'
      })]
    );

    await client.query('COMMIT');

    // Perform AI extraction in background (don't await)
    performAIExtraction(document.id, req.file.path).catch(error => {
      console.error('Background AI extraction error:', error);
    });

    // Set CORS headers explicitly for this response
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    res.status(201).json({
      message: 'Document uploaded successfully and sent for approval',
      document: {
        ...document,
        current_step: 1,
        next_step: 'Reviewer Approval'
      }
    });

  } catch (error) {
    await client.query('ROLLBACK');
    
    // Delete uploaded file if database insert fails
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
    
    console.error('❌ Upload error:', error);
    
    // Check for duplicate invoice error
    if (error.code === '23505') {
      return res.status(400).json({ 
        message: 'Invoice number already exists for this vendor' 
      });
    }
    
    res.status(500).json({ 
      message: 'Error uploading document',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    client.release();
  }
};

/**
 * Extract data from document WITHOUT saving (preview)
 */
const extractPreview = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log('🔍 Preview extraction for:', req.file.originalname);
    
    // Use AI service to extract data
    const result = await aiExtractionService.extractFromDocument(
      req.file.path,
      null // No document ID for preview
    );
    
    // Clean up temp file after extraction
    try { 
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path); 
        console.log('🧹 Cleaned up temp file:', req.file.path);
      }
    } catch (e) {
      console.log('Temp file cleanup warning:', e.message);
    }
    
    // ALWAYS return a structured response, even on failure
    let extractedData = {
      invoice_number: '',
      date: '',
      amount: '',
      vat: '',
      vendor: ''
    };
    
    let success = false;
    
    if (result && result.success) {
      success = true;
      extractedData = {
        invoice_number: result.data?.invoice_number || '',
        date: result.data?.date || '',
        amount: result.data?.amount || '',
        vat: result.data?.vat || '',
        vendor: result.data?.vendor || ''
      };
      console.log('✅ Preview extraction successful:', extractedData);
    } else {
      console.log('⚠️ Preview extraction failed or returned no data');
    }
    
    // Always return 200 with success flag - never let the frontend crash
    return res.status(200).json({
      success: success,
      data: extractedData
    });
    
  } catch (error) {
    console.error('❌ Preview extraction error:', error);
    // Clean up temp file on error
    if (req.file && req.file.path) {
      try { 
        if (fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path); 
        }
      } catch (e) {}
    }
    // Return 200 with empty data instead of 500 to prevent frontend crashes
    return res.status(200).json({ 
      success: false,
      data: {
        invoice_number: '',
        date: '',
        amount: '',
        vat: '',
        vendor: ''
      }
    });
  }
};

/**
 * Get ALL documents (for viewers, approvers, and admins)
 */
const getAllDocuments = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        d.*, 
        v.name as vendor_name, 
        u.username as uploaded_by,
        u.role as uploader_role,
        (
          SELECT json_agg(
            json_build_object(
              'step', a.step,
              'status', a.status,
              'role', a.role,
              'created_at', a.created_at
            ) ORDER BY a.step
          )
          FROM approvals a
          WHERE a.document_id = d.id
        ) as approval_steps,
        (
          SELECT step
          FROM approvals
          WHERE document_id = d.id AND status = 'pending'
          ORDER BY step
          LIMIT 1
        ) as current_step
      FROM documents d
      LEFT JOIN vendors v ON d.vendor_id = v.id
      LEFT JOIN users u ON d.created_by = u.id
      ORDER BY d.created_at DESC`
    );

    const documentsWithStatus = result.rows.map(doc => {
      let workflowStatus = 'Unknown';
      
      if (doc.status === 'approved') {
        workflowStatus = 'Fully Approved';
      } else if (doc.status === 'rejected') {
        workflowStatus = 'Rejected';
      } else if (doc.current_step) {
        const stepLabels = {
          1: 'Awaiting Reviewer',
          2: 'Awaiting Manager',
          3: 'Awaiting Final Approval'
        };
        workflowStatus = stepLabels[doc.current_step] || 'In Review';
      }

      let aiExtraction = null;
      if (doc.ai_extraction) {
        try {
          aiExtraction = typeof doc.ai_extraction === 'string' 
            ? JSON.parse(doc.ai_extraction) 
            : doc.ai_extraction;
        } catch (e) {
          console.error('Error parsing AI extraction:', e);
        }
      }

      const canEdit = req.user.role === 'admin' || req.user.id === doc.created_by;

      return {
        ...doc,
        workflow_status: workflowStatus,
        ai_extraction: aiExtraction,
        can_edit: canEdit,
        can_delete: req.user.role === 'admin'
      };
    });

    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.json({ documents: documentsWithStatus });
  } catch (error) {
    console.error('Error fetching all documents:', error);
    res.status(500).json({ message: 'Error fetching documents' });
  }
};

/**
 * Get only the current user's uploads
 */
const getMyUploads = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        d.*, 
        v.name as vendor_name, 
        u.username as uploaded_by,
        (
          SELECT json_agg(
            json_build_object(
              'step', a.step,
              'status', a.status,
              'role', a.role,
              'created_at', a.created_at
            ) ORDER BY a.step
          )
          FROM approvals a
          WHERE a.document_id = d.id
        ) as approval_steps,
        (
          SELECT step
          FROM approvals
          WHERE document_id = d.id AND status = 'pending'
          ORDER BY step
          LIMIT 1
        ) as current_step
       FROM documents d
       LEFT JOIN vendors v ON d.vendor_id = v.id
       LEFT JOIN users u ON d.created_by = u.id
       WHERE d.created_by = $1
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );

    const documentsWithStatus = result.rows.map(doc => {
      let workflowStatus = 'Unknown';
      
      if (doc.status === 'approved') {
        workflowStatus = 'Fully Approved';
      } else if (doc.status === 'rejected') {
        workflowStatus = 'Rejected';
      } else if (doc.current_step) {
        const stepLabels = {
          1: 'Awaiting Reviewer',
          2: 'Awaiting Manager',
          3: 'Awaiting Final Approval'
        };
        workflowStatus = stepLabels[doc.current_step] || 'In Review';
      }

      let aiExtraction = null;
      if (doc.ai_extraction) {
        try {
          aiExtraction = typeof doc.ai_extraction === 'string' 
            ? JSON.parse(doc.ai_extraction) 
            : doc.ai_extraction;
        } catch (e) {
          console.error('Error parsing AI extraction:', e);
        }
      }

      return {
        ...doc,
        workflow_status: workflowStatus,
        ai_extraction: aiExtraction
      };
    });

    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.json({ documents: documentsWithStatus });
  } catch (error) {
    console.error('Error fetching my uploads:', error);
    res.status(500).json({ message: 'Error fetching uploads' });
  }
};

// Check for duplicates
const checkForDuplicates = async (invoiceNumber, vendorId, amount) => {
  try {
    const invoiceMatch = await pool.query(
      `SELECT * FROM documents 
       WHERE invoice_number = $1 AND vendor_id = $2`,
      [invoiceNumber, vendorId]
    );

    if (invoiceMatch.rows.length > 0) {
      return {
        isDuplicate: true,
        reason: 'Invoice number already exists for this vendor',
        matchType: 'exact',
        existingDocument: invoiceMatch.rows[0]
      };
    }

    const tolerance = 0.01;
    const amountMatch = await pool.query(
      `SELECT * FROM documents 
       WHERE vendor_id = $1 
       AND ABS(amount - $2::numeric) <= $2::numeric * $3
       AND created_at > NOW() - INTERVAL '30 days'`,
      [vendorId, amount, tolerance]
    );

    if (amountMatch.rows.length > 0) {
      return {
        isDuplicate: true,
        reason: 'Similar amount found for this vendor within last 30 days',
        matchType: 'similar',
        existingDocument: amountMatch.rows[0]
      };
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Duplicate check error:', error);
    return { isDuplicate: false, error: error.message };
  }
};

/**
 * Perform real AI extraction using Google Cloud Vision
 */
const performAIExtraction = async (documentId, filePath) => {
  try {
    console.log(`🤖 Starting AI extraction for document ${documentId}`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const result = await aiExtractionService.extractFromDocument(filePath, documentId);
    
    if (result.success) {
      console.log(`✅ AI extraction successful for document ${documentId}`);
      await updateDocumentWithExtractedData(documentId, result.data);
      
      await pool.query(
        `INSERT INTO document_logs (document_id, log_type, details) 
         VALUES ($1, 'info', $2)`,
        [documentId, JSON.stringify({
          action: 'ai_extraction_complete',
          confidence: result.confidence,
          extracted_fields: result.data,
          timestamp: new Date()
        })]
      );
    } else {
      console.error(`❌ AI extraction failed for document ${documentId}:`, result.error);
      await pool.query(
        `INSERT INTO document_logs (document_id, log_type, details) 
         VALUES ($1, 'extraction_issue', $2)`,
        [documentId, JSON.stringify({
          error: result.error,
          timestamp: new Date()
        })]
      );
    }
    
    return result;
  } catch (error) {
    console.error('AI extraction error:', error);
    await pool.query(
      `INSERT INTO document_logs (document_id, log_type, details) 
       VALUES ($1, 'extraction_issue', $2)`,
      [documentId, JSON.stringify({
        error: error.message,
        critical: true,
        timestamp: new Date()
      })]
    );
    return { success: false, error: error.message };
  }
};

/**
 * Update document with extracted AI data
 */
const updateDocumentWithExtractedData = async (documentId, extractedData) => {
  try {
    const updates = [];
    const values = [];
    let paramCount = 1;

    const currentDoc = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (currentDoc.rows.length === 0) return;

    const document = currentDoc.rows[0];

    if (extractedData.invoice_number && 
        (!document.invoice_number || document.invoice_number !== extractedData.invoice_number)) {
      updates.push(`invoice_number = $${paramCount}`);
      values.push(extractedData.invoice_number);
      paramCount++;
    }

    if (extractedData.amount) {
      const extractedAmount = parseFloat(extractedData.amount);
      const currentAmount = parseFloat(document.amount);
      
      if (!document.amount || Math.abs(extractedAmount - currentAmount) > 0.01) {
        updates.push(`amount = $${paramCount}`);
        values.push(extractedAmount);
        paramCount++;
      }
    }

    if (extractedData.date && !document.date) {
      const parsedDate = new Date(extractedData.date);
      if (!isNaN(parsedDate.getTime())) {
        updates.push(`date = $${paramCount}`);
        values.push(parsedDate);
        paramCount++;
      }
    }

    if (extractedData.vendor) {
      const vendorResult = await pool.query(
        'SELECT id FROM vendors WHERE name ILIKE $1',
        [`%${extractedData.vendor}%`]
      );
      
      if (vendorResult.rows.length > 0 && 
          (!document.vendor_id || document.vendor_id !== vendorResult.rows[0].id)) {
        updates.push(`vendor_id = $${paramCount}`);
        values.push(vendorResult.rows[0].id);
        paramCount++;
      }
    }

    updates.push(`ai_extraction = $${paramCount}`);
    values.push(JSON.stringify({
      extracted: extractedData,
      timestamp: new Date(),
      updated_fields: updates.map(u => u.split(' ')[0])
    }));
    paramCount++;

    if (updates.length > 0) {
      values.push(documentId);
      await pool.query(
        `UPDATE documents SET ${updates.join(', ')} WHERE id = $${paramCount}`,
        values
      );
      console.log(`📝 Updated document ${documentId} with AI extracted data`);
    }
  } catch (error) {
    console.error('Error updating document with extracted data:', error);
  }
};

// Get all vendors
const getVendors = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, tax_number FROM vendors ORDER BY name'
    );
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.json({ vendors: result.rows });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ message: 'Error fetching vendors' });
  }
};

// Create new vendor
const createVendor = async (req, res) => {
  try {
    const { name, tax_number } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Vendor name is required' });
    }

    const result = await pool.query(
      'INSERT INTO vendors (name, tax_number) VALUES ($1, $2) RETURNING *',
      [name, tax_number]
    );

    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.status(201).json({
      message: 'Vendor created successfully',
      vendor: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating vendor:', error);
    res.status(500).json({ message: 'Error creating vendor' });
  }
};

// Download document
const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const document = result.rows[0];
    
    if (!fs.existsSync(document.filepath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    await pool.query(
      `INSERT INTO document_logs (document_id, log_type, details) 
       VALUES ($1, 'info', $2)`,
      [id, JSON.stringify({
        action: 'download',
        userId: req.user.id,
        userRole: req.user.role,
        username: req.user.username,
        timestamp: new Date()
      })]
    );

    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.download(document.filepath, document.filename);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Error downloading document' });
  }
};

// Get document workflow status
const getDocumentWorkflowStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `SELECT 
        d.*,
        v.name as vendor_name,
        (
          SELECT json_agg(
            json_build_object(
              'step', a.step,
              'status', a.status,
              'role', a.role,
              'comments', a.comments,
              'approver_name', u.username,
              'created_at', a.created_at
            ) ORDER BY a.step
          )
          FROM approvals a
          LEFT JOIN users u ON a.approver_id = u.id
          WHERE a.document_id = d.id
        ) as approval_history
       FROM documents d
       LEFT JOIN vendors v ON d.vendor_id = v.id
       WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.json({ workflow: result.rows[0] });
  } catch (error) {
    console.error('Error fetching workflow status:', error);
    res.status(500).json({ message: 'Error fetching workflow status' });
  }
};

// Delete document (admin only)
const deleteDocument = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    
    const docResult = await client.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );
    
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Document not found' });
    }
    
    const document = docResult.rows[0];
    
    if (fs.existsSync(document.filepath)) {
      fs.unlinkSync(document.filepath);
    }
    
    await client.query('DELETE FROM documents WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.json({ message: 'Document deleted successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Delete error:', error);
    res.status(500).json({ message: 'Error deleting document' });
  } finally {
    client.release();
  }
};

module.exports = {
  upload,
  uploadDocument,
  getAllDocuments,
  getMyUploads,
  getVendors,
  createVendor,
  downloadDocument,
  getDocumentWorkflowStatus,
  deleteDocument,
  extractPreview  // ← ADDED THIS LINE
};