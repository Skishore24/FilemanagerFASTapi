/* ============================================================
   routes/logRoutes.js — View/Download Log Management
   POST /api/save-view               — Log a file view event (public)
   POST /api/save-download           — Log a file download event (public)
   GET  /api/logs                    — List logs with search/filter/pagination (admin)
   GET  /api/logs/export             — Export all logs as Excel (admin)
   DELETE /api/logs/:id              — Delete a single log entry (admin)
   POST /api/users/delete-user-logs  — Delete all logs for a mobile number (admin)
   ============================================================ */

const express     = require("express");
const router      = express.Router();
const db          = require("../db");
const verifyAdmin = require("../middleware/verifyAdmin");
const axios       = require("axios");
const ExcelJS     = require("exceljs");


/* ============================================================
   HELPER — Extract the real client IP address.
   Priority: body-provided IP → X-Forwarded-For header → socket → req.ip
   Note: body IP is user-provided and can be spoofed.
   ============================================================ */
function getClientIp(req, bodyIp) {
  const ipFromBody = (bodyIp && bodyIp !== "Unknown") ? bodyIp : null;
  const forwardedFor = req.headers["x-forwarded-for"];
  const remoteIp = forwardedFor ? forwardedFor.split(",")[0].trim() : req.ip;
  
  return (
    ipFromBody ||
    remoteIp ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "Unknown"
  ).replace(/^.*:f{4}:/, ""); /* Strip IPv6 prefix for IPv4 addresses */
}


/* ============================================================
   GET /api/location
   Determines the client's geographic location (country, region/state, IP).
   Used by the student portal for activity logging.
   ============================================================ */
router.get("/location", async (req, res) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const ip = (forwardedFor ? forwardedFor.split(",")[0].trim() : req.ip).replace(/^.*:f{4}:/, "");

  /* Skip lookup for local addresses */
  if (ip === "::1" || ip === "127.0.0.1" || ip.includes("localhost")) {
    return res.json({
      ip:      ip,
      country: "India",
      state:   "MCET Campus, Pollachi",
      success: true
    });
  }

  try {
    /* Request geolocation from a server-side API (e.g., ip-api.com) */
    const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 4000 });
    const data     = response.data;

    if (data && data.status === "success") {
      res.json({
        ip:      data.query || ip,
        country: data.country || "Unknown",
        state:   data.regionName || "Unknown",
        success: true
      });
    } else {
      throw new Error("Geolocation service returned error status");
    }
  } catch (err) {
    console.warn("🌐 [LOCATION] Geolocation fetch failed:", err.message);
    /* Fallback to campus or global if service is unavailable */
    res.json({ 
      ip, 
      country: "Global", 
      state: "Access Zone", 
      success: false 
    });
  }
});


/* ============================================================
   POST /api/save-view
   Logs that a user opened/viewed a file.
   Called by the user page immediately when a file is opened.
   ============================================================ */
router.post("/save-view", async (req, res) => {
  const { file, name, mobile, country, state, device, ip: bodyIp } = req.body;

  /* Both file and mobile are required to create a meaningful log */
  if (!file || !mobile) {
    return res.status(400).json({ error: "File name and mobile number are required" });
  }

  const ip = getClientIp(req, bodyIp);

  try {
    const isLocal = ip === "::1" || ip === "127.0.0.1" || ip.includes("localhost");
    const finalCountry = (country && country !== "Unknown") ? country : (isLocal ? "India" : null);
    const finalState   = (state   && state   !== "Unknown") ? state   : (isLocal ? "MCET Campus, Pollachi" : null);
    const finalName    = (name    && name    !== "Unknown") ? name    : "Student";

    await db.promise().query(
      "INSERT INTO view_logs (file_name, name, mobile, ip, country, state, device, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [file, finalName, mobile, ip, finalCountry, finalState, device, "view"]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [LOGS] Save view error:", err.message);
    res.json({ success: false });
  }
});


/* ============================================================
   POST /api/save-download
   Logs that a user downloaded a file.
   Called by the user page when the download button is clicked.
   ============================================================ */
router.post("/save-download", async (req, res) => {
  const { file, name, mobile, country, state, device, ip: bodyIp } = req.body;

  /* Both file and mobile are required */
  if (!file || !mobile) {
    return res.status(400).json({ error: "File name and mobile number are required" });
  }

  const ip = getClientIp(req, bodyIp);

  try {
    const isLocal = ip === "::1" || ip === "127.0.0.1" || ip.includes("localhost");
    const finalCountry = (country && country !== "Unknown") ? country : (isLocal ? "India" : null);
    const finalState   = (state   && state   !== "Unknown") ? state   : (isLocal ? "MCET Campus, Pollachi" : null);
    const finalName    = (name    && name    !== "Unknown") ? name    : "Student";

    await db.promise().query(
      "INSERT INTO view_logs (file_name, name, mobile, ip, country, state, device, action) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [file, finalName, mobile, ip, finalCountry, finalState, device, "download"]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [LOGS] Save download error:", err.message);
    res.json({ success: false });
  }
});


