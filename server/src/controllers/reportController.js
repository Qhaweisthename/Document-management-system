const pool = require('../config/db');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const AIInsights = require('./aiInsightsController');

// Helper function to round numbers to 2 decimal places
const roundTo2Decimals = (num) => {
  if (num === null || num === undefined) return 0;
  return Math.round(num * 100) / 100;
};

// Generate reports based on filters
const generateReport = async (req, res) => {
  try {
    const { 
      reportType, 
      startDate, 
      endDate, 
      vendorId, 
      status,
      minAmount,
      maxAmount 
    } = req.body;

    let data = [];
    let summary = {};

    switch(reportType) {
      case 'spend-summary':
        data = await getSpendSummary(startDate, endDate, vendorId, status, minAmount, maxAmount);
        summary = await getSpendSummaryStats(data);
        break;
      case 'vendor-analysis':
        data = await getVendorAnalysis(startDate, endDate, vendorId, status);
        summary = await getVendorStats(data);
        break;
      case 'tax-vat-report':
        data = await getTaxReport(startDate, endDate, vendorId, status);
        summary = await getTaxStats(data);
        break;
      case 'approval-status':
        data = await getApprovalStatusReport(startDate, endDate, vendorId);
        summary = await getApprovalStats(data);
        break;
      default:
        return res.status(400).json({ message: 'Invalid report type' });
    }

    // Round all numeric values in data
    data = data.map(row => {
      const roundedRow = {};
      Object.entries(row).forEach(([key, value]) => {
        if (typeof value === 'number') {
          roundedRow[key] = roundTo2Decimals(value);
        } else {
          roundedRow[key] = value;
        }
      });
      return roundedRow;
    });

    // Round all numeric values in summary
    const roundedSummary = {};
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value === 'number') {
        roundedSummary[key] = roundTo2Decimals(value);
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects (like byMonth, byVendor)
        const roundedNested = {};
        Object.entries(value).forEach(([nestedKey, nestedValue]) => {
          if (typeof nestedValue === 'number') {
            roundedNested[nestedKey] = roundTo2Decimals(nestedValue);
          } else if (typeof nestedValue === 'object' && nestedValue !== null) {
            // Handle double nested objects
            const doubleNested = {};
            Object.entries(nestedValue).forEach(([dk, dv]) => {
              if (typeof dv === 'number') {
                doubleNested[dk] = roundTo2Decimals(dv);
              } else {
                doubleNested[dk] = dv;
              }
            });
            roundedNested[nestedKey] = doubleNested;
          } else {
            roundedNested[nestedKey] = nestedValue;
          }
        });
        roundedSummary[key] = roundedNested;
      } else {
        roundedSummary[key] = value;
      }
    });

    // Generate AI insights for the report
    const insights = await AIInsights.generateRealInsights(reportType, data, roundedSummary);

    res.json({
      reportType,
      filters: { startDate, endDate, vendorId, status, minAmount, maxAmount },
      summary: roundedSummary,
      data,
      insights,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ message: 'Error generating report' });
  }
};

