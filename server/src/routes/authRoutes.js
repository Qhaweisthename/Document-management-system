// server/src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { 
  register, 
  login, 
  getMe, 
  changePassword 
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Validation middleware
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Validation rules
const registerValidation = [
  body('username').notEmpty().withMessage('Username is required'),
  body('email').isEmail().withMessage('Please include a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'approver', 'viewer']).withMessage('Invalid role'),
  validate
];

const loginValidation = [
  body('email').isEmail().withMessage('Please include a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
  validate
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  validate
];

// Routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.get('/me', protect, getMe);
router.put('/change-password', protect, changePasswordValidation, changePassword);

// Test route to check if auth is working
router.get('/test', (req, res) => {
  res.json({ message: 'Auth routes are working' });
});

module.exports = router;