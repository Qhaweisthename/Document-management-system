const pool = require('../config/db');

// Get AI insights dashboard data
const getInsightsDashboard = async (req, res) => {
  try {
    const insights = {
      trends: await getSpendingTrends(req.user.id),
      anomalies: await getAnomalies(req.user.id),
      vendors: await getVendorInsights(req.user.id),
      efficiency: await getApprovalEfficiency(req.user.id),
      predictions: await getPredictions(req.user.id),
      recommendations: await getRecommendations(req.user.id)
    };

    res.json(insights);
  } catch (error) {
    console.error('Error fetching insights:', error);
    res.status(500).json({ message: 'Error fetching insights' });
  }
};

// Spending Trends
const getSpendingTrends = async (userId) => {
  try {
    const result = await pool.query(`
      SELECT 
        TO_CHAR(date, 'Mon') as month,
        EXTRACT(MONTH FROM date) as month_num,
        SUM(amount) as total,
        COUNT(*) as count
      FROM documents
      WHERE created_by = $1 
        AND date >= NOW() - INTERVAL '6 months'
      GROUP BY month, month_num
      ORDER BY month_num
    `, [userId]);

    const trends = {
      labels: [],
      values: [],
      counts: []
    };

    result.rows.forEach(row => {
      trends.labels.push(row.month);
      trends.values.push(parseFloat(row.total || 0));
      trends.counts.push(parseInt(row.count || 0));
    });

    // Calculate percentage change
    let change = 0;
    if (trends.values.length >= 2) {
      const lastMonth = trends.values[trends.values.length - 1];
      const prevMonth = trends.values[trends.values.length - 2];
      if (prevMonth !== 0) {
        change = ((lastMonth - prevMonth) / prevMonth) * 100;
      }
    }

    return {
      monthly: trends,
      change: change.toFixed(1),
      insight: trends.values.length > 1 
        ? (change > 0 
            ? `Spending increased by ${change.toFixed(1)}% compared to last month`
            : `Spending decreased by ${Math.abs(change).toFixed(1)}% compared to last month`)
        : 'Insufficient data for trend analysis'
    };
  } catch (error) {
    console.error('Error getting spending trends:', error);
    return { 
      monthly: { labels: [], values: [], counts: [] }, 
      change: '0', 
      insight: 'No trend data available' 
    };
  }
};

// Fix for getAnomalies function
const getAnomalies = async (userId) => {
  try {
    const anomalies = [];

    // 1. Unusually large transactions (3x average)
    const avgResult = await pool.query(`
      SELECT AVG(amount) as avg_amount
      FROM documents
      WHERE created_by = $1
    `, [userId]);

    const avgAmount = parseFloat(avgResult.rows[0]?.avg_amount || 0);
    
    // FIX: Use numeric comparison instead of passing float to integer parameter
    const largeTxns = await pool.query(`
      SELECT 
        invoice_number,
        amount,
        vendor_id,
        date
      FROM documents
      WHERE created_by = $1 
        AND amount > $2::numeric * 3
      ORDER BY amount DESC
      LIMIT 5
    `, [userId, avgAmount]); // avgAmount is now passed as numeric, not integer

    if (largeTxns.rows.length > 0) {
      anomalies.push({
        type: 'large_transactions',
        count: largeTxns.rows.length,
        items: largeTxns.rows.map(t => ({
          invoice: t.invoice_number,
          amount: parseFloat(t.amount),
          date: t.date
        })),
        message: `${largeTxns.rows.length} unusually large transaction${largeTxns.rows.length > 1 ? 's' : ''} detected`
      });
    }

    // 2. Tax rate mismatches
    const taxAnomalies = await pool.query(`
      SELECT 
        d.invoice_number,
        d.amount,
        d.vat,
        (d.vat / NULLIF(d.amount, 0) * 100) as tax_rate,
        v.name as vendor_name
      FROM documents d
      JOIN vendors v ON d.vendor_id = v.id
      WHERE d.created_by = $1
        AND d.amount > 0
        AND ABS((d.vat / NULLIF(d.amount, 0) * 100) - 15) > 5
      LIMIT 5
    `, [userId]);

    if (taxAnomalies.rows.length > 0) {
      anomalies.push({
        type: 'tax_mismatch',
        count: taxAnomalies.rows.length,
        items: taxAnomalies.rows,
        message: `${taxAnomalies.rows.length} document${taxAnomalies.rows.length > 1 ? 's' : ''} with unusual tax rates`
      });
    }

    // 3. Duplicate detection (similar amounts, same vendor)
    // FIX: Use numeric comparison properly
    const duplicates = await pool.query(`
      SELECT 
        v.name as vendor_name,
        d1.invoice_number as invoice1,
        d2.invoice_number as invoice2,
        d1.amount,
        ABS(d1.amount - d2.amount) as difference
      FROM documents d1
      JOIN documents d2 ON d1.vendor_id = d2.vendor_id 
        AND d1.id < d2.id
        AND ABS(d1.amount - d2.amount) < 10
      JOIN vendors v ON d1.vendor_id = v.id
      WHERE d1.created_by = $1
      LIMIT 5
    `, [userId]);

    if (duplicates.rows.length > 0) {
      anomalies.push({
        type: 'potential_duplicates',
        count: duplicates.rows.length,
        items: duplicates.rows,
        message: `${duplicates.rows.length} potential duplicate document${duplicates.rows.length > 1 ? 's' : ''} found`
      });
    }

    return anomalies;
  } catch (error) {
    console.error('Error getting anomalies:', error);
    return [];
  }
};

