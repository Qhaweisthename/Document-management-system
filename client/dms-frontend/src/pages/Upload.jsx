import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import './Upload.css';

// Matches the NOT_FOUND sentinel from the backend
const NOT_FOUND = 'Not found';

// Returns true if a field value came back as NOT_FOUND
const isNotFound = (val) => !val || val === NOT_FOUND;

export default function Upload() {
  const [file, setFile] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [extractionStatus, setExtractionStatus] = useState({}); // per-field: 'found' | 'not_found' | 'ai'

  const getTodaysDate = () => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const [formData, setFormData] = useState({
    vendor_id: '',
    document_type: 'invoice',
    date: '',
    amount: '',
    vat: '',
    invoice_number: ''
  });

  const [newVendor, setNewVendor] = useState({ name: '', tax_number: '' });
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [localVendorId, setLocalVendorId] = useState(null);
  const [autoCreateVendor, setAutoCreateVendor] = useState(false);
  const [extractionSummary, setExtractionSummary] = useState(null); // { found: [], notFound: [] }

  const { user } = useAuth();
  const navigate = useNavigate();

  const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
  });

  const ensureLocalVendor = async () => {
    try {
      const localExists = vendors.some(v => v.name.toLowerCase() === 'local vendor');
      if (!localExists && vendors.length > 0) {
        const response = await api.post('/documents/vendors', { name: 'Local Vendor', tax_number: '000000000' });
        await fetchVendors();
      }
    } catch (error) {
      console.error('Error ensuring Local Vendor:', error);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await api.get('/documents/vendors');
      setVendors(response.data.vendors);
      const localVendor = response.data.vendors.find(v => v.name.toLowerCase() === 'local vendor');
      if (localVendor) setLocalVendorId(localVendor.id);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  useEffect(() => { fetchVendors(); }, []);

  useEffect(() => {
    if (vendors.length > 0 && localVendorId) {
      if (!formData.vendor_id && !extracting) {
        setFormData(prev => ({ ...prev, vendor_id: localVendorId, date: getTodaysDate() }));
      }
    } else if (vendors.length > 0 && !localVendorId) {
      ensureLocalVendor();
    }
  }, [vendors, localVendorId, formData.vendor_id, extracting]);

  const generateInvoiceNumber = () => {
    const date = new Date();
    const yr = date.getFullYear().toString().slice(-2);
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const dy = String(date.getDate()).padStart(2, '0');
    const rand = Math.floor(Math.random() * 900 + 100);
    return `INV-${yr}${mo}${dy}-${rand}`;
  };

  const extractDataFromFile = async (selectedFile) => {
    setExtracting(true);
    setError('');
    setExtractionSummary(null);
    setExtractionStatus({});

    try {
      const extractData = new FormData();
      extractData.append('document', selectedFile);

      const response = await api.post('/documents/extract-preview', extractData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const generatedInvoiceNumber = generateInvoiceNumber();

      // Backend signalled a hard failure (no Vision client, file unreadable, etc.)
      if (!response.data.success) {
        setError(`⚠️ ${response.data.reason || 'AI extraction failed.'} Please fill in the fields manually.`);
        setExtractionSummary({ found: [], notFound: ['invoice_number', 'date', 'amount', 'vat', 'vendor', 'currency'] });
        setExtractionStatus({
          invoice_number: 'not_found', date: 'not_found',
          amount: 'not_found', vat: 'not_found', vendor: 'not_found'
        });
        setFormData(prev => ({ ...prev, invoice_number: generatedInvoiceNumber }));
        return;
      }

      // Legacy: backend still returned mock data
      if (response.data.mock) {
        setError('⚠️ AI could not read this document. Please fill in the fields manually.');
        setFormData(prev => ({ ...prev, invoice_number: generatedInvoiceNumber }));
        return;
      }

      const extracted = response.data.data || {};
      console.log('📊 AI Extracted:', extracted);

      let updatedData = { invoice_number: generatedInvoiceNumber };
      const found = [];
      const notFound = [];
      const statusMap = {};

      // ── Invoice number ──────────────────────
      if (!isNotFound(extracted.invoice_number) &&
          !extracted.invoice_number.match(/^(bill|invoice|total|amount|date)$/i) &&
          extracted.invoice_number.length > 2) {
        updatedData.invoice_number = extracted.invoice_number;
        found.push('Invoice #');
        statusMap.invoice_number = 'ai';
      } else {
        notFound.push('Invoice #');
        statusMap.invoice_number = 'not_found';
      }

      // ── Date ────────────────────────────────
      if (!isNotFound(extracted.date)) {
        if (extracted.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          updatedData.date = extracted.date;
          found.push('Date');
          statusMap.date = 'ai';
        } else {
          const parsed = new Date(extracted.date);
          if (!isNaN(parsed.getTime())) {
            updatedData.date = parsed.toISOString().split('T')[0];
            found.push('Date');
            statusMap.date = 'ai';
          } else {
            notFound.push('Date');
            statusMap.date = 'not_found';
          }
        }
      } else {
        notFound.push('Date');
        statusMap.date = 'not_found';
      }

      // ── Amount ──────────────────────────────
      if (!isNotFound(extracted.amount)) {
        const amountValue = parseFloat(extracted.amount);
        if (!isNaN(amountValue) && amountValue > 0) {
          updatedData.amount = amountValue.toString();
          found.push('Amount');
          statusMap.amount = 'ai';
        } else {
          notFound.push('Amount');
          statusMap.amount = 'not_found';
        }
      } else {
        notFound.push('Amount');
        statusMap.amount = 'not_found';
      }

      // ── VAT ─────────────────────────────────
      if (!isNotFound(extracted.vat)) {
        const vatValue = parseFloat(extracted.vat);
        if (!isNaN(vatValue) && vatValue > 0) {
          updatedData.vat = vatValue.toString();
          found.push('VAT');
          statusMap.vat = 'ai';
        } else {
          notFound.push('VAT');
          statusMap.vat = 'not_found';
        }
      } else {
        notFound.push('VAT');
        statusMap.vat = 'not_found';
      }

      // ── Vendor ──────────────────────────────
      if (!isNotFound(extracted.vendor) && extracted.vendor !== 'Invoice' && extracted.vendor.length > 2) {
        const cleanVendorName = extracted.vendor.replace(/\s+/g, ' ').trim();
        const matchedVendor = vendors.find(v =>
          v.name.toLowerCase().includes(cleanVendorName.toLowerCase()) ||
          cleanVendorName.toLowerCase().includes(v.name.toLowerCase())
        );

        if (matchedVendor) {
          updatedData.vendor_id = matchedVendor.id;
          found.push('Vendor');
          statusMap.vendor = 'ai';
        } else if (autoCreateVendor) {
          try {
            const createResponse = await api.post('/documents/vendors', {
              name: cleanVendorName,
              tax_number: extracted.vat || '000000000'
            });
            await fetchVendors();
            updatedData.vendor_id = createResponse.data.vendor.id;
            found.push('Vendor (auto-created)');
            statusMap.vendor = 'ai';
          } catch {
            setNewVendor({ name: cleanVendorName, tax_number: extracted.vat || '' });
            setShowNewVendor(true);
            notFound.push('Vendor');
            statusMap.vendor = 'not_found';
          }
        } else {
          setNewVendor({ name: cleanVendorName, tax_number: extracted.vat || '' });
          setShowNewVendor(true);
          notFound.push('Vendor');
          statusMap.vendor = 'not_found';
        }
      } else {
        notFound.push('Vendor');
        statusMap.vendor = 'not_found';
      }

      setFormData(prev => ({ ...prev, ...updatedData }));
      setExtractionStatus(statusMap);
      setExtractionSummary({ found, notFound });

    } catch (error) {
      console.error('❌ Extraction preview failed:', error);
      const generatedInvoiceNumber = generateInvoiceNumber();
      setFormData(prev => ({ ...prev, invoice_number: generatedInvoiceNumber }));
      setError('AI extraction request failed. Please fill in the fields manually.');
      setExtractionStatus({
        invoice_number: 'not_found', date: 'not_found',
        amount: 'not_found', vat: 'not_found', vendor: 'not_found'
      });
      setExtractionSummary({ found: [], notFound: ['Invoice #', 'Date', 'Amount', 'VAT', 'Vendor'] });
    } finally {
      setExtracting(false);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.size > 10 * 1024 * 1024) { setError('File size must be less than 10MB'); return; }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(selectedFile.type)) { setError('Only PDF, JPEG, and PNG files are allowed'); return; }

    setFile(selectedFile);
    setError('');
    setFormData(prev => ({ ...prev, invoice_number: generateInvoiceNumber() }));
    await extractDataFromFile(selectedFile);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    // Mark manually edited fields as 'found' (user-provided)
    setExtractionStatus(prev => ({ ...prev, [e.target.name]: 'found' }));
  };

  const handleNewVendorChange = (e) => setNewVendor({ ...newVendor, [e.target.name]: e.target.value });

  const handleCreateVendor = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post('/documents/vendors', newVendor);
      setVendors([...vendors, response.data.vendor]);
      setFormData({ ...formData, vendor_id: response.data.vendor.id });
      setExtractionStatus(prev => ({ ...prev, vendor_id: 'found' }));
      setShowNewVendor(false);
      setNewVendor({ name: '', tax_number: '' });
      setSuccess('Vendor created successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.response?.data?.message || 'Error creating vendor');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a file'); return; }

    const submitData = {
      ...formData,
      amount: formData.amount === '' ? '0' : formData.amount,
      vat: formData.vat === '' ? '0' : formData.vat
    };

    setUploading(true);
    setError('');
    setSuccess('');

    const data = new FormData();
    data.append('document', file);
    Object.entries(submitData).forEach(([k, v]) => data.append(k, v));

    try {
      await api.post('/documents/upload', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => setUploadProgress(Math.round((e.loaded * 100) / e.total))
      });

      setSuccess('Document uploaded successfully!');
      setUploadProgress(0);
      setFile(null);
      setExtractionSummary(null);
      setExtractionStatus({});
      setFormData({ vendor_id: '', document_type: 'invoice', date: '', amount: '', vat: '', invoice_number: '' });
      document.getElementById('file-input').value = '';

      setTimeout(() => { setSuccess(''); navigate('/documents'); }, 2000);
    } catch (error) {
      setError(error.response?.data?.message || 'Error uploading document');
    } finally {
      setUploading(false);
    }
  };

  // ── Field status badge helper ─────────────
  const FieldBadge = ({ field }) => {
    const status = extractionStatus[field];
    if (!status || extracting) return null;
    if (status === 'ai') return <span className="badge badge--ai">✦ AI</span>;
    if (status === 'not_found') return <span className="badge badge--missing">Not found</span>;
    if (status === 'found') return <span className="badge badge--manual">Edited</span>;
    return null;
  };

  const fieldClass = (field) => {
    const status = extractionStatus[field];
    if (!status || extracting) return '';
    if (status === 'ai') return 'field--ai';
    if (status === 'not_found') return 'field--missing';
    return '';
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h2>Upload Document</h2>
        <p>Upload invoices and credit notes for processing</p>
        <div className="vendor-auto-create-option">
          <label>
            <input type="checkbox" checked={autoCreateVendor} onChange={(e) => setAutoCreateVendor(e.target.checked)} />
            Auto-create new vendors
          </label>
        </div>
      </div>

      {error && <div className="upload-error">{error}</div>}
      {success && <div className="upload-success">{success}</div>}

      {/* ── Extraction summary banner ── */}
      {extractionSummary && !extracting && (
        <div className="extraction-summary">
          <div className="extraction-summary__header">
            <span className="extraction-summary__icon">🤖</span>
            <strong>AI Extraction Complete</strong>
          </div>
          <div className="extraction-summary__body">
            {extractionSummary.found.length > 0 && (
              <div className="extraction-summary__group extraction-summary__group--found">
                <span className="extraction-summary__label">✅ Found</span>
                <span className="extraction-summary__pills">
                  {extractionSummary.found.map(f => (
                    <span key={f} className="pill pill--found">{f}</span>
                  ))}
                </span>
              </div>
            )}
            {extractionSummary.notFound.length > 0 && (
              <div className="extraction-summary__group extraction-summary__group--missing">
                <span className="extraction-summary__label">⚠️ Not found</span>
                <span className="extraction-summary__pills">
                  {extractionSummary.notFound.map(f => (
                    <span key={f} className="pill pill--missing">{f}</span>
                  ))}
                </span>
              </div>
            )}
          </div>
          {extractionSummary.notFound.length > 0 && (
            <p className="extraction-summary__hint">
              Fields marked <em>"Not found"</em> could not be read from the document — please fill them in manually.
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="upload-form">
        {/* ── File drop zone ── */}
        <div className="form-section">
          <h3>Document File</h3>
          <div className="file-upload-area">
            <input
              type="file"
              id="file-input"
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
              className="file-input"
              disabled={extracting}
            />
            <label htmlFor="file-input" className="file-label">
              <span className="file-icon">📄</span>
              <span className="file-text">
                {extracting ? '🔍 AI analyzing document…' : (file ? file.name : 'Choose a file or drag it here')}
              </span>
              <span className="file-info">
                {extracting ? 'Please wait…' : 'Max size: 10MB (PDF, JPEG, PNG)'}
              </span>
            </label>
          </div>
          {extracting && (
            <div className="extracting-indicator">
              <div className="extracting-spinner"></div>
              <span>AI is extracting data from document…</span>
            </div>
          )}
        </div>

        {/* ── Document details ── */}
        <div className="form-section">
          <h3>
            Document Details
            {extracting && <span className="badge badge--ai">✨ AI Auto-filling</span>}
          </h3>

          <div className="form-row">
            {/* Vendor */}
            <div className={`form-group ${fieldClass('vendor_id')}`}>
              <label>
                Vendor *
                <FieldBadge field="vendor_id" />
                {extractionStatus.vendor_id === 'not_found' && (
                  <span className="field-hint">Not found — select or create one</span>
                )}
              </label>
              <div className="vendor-select">
                <select
                  name="vendor_id"
                  value={formData.vendor_id}
                  onChange={handleInputChange}
                  required
                  disabled={extracting}
                >
                  <option value="">Select Vendor</option>
                  {vendors.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowNewVendor(true)} className="btn-secondary" disabled={extracting}>
                  + New
                </button>
              </div>
            </div>

            {/* Document type */}
            <div className="form-group">
              <label>Document Type *</label>
              <select name="document_type" value={formData.document_type} onChange={handleInputChange} required disabled={extracting}>
                <option value="invoice">Invoice</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            {/* Invoice number */}
            <div className={`form-group ${fieldClass('invoice_number')}`}>
              <label>
                Invoice Number *
                <FieldBadge field="invoice_number" />
                {extractionStatus.invoice_number === 'not_found' && (
                  <span className="field-hint">Not found — auto-generated below</span>
                )}
              </label>
              <input
                type="text"
                name="invoice_number"
                value={formData.invoice_number}
                onChange={handleInputChange}
                placeholder="e.g., INV-2024-001"
                required
                disabled={extracting}
              />
            </div>

            {/* Date */}
            <div className={`form-group ${fieldClass('date')}`}>
              <label>
                Date *
                <FieldBadge field="date" />
                {extractionStatus.date === 'not_found' && (
                  <span className="field-hint">Not found — please enter manually</span>
                )}
              </label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                required
                disabled={extracting}
              />
            </div>
          </div>

          <div className="form-row">
            {/* Amount */}
            <div className={`form-group ${fieldClass('amount')}`}>
              <label>
                Amount
                <FieldBadge field="amount" />
                {extractionStatus.amount === 'not_found' && (
                  <span className="field-hint">Not found — enter manually</span>
                )}
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                placeholder="0.00 (optional)"
                step="0.01"
                min="0"
                disabled={extracting}
              />
            </div>

            {/* VAT */}
            <div className={`form-group ${fieldClass('vat')}`}>
              <label>
                VAT
                <FieldBadge field="vat" />
                {extractionStatus.vat === 'not_found' && (
                  <span className="field-hint">Not found — enter manually</span>
                )}
              </label>
              <input
                type="number"
                name="vat"
                value={formData.vat}
                onChange={handleInputChange}
                placeholder="0.00 (optional)"
                step="0.01"
                min="0"
                disabled={extracting}
              />
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={uploading || extracting}>
            {uploading ? (
              <span>
                Uploading… {uploadProgress}%
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
              </span>
            ) : extracting ? (
              <span>🔍 AI Analyzing…</span>
            ) : (
              'Upload Document'
            )}
          </button>
        </div>
      </form>

      {/* ── New vendor modal ── */}
      {showNewVendor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add New Vendor</h3>
            <form onSubmit={handleCreateVendor}>
              <div className="form-group">
                <label>Vendor Name *</label>
                <input type="text" name="name" value={newVendor.name} onChange={handleNewVendorChange} placeholder="Enter vendor name" required />
              </div>
              <div className="form-group">
                <label>Tax Number</label>
                <input type="text" name="tax_number" value={newVendor.tax_number} onChange={handleNewVendorChange} placeholder="Enter tax number (optional)" />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Create</button>
                <button type="button" onClick={() => setShowNewVendor(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}