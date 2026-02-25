const pool = require('../config/db');

class AIInsights {
  
  // Calculate moving average for trend detection
  static calculateMovingAverage(data, windowSize = 3) {
    const result = [];
    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const end = i + 1;
      const window = data.slice(start, end);
      const avg = window.reduce((sum, val) => sum + val, 0) / window.length;
      result.push(avg);
    }
    return result;
  }

  // Detect trends using linear regression
  static detectTrend(data) {
    if (data.length < 2) return 'insufficient data';
    
    const x = Array.from({ length: data.length }, (_, i) => i);
    const y = data;
    
    // Calculate linear regression
    const n = x.length;
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    if (slope > 0.1) return 'increasing';
    if (slope < -0.1) return 'decreasing';
    return 'stable';
  }

  // Detect anomalies using Z-score method
  static detectAnomalies(data, threshold = 2) {
    if (data.length < 3) return [];
    
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const stdDev = Math.sqrt(
      data.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / data.length
    );
    
    const anomalies = [];
    data.forEach((value, index) => {
      const zScore = Math.abs((value - mean) / stdDev);
      if (zScore > threshold) {
        anomalies.push({ index, value, zScore });
      }
    });
    
    return anomalies;
  }

  // Predict next values using exponential smoothing
  static predictNext(data, periods = 1, alpha = 0.3) {
    if (data.length < 2) return null;
    
    let lastSmooth = data[0];
    const smoothed = [lastSmooth];
    
    for (let i = 1; i < data.length; i++) {
      const smooth = alpha * data[i] + (1 - alpha) * lastSmooth;
      smoothed.push(smooth);
      lastSmooth = smooth;
    }
    
    const predictions = [];
    let next = lastSmooth;
    for (let i = 0; i < periods; i++) {
      predictions.push(next);
      next = alpha * next + (1 - alpha) * next; // Simple trend continuation
    }
    
    return predictions;
  }

  // Analyze spending patterns by day of week/month
  static analyzeTemporalPatterns(documents) {
    const patterns = {
      byDayOfWeek: {},
      byMonth: {},
      byQuarter: {}
    };

    documents.forEach(doc => {
      const date = new Date(doc.date);
      const dayOfWeek = date.getDay();
      const month = date.getMonth();
      const quarter = Math.floor(month / 3) + 1;
      const amount = parseFloat(doc.amount);

      // Day of week analysis
      if (!patterns.byDayOfWeek[dayOfWeek]) {
        patterns.byDayOfWeek[dayOfWeek] = { total: 0, count: 0 };
      }
      patterns.byDayOfWeek[dayOfWeek].total += amount;
      patterns.byDayOfWeek[dayOfWeek].count++;

      // Monthly analysis
      if (!patterns.byMonth[month]) {
        patterns.byMonth[month] = { total: 0, count: 0 };
      }
      patterns.byMonth[month].total += amount;
      patterns.byMonth[month].count++;

      // Quarterly analysis
      if (!patterns.byQuarter[quarter]) {
        patterns.byQuarter[quarter] = { total: 0, count: 0 };
      }
      patterns.byQuarter[quarter].total += amount;
      patterns.byQuarter[quarter].count++;
    });

    return patterns;
  }

  // Find correlations between vendors and amounts
  static findCorrelations(documents) {
    const vendorData = {};
    
    documents.forEach(doc => {
      if (!vendorData[doc.vendor_name]) {
        vendorData[doc.vendor_name] = {
          amounts: [],
          frequencies: 0,
          total: 0
        };
      }
      vendorData[doc.vendor_name].amounts.push(parseFloat(doc.amount));
      vendorData[doc.vendor_name].frequencies++;
      vendorData[doc.vendor_name].total += parseFloat(doc.amount);
    });

    return vendorData;
  }

  // Generate real AI insights based on actual data
  static async generateRealInsights(reportType, data, summary) {
    const insights = {
      trends: [],
      anomalies: [],
      predictions: [],
      recommendations: [],
      patterns: [],
      risks: []
    };

    try {
      switch(reportType) {
        case 'spend-summary':
          await this.generateSpendInsights(data, summary, insights);
          break;
        case 'vendor-analysis':
          await this.generateVendorInsights(data, insights);
          break;
        case 'tax-vat-report':
          await this.generateTaxInsights(data, summary, insights);
          break;
        case 'approval-status':
          await this.generateApprovalInsights(data, summary, insights);
          break;
      }

      // Add cross-cutting insights
      await this.generateCrossCuttingInsights(data, insights);

    } catch (error) {
      console.error('AI insights generation error:', error);
    }

    return insights;
  }

  static async generateSpendInsights(data, summary, insights) {
    // Extract monthly amounts for trend analysis
    const monthlyAmounts = Object.values(summary.byMonth || {})
      .map(m => m.amount)
      .reverse();

    if (monthlyAmounts.length >= 2) {
      // Trend detection
      const trend = this.detectTrend(monthlyAmounts);
      insights.trends.push({
        type: 'spending_trend',
        message: `Spending is ${trend} over the last ${monthlyAmounts.length} months`,
        confidence: monthlyAmounts.length >= 6 ? 'high' : 'medium',
        data: { trend, months: monthlyAmounts.length }
      });

      // Anomaly detection
      const anomalies = this.detectAnomalies(monthlyAmounts);
      if (anomalies.length > 0) {
        const anomalyMonths = anomalies.map(a => {
          const monthIndex = monthlyAmounts.length - 1 - a.index;
          return `Month -${monthIndex}`;
        });
        insights.anomalies.push({
          type: 'spike_detected',
          message: `Detected ${anomalies.length} unusual spending ${anomalies.length === 1 ? 'spike' : 'spikes'}`,
          details: anomalyMonths,
          severity: anomalies.length > 2 ? 'high' : 'medium'
        });
      }

      // Predictions
      const predictions = this.predictNext(monthlyAmounts, 3);
      if (predictions) {
        insights.predictions.push({
          type: 'spending_forecast',
          message: `Next month's spending projected to be $${predictions[0].toFixed(2)}`,
          confidence: monthlyAmounts.length >= 6 ? 'high' : 'medium',
          values: predictions.map(p => p.toFixed(2))
        });
      }
    }

    // Vendor concentration analysis
    const vendorConcentration = Object.values(summary.byVendor || {})
      .map(v => v.amount)
      .sort((a, b) => b - a);
    
    if (vendorConcentration.length > 0) {
      const topVendorShare = vendorConcentration[0] / summary.totalAmount * 100;
      if (topVendorShare > 50) {
        insights.risks.push({
          type: 'concentration_risk',
          message: `Top vendor represents ${topVendorShare.toFixed(1)}% of total spend`,
          severity: 'high',
          recommendation: 'Consider diversifying vendors to reduce risk'
        });
      }
    }
  }

  static async generateVendorInsights(data, insights) {
    const vendorCount = data.length;
    const amounts = data.map(v => parseFloat(v.total_amount || 0));
    
    // Vendor payment patterns
    const avgPerVendor = amounts.reduce((a, b) => a + b, 0) / vendorCount;
    const stdDev = Math.sqrt(
      amounts.reduce((sq, n) => sq + Math.pow(n - avgPerVendor, 2), 0) / vendorCount
    );

    // Identify vendors with unusual patterns
    const unusualVendors = data.filter(v => {
      const amount = parseFloat(v.total_amount || 0);
      return Math.abs(amount - avgPerVendor) > 2 * stdDev;
    });

    if (unusualVendors.length > 0) {
      insights.anomalies.push({
        type: 'unusual_vendors',
        message: `${unusualVendors.length} vendors have spending ${unusualVendors.length === 1 ? 'volume significantly different' : 'volumes significantly different'} from average`,
        vendors: unusualVendors.map(v => v.vendor_name),
        severity: unusualVendors.length > 3 ? 'high' : 'medium'
      });
    }

    // Vendor growth rates
    const growingVendors = data.filter(v => {
      const approved = parseFloat(v.approved_count || 0);
      const rejected = parseFloat(v.rejected_count || 0);
      const total = approved + rejected;
      return total > 0 && approved / total > 0.8 && approved > 5;
    });

    if (growingVendors.length > 0) {
      insights.trends.push({
        type: 'growing_vendors',
        message: `${growingVendors.length} vendors show strong growth with high approval rates`,
        vendors: growingVendors.map(v => v.vendor_name),
        confidence: 'high'
      });
    }

    // Vendor risk assessment
    const highRiskVendors = data.filter(v => {
      const rejected = parseFloat(v.rejected_count || 0);
      const total = parseFloat(v.document_count || 1);
      return rejected / total > 0.3;
    });

    if (highRiskVendors.length > 0) {
      insights.risks.push({
        type: 'vendor_risk',
        message: `${highRiskVendors.length} vendors have >30% rejection rate`,
        vendors: highRiskVendors.map(v => v.vendor_name),
        severity: 'high',
        recommendation: 'Review relationship with these vendors'
      });
    }
  }

  static async generateTaxInsights(data, summary, insights) {
    const amounts = data.map(d => parseFloat(d.amount));
    const vats = data.map(d => parseFloat(d.vat));
    const taxRates = amounts.map((a, i) => (vats[i] / a) * 100);

    // Analyze tax rate consistency
    const avgTaxRate = taxRates.reduce((a, b) => a + b, 0) / taxRates.length;
    const taxRateStdDev = Math.sqrt(
      taxRates.reduce((sq, r) => sq + Math.pow(r - avgTaxRate, 2), 0) / taxRates.length
    );

    const inconsistentTaxDocs = data.filter((d, i) => {
      const rate = (parseFloat(d.vat) / parseFloat(d.amount)) * 100;
      return Math.abs(rate - avgTaxRate) > 2 * taxRateStdDev;
    });

    if (inconsistentTaxDocs.length > 0) {
      insights.anomalies.push({
        type: 'tax_inconsistency',
        message: `${inconsistentTaxDocs.length} documents have unusual tax rates`,
        documents: inconsistentTaxDocs.map(d => d.invoice_number),
        severity: inconsistentTaxDocs.length > 5 ? 'high' : 'medium',
        recommendation: 'Review these documents for potential tax errors'
      });
    }

    // Quarterly tax analysis
    const quarters = Object.keys(summary.byQuarter || {});
    if (quarters.length >= 2) {
      const lastQuarter = quarters[quarters.length - 1];
      const prevQuarter = quarters[quarters.length - 2];
      
      const growth = ((summary.byQuarter[lastQuarter]?.vat || 0) - 
                     (summary.byQuarter[prevQuarter]?.vat || 0)) / 
                     (summary.byQuarter[prevQuarter]?.vat || 1) * 100;

      insights.trends.push({
        type: 'tax_growth',
        message: `VAT liability ${growth > 0 ? 'increased' : 'decreased'} by ${Math.abs(growth).toFixed(1)}% from previous quarter`,
        confidence: 'high',
        value: growth
      });

      // Predict next quarter's tax
      const vatAmounts = quarters.map(q => summary.byQuarter[q].vat);
      const nextVat = this.predictNext(vatAmounts, 1)[0];
      if (nextVat) {
        insights.predictions.push({
          type: 'tax_forecast',
          message: `Next quarter's VAT projected to be $${nextVat.toFixed(2)}`,
          confidence: vatAmounts.length >= 4 ? 'high' : 'medium',
          value: nextVat
        });
      }
    }
  }

  static async generateApprovalInsights(data, summary, insights) {
    const totalDocs = data.length;
    const approved = data.filter(d => d.document_status === 'approved').length;
    const rejected = data.filter(d => d.document_status === 'rejected').length;
    const pending = data.filter(d => d.document_status === 'pending').length;

    // Calculate approval efficiency
    const approvalRate = totalDocs > 0 ? (approved / totalDocs) * 100 : 0;
    const rejectionRate = totalDocs > 0 ? (rejected / totalDocs) * 100 : 0;

    insights.trends.push({
      type: 'approval_efficiency',
      message: `Approval rate: ${approvalRate.toFixed(1)}%, Rejection rate: ${rejectionRate.toFixed(1)}%`,
      confidence: 'high',
      values: { approvalRate, rejectionRate }
    });

    // Identify bottlenecks
    const stuckDocs = data.filter(d => {
      return d.document_status === 'pending' && d.pending_steps > 0;
    });

    if (stuckDocs.length > 0) {
      const stepsStuck = {};
      stuckDocs.forEach(d => {
        const step = d.current_step || 1;
        stepsStuck[step] = (stepsStuck[step] || 0) + 1;
      });

      const bottleneckStep = Object.entries(stepsStuck)
        .sort((a, b) => b[1] - a[1])[0];

      insights.risks.push({
        type: 'approval_bottleneck',
        message: `${stuckDocs.length} documents stuck in approval workflow`,
        bottleneck: `Step ${bottleneckStep[0]} has ${bottleneckStep[1]} pending documents`,
        severity: stuckDocs.length > 10 ? 'high' : 'medium',
        recommendation: 'Review approval queue at Step ' + bottleneckStep[0]
      });
    }

    // Calculate average approval time (if we have timestamps)
    const approvalTimes = [];
    data.forEach(doc => {
      if (doc.approval_history) {
        try {
          const history = typeof doc.approval_history === 'string' 
            ? JSON.parse(doc.approval_history) 
            : doc.approval_history;
          
          if (Array.isArray(history) && history.length > 0) {
            const firstStep = history[0];
            const lastStep = history[history.length - 1];
            
            if (firstStep?.created_at && lastStep?.created_at) {
              const timeDiff = new Date(lastStep.created_at) - new Date(firstStep.created_at);
              approvalTimes.push(timeDiff / (1000 * 60 * 60 * 24)); // Convert to days
            }
          }
        } catch (e) {
          // Skip if history parsing fails
        }
      }
    });

    if (approvalTimes.length > 0) {
      const avgTime = approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length;
      insights.predictions.push({
        type: 'approval_time',
        message: `Average approval time: ${avgTime.toFixed(1)} days`,
        confidence: approvalTimes.length > 10 ? 'high' : 'medium',
        value: avgTime
      });
    }
  }

  static async generateCrossCuttingInsights(data, insights) {
    // Seasonal pattern detection
    const documents = data;
    if (documents.length > 10) {
      const patterns = this.analyzeTemporalPatterns(documents);
      
      // Find busiest month
      const busiestMonth = Object.entries(patterns.byMonth)
        .sort((a, b) => b[1].total - a[1].total)[0];
      
      if (busiestMonth) {
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        insights.patterns.push({
          type: 'seasonal_pattern',
          message: `${monthNames[busiestMonth[0]]} is typically your busiest month`,
          confidence: 'medium',
          data: busiestMonth[1]
        });
      }

      // Day of week patterns
      const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const activeDays = Object.entries(patterns.byDayOfWeek)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 2);
      
      if (activeDays.length > 0) {
        insights.patterns.push({
          type: 'weekly_pattern',
          message: `Most documents are processed on ${weekdayNames[activeDays[0][0]]} and ${weekdayNames[activeDays[1][0]]}`,
          confidence: 'high'
        });
      }
    }

    // Anomaly detection in amount distribution
    const amounts = documents.map(d => parseFloat(d.amount));
    if (amounts.length > 5) {
      const anomalies = this.detectAnomalies(amounts, 2.5);
      if (anomalies.length > 0) {
        insights.anomalies.push({
          type: 'amount_anomalies',
          message: `Found ${anomalies.length} transactions that are statistically unusual in amount`,
          severity: anomalies.length > 3 ? 'high' : 'medium',
          details: anomalies.map(a => ({
            amount: a.value,
            zScore: a.zScore.toFixed(2)
          }))
        });
      }
    }
  }
}

module.exports = AIInsights;