/* ============================================================
   routes/dashboardRoutes.js — Admin Dashboard Data
   GET /api/dashboard         — Summary stats (totals)
   GET /api/dashboard/charts  — Chart data (performance, devices, countries, users)
   ============================================================ */

const express     = require("express");
const router      = express.Router();
const db          = require("../db");
const verifyAdmin = require("../middleware/verifyAdmin");


/* ============================================================
   GET /api/dashboard
   Returns top-level statistics shown on the admin dashboard:
   - Total files uploaded
   - Total views logged
   - Total categories
   - Currently active users (seen in last 30 seconds)
   - Most viewed file name
   ============================================================ */
router.get("/dashboard", verifyAdmin, async (req, res) => {

  try {

    /* Count total files in the database */
    const [files] = await db.promise().query(
      "SELECT COUNT(*) AS totalFiles FROM files"
    );

    /* Count total view/download events logged */
    const [views] = await db.promise().query(
      "SELECT COUNT(*) AS totalViews FROM view_logs"
    );

    /* Count categories */
    const [categories] = await db.promise().query(
      "SELECT COUNT(*) AS totalCategories FROM categories"
    );

    /* Count unique users who sent a heartbeat in the last 30 seconds (online now) */
    const [users] = await db.promise().query(`
      SELECT COUNT(DISTINCT mobile) AS totalUsers
      FROM view_logs
      WHERE last_active >= NOW() - INTERVAL 120 SECOND
        AND mobile IS NOT NULL
        AND mobile <> ''
    `);

    /* Find the single most-viewed file */
    const [topFile] = await db.promise().query(`
      SELECT file_name, COUNT(*) AS total
      FROM view_logs
      GROUP BY file_name
      ORDER BY total DESC
      LIMIT 1
    `);

    /* Send all stats as a single JSON object */
    res.json({
      totalFiles:      files[0]?.totalFiles      || 0,
      totalViews:      views[0]?.totalViews      || 0,
      totalCategories: categories[0]?.totalCategories || 0,
      totalUsers:      users[0]?.totalUsers      || 0,
      topFile:         topFile.length ? topFile[0].file_name : "None"
    });

  } catch (err) {
    console.error("Dashboard stats error:", err.message);
    res.status(500).json({ error: "Failed to load dashboard stats" });
  }

});


/* ============================================================
   GET /api/dashboard/charts
   Returns data for all charts displayed on the admin dashboard:
   - performance: monthly views + downloads (last 12 months)
   - devices: Mobile vs Desktop vs Other breakdown
   - countries: top 10 countries by views
   - topUsers: top 5 most active users
   - views: monthly unique user count (last 12 months)
   ============================================================ */
router.get("/dashboard/charts", verifyAdmin, async (req, res) => {

  try {

    /* Monthly performance: views and downloads per month for the past year */
    const [performance] = await db.promise().query(`
      SELECT
        DATE_FORMAT(viewed_at, '%b') AS month,
        COUNT(*) AS views,
        SUM(CASE WHEN action = 'download' THEN 1 ELSE 0 END) AS downloads
      FROM view_logs
      WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY YEAR(viewed_at), MONTH(viewed_at), DATE_FORMAT(viewed_at, '%b')
      ORDER BY YEAR(viewed_at), MONTH(viewed_at)
    `);

    /* Device breakdown: classify user-agent into Mobile/Desktop/Other */
    const [devices] = await db.promise().query(`
      SELECT
        CASE
          WHEN device REGEXP 'Android|iPhone|iPad' THEN 'Mobile'
          WHEN device REGEXP 'Windows|Mac|Linux'   THEN 'Desktop'
          ELSE 'Other'
        END AS device,
        COUNT(*) AS total
      FROM view_logs
      GROUP BY device
    `);

    /* Top 10 countries by total views */
    const [countries] = await db.promise().query(`
      SELECT
        country,
        COUNT(*) AS views,
        SUM(CASE WHEN action = 'download' THEN 1 ELSE 0 END) AS downloads
      FROM view_logs
      WHERE country IS NOT NULL
        AND country <> ''
        AND country <> 'Unknown'
      GROUP BY country
      ORDER BY views DESC
      LIMIT 10
    `);

    /* Top 5 most active users by total visits */
    const [topUsers] = await db.promise().query(`
      SELECT
        COALESCE(name, 'Unknown') AS name,
        mobile,
        COUNT(*) AS totalVisits,
        MAX(last_active) AS lastActive
      FROM view_logs
      WHERE mobile IS NOT NULL
        AND mobile <> ''
      GROUP BY mobile, name
      ORDER BY totalVisits DESC
      LIMIT 5
    `);

    /* Monthly unique user count for bar chart (last 12 months) */
    const [views] = await db.promise().query(`
      SELECT
        DATE_FORMAT(MIN(viewed_at), '%b') AS month,
        COUNT(DISTINCT mobile) AS total,
        YEAR(viewed_at)  AS y,
        MONTH(viewed_at) AS m
      FROM view_logs
      WHERE viewed_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
        AND mobile IS NOT NULL
        AND mobile <> ''
      GROUP BY YEAR(viewed_at), MONTH(viewed_at)
      ORDER BY YEAR(viewed_at), MONTH(viewed_at)
    `);

    /* Return all chart datasets in one response */
    res.json({ performance, devices, countries, topUsers, views });

  } catch (err) {
    console.error("Dashboard charts error:", err.message);
    res.status(500).json({ error: "Failed to load chart data" });
  }

});

module.exports = router;