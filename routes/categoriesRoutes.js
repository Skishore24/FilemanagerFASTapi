/* ============================================================
   routes/categoriesRoutes.js — File Category CRUD
   GET    /api/categories       — List all categories (public)
   POST   /api/categories       — Add a category (admin only)
   DELETE /api/categories/:id   — Delete a category (admin only)
   PUT    /api/categories/:id   — Rename a category (admin only)
   ============================================================ */

const express     = require("express");
const router      = express.Router();
const db          = require("../db");
const verifyAdmin = require("../middleware/verifyAdmin");


/* ============================================================
   GET /api/categories
   Returns all categories. Public — no auth needed.
   Used by user page to populate the category filter dropdown.
   ============================================================ */
router.get("/", async (req, res) => {
  try {
    const [result] = await db.promise().query("SELECT * FROM categories");
    res.json(result);
  } catch (err) {
    console.error("❌ [CATEGORIES] Fetch error:", err.message);
    res.status(500).json({ error: "Failed to load categories" });
  }
});


/* ============================================================
   POST /api/categories
   Creates a new category.
   Name must be at least 2 characters long.
   ============================================================ */
router.post("/", verifyAdmin, async (req, res) => {
  const { name } = req.body;

  /* Validate: name must exist and be at least 2 characters */
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "Category name must be at least 2 characters" });
  }

  try {
    await db.promise().query(
      "INSERT INTO categories (name) VALUES (?)",
      [name.trim()]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [CATEGORIES] Create error:", err.message);
    res.status(500).json({ error: "Failed to create category" });
  }
});


/* ============================================================
   DELETE /api/categories/:id
   Deletes a category by ID.
   Returns 404 if the category does not exist.
   ============================================================ */
router.delete("/:id", verifyAdmin, async (req, res) => {
  const id = req.params.id;

  try {
    /* Check the category exists before attempting to delete */
    const [rows] = await db.promise().query("SELECT id FROM categories WHERE id = ?", [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    /* Category exists — go ahead and delete */
    await db.promise().query("DELETE FROM categories WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [CATEGORIES] Delete error:", err.message);
    res.status(500).json({ error: "Database error" });
  }
});


/* ============================================================
   PUT /api/categories/:id
   Renames an existing category.
   Name must be at least 2 characters.
   ============================================================ */
router.put("/:id", verifyAdmin, async (req, res) => {
  const { name } = req.body;

  /* Validate new name */
  if (!name || name.trim().length < 2) {
    return res.status(400).json({ error: "Category name must be at least 2 characters" });
  }

  try {
    await db.promise().query(
      "UPDATE categories SET name = ? WHERE id = ?",
      [name.trim(), req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("❌ [CATEGORIES] Update error:", err.message);
    res.status(500).json({ error: "Failed to update category" });
  }
});

module.exports = router;
