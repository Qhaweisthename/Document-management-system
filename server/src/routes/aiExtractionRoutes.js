const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const aiExtractionService = require('../services/aiExtractionService');
const pool = require('../config/db');
const fs = require('fs');

// Test extraction on an existing document
router.post('/test/:documentId', protect, async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Get document
    const docResult = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [documentId]
    );
    
    if (docResult.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    const document = docResult.rows[0];
    
    // Check if file exists
    if (!fs.existsSync(document.filepath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    // Perform extraction
    const result = await aiExtractionService.extractFromDocument(
      document.filepath,
      documentId
    );
    
    res.json({
      message: result.success ? 'Extraction successful' : 'Extraction failed',
      result
    });
    
  } catch (error) {
    console.error('Test extraction error:', error);
    res.status(500).json({ message: 'Error testing extraction' });
  }
});

// Get extraction status
router.get('/status/:documentId', protect, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT ai_extraction FROM documents WHERE id = $1',
      [req.params.documentId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    res.json({ extraction: result.rows[0].ai_extraction });
  } catch (error) {
    console.error('Error fetching extraction status:', error);
    res.status(500).json({ message: 'Error fetching extraction status' });
  }
});

// Add this temporary test endpoint
router.get('/test-credentials', protect, async (req, res) => {
  try {
    const service = new AIExtractionService();
    if (service.useMock) {
      res.json({ 
        status: '⚠️ Using MOCK data', 
        message: 'Google Cloud Vision is NOT initialized. Check your credentials.' 
      });
    } else {
      res.json({ 
        status: '✅ Google Cloud Vision is working', 
        message: 'Real AI extraction enabled' 
      });
    }
  } catch (error) {
    res.json({ status: '❌ Error', error: error.message });
  }
});

module.exports = router;