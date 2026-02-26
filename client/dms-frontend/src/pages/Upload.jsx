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
  
  const { user } = useAuth();
  const navigate = useNavigate();
  const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const response = await api.get('/upload/vendors');
      setVendors(response.data.vendors);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Check file size (10MB limit)
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }
      
      // Check file type
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!allowedTypes.includes(selectedFile.type)) {
        setError('Only PDF, JPEG, and PNG files are allowed');
        return;
      }
      
      setFile(selectedFile);
      setError('');
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
      const response = await api.post('/upload/vendors', newVendor);
      setVendors([...vendors, response.data.vendor]);
      setFormData({ ...formData, vendor_id: response.data.vendor.id });
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
    
    if (!file) {
      setError('Please select a file');
      return;
    }

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
      const response = await api.post('/upload/document', data, {
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

      setSuccess('Document uploaded successfully!');
      setUploadProgress(0);
      
      // Reset form
      setFile(null);
      setFormData({
        vendor_id: '',
        document_type: 'invoice',
        date: '',
        amount: '',
        vat: '',
        invoice_number: ''
      });
      
      // Reset file input
      document.getElementById('file-input').value = '';
      
      setTimeout(() => {
        setSuccess('');
        navigate('/documents');
      }, 2000);
      
    } catch (error) {
      setError(error.response?.data?.message || 'Error uploading document');
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
        {/* File Upload Section */}
        <div className="form-section">
          <h3>Document File</h3>
          <div className="file-upload-area">
            <input
              type="file"
              id="file-input"
              onChange={handleFileChange}
              accept=".pdf,.jpg,.jpeg,.png"
              className="file-input"
            />
            <label htmlFor="file-input" className="file-label">
              <span className="file-icon">📄</span>
              <span className="file-text">
                {file ? file.name : 'Choose a file or drag it here'}
              </span>
              <span className="file-info">Max size: 10MB (PDF, JPEG, PNG)</span>
            </label>
          </div>
        </div>

        {/* Document Details */}
        <div className="form-section">
          <h3>Document Details</h3>
          
          <div className="form-row">
            <div className="form-group">
              <label>Vendor *</label>
              <div className="vendor-select">
                <select
                  name="vendor_id"
                  value={formData.vendor_id}
                  onChange={handleInputChange}
                  required
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
              />
            </div>

            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                name="date"
                value={formData.date}
                onChange={handleInputChange}
                required
              />
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
              />
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
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="form-actions">
          <button 
            type="submit" 
            className="btn-primary"
            disabled={uploading}
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
            ) : (
              'Upload Document'
            )}
          </button>
        </div>
      </form>

      {/* New Vendor Modal */}
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