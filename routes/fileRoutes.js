/**
 * ============================================================
 * routes/fileRoutes.js — File Management API
 * ============================================================
 * Handles file uploads, listing, editing, and deletion.
 * Protected by admin authentication where necessary.
 * 
 * GET    /api/files                — List all (Public / Student)
 * POST   /api/files                — Upload (Admin)
 * DELETE /api/files/:id            — Remove (Admin)
 * PUT    /api/files/:id            — Update metadata (Admin)
 * PUT    /api/files/importance/:id — Toggle access level (Admin)
 * ============================================================
 */

const express     = require("express");
const router      = express.Router();
const db          = require("../db");
const multer      = require("multer");
const fs          = require("fs").promises; /* Use promises for non-blocking I/O */
const fsSync      = require("fs");          /* For cases where sync is preferred (like exists) */
const path        = require("path");
const verifyAdmin = require("../middleware/verifyAdmin");

/**
 * ============================================================
 * MULTER STORAGE CONFIGURATION
 * ============================================================
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    /* Sanitize filename: remove special chars, keep dots/dashes/underscores */
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

/* Allowed types for security and consistency */
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx"];

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, /* 10 MB Limit */
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype) || !ALLOWED_EXTENSIONS.includes(ext)) {
      return cb(new Error("Invalid file type. Only PDF, JPG, PNG, DOC, DOCX allowed."));
    }
    cb(null, true);
  }
});

/**
 * ============================================================
 * ROUTES
 * ============================================================
 */

/* GET /api/files — Fetch all file metadata (Public) */
router.get("/", (req, res) => {
  const query = "SELECT id, name, category, size, importance, date FROM files ORDER BY date DESC";
  db.query(query, (err, result) => {
    if (err) {
      console.error("❌ [FILES] Fetch failed:", err.message);
      return res.status(500).json({ error: "Could not load files from database" });
    }
    res.json(result);
  });
});

/* POST /api/files — Upload new file (Admin) */
router.post("/", verifyAdmin, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Please select a file to upload" });
  }

  const { filename, size: bytes } = req.file;
  const category   = (req.body.category || "General").trim();
  const importance = req.body.importance || "less";
  const sizeKb     = (bytes / 1024).toFixed(1) + " KB";
  const filepath   = `/uploads/${filename}`;

  const query = "INSERT INTO files (name, filepath, category, size, importance) VALUES (?, ?, ?, ?, ?)";
  db.query(query, [filename, filepath, category, sizeKb, importance], (err) => {
    if (err) {
      console.error("❌ [FILES] Insertion failed:", err.message);
      /* cleanup: delete file if DB fails */
      fs.unlink(req.file.path).catch(uErr => console.error("Failed to cleanup file:", uErr.message));
      return res.status(500).json({ error: "Failed to save file metadata" });
    }
    res.json({ success: true, message: "File uploaded successfully" });
  });
});

/* DELETE /api/files/:id — Delete file (Admin) */
router.delete("/:id", verifyAdmin, (req, res) => {
  const id = req.params.id;

  db.query("SELECT name FROM files WHERE id = ?", [id], async (err, result) => {
    if (err) return res.status(500).json({ error: "Database lookup failed" });
    if (result.length === 0) return res.status(404).json({ error: "File record not found" });

    const fileName = result[0].name;
    const filePath = path.join(__dirname, "../uploads", fileName);

    try {
      /* Delete file first, then record */
      if (fsSync.existsSync(filePath)) {
        await fs.unlink(filePath);
      }

      db.query("DELETE FROM files WHERE id = ?", [id], (delErr) => {
        if (delErr) {
          console.error("❌ [FILES] Delete record failed:", delErr.message);
          return res.status(500).json({ error: "Failed to remove database entry" });
        }
        res.json({ success: true, message: "File deleted successfully" });
      });
    } catch (fsErr) {
      console.error("❌ [FILES] FS unlink failed:", fsErr.message);
      res.status(500).json({ error: "Failed to delete physical file from server" });
    }
  });
});

/* PUT /api/files/:id — Rename/Recategorize file (Admin) */
router.put("/:id", verifyAdmin, (req, res) => {
  const id = req.params.id;
  const { name, category, importance } = req.body;

  if (!name || !category) {
    return res.status(400).json({ error: "Name and category are required" });
  }

  db.query("SELECT name FROM files WHERE id = ?", [id], async (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (result.length === 0) return res.status(404).json({ error: "File not found" });

    const oldName = result[0].name;
    const ext     = path.extname(oldName);
    const safeBaseName = name.replace(/[^a-zA-Z0-9_-]/g, "");
    const newName = `${safeBaseName}${ext}`;

    const oldPath = path.join(__dirname, "../uploads", oldName);
    const newPath = path.join(__dirname, "../uploads", newName);

    /* Check for existing file with same name */
    db.query("SELECT id FROM files WHERE name = ? AND id != ?", [newName, id], async (dupErr, dupRes) => {
      if (dupErr) return res.status(500).json({ error: "Duplicate check failed" });
      if (dupRes.length > 0) return res.status(400).json({ error: "A file with this name already exists" });

      try {
        /* Rename physical file if necessary */
        if (oldName !== newName && fsSync.existsSync(oldPath)) {
          await fs.rename(oldPath, newPath);
        }

        /* Update Database */
        const query = "UPDATE files SET name = ?, filepath = ?, category = ?, importance = ? WHERE id = ?";
        const values = [newName, `/uploads/${newName}`, category.trim(), importance, id];

        db.query(query, values, (updErr) => {
          if (updErr) {
            console.error("❌ [FILES] Update failed:", updErr.message);
            return res.status(500).json({ error: "Failed to update record in database" });
          }
          res.json({ success: true, message: "File updated successfully" });
        });
      } catch (fsErr) {
        console.error("❌ [FILES] FS rename failed:", fsErr.message);
        res.status(500).json({ error: "Failed to rename file on the server" });
      }
    });
  });
});

/* PUT /api/files/importance/:id — Quick toggle for access restricted state (Admin) */
router.put("/importance/:id", verifyAdmin, (req, res) => {
  const { importance } = req.body;
  if (!importance) return res.status(400).json({ error: "Importance level required" });

  db.query("UPDATE files SET importance = ? WHERE id = ?", [importance, req.params.id], (err) => {
    if (err) {
      console.error("❌ [FILES] Importance toggle failed:", err.message);
      return res.status(500).json({ error: "Failed to update file importance" });
    }
    res.json({ success: true });
  });
});

module.exports = router;

