// server/scripts/createTables.js
require('dotenv').config({ path: '../.env' });
const pool = require('../src/config/db');

const createTables = async () => {
  try {
    console.log('Creating database tables...');

    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'approver', 'viewer')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created');

    // Vendors table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vendors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        tax_number VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Vendors table created');

    // Documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        filepath VARCHAR(255) NOT NULL,
        document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('invoice', 'credit_note')),
        vendor_id INT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE ON UPDATE CASCADE,
        date DATE NOT NULL,
        amount NUMERIC(15,2) NOT NULL,
        vat NUMERIC(10,2) NOT NULL,
        invoice_number VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        created_by INT REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(invoice_number, vendor_id)
      )
    `);
    console.log('✅ Documents table created');

    // Approvals table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS approvals (
        id SERIAL PRIMARY KEY,
        document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
        approver_id INT REFERENCES users(id) ON DELETE SET NULL,
        step INT NOT NULL CHECK (step BETWEEN 1 AND 3),
        status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        comments TEXT,
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'approver', 'viewer')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Approvals table created');

    // Document logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS document_logs (
        id SERIAL PRIMARY KEY,
        document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE ON UPDATE CASCADE,
        log_type VARCHAR(50) NOT NULL CHECK (log_type IN ('duplicate', 'extraction_issue', 'anomaly', 'info')),
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Document logs table created');

    // Add AI extraction column to documents
    await pool.query(`
      ALTER TABLE documents 
      ADD COLUMN IF NOT EXISTS ai_extraction JSONB
    `);
    console.log('✅ Added AI extraction column to documents');

    console.log('\n🎉 All tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
  } finally {
    await pool.end();
  }
};

createTables();