// server/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);

// Test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'DMS API Running...',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        changePassword: 'PUT /api/auth/change-password'
      }
    }
  });
});

// Health check route
app.get('/api/health', async (req, res) => {
  try {
    const pool = require('./config/db');
    const result = await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      database: 'connected',
      dbTime: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      database: 'disconnected',
      error: error.message 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

module.exports = app;