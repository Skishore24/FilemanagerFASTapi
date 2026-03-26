/**
 * ============================================================
 * server.js — Main Application Entry Point
 * ============================================================
 * Configures Express server, security middlewares, static files,
 * API routes, and global error handling.
 * 
 * Powered by MCET File Manager Core.
 * ============================================================
 */

require("dotenv").config();

const express   = require("express");
const cors      = require("cors");
const helmet    = require("helmet");
const rateLimit = require("express-rate-limit");
const path      = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

/**
 * ============================================================
 * SECTION 1 — SECURITY HEADERS (Helmet)
 * ============================================================
 * Configures Content Security Policy (CSP) and other HTTP headers
 * to protect against common web vulnerabilities.
 */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com"
        ],
        scriptSrcAttr: ["'self'", "'unsafe-inline'"],
        mediaSrc: ["'self'", "blob:"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "blob:",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://flagcdn.com",
          "https://*.googleusercontent.com"
        ],
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://ipwho.is/",
          "https://ipapi.co/"
        ],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'", "blob:", "data:"],
        objectSrc: ["'self'", "data:"],
        frameAncestors: ["'self'"]
      }
    },
    xFrameOptions: false
  })
);

/* Hide Express signature from headers */
app.disable("x-powered-by");

/**
 * ============================================================
 * SECTION 2 — CORS CONFIGURATION
 * ============================================================
 */
app.use(cors({
  origin:      process.env.ALLOWED_ORIGIN || "http://localhost:5000",
  methods:     ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

/* Trust proxy for accurate rate-limiting behind Load Balancers/CDN */
app.set("trust proxy", 1);

/**
 * ============================================================
 * SECTION 3 — RATE LIMITING
 * ============================================================
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, /* 15 minutes */
  max: 10,
  message: { error: "Too many OTP requests. Please try again later." }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts. Please try again later." }
});

const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100
});

app.use("/api/send-otp",   otpLimiter);
app.use("/api/verify-otp", otpLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api",            apiLimiter);

/* Prevent referrer leakage */
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

/**
 * ============================================================
 * SECTION 4 — PARSERS & STATIC FILES
 * ============================================================
 */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

/* Serve static frontend assets with caching */
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: "1d",
  etag: true
}));

/* Serve uploaded files for admin preview to fix 404 */
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  maxAge: "1d"
}));

/**
 * ============================================================
 * SECTION 5 — ROUTE REGISTRATION
 * ============================================================
 */
const otpRoutes        = require("./routes/otpRoutes");
const fileRoutes       = require("./routes/fileRoutes");
const categoriesRoutes = require("./routes/categoriesRoutes");
const logRoutes        = require("./routes/logRoutes");
const userRoutes       = require("./routes/userRoutes");
const dashboardRoutes  = require("./routes/dashboardRoutes");
const protectedFiles   = require("./routes/protectedFiles");
const authRoutes       = require("./routes/authRoutes");

app.use("/api",            logRoutes);
app.use("/api",            otpRoutes);
app.use("/api/files",      fileRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/users",      userRoutes);
app.use("/api",            dashboardRoutes);
app.use("/api/auth",       authRoutes);
app.use("/secure-files",   protectedFiles);

/**
 * ============================================================
 * SECTION 6 — GLOBAL ERROR HANDLER
 * ============================================================
 */
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === "production";
  
  /* Log error details internally */
  console.error(`❌ [SERVER ERROR] ${err.message}`);
  if (!isProd) console.error(err.stack);

  /* Send clean JSON error response */
  res.status(err.status || 500).json({
    error: isProd ? "Internal server error" : err.message
  });
});

/**
 * ============================================================
 * SECTION 7 — BOOTSTRAP
 * ============================================================
 */
app.listen(PORT, () => {
  console.log(`✅ [SERVER] Running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});
