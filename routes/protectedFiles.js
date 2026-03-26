/* ============================================================
   routes/protectedFiles.js — Secure File Serving
   ============================================================ */

const express = require("express");
const router  = express.Router();
const path    = require("path");
const fs      = require("fs");
const db      = require("../db");

/* ============================================================
   TOKEN VALIDATION (REPLACES MOBILE)
   ============================================================ */
function verifyToken(req) {
  const token = req.query.token;

  if (!token) return null;

  try {
    const decoded = Buffer.from(token, "base64").toString();
    const parts = decoded.split(":");
    const mobile = parts[0];
    const timestamp = parts[1];

    /* Basic sanity check: mobile must exist, start with + and timestamp shouldn't be too old */
    if (!mobile || !timestamp) return null;
    
    /* Session expiry check (10 minutes) */
    if (Date.now() - parseInt(timestamp) > 10 * 60 * 1000) return null;

    return decodeURIComponent(mobile).trim();
  } catch {
    return null;
  }
}

/* ============================================================
   DOWNLOAD FILE
   ============================================================ */
router.get("/download/:filename", async (req, res) => {

  try {
    const filename = path.basename(req.params.filename);

    if (!/^[a-zA-Z0-9._-]+$/.test(filename)) {
      return res.status(400).send("Invalid filename");
    }

    const mobile = verifyToken(req);
    if (!mobile) {
      return res.status(403).send("Unauthorized");
    }

    const filePath = path.join(__dirname, "..", "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    /* FILE SIZE LIMIT */
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(400).send("File too large");
    }

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    res.download(filePath);

  } catch (err) {
    console.error("Download error:", err.message);
    res.status(500).send("Download failed");
  }

});


/* ============================================================
   VIEW FILE
   ============================================================ */
router.get("/:filename", async (req, res) => {

  try {
    const filename = path.basename(req.params.filename);

    const mobile = verifyToken(req);

    if (!mobile) {
      return res.status(403).send("Unauthorized access");
    }

    /* CHECK FILE EXISTS IN DB */
    const [rows] = await db.promise().query(
      "SELECT * FROM files WHERE name = ?",
      [filename]
    );

    if (rows.length === 0) {
      return res.status(404).send("File not found in DB");
    }

    const filePath = path.join(__dirname, "..", "uploads", filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File missing from disk");
    }

    /* FILE TYPE PROTECTION */
    const allowedExtensions = ["pdf","jpg","jpeg","png","doc","docx"];
    const ext = filename.split(".").pop().toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      return res.status(400).send("File type not allowed");
    }

    /* FILE SIZE LIMIT */
    const stats = fs.statSync(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      return res.status(400).send("File too large");
    }

    /* SECURITY HEADERS */
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    /* SEND FILE */
    res.sendFile(filePath);

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }

});

module.exports = router;