// Vendor Insights
const getVendorInsights = async (userId) => {
  try {
    const result = await pool.query(`
      SELECT 
        v.name,
        COUNT(d.id) as document_count,
        SUM(d.amount) as total_spent,
        AVG(d.amount) as avg_amount,
        COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_count,
        COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_count
      FROM vendors v
      LEFT JOIN documents d ON v.id = d.vendor_id AND d.created_by = $1
      GROUP BY v.id, v.name
      HAVING COUNT(d.id) > 0
      ORDER BY total_spent DESC
    `, [userId]);

    const vendors = result.rows;
    
    // Find top vendor
    const topVendor = vendors.length > 0 ? vendors[0] : null;
    
    // Calculate new vendors this month
    const newVendors = await pool.query(`
      SELECT COUNT(*) as count
      FROM vendors
      WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
    `);

    return {
      total: vendors.length,
      topVendor: topVendor ? {
        name: topVendor.name,
        total: topVendor.total_spent,
        count: topVendor.document_count
      } : null,
      newThisMonth: parseInt(newVendors.rows[0]?.count || 0),
      list: vendors.slice(0, 5) // Top 5 vendors
    };
  } catch (error) {
    console.error('Error getting vendor insights:', error);
    return { total: 0, topVendor: null, newThisMonth: 0, list: [] };
  }
};

// Approval Efficiency
const getApprovalEfficiency = async (userId) => {
  try {
    // Average approval time
    const timeResult = await pool.query(`
      SELECT 
        AVG(EXTRACT(EPOCH FROM (d.updated_at - d.created_at))/86400) as avg_days,
        COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_count,
        COUNT(*) as total_count
      FROM documents d
      WHERE d.created_by = $1
        AND d.status IN ('approved', 'rejected')
    `, [userId]);

    const avgDays = timeResult.rows[0]?.avg_days || 0;
    const approved = parseInt(timeResult.rows[0]?.approved_count || 0);
    const total = parseInt(timeResult.rows[0]?.total_count || 1);
    const approvalRate = total > 0 ? (approved / total) * 100 : 0;

    // Current bottlenecks
    const bottlenecks = await pool.query(`
      SELECT 
        a.step,
        COUNT(*) as count
      FROM approvals a
      JOIN documents d ON a.document_id = d.id
      WHERE d.created_by = $1
        AND a.status = 'pending'
      GROUP BY a.step
      ORDER BY a.step
    `, [userId]);

    return {
      avgApprovalDays: avgDays ? parseFloat(avgDays).toFixed(1) : '0',
      approvalRate: approvalRate.toFixed(1),
      bottlenecks: bottlenecks.rows.map(b => ({
        step: b.step,
        count: parseInt(b.count)
      }))
    };
  } catch (error) {
    console.error('Error getting approval efficiency:', error);
    return { avgApprovalDays: '0', approvalRate: '0', bottlenecks: [] };
  }
};

