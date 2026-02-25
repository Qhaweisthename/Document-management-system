// server/scripts/createTestUser.js
require('dotenv').config({ path: '../.env' });
const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

const createTestUser = async () => {
  try {
    const hashedPassword = await bcrypt.hash('password123', 10);
    
    // First check if user exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      ['admin@example.com']
    );

    if (existingUser.rows.length > 0) {
      // Update existing user
      const result = await pool.query(
        `UPDATE users 
         SET password_hash = $1, role = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE email = $3 
         RETURNING id, username, email, role`,
        [hashedPassword, 'admin', 'admin@example.com']
      );
      console.log('✅ Test user updated:', result.rows[0]);
    } else {
      // Create new user
      const result = await pool.query(
        `INSERT INTO users (username, email, password_hash, role) 
         VALUES ($1, $2, $3, $4) 
         RETURNING id, username, email, role`,
        ['Admin User', 'admin@example.com', hashedPassword, 'admin']
      );
      console.log('✅ Test user created:', result.rows[0]);
    }
    
    console.log('📧 Email: admin@example.com');
    console.log('🔑 Password: password123');
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  } finally {
    await pool.end();
  }
};

createTestUser();