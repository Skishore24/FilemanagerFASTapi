/* ============================================================
   routes/userRoutes.js — User Block/Unblock & Activity Tracking
   POST /api/users/check-block  — Check if a mobile is blocked (public)
   POST /api/users/block        — Block a mobile number (admin only)
   POST /api/users/unblock      — Unblock a mobile number (admin only)
   GET  /api/users/blocked      — List all blocked numbers (admin only)
   POST /api/users/heartbeat    — Update user's last-active timestamp
   POST /api/users/offline      — Mark user as offline (last_active = 1 min ago)
   ============================================================ */

const express     = require("express");
const router      = express.Router();
const db          = require("../db");
const jwt           = require("jsonwebtoken");
const verifyAdmin   = require("../middleware/verifyAdmin");

/**
 * GET /api/users
 * Returns a list of all unique users (by mobile) who have interacted with the system.
 * Aggregates their name, location, and activity count.
 */
router.get("/", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await db.promise().query(`
      SELECT 
        mobile, 
        MAX(name) AS name, 
        CONCAT_WS(', ', NULLIF(MAX(state), 'Unknown'), NULLIF(MAX(country), 'Unknown')) AS location,
        MAX(last_active) AS last_active,
        COUNT(*) AS total_logs
      FROM view_logs
      WHERE mobile IS NOT NULL AND mobile <> ''
      GROUP BY mobile
      ORDER BY last_active DESC
    `);
    
    /* Map to the format expected by userDetails.js */
    const users = rows.map(r => ({
      mobile: r.mobile,
      name: r.name || "Unknown",
      location: r.location || "Unknown",
      last_active: r.last_active,
      logs: { length: r.total_logs }
    }));

    res.json(users);
  } catch (err) {
    console.error("❌ [USER] Fetch users error:", err.message);
    res.status(500).json({ error: "Failed to load users" });
  }
});


/* ============================================================
   POST /api/users/check-block
   Called by the user page before opening a file.
   Returns { blocked: true/false } for the given mobile number.
   Public — does not require login.
   ============================================================ */
router.post("/check-block", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ error: "Mobile number is required" });

  try {
    const [result] = await db.promise().query(
      "SELECT * FROM blocked_users WHERE mobile = ?",
      [mobile]
    );
    /* Returns true if the mobile was found in the blocked_users table */
    res.json({ blocked: result.length > 0 });
  } catch (err) {
    console.error("❌ [USER] Check block error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


/* ============================================================
   POST /api/users/block
   Adds a mobile number to the blocked_users table.
   INSERT IGNORE prevents duplicate block entries.
   ============================================================ */
router.post("/block", verifyAdmin, async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ success: false, error: "Mobile number is required" });

  try {
    /* Use TRIM to avoid whitespace issues */
    await db.promise().query(
      "INSERT IGNORE INTO blocked_users (mobile) VALUES (TRIM(?))",
      [mobile]
    );
    res.json({ success: true, message: "User blocked successfully" });
  } catch (err) {
    console.error("❌ [USER] Block error:", err.message);
    res.status(500).json({ success: false, error: "Failed to block user" });
  }
});


/* ============================================================
   POST /api/users/unblock
   Removes a mobile number from the blocked_users table.
   ============================================================ */
router.post("/unblock", verifyAdmin, async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.status(400).json({ success: false, error: "Mobile number is required" });

  try {
    await db.promise().query(
      "DELETE FROM blocked_users WHERE TRIM(mobile) = TRIM(?)",
      [mobile]
    );
    res.json({ success: true, message: "User unblocked successfully" });
  } catch (err) {
    console.error("❌ [USER] Unblock error:", err.message);
    res.status(500).json({ error: "Failed to unblock user" });
  }
});


/* ============================================================
   GET /api/users/blocked
   Returns a list of all currently blocked mobile numbers.
   ============================================================ */
router.get("/blocked", verifyAdmin, async (req, res) => {
  try {
    const [result] = await db.promise().query("SELECT TRIM(mobile) as mobile FROM blocked_users");
    res.json(result);
  } catch (err) {
    console.error("❌ [USER] Fetch blocked error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


/* ============================================================
   POST /api/users/heartbeat
   Called every 60 seconds by the user page while a file is open.
   Updates last_active to NOW() for the most recent view log row.
   The dashboard uses last_active to show who is currently online.
   ============================================================ */
router.post("/heartbeat", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.json({ success: false });

  try {
    /* Check if user is blocked */
    const [blocked] = await db.promise().query("SELECT 1 FROM blocked_users WHERE mobile = ?", [mobile]);
    if (blocked.length > 0) {
      return res.json({ success: true, blocked: true });
    }

    /* Update only the most recent view_log row for this mobile */
    await db.promise().query(
      `UPDATE view_logs
       SET last_active = NOW()
       WHERE id = (
         SELECT id FROM (
           SELECT id FROM view_logs
           WHERE mobile = ?
           ORDER BY viewed_at DESC
           LIMIT 1
         ) AS t
       )`,
      [mobile]
    );
    res.json({ success: true, blocked: false });
  } catch (err) {
    console.error("❌ [USER] Heartbeat error:", err.message);
    res.json({ success: false });
  }
});


/* ============================================================
   POST /api/users/offline
   Called via navigator.sendBeacon when the user closes the tab.
   Sets last_active to 1 minute ago so the dashboard shows them offline.
   ============================================================ */
router.post("/offline", async (req, res) => {
  const { mobile } = req.body;
  if (!mobile) return res.json({ success: false });

  try {
    await db.promise().query(
      `UPDATE view_logs
       SET last_active = DATE_SUB(NOW(), INTERVAL 1 MINUTE)
       WHERE id = (
         SELECT id FROM (
           SELECT id FROM view_logs
           WHERE mobile = ?
           ORDER BY viewed_at DESC
           LIMIT 1
         ) AS t
       )`,
      [mobile]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [USER] Offline update error:", err.message);
    res.json({ success: false });
  }
});

module.exports = router;
