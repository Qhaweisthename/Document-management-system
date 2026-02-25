const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getPendingApprovals,
  getApprovalHistory,
  processApproval,
  getApprovalStats
} = require('../controllers/approvalController');

// All routes require authentication
router.use(protect);

// Get pending approvals (approvers and admins)
router.get('/pending', authorize('admin', 'approver'), getPendingApprovals);

// Get approval history for a document
router.get('/history/:documentId', getApprovalHistory);

// Process an approval (approve/reject)
router.put('/:id', authorize('admin', 'approver'), processApproval);

// Get approval statistics (admin only)
router.get('/stats', authorize('admin'), getApprovalStats);

module.exports = router;