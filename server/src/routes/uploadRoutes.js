const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  upload,
  uploadDocument,
  getVendors,
  createVendor,
  getUserUploads,
  downloadDocument
} = require('../controllers/uploadController');

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

// Routes
router.post('/document', 
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

router.get('/vendors', protect, getVendors);
router.post('/vendors', protect, authorize('admin'), vendorValidation, createVendor);
router.get('/my-uploads', protect, getUserUploads);
router.get('/download/:id', protect, downloadDocument);

module.exports = router;