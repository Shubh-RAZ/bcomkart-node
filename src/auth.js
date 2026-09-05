import jwt from "jsonwebtoken";
import { User } from "./models.js";

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
};

export function signUser(user) {
  return jwt.sign({ userId: user.userId, role: user.role, email: user.email }, secret(), { expiresIn: "7d" });
}

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Authentication required" });
    req.auth = jwt.verify(token, secret());
    req.user = await User.findOne({ userId: req.auth.userId }).lean();
    if (!req.user) return res.status(401).json({ message: "User account not found" });
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ message: "Admin access required" });
  next();
}