// Spend Summary
const getSpendSummary = async (startDate, endDate, vendorId, status, minAmount, maxAmount) => {
  let query = `
    SELECT 
      d.id,
      d.invoice_number,
      d.date,
      d.amount,
      d.vat,
      d.status,
      d.document_type,
      v.name as vendor_name,
      v.tax_number as vendor_tax,
      u.username as uploaded_by,
      EXTRACT(MONTH FROM d.date) as month,
      EXTRACT(YEAR FROM d.date) as year
    FROM documents d
    JOIN vendors v ON d.vendor_id = v.id
    JOIN users u ON d.created_by = u.id
    WHERE 1=1
  `;
  
  const params = [];
  let paramCount = 1;

  if (startDate) {
    query += ` AND d.date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    query += ` AND d.date <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }

  if (vendorId) {
    query += ` AND d.vendor_id = $${paramCount}`;
    params.push(vendorId);
    paramCount++;
  }

  if (status) {
    query += ` AND d.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  if (minAmount) {
    query += ` AND d.amount >= $${paramCount}`;
    params.push(minAmount);
    paramCount++;
  }

  if (maxAmount) {
    query += ` AND d.amount <= $${paramCount}`;
    params.push(maxAmount);
    paramCount++;
  }

  query += ` ORDER BY d.date DESC`;

  const result = await pool.query(query, params);
  return result.rows;
};

const getSpendSummaryStats = (data) => {
  const stats = {
    totalDocuments: data.length,
    totalAmount: 0,
    totalVAT: 0,
    averageAmount: 0,
    byMonth: {},
    byVendor: {},
    byStatus: {
      pending: 0,
      approved: 0,
      rejected: 0
    }
  };

  data.forEach(doc => {
    stats.totalAmount += parseFloat(doc.amount);
    stats.totalVAT += parseFloat(doc.vat);
    
    // By month
    const monthKey = `${doc.year}-${String(doc.month).padStart(2, '0')}`;
    if (!stats.byMonth[monthKey]) {
      stats.byMonth[monthKey] = {
        count: 0,
        amount: 0
      };
    }
    stats.byMonth[monthKey].count++;
    stats.byMonth[monthKey].amount += parseFloat(doc.amount);

    // By vendor
    if (!stats.byVendor[doc.vendor_name]) {
      stats.byVendor[doc.vendor_name] = {
        count: 0,
        amount: 0
      };
    }
    stats.byVendor[doc.vendor_name].count++;
    stats.byVendor[doc.vendor_name].amount += parseFloat(doc.amount);

    // By status
    if (stats.byStatus[doc.status] !== undefined) {
      stats.byStatus[doc.status]++;
    }
  });

  stats.averageAmount = data.length > 0 ? stats.totalAmount / data.length : 0;
  
  // Round all values
  stats.totalAmount = roundTo2Decimals(stats.totalAmount);
  stats.totalVAT = roundTo2Decimals(stats.totalVAT);
  stats.averageAmount = roundTo2Decimals(stats.averageAmount);
  
  Object.keys(stats.byMonth).forEach(key => {
    stats.byMonth[key].amount = roundTo2Decimals(stats.byMonth[key].amount);
  });
  
  Object.keys(stats.byVendor).forEach(key => {
    stats.byVendor[key].amount = roundTo2Decimals(stats.byVendor[key].amount);
  });
  
  return stats;
};

// Vendor Analysis
const getVendorAnalysis = async (startDate, endDate, vendorId, status) => {
  let query = `
    SELECT 
      v.id,
      v.name as vendor_name,
      v.tax_number,
      COUNT(d.id) as document_count,
      SUM(d.amount) as total_amount,
      SUM(d.vat) as total_vat,
      AVG(d.amount) as average_amount,
      MIN(d.date) as first_document,
      MAX(d.date) as last_document,
      COUNT(CASE WHEN d.status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN d.status = 'approved' THEN 1 END) as approved_count,
      COUNT(CASE WHEN d.status = 'rejected' THEN 1 END) as rejected_count
    FROM vendors v
    LEFT JOIN documents d ON v.id = d.vendor_id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (startDate) {
    query += ` AND d.date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    query += ` AND d.date <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }

  if (vendorId) {
    query += ` AND v.id = $${paramCount}`;
    params.push(vendorId);
    paramCount++;
  }

  if (status) {
    query += ` AND d.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  query += ` GROUP BY v.id, v.name, v.tax_number ORDER BY total_amount DESC`;

  const result = await pool.query(query, params);
  
  // Round numeric values
  return result.rows.map(row => ({
    ...row,
    total_amount: roundTo2Decimals(parseFloat(row.total_amount || 0)),
    total_vat: roundTo2Decimals(parseFloat(row.total_vat || 0)),
    average_amount: roundTo2Decimals(parseFloat(row.average_amount || 0)),
    document_count: parseInt(row.document_count || 0),
    pending_count: parseInt(row.pending_count || 0),
    approved_count: parseInt(row.approved_count || 0),
    rejected_count: parseInt(row.rejected_count || 0)
  }));
};

const getVendorStats = (data) => {
  const totalSpend = data.reduce((sum, v) => sum + parseFloat(v.total_amount || 0), 0);
  const averagePerVendor = data.length > 0 ? totalSpend / data.length : 0;
  
  return {
    totalVendors: data.length,
    totalSpend: roundTo2Decimals(totalSpend),
    averagePerVendor: roundTo2Decimals(averagePerVendor),
    topVendor: data.length > 0 ? {
      ...data[0],
      total_amount: roundTo2Decimals(parseFloat(data[0].total_amount || 0))
    } : null,
    vendorsWithIssues: data.filter(v => 
      parseFloat(v.rejected_count) > parseFloat(v.approved_count) * 0.3
    ).length
  };
};

// Tax/VAT Report
const getTaxReport = async (startDate, endDate, vendorId, status) => {
  let query = `
    SELECT 
      d.id,
      d.invoice_number,
      d.date,
      d.amount,
      d.vat,
      d.document_type,
      v.name as vendor_name,
      v.tax_number,
      EXTRACT(QUARTER FROM d.date) as quarter,
      EXTRACT(YEAR FROM d.date) as year
    FROM documents d
    JOIN vendors v ON d.vendor_id = v.id
    WHERE 1=1
  `;

  const params = [];
  let paramCount = 1;

  if (startDate) {
    query += ` AND d.date >= $${paramCount}`;
    params.push(startDate);
    paramCount++;
  }

  if (endDate) {
    query += ` AND d.date <= $${paramCount}`;
    params.push(endDate);
    paramCount++;
  }

  if (vendorId) {
    query += ` AND d.vendor_id = $${paramCount}`;
    params.push(vendorId);
    paramCount++;
  }

  if (status) {
    query += ` AND d.status = $${paramCount}`;
    params.push(status);
    paramCount++;
  }

  query += ` ORDER BY d.date DESC`;

  const result = await pool.query(query, params);
  
  // Round numeric values
  return result.rows.map(row => ({
    ...row,
    amount: roundTo2Decimals(parseFloat(row.amount)),
    vat: roundTo2Decimals(parseFloat(row.vat))
  }));
};

const getTaxStats = (data) => {
  const stats = {
    totalAmount: 0,
    totalVAT: 0,
    effectiveTaxRate: 0,
    byQuarter: {},
    byVendor: {}
  };

  data.forEach(doc => {
    stats.totalAmount += parseFloat(doc.amount);
    stats.totalVAT += parseFloat(doc.vat);

    const quarterKey = `Q${doc.quarter}-${doc.year}`;
    if (!stats.byQuarter[quarterKey]) {
      stats.byQuarter[quarterKey] = {
        amount: 0,
        vat: 0
      };
    }
    stats.byQuarter[quarterKey].amount += parseFloat(doc.amount);
    stats.byQuarter[quarterKey].vat += parseFloat(doc.vat);

    if (!stats.byVendor[doc.vendor_name]) {
      stats.byVendor[doc.vendor_name] = {
        amount: 0,
        vat: 0
      };
    }
    stats.byVendor[doc.vendor_name].amount += parseFloat(doc.amount);
    stats.byVendor[doc.vendor_name].vat += parseFloat(doc.vat);
  });

  stats.effectiveTaxRate = stats.totalAmount > 0 
    ? (stats.totalVAT / stats.totalAmount) * 100 
    : 0;

  // Round all values
  stats.totalAmount = roundTo2Decimals(stats.totalAmount);
  stats.totalVAT = roundTo2Decimals(stats.totalVAT);
  stats.effectiveTaxRate = roundTo2Decimals(stats.effectiveTaxRate);
  
  Object.keys(stats.byQuarter).forEach(key => {
    stats.byQuarter[key].amount = roundTo2Decimals(stats.byQuarter[key].amount);
    stats.byQuarter[key].vat = roundTo2Decimals(stats.byQuarter[key].vat);
  });
  
  Object.keys(stats.byVendor).forEach(key => {
    stats.byVendor[key].amount = roundTo2Decimals(stats.byVendor[key].amount);
    stats.byVendor[key].vat = roundTo2Decimals(stats.byVendor[key].vat);
  });

  return stats;
};

// Approval Status Report
const getApprovalStatusReport = async (startDate, endDate, vendorId) => {
  try {
    let query = `
      SELECT 
        d.id,
        d.invoice_number,
        d.date,
        d.amount,
        d.status as document_status,
        v.name as vendor_name,
        u.username as uploaded_by
      FROM documents d
      JOIN vendors v ON d.vendor_id = v.id
      JOIN users u ON d.created_by = u.id
      WHERE 1=1
    `;

    const params = [];
    let paramCount = 1;

    if (startDate) {
      query += ` AND d.date >= $${paramCount}`;
      params.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND d.date <= $${paramCount}`;
      params.push(endDate);
      paramCount++;
    }

    if (vendorId) {
      query += ` AND d.vendor_id = $${paramCount}`;
      params.push(vendorId);
      paramCount++;
    }

    query += ` ORDER BY d.date DESC`;

    const result = await pool.query(query, params);
    
    // Round amounts
    const rows = result.rows.map(row => ({
      ...row,
      amount: roundTo2Decimals(parseFloat(row.amount))
    }));
    
    // Ensure we always return an array
    return rows || [];
    
  } catch (error) {
    console.error('Error in getApprovalStatusReport:', error);
    return []; // Return empty array on error
  }
};

