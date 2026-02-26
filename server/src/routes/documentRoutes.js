const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  upload,
  uploadDocument,
  getAllDocuments,
  getMyUploads,
  getVendors,
  createVendor,
  downloadDocument,
  getDocumentWorkflowStatus,
  deleteDocument,
  extractPreview  // ← Keep this ONE line, remove the duplicate below
} = require('../controllers/documentController');

// REMOVE THIS DUPLICATE LINE:
// const { extractPreview } = require('../controllers/documentController');

// Validation
const documentValidation = [
  body('vendor_id').isInt().withMessage('Valid vendor ID is required'),
  body('document_type').isIn(['invoice', 'credit_note']).withMessage('Document type must be invoice or credit note'),
  body('date').isDate().withMessage('Valid date is required'),
  body('amount').isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  body('vat').isFloat({ min: 0 }).withMessage('VAT must be a positive number'),
  body('invoice_number').notEmpty().withMessage('Invoice number is required')
];

const vendorValidation = [
  body('name').notEmpty().withMessage('Vendor name is required')
];

// ============ PUBLIC ROUTES (All authenticated users) ============

// Get ALL documents (viewers, approvers, admins all see everything)
router.get('/all', protect, getAllDocuments);

// Get current user's uploads only
router.get('/my-uploads', protect, getMyUploads);

// Download any document
router.get('/download/:id', protect, downloadDocument);

// Get workflow status for any document
router.get('/workflow/:id', protect, getDocumentWorkflowStatus);

// Get vendors list
router.get('/vendors', protect, getVendors);

// ============ EXTRACT PREVIEW ROUTE ============
router.post('/extract-preview', 
  protect,
  (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  extractPreview
);

// ============ UPLOAD ROUTES (Admin & Approver only) ============
// Upload document
router.post('/upload', 
  protect, 
  authorize('admin', 'approver'),
  (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  documentValidation,
  uploadDocument
);

// ============ ADMIN ONLY ROUTES ============

// Create new vendor
router.post('/vendors', protect, authorize('admin'), vendorValidation, createVendor);

// Delete document
router.delete('/:id', protect, authorize('admin'), deleteDocument);

module.exports = router;