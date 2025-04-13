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


// Serve static profile images
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Multer setup for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `user-${req.user.id}${ext}`);
  },
});
const upload = multer({ storage });

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

app.get("/hotels", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM hotels");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch hotels" });
  }
});

// Restaurants
app.get("/restaurants", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM restaurants");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch restaurants" });
  }
});

// Recreational Places
app.get("/recreations", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM recreational_places");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch recreational places" });
  }
});

// Historical Places
app.get("/historical-places", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM historical_places");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch historical places" });
  }
});

// Transport Options
app.get("/transport", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transport_options");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch transport options" });
  }
});

app.post("/hotel-bookings", authenticateToken, async (req, res) => {
  const { hotel_id, check_in, check_out, guests } = req.body;
  try {
    const booking = await pool.query(
      "INSERT INTO hotel_bookings (user_id, hotel_id, check_in, check_out, guests) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [req.user.id, hotel_id, check_in, check_out, guests || 1]
    );
    res.status(201).json({ message: "Hotel booked successfully", booking: booking.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to book hotel" });
  }
});

app.get("/my-hotel-bookings", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT hb.id, h.name AS hotel_name, hb.check_in, hb.check_out, hb.guests, hb.created_at
       FROM hotel_bookings hb
       JOIN hotels h ON hb.hotel_id = h.id
       WHERE hb.user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch hotel bookings" });
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


// Reviews System
app.post("/reviews", authenticateToken, async (req, res) => {
  const { rating, comment, type, target_id } = req.body;

  if (!rating || !type || !target_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const newReview = await pool.query(
      "INSERT INTO reviews (user_id, rating, comment, type, target_id, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *",
      [req.user.id, rating, comment, type, target_id]
    );
    res.status(201).json({ message: "Review submitted", review: newReview.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to submit review" });
  }
});

app.get("/reviews", async (req, res) => {
  const { type, id } = req.query;

  if (!type || !id) {
    return res.status(400).json({ error: "Missing type or id in query" });
  }

  try {
    const result = await pool.query(
      "SELECT r.id, r.rating, r.comment, r.created_at, u.username FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.type = $1 AND r.target_id = $2",
      [type, id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

app.post("/upload-profile", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    const imageUrl = `/uploads/${req.file.filename}`;
    await pool.query("UPDATE users SET profile_image = $1 WHERE id = $2", [imageUrl, req.user.id]);
    res.json({ message: "Profile image uploaded successfully", imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to upload profile image" });
  }
});

// Create a new hotel
app.post("/hotels", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { name, city, description, rating, address, contact_info, price_range, image_url } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO hotels (name, city, description, rating, address, contact_info, price_range, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [name, city, description, rating, address, contact_info, price_range, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create hotel" });
  }
});

// Update a hotel
app.put("/hotels/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, city, description, rating, address, contact_info, price_range, image_url } = req.body;
  try {
    await pool.query(
      "UPDATE hotels SET name = $1, city = $2, description = $3, rating = $4, address = $5, contact_info = $6, price_range = $7, image_url = $8 WHERE id = $9",
      [name, city, description, rating, address, contact_info, price_range, image_url, id]
    );
    res.json({ message: "Hotel updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update hotel" });
  }
});

// Delete a hotel
app.delete("/hotels/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM hotels WHERE id = $1", [req.params.id]);
    res.json({ message: "Hotel deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete hotel" });
  }
});


// Create a restaurant
app.post("/restaurants", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { name, city, description, rating, address, contact_info, price_range, image_url } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO restaurants (name, city, description, rating, address, contact_info, price_range, image_url) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *",
      [name, city, description, rating, address, contact_info, price_range, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create restaurant" });
  }
});

// Update a restaurant
app.put("/restaurants/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, city, description, rating, address, contact_info, price_range, image_url } = req.body;
  try {
    await pool.query(
      "UPDATE restaurants SET name = $1, city = $2, description = $3, rating = $4, address = $5, contact_info = $6, price_range = $7, image_url = $8 WHERE id = $9",
      [name, city, description, rating, address, contact_info, price_range, image_url, id]
    );
    res.json({ message: "Restaurant updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update restaurant" });
  }
});

// Delete a restaurant
app.delete("/restaurants/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM restaurants WHERE id = $1", [req.params.id]);
    res.json({ message: "Restaurant deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete restaurant" });
  }
});


app.post("/historical-places", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { name, city, description, image_url } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO historical_places (name, city, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, city, description, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create historical place" });
  }
});