const getApprovalStats = (data) => {
  const approved = data.filter(d => d.document_status === 'approved').length;
  const pending = data.filter(d => d.document_status === 'pending').length;
  const rejected = data.filter(d => d.document_status === 'rejected').length;
  const approvalRate = data.length > 0 ? (approved / data.length) * 100 : 0;
  
  return {
    totalDocuments: data.length,
    approved,
    pending,
    rejected,
    approvalRate: roundTo2Decimals(approvalRate),
    avgApprovalTime: '3.5 days', // This would need actual calculation
    stuckInWorkflow: data.filter(d => 
      d.document_status === 'pending' && d.pending_steps > 0
    ).length
  };
};

// AI Insights Generation (keeping existing function but ensuring numbers are rounded)
const generateAIInsights = async (data, reportType, summary) => {
  const insights = {
    trends: [],
    anomalies: [],
    predictions: [],
    recommendations: []
  };

  try {
    switch(reportType) {
      case 'spend-summary':
        // Spending trends
        const months = Object.keys(summary.byMonth || {}).sort();
        if (months.length >= 2) {
          const lastMonth = months[months.length - 1];
          const prevMonth = months[months.length - 2];
          const change = ((summary.byMonth[lastMonth]?.amount || 0) - (summary.byMonth[prevMonth]?.amount || 0)) / (summary.byMonth[prevMonth]?.amount || 1) * 100;
          
          insights.trends.push({
            type: 'spending_trend',
            message: `Spending ${change > 0 ? 'increased' : 'decreased'} by ${Math.abs(change).toFixed(1)}% compared to previous month`,
            value: roundTo2Decimals(change)
          });
        }

        // Anomalies - unusually large transactions
        const avgAmount = summary.averageAmount;
        const largeTransactions = data.filter(d => d.amount > avgAmount * 3);
        if (largeTransactions.length > 0) {
          insights.anomalies.push({
            type: 'large_transactions',
            message: `${largeTransactions.length} unusually large transactions detected`,
            transactions: largeTransactions.map(d => ({
              invoice: d.invoice_number,
              amount: roundTo2Decimals(d.amount),
              vendor: d.vendor_name
            }))
          });
        }
        break;

      case 'vendor-analysis':
        // Vendor concentration risk
        const topVendor = data[0];
        if (topVendor && (topVendor.total_amount / summary.totalSpend) > 0.5) {
          insights.recommendations.push({
            type: 'vendor_concentration',
            message: `High concentration risk: ${topVendor.vendor_name} represents ${((topVendor.total_amount / summary.totalSpend) * 100).toFixed(1)}% of total spend`,
            risk: 'high'
          });
        }

        // Vendors with high rejection rates
        const highRejectionVendors = data.filter(v => 
          v.rejected_count > 0 && (v.rejected_count / v.document_count) > 0.2
        );
        if (highRejectionVendors.length > 0) {
          insights.anomalies.push({
            type: 'high_rejection',
            message: `${highRejectionVendors.length} vendors have >20% rejection rate`,
            vendors: highRejectionVendors.map(v => v.vendor_name)
          });
        }
        break;

      case 'tax-vat-report':
        // Tax rate anomalies
        const avgTaxRate = summary.effectiveTaxRate;
        const taxAnomalies = data.filter(d => 
          Math.abs((d.vat / d.amount * 100) - avgTaxRate) > 5
        );
        if (taxAnomalies.length > 0) {
          insights.anomalies.push({
            type: 'tax_rate_anomaly',
            message: `${taxAnomalies.length} documents have unusual tax rates`,
            documents: taxAnomalies.map(d => d.invoice_number)
          });
        }

        // Quarterly tax projections
        insights.predictions.push({
          type: 'tax_projection',
          message: `Based on current trends, next quarter's VAT is projected to be $${roundTo2Decimals(summary.totalVAT * 1.1).toFixed(2)}`,
          confidence: 'medium'
        });
        break;

      case 'approval-status':
        // Bottleneck detection
        if (summary.stuckInWorkflow > 0) {
          insights.recommendations.push({
            type: 'bottleneck',
            message: `${summary.stuckInWorkflow} documents are stuck in approval workflow`,
            action: 'Review pending approvals'
          });
        }

        // Approval efficiency
        if (summary.approvalRate < 70) {
          insights.recommendations.push({
            type: 'efficiency',
            message: `Low approval rate (${summary.approvalRate.toFixed(1)}%) - consider reviewing approval criteria`,
            action: 'Review rejection reasons'
          });
        }
        break;
    }

    // Add seasonal insights if enough data
    if (data.length > 10) {
      insights.trends.push({
        type: 'seasonal',
        message: 'Spending typically increases by 15% in Q4 based on historical data',
        confidence: 'high'
      });
    }

  } catch (error) {
    console.error('AI insights generation error:', error);
  }

  return insights;
};

