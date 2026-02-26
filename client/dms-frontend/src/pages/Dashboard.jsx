import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './Dashboard.css';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalDocs: 0,
    pending: 0,
    approved: 0,
    rejected: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { user } = useAuth();

  const api = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('token')}`
    }
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      // Fetch document statistics
      const statsResponse = await api.get('/dashboard/stats');
      setStats(statsResponse.data);
      
      // Fetch recent activity
      const activityResponse = await api.get('/dashboard/recent-activity');
      setRecentActivity(activityResponse.data.activities || []);
      
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
      return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }
  };

  const getActivityText = (activity) => {
    if (!activity) return 'Activity recorded';
    
    switch (activity.action) {
      case 'upload':
        return `Document ${activity.document_name || 'unknown'} was uploaded`;
      case 'approved':
        return `Document ${activity.document_name || 'unknown'} was approved`;
      case 'rejected':
        return `Document ${activity.document_name || 'unknown'} was rejected`;
      case 'pending':
        return `Document ${activity.document_name || 'unknown'} is pending review`;
      default:
        return activity.description || 'Activity recorded';
    }
  };

  const statCards = [
    { title: "Total Documents", value: stats.totalDocs, icon: "📄", color: "blue" },
    { title: "Pending", value: stats.pending, icon: "⏳", color: "yellow" },
    { title: "Approved", value: stats.approved, icon: "✅", color: "green" },
    { title: "Rejected", value: stats.rejected, icon: "❌", color: "red" },
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <h3>Error</h3>
        <p>{error}</p>
        <button onClick={fetchDashboardData} className="btn-retry">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="welcome-message">Welcome back, {user?.username || 'User'}!</p>
        </div>
        <div className="user-role-badge">
          {user?.role?.toUpperCase()}
        </div>
      </div>

      {/* Stats Cards Row */}
      <div className="stats-row">
        {statCards.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-card-inner">
              <div className="stat-icon-wrapper">
                <span className={`stat-icon ${stat.color}`}>{stat.icon}</span>
              </div>
              <div className="stat-details">
                <h3 className="stat-title">{stat.title}</h3>
                <div className="stat-value-large">{stat.value}</div>
                <div className="stat-progress">
                  <div className="progress-bar">
                    <div 
                      className={`progress-fill ${stat.color}`}
                      style={{ width: stats.totalDocs > 0 ? `${(stat.value / stats.totalDocs) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="stat-percentage">
                    {stats.totalDocs > 0 
                      ? `${((stat.value / stats.totalDocs) * 100).toFixed(1)}%`
                      : '0%'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="dashboard-two-column">
        {/* Left Column - Document Status */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>Document Status Overview</h2>
            <div className="legend">
              <div className="legend-item">
                <span className="legend-dot pending"></span>
                <span>Pending ({stats.pending})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot approved"></span>
                <span>Approved ({stats.approved})</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot rejected"></span>
                <span>Rejected ({stats.rejected})</span>
              </div>
            </div>
          </div>
          <div className="chart-container">
            <div className="status-bars">
              <div className="status-bar-item">
                <div className="bar-label">Pending</div>
                <div className="bar-wrapper">
                  <div 
                    className="bar-fill pending-bar" 
                    style={{ 
                      width: stats.totalDocs > 0 ? `${(stats.pending / stats.totalDocs) * 100}%` : '0%',
                      height: '24px'
                    }}
                  >
                    <span className="bar-value">{stats.pending}</span>
                  </div>
                </div>
              </div>
              <div className="status-bar-item">
                <div className="bar-label">Approved</div>
                <div className="bar-wrapper">
                  <div 
                    className="bar-fill approved-bar" 
                    style={{ 
                      width: stats.totalDocs > 0 ? `${(stats.approved / stats.totalDocs) * 100}%` : '0%',
                      height: '24px'
                    }}
                  >
                    <span className="bar-value">{stats.approved}</span>
                  </div>
                </div>
              </div>
              <div className="status-bar-item">
                <div className="bar-label">Rejected</div>
                <div className="bar-wrapper">
                  <div 
                    className="bar-fill rejected-bar" 
                    style={{ 
                      width: stats.totalDocs > 0 ? `${(stats.rejected / stats.totalDocs) * 100}%` : '0%',
                      height: '24px'
                    }}
                  >
                    <span className="bar-value">{stats.rejected}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Distribution */}
        <div className="dashboard-card">
          <div className="card-header">
            <h2>Distribution</h2>
          </div>
          <div className="distribution-container">
            <div className="distribution-item">
              <div className="distribution-label">
                <span className="dot pending"></span>
                <span>Pending</span>
              </div>
              <div className="distribution-values">
                <span className="distribution-count">{stats.pending}</span>
                <span className="distribution-percent">
                  ({stats.totalDocs > 0 ? ((stats.pending / stats.totalDocs) * 100).toFixed(1) : '0'}%)
                </span>
              </div>
            </div>
            <div className="distribution-item">
              <div className="distribution-label">
                <span className="dot approved"></span>
                <span>Approved</span>
              </div>
              <div className="distribution-values">
                <span className="distribution-count">{stats.approved}</span>
                <span className="distribution-percent">
                  ({stats.totalDocs > 0 ? ((stats.approved / stats.totalDocs) * 100).toFixed(1) : '0'}%)
                </span>
              </div>
            </div>
            <div className="distribution-item">
              <div className="distribution-label">
                <span className="dot rejected"></span>
                <span>Rejected</span>
              </div>
              <div className="distribution-values">
                <span className="distribution-count">{stats.rejected}</span>
                <span className="distribution-percent">
                  ({stats.totalDocs > 0 ? ((stats.rejected / stats.totalDocs) * 100).toFixed(1) : '0'}%)
                </span>
              </div>
            </div>
          </div>

          {/* Mini Pie Chart Representation */}
          <div className="mini-pie-container">
            <div className="pie-segment pending-segment" style={{ width: `${(stats.pending / stats.totalDocs) * 100}%` }}>
              <span className="segment-label">P</span>
            </div>
            <div className="pie-segment approved-segment" style={{ width: `${(stats.approved / stats.totalDocs) * 100}%` }}>
              <span className="segment-label">A</span>
            </div>
            <div className="pie-segment rejected-segment" style={{ width: `${(stats.rejected / stats.totalDocs) * 100}%` }}>
              <span className="segment-label">R</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity-card">
        <div className="card-header">
          <h2>Recent Activity</h2>
        </div>
        <div className="activity-list">
          {recentActivity.length > 0 ? (
            recentActivity.map((activity, index) => (
              <div key={index} className="activity-item">
                <div className="activity-content">
                  <span className={`activity-dot ${activity.action || 'info'}`}></span>
                  <span className="activity-text">{getActivityText(activity)}</span>
                </div>
                <span className="activity-time">{formatTimeAgo(activity.created_at)}</span>
              </div>
            ))
          ) : (
            <div className="no-activity">
              <p>No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}