// server/server.js
require("dotenv").config();
const app = require("./src/app");  // Look for app.js in src folder
const pool = require("./src/config/db");  // Look for db.js in src/config folder

const PORT = process.env.PORT || 5000;

// Test database connection and check tables
const testDatabaseConnection = async () => {
  try {
    // Test query to check if tables exist
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    console.log('\n📊 Available tables:', 
      result.rows.length > 0 
        ? result.rows.map(row => row.table_name).join(', ') 
        : 'No tables found'
    );

    // Check if users table exists and has data
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`👥 Users in database: ${usersCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error checking tables:', error.message);
  }
};

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`📡 Local: http://localhost:${PORT}`);
  console.log(`🔑 Auth endpoints: http://localhost:${PORT}/api/auth`);
  
  // Test database connection after server starts
  setTimeout(testDatabaseConnection, 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    pool.end(() => {
      console.log('Database pool closed');
      process.exit(0);
    });
  });
});