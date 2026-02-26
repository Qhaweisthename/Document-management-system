import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import AIInsightsDashboard from '../components/AIInsightsDashboard';
import './Reports.css';

export default function Reports() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [activeTab, setActiveTab] = useState('spend-summary');
  const [error, setError] = useState(null);
  const [apiError, setApiError] = useState(null);
  
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    vendorId: '',
    status: '',
    minAmount: '',
    maxAmount: ''
  });

  const { user } = useAuth();

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
      const response = await api.get('/reports/vendors');
      setVendors(response.data.vendors || []);
    } catch (error) {
      console.error('Error fetching vendors:', error);
    }
  };

  const handleFilterChange = (e) => {
    setFilters({
      ...filters,
      [e.target.name]: e.target.value
    });
  };

  const handleGenerateReport = async () => {
    setLoading(true);
    setError(null);
    setApiError(null);
    setReportData(null);
    
    try {
      console.log('Generating report with:', { reportType: activeTab, ...filters });
      
      const response = await api.post('/reports/generate', {
        reportType: activeTab,
        ...filters
      });
      
      console.log('Report response:', response.data);
      
      // Validate response data
      if (!response.data) {
        throw new Error('No data received from server');
      }
      
      // Ensure summary exists
      if (!response.data.summary) {
        response.data.summary = {};
      }
      
      // Ensure data exists
      if (!response.data.data) {
        response.data.data = [];
      }
      
      // Ensure insights exists
      if (!response.data.insights) {
        response.data.insights = {};
      }
      
      setReportData(response.data);
      
    } catch (error) {
      console.error('Error generating report:', error);
      
      // Handle different error types
      if (error.response) {
        // Server responded with error
        setApiError({
          status: error.response.status,
          message: error.response.data?.message || 'Server error',
          data: error.response.data
        });
      } else if (error.request) {
        // Request made but no response
        setApiError({
          status: 503,
          message: 'Cannot connect to server. Please check if backend is running.'
        });
      } else {
        // Something else happened
        setApiError({
          status: 500,
          message: error.message || 'Error generating report'
        });
      }
      
      setError(error.response?.data?.message || 'Error generating report');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format) => {
    try {
      if (!reportData) {
        alert('No report data to export');
        return;
      }
      
      const response = await api.post(`/reports/export/${format}`, {
        reportType: activeTab,
        data: reportData?.data || [],
        summary: reportData?.summary || {},
        filters: reportData?.filters || {},
        insights: reportData?.insights || {}
      }, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-${activeTab}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Error exporting report');
    }
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    // Round to 2 decimal places
    const roundedAmount = Math.round(amount * 100) / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(roundedAmount);
  };

  const formatNumber = (value) => {
    if (value === null || value === undefined) return '0';
    if (typeof value === 'number') {
      // Round to 2 decimal places
      return Math.round(value * 100) / 100;
    }
    return value;
  };

  const formatValue = (key, value) => {
    if (value === null || value === undefined) return 'N/A';
    
    // Handle numbers
    if (typeof value === 'number') {
      // Check if it's a currency field
      if (key.toLowerCase().includes('amount') || 
          key.toLowerCase().includes('total') || 
          key.toLowerCase().includes('vat') ||
          key.toLowerCase().includes('spend') ||
          key.toLowerCase().includes('price') ||
          key.toLowerCase().includes('cost')) {
        return formatCurrency(value);
      }
      
      // Check if it's a percentage
      if (key.toLowerCase().includes('rate') || 
          key.toLowerCase().includes('percentage') ||
          key.toLowerCase().includes('percent')) {
        return `${Math.round(value * 100) / 100}%`;
      }
      
      // Regular number
      return Math.round(value * 100) / 100;
    }
    
    // Handle objects
    if (typeof value === 'object') {
      // Recursively format object values
      const formatted = {};
      Object.entries(value).forEach(([k, v]) => {
        formatted[k] = formatValue(k, v);
      });
      return JSON.stringify(formatted);
    }
    
    // Handle strings and other types
    return String(value);
  };

  const tabs = [
    { id: 'spend-summary', label: 'Spend Summary', icon: '💰' },
    { id: 'vendor-analysis', label: 'Vendor Analysis', icon: '🏢' },
    { id: 'tax-vat-report', label: 'Tax/VAT Report', icon: '📊' },
    { id: 'approval-status', label: 'Approval Status', icon: '✅' }
  ];

  // Error UI
  if (apiError) {
    return (
      <div className="reports-container">
        <div className="reports-header">
          <h2>Reports & Analytics</h2>
          <p>Generate insights and analyze your document data</p>
        </div>
        
        <div className="reports-error-container">
          <div className="error-icon">⚠️</div>
          <h3>Failed to Generate Report</h3>
          <p className="error-message">{apiError.message}</p>
          {apiError.status === 503 && (
            <div className="error-details">
              <p>💡 Make sure your backend server is running at http://localhost:5000</p>
              <button 
                onClick={() => window.location.reload()} 
                className="btn-retry"
              >
                Refresh Page
              </button>
            </div>
          )}
          {apiError.data && (
            <pre className="error-data">
              {JSON.stringify(apiError.data, null, 2)}
            </pre>
          )}
          <button 
            onClick={() => {
              setApiError(null);
              setActiveTab('spend-summary');
            }} 
            className="btn-back"
          >
            ← Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      <div className="reports-header">
        <h2>Reports & Analytics</h2>
        <p>Generate insights and analyze your document data</p>
      </div>

      <div className="reports-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab.id);
              setReportData(null);
              setError(null);
            }}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="filters-section">
        <h3>Filters</h3>
        <div className="filters-grid">
          <div className="filter-group">
            <label>Start Date</label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
            />
          </div>

          <div className="filter-group">
            <label>End Date</label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
            />
          </div>

          <div className="filter-group">
            <label>Vendor</label>
            <select
              name="vendorId"
              value={filters.vendorId}
              onChange={handleFilterChange}
            >
              <option value="">All Vendors</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Status</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Min Amount</label>
            <input
              type="number"
              name="minAmount"
              value={filters.minAmount}
              onChange={handleFilterChange}
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>

          <div className="filter-group">
            <label>Max Amount</label>
            <input
              type="number"
              name="maxAmount"
              value={filters.maxAmount}
              onChange={handleFilterChange}
              placeholder="10000"
              min="0"
              step="0.01"
            />
          </div>
        </div>

        <div className="filter-actions">
          <button 
            onClick={handleGenerateReport} 
            className="btn-generate"
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="reports-error">
          ⚠️ {error}
        </div>
      )}

      {reportData && (
        <div className="report-results">
          {/* Summary Cards */}
          {reportData.summary && Object.keys(reportData.summary).length > 0 ? (
            <div className="summary-cards">
              {Object.entries(reportData.summary).map(([key, value]) => {
                if (value === null || value === undefined) return null;
                if (typeof value === 'object') return null;
                return (
                  <div key={key} className="summary-card">
                    <div className="summary-label">
                      {key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}
                    </div>
                    <div className="summary-value">
                      {formatValue(key, value)}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="no-summary">No summary data available</div>
          )}

          {/* AI Insights */}
          {reportData.insights && Object.keys(reportData.insights).length > 0 && (
            <AIInsightsDashboard reportData={reportData} />
          )}

          {/* Data Table */}
          {reportData.data && reportData.data.length > 0 ? (
            <div className="data-table-section">
              <h3>Detailed Data</h3>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      {Object.keys(reportData.data[0] || {}).map(key => (
                        <th key={key}>{key.replace(/_/g, ' ')}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.data.slice(0, 10).map((row, i) => (
                      <tr key={i}>
                        {Object.entries(row).map(([key, val], j) => (
                          <td key={j}>
                            {formatValue(key, val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportData.data.length > 10 && (
                  <p className="table-note">Showing 10 of {reportData.data.length} records</p>
                )}
              </div>
            </div>
          ) : (
            <div className="no-data">
              <p>No data available for the selected filters</p>
            </div>
          )}

          {/* Export Buttons */}
          {reportData.data && reportData.data.length > 0 && (
            <div className="export-actions">
              <button onClick={() => handleExport('excel')} className="btn-excel">
                📊 Export to Excel
              </button>
              <button onClick={() => handleExport('pdf')} className="btn-pdf">
                📄 Export to PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}