// Predictions
const getPredictions = async (userId) => {
  try {
    // Simple linear regression for prediction
    const historical = await pool.query(`
      SELECT 
        EXTRACT(MONTH FROM date) as month,
        SUM(amount) as total
      FROM documents
      WHERE created_by = $1
        AND date >= NOW() - INTERVAL '6 months'
      GROUP BY month
      ORDER BY month
    `, [userId]);

    const values = historical.rows.map(r => parseFloat(r.total || 0));
    
    // Simple moving average prediction
    let nextMonth = 0;
    let trend = 'stable';
    
    if (values.length >= 3) {
      const last3Avg = (values[values.length - 1] + values[values.length - 2] + values[values.length - 3]) / 3;
      const prev3Avg = (values[values.length - 2] + values[values.length - 3] + values[values.length - 4]) / 3;
      
      nextMonth = last3Avg;
      if (prev3Avg !== 0) {
        const change = ((last3Avg - prev3Avg) / prev3Avg) * 100;
        
        if (change > 10) trend = 'increasing';
        else if (change < -10) trend = 'decreasing';
        else trend = 'stable';
      }
    }

    // Predict document count
    const countResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM documents
      WHERE created_by = $1
        AND date >= NOW() - INTERVAL '30 days'
    `, [userId]);

    const monthlyAvg = parseInt(countResult.rows[0]?.count || 0);
    const predictedDocs = Math.round(monthlyAvg * 1.1); // 10% growth projection

    return {
      nextMonthSpending: nextMonth ? `$${nextMonth.toFixed(2)}` : 'Insufficient data',
      trend: trend,
      predictedDocuments: predictedDocs || 0,
      confidence: values.length >= 6 ? 'high' : values.length >= 3 ? 'medium' : 'low'
    };
  } catch (error) {
    console.error('Error getting predictions:', error);
    return { 
      nextMonthSpending: 'Insufficient data', 
      trend: 'stable', 
      predictedDocuments: 0, 
      confidence: 'low' 
    };
  }
};

// Recommendations - FIXED division by zero errors
const getRecommendations = async (userId) => {
  try {
    const recommendations = [];

    // Check for vendors with high rejection rates - with safety check
    const vendorRejections = await pool.query(`
      SELECT 
        v.name,
        COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected,
        COUNT(*) as total
      FROM vendors v
      JOIN documents d ON v.id = d.vendor_id
      WHERE d.created_by = $1
      GROUP BY v.id, v.name
      HAVING COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) > 0
        AND COUNT(*) > 0
    `, [userId]);

    vendorRejections.rows.forEach(v => {
      // SAFETY CHECK: Ensure total > 0 before division
      if (v.total > 0) {
        const rejectionRate = (v.rejected / v.total) * 100;
        if (rejectionRate > 30) {
          recommendations.push({
            type: 'vendor_review',
            message: `Review vendor "${v.name}" - ${v.rejected}/${v.total} documents rejected (${Math.round(rejectionRate)}%)`
          });
        }
      }
    });

    // Check for approval bottlenecks
    const bottlenecks = await pool.query(`
      SELECT 
        a.step,
        COUNT(*) as count
      FROM approvals a
      JOIN documents d ON a.document_id = d.id
      WHERE d.created_by = $1
        AND a.status = 'pending'
        AND a.created_at < NOW() - INTERVAL '7 days'
      GROUP BY a.step
    `, [userId]);

    bottlenecks.rows.forEach(b => {
      const stepNames = { 1: 'Reviewer', 2: 'Manager', 3: 'Final' };
      recommendations.push({
        type: 'bottleneck',
        message: `${b.count} document${b.count > 1 ? 's are' : ' is'} stuck at ${stepNames[b.step] || 'Step ' + b.step} approval for over 7 days`
      });
    });

    // Check for tax inconsistencies - FIXED division by zero
    const taxIssues = await pool.query(`
      SELECT COUNT(*) as count
      FROM documents
      WHERE created_by = $1
        AND amount > 0
        AND ABS((vat / NULLIF(amount, 0) * 100) - 15) > 5
    `, [userId]);

    if (parseInt(taxIssues.rows[0]?.count || 0) > 0) {
      recommendations.push({
        type: 'tax_review',
        message: `${taxIssues.rows[0].count} documents have unusual tax rates - review for potential errors`
      });
    }

    // If no recommendations, add a default positive one
    if (recommendations.length === 0) {
      recommendations.push({
        type: 'all_good',
        message: 'All systems running smoothly! No issues detected.'
      });
    }

    return recommendations.slice(0, 5); // Return top 5 recommendations
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return [{ 
      type: 'info', 
      message: 'Unable to generate recommendations at this time' 
    }];
  }
};

module.exports = {
  getInsightsDashboard,
  getSpendingTrends,
  getAnomalies,
  getVendorInsights,
  getApprovalEfficiency,
  getPredictions,
  getRecommendations
};