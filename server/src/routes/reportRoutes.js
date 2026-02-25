const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  generateReport,
  exportToExcel,
  exportToPDF,
  getVendorsForFilter
} = require('../controllers/reportController');

// All report routes require authentication
router.use(protect);

// Generate report (accessible by admin and approver)
router.post('/generate', authorize('admin', 'approver'), generateReport);

// Export routes
router.post('/export/excel', authorize('admin', 'approver'), exportToExcel);
router.post('/export/pdf', authorize('admin', 'approver'), exportToPDF);

// Get vendors for filter dropdown
router.get('/vendors', getVendorsForFilter);

module.exports = router;