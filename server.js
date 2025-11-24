import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import axios from "axios";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


dotenv.config();
const app = express();

// Dynamic port for Render or local
const port = process.env.PORT || 3000;

app.use(cors({
  origin: "*", // Allow all origins for testing
  methods: ["GET","POST","PUT","DELETE"],
  allowedHeaders: ["Content-Type","Authorization"],
}));
app.use(bodyParser.json());
app.use(express.json());

function runPythonRecommend(genre, platform, topK = 20, alpha = 0.8) {
  return new Promise((resolve, reject) => {
    const py = spawn("python3", [path.join(__dirname, "scripts", "recommend_api.py")], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const payload = JSON.stringify({ genre, platform, topK, alpha });
    let data = "";
    let err = "";

    py.stdout.on("data", (chunk) => (data += chunk.toString()));
    py.stderr.on("data", (chunk) => (err += chunk.toString()));
    py.on("close", (code) => {
      if (code !== 0) return reject(new Error(err || "Python error"));
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    py.stdin.write(payload);
    py.stdin.end();
  });
}



// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// Schemas
const UserSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  email: { type: String, unique: true },
  password: String,
  isAdmin: { type: Boolean, default: false },
});

const GameSchema = new mongoose.Schema({
  id: Number,
  slug: String,
  name: String,
  description: String,
  background_image: String,
  genres: Array,
  platforms: Array,
  rating: Number,
  released: String,
  addedBy: [String],  // array of usernames
  addedAt: Date,
  website: String,
});

const ReviewSchema = new mongoose.Schema({
  gameId: { type: Number, required: true },
  username: { type: String, required: true },
  reviewText: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  createdAt: { type: Date, default: Date.now },
});

const PendingGameSchema = new mongoose.Schema({
  id: Number,
  slug: String,
  name: String,
  description: String,
  background_image: String,
  genres: Array,
  platforms: Array,
  rating: Number,
  released: String,
  submittedBy: [String],  // username who submitted
  submittedAt: { type: Date, default: Date.now },
  website: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  adminNotes: String,
});

const User = mongoose.model("User", UserSchema);
const Game = mongoose.model("Game", GameSchema);
const Review = mongoose.model("Review", ReviewSchema);
const PendingGame = mongoose.model("PendingGame", PendingGameSchema);

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Token missing" });

  const token = authHeader.split(" ")[1]; // "Bearer <token>"
  if (!token) return res.status(401).json({ error: "Token missing" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Admin Verification Middleware
const verifyAdmin = (req, res, next) => {
  if (!req.user.isAdmin) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// -------------------- ROUTES --------------------

// Register
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields are required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(400).json({ error: "Username already taken or invalid data" });
  }
});

app.post("/api/recommend", async (req, res) => {
  try {
    const { genre, platform, topK, alpha } = req.body;
    const results = await runPythonRecommend(genre, platform, topK, alpha);
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Login
app.post("/login", async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password)
    return res.status(400).json({ error: "All fields are required" });

  try {
    const user = await User.findOne({
      $or: [{ email: usernameOrEmail }, { username: usernameOrEmail }],
    });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: "Invalid credentials" });

    // Make sure isAdmin is a boolean
    const isAdmin = user.isAdmin || false;

    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email, isAdmin },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ 
      message: "Login successful", 
      token, 
      user: { username: user.username, email: user.email, isAdmin } 
    });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});


// Check if User Exists
app.get("/check-user", async (req, res) => {
  const login = req.query.login;
  if (!login) return res.status(400).json({ error: "Login query is required" });

  try {
    const user = await User.findOne({
      $or: [{ email: login }, { username: login }],
    });

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ username: user.username, email: user.email, isAdmin: user.isAdmin });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});
app.post("/save-game", verifyToken, async (req, res) => {
  const { gameData } = req.body;
  if (!gameData) return res.status(400).json({ error: "Game data required" });

  // Ensure required fields exist
  const {
    id,
    slug,
    name,
    description,
    background_image,
    genres = [],
    platforms = [],
    rating = 0,
    released = "",
    website = ""
  } = gameData;

  if (!id || !slug || !name || !background_image) {
    return res.status(400).json({ error: "Missing required game fields" });
  }

  try {
    const existingGame = await Game.findOne({ id });
    const existingPendingGame = await PendingGame.findOne({ id, status: 'pending' });

    if (existingGame) {
      if (!existingGame.addedBy.includes(req.user.username)) {
        existingGame.addedBy.push(req.user.username);
        await existingGame.save();
      }
      return res.status(200).json({ message: "Game already exists. Your username added as contributor." });
    }

    if (existingPendingGame) {
      return res.status(200).json({ message: "Game is already pending admin approval." });
    }

    const pendingGame = new PendingGame({
      id,
      slug,
      name,
      description: description || "",
      background_image,
      genres,
      platforms,
      rating,
      released,
      submittedBy: req.user.username,
      website,
    });

    await pendingGame.save();
    res.status(201).json({ message: "Game submitted for admin approval" });
  } catch (err) {
    console.error("Save-game error:", err); // log exact error
    res.status(500).json({ error: "Failed to submit game for approval" });
  }
});

