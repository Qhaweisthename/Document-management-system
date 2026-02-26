const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getDashboardStats,
  getRecentActivity
} = require('../controllers/dashboardController');

// All dashboard routes require authentication
router.use(protect);

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get recent activity
router.get('/recent-activity', getRecentActivity);

module.exports = router;