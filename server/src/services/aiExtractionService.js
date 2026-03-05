const vision = require('@google-cloud/vision');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const pdf = require('pdf-poppler');
const os = require('os');

// ─────────────────────────────────────────────
// NOT_FOUND SENTINEL
// Shown in the UI whenever a field could not be extracted.
// ─────────────────────────────────────────────
const NOT_FOUND = 'Not found';

// ─────────────────────────────────────────────
// MULTI-CURRENCY CONFIG
// Add or remove currencies here as needed.
// ─────────────────────────────────────────────
const CURRENCY_MAP = {
  'R':   'ZAR',
  '$':   'USD',
  '€':   'EUR',
  '£':   'GBP',
  '¥':   'JPY',
  '₹':   'INR',
  'A$':  'AUD',
  'C$':  'CAD',
  'CHF': 'CHF',
  'kr':  'SEK',
  'NZ$': 'NZD',
  'MX$': 'MXN',
  'HK$': 'HKD',
  'S$':  'SGD',
  '₦':   'NGN',
  'KSh': 'KES',
  'GH₵': 'GHS',
  'E':   'SZL',
};

const ISO_CURRENCY_CODES = Object.values(CURRENCY_MAP);

const SYMBOL_PATTERN = Object.keys(CURRENCY_MAP)
  .map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');

const CURRENCY_AMOUNT_RE = new RegExp(
  `(${SYMBOL_PATTERN}|${ISO_CURRENCY_CODES.join('|')})\\s*([\\d,]+\\.?\\d*)`,
  'gi'
);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function parseAmount(str) {
  if (!str) return null;
  const val = parseFloat(str.replace(/,/g, '').trim());
  return isNaN(val) ? null : val;
}

function detectCurrency(text) {
  for (const iso of ISO_CURRENCY_CODES) {
    if (new RegExp(`\\b${iso}\\b`).test(text)) return iso;
  }
  for (const [sym, iso] of Object.entries(CURRENCY_MAP)) {
    const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(escaped).test(text)) return iso;
  }
  return NOT_FOUND;
}

// ─────────────────────────────────────────────
// MAIN SERVICE
// ─────────────────────────────────────────────
class AIExtractionService {
  constructor() {
    this.useMock = false;
    this.client = null;
    this.initialized = false;
    this.initializeClient();
  }

  // ── Google Vision init ────────────────────
  initializeClient() {
    try {
      if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64) {
        console.warn('⚠️  No Google credentials found – extraction will be unavailable');
        this.useMock = true;
        return;
      }

      const credentialsJson = Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64, 'base64'
      ).toString();

      const credentials = JSON.parse(credentialsJson);
      console.log('📋 Project ID:', credentials.project_id);