// Suggested Games
app.get("/suggested-games", async (req, res) => {
  try {
    const games = await Game.find().sort({ addedAt: -1 });
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch games" });
  }
});

// Leaderboard - Top 20 users by game count
app.get("/leaderboard", async (req, res) => {
  try {
    const games = await Game.find();
    
    // Count games per user
    const userCounts = {};
    
    games.forEach(game => {
      if (game.addedBy && Array.isArray(game.addedBy)) {
        game.addedBy.forEach(username => {
          if (username) {
            userCounts[username] = (userCounts[username] || 0) + 1;
          }
        });
      }
    });
    
    // Convert to array and sort by count (descending)
    const leaderboard = Object.entries(userCounts)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // Top 20
    
    res.status(200).json(leaderboard);
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// Fetch Game Details from RAWG
async function fetchGameDetailsFromBackend(slug) {
  try {
    const response = await axios.get(`https://api.rawg.io/api/games/${slug}`, {
      params: { key: process.env.RAWG_API_KEY }
    });
    return response.data;
  } catch (err) {
    return err;
  }
}

// Add Yours (Admin Only - Direct Add)
app.post("/addyours", verifyToken, verifyAdmin, async (req, res) => {
  const { gamename } = req.body;
  if (!gamename) return res.status(400).json({ error: "Game name is required" });

  try {
    const gameData = await fetchGameDetailsFromBackend(gamename);
    if (!gameData) return res.status(500).json({ error: "Failed to fetch game" });

    let existingGame = await Game.findOne({ id: gameData.id });

    if (existingGame) {
      if (!existingGame.addedBy.includes(req.user.username)) {
        existingGame.addedBy.push(req.user.username);
        await existingGame.save();
      }
      return res.status(200).json({ message: "Game exists. Username added.", data: existingGame });
    }

    const newGame = new Game({
      id: gameData.id,
      slug: gameData.slug,
      name: gameData.name,
      description: gameData.description_raw || gameData.description,
      background_image: gameData.background_image,
      genres: gameData.genres,
      platforms: gameData.platforms,
      rating: gameData.rating,
      released: gameData.released,
      addedBy: [req.user.username],
      addedAt: new Date(),
      website: gameData.website,
    });

    await newGame.save();
    res.status(201).json({ message: "Game added successfully!", data: newGame });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Fetch Game by Slug
app.post("/fetch-game-details", async (req, res) => {
  const { slug } = req.body;
  if (!slug) return res.status(400).json({ error: "Missing slug" });

  try {
    const response = await axios.get(`https://api.rawg.io/api/games/${slug}`, {
      params: { key: process.env.RAWG_API_KEY },
      validateStatus: () => true, // prevent axios from throwing on 404
    });

    if (response.status === 404) {
      return res.status(404).json({ error: "Game not found" });
    }

    res.json(response.data);
  } catch (err) {
    console.error("Fetch-game-details error:", err.message);
    res.status(500).json({ error: "Failed to fetch game details" });
  }
});
// Admin: Edit a pending or approved game
app.put("/admin/edit-game/:id", verifyToken, verifyAdmin, async (req, res) => {
  const gameId = req.params.id;
  const { updatedGame } = req.body;

  if (!updatedGame) {
    return res.status(400).json({ error: "Updated game data is required" });
  }

  try {
    // First check in PendingGames
    let game = await PendingGame.findById(gameId);

    if (!game) {
      // If not pending, check in approved Games collection
      game = await Game.findById(gameId);
    }

    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    // Update fields (only allowed fields)
    const allowedFields = [
      "name", "slug", "description", "background_image",
      "genres", "platforms", "rating", "released", "website"
    ];

    allowedFields.forEach((field) => {
      if (updatedGame[field] !== undefined) {
        game[field] = updatedGame[field];
      }
    });

    await game.save();
    res.status(200).json({ message: "Game updated successfully", data: game });
  } catch (err) {
    console.error("Edit game error:", err);
    res.status(500).json({ error: "Failed to update game" });
  }
});
// Fetch Game Details from DB if RAWG fails
app.get("/game-details/:slug", async (req, res) => {
  const { slug } = req.params;

  if (!slug) return res.status(400).json({ error: "Slug is required" });

  try {
    // Try finding in the main Game collection first
    const game = await Game.findOne({ slug });

    if (!game) {
      // If not found, try pending games as a fallback
      const pendingGame = await PendingGame.findOne({ slug });
      if (!pendingGame) {
        return res.status(404).json({ error: "Game not found in database" });
      }
      return res.status(200).json(pendingGame);
    }

    res.status(200).json(game);
  } catch (err) {
    console.error("Fetch game from DB error:", err);
    res.status(500).json({ error: "Failed to fetch game from database" });
  }
});



// Add Review
app.post("/add-review", verifyToken, async (req, res) => {
  const { gameId, reviewText, rating } = req.body;
  if (!gameId || !reviewText || !rating)
    return res.status(400).json({ error: "Game ID, review text, and rating are required" });

  try {
    const review = new Review({
      gameId,
      username: req.user.username,
      reviewText,
      rating,
    });
    await review.save();
    res.status(201).json({ message: "Review submitted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to submit review" });
  }
});

// Get Reviews
app.get("/reviews/:gameId", async (req, res) => {
  const gameId = parseInt(req.params.gameId);
  if (!gameId) return res.status(400).json({ error: "Invalid game ID" });

  try {
    const reviews = await Review.find({ gameId }).sort({ createdAt: -1 });
    res.status(200).json(reviews);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

// Reviews Count
app.get("/reviews-count/:gameId", async (req, res) => {
  const gameId = parseInt(req.params.gameId);
  if (!gameId) return res.status(400).json({ error: "Invalid game ID" });

  try {
    const count = await Review.countDocuments({ gameId });
    res.status(200).json({ count });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch reviews count" });
  }
});

// Get games suggested by logged-in user
app.get("/yoursuggested", verifyToken, async (req, res) => {
  try {
    const games = await Game.find({ addedBy: req.user.username }).sort({ addedAt: -1 });
    res.status(200).json(games);
    
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your suggested games" });
    console.error(err);
  }
});

// Make user admin (TESTING ONLY - DISABLE IN PRODUCTION)
app.post("/make-admin", verifyToken, async (req, res) => {
  // Only allow in development environment
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: "Not available in production" });
  }
  
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    user.isAdmin = true;
    await user.save();
    
    res.status(200).json({ message: "User is now an admin (DEVELOPMENT ONLY)" });
  } catch (err) {
    res.status(500).json({ error: "Failed to make user admin" });
  }
});

// Admin: Get all pending games
app.get("/admin/pending-games", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const pendingGames = await PendingGame.find({ status: 'pending' }).sort({ submittedAt: -1 });
    res.status(200).json(pendingGames);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pending games" });
  }
});

// Admin: Approve a pending game
app.post("/admin/approve-game/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const pendingGame = await PendingGame.findById(req.params.id);
    if (!pendingGame) {
      return res.status(404).json({ error: "Pending game not found" });
    }

    // Check if game already exists in main database
    const existingGame = await Game.findOne({ id: pendingGame.id });
    if (existingGame) {
      pendingGame.status = 'rejected';
      pendingGame.adminNotes = 'Game already exists in database';
      await pendingGame.save();
      return res.status(400).json({ error: "Game already exists in database" });
    }

    // Create new game in main database
    const newGame = new Game({
      id: pendingGame.id,
      slug: pendingGame.slug,
      name: pendingGame.name,
      description: pendingGame.description,
      background_image: pendingGame.background_image,
      genres: pendingGame.genres,
      platforms: pendingGame.platforms,
      rating: pendingGame.rating,
      released: pendingGame.released,
      addedBy: pendingGame.submittedBy,
      addedAt: new Date(),
      website: pendingGame.website,
    });

    await newGame.save();

    // Update pending game status
    pendingGame.status = 'approved';
    await pendingGame.save();

    res.status(200).json({ message: "Game approved successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve game" });
    console.error(err);
  }
});

// Admin: Reject a pending game
app.post("/admin/reject-game/:id", verifyToken, verifyAdmin, async (req, res) => {
  const { adminNotes } = req.body;
  
  try {
    const pendingGame = await PendingGame.findById(req.params.id);
    if (!pendingGame) {
      return res.status(404).json({ error: "Pending game not found" });
    }

    pendingGame.status = 'rejected';
    pendingGame.adminNotes = adminNotes || 'Rejected by admin';
    await pendingGame.save();

    res.status(200).json({ message: "Game rejected successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reject game" });
    console.error(err);
  }
});

// Start server
app.listen(port, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${port}`);
});
