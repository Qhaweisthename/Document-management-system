const { Pool } = require("pg");

let pool;

if (process.env.NODE_ENV === 'production') {
  // Production - use DATABASE_URL from Render
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Required for Neon
    }
  });
} else {
  // Development - use local config
  require("dotenv").config();
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'document_management',
  });
}

module.exports = pool;