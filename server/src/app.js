// server/src/app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const approvalRoutes = require('./routes/approvalRoutes');
const reportRoutes = require('./routes/reportRoutes');
const insightsRoutes = require('./routes/insightsRoutes');
const aiExtractionRoutes = require('./routes/aiExtractionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const documentRoutes = require('./routes/documentRoutes');

const app = express();

// ============ FIXED CORS CONFIGURATION ============
// Allow ALL origins with credentials support
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
}));




// ============ SIMPLIFIED OPTIONS HANDLER ============
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Origin, X-Requested-With, Accept');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============ ROUTES - ORDER MATTERS! ============
// Document routes first (most specific)
app.use('/api/documents', documentRoutes);

// Then other API routes
app.use('/api/upload', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/ai-extraction', aiExtractionRoutes);
app.use('/api/dashboard', dashboardRoutes);

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
      },
      documents: {
        upload: 'POST /api/documents/upload',
        getAll: 'GET /api/documents/all',
        download: 'GET /api/documents/download/:id',
        vendors: 'GET /api/documents/vendors'
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

// 404 handler (this should be LAST)
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.method} ${req.url} not found` });
});

module.exports = app;