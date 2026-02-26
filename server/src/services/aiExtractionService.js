const vision = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

class AIExtractionService {
  constructor() {
    // ONLY use environment variable - NO file fallback
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
      console.warn('⚠️  GOOGLE_APPLICATION_CREDENTIALS_BASE64 not set! AI extraction will be disabled.');
      this.disabled = true;
      return;
    }

    try {
      console.log('🔑 Loading Google credentials from environment variable');
      const credentialsJson = Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
        'base64'
      ).toString();
      
      const credentials = JSON.parse(credentialsJson);
      
      this.client = new vision.ImageAnnotatorClient({
        credentials: credentials
      });
      this.disabled = false;
      console.log('✅ Google Cloud Vision client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Vision:', error.message);
      this.disabled = true;
    }
  }

  async extractFromDocument(filePath, documentId) {
    // If service is disabled, return mock data instead of crashing
    if (this.disabled) {
      console.log('⚠️ AI extraction skipped (service disabled), using mock data');
      
      // Return mock data so the upload still works
      return {
        success: false,
        data: {
          invoice_number: `MOCK-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          amount: (Math.random() * 1000).toFixed(2),
          vat: (Math.random() * 150).toFixed(2),
          vendor: 'Mock Vendor'
        },
        confidence: 0.85,
        text: 'Mock extraction - AI service disabled',
        mock: true
      };
    }

    try {
      console.log(`🔍 Extracting data from document: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const fileContent = fs.readFileSync(filePath);
      
      const [result] = await this.client.documentTextDetection({
        image: { content: fileContent.toString('base64') }
      });

      const fullTextAnnotation = result.fullTextAnnotation;
      
      if (!fullTextAnnotation) {
        throw new Error('No text detected in document');
      }

      const extractedData = this.parseExtractedText(fullTextAnnotation.text);
      const confidence = this.calculateConfidence(result);
      
      await this.storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation);

      return {
        success: true,
        data: extractedData,
        confidence,
        text: fullTextAnnotation.text
      };

    } catch (error) {
  console.error('AI Extraction error:', error);
  
  // Log failure but DON'T crash
  try {
    await pool.query(
      `INSERT INTO document_logs (document_id, log_type, details) 
       VALUES ($1, 'extraction_issue', $2)`,
      [documentId, JSON.stringify({
        error: error.message,
        timestamp: new Date()
      })]
    );
  } catch (logError) {
    console.error('Failed to log extraction error:', logError);
  }

  // IMPORTANT CHANGE: Return success: false so frontend knows to use defaults
  return {
    success: false,  // Changed from true to false
    data: {
      invoice_number: '',
      date: '',
      amount: '',
      vat: '',
      vendor: ''
    },
    error: error.message
  };
}
  }

  parseExtractedText(text) {
    const extracted = {
      invoice_number: null,
      date: null,
      amount: null,
      vat: null,
      vendor: null
    };

    const patterns = {
      invoice_number: [/INVOICE\s*#?\s*[:\s]*([A-Z0-9\-/]+)/i, /INV-\d+/i],
      date: [/DATE\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i],
      amount: [/TOTAL\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i],
      vat: [/VAT\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i],
      vendor: [/FROM\s*[:\s]*([A-Za-z\s&]+)/i, /VENDOR\s*[:\s]*([A-Za-z\s&]+)/i]
    };

    for (const [field, fieldPatterns] of Object.entries(patterns)) {
      for (const pattern of fieldPatterns) {
        try {
          const match = text.match(pattern);
          if (match && match[1]) {
            extracted[field] = match[1].trim();
            if (field === 'amount' || field === 'vat') {
              extracted[field] = extracted[field].replace(/[^\d.-]/g, '');
            }
            break;
          }
        } catch (e) {}
      }
    }

    return extracted;
  }

  calculateConfidence(visionResponse) {
    try {
      let totalConfidence = 0;
      let wordCount = 0;

      if (visionResponse.fullTextAnnotation?.pages) {
        for (const page of visionResponse.fullTextAnnotation.pages) {
          for (const block of page.blocks || []) {
            for (const paragraph of block.paragraphs || []) {
              for (const word of paragraph.words || []) {
                totalConfidence += word.confidence || 0;
                wordCount++;
              }
            }
          }
        }
      }

      return wordCount > 0 ? totalConfidence / wordCount : 0.5;
    } catch (error) {
      return 0.5;
    }
  }

  async storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation) {
    try {
      const aiExtraction = {
        extracted_fields: extractedData,
        confidence: confidence,
        timestamp: new Date(),
        warnings: []
      };

      await pool.query(
        `UPDATE documents 
         SET ai_extraction = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [aiExtraction, documentId]
      );

    } catch (error) {
      console.error('Error storing extraction results:', error);
    }
  }
}

module.exports = new AIExtractionService();