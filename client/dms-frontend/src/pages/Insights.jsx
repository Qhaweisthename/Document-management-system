import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/authContext';
import './Insights.css';

export default function Insights() {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const api = axios.create({
    baseURL: `${import.meta.env.VITE_API_URL}/api`,
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/insights/dashboard');
      setInsights(response.data);
    } catch (error) {
      console.error('Error fetching insights:', error);
      setError('Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="insights-loading">
        <div className="spinner"></div>
        <p>Loading AI Insights...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="insights-error">
        <h3>Unable to Load Insights</h3>
        <p>{error}</p>
        <button onClick={fetchInsights} className="btn-retry">
          Try Again
        </button>
      </div>
    );
  }

  // Calculate total spent
  const totalSpent = insights?.trends?.monthly?.values?.reduce((a, b) => a + b, 0) || 0;
  const anomalyCount = insights?.anomalies?.reduce((sum, a) => sum + (a.count || 0), 0) || 0;

  return (
    <div className="insights-container">
      {/* Header */}
      <div className="insights-header">
        <h2>AI Insights Dashboard</h2>
        <p>Real-time analytics and intelligent recommendations based on your document data</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">💰</div>
          <div className="kpi-content">
            <div className="kpi-label">Total Spent</div>
            <div className="kpi-value">{formatCurrency(totalSpent)}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">📄</div>
          <div className="kpi-content">
            <div className="kpi-label">Documents</div>
            <div className="kpi-value">{insights?.trends?.monthly?.values?.length || 0}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">🏢</div>
          <div className="kpi-content">
            <div className="kpi-label">Vendors</div>
            <div className="kpi-value">{insights?.vendors?.total || 0}</div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-icon">⚠️</div>
          <div className="kpi-content">
            <div className="kpi-label">Anomalies</div>
            <div className="kpi-value">{anomalyCount}</div>
          </div>
        </div>
      </div>

      {/* Main Content Row */}
      <div className="insights-row">
        {/* Spending Trends - Left Column */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">📈</span>
            <h3>Spending Trends</h3>
            <span className="header-badge">Last 6 months</span>
          </div>
          <div className="insight-card-content">
            <div className="trends-container">
              <div className="chart-container">
                {insights?.trends?.monthly?.values?.map((value, index) => {
                  const maxValue = Math.max(...(insights.trends.monthly.values || [1]));
                  const height = (value / maxValue) * 150;
                  return (
                    <div key={index} className="chart-bar-wrapper">
                      <div 
                        className="chart-bar" 
                        style={{ height: `${Math.max(30, height)}px` }}
                      >
                        <span className="bar-tooltip">{formatCurrency(value)}</span>
                      </div>
                      <span className="bar-label">{insights.trends.monthly.labels[index]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="trend-insight">
                <span>💡</span>
                <span>{insights?.trends?.insight || 'No trend data available'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Anomalies & Vendors */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">⚠️</span>
            <h3>Anomalies Detected</h3>
            <span className="header-badge">{anomalyCount}</span>
          </div>
          <div className="insight-card-content">
            {insights?.anomalies?.length > 0 ? (
              <div className="anomalies-list">
                {insights.anomalies.map((anomaly, index) => (
                  <div key={index} className="anomaly-item">
                    <span className="anomaly-icon">🚨</span>
                    <div className="anomaly-content">
                      <div className="anomaly-title">
                        {anomaly.message}
                        {anomaly.count > 0 && (
                          <span className="anomaly-badge">{anomaly.count}</span>
                        )}
                      </div>
                      {anomaly.items && (
                        <div className="anomaly-desc">
                          {anomaly.items.length} affected items
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>✓ No anomalies detected. Your documents look clean!</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Three Column Row */}
      <div className="insights-row three-col">
        {/* Vendor Insights */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">🏢</span>
            <h3>Top Vendors</h3>
            <span className="header-badge">{insights?.vendors?.total || 0} total</span>
          </div>
          <div className="insight-card-content">
            <div className="vendors-list">
              {insights?.vendors?.list?.map((vendor, index) => (
                <div key={index} className="vendor-item">
                  <div className="vendor-rank">#{index + 1}</div>
                  <div className="vendor-info">
                    <div className="vendor-name">{vendor.name}</div>
                    <div className="vendor-meta">{vendor.document_count} documents</div>
                  </div>
                  <div className="vendor-amount">{formatCurrency(vendor.total_spent)}</div>
                </div>
              ))}
              {(!insights?.vendors?.list || insights.vendors.list.length === 0) && (
                <div className="empty-state">No vendor data available</div>
              )}
            </div>
          </div>
        </div>

        {/* Approval Efficiency */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">✅</span>
            <h3>Approval Efficiency</h3>
          </div>
          <div className="insight-card-content">
            <div className="approval-metrics">
              <div className="metric-item">
                <div className="metric-header">
                  <span>Avg. Approval Time</span>
                  <span className="metric-value">{insights?.efficiency?.avgApprovalDays || '0'} days</span>
                </div>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${Math.min(100, (parseFloat(insights?.efficiency?.avgApprovalDays || 0) / 7) * 100)}%` }} />
                </div>
              </div>
              
              <div className="metric-item">
                <div className="metric-header">
                  <span>Approval Rate</span>
                  <span className="metric-value">{insights?.efficiency?.approvalRate || '0'}%</span>
                </div>
                <div className="metric-bar">
                  <div className="metric-fill" style={{ width: `${insights?.efficiency?.approvalRate || 0}%` }} />
                </div>
              </div>

              {insights?.efficiency?.bottlenecks?.map((bottleneck, index) => (
                <div key={index} className="bottleneck-tag">
                  <span>⚠️</span>
                  <span>{bottleneck.count} document{bottleneck.count > 1 ? 's' : ''} stuck at Step {bottleneck.step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">📊</span>
            <h3>Quick Stats</h3>
          </div>
          <div className="insight-card-content">
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{insights?.vendors?.newThisMonth || 0}</div>
                <div className="stat-label">New Vendors</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{insights?.predictions?.predictedDocuments || 0}</div>
                <div className="stat-label">Expected Docs</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{insights?.vendors?.topVendor ? '⭐' : '0'}</div>
                <div className="stat-label">Top Performer</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{insights?.trends?.change || '0'}%</div>
                <div className="stat-label">Monthly Change</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row - Predictions & Recommendations */}
      <div className="insights-row">
        {/* Predictions */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">🔮</span>
            <h3>Predictions & Forecasts</h3>
          </div>
          <div className="insight-card-content">
            <div className="predictions-grid">
              <div className="prediction-card">
                <div className="prediction-label">Next Month Spending</div>
                <div className="prediction-value">{insights?.predictions?.nextMonthSpending || 'N/A'}</div>
                <div className={`prediction-trend ${insights?.predictions?.trend || 'steady'}`}>
                  {insights?.predictions?.trend === 'increasing' ? '↑ Increasing' : 
                   insights?.predictions?.trend === 'decreasing' ? '↓ Decreasing' : '→ Stable'}
                </div>
              </div>
              <div className="prediction-card">
                <div className="prediction-label">Expected Documents</div>
                <div className="prediction-value">{insights?.predictions?.predictedDocuments || 0}</div>
                <div className="confidence-badge">
                  {insights?.predictions?.confidence || 'medium'} confidence
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="insight-card">
          <div className="insight-card-header">
            <span className="header-icon">💡</span>
            <h3>Recommendations</h3>
            <span className="header-badge">{insights?.recommendations?.length || 0}</span>
          </div>
          <div className="insight-card-content">
            <div className="recommendations-list">
              {insights?.recommendations?.map((rec, index) => (
                <div key={index} className={`recommendation-item ${rec.type || 'info'}`}>
                  <span className="recommendation-icon">
                    {rec.type === 'vendor_review' ? '🏢' : 
                     rec.type === 'bottleneck' ? '⏳' : 
                     rec.type === 'tax_review' ? '💰' : '💡'}
                  </span>
                  <div className="recommendation-content">
                    <div className="recommendation-text">{rec.message}</div>
                    {rec.type !== 'all_good' && (
                      <span className="recommendation-action">Take action →</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}