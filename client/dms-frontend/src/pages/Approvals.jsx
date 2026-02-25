import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Approvals.css';

export default function Approvals() {
  const [approvals, setApprovals] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchApprovals();
    if (user?.role === 'admin') {
      fetchStats();
    }
  }, []);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/approvals/pending');
      // Ensure approvals is always an array
      setApprovals(response.data.approvals || []);
    } catch (error) {
      console.error('Error fetching approvals:', error);
      setError('Failed to load approvals. Please try again.');
      setApprovals([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/approvals/stats');
      setStats(response.data.stats || {});
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({});
    }
  };

  const handleApprove = async (approvalId) => {
    if (!comment.trim()) {
      const confirm = window.confirm('Approve without comments?');
      if (!confirm) return;
    }
    await processApproval(approvalId, 'approved');
  };

  const handleReject = async (approvalId) => {
    if (!comment.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    await processApproval(approvalId, 'rejected');
  };

  const processApproval = async (approvalId, status) => {
    setProcessing(true);
    setError(null);
    try {
      await api.put(`/approvals/${approvalId}`, {
        status,
        comments: comment || (status === 'approved' ? 'Approved without comments' : '')
      });
      
      // Refresh approvals
      await fetchApprovals();
      if (user?.role === 'admin') {
        await fetchStats();
      }
      
      // Reset
      setSelectedDoc(null);
      setComment('');
      
      alert(`Document ${status} successfully!`);
    } catch (error) {
      console.error(`Error ${status} document:`, error);
      setError(error.response?.data?.message || `Error ${status} document`);
    } finally {
      setProcessing(false);
    }
  };

  const getStepLabel = (step) => {
    const labels = {
      1: 'Reviewer Approval',
      2: 'Manager Approval',
      3: 'Final Approval'
    };
    return labels[step] || `Step ${step}`;
  };

  // Safely filter approvals
  const filteredApprovals = Array.isArray(approvals) 
    ? approvals.filter(doc => {
        if (filter === 'all') return true;
        return doc?.current_step === parseInt(filter);
      })
    : [];

  // Show error state
  if (error) {
    return (
      <div className="approvals-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={fetchApprovals} className="btn-retry">
          Try Again
        </button>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="approvals-loading">
        <div className="spinner"></div>
        <p>Loading approvals...</p>
      </div>
    );
  }

  return (
    <div className="approvals-container">
      <div className="approvals-header">
        <div>
          <h2>Approvals</h2>
          <p className="approvals-subtitle">3-Step Approval Workflow</p>
        </div>
        
        {stats && user?.role === 'admin' && (
          <div className="stats-cards">
            <div className="stat-card">
              <span className="stat-label">Pending Step 1</span>
              <span className="stat-value">{stats.pending_step1 || 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Pending Step 2</span>
              <span className="stat-value">{stats.pending_step2 || 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Pending Step 3</span>
              <span className="stat-value">{stats.pending_step3 || 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Avg. Approval</span>
              <span className="stat-value">
                {stats.avg_approval_days ? Number(stats.avg_approval_days).toFixed(1) : '0'} days
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Only show filter if there are approvals */}
      {filteredApprovals.length > 0 && (
        <div className="filter-bar">
          <label>Filter by Step:</label>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All Steps</option>
            <option value="1">Step 1 - Reviewer</option>
            <option value="2">Step 2 - Manager</option>
            <option value="3">Step 3 - Final</option>
          </select>
        </div>
      )}

      {filteredApprovals.length === 0 ? (
        <div className="no-approvals">
          <p>No pending approvals</p>
          {user?.role === 'admin' && (
            <p className="no-approvals-sub">Upload a document to start the approval workflow</p>
          )}
        </div>
      ) : (
        <div className="approvals-list">
          {filteredApprovals.map(doc => (
            <div key={doc?.document_id || Math.random()} className="approval-card">
              <div className="approval-header">
                <span className={`step-badge step-${doc?.current_step || 1}`}>
                  {getStepLabel(doc?.current_step || 1)}
                </span>
                <span className="document-type">{doc?.document_type || 'document'}</span>
              </div>

              <div className="document-details">
                <h3>{doc?.filename || 'Untitled Document'}</h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <label>Invoice #</label>
                    <span>{doc?.invoice_number || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Vendor</label>
                    <span>{doc?.vendor_name || 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Amount</label>
                    <span>${doc?.amount || '0.00'}</span>
                  </div>
                  <div className="detail-item">
                    <label>VAT</label>
                    <span>${doc?.vat || '0.00'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Date</label>
                    <span>{doc?.date ? new Date(doc.date).toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Uploaded By</label>
                    <span>{doc?.uploaded_by || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {/* Safely render approval history */}
              {doc?.history && Array.isArray(doc.history) && doc.history.length > 0 && (
                <div className="approval-history">
                  <h4>Approval History</h4>
                  {doc.history.map((step, index) => (
                    <div key={index} className="history-item">
                      <span className={`history-status status-${step?.status || 'pending'}`}>
                        Step {step?.step || '?'}: {step?.status || 'pending'}
                      </span>
                      {step?.comments && (
                        <span className="history-comment">"{step.comments}"</span>
                      )}
                      <span className="history-approver">
                        by {step?.approver_name || 'Unknown'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {selectedDoc === doc?.document_id ? (
                <div className="approval-actions">
                  <textarea
                    placeholder="Add comments (required for rejection)"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows="3"
                  />
                  <div className="action-buttons">
                    <button
                      onClick={() => handleApprove(doc?.approval_id)}
                      disabled={processing}
                      className="btn-approve"
                    >
                      {processing ? 'Processing...' : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => handleReject(doc?.approval_id)}
                      disabled={processing}
                      className="btn-reject"
                    >
                      {processing ? 'Processing...' : '✗ Reject'}
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDoc(null);
                        setComment('');
                      }}
                      className="btn-cancel"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedDoc(doc?.document_id)}
                  className="btn-review"
                >
                  Review Document
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}