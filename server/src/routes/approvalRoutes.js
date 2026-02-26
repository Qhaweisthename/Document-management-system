const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const approvalController = require('../controllers/approvalController');

// Log to confirm controller loads
console.log('✅ approvalRoutes loaded');
console.log('📦 Controller functions:', Object.keys(approvalController));

// All routes require authentication
router.use(protect);

// Get pending approvals (approvers and admins)
router.get('/pending', authorize('admin', 'approver'), approvalController.getPendingApprovals);

// Get approval history for a document
router.get('/history/:documentId', approvalController.getApprovalHistory);

// Process an approval (approve/reject)
router.put('/:id', authorize('admin', 'approver'), approvalController.processApproval);

// Get approval statistics (admin only)
router.get('/stats', authorize('admin'), approvalController.getApprovalStats);

module.exports = router;