const vision = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

class AIExtractionService {
  constructor() {
    // Initialize the Vision API client with proper error handling
    try {
      let credentials = null;
      
      // Check for credentials in environment variable (Render)
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
        console.log('🔑 Loading Google credentials from environment variable');
        const credentialsJson = Buffer.from(
          process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
          'base64'
        ).toString();
        credentials = JSON.parse(credentialsJson);
      } 
      // Fallback to file for local development
      else {
        const credentialsPath = path.join(__dirname, '../../gcp-credentials.json');
        if (fs.existsSync(credentialsPath)) {
          console.log('🔑 Loading Google credentials from file');
          credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        } else {
          console.warn('⚠️  No Google Cloud credentials found. AI extraction will be disabled.');
          this.disabled = true;
          return;
        }
      }

      this.client = new vision.ImageAnnotatorClient({
        credentials: credentials
      });
      this.disabled = false;
      console.log('✅ Google Cloud Vision client initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Vision:', error.message);
      this.disabled = true;
    }
  }

  /**
   * Extract data from document using Google Cloud Vision
   */
  async extractFromDocument(filePath, documentId) {
    // Check if service is disabled
    if (this.disabled) {
      console.log('⚠️ AI extraction skipped (service disabled)');
      return {
        success: false,
        error: 'AI extraction service not configured',
        disabled: true
      };
    }

    try {
      console.log(`🔍 Extracting data from document: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      // Read file
      const fileContent = fs.readFileSync(filePath);
      
      // Perform document text detection
      const [result] = await this.client.documentTextDetection({
        image: { content: fileContent.toString('base64') }
      });

      const fullTextAnnotation = result.fullTextAnnotation;
      
      if (!fullTextAnnotation) {
        throw new Error('No text detected in document');
      }

      // Extract structured data using regex patterns
      const extractedData = this.parseExtractedText(fullTextAnnotation.text);
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(result);
      
      // Store extraction results
      await this.storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation);

      return {
        success: true,
        data: extractedData,
        confidence,
        text: fullTextAnnotation.text
      };

    } catch (error) {
      console.error('AI Extraction error:', error);
      
      // Log failure but DON'T crash the server
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

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse extracted text to find invoice fields
   */
  parseExtractedText(text) {
    const extracted = {
      invoice_number: null,
      date: null,
      amount: null,
      vat: null,
      vendor: null,
      confidence_scores: {}
    };

    // Common patterns for invoice fields
    const patterns = {
      invoice_number: [
        /INVOICE\s*#?\s*[:\s]*([A-Z0-9\-/]+)/i,
        /INVOICE\s*N[O°]\.?\s*[:\s]*([A-Z0-9\-/]+)/i,
        /INV-\d+/i,
        /INVOICE\s*(\d+)/
      ],
      date: [
        /DATE\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /INVOICE\s*DATE\s*[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
        /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
        /(\d{1,2}\s+[A-Za-z]+\s+\d{4})/
      ],
      amount: [
        /TOTAL\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i,
        /AMOUNT\s*DUE\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i,
        /GRAND\s*TOTAL\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i,
        /TOTAL\s*AMOUNT\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i
      ],
      vat: [
        /VAT\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i,
        /TAX\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i,
        /VAT\s*AMOUNT\s*[:\s]*[$€£]?\s*([\d,]+\.?\d*)/i
      ],
      vendor: [
        /^([A-Za-z\s&]+(?:\n|$))/m,
        /FROM\s*[:\s]*([A-Za-z\s&]+)/i,
        /VENDOR\s*[:\s]*([A-Za-z\s&]+)/i,
        /SUPPLIER\s*[:\s]*([A-Za-z\s&]+)/i
      ]
    };

    // Extract each field using patterns
    for (const [field, fieldPatterns] of Object.entries(patterns)) {
      for (const pattern of fieldPatterns) {
        try {
          const match = text.match(pattern);
          if (match && match[1]) {
            extracted[field] = match[1].trim();
            
            // Clean up extracted values
            if (field === 'amount' || field === 'vat') {
              extracted[field] = extracted[field].replace(/[^\d.-]/g, '');
            }
            break;
          }
        } catch (e) {
          // Skip pattern if it causes error
          continue;
        }
      }
    }

    // If vendor not found, try to extract from first few lines
    if (!extracted.vendor) {
      try {
        const firstLines = text.split('\n').slice(0, 3).join(' ');
        if (firstLines.length > 5 && firstLines.length < 100) {
          extracted.vendor = firstLines.trim();
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return extracted;
  }

  /**
   * Calculate confidence score from Vision API response
   */
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
      console.error('Error calculating confidence:', error);
      return 0.5;
    }
  }

  /**
   * Store extraction results in database
   */
  async storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation) {
    try {
      const aiExtraction = {
        extracted_fields: extractedData,
        confidence: confidence,
        raw_text: fullTextAnnotation?.text?.substring(0, 1000) || '', // Limit text size
        timestamp: new Date(),
        warnings: []
      };

      // Check for low confidence
      if (confidence < 0.7) {
        aiExtraction.warnings.push('Low confidence extraction');
      }

      // Check for missing critical fields
      const criticalFields = ['invoice_number', 'date', 'amount', 'vendor'];
      criticalFields.forEach(field => {
        if (!extractedData[field]) {
          aiExtraction.warnings.push(`Missing ${field}`);
        }
      });

      // Compare extracted amount with user-submitted amount
      try {
        const document = await pool.query(
          'SELECT amount FROM documents WHERE id = $1',
          [documentId]
        );

        if (document.rows[0] && extractedData.amount) {
          const submittedAmount = parseFloat(document.rows[0].amount);
          const extractedAmount = parseFloat(extractedData.amount);
          
          if (Math.abs(submittedAmount - extractedAmount) > 10) {
            aiExtraction.warnings.push('Amount mismatch between submitted and extracted');
            
            // Log anomaly
            await pool.query(
              `INSERT INTO document_logs (document_id, log_type, details) 
               VALUES ($1, 'anomaly', $2)`,
              [documentId, JSON.stringify({
                type: 'amount_mismatch',
                submitted: submittedAmount,
                extracted: extractedAmount,
                difference: Math.abs(submittedAmount - extractedAmount)
              })]
            );
          }
        }
      } catch (dbError) {
        console.error('Error comparing amounts:', dbError);
      }

      // Update document with AI extraction results
      await pool.query(
        `UPDATE documents 
         SET ai_extraction = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [aiExtraction, documentId]
      );

      // Log successful extraction
      await pool.query(
        `INSERT INTO document_logs (document_id, log_type, details) 
         VALUES ($1, 'info', $2)`,
        [documentId, JSON.stringify({
          action: 'ai_extraction_complete',
          confidence,
          fields_extracted: Object.keys(extractedData).filter(k => extractedData[k]).length
        })]
      );

      return aiExtraction;
    } catch (error) {
      console.error('Error storing extraction results:', error);
      // Don't throw - we don't want to crash the server
    }
  }

  /**
   * Validate if file is supported
   */
  isFileSupported(filename) {
    try {
      const supported = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp'];
      const ext = path.extname(filename).toLowerCase();
      return supported.includes(ext);
    } catch (error) {
      console.error('Error checking file support:', error);
      return false;
    }
  }

  /**
   * Get file size limit
   */
  getFileSizeLimit() {
    return 20 * 1024 * 1024; // 20MB for Vision API
  }
}

// Export with error handling
let instance;
try {
  instance = new AIExtractionService();
} catch (error) {
  console.error('Failed to create AI Extraction Service:', error);
  instance = { disabled: true, extractFromDocument: () => Promise.resolve({ success: false, error: 'Service unavailable' }) };
}

module.exports = instance;