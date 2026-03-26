/* ============================================================
   middleware/verifyAdmin.js
   JWT authentication middleware for ADMIN-only routes.

   Usage: router.get("/route", verifyAdmin, handler)

   Checks:
   1. Authorization header exists
   2. Token format is "Bearer <token>"
   3. Token is valid and not expired
   4. User role is "admin"
   ============================================================ */

const jwt = require("jsonwebtoken");

function verifyAdmin(req, res, next) {

  const authHeader = req.headers.authorization;

  /* Step 1 — Ensure Authorization header is present */
  if (!authHeader) {
    return res.status(401).json({ error: "Authorization token required" });
  }

  /* Step 2 — Ensure header follows "Bearer <token>" format */
  if (!authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Invalid token format. Use: Bearer <token>" });
  }

  /* Step 3 — Extract the token from the header */
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Token is missing" });
  }

  /* Step 4 — Verify and decode the JWT */
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "mcet_secret_key_2024");

    /* Step 5 — Ensure the user has admin role */
    if (decoded.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin role required." });
    }

    /* Step 6 — Attach decoded user info to request for use in route handlers */
    req.user = decoded;

    next(); /* Proceed to the route handler */

  } catch (err) {
    /* Token is invalid, tampered, or expired */
    return res.status(403).json({ error: "Invalid or expired token" });
  }
}

module.exports = verifyAdmin;