import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import './Upload.css';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [vendors, setVendors] = useState([]);
  
  // Helper function to get today's date in YYYY-MM-DD format
  const getTodaysDate = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [formData, setFormData] = useState({
    vendor_id: '',
    document_type: 'invoice',
    date: '', // Start empty - we'll set defaults after vendors load
    amount: '',
    vat: '',
    invoice_number: ''
  });
  
  const [newVendor, setNewVendor] = useState({
    name: '',
    tax_number: ''
  });
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [localVendorId, setLocalVendorId] = useState(null);
  
  const { user } = useAuth();
  const navigate = useNavigate();
  
  console.log('Token exists:', !!localStorage.getItem('token'));

  const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  const ensureLocalVendor = async () => {
    try {
      const localExists = vendors.some(v => v.name.toLowerCase() === 'local vendor');
      
      if (!localExists && vendors.length > 0) {
        console.log('🏠 Creating Local Vendor...');
        const response = await api.post('/documents/vendors', {
          name: 'Local Vendor',
          tax_number: '000000000'
        });
        
        await fetchVendors();
        console.log('✅ Local Vendor created:', response.data);
      }
    } catch (error) {
      console.error('Error ensuring Local Vendor:', error);
    }
  };

  const fetchVendors = async () => {
    try {
      console.log('Fetching vendors...');
      const response = await api.get('/documents/vendors');
      console.log('Vendors fetched:', response.data);
      setVendors(response.data.vendors);
      
      // Find and store Local Vendor ID
      const localVendor = response.data.vendors.find(v => 
        v.name.toLowerCase() === 'local vendor'
      );
      if (localVendor) {
        setLocalVendorId(localVendor.id);
      }
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  // This effect now ONLY runs when vendors load, and sets defaults
  useEffect(() => {
    if (vendors.length > 0 && localVendorId) {
      // Only set default vendor if NO vendor is currently selected AND we're not extracting
      if (!formData.vendor_id && !extracting) {
        setFormData(prev => ({
          ...prev,
          vendor_id: localVendorId,
          date: getTodaysDate() // Set today's date as default
        }));
        console.log('🏠 Default vendor set to: Local Vendor');
      }
    } else if (vendors.length > 0 && !localVendorId) {
      console.log('⚠️ Local Vendor not found, will try to create it');
      ensureLocalVendor();
    }
  }, [vendors, localVendorId, formData.vendor_id, extracting]);

  const generateInvoiceNumber = () => {
  const prefix = 'INV';
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  // Simple random number between 100-999
  const random = Math.floor(Math.random() * 900 + 100);
  
  return `${prefix}-${year}${month}${day}-${random}`;
};

  const extractDataFromFile = async (selectedFile) => {
    setExtracting(true);
    setError('');
    
    try {
      console.log('🔍 Attempting to extract data from file before upload...');
      console.log('Current vendors before extraction:', vendors.map(v => v.name));
      
      const extractData = new FormData();
      extractData.append('document', selectedFile);
      
      const response = await api.post('/documents/extract-preview', extractData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      console.log('✅ Extraction preview response:', response.data);
      
      const generatedInvoiceNumber = generateInvoiceNumber();
      
      // Start with invoice number only
      let updatedData = {
        invoice_number: generatedInvoiceNumber,
      };
      
      // If we got data from AI, use it
      if (response.data.data) {
        const extracted = response.data.data;
        console.log('📊 Extracted data:', extracted);
        
        // ============ DATE HANDLING - FIXED ============
        let formattedDate = null;
        if (extracted.date) {
          console.log('Raw extracted date:', extracted.date);
          
          // Check if it's already in YYYY-MM-DD format
          if (extracted.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
            formattedDate = extracted.date;
            console.log('Date already in correct format:', formattedDate);
          }
          // Handle MM/DD/YYYY or DD/MM/YYYY format
          else if (extracted.date.includes('/')) {
            const parts = extracted.date.split('/');
            if (parts.length === 3) {
              if (parts[2].length === 4) {
                formattedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              } else if (parts[2].length === 2) {
                formattedDate = `20${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
              }
            }
          }
          // Handle DD-MM-YYYY format
          else if (extracted.date.includes('-')) {
            const parts = extracted.date.split('-');
            if (parts.length === 3 && parts[2].length === 4) {
              formattedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
        }
        
        // Add AI extracted data - these will override defaults
        if (formattedDate) {
          updatedData.date = formattedDate;
          console.log('Setting date to:', formattedDate);
        }
        if (extracted.amount) updatedData.amount = extracted.amount;
        if (extracted.vat) updatedData.vat = extracted.vat;

        // ============ VENDOR HANDLING - FIXED ============
        if (extracted.vendor && vendors.length > 0) {
          console.log('Looking for vendor:', extracted.vendor);
          console.log('Available vendors:', vendors.map(v => v.name));
          
          // Try to find exact match first (case insensitive, trimmed)
          let matchedVendor = vendors.find(v => 
            v.name.toLowerCase().trim() === extracted.vendor.toLowerCase().trim()
          );
          
          // If no exact match, try partial match
          if (!matchedVendor) {
            matchedVendor = vendors.find(v => 
              v.name.toLowerCase().includes(extracted.vendor.toLowerCase()) ||
              extracted.vendor.toLowerCase().includes(v.name.toLowerCase())
            );
          }
          
          if (matchedVendor) {
            console.log('✅ Found matching vendor:', matchedVendor.name, 'with ID:', matchedVendor.id);
            updatedData.vendor_id = matchedVendor.id;
            setSuccess(`✨ Vendor auto-selected: ${matchedVendor.name}`);
            setTimeout(() => setSuccess(''), 3000);
          } else {
            console.log('❌ No matching vendor found for:', extracted.vendor);
            // Pre-fill new vendor form
            setNewVendor(prev => ({
              ...prev,
              name: extracted.vendor
            }));
            // Show message but don't auto-select
            setSuccess(`📋 Vendor "${extracted.vendor}" extracted - click "+ New" to add it`);
            setTimeout(() => setSuccess(''), 4000);
          }
        }
        
        // Count extracted fields for success message
        const extractedFields = Object.keys(extracted).filter(k => extracted[k]).length;
        setSuccess(`✅ AI extracted: ${extractedFields} fields`);
      } else {
        setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated`);
      }
      
      // Update form with all data - AI values will override defaults
      setFormData(prev => {
        const newData = {
          ...prev,
          ...updatedData
        };
        // Ensure date is set (either from AI or default to today)
        if (!newData.date) newData.date = getTodaysDate();
        console.log('Updated form data:', newData);
        return newData;
      });
      
    } catch (error) {
      console.error('❌ Extraction preview failed:', error);
      const generatedInvoiceNumber = generateInvoiceNumber();
      setFormData(prev => ({
        ...prev,
        invoice_number: generatedInvoiceNumber,
        date: getTodaysDate() // Default to today on error
      }));
      setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated`);
    } finally {
      setExtracting(false);
    }
  };

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      console.log('File selected:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      });
      
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Only PDF, JPEG, and PNG files are allowed');
        return;
      }
      
      setFile(selectedFile);
      setError('');
      
      const tempInvoiceNumber = generateInvoiceNumber();
      setFormData(prev => ({
        ...prev,
        invoice_number: tempInvoiceNumber
      }));
      
      await extractDataFromFile(selectedFile);
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleNewVendorChange = (e) => {
    setNewVendor({
      ...newVendor,
      [e.target.name]: e.target.value
    });
  };

  const handleCreateVendor = async (e) => {
    e.preventDefault();
    try {
      console.log('Creating vendor:', newVendor);
      const response = await api.post('/documents/vendors', newVendor);
      console.log('Vendor created:', response.data);
      setVendors([...vendors, response.data.vendor]);
      setFormData({ ...formData, vendor_id: response.data.vendor.id });
      setShowNewVendor(false);
      setNewVendor({ name: '', tax_number: '' });
      setSuccess('Vendor created successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error('Error creating vendor:', error);
      setError(error.response?.data?.message || 'Error creating vendor');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    // Ensure amount and vat have default values (0) if empty
    const submitData = {
      ...formData,
      amount: formData.amount === '' ? '0' : formData.amount,
      vat: formData.vat === '' ? '0' : formData.vat
    };

    console.log('Submitting form with data:', {
      vendor_id: submitData.vendor_id,
      document_type: submitData.document_type,
      date: submitData.date,
      amount: submitData.amount,
      vat: submitData.vat,
      invoice_number: submitData.invoice_number,
      file: file.name
    });

    setUploading(true);
    setError('');
    setSuccess('');

    const data = new FormData();
    data.append('document', file);
    data.append('vendor_id', submitData.vendor_id);
    data.append('document_type', submitData.document_type);
    data.append('date', submitData.date);
    data.append('amount', submitData.amount);
    data.append('vat', submitData.vat);
    data.append('invoice_number', submitData.invoice_number);

    try {
      console.log('Sending upload request to:', '/documents/upload');
      
      const response = await api.post('/documents/upload', data, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      });

      console.log('Upload successful:', response.data);
      setSuccess('Document uploaded successfully!');
      setUploadProgress(0);
      
      setFile(null);
      setFormData({
        vendor_id: '',
        document_type: 'invoice',
        date: '',
        amount: '',
        vat: '',
        invoice_number: ''
      });
      
      document.getElementById('file-input').value = '';
      
      setTimeout(() => {
        setSuccess('');
        navigate('/documents');
      }, 2000);
      
    } catch (error) {
      console.error('Upload error details:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Error uploading document';
      setError(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="upload-container">
      <div className="upload-header">
        <h2>Upload Document</h2>
        <p>Upload invoices and credit notes for processing</p>
      </div>

      {error && <div className="upload-error">{error}</div>}
      {success && <div className="upload-success">{success}</div>}

      <form onSubmit={handleSubmit} className="upload-form">
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
                {extracting ? '🔍 AI analyzing document...' : (file ? file.name : 'Choose a file or drag it here')}
              </span>
              <span className="file-info">
                {extracting ? 'Please wait...' : 'Max size: 10MB (PDF, JPEG, PNG)'}
              </span>
            </label>
          </div>
          {extracting && (
            <div className="extracting-indicator">
              <div className="extracting-spinner"></div>
              <span>AI is extracting data from document...</span>
            </div>
          )}
        </div>

        <div className="form-section">
          <h3>Document Details {extracting && <span className="badge">✨ AI Auto-filling</span>}</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label>Vendor *</label>
              <div className="vendor-select">
                <select
                  name="vendor_id"
                  value={formData.vendor_id}
                  onChange={handleInputChange}
                  required
                  disabled={extracting}
                >
                  <option value="">Select Vendor</option>
                  {vendors.map(vendor => (
                    <option key={vendor.id} value={vendor.id}>
                      {vendor.name}
                    </option>
                  ))}
                </select>
                <button 
                  type="button" 
                  onClick={() => setShowNewVendor(true)}
                  className="btn-secondary"
                  disabled={extracting}
                >
                  + New
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Document Type *</label>
              <select
                name="document_type"
                value={formData.document_type}
                onChange={handleInputChange}
                required
                disabled={extracting}
              >
                <option value="invoice">Invoice</option>
                <option value="credit_note">Credit Note</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Invoice Number *</label>
              <input
                type="text"
                name="invoice_number"
                value={formData.invoice_number}
                onChange={handleInputChange}
                placeholder="e.g., INV-2024-001"
                required
                disabled={extracting}
                className={formData.invoice_number && !extracting ? 'auto-filled' : ''}
              />
              {formData.invoice_number && !extracting && <span className="auto-fill-badge">Auto</span>}
            </div>

            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                required
                disabled={extracting}
                className={formData.date && !extracting ? 'auto-filled' : ''}
              />
              {formData.date && !extracting && <span className="auto-fill-badge">{
                formData.date === getTodaysDate() ? 'Today' : 'AI'
              }</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount</label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                placeholder="0.00 (optional)"
                step="0.01"
                min="0"
                disabled={extracting}
                className={formData.amount && !extracting ? 'auto-filled' : ''}
              />
              {formData.amount && !extracting && <span className="auto-fill-badge">AI</span>}
            </div>

            <div className="form-group">
              <label>VAT</label>
              <input
                type="number"
                name="vat"
                value={formData.vat}
                onChange={handleInputChange}
                placeholder="0.00 (optional)"
                step="0.01"
                min="0"
                disabled={extracting}
                className={formData.vat && !extracting ? 'auto-filled' : ''}
              />
              {formData.vat && !extracting && <span className="auto-fill-badge">AI</span>}
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button 
            type="submit" 
            className="btn-primary"
            disabled={uploading || extracting}
          >
            {uploading ? (
              <span>
                Uploading... {uploadProgress}%
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </span>
            ) : extracting ? (
              <span>🔍 AI Analyzing...</span>
            ) : (
              'Upload Document'
            )}
          </button>
        </div>
      </form>

      {showNewVendor && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add New Vendor</h3>
            <form onSubmit={handleCreateVendor}>
              <div className="form-group">
                <label>Vendor Name *</label>
                <input
                  type="text"
                  name="name"
                  value={newVendor.name}
                  onChange={handleNewVendorChange}
                  placeholder="Enter vendor name"
                  required
                />
              </div>
              <div className="form-group">
                <label>Tax Number</label>
                <input
                  type="text"
                  name="tax_number"
                  value={newVendor.tax_number}
                  onChange={handleNewVendorChange}
                  placeholder="Enter tax number (optional)"
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn-primary">Create</button>
                <button 
                  type="button" 
                  onClick={() => setShowNewVendor(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}