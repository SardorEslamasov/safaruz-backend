require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { OpenAI } = require("openai");


const app = express();
app.use(cors());
app.use(express.json());

// Database Connection
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // No need to manually remove quotes
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
});

// Test Database Connection
const testConnection = async () => {
  try {
    await pool.query("SELECT 1");
    console.log("Connected to PostgreSQL database");
  } catch (err) {
    console.error("Database connection error:", err.message);
  }
};
testConnection();

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  console.error("Missing JWT_SECRET in environment variables.");
  process.exit(1);
}


// Middleware
app.use(cors());
app.use(express.json()); // for parsing application/json

// ✅ API Routes
app.use("/api/auth", require("./src/routes/authRoutes"));


// Default Route
app.get("/", (req, res) => {
  res.send("SafarUz Backend is running...");
});

// JWT Authentication Middleware
const authenticateToken = (req, res, next) => {
  const token = req.header("Authorization")?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Access Denied" });

  try {
    const verified = jwt.verify(token, jwtSecret);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ error: "Invalid Token" });
  }
};

// Role-based Authorization Middleware
const authorizeRole = (role) => (req, res, next) => {
  if (req.user.role !== role) {
    return res.status(403).json({ error: "Access denied, insufficient permissions" });
  }
  next();
};

//User Signup Route
app.post('/signup', async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role || 'user';

    const result = await pool.query(
      'INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role',
      [username, email, hashedPassword, userRole]
    );

    //Exclude password from response
    const { password: _, ...userWithoutPassword } = result.rows[0];

    res.status(201).json({ message: 'User registered successfully', user: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user' });
  }
});

//User Login Route
app.post('/login', async (req, res) => {
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
    const token = jwt.sign({ id: user.id, role: user.role }, jwtSecret, { expiresIn: '1h' });

    res.status(200).json({ message: 'Login successful', token, role: user.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error logging in' });
  }
});

//Admin-Only Route
app.get("/admin", authenticateToken, authorizeRole("admin"), (req, res) => {
  res.json({ message: "Welcome, Admin!" });
});

//Start Server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

//User Profile Route (Authenticated Users Only)
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id; // Get user ID from token

    const result = await pool.query(
      "SELECT id, username, email, role FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(result.rows[0]); // Return user profile
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching user profile" });
  }
});

//Update User Profile
app.patch('/profile', authenticateToken, async (req, res) => {
  const { username, email } = req.body;
  try {
    await pool.query('UPDATE users SET username = $1, email = $2 WHERE id = $3', [username, email, req.user.id]);
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating profile' });
  }
});

//Change Password
app.patch('/profile/password', authenticateToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    const result = await pool.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    const validPassword = await bcrypt.compare(oldPassword, result.rows[0].password);
    if (!validPassword) return res.status(401).json({ message: 'Incorrect old password' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating password' });
  }
});

//Delete Account
app.delete('/profile', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting account' });
  }
});

//List All Users (Admin Only)
app.get('/users', authenticateToken, authorizeRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, email, role FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

//Create a Tour (Admin only)
app.post("/tours", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { name, description, price, location, available_spots } = req.body;
  try {
    const newTour = await pool.query(
      "INSERT INTO tours (name, description, price, location, available_spots) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [name, description, price, location, available_spots]
    );
    res.status(201).json(newTour.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

//Book a Tour
app.post("/bookings", authenticateToken, async (req, res) => {
  const { tour_id } = req.body;
  try {
    const tour = await pool.query("SELECT * FROM tours WHERE id = $1", [tour_id]);
    if (tour.rows.length === 0 || tour.rows[0].available_spots <= 0) {
      return res.status(400).json({ error: "Tour not available" });
    }

    await pool.query("UPDATE tours SET available_spots = available_spots - 1 WHERE id = $1", [tour_id]);
    const newBooking = await pool.query(
      "INSERT INTO bookings (user_id, tour_id) VALUES ($1, $2) RETURNING *",
      [req.user.id, tour_id]
    );
    res.status(201).json(newBooking.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


//Get all tours (with optional filters)
app.get("/tours", async (req, res) => {
  const { location, minPrice, maxPrice } = req.query;
  let query = "SELECT * FROM tours WHERE 1=1";
  const values = [];

  if (location) {
    values.push(location);
    query += ` AND location = $${values.length}`;
  }
  if (minPrice) {
    values.push(minPrice);
    query += ` AND price >= $${values.length}`;
  }
  if (maxPrice) {
    values.push(maxPrice);
    query += ` AND price <= $${values.length}`;
  }

  try {
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


app.get("/my-bookings", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, t.name AS tour_name, t.location, t.price, b.created_at
       FROM bookings b
       JOIN tours t ON b.tour_id = t.id
       WHERE b.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
});


app.delete("/bookings/:id", authenticateToken, async (req, res) => {
  const bookingId = req.params.id;
  try {
    const booking = await pool.query("SELECT * FROM bookings WHERE id = $1 AND user_id = $2", [bookingId, req.user.id]);
    if (booking.rows.length === 0) return res.status(404).json({ error: "Booking not found" });

    await pool.query("DELETE FROM bookings WHERE id = $1", [bookingId]);
    await pool.query("UPDATE tours SET available_spots = available_spots + 1 WHERE id = $1", [booking.rows[0].tour_id]);

    res.json({ message: "Booking cancelled successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel booking" });
  }
});

app.get("/admin/bookings", authenticateToken, authorizeRole("admin"), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id, u.username, t.name AS tour_name, t.location, b.created_at
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN tours t ON b.tour_id = t.id
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all bookings" });
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
app.post("/ai-assistant", authenticateToken, async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: "Prompt is required" });

  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a helpful travel assistant for tourists in Uzbekistan. Provide useful, friendly and localized answers.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      model: "gpt-3.5-turbo",
      max_tokens: 200,
    });

    const aiResponse = completion.choices[0].message.content;
    res.json({ response: aiResponse });
  } catch (error) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});
