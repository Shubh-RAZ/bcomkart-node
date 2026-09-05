import "dotenv/config";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Coupon, Order, Product, User } from "./models.js";
import { requireAdmin, requireAuth, signUser, requestOTP, verifyOTP, loginWithPassword } from "./auth.js";

const app = express();
const port = process.env.PORT || 4000;
app.set("trust proxy", 1);
const allowedOrigins = (process.env.CLIENT_ORIGINS || process.env.CLIENT_ORIGIN || "http://localhost:5173,https://bcomkart.netlify.app")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const uploadsDirectory = path.join(currentDirectory, "../uploads");
fs.mkdirSync(uploadsDirectory, { recursive: true });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => callback(null, file.mimetype.startsWith("image/"))
});
app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const imageBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "productImages" });
const saveImage = (file) => new Promise((resolve, reject) => {
  const filename = randomUUID();
  const stream = imageBucket().openUploadStream(filename, { metadata: { contentType: file.mimetype } });
  stream.on("error", reject);
  stream.on("finish", () => resolve(filename));
  stream.end(file.buffer);
});

app.get("/uploads/:filename", asyncRoute(async (req, res) => {
  const file = await imageBucket().find({ filename: req.params.filename }).next();
  if (!file) return res.status(404).json({ message: "Image not found" });
  res.type(file.metadata?.contentType || file.contentType || "application/octet-stream");
  res.set("Cache-Control", "public, max-age=31536000, immutable");
  imageBucket().openDownloadStreamByName(req.params.filename).on("error", () => {
    if (!res.headersSent) res.status(404).end();
  }).pipe(res);
}));

const googleProfile = async (accessToken) => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw new Error("Google token is invalid");
  return response.json();
};

app.get("/api/health", (req, res) => res.json({ status: "ok" }));
app.post("/api/auth/google", asyncRoute(async (req, res) => {
  if (!req.body.accessToken) return res.status(400).json({ message: "Google access token is required" });
  const profile = await googleProfile(req.body.accessToken);
  const role = profile.email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase() ? "ADMIN" : undefined;
  const user = await User.findOneAndUpdate(
    { email: profile.email.toLowerCase() },
    { $setOnInsert: { name: profile.name || profile.email.split("@")[0], role: role || "USER" } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  res.json({ token: signUser(user), user: { userId: user.userId, name: user.name, email: user.email, role: user.role, carts: user.carts } });
}));
app.post("/api/auth/request-otp", asyncRoute(requestOTP));
app.post("/api/auth/verify-otp", asyncRoute(verifyOTP));
app.post("/api/auth/login", asyncRoute(loginWithPassword));
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

app.get("/api/products", asyncRoute(async (req, res) => res.json(await Product.find().sort({ createdAt: -1 }))));
app.post("/api/products", requireAuth, requireAdmin, upload.single("image"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "Product image is required" });
  const filename = await saveImage(req.file);
  const product = await Product.create({ ...req.body, image: `${req.protocol}://${req.get("host")}/uploads/${filename}` });
  res.status(201).json(product);
}));
app.patch("/api/products/:productId", requireAuth, requireAdmin, upload.single("image"), asyncRoute(async (req, res) => {
  const updates = { ...req.body };
  if (req.file) {
    const filename = await saveImage(req.file);
    updates.image = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
  }
  const product = await Product.findOneAndUpdate({ productId: req.params.productId }, updates, { new: true, runValidators: true });
  if (!product) return res.status(404).json({ message: "Product not found" });
  res.json(product);
}));
app.delete("/api/products/:productId", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await Product.deleteOne({ productId: req.params.productId });
  if (!result.deletedCount) return res.status(404).json({ message: "Product not found" });
  res.status(204).end();
}));

app.get("/api/users", requireAuth, requireAdmin, asyncRoute(async (req, res) => res.json(await User.find().select("-__v").sort({ createdAt: -1 }))));
app.patch("/api/users/:userId/role", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  if (!["ADMIN", "USER"].includes(req.body.role)) return res.status(400).json({ message: "Role must be ADMIN or USER" });
  const user = await User.findOneAndUpdate({ userId: req.params.userId }, { role: req.body.role }, { new: true }).select("-__v");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
}));

app.get("/api/coupons", requireAuth, requireAdmin, asyncRoute(async (req, res) => res.json(await Coupon.find().sort({ expiryDate: 1 }))));
app.post("/api/coupons", requireAuth, requireAdmin, asyncRoute(async (req, res) => res.status(201).json(await Coupon.create(req.body))));
app.patch("/api/coupons/:couponId", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const coupon = await Coupon.findOneAndUpdate({ couponId: req.params.couponId }, req.body, { new: true, runValidators: true });
  if (!coupon) return res.status(404).json({ message: "Coupon not found" });
  res.json(coupon);
}));
app.delete("/api/coupons/:couponId", requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const result = await Coupon.deleteOne({ couponId: req.params.couponId });
  if (!result.deletedCount) return res.status(404).json({ message: "Coupon not found" });
  res.status(204).end();
}));

app.get("/api/orders", requireAuth, asyncRoute(async (req, res) => res.json(await Order.find({ userId: req.user.userId }).sort({ createdAt: -1 }))));
app.post("/api/orders", requireAuth, asyncRoute(async (req, res) => res.status(201).json(await Order.create({ ...req.body, userId: req.user.userId }))));
app.patch("/api/cart", requireAuth, asyncRoute(async (req, res) => {
  const user = await User.findOneAndUpdate({ userId: req.user.userId }, { carts: req.body.carts || [] }, { new: true });
  res.json({ carts: user.carts });
}));

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError || error.message === "Unexpected field") return res.status(400).json({ message: error.message });
  if (error.message === "JWT_SECRET is not configured") return res.status(503).json({ message: "Authentication is temporarily unavailable. Configure JWT_SECRET on the API server." });
  if (error.name === "ValidationError" || error.code === 11000) return res.status(400).json({ message: error.message });
  console.error(error);
  res.status(500).json({ message: "Internal server error" });
});

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bcomkart")
  .then(() => app.listen(port, () => console.log(`bcomkart API listening on http://localhost:${port}`)))
  .catch((error) => { console.error("MongoDB connection failed", error); process.exit(1); });
