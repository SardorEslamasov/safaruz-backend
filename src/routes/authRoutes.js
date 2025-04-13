const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db'); // PostgreSQL connection
const jwt = require('jsonwebtoken');

const router = express.Router();

router.get("/test", (req, res) => {
    res.json({ message: "Auth route working!" });
  });
  
// Signup Route
router.post('/signup', async (req, res) => {
    const { username, email, password, role } = req.body;
  
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const userRole = role || 'user';  
  
      const result = await pool.query(
        'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [username, email, hashedPassword, userRole]
      );
  
      res.status(201).json({ message: 'User registered successfully', user: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        // PostgreSQL duplicate key error
        return res.status(400).json({ message: 'Email already in use' });
      }
      console.error(err);
      res.status(500).json({ message: 'Error registering user' });
    }
  });

// Login Route
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = result.rows[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Generate JWT Token
        const token = jwt.sign(
            { userId: user.id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({ message: 'Login successful', token, role: user.role });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error logging in' });
    }
});

module.exports = router;
