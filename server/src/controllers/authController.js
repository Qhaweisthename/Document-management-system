// server/src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Register new user
const register = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ 
        message: 'Please provide username, email and password' 
      });
    }

    // Check if user exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const newUser = await pool.query(
      `INSERT INTO users (username, email, password_hash, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, username, email, role, created_at`,
      [username, email, password_hash, role || 'viewer']
    );

    // Create token
    const token = jwt.sign(
      { 
        id: newUser.rows[0].id, 
        email: newUser.rows[0].email, 
        role: newUser.rows[0].role 
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: newUser.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      message: 'Server error during registration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // Check if user exists
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Update last login
    await pool.query(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );

    // Create token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    // Remove password from response
    delete user.password_hash;

    res.json({
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get current user
const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ 
        message: 'Please provide current password and new password' 
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ 
        message: 'New password must be at least 6 characters' 
      });
    }

    // Get user with password
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0];

    // Check current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(newPassword, salt);

    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [password_hash, req.user.id]
    );

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  changePassword
};