import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import './Documents.css';

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [deletingId, setDeletingId] = useState(null);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editFormData, setEditFormData] = useState({
    vendor_id: '',
    document_type: '',
    date: '',
    amount: '',
    vat: '',
    invoice_number: ''
  });
  const [vendors, setVendors] = useState([]);
  const { user } = useAuth();

  const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchDocuments();
    fetchVendors();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/documents/all');
      setDocuments(response.data.documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await api.get('/documents/vendors');
      setVendors(response.data.vendors);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const handleDownload = async (id, filename) => {
    try {
      const response = await api.get(`/documents/download/${id}`, {
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  };

  // Handle document deletion
  const handleDelete = async (id, filename) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    setDeletingId(id);
    try {
      await api.delete(`/documents/${id}`);
      setDocuments(documents.filter(doc => doc.id !== id));
      alert('Document deleted successfully!');
    } catch (error) {
      console.error('Error deleting document:', error);
      alert(error.response?.data?.message || 'Error deleting document');
    } finally {
      setDeletingId(null);
    }
  };

  // NEW: Handle edit button click
  const handleEditClick = (doc) => {
    setEditingDoc(doc.id);
    setEditFormData({
      vendor_id: doc.vendor_id || '',
      document_type: doc.document_type || 'invoice',
      date: doc.date ? doc.date.split('T')[0] : '',
      amount: doc.amount || '',
      vat: doc.vat || '',
      invoice_number: doc.invoice_number || ''
    });
  };

  // NEW: Handle edit form input changes
  const handleEditInputChange = (e) => {
    setEditFormData({
      ...editFormData,
      [e.target.name]: e.target.value
    });
  };

  // NEW: Handle edit form submission
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    
    try {
      await api.put(`/documents/${editingDoc}`, editFormData);
      
      // Refresh documents
      await fetchDocuments();
      
      // Close edit mode
      setEditingDoc(null);
      setEditFormData({
        vendor_id: '',
        document_type: '',
        date: '',
        amount: '',
        vat: '',
        invoice_number: ''
      });
      
      alert('Document updated successfully!');
    } catch (error) {
      console.error('Error updating document:', error);
      alert(error.response?.data?.message || 'Error updating document');
    }
  };

  // NEW: Cancel edit
  const handleCancelEdit = () => {
    setEditingDoc(null);
    setEditFormData({
      vendor_id: '',
      document_type: '',
      date: '',
      amount: '',
      vat: '',
      invoice_number: ''
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { class: 'badge-pending', text: 'Pending' },
      approved: { class: 'badge-approved', text: 'Approved' },
      rejected: { class: 'badge-rejected', text: 'Rejected' }
    };
    const badge = badges[status] || badges.pending;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
  };

  // Helper function to format invoice number
  const formatInvoiceNumber = (doc) => {
    if (doc.invoice_number && !doc.invoice_number.includes('ERROR')) {
      return doc.invoice_number;
    }
    
    const date = new Date(doc.created_at);
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 900 + 100);
    return `INV-${year}${month}${day}-${random}`;
  };

  const filteredDocuments = documents.filter(doc => {
    if (filter === 'all') return true;
    return doc.status === filter;
  });

  if (loading) {
    return (
      <div className="documents-loading">
        <div className="spinner"></div>
        <p>Loading documents...</p>
      </div>
    );
  }

  return (
    <div className="documents-container">
      <div className="documents-header">
        <div>
          <h2>All Documents</h2>
          <p className="document-count">{documents.length} total documents</p>
        </div>
        
        <div className="filter-controls">
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Documents</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {filteredDocuments.length === 0 ? (
        <div className="no-documents">
          <p>No documents found</p>
          {user?.role !== 'viewer' && (
            <button 
              onClick={() => window.location.href = '/upload'}
              className="btn-primary"
            >
              Upload Your First Document
            </button>
          )}
        </div>
      ) : (
        <div className="documents-grid">
          {filteredDocuments.map(doc => (
            <div key={doc.id} className="document-card">
              {editingDoc === doc.id ? (
                // Edit Mode
                <form onSubmit={handleEditSubmit} className="edit-form">
                  <h4>Edit Document</h4>
                  
                  <div className="edit-form-group">
                    <label>Vendor</label>
                    <select
                      name="vendor_id"
                      value={editFormData.vendor_id}
                      onChange={handleEditInputChange}
                      required
                    >
                      <option value="">Select Vendor</option>
                      {vendors.map(vendor => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="edit-form-group">
                    <label>Document Type</label>
                    <select
                      name="document_type"
                      value={editFormData.document_type}
                      onChange={handleEditInputChange}
                      required
                    >
                      <option value="invoice">Invoice</option>
                      <option value="credit_note">Credit Note</option>
                    </select>
                  </div>

                  <div className="edit-form-group">
                    <label>Invoice Number</label>
                    <input
                      type="text"
                      name="invoice_number"
                      value={editFormData.invoice_number}
                      onChange={handleEditInputChange}
                      required
                    />
                  </div>

                  <div className="edit-form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      name="date"
                      value={editFormData.date}
                      onChange={handleEditInputChange}
                      required
                    />
                  </div>

                  <div className="edit-form-group">
                    <label>Amount</label>
                    <input
                      type="number"
                      name="amount"
                      value={editFormData.amount}
                      onChange={handleEditInputChange}
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>

                  <div className="edit-form-group">
                    <label>VAT</label>
                    <input
                      type="number"
                      name="vat"
                      value={editFormData.vat}
                      onChange={handleEditInputChange}
                      step="0.01"
                      min="0"
                      required
                    />
                  </div>

                  <div className="edit-form-actions">
                    <button type="submit" className="save-btn">Save</button>
                    <button type="button" onClick={handleCancelEdit} className="cancel-btn">Cancel</button>
                  </div>
                </form>
              ) : (
                // View Mode
                <>
                  <div className="document-icon">
                    {doc.document_type === 'invoice' ? '📄' : '📝'}
                  </div>
                  
                  <div className="document-info">
                    <h3>{doc.filename}</h3>
                    <p className="document-meta">
                      <span>Invoice: {formatInvoiceNumber(doc)}</span>
                      <span>Amount: ${doc.amount}</span>
                    </p>
                    <p className="document-meta">
                      <span>Vendor: {doc.vendor_name || 'Local Vendor'}</span>
                      <span>Date: {new Date(doc.date || doc.created_at).toLocaleDateString()}</span>
                    </p>
                  </div>

                  <div className="document-footer">
                    <div className="document-status">
                      {getStatusBadge(doc.status)}
                    </div>
                    
                    <div className="document-actions">
                      <button
                        onClick={() => handleDownload(doc.id, doc.filename)}
                        className="download-btn"
                        title="Download"
                      >
                        ⬇️
                      </button>
                      
                      {/* Edit button - visible to admin and document owner */}
                      {(user?.role === 'admin' || user?.id === doc.created_by) && (
                        <button
                          onClick={() => handleEditClick(doc)}
                          className="edit-btn"
                          title="Edit"
                        >
                          ✏️
                        </button>
                      )}
                      
                      {/* Delete button - only visible to admin users */}
                      {user?.role === 'admin' && (
                        <button
                          onClick={() => handleDelete(doc.id, doc.filename)}
                          className="delete-btn"
                          title="Delete"
                          disabled={deletingId === doc.id}
                        >
                          {deletingId === doc.id ? '...' : '🗑️'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}