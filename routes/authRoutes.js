/* ============================================================
   routes/authRoutes.js — Admin Login
   POST /api/auth/login

   Accepts: { email, password }   (email OR username without @gmail.com)
   Returns: { token, user: { email, role } }

   Uses bcrypt to compare hashed password.
   Issues a JWT (2h expiry) on successful login.
   ============================================================ */

const express = require("express");
const router  = express.Router();
const db      = require("../db");
const bcrypt  = require("bcrypt");
const jwt     = require("jsonwebtoken");


/* ---- POST /api/auth/login ---------------------------------- */
router.post("/login", async (req, res) => {

  let { email, password } = req.body;

  /* Validate that both fields are present and are strings */
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Username/Email and password are required" });
  }

  try {

    /* Allow users to log in with just a username (auto-append @gmail.com) */
    if (!email.includes("@")) {
      email = email + "@gmail.com";
    }

    /* Look up user by email */
    const [rows] = await db.promise().query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    /* Return generic 401 — do not reveal whether email exists */
    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = rows[0];

    /* Compare entered password with stored bcrypt hash */
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    /* Issue JWT with user id, role, and email — expires in 2 hours */
    const token = jwt.sign(
      {
        id:    user.id,
        role:  user.role,
        email: user.email
      },
      process.env.JWT_SECRET || "mcet_secret_key_2024",
      { expiresIn: "2h" }
    );

    /* Return token and basic user info (never return password) */
    res.json({
      token,
      user: {
        email: user.email,
        role:  user.role
      }
    });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }

});

module.exports = router;