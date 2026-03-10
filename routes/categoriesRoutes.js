const express = require("express");
const router = express.Router();
const db = require("../db");

/* GET categories */
router.get("/", (req, res) => {
  db.query("SELECT * FROM categories", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

/* ADD category */
router.post("/", (req, res) => {
  const { name } = req.body;

  db.query(
    "INSERT INTO categories (name) VALUES (?)",
    [name],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});

/* DELETE category */
router.delete("/:id", (req, res) => {

  const id = req.params.id;

  db.query(
    "DELETE FROM categories WHERE id = ?",
    [id],
    (err, result) => {

      if (err) {
        console.log("Delete Error:", err);
        return res.status(500).json(err);
      }

      res.json({ success: true });
    }
  );

});


module.exports = router;
router.put("/:id", (req, res) => {
  const { name } = req.body;

  db.query(
    "UPDATE categories SET name=? WHERE id=?",
    [name, req.params.id],
    (err) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});
