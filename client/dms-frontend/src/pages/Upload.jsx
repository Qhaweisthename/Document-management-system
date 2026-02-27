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
  const [autoCreateVendor, setAutoCreateVendor] = useState(false); // Toggle for auto-creation
  
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

  const handleAutoCreateVendor = async (vendorName, taxNumber = '') => {
    try {
      console.log('🏢 Auto-creating vendor:', vendorName);
      const response = await api.post('/documents/vendors', {
        name: vendorName,
        tax_number: taxNumber || '000000000'
      });
      console.log('✅ Vendor auto-created:', response.data);
      
      // Refresh vendors list
      await fetchVendors();
      
      // Select the newly created vendor
      setFormData(prev => ({
        ...prev,
        vendor_id: response.data.vendor.id
      }));
      
      setSuccess(`✅ Vendor "${vendorName}" auto-created and selected`);
      setTimeout(() => setSuccess(''), 3000);
      
      return response.data.vendor;
    } catch (error) {
      console.error('Error auto-creating vendor:', error);
      return null;
    }
  };

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
    
    console.log('✅ Extraction preview response:', response.data);
    
    const generatedInvoiceNumber = generateInvoiceNumber();
    
    // Start with invoice number only
    let updatedData = {
      invoice_number: generatedInvoiceNumber,
    };
    
    // Track extracted fields for success message
    let extractedFields = [];
    
    // If we got data from AI, use it
    if (response.data.data) {
      const extracted = response.data.data;
      console.log('📊 AI Extracted data:', extracted);
      
      // Handle invoice number
      if (extracted.invoice_number && 
          !extracted.invoice_number.match(/^(bill|invoice|total|amount|date)$/i) &&
          extracted.invoice_number.length > 2) {
        console.log('Found invoice number:', extracted.invoice_number);
        updatedData.invoice_number = extracted.invoice_number;
        extractedFields.push('invoice_number');
      }
      
      // Handle date
      if (extracted.date) {
        console.log('Found date:', extracted.date);
        // Check if it's a valid date format
        if (extracted.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          updatedData.date = extracted.date;
          extractedFields.push('date');
        } else {
          // Try to parse other date formats
          const parsedDate = new Date(extracted.date);
          if (!isNaN(parsedDate.getTime())) {
            const year = parsedDate.getFullYear();
            const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
            const day = String(parsedDate.getDate()).padStart(2, '0');
            updatedData.date = `${year}-${month}-${day}`;
            extractedFields.push('date');
          }
        }
      }
      
      // Handle amount
      if (extracted.amount) {
        const amountValue = parseFloat(extracted.amount);
        if (!isNaN(amountValue) && amountValue > 0) {
          console.log('Found amount:', amountValue);
          updatedData.amount = amountValue.toString();
          extractedFields.push('amount');
        }
      }
      
      // Handle VAT
      if (extracted.vat) {
        const vatValue = parseFloat(extracted.vat);
        if (!isNaN(vatValue) && vatValue > 0) {
          console.log('Found vat:', vatValue);
          updatedData.vat = vatValue.toString();
          extractedFields.push('vat');
        }
      }

      // ============ VENDOR HANDLING - NOW PRE-FILLS LIKE OTHER FIELDS ============
      if (extracted.vendor && extracted.vendor !== 'Invoice' && extracted.vendor.length > 2) {
        console.log('Found vendor name:', extracted.vendor);
        
        // Clean up vendor name
        const cleanVendorName = extracted.vendor.replace(/\s+/g, ' ').trim();
        
        // Try to find matching vendor in existing list
        const matchedVendor = vendors.find(v => 
          v.name.toLowerCase().includes(cleanVendorName.toLowerCase()) ||
          cleanVendorName.toLowerCase().includes(v.name.toLowerCase())
        );
        
        if (matchedVendor) {
          console.log('✅ Found matching vendor in database:', matchedVendor.name);
          updatedData.vendor_id = matchedVendor.id;
          extractedFields.push('vendor');
        } else {
          console.log('⚠️ Vendor not found in database, pre-filling as text');
          // Instead of trying to set vendor_id (which requires an ID),
          // we'll set the vendor name in a separate field and show a message
          
          // Store the extracted vendor name in a temporary state
          // You can either:
          // Option 1: Auto-create the vendor
          if (autoCreateVendor) {
            console.log('🤖 Auto-creating vendor:', cleanVendorName);
            try {
              const createResponse = await api.post('/documents/vendors', {
                name: cleanVendorName,
                tax_number: extracted.vat || '000000000'
              });
              console.log('✅ Vendor auto-created:', createResponse.data);
              
              // Refresh vendors list
              await fetchVendors();
              
              // Select the newly created vendor
              updatedData.vendor_id = createResponse.data.vendor.id;
              extractedFields.push('vendor (auto-created)');
            } catch (createError) {
              console.error('❌ Failed to auto-create vendor:', createError);
              // Pre-fill the new vendor form as fallback
              setNewVendor(prev => ({
                ...prev,
                name: cleanVendorName,
                tax_number: extracted.vat || ''
              }));
              setShowNewVendor(true);
            }
          } else {
            // Option 2: Pre-fill the new vendor form
            setNewVendor(prev => ({
              ...prev,
              name: cleanVendorName,
              tax_number: extracted.vat || ''
            }));
            
            // Show a success message that vendor is ready to be created
            setSuccess(`📋 Vendor "${cleanVendorName}" ready - Complete creation in popup`);
            
            // Automatically open the new vendor modal
            setShowNewVendor(true);
          }
        }
      }
    }
    
    // Update form with all data
    console.log('Updating form with:', updatedData);
    setFormData(prev => ({
      ...prev,
      ...updatedData
    }));
    
    // Show success message
    if (extractedFields.length > 0) {
      setSuccess(`✅ AI extracted: ${extractedFields.join(', ')}`);
    } else {
      setSuccess(`✅ Invoice #${generatedInvoiceNumber} generated`);
    }
    
  } catch (error) {
    console.error('❌ Extraction preview failed:', error);
    const generatedInvoiceNumber = generateInvoiceNumber();
    setFormData(prev => ({
      ...prev,
      invoice_number: generatedInvoiceNumber
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
        <div className="vendor-auto-create-option">
          <label>
            <input
              type="checkbox"
              checked={autoCreateVendor}
              onChange={(e) => setAutoCreateVendor(e.target.checked)}
            />
            Auto-create new vendors
          </label>
        </div>
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
                formData.date !== getTodaysDate() ? 'AI' : 'Today'
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