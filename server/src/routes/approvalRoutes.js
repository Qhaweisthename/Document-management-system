const pool = require('../config/db');

// Get pending approvals based on user role and step
const getPendingApprovals = async (req, res) => {
  try {
    let query = `
      SELECT 
        a.id as approval_id,
        a.step,
        a.status as approval_status,
        a.role as required_role,
        d.id as document_id,
        d.filename,
        d.document_type,
        d.invoice_number,
        d.amount,
        d.vat,
        d.date as document_date,
        d.status as document_status,
        v.name as vendor_name,
        u.username as uploaded_by,
        (
          SELECT json_agg(
            json_build_object(
              'step', a2.step,
              'status', a2.status,
              'comments', a2.comments,
              'approver_name', u2.username,
              'created_at', a2.created_at
            ) ORDER BY a2.step
          )
          FROM approvals a2
          LEFT JOIN users u2 ON a2.approver_id = u2.id
          WHERE a2.document_id = d.id AND a2.id != a.id
        ) as approval_history
      FROM approvals a
      JOIN documents d ON a.document_id = d.id
      JOIN vendors v ON d.vendor_id = v.id
      JOIN users u ON d.created_by = u.id
      WHERE a.status = 'pending'
    `;

    // Filter based on user role
    if (req.user.role === 'approver') {
      // Approvers can see Steps 1 and 2
      query += ` AND a.step IN (1, 2)`;
    }
    // Admin sees all steps (1, 2, and 3)

    query += ` ORDER BY 
        CASE a.step
          WHEN 1 THEN 1
          WHEN 2 THEN 2
          WHEN 3 THEN 3
        END,
        d.created_at DESC`;

    const result = await pool.query(query);
    
    // Format the response
    const approvals = result.rows.map(row => ({
      document_id: row.document_id,
      approval_id: row.approval_id,
      filename: row.filename,
      document_type: row.document_type,
      invoice_number: row.invoice_number,
      amount: row.amount,
      vat: row.vat,
      date: row.document_date,
      vendor_name: row.vendor_name,
      uploaded_by: row.uploaded_by,
      current_step: row.step,
      required_role: row.required_role,
      history: row.approval_history || []
    }));

    res.json({ approvals });
  } catch (error) {
    console.error('Error fetching approvals:', error);
    res.status(500).json({ message: 'Error fetching approvals' });
  }
};

// Get approval history
const getApprovalHistory = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const result = await pool.query(
      `SELECT 
        a.*,
        u.username as approver_name,
        u.role as approver_role
       FROM approvals a
       LEFT JOIN users u ON a.approver_id = u.id
       WHERE a.document_id = $1
       ORDER BY a.step, a.created_at`,
      [documentId]
    );

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching approval history:', error);
    res.status(500).json({ message: 'Error fetching approval history' });
  }
};

// Process approval (approve/reject)
const processApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, comments } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current approval with document details
      const currentApproval = await client.query(
        `SELECT a.*, d.id as document_id, d.status as doc_status,
          d.document_type, d.invoice_number
         FROM approvals a
         JOIN documents d ON a.document_id = d.id
         WHERE a.id = $1`,
        [id]
      );

      if (currentApproval.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Approval not found' });
      }

      const approval = currentApproval.rows[0];

      // Check if already processed
      if (approval.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Approval already processed' });
      }

      // Check if user is authorized for this step
      if (req.user.role === 'approver' && approval.step > 2) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Not authorized for this approval step' });
      }

      if (req.user.role === 'viewer') {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Viewers cannot approve documents' });
      }

      // Update current approval
      await client.query(
        `UPDATE approvals 
         SET status = $1, comments = $2, approver_id = $3, created_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [status, comments, req.user.id, id]
      );

      let documentStatus = 'pending';
      let nextStep = null;
      let message = '';

      if (status === 'rejected') {
        documentStatus = 'rejected';
        message = 'Document rejected';
        
        await client.query(
          `INSERT INTO document_logs (document_id, log_type, details) 
           VALUES ($1, 'info', $2)`,
          [approval.document_id, JSON.stringify({
            action: 'rejected',
            step: approval.step,
            comments,
            rejected_by: req.user.username,
            document: approval.invoice_number
          })]
        );
      } else {
        // If approved, check if more steps needed
        if (approval.step === 3) {
          documentStatus = 'approved';
          message = 'Document fully approved';
          
          await client.query(
            `INSERT INTO document_logs (document_id, log_type, details) 
             VALUES ($1, 'info', $2)`,
            [approval.document_id, JSON.stringify({
              action: 'fully_approved',
              comments,
              approved_by: req.user.username,
              document: approval.invoice_number
            })]
          );
        } else {
          nextStep = approval.step + 1;
          
          await client.query(
            `INSERT INTO approvals (document_id, step, status, role) 
             VALUES ($1, $2, 'pending', $3)`,
            [approval.document_id, nextStep, 
             nextStep === 3 ? 'admin' : 'approver']
          );
          
          message = `Step ${approval.step} approved, moving to Step ${nextStep}`;
          
          await client.query(
            `INSERT INTO document_logs (document_id, log_type, details) 
             VALUES ($1, 'info', $2)`,
            [approval.document_id, JSON.stringify({
              action: 'step_approved',
              step: approval.step,
              next_step: nextStep,
              approved_by: req.user.username,
              document: approval.invoice_number
            })]
          );
        }
      }

      // Update document status
      await client.query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [documentStatus, approval.document_id]
      );

      await client.query('COMMIT');

      res.json({
        message,
        documentStatus,
        nextStep,
        final: documentStatus === 'approved' || documentStatus === 'rejected'
      });

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error processing approval:', error);
    res.status(500).json({ message: 'Error processing approval' });
  }
};

// Get approval statistics
const getApprovalStats = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT d.id) as total_documents,
        COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_documents,
        COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_documents,
        COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_documents,
        COALESCE(
          AVG(CASE 
            WHEN d.status = 'approved' 
            THEN EXTRACT(EPOCH FROM (d.updated_at - d.created_at))/86400 
          END), 0
        ) as avg_approval_days,
        (
          SELECT COUNT(*) FROM approvals 
          WHERE status = 'pending' AND step = 1
        ) as pending_step1,
        (
          SELECT COUNT(*) FROM approvals 
          WHERE status = 'pending' AND step = 2
        ) as pending_step2,
        (
          SELECT COUNT(*) FROM approvals 
          WHERE status = 'pending' AND step = 3
        ) as pending_step3
      FROM documents d
    `);

    res.json({ stats: stats.rows[0] });
  } catch (error) {
    console.error('Error fetching approval stats:', error);
    res.status(500).json({ message: 'Error fetching approval stats' });
  }
};

module.exports = {
  getPendingApprovals,
  getApprovalHistory,
  processApproval,
  getApprovalStats
};