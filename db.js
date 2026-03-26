/**
 * ============================================================
 * db.js — MySQL Connection Pool Configuration
 * ============================================================
 * Creates a shared database connection pool to be used throughout
 * the application. Using a pool ensures efficient connection
 * management and prevents bottlenecks.
 *
 * @module db
 * ============================================================
 */

const mysql = require("mysql2");
require("dotenv").config();

/* 
 * Create connection pool using environment variables.
 * Note: queueLimit: 0 means no limit on the number of connection requests the pool will queue.
 */
const db = mysql.createPool({
  host:               process.env.DB_HOST,
  user:               process.env.DB_USER,
  password:           process.env.DB_PASS,
  database:           process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

/* 
 * Verify the database connection on startup.
 * If connection fails, it will log the error message but won't stop the server.
 */
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ [DATABASE] Connection failed:", err.message);
  } else {
    console.log("✅ [DATABASE] MySQL connected successfully");
    connection.release();
  }
});

module.exports = db;

