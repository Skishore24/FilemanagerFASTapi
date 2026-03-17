/* ============================================================
   server.js — Main entry point for MCET File Manager
   Configures security, middleware, routes, and starts server
   ============================================================ */

require("dotenv").config();

const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const rateLimit = require("express-rate-limit");
const path     = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

/* ============================================================
   SECTION 1 — HELMET SECURITY HEADERS
   Sets HTTP security headers (CSP, XSS guard, etc.)
   ============================================================ */
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {

        /* Allow scripts from self and trusted CDNs */
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com"
        ],
        scriptSrcAttr: [
          "'self'",
          "'unsafe-inline'"
        ],
        mediaSrc: ["'self'", "blob:"],
        /* Allow styles from self and font/CDN sources */
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://fonts.googleapis.com"
        ],

        /* Allow fonts from Google and CDN */
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdnjs.cloudflare.com",
          "data:"
        ],

        /* Allow images including flags and user avatars */
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

        /* Allow fetch/XHR to self and IP geo API */
        connectSrc: [
          "'self'",
          "https://cdn.jsdelivr.net",
          "https://unpkg.com",
          "https://cdnjs.cloudflare.com",
          "https://ipwho.is/"
        ],

        /* Allow web workers (needed for PDF.js) */
        workerSrc: [
          "'self'",
          "blob:"
        ]
      }
    }
  })
);

/* Hide the X-Powered-By: Express header from responses */
app.disable("x-powered-by");


/* ============================================================
   SECTION 2 — CORS CONFIGURATION
   Restricts which origins can call the API.
   Set ALLOWED_ORIGIN in .env for production.
   ============================================================ */
app.use(cors({
  origin:      process.env.ALLOWED_ORIGIN || "http://localhost:5000",
  methods:     ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

/* Trust the first reverse proxy (needed for correct IP detection) */
app.set("trust proxy", 1);


/* ============================================================
   SECTION 3 — RATE LIMITERS
   Applied BEFORE body-parser so limits work on raw requests.
   Prevents brute-force on login and OTP endpoints.
   ============================================================ */

/* OTP send/verify — max 10 per 15 minutes per IP */
const otpLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: "Too many OTP requests. Please try again later." }
});

/* Admin login — max 10 attempts per 15 minutes per IP */
const loginLimiter = rateLimit({
  windowMs:       15 * 60 * 1000,
  max:            10,
  standardHeaders: true,
  legacyHeaders:  false,
  message:        { error: "Too many login attempts. Please try again later." }
});

/* Secure file access — max 50 per 5 minutes per IP */
const fileLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      50
});
const apiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100
});

app.use("/api/files", apiLimiter);
app.use("/api/send-otp",    otpLimiter);
app.use("/api/verify-otp",  otpLimiter);
app.use("/api/auth/login",  loginLimiter);
app.use("/secure-files",    fileLimiter);

/* Add Referrer-Policy header to all responses */
app.use((req, res, next) => {
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});


/* ============================================================
   SECTION 4 — BODY PARSERS
   Parse incoming JSON and URL-encoded request bodies.
   Limit to 2MB to prevent large payload attacks.
   ============================================================ */
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));


/* ============================================================
   SECTION 5 — STATIC FILE SERVING
   Serves the public/ folder (HTML, CSS, JS, images).
   Files are cached for 1 day with ETag validation.
   ============================================================ */
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: "1d",
    etag:   true
  })
);


/* ============================================================
   SECTION 6 — ROUTE REGISTRATION
   All API routes are grouped under /api
   File serving routes live under /secure-files
   ============================================================ */

/* Import all route modules */
const otpRoutes        = require("./routes/otpRoutes");
const fileRoutes       = require("./routes/fileRoutes");
const categoriesRoutes = require("./routes/categoriesRoutes");
const logRoutes        = require("./routes/logRoutes");
const userRoutes       = require("./routes/userRoutes");
const dashboardRoutes  = require("./routes/dashboardRoutes");
const protectedFiles   = require("./routes/protectedFiles");
const authRoutes       = require("./routes/authRoutes");

/* Mount routes */
app.use("/api",            otpRoutes);        /* /api/send-otp, /api/verify-otp   */
app.use("/api/files",      fileRoutes);       /* CRUD for uploaded files           */
app.use("/api/categories", categoriesRoutes); /* CRUD for file categories          */
app.use("/api",            logRoutes);        /* /api/save-view, /api/logs         */
app.use("/api/users",      userRoutes);       /* block/unblock, heartbeat          */
app.use("/api",            dashboardRoutes);  /* /api/dashboard, /api/dashboard/charts */
app.use("/api/auth",       authRoutes);       /* /api/auth/login                   */
app.use("/secure-files",   protectedFiles);   /* Serve/download protected files    */


/* ============================================================
   SECTION 7 — GLOBAL ERROR HANDLER
   Catches any unhandled errors thrown in routes.
   Hides stack traces from clients in production.
   ============================================================ */
app.use((err, req, res, next) => {
  /* Log full stack in dev, only message in production */
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  } else {
    console.error(`[ERROR] ${err.message}`);
  }

  res.status(err.status || 500).json({
    error: err.message || "Internal server error"
  });
});


/* ============================================================
   SECTION 8 — START SERVER
   ============================================================ */
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});