app.put("/historical-places/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, city, description, image_url } = req.body;
  try {
    await pool.query(
      "UPDATE historical_places SET name = $1, city = $2, description = $3, image_url = $4 WHERE id = $5",
      [name, city, description, image_url, id]
    );
    res.json({ message: "Historical place updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update historical place" });
  }
});

app.delete("/historical-places/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM historical_places WHERE id = $1", [req.params.id]);
    res.json({ message: "Historical place deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete historical place" });
  }
});

app.post("/recreations", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { name, city, description, image_url } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO recreational_places (name, city, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, city, description, image_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create recreational place" });
  }
});

app.put("/recreations/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { name, city, description, image_url } = req.body;
  try {
    await pool.query(
      "UPDATE recreational_places SET name = $1, city = $2, description = $3, image_url = $4 WHERE id = $5",
      [name, city, description, image_url, id]
    );
    res.json({ message: "Recreational place updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update recreational place" });
  }
});

app.delete("/recreations/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM recreational_places WHERE id = $1", [req.params.id]);
    res.json({ message: "Recreational place deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete recreational place" });
  }
});


app.post("/transport", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { type, city, description, provider, contact_info, price_estimate } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO transport_options (type, city, description, provider, contact_info, price_estimate) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [type, city, description, provider, contact_info, price_estimate]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to create transport option" });
  }
});

app.put("/transport/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { id } = req.params;
  const { type, city, description, provider, contact_info, price_estimate } = req.body;
  try {
    await pool.query(
      "UPDATE transport_options SET type = $1, city = $2, description = $3, provider = $4, contact_info = $5, price_estimate = $6 WHERE id = $7",
      [type, city, description, provider, contact_info, price_estimate, id]
    );
    res.json({ message: "Transport option updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to update transport option" });
  }
});

app.delete("/transport/:id", authenticateToken, authorizeRole("admin"), async (req, res) => {
  try {
    await pool.query("DELETE FROM transport_options WHERE id = $1", [req.params.id]);
    res.json({ message: "Transport option deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete transport option" });
  }
});

app.post("/suggest-tours", authenticateToken, async (req, res) => {
  const { city, maxBudget, interests } = req.body;

  let query = "SELECT * FROM tours WHERE 1=1";
  const values = [];

  if (city) {
    values.push(city);
    query += ` AND location ILIKE $${values.length}`;
  }

  if (maxBudget) {
    values.push(maxBudget);
    query += ` AND price <= $${values.length}`;
  }

  try {
    const allTours = await pool.query(query, values);
    let suggestedTours = allTours.rows;

    // Optional: filter by keyword if interests are passed
    if (interests && interests.length > 0) {
      suggestedTours = suggestedTours.filter((tour) =>
        interests.some((keyword) =>
          tour.description.toLowerCase().includes(keyword.toLowerCase())
        )
      );
    }

    res.json({ suggestedTours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch suggested tours" });
  }
});

// Get all cities
app.get("/cities", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM cities");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch cities" });
  }
});

// Admin: Add new city
app.post("/cities", authenticateToken, authorizeRole("admin"), async (req, res) => {
  const { name, description, image_url } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO cities (name, description, image_url) VALUES ($1, $2, $3) RETURNING *",
      [name, description, image_url]
    );
    res.status(201).json({ message: "City added", city: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: "Failed to add city" });
  }
});
