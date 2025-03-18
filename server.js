const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { Pool } = require("pg");  // Import pg package for PostgreSQL connection

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Set up PostgreSQL connection pool
const pool = new Pool({
  user: process.env.PG_USER || 'safaruz_user' ,      // Database username
  host: process.env.PG_HOST || 'localhost',  // Database host
  database: process.env.PG_DATABASE || 'safaruz', // Database name
  password: process.env.PG_PASSWORD || '03082003E.S.',   // Database password
  port: process.env.PG_PORT || 5432,  // PostgreSQL default port
});

// Test Database Connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to the PostgreSQL database');
    client.release();  // Release the client after use
  } catch (err) {
    console.error('Error connecting to the database:', err.stack);
  }
};

// Call the test connection function
testConnection();

// Default route
app.get("/", (req, res) => {
  res.send("SafarUz Backend is running...");
});

// Example API route to fetch data from the database (optional)
app.get("/get-data", async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM your_table');  // Replace 'your_table' with your actual table name
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching data from the database:', err.stack);
    res.status(500).json({ error: 'Error fetching data from the database' });
  }
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
