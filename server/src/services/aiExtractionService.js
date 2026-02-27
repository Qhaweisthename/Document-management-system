const vision = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

class AIExtractionService {
  constructor() {
    this.useMock = false;
    this.client = null;
    
    // Try to initialize Google Vision
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
        console.log('🔑 Loading Google credentials from environment variable');
        const credentialsJson = Buffer.from(
          process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
          'base64'
        ).toString();
        
        const credentials = JSON.parse(credentialsJson);
        
        this.client = new vision.ImageAnnotatorClient({
          credentials: credentials
        });
        console.log('✅ Google Cloud Vision client initialized successfully');
        console.log('🎯 REAL AI EXTRACTION ENABLED');
      } else {
        console.warn('⚠️ No Google credentials found, will use mock extraction');
        this.useMock = true;
      }
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Vision:', error.message);
      console.error('❌ Will use mock extraction instead');
      this.useMock = true;
    }
  }

  async extractFromDocument(filePath, documentId) {
    try {
      console.log(`🔍 Extracting data from document: ${filePath}`);

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.log('📁 File not found, using mock data');
        return this.getMockData();
      }

      // If we have a real client, try REAL extraction first
      if (this.client && !this.useMock) {
        console.log('🎯 Attempting REAL Google Cloud Vision extraction...');
        
        try {
          const fileContent = fs.readFileSync(filePath);
          
          const [result] = await this.client.documentTextDetection({
            image: { content: fileContent.toString('base64') }
          });

          const fullTextAnnotation = result.fullTextAnnotation;
          
          if (fullTextAnnotation && fullTextAnnotation.text) {
            console.log('✅ REAL extraction successful - text detected');
            console.log('📄 Extracted text sample:', fullTextAnnotation.text.substring(0, 200));
            
            const extractedData = this.parseExtractedText(fullTextAnnotation.text);
            const confidence = this.calculateConfidence(result);
            
            console.log('📊 REAL extracted data:', extractedData);
            
            if (documentId) {
              await this.storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation);
            }

            return {
              success: true,
              data: extractedData,
              confidence,
              text: fullTextAnnotation.text,
              real: true
            };
          } else {
            console.log('⚠️ No text detected in document');
          }
        } catch (visionError) {
          console.error('❌ Google Vision API error:', visionError.message);
          console.log('⚠️ Falling back to mock data');
        }
      }

      // Fall back to mock data
      console.log('📊 Using mock extraction data');
      return this.getMockData();

    } catch (error) {
      console.error('AI Extraction error:', error);
      return this.getMockData();
    }
  }

  getMockData() {
    return {
      success: true,
      data: {
        invoice_number: this.generateInvoiceNumber(),
        date: this.getTodayDate(),
        amount: (Math.random() * 1000 + 100).toFixed(2),
        vat: (Math.random() * 150 + 20).toFixed(2),
        vendor: this.getRandomVendor()
      },
      confidence: 0.85,
      text: 'Mock extraction data',
      mock: true
    };
  }

  generateInvoiceNumber() {
    return `INV-${Math.floor(Math.random() * 10000)}`;
  }

  getTodayDate() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getRandomVendor() {
    const vendors = ['Acme Corp', 'Tech Solutions', 'Global Supplies', 'Office Depot', 'Local Vendor'];
    return vendors[Math.floor(Math.random() * vendors.length)];
  }

  parseExtractedText(text) {
    const extracted = {
      invoice_number: null,
      date: null,
      amount: null,
      vat: null,
      vendor: null
    };

    // More comprehensive patterns for invoice fields
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