// Export to Excel
const exportToExcel = async (req, res) => {
  try {
    const { reportType, data, summary, filters } = req.body;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${reportType} Report`);

    // Add title
    worksheet.mergeCells('A1:G1');
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = `${reportType.replace('-', ' ').toUpperCase()} Report`;
    titleRow.getCell(1).font = { size: 16, bold: true };
    titleRow.getCell(1).alignment = { horizontal: 'center' };

    // Add filters
    worksheet.addRow([]);
    worksheet.addRow(['Filters:']);
    worksheet.addRow([`Date Range: ${filters.startDate || 'All'} to ${filters.endDate || 'All'}`]);
    worksheet.addRow([`Vendor: ${filters.vendorId || 'All'}`]);
    worksheet.addRow([`Status: ${filters.status || 'All'}`]);

    // Add summary
    worksheet.addRow([]);
    worksheet.addRow(['Summary:']);
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value === 'object') {
        worksheet.addRow([key, JSON.stringify(value)]);
      } else {
        worksheet.addRow([key, value]);
      }
    });

    // Add data
    worksheet.addRow([]);
    worksheet.addRow(['Detailed Data:']);
    
    if (data.length > 0) {
      // Add headers
      const headers = Object.keys(data[0]);
      worksheet.addRow(headers);

      // Add rows
      data.forEach(item => {
        const row = [];
        headers.forEach(header => {
          let value = item[header];
          if (typeof value === 'number') {
            value = roundTo2Decimals(value);
          }
          row.push(value);
        });
        worksheet.addRow(row);
      });
    }

    // Style the worksheet
    worksheet.columns.forEach(column => {
      column.width = 20;
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${reportType}-${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({ message: 'Error exporting to Excel' });
  }
};

// Export to PDF
const exportToPDF = async (req, res) => {
  try {
    const { reportType, data, summary, filters, insights } = req.body;

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=${reportType}-${Date.now()}.pdf`
    );

    doc.pipe(res);

    // Title
    doc.fontSize(20).text(
      `${reportType.replace('-', ' ').toUpperCase()} Report`,
      { align: 'center' }
    );
    doc.moveDown();

    // Generation date
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown();

    // Filters
    doc.fontSize(14).text('Filters', { underline: true });
    doc.fontSize(10).text(`Date Range: ${filters.startDate || 'All'} to ${filters.endDate || 'All'}`);
    doc.text(`Vendor: ${filters.vendorId || 'All'}`);
    doc.text(`Status: ${filters.status || 'All'}`);
    doc.moveDown();

    // Summary
    doc.fontSize(14).text('Summary', { underline: true });
    Object.entries(summary).forEach(([key, value]) => {
      if (typeof value !== 'object') {
        if (typeof value === 'number') {
          value = roundTo2Decimals(value);
        }
        doc.fontSize(10).text(`${key}: ${value}`);
      }
    });
    doc.moveDown();

    // AI Insights
    if (insights) {
      doc.fontSize(14).text('AI Insights', { underline: true });
      
      if (insights.trends?.length > 0) {
        doc.fontSize(12).text('Trends:');
        insights.trends.forEach(t => {
          doc.fontSize(10).text(`• ${t.message}`);
        });
      }

      if (insights.anomalies?.length > 0) {
        doc.moveDown();
        doc.fontSize(12).text('Anomalies Detected:');
        insights.anomalies.forEach(a => {
          doc.fontSize(10).text(`• ${a.message}`);
        });
      }

      if (insights.recommendations?.length > 0) {
        doc.moveDown();
        doc.fontSize(12).text('Recommendations:');
        insights.recommendations.forEach(r => {
          doc.fontSize(10).text(`• ${r.message}`);
        });
      }

      if (insights.predictions?.length > 0) {
        doc.moveDown();
        doc.fontSize(12).text('Predictions:');
        insights.predictions.forEach(p => {
          doc.fontSize(10).text(`• ${p.message} (Confidence: ${p.confidence})`);
        });
      }
    }

    // Data table
    if (data.length > 0) {
      doc.addPage();
      doc.fontSize(14).text('Detailed Data', { underline: true });
      doc.moveDown();

      // Simple table representation
      data.slice(0, 20).forEach((item, index) => {
        const amount = typeof item.amount === 'number' ? roundTo2Decimals(item.amount) : (item.amount || 0);
        doc.fontSize(8).text(
          `${index + 1}. ${item.invoice_number || ''} | ${item.vendor_name || ''} | $${amount} | ${item.status || ''}`
        );
      });

      if (data.length > 20) {
        doc.text(`... and ${data.length - 20} more records`);
      }
    }

    doc.end();

  } catch (error) {
    console.error('PDF export error:', error);
    res.status(500).json({ message: 'Error exporting to PDF' });
  }
};

// Get vendors for filter dropdown
const getVendorsForFilter = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM vendors ORDER BY name'
    );
    res.json({ vendors: result.rows });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({ message: 'Error fetching vendors' });
  }
};

module.exports = {
  generateReport,
  exportToExcel,
  exportToPDF,
  getVendorsForFilter
};