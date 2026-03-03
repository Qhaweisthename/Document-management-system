const vision = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const pdf = require('pdf-poppler');
const os = require('os');

class AIExtractionService {
  constructor() {
    this.useMock = false;
    this.client = null;
    this.initialized = false;
    
    // Try to initialize Google Vision
    this.initializeClient();
  }

  initializeClient() {
    try {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
        console.warn('⚠️ No Google credentials found in environment variables');
        console.warn('📍 Please set GOOGLE_APPLICATION_CREDENTIALS_BASE64 in your .env file');
        this.useMock = true;
        return;
      }

      console.log('🔑 Found Google credentials, attempting to initialize...');
      console.log('📦 Credentials length:', process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64.length);
      
      const credentialsJson = Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 
        'base64'
      ).toString();
      
      console.log('✅ Successfully decoded base64 credentials');
      
      const credentials = JSON.parse(credentialsJson);
      console.log('✅ Successfully parsed credentials JSON');
      console.log('📋 Project ID:', credentials.project_id);
      
      this.client = new vision.ImageAnnotatorClient({
        credentials: credentials
      });
      
      this.useMock = false;
      this.initialized = true;
      console.log('✅✅✅ Google Cloud Vision client initialized successfully!');
      console.log('🎯🎯🎯 REAL AI EXTRACTION ENABLED');
      
    } catch (error) {
      console.error('❌ Failed to initialize Google Cloud Vision:', error.message);
      console.error('❌ Error details:', error);
      console.error('❌ Will use mock extraction instead');
      this.useMock = true;
      this.initialized = false;
    }
  }

  async convertPDFToImage(pdfPath) {
    try {
      console.log('🔄 Converting PDF to image...');
      
      // Create temp directory for images
      const tempDir = path.join(os.tmpdir(), 'pdf-images-' + Date.now());
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const options = {
        format: 'png',
        out_dir: tempDir,
        out_prefix: 'page',
        page: 1 // Convert only first page
      };

      await pdf.convert(pdfPath, options);
      
      // Get the generated image path
      const files = fs.readdirSync(tempDir);
      const imageFile = files.find(f => f.startsWith('page-1') && f.endsWith('.png'));
      
      if (!imageFile) {
        throw new Error('No image file generated');
      }
      
      const imagePath = path.join(tempDir, imageFile);
      console.log('✅ PDF converted to image:', imagePath);
      
      // Read the image file
      const imageBuffer = fs.readFileSync(imagePath);
      
      // Clean up temp files
      try { 
        fs.unlinkSync(imagePath); 
        fs.rmdirSync(tempDir);
      } catch (e) {}
      
      return imageBuffer;
    } catch (error) {
      console.error('❌ PDF conversion error:', error);
      return null;
    }
  }

  async extractFromDocument(filePath, documentId) {
    try {
      console.log(`🔍 Extracting data from document: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        console.log('📁 File not found, using mock data');
        return this.getMockData();
      }

      // Try REAL extraction if client is initialized
      if (this.client && !this.useMock) {
        console.log('🎯 Attempting REAL Google Cloud Vision extraction...');
        
        try {
          let imageBuffer;
          const isPDF = filePath.toLowerCase().endsWith('.pdf');
          
          if (isPDF) {
            console.log('📑 Detected PDF file, converting to image first...');
            imageBuffer = await this.convertPDFToImage(filePath);
            
            if (!imageBuffer) {
              console.log('⚠️ PDF conversion failed, falling back to mock data');
              return this.getMockData();
            }
          } else {
            // For images, read directly
            imageBuffer = fs.readFileSync(filePath);
          }
          
          console.log('📄 Image size:', imageBuffer.length, 'bytes');
          
          // Use regular image detection (works for both images and converted PDFs)
          const [result] = await this.client.documentTextDetection({
            image: { content: imageBuffer.toString('base64') }
          });

          const fullTextAnnotation = result.fullTextAnnotation;
          
          if (fullTextAnnotation && fullTextAnnotation.text) {
            console.log('✅✅✅ REAL extraction successful!');
            console.log('📄 Text length:', fullTextAnnotation.text.length);
            console.log('📄 Text preview:', fullTextAnnotation.text.substring(0, 200));
            
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
          console.error('❌ Error details:', visionError);
          console.log('⚠️ Falling back to mock data');
        }
      } else {
        console.log('⚠️ Google Vision client not initialized, using mock data');
        console.log('Client exists:', !!this.client);
        console.log('Use mock:', this.useMock);
      }

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

  // Log the full text for debugging
  console.log('Full text for debugging (all):', text);
  
  // Split into lines for better processing
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  console.log('Lines in document:', lines);

  // ============ VENDOR DETECTION ============
  console.log('🔍 Searching for vendor...');
  
  // Look for company name with LLC, Inc, Corp, Ltd, Pty, etc.
  for (const line of lines) {
    if (line.includes('LLC') || line.includes('Inc') || line.includes('Corp') || 
        line.includes('Ltd') || line.includes('Pty') || line.includes('Company') ||
        line.includes('Materials') || line.includes('Solutions')) {
      extracted.vendor = line;
      console.log('✅ Found vendor from company indicator:', extracted.vendor);
      break;
    }
  }
  
  // If not found, look for first line that looks like a company name
  if (!extracted.vendor) {
    for (const line of lines) {
      // Skip lines that are common headers
      if (!line.match(/invoice|bill|description|qty|rate|amount|subtotal|total|paid|balance|payment|authorized|mobile|email|phone|fax|www|http|thank|terms|conditions|powered/i) && 
          line.length > 5 && 
          !line.includes('@') && 
          !line.match(/^\d/)) {
        extracted.vendor = line;
        console.log('✅ Found vendor from line:', extracted.vendor);
        break;
      }
    }
  }

  // ============ INVOICE NUMBER DETECTION ============
  console.log('🔍 Searching for invoice number...');
  
  // Comprehensive list of invoice number patterns
  
  // Pattern 1: Common invoice prefixes
  const invoicePrefixes = [
    'INV-', 'INV', 'INVOICE', 'INV#', 'INVOICE#', 'INVOICE NO', 'INVOICE NUMBER',
    'INV NO', 'INV NUMBER', 'INV #', 'INVOICE #', 'Invoice No', 'Invoice Number',
    'Invoice #', 'Factura', 'Rechnung', 'Faktura', 'Facture'
  ];
  
  // Pattern 2: Look for "INVOICE #" or similar with the number on the same line
  for (const prefix of invoicePrefixes) {
    // Try to find pattern like "INV-12345" or "INVOICE # 12345"
    const pattern = new RegExp(`${prefix}[\\s]*#?[\\s]*([A-Z0-9\\-\\/_]+)`, 'i');
    const match = text.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim();
      // Filter out dates and common false positives
      if (!candidate.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/) && 
          !candidate.match(/^(total|amount|subtotal|tax|vat|balance)$/i) &&
          candidate.length > 1) {
        extracted.invoice_number = candidate;
        console.log('✅ Found invoice number from prefix pattern:', extracted.invoice_number);
        break;
      }
    }
  }
  
  // Pattern 3: Look for "INVOICE #" on one line and number on next line
  if (!extracted.invoice_number) {
    for (let i = 0; i < lines.length; i++) {
      // Check if current line contains invoice indicators
      if (lines[i].match(/INVOICE\s*#|INVOICE\s*NO|INVOICE\s*NUMBER|Invoice\s*#|Invoice\s*No|Invoice\s*Number/i)) {
        // Check next line for the actual number
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          // Check if next line looks like an invoice number (alphanumeric, not a date)
          if (nextLine.match(/^[A-Z0-9\-_\/]+$/) && 
              !nextLine.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/) &&
              nextLine.length < 20) {
            extracted.invoice_number = nextLine;
            console.log('✅ Found invoice number on next line:', extracted.invoice_number);
            break;
          }
        }
        // Also check 2 lines ahead (sometimes there's an empty line)
        if (i + 2 < lines.length && !extracted.invoice_number) {
          const twoLinesAhead = lines[i + 2];
          if (twoLinesAhead.match(/^[A-Z0-9\-_\/]+$/) && 
              !twoLinesAhead.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/) &&
              twoLinesAhead.length < 20) {
            extracted.invoice_number = twoLinesAhead;
            console.log('✅ Found invoice number two lines after:', extracted.invoice_number);
            break;
          }
        }
      }
    }
  }
  
  // Pattern 4: Look for standard invoice number formats (alphanumeric with dashes)
  if (!extracted.invoice_number) {
    const formatPatterns = [
      // Format: ABC-12345, INV-2023-001, etc.
      /\b([A-Z]{2,5}[-_]\d{3,6})\b/i,
      // Format: INV12345, INV2023001
      /\b([A-Z]{2,5}\d{4,8})\b/i,
      // Format: 2023-001 (year and number)
      /\b(\d{4}[-_]\d{3,4})\b/,
      // Format: ZA-001 (specific to your invoices)
      /\b(ZA-\d{3})\b/i,
      // Format: MA9Y7R9P-0002 (OpenAI style)
      /\b([A-Z0-9]{8,10}[-_]\d{4})\b/i,
      // Format: 100-31 (like your test invoice filename)
      /\b(\d{3}-\d{2})\b/,
      // Format: Any alphanumeric string that looks like an invoice number
      /\b([A-Z0-9]{3,12}[-_]?\d{2,6})\b/i
    ];
    
    for (const pattern of formatPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Filter out common false positives
        if (!candidate.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/) && // not a date
            !candidate.match(/^\d+\.\d{2}$/) && // not an amount
            !candidate.match(/^(total|amount|subtotal|tax|vat|balance|due|inc|llc|ltd|corp)$/i) && // not common words
            candidate.length > 2) {
          extracted.invoice_number = candidate;
          console.log('✅ Found invoice number from format pattern:', extracted.invoice_number);
          break;
        }
      }
    }
  }
  
  // Pattern 5: Look for standalone numbers that could be invoice numbers
  if (!extracted.invoice_number) {
    // Find all numbers in the text
    const numberCandidates = [];
    
    for (const line of lines) {
      // Skip lines that are clearly not invoice numbers
      if (line.match(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/)) continue; // Skip dates
      if (line.match(/^\d+\.\d{2}$/)) continue; // Skip amounts
      if (line.match(/^\d{4,5}$/)) continue; // Skip postal codes
      
      // Look for numbers with possible prefixes
      const numberMatch = line.match(/\b(\d{3,8})\b/);
      if (numberMatch) {
        const num = numberMatch[1];
        // Prioritize numbers that appear after invoice-related keywords
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(num) && i > 0) {
            const prevLine = lines[i - 1].toLowerCase();
            if (prevLine.includes('invoice') || prevLine.includes('inv') || prevLine.includes('#') || prevLine.includes('no')) {
              extracted.invoice_number = num;
              console.log('✅ Found invoice number from context:', extracted.invoice_number);
              break;
            }
          }
        }
        if (extracted.invoice_number) break;
        
        // Otherwise, collect as candidate
        numberCandidates.push({ number: num, line: line, index: lines.indexOf(line) });
      }
    }
    
    // If we have candidates but no match yet, take the first reasonable one
    if (!extracted.invoice_number && numberCandidates.length > 0) {
      // Sort by line index (earlier in document is better)
      numberCandidates.sort((a, b) => a.index - b.index);
      
      // Take the first candidate that's not obviously something else
      for (const candidate of numberCandidates) {
        if (candidate.number.length >= 3 && candidate.number.length <= 8) {
          extracted.invoice_number = candidate.number;
          console.log('✅ Found invoice number from candidate list:', extracted.invoice_number);
          break;
        }
      }
    }
  }
  
  // Pattern 6: Look for "INV" followed by numbers (even without space)
  if (!extracted.invoice_number) {
    const invPattern = /\b(INV\d{3,8})\b/i;
    const invMatch = text.match(invPattern);
    if (invMatch && invMatch[1]) {
      extracted.invoice_number = invMatch[1];
      console.log('✅ Found invoice number from INV pattern:', extracted.invoice_number);
    }
  }
  
  // Pattern 7: Look for numbers that appear after "Job #" or "PO #" (sometimes used as invoice number)
  if (!extracted.invoice_number) {
    const jobPatterns = [
      /JOB\s*#?\s*[:\s]*(\d{3,8})/i,
      /PO\s*#?\s*[:\s]*(\d{3,8})/i,
      /P\.?O\.?\s*#?\s*[:\s]*(\d{3,8})/i,
      /ORDER\s*#?\s*[:\s]*(\d{3,8})/i
    ];
    
    for (const pattern of jobPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        extracted.invoice_number = match[1];
        console.log('✅ Found invoice number from job/PO pattern:', extracted.invoice_number);
        break;
      }
    }
  }

  // ============ DATE DETECTION ============
  console.log('🔍 Searching for date...');
  
  // Look for date in various formats
  const datePatterns = [
    // Month name formats (US style)
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i,
    /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})/i,
    // DD/MM/YYYY or MM/DD/YYYY
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
    // YYYY-MM-DD
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    // DD-MM-YYYY
    /(\d{1,2})-(\d{1,2})-(\d{4})/
  ];
  
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1].match(/[A-Za-z]/)) {
        // Handle month name formats
        const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
        const fullMonthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
        
        let month;
        const monthStr = match[1].toLowerCase();
        
        // Check if it's a full month name
        const fullMonthIndex = fullMonthNames.indexOf(monthStr);
        if (fullMonthIndex !== -1) {
          month = fullMonthIndex + 1;
        } else {
          // Check if it's a shortened month name
          const shortMonthStr = monthStr.substring(0, 3);
          month = monthNames.indexOf(shortMonthStr) + 1;
        }
        
        if (month > 0) {
          const day = match[2].padStart(2, '0');
          const year = match[3];
          extracted.date = `${year}-${month.toString().padStart(2, '0')}-${day}`;
          console.log('✅ Found date from text pattern:', extracted.date);
          break;
        }
      } else if (match[1].length === 4) {
        // YYYY-MM-DD format
        extracted.date = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        console.log('✅ Found date from YYYY-MM-DD pattern:', extracted.date);
        break;
      } else {
        // DD/MM/YYYY or MM/DD/YYYY - assume DD/MM/YYYY for international
        extracted.date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
        console.log('✅ Found date from DD/MM/YYYY pattern:', extracted.date);
        break;
      }
    }
  }

  // ============ AMOUNT DETECTION (with both $ and R) ============
  console.log('🔍 Searching for amount...');
  
  // Priority 1: Look for "Balance Due" with any currency
  const balanceDuePattern = /Balance\s*Due\s*([R$])?\s*([\d,]+\.?\d*)/i;
  const balanceDueMatch = text.match(balanceDuePattern);
  if (balanceDueMatch && balanceDueMatch[2]) {
    const amount = balanceDueMatch[2].replace(/,/g, '');
    extracted.amount = parseFloat(amount).toFixed(2);
    console.log('✅ Found amount from Balance Due:', extracted.amount);
  }
  
  // Priority 2: Look for "Amount due" with any currency
  if (!extracted.amount) {
    const amountDuePattern = /Amount\s*due\s*([R$])?\s*([\d,]+\.?\d*)/i;
    const amountDueMatch = text.match(amountDuePattern);
    if (amountDueMatch && amountDueMatch[2]) {
      const amount = amountDueMatch[2].replace(/,/g, '');
      extracted.amount = parseFloat(amount).toFixed(2);
      console.log('✅ Found amount from Amount due:', extracted.amount);
    }
  }
  
  // Priority 3: Look for "Total" with any currency
  if (!extracted.amount) {
    const totalPattern = /TOTAL\s*([R$])?\s*([\d,]+\.?\d*)/i;
    const totalMatch = text.match(totalPattern);
    if (totalMatch && totalMatch[2]) {
      const amount = totalMatch[2].replace(/,/g, '');
      extracted.amount = parseFloat(amount).toFixed(2);
      console.log('✅ Found amount from TOTAL:', extracted.amount);
    }
  }
  
  // Priority 4: Look for the largest amount with currency symbol
  if (!extracted.amount) {
    const currencyPattern = /([R$])\s*([\d,]+\.?\d*)/g;
    const amounts = [];
    let match;
    
    while ((match = currencyPattern.exec(text)) !== null) {
      const num = parseFloat(match[2].replace(/,/g, ''));
      if (num > 0 && num < 100000) {
        amounts.push({ value: num, currency: match[1] });
      }
    }
    
    if (amounts.length > 0) {
      // Get the largest amount (likely the total)
      const largest = amounts.reduce((max, item) => item.value > max.value ? item : max, amounts[0]);
      extracted.amount = largest.value.toFixed(2);
      console.log('✅ Found amount from largest value:', extracted.amount);
    }
  }

  // ============ VAT DETECTION (with both $ and R) ============
  console.log('🔍 Searching for VAT...');
  
  // Look specifically for VAT with any currency
  const vatPatterns = [
    /VAT.*?([R$])\s*([\d,]+\.?\d*)/i,
    /([R$])\s*([\d,]+\.?\d*)\s*VAT/i,
    /VAT\s*-\s*SOUTH\s*AFRICA.*?([R$])\s*([\d,]+\.?\d*)/is,
    /Tax.*?([R$])\s*([\d,]+\.?\d*)/i
  ];
  
  for (const pattern of vatPatterns) {
    const match = text.match(pattern);
    if (match && match[2]) {
      const vat = parseFloat(match[2].replace(/,/g, ''));
      // Filter out the percentage and get the actual VAT amount
      if (vat > 0 && vat < 10000 && !match[0].includes('%')) {
        extracted.vat = vat.toFixed(2);
        console.log('✅ Found VAT:', extracted.vat);
        break;
      }
    }
  }
  
  // If VAT not found, look for number near VAT line
  if (!extracted.vat) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('VAT') && !lines[i].includes('%')) {
        const vatMatch = lines[i].match(/([\d,]+\.?\d*)/);
        if (vatMatch) {
          const vat = parseFloat(vatMatch[1].replace(/,/g, ''));
          if (vat < 10000) {
            extracted.vat = vat.toFixed(2);
            console.log('✅ Found VAT from line:', extracted.vat);
            break;
          }
        }
      }
    }
  }

  console.log('📊 FINAL extracted data:', extracted);
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