      this.client = new vision.ImageAnnotatorClient({ credentials });
      this.useMock = false;
      this.initialized = true;
      console.log('✅ Google Cloud Vision initialised');

    } catch (error) {
      console.error('❌ Vision init failed:', error.message);
      this.useMock = true;
    }
  }

  // ── PDF → image buffer ────────────────────
  async convertPDFToImage(pdfPath) {
    const tempDir = path.join(os.tmpdir(), `pdf-imgs-${Date.now()}`);
    try {
      console.log('🔄 Converting PDF to image…');
      fs.mkdirSync(tempDir, { recursive: true });

      await pdf.convert(pdfPath, {
        format: 'png',
        out_dir: tempDir,
        out_prefix: 'page',
        page: 1,
        resolution: 300   // High DPI for better OCR accuracy
      });

      const files = fs.readdirSync(tempDir);
      const imageFile = files.find(f => /\.png$/i.test(f));
      if (!imageFile) throw new Error('No PNG generated from PDF');

      const buffer = fs.readFileSync(path.join(tempDir, imageFile));
      console.log('✅ PDF → PNG:', imageFile, `(${buffer.length} bytes)`);
      return buffer;

    } catch (err) {
      console.error('❌ PDF conversion error:', err.message);
      return null;
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  // ── Main entry point ──────────────────────
  async extractFromDocument(filePath, documentId) {
    // ── Client not initialised ───────────────
    if (!this.client || this.useMock) {
      console.warn('⚠️  Vision client not ready – returning empty extraction');
      return this._unavailableResult('Google Vision client is not initialised. Please check your credentials.');
    }

    // ── File missing ─────────────────────────
    if (!fs.existsSync(filePath)) {
      console.warn('📁 File not found:', filePath);
      return this._unavailableResult(`File not found: ${filePath}`);
    }

    try {
      console.log(`\n🔍 Extracting: ${filePath}`);
      return await this._realExtraction(filePath, documentId);
    } catch (err) {
      console.error('❌ extractFromDocument error:', err);
      return this._unavailableResult(`Extraction failed: ${err.message}`);
    }
  }

  // ── Real Vision extraction ────────────────
  async _realExtraction(filePath, documentId) {
    try {
      let imageBuffer;
      const isPDF = /\.pdf$/i.test(filePath);

      if (isPDF) {
        imageBuffer = await this.convertPDFToImage(filePath);
        if (!imageBuffer) {
          return this._unavailableResult('PDF could not be converted to image for OCR processing.');
        }
      } else {
        imageBuffer = fs.readFileSync(filePath);
      }

      const [result] = await this.client.documentTextDetection({
        image: { content: imageBuffer.toString('base64') }
      });

      const fullText = result?.fullTextAnnotation?.text;

      if (!fullText || fullText.trim().length === 0) {
        console.warn('⚠️  No text detected in document');
        return this._unavailableResult('No readable text was detected in this document.');
      }

      console.log('✅ Vision returned text, length:', fullText.length);
      console.log('📄 Preview:', fullText.substring(0, 300).replace(/\n/g, ' '));

      const extractedData = this.parseExtractedText(fullText);
      const confidence    = this.calculateConfidence(result);

      if (documentId) {
        await this.storeExtractionResults(documentId, extractedData, confidence, result.fullTextAnnotation);
      }

      return {
        success: true,
        data: extractedData,
        confidence,
        text: fullText,
        real: true
      };

    } catch (err) {
      console.error('❌ Vision API error:', err.message);
      return this._unavailableResult(`Vision API error: ${err.message}`);
    }
  }

  // ── Builds a clean "nothing found" response ─
  _unavailableResult(reason) {
    return {
      success: false,
      reason,
      data: {
        invoice_number: NOT_FOUND,
        date:           NOT_FOUND,
        amount:         NOT_FOUND,
        vat:            NOT_FOUND,
        vendor:         NOT_FOUND,
        currency:       NOT_FOUND,
      },
      confidence: 0,
      text: null,
      real: false
    };
  }

  // ── Core parser ───────────────────────────
  parseExtractedText(text) {
    const raw = {
      invoice_number: this._extractInvoiceNumber(text, this._toLines(text)),
      date:           this._extractDate(text),
      amount:         this._extractAmount(text, this._toLines(text)),
      vat:            this._extractVat(text, this._toLines(text)),
      vendor:         this._extractVendor(this._toLines(text)),
      currency:       detectCurrency(text),
    };

    // Replace every null with the NOT_FOUND sentinel
    const extracted = {};
    for (const [key, val] of Object.entries(raw)) {
      extracted[key] = (val !== null && val !== undefined && val !== '') ? val : NOT_FOUND;
    }

    console.log('📊 Final extracted:', extracted);
    return extracted;
  }

  _toLines(text) {
    return text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }

  // ── Vendor ────────────────────────────────
  _extractVendor(lines) {
    const companyIndicators = [
      'LLC', 'Inc', 'Corp', 'Ltd', 'Pty', 'Company', 'Co.',
      'Materials', 'Solutions', 'Services', 'Group', 'Holdings',
      'Enterprises', 'Trading', 'Industries', 'Agency', 'Associates',
      'Partners', 'Consulting', 'Technology', 'Technologies'
    ];

    for (const line of lines) {
      if (companyIndicators.some(ind => line.includes(ind))) {
        console.log('✅ Vendor (company indicator):', line);
        return line;
      }
    }

    const skipPattern = /invoice|bill|receipt|statement|quote|description|qty|rate|amount|subtotal|total|paid|balance|payment|authorized|mobile|email|phone|fax|www|http|thank|terms|conditions|powered|date|no\.|number|vat|tax|from|to/i;
    for (const line of lines) {
      if (
        !skipPattern.test(line) &&
        !line.includes('@') &&
        !line.match(/^\d/) &&
        !line.match(/^[R$€£¥₹]/) &&
        line.length > 4
      ) {
        console.log('✅ Vendor (first clean line):', line);
        return line;
      }
    }

    console.log('⚠️  Vendor not found');
    return null;
  }

  // ── Invoice number ────────────────────────
  _extractInvoiceNumber(text, lines) {
    const labelSameLine = /(?:invoice\s*(?:no\.?|number|#)|inv\.?\s*(?:no\.?|#)?)\s*[:\-#]?\s*([A-Z0-9][\w\-\/]{1,20})/i;
    let m = text.match(labelSameLine);
    if (m && this._validInvoiceNum(m[1])) {
      console.log('✅ Invoice# (label same-line):', m[1]);
      return m[1].trim();
    }

    for (let i = 0; i < lines.length - 1; i++) {
      if (/invoice\s*(no\.?|number|#)/i.test(lines[i])) {
        const next = lines[i + 1];
        if (this._validInvoiceNum(next)) {
          console.log('✅ Invoice# (next line):', next);
          return next.trim();
        }
      }
    }

    const formats = [
      /\b([A-Z]{2,5}[-_]\d{2,8}(?:[-_][A-Z0-9]+)?)\b/i,
      /\b(\d{4}[-_]\d{3,6})\b/,
      /\b([A-Z]{1,4}\d{4,10})\b/i,
      /\b([A-Z0-9]{6,15}[-_]\d{2,6})\b/i,
    ];
    for (const re of formats) {
      const match = text.match(re);
      if (match && this._validInvoiceNum(match[1])) {
        console.log('✅ Invoice# (format pattern):', match[1]);
        return match[1].trim();
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (/invoice|inv\b/i.test(lines[i])) {
        const candidates = lines[i].match(/\b([A-Z0-9\-_\/]{3,20})\b/gi);
        if (candidates) {
          const hit = candidates.find(n => this._validInvoiceNum(n));
          if (hit) {
            console.log('✅ Invoice# (contextual):', hit);
            return hit;
          }
        }
      }
    }

    console.log('⚠️  Invoice number not found');
    return null;
  }

  _validInvoiceNum(str) {
    if (!str || str.length < 2 || str.length > 25) return false;
    const s = str.trim();
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return false;
    if (/^\d+\.\d{2}$/.test(s)) return false;
    if (/^(total|amount|subtotal|tax|vat|balance|due|invoice|oice|date|number|from|to|qty|rate)$/i.test(s)) return false;
    if (/^[A-Za-z]+$/.test(s) && s.length < 5) return false;
    return /\d/.test(s);
  }

  // ── Date ──────────────────────────────────
  _extractDate(text) {
    const MONTHS = ['january','february','march','april','may','june',
                    'july','august','september','october','november','december'];
    const SHORT_MONTHS = ['jan','feb','mar','apr','may','jun',
                          'jul','aug','sep','oct','nov','dec'];

    const labelMatch = text.match(
      /(?:invoice\s+)?date\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})/i
    );
    if (labelMatch) {
      const parsed = this._parseRawDate(labelMatch[1], MONTHS, SHORT_MONTHS);
      if (parsed) { console.log('✅ Date (label):', parsed); return parsed; }
    }

    const patterns = [
      new RegExp(`(${MONTHS.join('|')}|${SHORT_MONTHS.map(m => m[0].toUpperCase() + m.slice(1)).join('|')})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'),
      /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/,
      /\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/,
    ];

    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;

      if (/[a-z]/i.test(m[1])) {
        const mIdx = MONTHS.findIndex(mn => mn.startsWith(m[1].toLowerCase().substring(0, 3)));
        if (mIdx >= 0) {
          const result = `${m[3]}-${String(mIdx + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
          console.log('✅ Date (month name):', result);
          return result;
        }
      }
      if (m[1].length === 4) {
        const result = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
        console.log('✅ Date (YYYY-MM-DD):', result);
        return result;
      }
      const d = parseInt(m[1]), mo = parseInt(m[2]);
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) {
        const result = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        console.log('✅ Date (DD/MM/YYYY):', result);
        return result;
      }
    }

    console.log('⚠️  Date not found');
    return null;
  }

  _parseRawDate(raw, MONTHS) {
    let m = raw.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;

    m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (m) {
      const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
      return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }

    m = raw.match(/(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
    if (m) {
      const mIdx = MONTHS.findIndex(mn => mn.startsWith(m[1].toLowerCase().substring(0, 3)));
      if (mIdx >= 0) return `${m[3]}-${String(mIdx + 1).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    }

    return null;
  }

  // ── Amount ────────────────────────────────
  _extractAmount(text, lines) {
    const priorityLabels = [
      /balance\s*due/i,
      /amount\s*due/i,
      /total\s*due/i,
      /total\s*amount/i,
      /grand\s*total/i,
      /(?<!\w)total(?!\s*tax|\s*vat|\s*excl|\s*before)/i,
      /amount\s*payable/i,
      /please\s*pay/i,
    ];

    for (const labelRe of priorityLabels) {
      const amount = this._amountAfterLabel(text, lines, labelRe);
      if (amount !== null) {
        console.log(`✅ Amount (${labelRe.source}):`, amount);
        return amount.toFixed(2);
      }
    }

    const amounts = this._allCurrencyAmounts(text);
    if (amounts.length > 0) {
      const largest = Math.max(...amounts);
      console.log('✅ Amount (largest tagged):', largest);
      return largest.toFixed(2);
    }

    console.log('⚠️  Amount not found');
    return null;
  }

  // ── VAT / Tax ─────────────────────────────
  _extractVat(text, lines) {
    const vatPatterns = [
      /vat\s+(?:[\d.]+%)?\s*(?:[R$€£¥₹A-Z$]{1,4})?\s*([\d,]+\.?\d*)/i,
      /(?:sales\s+)?tax\s*(?:[\d.]+%)?\s*(?:[R$€£¥₹A-Z$]{1,4})?\s*([\d,]+\.?\d*)/i,
      /gst\s*(?:[\d.]+%)?\s*(?:[R$€£¥₹A-Z$]{1,4})?\s*([\d,]+\.?\d*)/i,
      /hst\s*(?:[\d.]+%)?\s*(?:[R$€£¥₹A-Z$]{1,4})?\s*([\d,]+\.?\d*)/i,
    ];

    for (const re of vatPatterns) {
      const m = text.match(re);
      if (m && m[1]) {
        const val = parseAmount(m[1]);
        if (val !== null && val > 0 && val < 1_000_000) {
          console.log('✅ VAT (pattern):', val);
          return val.toFixed(2);
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!/\b(vat|tax|gst|hst)\b/i.test(line)) continue;

      const nums = [...line.matchAll(/([\d,]+\.\d{2})/g)]
        .map(x => parseAmount(x[1]))
        .filter(n => n > 0 && n < 1_000_000);
      if (nums.length > 0) {
        const val = nums[nums.length - 1];
        console.log('✅ VAT (same line, last col):', val);
        return val.toFixed(2);
      }

      if (i + 1 < lines.length) {
        const nextNums = [...lines[i + 1].matchAll(/([\d,]+\.\d{2})/g)]
          .map(x => parseAmount(x[1]))
          .filter(n => n > 0 && n < 1_000_000);
        if (nextNums.length > 0) {
          const val = nextNums[nextNums.length - 1];
          console.log('✅ VAT (next line):', val);
          return val.toFixed(2);
        }
      }
    }

    console.log('⚠️  VAT not found');
    return null;
  }

  // ── Utility: amount after a label ─────────
  _amountAfterLabel(text, lines, labelRe) {
    const inlineRe = new RegExp(
      `${labelRe.source}\\s*[:\\-]?\\s*(?:${SYMBOL_PATTERN}|${ISO_CURRENCY_CODES.join('|')})?\\s*([\\d,]+\\.?\\d*)`,
      'i'
    );
    const m = text.match(inlineRe);
    if (m) {
      const val = parseAmount(m[m.length - 1]);
      if (val !== null && val > 0) return val;
    }

    for (let i = 0; i < lines.length; i++) {
      if (!labelRe.test(lines[i])) continue;
      for (let j = 0; j <= 2 && i + j < lines.length; j++) {
        const nums = [...lines[i + j].matchAll(/([\d,]+\.\d{2})/g)]
          .map(x => parseAmount(x[1]))
          .filter(n => n !== null && n > 0);
        if (nums.length > 0) return nums[nums.length - 1];
      }
    }

    return null;
  }

  // ── Utility: all currency-tagged amounts ──
  _allCurrencyAmounts(text) {
    const results = [];
    let m;
    const re = new RegExp(CURRENCY_AMOUNT_RE.source, 'gi');
    while ((m = re.exec(text)) !== null) {
      const val = parseAmount(m[2]);
      if (val !== null && val > 0 && val < 10_000_000) results.push(val);
    }
    return results;
  }

  // ── Confidence score ──────────────────────
  calculateConfidence(visionResponse) {
    try {
      let total = 0, count = 0;
      for (const page of visionResponse.fullTextAnnotation?.pages || []) {
        for (const block of page.blocks || []) {
          for (const para of block.paragraphs || []) {
            for (const word of para.words || []) {
              total += (word.confidence || 0);
              count++;
            }
          }
        }
      }
      return count > 0 ? total / count : 0;
    } catch (_) { return 0; }
  }

  // ── DB store ──────────────────────────────
  async storeExtractionResults(documentId, extractedData, confidence, fullTextAnnotation) {
    try {
      await pool.query(
        `UPDATE documents
         SET ai_extraction = $1,
             updated_at    = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [{ extracted_fields: extractedData, confidence, timestamp: new Date(), warnings: [] }, documentId]
      );
    } catch (err) {
      console.error('❌ storeExtractionResults error:', err);
    }
  }
}

module.exports = new AIExtractionService();