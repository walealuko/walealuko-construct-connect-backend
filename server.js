require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Product = require("./models/Product");
const Review = require("./models/Review");

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "construct-hub-secret-key";

app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://construct-connect-web.vercel.app"
  ]
}));

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected - server.js:24"))
  .catch(err => console.error(err));

app.get("/", (req, res) => {
  res.send("API is running...");
});

// Auth: Register
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password, role, businessName, cacRegNo, location, phone } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name, email, password: hashedPassword, role: role || "buyer",
      businessName: businessName || "", cacRegNo: cacRegNo || "", location: location || "", phone: phone || ""
    });
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email, role: user.role,
        businessName: user.businessName, cacRegNo: user.cacRegNo, location: user.location, phone: user.phone
      }
    });
  } catch (err) {
    res.status(400).json({ message: "Email may already be in use" });
  }
});

// Auth: Login
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({
      token,
      user: {
        id: user._id, name: user.name, email: user.email, role: user.role,
        businessName: user.businessName, cacRegNo: user.cacRegNo, location: user.location, phone: user.phone
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Auth: Get current user
app.get("/api/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    res.json(user);
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});

// Auth: Update profile
app.put("/api/auth/profile", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const { businessName, cacRegNo, location, phone, name } = req.body;

    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (businessName !== undefined) user.businessName = businessName;
    if (cacRegNo !== undefined) user.cacRegNo = cacRegNo;
    if (location !== undefined) user.location = location;
    if (phone !== undefined) user.phone = phone;
    if (name !== undefined) user.name = name;

    await user.save();
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, businessName: user.businessName, cacRegNo: user.cacRegNo, location: user.location, phone: user.phone });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Products: Get all with search and category filter
app.get("/api/products", async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = {};

    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$text = { $search: search };
    }

    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Products: Get single product
app.get("/api/products/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Products: Create (seller only)
app.post("/api/products", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.role !== "seller") {
      return res.status(403).json({ message: "Only sellers can add products" });
    }

    const { name, description, price, category, imageUrl, stock } = req.body;
    const product = await Product.create({
      name,
      description,
      price: parseFloat(price),
      category: category || "general",
      sellerId: user._id,
      sellerName: user.businessName || user.name,
      sellerLocation: user.location || "",
      imageUrl: imageUrl || "",
      stock: parseInt(stock) || 0,
    });

    res.json(product);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Products: Get seller's products
app.get("/api/products/my", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const products = await Product.find({ sellerId: decoded.userId }).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reviews: Create (buyer only)
app.post("/api/reviews", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user || user.role !== "buyer") {
      return res.status(403).json({ message: "Only buyers can leave reviews" });
    }

    const { sellerId, rating, comment } = req.body;
    const seller = await User.findById(sellerId);
    if (!seller) return res.status(404).json({ message: "Seller not found" });

    const review = await Review.create({
      sellerId,
      sellerName: seller.businessName || seller.name,
      reviewerId: user._id,
      reviewerName: user.name,
      rating: parseInt(rating),
      comment: comment || "",
    });

    res.json(review);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reviews: Get reviews for a seller
app.get("/api/reviews/seller/:sellerId", async (req, res) => {
  try {
    const reviews = await Review.find({ sellerId: req.params.sellerId }).sort({ createdAt: -1 });
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reviews: Get average rating for a seller
app.get("/api/reviews/seller/:sellerId/rating", async (req, res) => {
  try {
    const result = await Review.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(req.params.sellerId) } },
      { $group: { _id: null, average: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    const avg = result.length > 0 ? result[0].average.toFixed(1) : 0;
    const count = result.length > 0 ? result[0].count : 0;
    res.json({ average: parseFloat(avg), count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Get all users
app.get("/api/auth/users", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Update user role
app.put("/api/auth/users/:userId/role", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    const { role } = req.body;
    const targetUser = await User.findById(req.params.userId);
    if (!targetUser) return res.status(404).json({ message: "User not found" });
    targetUser.role = role;
    await targetUser.save();
    res.json({ message: "Role updated", user: { id: targetUser._id, name: targetUser.name, role: targetUser.role } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Delete user
app.delete("/api/auth/users/:userId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await User.findByIdAndDelete(req.params.userId);
    await Product.deleteMany({ sellerId: req.params.userId });
    res.json({ message: "User and their products deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Admin: Delete product
app.delete("/api/products/:productId", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.userId);
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    await Product.findByIdAndDelete(req.params.productId);
    res.json({ message: "Product deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT} - server.js:140`));
