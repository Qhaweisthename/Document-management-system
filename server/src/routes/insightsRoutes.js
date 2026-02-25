const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getInsightsDashboard } = require('../controllers/insightsController');

// All insights routes require authentication
router.use(protect);

// Get insights dashboard data
router.get('/dashboard', getInsightsDashboard);

module.exports = router;