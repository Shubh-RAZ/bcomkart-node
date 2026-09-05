import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

const id = () => randomUUID();

export const User = mongoose.model("User", new mongoose.Schema({
  userId: { type: String, default: id, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null }, // For OTP/password authentication
  carts: { type: [String], default: [] },
  role: { type: String, enum: ["ADMIN", "USER"], default: "USER" }
}, { timestamps: true }));

export const Product = mongoose.model("Product", new mongoose.Schema({
  productId: { type: String, default: id, unique: true },
  productName: { type: String, required: true, trim: true },
  productDescription: { type: String, required: true, trim: true },
  price: { type: Number, required: true, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  image: { type: String, required: true, trim: true }
}, { timestamps: true }));

export const Order = mongoose.model("Order", new mongoose.Schema({
  orderId: { type: String, default: id, unique: true },
  userId: { type: String, required: true, index: true },
  products: [{ productId: { type: String, required: true }, quantity: { type: Number, default: 1, min: 1 } }],
  coupons: { type: [String], default: [] },
  address_line_1: { type: String, required: true },
  address_line_2: String,
  address_line_3: String,
  postalCode: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  phone: { type: String, required: true }
}, { timestamps: true }));

export const Coupon = mongoose.model("Coupon", new mongoose.Schema({
  couponId: { type: String, default: id, unique: true },
  discountPrice: { type: Number, required: true, min: 0 },
  expiryDate: { type: Date, required: true }
}, { timestamps: true }));
