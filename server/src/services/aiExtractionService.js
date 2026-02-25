const vision = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

class AIExtractionService {
  constructor() {
    // Initialize the Vision API client
    this.client = new vision.ImageAnnotatorClient({
      keyFilename: path.join(__dirname, '../../gcp-credentials.json')
    });
  }

  /**
   * Extract data from document using Google Cloud Vision
   */
  async extractFromDocument(filePath, documentId) {
    try {
      console.log(`🔍 Extracting data from document: ${filePath}`);

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
      
      // Log failure
      await pool.query(
        `INSERT INTO document_logs (document_id, log_type, details) 
         VALUES ($1, 'extraction_issue', $2)`,
        [documentId, JSON.stringify({
          error: error.message,
          timestamp: new Date()
        })]
      );

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
        const match = text.match(pattern);
        if (match && match[1]) {
          extracted[field] = match[1].trim();
          
          // Clean up extracted values
          if (field === 'amount' || field === 'vat') {
            extracted[field] = extracted[field].replace(/[^\d.-]/g, '');
          }
          break;
        }
      }
    }

    // If vendor not found, try to extract from first few lines
    if (!extracted.vendor) {
      const firstLines = text.split('\n').slice(0, 3).join(' ');
      if (firstLines.length > 5 && firstLines.length < 100) {
        extracted.vendor = firstLines.trim();
      }
    }

    return extracted;
  }

  /**
   * Calculate confidence score from Vision API response
   */
  calculateConfidence(visionResponse) {
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
  }

  /**
   * Store extraction results in database
   */
  async storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation) {
    const aiExtraction = {
      extracted_fields: extractedData,
      confidence: confidence,
      raw_text: fullTextAnnotation.text,
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
  }

  /**
   * Validate if file is supported
   */
  isFileSupported(filename) {
    const supported = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp'];
    const ext = path.extname(filename).toLowerCase();
    return supported.includes(ext);
  }

  /**
   * Get file size limit
   */
  getFileSizeLimit() {
    return 20 * 1024 * 1024; // 20MB for Vision API
  }
}

module.exports = new AIExtractionService();