require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Product = require("./models/Product");

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

// Products: Get all
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    res.json(products);
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT} - server.js:140`));
