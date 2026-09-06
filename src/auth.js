import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import bcryptjs from "bcryptjs";
import { User } from "./models.js";

const secret = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return process.env.JWT_SECRET;
};

// In-memory OTP store: { email: { otp: "123456", expiresAt: timestamp, name: "...", password: "..." } }
const otpStore = new Map();
const OTP_EXPIRY_MINUTES = 5;

// Configure Nodemailer transporter with fallback options
const getTransporter = () => {
  // Try standard Gmail SMTP first
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true, // Use TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
};

const transporter = getTransporter();

// Log email configuration on startup (for debugging)
console.log("📧 Email Configuration:");
console.log(`   EMAIL_USER: ${process.env.EMAIL_USER || "NOT SET"}`);
console.log(`   EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD || "NOT SET"}`);
console.log(`   EMAIL_PASSWORD length: ${process.env.EMAIL_PASSWORD ? process.env.EMAIL_PASSWORD.length : 0}`);

// Verify email configuration on startup (non-blocking)
if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
  transporter.verify().then(() => {
    console.log("✅ Email service is ready");
  }).catch((error) => {
    console.error("❌ Email service configuration error:", error.message);
  });
}

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
    console.log(`   Sending email from ${process.env.EMAIL_USER} to ${email}...`);
    
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("   ❌ Missing credentials:");
      console.error(`      EMAIL_USER: ${process.env.EMAIL_USER || "NOT SET"}`);
      console.error(`      EMAIL_PASSWORD: ${process.env.EMAIL_PASSWORD ? "SET" : "NOT SET"}`);
      throw new Error("Email credentials are not configured in environment");
    }

    console.log(`   📋 Using credentials:`);
    console.log(`      From: ${process.env.EMAIL_USER}`);
    console.log(`      Password length: ${process.env.EMAIL_PASSWORD.length}`);
    console.log(`      Password preview: ${process.env.EMAIL_PASSWORD.substring(0, 4)}***${process.env.EMAIL_PASSWORD.slice(-4)}`);
    
    const mailOptions = {
      from: `"bcom.kart" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Your bcom.kart Verification Code: ${otp}`,
      html: generateOTPEmailHTML(name, otp),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`   ✅ Email sent (Message ID: ${info.messageId})`);
  } catch (error) {
    console.error(`   ❌ Failed to send email:`);
    console.error(`      Error: ${error.message}`);
    console.error(`      Code: ${error.code}`);
    console.error(`      Command: ${error.command}`);
    
    // Log OTP to console as fallback for debugging
    console.log(`   [FALLBACK] OTP for ${email} (${name}): ${otp}`);
    
    // Re-throw with more specific error message
    if (error.code === "EAUTH") {
      throw new Error("Email authentication failed - check EMAIL_USER and EMAIL_PASSWORD");
    } else if (error.code === "ESOCKET") {
      throw new Error("Cannot connect to email service - check internet connection");
    }
    throw error;
  }
}

// Check if email exists (without sending OTP)
export async function checkEmailExists(req, res) {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail }).lean();

    res.json({ exists: !!existingUser });
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({ message: "Failed to check email" });
  }
}

// Store OTP in memory with expiry
export async function requestOTP(req, res) {
  try {
    console.log("📧 OTP request received");
    console.log("   Request body:", { name: req.body.name, email: req.body.email, password: req.body.password ? "***" : undefined });
    
    // Validate email configuration
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("❌ Email service not configured: EMAIL_USER or EMAIL_PASSWORD is missing");
      return res.status(503).json({ message: "Email service is not configured on the server" });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      console.warn("❌ Missing required fields:", { name: !!name, email: !!email, password: !!password });
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otp = generateOTP();
    const expiresAt = Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000;

    otpStore.set(normalizedEmail, { otp, expiresAt, name: name.trim(), password });
    console.log(`   OTP generated for ${normalizedEmail}: ${otp}`);
    
    // Send OTP email
    await sendOTPEmail(normalizedEmail, otp, name);

    console.log(`✅ OTP request successful for ${normalizedEmail}`);
    res.json({ message: `Verification code sent to ${normalizedEmail}` });
  } catch (error) {
    console.error("❌ Error in requestOTP:", error);
    console.error("   Error message:", error.message);
    console.error("   Error stack:", error.stack);
    res.status(500).json({ message: error.message || "Failed to send verification code" });
  }
}

// Verify OTP and authenticate user (for new accounts)
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

    // Hash the password before saving
    const hashedPassword = await bcryptjs.hash(storedData.password, 10);

    // OTP verified - create new user
    const role = normalizedEmail === process.env.ADMIN_EMAIL?.toLowerCase() ? "ADMIN" : "USER";
    const user = await User.create({
      name: storedData.name,
      email: normalizedEmail,
      password: hashedPassword,
      role
    });

    // Clean up OTP
    otpStore.delete(normalizedEmail);

    res.json({ token: signUser(user), user: { userId: user.userId, name: user.name, email: user.email, role: user.role, carts: user.carts } });
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ message: "Failed to verify code" });
  }
}

// Login with email and password (for existing accounts)
export async function loginWithPassword(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Compare provided password with stored hash
    const passwordMatch = await bcryptjs.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    console.log(`✅ User ${normalizedEmail} logged in successfully`);
    res.json({ token: signUser(user), user: { userId: user.userId, name: user.name, email: user.email, role: user.role, carts: user.carts } });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Login failed" });
  }
}

