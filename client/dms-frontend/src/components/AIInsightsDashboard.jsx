import { useState, useEffect } from 'react';
import axios from 'axios';
import './AIInsightsDashboard.css';

export default function AIInsightsDashboard({ reportData }) {
  const [expandedInsight, setExpandedInsight] = useState(null);
  
  // Ensure insights is always an object
  const insights = reportData?.insights || {};

  const getConfidenceBadge = (confidence) => {
    const badges = {
      high: { class: 'confidence-high', label: 'High Confidence' },
      medium: { class: 'confidence-medium', label: 'Medium Confidence' },
      low: { class: 'confidence-low', label: 'Low Confidence' }
    };
    const badge = badges[confidence] || badges.medium;
    return <span className={`confidence-badge ${badge.class}`}>{badge.label}</span>;
  };

  const getSeverityBadge = (severity) => {
    const badges = {
      high: { class: 'severity-high', label: '⚠️ High Risk' },
      medium: { class: 'severity-medium', label: '⚠️ Medium Risk' },
      low: { class: 'severity-low', label: 'ℹ️ Info' }
    };
    const badge = badges[severity] || badges.low;
    return <span className={`severity-badge ${badge.class}`}>{badge.label}</span>;
  };

  // Check if there are any insights
  const hasInsights = insights && Object.keys(insights).some(key => 
    Array.isArray(insights[key]) && insights[key].length > 0
  );

  if (!hasInsights) {
    return (
      <div className="ai-insights-empty">
        <div className="ai-icon">🤖</div>
        <h3>No Insights Available</h3>
        <p>Generate more data to see AI-powered insights</p>
      </div>
    );
  }

  return (
    <div className="ai-insights-dashboard">
      <div className="insights-header">
        <h2>
          <span className="ai-icon">🤖</span>
          AI-Powered Real Insights
        </h2>
        <p className="insights-subtitle">
          Based on actual statistical analysis of your data
        </p>
      </div>

      <div className="insights-grid">
        {/* Trends */}
        {insights.trends?.length > 0 && (
          <div className="insight-category trends">
            <h3>
              <span className="category-icon">📈</span>
              Trends & Patterns
              <span className="category-count">{insights.trends.length}</span>
            </h3>
            <div className="insight-list">
              {insights.trends.map((trend, index) => (
                <div 
                  key={index} 
                  className={`insight-item ${expandedInsight === `trend-${index}` ? 'expanded' : ''}`}
                  onClick={() => setExpandedInsight(expandedInsight === `trend-${index}` ? null : `trend-${index}`)}
                >
                  <div className="insight-header">
                    <span className="insight-message">{trend.message}</span>
                    {trend.confidence && getConfidenceBadge(trend.confidence)}
                  </div>
                  {expandedInsight === `trend-${index}` && trend.data && (
                    <div className="insight-details">
                      <pre>{JSON.stringify(trend.data, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Anomalies */}
        {insights.anomalies?.length > 0 && (
          <div className="insight-category anomalies">
            <h3>
              <span className="category-icon">⚠️</span>
              Detected Anomalies
              <span className="category-count">{insights.anomalies.length}</span>
            </h3>
            <div className="insight-list">
              {insights.anomalies.map((anomaly, index) => (
                <div 
                  key={index} 
                  className={`insight-item ${expandedInsight === `anomaly-${index}` ? 'expanded' : ''}`}
                  onClick={() => setExpandedInsight(expandedInsight === `anomaly-${index}` ? null : `anomaly-${index}`)}
                >
                  <div className="insight-header">
                    <span className="insight-message">{anomaly.message}</span>
                    {anomaly.severity && getSeverityBadge(anomaly.severity)}
                  </div>
                  {expandedInsight === `anomaly-${index}` && (
                    <div className="insight-details">
                      {anomaly.vendors && (
                        <div className="detail-list">
                          <strong>Affected Vendors:</strong>
                          <ul>
                            {anomaly.vendors.map((v, i) => (
                              <li key={i}>{v}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {anomaly.documents && (
                        <div className="detail-list">
                          <strong>Affected Documents:</strong>
                          <ul>
                            {anomaly.documents.map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {anomaly.details && (
                        <div className="detail-json">
                          <pre>{JSON.stringify(anomaly.details, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Predictions */}
        {insights.predictions?.length > 0 && (
          <div className="insight-category predictions">
            <h3>
              <span className="category-icon">🔮</span>
              Predictions & Forecasts
              <span className="category-count">{insights.predictions.length}</span>
            </h3>
            <div className="insight-list">
              {insights.predictions.map((pred, index) => (
                <div 
                  key={index} 
                  className={`insight-item ${expandedInsight === `pred-${index}` ? 'expanded' : ''}`}
                  onClick={() => setExpandedInsight(expandedInsight === `pred-${index}` ? null : `pred-${index}`)}
                >
                  <div className="insight-header">
                    <span className="insight-message">{pred.message}</span>
                    {pred.confidence && getConfidenceBadge(pred.confidence)}
                  </div>
                  {expandedInsight === `pred-${index}` && pred.values && (
                    <div className="insight-details">
                      <div className="prediction-chart">
                        {pred.values.map((val, i) => (
                          <div key={i} className="prediction-bar">
                            <div 
                              className="bar-fill"
                              style={{ height: `${(val / Math.max(...pred.values)) * 100}%` }}
                            />
                            <span className="bar-label">Month {i + 1}</span>
                            <span className="bar-value">${parseFloat(val).toFixed(0)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Risks */}
        {insights.risks?.length > 0 && (
          <div className="insight-category risks">
            <h3>
              <span className="category-icon">⚠️</span>
              Risk Assessment
              <span className="category-count">{insights.risks.length}</span>
            </h3>
            <div className="insight-list">
              {insights.risks.map((risk, index) => (
                <div 
                  key={index} 
                  className={`insight-item ${expandedInsight === `risk-${index}` ? 'expanded' : ''}`}
                  onClick={() => setExpandedInsight(expandedInsight === `risk-${index}` ? null : `risk-${index}`)}
                >
                  <div className="insight-header">
                    <span className="insight-message">{risk.message}</span>
                    {risk.severity && getSeverityBadge(risk.severity)}
                  </div>
                  {expandedInsight === `risk-${index}` && risk.recommendation && (
                    <div className="insight-details">
                      <div className="recommendation">
                        <strong>Recommendation:</strong>
                        <p>{risk.recommendation}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Patterns */}
        {insights.patterns?.length > 0 && (
          <div className="insight-category patterns">
            <h3>
              <span className="category-icon">🔄</span>
              Behavioral Patterns
              <span className="category-count">{insights.patterns.length}</span>
            </h3>
            <div className="insight-list">
              {insights.patterns.map((pattern, index) => (
                <div key={index} className="insight-item">
                  <div className="insight-header">
                    <span className="insight-message">{pattern.message}</span>
                    {pattern.confidence && getConfidenceBadge(pattern.confidence)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="insights-footer">
        <p>
          <span className="footer-icon">🧠</span>
          Insights generated using statistical analysis: Moving averages, Z-score anomaly detection, 
          Exponential smoothing, and Correlation analysis
        </p>
      </div>
    </div>
  );
}