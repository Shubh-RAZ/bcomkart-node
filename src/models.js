import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const id = () => randomUUID();

export const User = mongoose.model("User", new mongoose.Schema({
  userId: { type: String, default: id, unique: true },
  name: { type: String, required: true, trim: true },
  gender: { type: String, enum: ["Male", "Diva"], default: null },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null }, // For OTP/password authentication
  carts: { type: [String], default: [] },
  wishlist: { type: [String], default: [] }, // Array of product IDs
  bcomCoins: { type: Number, default: 0, min: 0 },
  requestedProducts: [{
    requestId: { type: String, default: id },
    productName: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: { type: String, enum: ["REQUESTED", "ADDED", "DECLINED"], default: "REQUESTED" },
    requestedAt: { type: Date, default: Date.now }
  }],
  role: { type: String, enum: ["ADMIN", "USER"], default: "USER" }
}, { timestamps: true }));

export const Product = mongoose.model("Product", new mongoose.Schema({
  productId: { type: String, default: id, unique: true },
  productName: { type: String, required: true, trim: true },
  productDescription: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  category: { type: String, required: true, trim: true },
  gender: { type: String, enum: ["Male", "Diva", "All"], default: "All" },
  image: { type: String, required: true, trim: true }
}, { timestamps: true }));

export const Category = mongoose.model("Category", new mongoose.Schema({
  categoryId: { type: String, default: id, unique: true },
  name: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true }));

export const SiteSetting = mongoose.model("SiteSetting", new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, default: false }
}, { timestamps: true }));

export const Order = mongoose.model("Order", new mongoose.Schema({
  orderId: { type: String, default: id, unique: true },
  userId: { type: String, required: true, index: true },
  products: [{ productId: { type: String, required: true }, quantity: { type: Number, default: 1, min: 1 } }],
  coupons: { type: [String], default: [] },
  bcomCoinsUsed: { type: Number, default: 0, min: 0 },
  bcomCoinsEarned: { type: Number, default: 0, min: 0 },
  address_line_1: { type: String, required: true },
  address_line_2: String,
  address_line_3: String,
  postalCode: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  phone: { type: String, required: true },
  paymentMethod: { type: String, default: "COD", enum: ["COD"] },
  totalAmount: { type: Number, required: true, min: 0 },
  orderStatus: { type: String, default: "PENDING", enum: ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"] }
}, { timestamps: true }));

export const Coupon = mongoose.model("Coupon", new mongoose.Schema({
  couponId: { type: String, default: id, unique: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPrice: { type: Number, required: true, min: 0 },
  expiryDate: { type: Date, required: true },
  audience: { type: String, enum: ["ALL", "SPECIFIC_USERS", "MULTIPLE_USERS"], default: "ALL" },
  eligibleUserIds: { type: [String], default: [] }
}, { timestamps: true }));

export const OrderStatus = mongoose.model("OrderStatus", new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  status: { type: String, enum: ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED"], default: "PENDING" },
  statusUpdates: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    message: String
  }],
  trackingNumber: String,
  estimatedDelivery: Date
}, { timestamps: true }));
