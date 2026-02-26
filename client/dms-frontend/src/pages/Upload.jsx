import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import './Upload.css';

export default function Upload() {
  const [file, setFile] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [formData, setFormData] = useState({
    vendor_id: '',
    document_type: 'invoice',
    date: '',
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
  
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // Debug: Check if token exists
  console.log('Token exists:', !!localStorage.getItem('token'));

  const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  // ============ ENSURE LOCAL VENDOR EXISTS ============
  const ensureLocalVendor = async () => {
    try {
      // Check if Local Vendor already exists
      const localExists = vendors.some(v => v.name.toLowerCase() === 'local vendor');
      
      if (!localExists && vendors.length > 0) {
        console.log('🏠 Creating Local Vendor...');
        const response = await api.post('/documents/vendors', {
          name: 'Local Vendor',
          tax_number: '000000000'
        });
        
        // Refresh vendors list
        await fetchVendors();
        console.log('✅ Local Vendor created:', response.data);
      }
    } catch (error) {
      console.error('Error ensuring Local Vendor:', error);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  // After vendors are fetched, ensure Local Vendor exists
  useEffect(() => {
    if (vendors.length > 0) {
      ensureLocalVendor();
    }
  }, [vendors]);

  const fetchVendors = async () => {
    try {
      console.log('Fetching vendors...');
      const response = await api.get('/documents/vendors');
      console.log('Vendors fetched:', response.data);
      setVendors(response.data.vendors);
    } catch (error) {
      console.error('Error fetching vendors:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers
      });
    }
  };

  // ============ NEW FUNCTION: Generate random invoice number ============
  const generateInvoiceNumber = () => {
    const prefix = 'INV';
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 900 + 100); // 100-999
    return `${prefix}-${year}${month}${day}-${random}`;
  };

  // Extract data from file before upload with auto-generated invoice number
  const extractDataFromFile = async (selectedFile) => {
    setExtracting(true);
    setError('');
    
    try {
      console.log('🔍 Attempting to extract data from file before upload...');
      
      const extractData = new FormData();
      extractData.append('document', selectedFile);
      
      const response = await api.post('/documents/extract-preview', extractData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      console.log('✅ Extraction preview successful:', response.data);
      
      // Generate a random invoice number
      const generatedInvoiceNumber = generateInvoiceNumber();
      
      if (response.data.success && response.data.data) {
        const extracted = response.data.data;
        
        // Format date if found
        let formattedDate = extracted.date;
        if (extracted.date && extracted.date.includes('/')) {
          const parts = extracted.date.split('/');
          if (parts.length === 3) {
            if (parts[2].length === 4) {
              formattedDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            }
          }
        }
        
        // Auto-fill the form with extracted data + generated invoice number
        setFormData(prev => ({
          ...prev,
          invoice_number: generatedInvoiceNumber,
          date: formattedDate || prev.date,
          amount: extracted.amount || prev.amount,
          vat: extracted.vat || prev.vat,
        }));

        // Try to auto-select vendor if match found
        if (extracted.vendor && vendors.length > 0) {
          const matchedVendor = vendors.find(v => 
            v.name.toLowerCase().includes(extracted.vendor.toLowerCase()) ||
            extracted.vendor.toLowerCase().includes(v.name.toLowerCase())
          );
          
          if (matchedVendor) {
            setFormData(prev => ({
              ...prev,
              vendor_id: matchedVendor.id
            }));
            setSuccess(`✨ Vendor auto-selected: ${matchedVendor.name}`);
            setTimeout(() => setSuccess(''), 3000);
          } else {
            // Vendor extracted but not found in list - prompt to create
            setNewVendor(prev => ({
              ...prev,
              name: extracted.vendor
            }));
            // Show a message but don't auto-select
            setSuccess(`📋 Vendor "${extracted.vendor}" extracted - click "+ New" to add it`);
            setTimeout(() => setSuccess(''), 4000);
          }
        } else {
          // No vendor extracted, default to "Local Vendor"
          // First, check if "Local Vendor" exists in the vendors list
          const localVendor = vendors.find(v => 
            v.name.toLowerCase() === 'local vendor'
          );
          
          if (localVendor) {
            // If Local Vendor exists, select it
            setFormData(prev => ({
              ...prev,
              vendor_id: localVendor.id
            }));
            setSuccess(`🏠 Defaulted to "Local Vendor" (no vendor detected)`);
            setTimeout(() => setSuccess(''), 3000);
          } else {
            // If Local Vendor doesn't exist, offer to create it
            setNewVendor(prev => ({
              ...prev,
              name: 'Local Vendor',
              tax_number: '000000000'
            }));
            setShowNewVendor(true);
            setSuccess(`➕ Please create "Local Vendor" as a default option`);
            setTimeout(() => setSuccess(''), 4000);
          }
        }
      } else {
        // Even if extraction fails, still generate an invoice number and default to Local Vendor
        setFormData(prev => ({
          ...prev,
          invoice_number: generatedInvoiceNumber
        }));
        
        // Default to "Local Vendor" when extraction fails
        const localVendor = vendors.find(v => 
          v.name.toLowerCase() === 'local vendor'
        );
        
        if (localVendor) {
          setFormData(prev => ({
            ...prev,
            vendor_id: localVendor.id
          }));
          setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated, defaulted to Local Vendor`);
        } else {
          setNewVendor(prev => ({
            ...prev,
            name: 'Local Vendor',
            tax_number: '000000000'
          }));
          setShowNewVendor(true);
          setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated. Please create "Local Vendor"`);
        }
        setTimeout(() => setSuccess(''), 3000);
      }
      
    } catch (error) {
      console.error('❌ Extraction preview failed:', error);
      // Still generate an invoice number even on error and default to Local Vendor
      const generatedInvoiceNumber = generateInvoiceNumber();
      
      // Default to "Local Vendor" on error
      const localVendor = vendors.find(v => 
        v.name.toLowerCase() === 'local vendor'
      );
      
      setFormData(prev => ({
        ...prev,
        invoice_number: generatedInvoiceNumber
      }));
      
      if (localVendor) {
        setFormData(prev => ({
          ...prev,
          vendor_id: localVendor.id
        }));
        setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated, defaulted to Local Vendor`);
      } else {
        setNewVendor(prev => ({
          ...prev,
          name: 'Local Vendor',
          tax_number: '000000000'
        }));
        setShowNewVendor(true);
        setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated. Please create "Local Vendor"`);
      }
      setTimeout(() => setSuccess(''), 3000);
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
      
      // Validate file
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
      
      // Generate a temporary invoice number immediately
      const tempInvoiceNumber = generateInvoiceNumber();
      setFormData(prev => ({
        ...prev,
        invoice_number: tempInvoiceNumber
      }));
      
      // Try to extract data and pre-fill form
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
      console.error('Error creating vendor:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      setError(error.response?.data?.message || 'Error creating vendor');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setError('Please select a file');
      return;
    }

    // Log form data before submission
    console.log('Submitting form with data:', {
      vendor_id: formData.vendor_id,
      document_type: formData.document_type,
      date: formData.date,
      amount: formData.amount,
      vat: formData.vat,
      invoice_number: formData.invoice_number,
      file: file.name
    });

    setUploading(true);
    setError('');
    setSuccess('');

    const data = new FormData();
    data.append('document', file);
    data.append('vendor_id', formData.vendor_id);
    data.append('document_type', formData.document_type);
    data.append('date', formData.date);
    data.append('amount', formData.amount);
    data.append('vat', formData.vat);
    data.append('invoice_number', formData.invoice_number);

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
          console.log('Upload progress:', percentCompleted);
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
      console.error('Upload error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        headers: error.response?.headers,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          data: error.config?.data
        }
      });
      
      // Show more specific error message
      const errorMessage = error.response?.data?.message || 
                          error.response?.data?.error || 
                          error.message || 
                          'Error uploading document';
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
              {formData.date && !extracting && <span className="auto-fill-badge">AI</span>}
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Amount *</label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleInputChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
                disabled={extracting}
                className={formData.amount && !extracting ? 'auto-filled' : ''}
              />
              {formData.amount && !extracting && <span className="auto-fill-badge">AI</span>}
            </div>

            <div className="form-group">
              <label>VAT *</label>
              <input
                type="number"
                name="vat"
                value={formData.vat}
                onChange={handleInputChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
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