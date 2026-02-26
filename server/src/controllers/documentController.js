const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/db');
const aiExtractionService = require('../services/aiExtractionService');

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
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

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: fileFilter
}).single('document'); // 'document' is the field name

/**
 * Upload a new document
 * Only admins and approvers can upload
 */
const uploadDocument = async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

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
      fs.unlinkSync(req.file.path);
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Check for duplicates before inserting
    const duplicateCheck = await checkForDuplicates(invoice_number, vendor_id, amount);
    
    if (duplicateCheck.isDuplicate) {
      fs.unlinkSync(req.file.path);
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

    // Perform REAL AI extraction using Google Cloud Vision
    // Don't await this - let it run in the background
    performAIExtraction(document.id, req.file.path).catch(error => {
      console.error('Background AI extraction error:', error);
    });

    await client.query('COMMIT');

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
      fs.unlinkSync(req.file.path);
    }
    
    console.error('Upload error:', error);
    
    // Check for duplicate invoice error
    if (error.code === '23505') { // Unique violation
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
 * Get ALL documents (for viewers, approvers, and admins)
 * This ensures everyone sees meaningful data
 */
const getAllDocuments = async (req, res) => {
  try {
    // All roles see ALL documents
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

    // Add workflow status to each document
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

      // Parse AI extraction if exists
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

      // Determine if user can edit this document
      const canEdit = req.user.role === 'admin' || req.user.id === doc.created_by;

      return {
        ...doc,
        workflow_status: workflowStatus,
        ai_extraction: aiExtraction,
        can_edit: canEdit,
        can_delete: req.user.role === 'admin' // Only admins can delete
      };
    });

    res.json({ documents: documentsWithStatus });
  } catch (error) {
    console.error('Error fetching all documents:', error);
    res.status(500).json({ message: 'Error fetching documents' });
  }
};

/**
 * Get only the current user's uploads
 * Useful for "My Documents" view
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

    // Add workflow status to each document
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

      // Parse AI extraction if exists
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

    res.json({ documents: documentsWithStatus });
  } catch (error) {
    console.error('Error fetching my uploads:', error);
    res.status(500).json({ message: 'Error fetching uploads' });
  }
};

// Check for duplicates
const checkForDuplicates = async (invoiceNumber, vendorId, amount) => {
  try {
    // Primary check: Invoice number match
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

    // Secondary check: Vendor + amount (within reasonable tolerance)
    const tolerance = 0.01; // 1% tolerance for amount
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
    
    // Check if file exists and is readable
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const result = await aiExtractionService.extractFromDocument(filePath, documentId);
    
    if (result.success) {
      console.log(`✅ AI extraction successful for document ${documentId}`);
      console.log(`📊 Extracted:`, result.data);
      console.log(`📈 Confidence: ${(result.confidence * 100).toFixed(1)}%`);
      
      // Update document with extracted data if fields are missing or need verification
      await updateDocumentWithExtractedData(documentId, result.data);
      
      // Log successful extraction
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
      
      // Log failure
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
    
    // Log critical error
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

    // Get current document data
    const currentDoc = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );

    if (currentDoc.rows.length === 0) return;

    const document = currentDoc.rows[0];

    // Update invoice number if missing or different
    if (extractedData.invoice_number && 
        (!document.invoice_number || document.invoice_number !== extractedData.invoice_number)) {
      updates.push(`invoice_number = $${paramCount}`);
      values.push(extractedData.invoice_number);
      paramCount++;
    }

    // Update amount if missing or significantly different
    if (extractedData.amount) {
      const extractedAmount = parseFloat(extractedData.amount);
      const currentAmount = parseFloat(document.amount);
      
      if (!document.amount || Math.abs(extractedAmount - currentAmount) > 0.01) {
        updates.push(`amount = $${paramCount}`);
        values.push(extractedAmount);
        paramCount++;
      }
    }

    // Update date if missing
    if (extractedData.date && !document.date) {
      // Try to parse the date
      const parsedDate = new Date(extractedData.date);
      if (!isNaN(parsedDate.getTime())) {
        updates.push(`date = $${paramCount}`);
        values.push(parsedDate);
        paramCount++;
      }
    }

    // Try to match vendor if vendor_id is missing or different
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

    // Add AI extraction metadata
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

// Get all vendors (for dropdown)
const getVendors = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, tax_number FROM vendors ORDER BY name'
    );
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

    res.status(201).json({
      message: 'Vendor created successfully',
      vendor: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating vendor:', error);
    res.status(500).json({ message: 'Error creating vendor' });
  }
};

// Download document (all roles can download)
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
    
    // Check if file exists
    if (!fs.existsSync(document.filepath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Log download with role info
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

    res.download(document.filepath, document.filename);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ message: 'Error downloading document' });
  }
};

// Get document workflow status (all roles can view)
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
    
    // Check if document exists
    const docResult = await client.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    );
    
    if (docResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Document not found' });
    }
    
    const document = docResult.rows[0];
    
    // Delete the physical file
    if (fs.existsSync(document.filepath)) {
      fs.unlinkSync(document.filepath);
    }
    
    // Delete related records (approvals, logs will cascade due to foreign keys)
    await client.query('DELETE FROM documents WHERE id = $1', [id]);
    
    await client.query('COMMIT');
    
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
  deleteDocument
};