// Generate beautiful HTML template for order confirmation email
function generateOrderConfirmationEmailHTML(name, orderId, orderDate, products, totalAmount, trackingLink, deliveryAddress) {
  const productListHTML = products.map(p => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #eee;">
        <div style="font-weight: 600; color: #333;">${p.productName}</div>
        <div style="font-size: 12px; color: #999;">Qty: ${p.quantity}</div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #eee; text-align: right;">
        <div style="font-weight: 600; color: #667eea;">₹${(p.price * p.quantity).toLocaleString('en-IN')}</div>
        <div style="font-size: 12px; color: #999;">₹${p.price.toLocaleString('en-IN')} each</div>
      </td>
    </tr>
  `).join('');

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
        .order-id-section {
          background: #f0f4f8;
          padding: 20px;
          border-left: 4px solid #667eea;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .order-id-label {
          font-size: 12px;
          text-transform: uppercase;
          color: #999;
          letter-spacing: 1px;
          margin-bottom: 8px;
        }
        .order-id {
          font-size: 20px;
          font-weight: 700;
          color: #667eea;
          font-family: 'Courier New', monospace;
        }
        .order-details {
          background: #f8f9fa;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
          font-size: 14px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          padding-bottom: 12px;
          border-bottom: 1px solid #e0e0e0;
        }
        .detail-row:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }
        .detail-label {
          color: #666;
          font-weight: 500;
        }
        .detail-value {
          color: #333;
          font-weight: 600;
        }
        .products-section {
          margin-bottom: 30px;
        }
        .section-title {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 2px solid #667eea;
        }
        .products-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        .products-table tr td {
          padding: 12px;
          border-bottom: 1px solid #eee;
        }
        .products-table tr:last-child td {
          border-bottom: none;
        }
        .total-section {
          background: linear-gradient(135deg, #f5f7fa 0%, #f0f4f8 100%);
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .total-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 10px;
          font-size: 14px;
        }
        .total-row.grand-total {
          font-size: 18px;
          font-weight: 700;
          color: #667eea;
          border-top: 2px solid #ddd;
          padding-top: 10px;
          margin-top: 10px;
        }
        .track-button {
          display: inline-block;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 14px 40px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 600;
          text-align: center;
          width: 100%;
          box-sizing: border-box;
          margin-bottom: 20px;
          transition: transform 0.2s ease;
        }
        .track-button:hover {
          transform: translateY(-2px);
        }
        .cta-section {
          text-align: center;
          margin-bottom: 30px;
        }
        .delivery-info {
          background: #e8f4f8;
          border-left: 4px solid #17a2b8;
          padding: 15px;
          border-radius: 4px;
          font-size: 13px;
          color: #0c5460;
          margin-bottom: 20px;
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
        .address-block {
          background: #f9f9f9;
          padding: 15px;
          border-radius: 6px;
          font-size: 13px;
          line-height: 1.6;
          color: #333;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="email-wrapper">
          <div class="header">
            <div class="logo">bcom<span>.kart</span></div>
            <div class="header-subtitle">Order Confirmation</div>
          </div>
          
          <div class="content">
            <div class="greeting">Hello ${name},</div>
            
            <p style="color: #666; margin-bottom: 30px;">Thank you for your order! We've received your order and will start processing it right away.</p>
            
            <div class="order-id-section">
              <div class="order-id-label">Order Number</div>
              <div class="order-id">${orderId}</div>
            </div>
            
            <div class="order-details">
              <div class="detail-row">
                <span class="detail-label">Order Date:</span>
                <span class="detail-value">${new Date(orderDate).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Payment Method:</span>
                <span class="detail-value">Cash on Delivery (COD)</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Order Status:</span>
                <span class="detail-value" style="color: #ffc107;">PENDING</span>
              </div>
            </div>
            
            <div class="products-section">
              <div class="section-title">Order Items</div>
              <table class="products-table">
                ${productListHTML}
              </table>
            </div>
            
            <div class="total-section">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>₹${totalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div class="total-row">
                <span>Delivery Charge:</span>
                <span>₹49</span>
              </div>
              <div class="total-row grand-total">
                <span>Total Amount:</span>
                <span>₹${(totalAmount + 49).toLocaleString('en-IN')}</span>
              </div>
            </div>
            
            <div class="delivery-info">
              📦 <strong>Expected Delivery:</strong> Your order will be delivered within 3-5 business days.
            </div>
            
            <div class="cta-section">
              <a href="${trackingLink}" class="track-button">Track Your Order</a>
            </div>
            
            <div class="section-title" style="margin-top: 30px;">Delivery Address</div>
            <div class="address-block">
              ${deliveryAddress}
            </div>
            
            <p style="color: #666; margin-top: 30px; font-size: 13px;">
              <strong>Need Help?</strong> If you have any questions about your order, please contact our customer support team. We're here to help!
            </p>
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

// Send order confirmation email
export async function sendOrderConfirmationEmail(email, orderData, trackingLink) {
  try {
    const mailOptions = {
      from: `"bcom.kart" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Order Confirmation: ${orderData.orderId}`,
      html: generateOrderConfirmationEmailHTML(
        orderData.userName,
        orderData.orderId,
        orderData.createdAt,
        orderData.products,
        orderData.totalAmount,
        trackingLink,
        `${orderData.address_line_1}<br/>${orderData.address_line_2 ? orderData.address_line_2 + '<br/>' : ''}${orderData.city}, ${orderData.state} - ${orderData.postalCode}<br/>📞 ${orderData.phone}`
      ),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Order confirmation email sent (Message ID: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send order confirmation email:`, error.message);
    // Don't throw - order should still be created even if email fails
    return false;
  }
}
