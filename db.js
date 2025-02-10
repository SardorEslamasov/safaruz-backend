const { Pool } = require('pg');

// Database connection configuration
const pool = new Pool({
  user: 'safaruz_user',       // your PostgreSQL username
  host: 'localhost',          // database server
  database: 'safaruz',        // the database you created
  password: 'yourpassword',   // the password you set for the user
  port: 5432,                 // PostgreSQL default port
});

// Function to test the connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to the database!');
    client.release();  // Release the client back to the pool
  } catch (err) {
    console.error('Error connecting to the database:', err.stack);
  }
};

// Test the connection
testConnection();

module.exports = pool;
