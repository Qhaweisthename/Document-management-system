const pool = require('../config/db');

// Get dashboard statistics based on role
const getDashboardStats = async (req, res) => {
  try {
    let query;
    const params = [];
    
    // Different queries based on role
    if (req.user.role === 'viewer' || req.user.role === 'approver' || req.user.role === 'admin') {
      // Viewers, Approvers, and Admins see ALL documents
      query = `
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
        FROM documents
      `;
    }

    const statsResult = await pool.query(query, params);
    const stats = statsResult.rows[0] || { 
      total: '0', 
      pending: '0', 
      approved: '0', 
      rejected: '0' 
    };

    res.json({
      totalDocs: parseInt(stats.total),
      pending: parseInt(stats.pending),
      approved: parseInt(stats.approved),
      rejected: parseInt(stats.rejected)
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
};

// Get recent activity based on role
const getRecentActivity = async (req, res) => {
  try {
    // All roles see recent activity from ALL documents
    const query = `
      (SELECT 
        'upload' as action,
        filename as document_name,
        created_at,
        status,
        'upload' as type
      FROM documents
      ORDER BY created_at DESC
      LIMIT 10)
      
      UNION ALL
      
      (SELECT 
        a.status as action,
        d.filename as document_name,
        a.created_at,
        d.status,
        'approval' as type
      FROM approvals a
      JOIN documents d ON a.document_id = d.id
      WHERE a.status != 'pending'
      ORDER BY a.created_at DESC
      LIMIT 10)
      
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const result = await pool.query(query);
    
    // Format the activities
    const activities = result.rows.map(row => ({
      ...row,
      action: row.type === 'upload' ? 'upload' : 
              row.action === 'approved' ? 'approved' : 
              row.action === 'rejected' ? 'rejected' : 'pending'
    }));

    res.json({ activities });

  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ message: 'Error fetching recent activity' });
  }
};

module.exports = {
  getDashboardStats,
  getRecentActivity
};