/* ============================================================
   GET /api/logs
   Returns paginated, searchable, filterable view logs for the admin.

   Query params:
   - search   : filter by file name or mobile
   - date     : filter by date (YYYY-MM-DD)
   - category : filter by category (applied to file_name LIKE)
   - sort     : "ASC" or "DESC" (default DESC — newest first)
   - page     : page number (default 1)
   - limit    : rows per page (default 10)
   ============================================================ */
router.get("/logs", verifyAdmin, async (req, res) => {
  const search   = req.query.search   || "";
  const date     = req.query.date     || "";
  const category = req.query.category || "All";
  const sort     = (req.query.sort || "DESC").toUpperCase() === "ASC" ? "ASC" : "DESC";

  const page   = parseInt(req.query.page)  || 1;
  const limit  = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  /* Start with a base WHERE clause and build up dynamically */
  let where  = "WHERE 1 = 1";
  let params = [];

  if (search) {
    where += " AND (file_name LIKE ? OR mobile LIKE ?)";
    params.push("%" + search + "%", "%" + search + "%");
  }

  if (date) {
    where += " AND viewed_at LIKE ?";
    params.push(date + "%");
  }

  if (category !== "All") {
    where += " AND file_name LIKE ?";
    params.push("%" + category + "%");
  }

  try {
    /* Get total row count first for pagination calculation */
    const countQuery = `SELECT COUNT(*) AS total FROM view_logs ${where}`;
    const [countResult] = await db.promise().query(countQuery, params);

    const totalRows  = countResult[0].total;
    const totalPages = Math.ceil(totalRows / limit);

    /* Fetch the page of data */
    const dataQuery  = `SELECT * FROM view_logs ${where} ORDER BY viewed_at ${sort} LIMIT ? OFFSET ?`;
    const [result] = await db.promise().query(dataQuery, [...params, limit, offset]);

    res.json({ logs: result, totalPages });
  } catch (err) {
    console.error("❌ [LOGS] Fetch error:", err.message);
    res.status(500).json({ error: "Failed to query logs" });
  }
});


/* ============================================================
   GET /api/logs/export
   Exports ALL view logs as a downloadable Excel (.xlsx) file.
   Used by admin to save/share log data offline.
   ============================================================ */
router.get("/logs/export", verifyAdmin, async (req, res) => {
  try {
    const [rows] = await db.promise().query("SELECT * FROM view_logs ORDER BY viewed_at DESC");

    /* Build Excel workbook with ExcelJS */
    const workbook = new ExcelJS.Workbook();
    const sheet    = workbook.addWorksheet("View Logs");

    /* Define column headers and widths */
    sheet.columns = [
      { header: "File",      key: "file_name", width: 30 },
      { header: "Name",      key: "name",      width: 20 },
      { header: "Mobile",    key: "mobile",    width: 20 },
      { header: "IP",        key: "ip",        width: 20 },
      { header: "Viewed At", key: "viewed_at", width: 25 }
    ];

    /* Add each log row to the sheet */
    rows.forEach(row => sheet.addRow(row));

    /* Set response headers for file download */
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=view_logs.xlsx"
    );

    /* Stream workbook directly to response */
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ [LOGS] Export error:", err.message);
    res.status(500).json({ error: "Failed to export logs" });
  }
});


/* ============================================================
   DELETE /api/logs/:id
   Deletes a single log entry by its ID.
   ============================================================ */
router.delete("/logs/:id", verifyAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    await db.promise().query("DELETE FROM view_logs WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [LOGS] Delete error:", err.message);
    res.json({ success: false });
  }
});


/* ============================================================
   POST /api/users/delete-user-logs
   Deletes ALL logs for a specific mobile number.
   Pass mobile = "Unknown" to delete entries with no mobile.
   ============================================================ */
router.post("/users/delete-user-logs", verifyAdmin, async (req, res) => {
  const { mobile } = req.body;
  let query, params;

  if (mobile === "Unknown") {
    /* Delete all rows where mobile is null, empty, or literally "Unknown" */
    query  = `DELETE FROM view_logs WHERE mobile IS NULL OR mobile = '' OR mobile = 'Unknown'`;
    params = [];
  } else {
    /* Delete all rows for a specific mobile number */
    query  = "DELETE FROM view_logs WHERE mobile = ?";
    params = [mobile];
  }

  try {
    await db.promise().query(query, params);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [LOGS] Delete user logs error:", err.message);
    res.json({ success: false });
  }
});


module.exports = router;
