const express = require("express");
const router = express.Router();
const path = require("path");
const db = require("../db");

router.get("/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;

    const [rows] = await db.promise().query(
      "SELECT * FROM files WHERE name=?",
      [filename]
    );

    if (rows.length === 0) {
      return res.status(404).send("File not found");
    }

    const filePath = path.join(__dirname, "..", "uploads", filename);

    // Get user info
    const mobile = req.query.mobile || "Unknown";
    const device = req.headers["user-agent"] || "Unknown";

    // LOG VIEW
    await db.promise().query(
      `INSERT INTO view_logs
       (file_name, mobile, device, action, viewed_at)
       VALUES (?, ?, ?, 'view', NOW())`,
      [filename, mobile, device]
    );

    res.sendFile(filePath);

  } catch (err) {
    console.log(err);
    res.status(500).send("Server Error");
  }
});


router.get("/download/:filename", async (req, res) => {
  try {
    const filename = req.params.filename;
    const mobile = req.query.mobile || "Unknown";
    const device = req.headers["user-agent"] || "Unknown";

    const filePath = path.join(__dirname, "..", "uploads", filename);

    // Save download log
    await db.promise().query(
      `INSERT INTO view_logs (file_name, mobile, device, action, viewed_at)
       VALUES (?, ?, ?, 'download', NOW())`,
      [filename, mobile, device]
    );

    res.download(filePath);

  } catch (err) {
    console.log(err);
    res.status(500).send("Download error");
  }
});


module.exports = router;
