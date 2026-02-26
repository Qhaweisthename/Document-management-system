import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import './Documents.css';

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const { user } = useAuth();

  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const response = await api.get('/upload/my-uploads');
      setDocuments(response.data.documents);
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (id, filename) => {
    try {
      const response = await api.get(`/upload/download/${id}`, {
        responseType: 'blob'
      });
      
      // Create download link
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

  const getStatusBadge = (status) => {
    const badges = {
      pending: { class: 'badge-pending', text: 'Pending' },
      approved: { class: 'badge-approved', text: 'Approved' },
      rejected: { class: 'badge-rejected', text: 'Rejected' }
    };
    const badge = badges[status] || badges.pending;
    return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
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
          <h2>My Documents</h2>
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
              <div className="document-icon">
                {doc.document_type === 'invoice' ? '📄' : '📝'}
              </div>
              
              <div className="document-info">
                <h3>{doc.filename}</h3>
                <p className="document-meta">
                  <span>Invoice: {doc.invoice_number}</span>
                  <span>Amount: ${doc.amount}</span>
                </p>
                <p className="document-meta">
                  <span>Vendor: {doc.vendor_name}</span>
                  <span>Date: {new Date(doc.date).toLocaleDateString()}</span>
                </p>
              </div>

              <div className="document-footer">
                <div className="document-status">
                  {getStatusBadge(doc.status)}
                </div>
                
                <button
                  onClick={() => handleDownload(doc.id, doc.filename)}
                  className="download-btn"
                  title="Download"
                >
                  ⬇️
                </button>
              </div>

              {doc.ai_extraction && (
                <div className="ai-insights">
                  <span className="ai-badge">
                    AI Confidence: {(doc.ai_extraction.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}