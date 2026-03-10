const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const fs = require("fs");
const path = require("path");


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});


const upload = multer({ storage });

router.get("/", (req, res) => {
  db.query("SELECT * FROM files", (err, result) => {
    if (err) return res.status(500).send(err);
    res.json(result);
  });
});

router.post("/", upload.single("file"), (req, res) => {

  const name = req.file.filename;
  const filepath = "/uploads/" + req.file.filename;
  const category = req.body.category;
  const size = (req.file.size / 1024).toFixed(1) + " KB";
  const importance = "less";

  db.query(
    "INSERT INTO files (name, filepath, category, size, importance) VALUES (?,?,?,?,?)",
    [name, filepath, category, size, importance],
    (err, result) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});

router.delete("/:id", (req, res) => {

  db.query("SELECT * FROM files WHERE id=?", [req.params.id], (err, result) => {

    if(result.length === 0) return res.sendStatus(404);

    const file = result[0];
    const filePath = path.join(__dirname, "../uploads", file.name);

    if(fs.existsSync(filePath)){
      fs.unlinkSync(filePath);
    }

    db.query("DELETE FROM files WHERE id=?", [req.params.id], () => {
      res.json({success:true});
    });

  });
});

router.put("/:id", (req, res) => {
  const { name, category, importance } = req.body;
  const id = req.params.id;

  db.query("SELECT * FROM files WHERE id=?", [id], (err, result) => {

    if (err) return res.status(500).send(err);
    if (result.length === 0) return res.status(404).send("File not found");

    const oldFile = result[0];

    // keep original extension
    const ext = path.extname(oldFile.name);
    const safeName = name.replace(/\.[^/.]+$/, ""); 
    const newFileName = safeName + ext;

    const oldPath = path.join(__dirname, "../uploads", oldFile.name);
    const newPath = path.join(__dirname, "../uploads", newFileName);

    // check duplicate filename
    db.query(
      "SELECT id FROM files WHERE name=? AND id!=?",
      [newFileName, id],
      (dupErr, dupResult) => {

        if (dupResult.length > 0) {
          return res.status(400).json({ error: "File name already exists" });
        }

        // rename physical file
        if (oldFile.name !== newFileName && fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }

        const newFilePath = "/uploads/" + newFileName;

        db.query(
          "UPDATE files SET name=?, filepath=?, category=?, importance=? WHERE id=?",
          [newFileName, newFilePath, category, importance, id],
          (updateErr) => {
            if (updateErr) return res.status(500).send(updateErr);
            res.json({ success: true });
          }
        );
      }
    );
  });
});


router.put("/importance/:id", (req, res) => {
  const { importance } = req.body;

  db.query(
    "UPDATE files SET importance=? WHERE id=?",
    [importance, req.params.id],
    (err) => {
      if (err) return res.status(500).send(err);
      res.json({ success: true });
    }
  );
});

module.exports = router;
