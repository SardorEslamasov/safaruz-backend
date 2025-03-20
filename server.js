const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { Pool } = require("pg");  // Import pg package for PostgreSQL connection
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Set up PostgreSQL connection pool
const pool = new Pool({
  user: process.env.PG_USER || 'safaruz_user' ,      // Database username
  host: process.env.PG_HOST || 'localhost',  // Database host
  database: process.env.PG_DATABASE || 'postgres', // Database name
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

// JWT Authentication Middleware
const authenticateUser = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    return res.status(401).json({ error: "Access Denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, "your_secret_key"); // Change "your_secret_key" to a strong secret key
    req.user = decoded; // Attach user data to request
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid token" });
  }
};

// 🔒 Protected Route - Fetch User Profile
app.get("/profile", authenticateUser, async (req, res) => {
  try {
    const user = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [req.user.userId]);
    res.json(user.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});


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


// Signup Route
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    // Check if user already exists
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert new user
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, hashedPassword]
    );

    res.status(201).json({ message: "User registered successfully", user: newUser.rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check if user exists
    const user = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.rows[0].password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // Generate JWT Token
    const token = jwt.sign({ userId: user.rows[0].id }, "your_secret_key", { expiresIn: "1h" });

    res.json({ message: "Login successful", token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
