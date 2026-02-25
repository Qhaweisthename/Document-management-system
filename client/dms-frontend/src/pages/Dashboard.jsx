export default function Dashboard() {
  const totalDocs = 47;
  const pending = 12;
  const approved = 30;
  const rejected = 5;

  const stats = [
    { title: "Total Documents", value: totalDocs, icon: "📄", color: "blue" },
    { title: "Pending", value: pending, icon: "⏳", color: "yellow" },
    { title: "Approved", value: approved, icon: "✅", color: "green" },
    { title: "Rejected", value: rejected, icon: "❌", color: "red" },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="last-updated">
          Last updated: <span>{new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="cards-grid">
        {stats.map((stat, index) => (
          <div key={index} className="stat-card">
            <div className="stat-card-content">
              <div className="stat-card-info">
                <h3>{stat.title}</h3>
                <div className="stat-value">{stat.value}</div>
              </div>
              <div className={`stat-icon ${stat.color}`}>
                {stat.icon}
              </div>
            </div>
            <div className="stat-progress">
              <div className="progress-bar">
                <div 
                  className={`progress-fill ${stat.color}`}
                  style={{ width: `${(stat.value / totalDocs) * 100}%` }}
                />
              </div>
              <div className="stat-percentage">
                {((stat.value / totalDocs) * 100).toFixed(1)}% of total
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="charts-section">
        {/* Bar Chart */}
        <div className="chart-container">
          <div className="chart-header">
            <h3>Document Status Overview</h3>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-color yellow"></span>
                <span>Pending</span>
              </div>
              <div className="legend-item">
                <span className="legend-color green"></span>
                <span>Approved</span>
              </div>
              <div className="legend-item">
                <span className="legend-color red"></span>
                <span>Rejected</span>
              </div>
            </div>
          </div>
          
          <div className="simple-bar-chart">
            <div className="bar-item">
              <div className="bar yellow" style={{ height: '60px' }}></div>
              <span className="bar-label">Pending (12)</span>
            </div>
            <div className="bar-item">
              <div className="bar green" style={{ height: '150px' }}></div>
              <span className="bar-label">Approved (30)</span>
            </div>
            <div className="bar-item">
              <div className="bar red" style={{ height: '25px' }}></div>
              <span className="bar-label">Rejected (5)</span>
            </div>
          </div>
        </div>

        {/* Distribution */}
        <div className="chart-container">
          <h3 style={{ marginBottom: '16px' }}>Distribution</h3>
          <div className="distribution-list">
            <div className="distribution-item">
              <div className="distribution-info">
                <span className="distribution-dot yellow"></span>
                <span className="distribution-label">Pending</span>
              </div>
              <div>
                <span className="distribution-value">12</span>
                <span className="distribution-percent">(25.5%)</span>
              </div>
            </div>
            <div className="distribution-item">
              <div className="distribution-info">
                <span className="distribution-dot green"></span>
                <span className="distribution-label">Approved</span>
              </div>
              <div>
                <span className="distribution-value">30</span>
                <span className="distribution-percent">(63.8%)</span>
              </div>
            </div>
            <div className="distribution-item">
              <div className="distribution-info">
                <span className="distribution-dot red"></span>
                <span className="distribution-label">Rejected</span>
              </div>
              <div>
                <span className="distribution-value">5</span>
                <span className="distribution-percent">(10.7%)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity">
        <h3>Recent Activity</h3>
        <div className="activity-list">
          <div className="activity-item">
            <div className="activity-info">
              <span className="activity-dot"></span>
              <span className="activity-text">Document Q4-2023-1.pdf was approved</span>
            </div>
            <span className="activity-time">2 hours ago</span>
          </div>
          <div className="activity-item">
            <div className="activity-info">
              <span className="activity-dot"></span>
              <span className="activity-text">Document Q4-2023-2.pdf is pending review</span>
            </div>
            <span className="activity-time">5 hours ago</span>
          </div>
          <div className="activity-item">
            <div className="activity-info">
              <span className="activity-dot"></span>
              <span className="activity-text">Document Q4-2023-3.pdf was uploaded</span>
            </div>
            <span className="activity-time">1 day ago</span>
          </div>
        </div>
      </div>
    </div>
  );
}