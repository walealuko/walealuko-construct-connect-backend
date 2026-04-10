const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  category: { type: String, default: "general" },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  sellerName: { type: String },
  sellerLocation: { type: String },
  imageUrl: { type: String },
  stock: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

productSchema.index({ name: "text", description: "text", category: "text", sellerLocation: "text" });

module.exports = mongoose.model("Product", productSchema);
