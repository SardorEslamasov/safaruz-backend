const { Pool } = require('pg');
require('dotenv').config();  // Load .env variables

const pool = new Pool({
  user: process.env.DB_USER,      
  host: process.env.DB_HOST,      
  database: process.env.DB_NAME,  
  password: process.env.DB_PASSWORD,  
  port: process.env.DB_PORT,
});

pool.connect()
  .then(() => console.log(' Connected to PostgreSQL database'))
  .catch(err => console.error(' Database connection error:', err));

module.exports = pool;
