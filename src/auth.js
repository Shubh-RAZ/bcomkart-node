import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { User } from "./models.js";

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
};

// In-memory OTP store: { email: { otp: "123456", expiresAt: timestamp, name: "...", password: "..." } }
const otpStore = new Map();
const OTP_EXPIRY_MINUTES = 5;

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

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

// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Generate beautiful HTML email template
function generateOTPEmailHTML(name, otp) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f8f9fa;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #f8f9fa;
        }
        .email-wrapper {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          font-size: 28px;
          font-weight: bold;
          margin-bottom: 10px;
          letter-spacing: -0.5px;
        }
        .logo span {
          color: #ffd700;
        }
        .header-subtitle {
          font-size: 14px;
          opacity: 0.95;
          margin-top: 5px;
        }
        .content {
          background: white;
          padding: 40px 30px;
        }
        .greeting {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin-bottom: 20px;
        }
        .message {
          font-size: 14px;
          color: #666;
          line-height: 1.8;
          margin-bottom: 30px;
        }
        .otp-section {
          background: linear-gradient(135deg, #f5f7fa 0%, #f0f4f8 100%);
          border-left: 4px solid #667eea;
          padding: 25px;
          border-radius: 8px;
          margin: 30px 0;
          text-align: center;
        }
        .otp-label {
          font-size: 12px;
          text-transform: uppercase;
          color: #999;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        .otp-code {
          font-size: 40px;
          font-weight: 700;
          color: #667eea;
          letter-spacing: 8px;
          font-family: 'Courier New', monospace;
          background: white;
          padding: 20px;
          border-radius: 8px;
          display: inline-block;
          margin-bottom: 10px;
        }
        .otp-expiry {
          font-size: 12px;
          color: #d9534f;
          font-weight: 600;
          margin-top: 10px;
        }
        .warning {
          background-color: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
          font-size: 13px;
          color: #856404;
        }
        .footer {
          background: #f8f9fa;
          padding: 30px;
          text-align: center;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #eee;
        }
        .footer-link {
          color: #667eea;
          text-decoration: none;
        }
        .divider {
          height: 1px;
          background: #eee;
          margin: 30px 0;
        }
        .help-text {
          font-size: 13px;
          color: #666;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="email-wrapper">
          <div class="header">
            <div class="logo">bcom<span>.kart</span></div>
            <div class="header-subtitle">Secure Account Verification</div>
          </div>
          
          <div class="content">
            <div class="greeting">Hello ${name},</div>
            
            <div class="message">
              You've requested to sign in to your bcom.kart account. To complete the verification process, please use the code below. This code is valid for only 5 minutes.
            </div>
            
            <div class="otp-section">
              <div class="otp-label">Your Verification Code</div>
              <div class="otp-code">${otp}</div>
              <div class="otp-expiry">⏱️ Expires in 5 minutes</div>
            </div>
            
            <div class="warning">
              🔒 <strong>Security Note:</strong> Never share this code with anyone, including bcom.kart staff. We will never ask for this code via email or phone.
            </div>
            
            <div class="help-text">
              <strong>Didn't request this code?</strong><br>
              If you didn't try to sign in to your account, you can safely ignore this email. Your account is still secure.
            </div>
            
            <div class="divider"></div>
            
            <div class="message" style="font-size: 12px; color: #999; text-align: center;">
              Best regards,<br>
              <strong>The bcom.kart Team</strong>
            </div>
          </div>
          
          <div class="footer">
            <div>© ${new Date().getFullYear()} bcom.kart. All rights reserved.</div>
            <div style="margin-top: 10px;">
              <a href="#" class="footer-link">Privacy Policy</a> | 
              <a href="#" class="footer-link">Terms of Service</a> | 
              <a href="#" class="footer-link">Contact Support</a>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Send OTP via email using Nodemailer
async function sendOTPEmail(email, otp, name) {
  try {
    const mailOptions = {
      from: `"bcom.kart" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your bcom.kart Verification Code: ${otp}`,
      html: generateOTPEmailHTML(name, otp),
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP email sent successfully to ${email}`);
  } catch (error) {
    console.error(`❌ Failed to send OTP email to ${email}:`, error.message);
    // Log OTP to console as fallback for debugging
    console.log(`[FALLBACK] OTP for ${email} (${name}): ${otp}`);
    throw new Error("Failed to send verification email");
  }
}

// Store OTP in memory with expiry
export async function requestOTP(req, res) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    otpStore.set(normalizedEmail, { otp, expiresAt, name: name.trim(), password });
    
    // Send OTP email
    await sendOTPEmail(normalizedEmail, otp, name);

    res.json({ message: `Verification code sent to ${normalizedEmail}` });
  } catch (error) {
    console.error("Error requesting OTP:", error);
    res.status(500).json({ message: "Failed to send verification code" });
  }
}

// Verify OTP and authenticate user
export async function verifyOTP(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const storedData = otpStore.get(normalizedEmail);

    if (!storedData) {
      return res.status(400).json({ message: "No verification code was requested for this email" });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ message: "Verification code has expired" });
    }

    if (storedData.otp !== otp.trim()) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    // OTP verified - create or update user
    const role = normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase() ? "ADMIN" : "USER";
    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { $setOnInsert: { name: storedData.name, role } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Clean up OTP
    otpStore.delete(normalizedEmail);

    res.json({ token: signUser(user), user: { userId: user.userId, name: user.name, email: user.email, role: user.role, carts: user.carts } });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Failed to verify code" });
  }
}
