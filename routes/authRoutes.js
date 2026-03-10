const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
console.log("JWT_SECRET:", process.env.JWT_SECRET);

router.post("/login", async (req,res)=>{
  try{
    const { email, password } = req.body;

    console.log("BODY:", req.body);
    console.log("JWT_SECRET:", process.env.JWT_SECRET);

    const [rows] = await db.promise().query(
      "SELECT * FROM users WHERE email=?",
      [email]
    );

    if(rows.length === 0){
      return res.status(401).json({message:"User not found"});
    }

    const user = rows[0];

    const match = await bcrypt.compare(password, user.password);
    if(!match){
      return res.status(401).json({message:"Wrong password"});
    }

    const token = jwt.sign(
      { id:user.id, role:user.role },
      process.env.JWT_SECRET,
      { expiresIn:"2h" }
    );

    res.json({ token });

  }catch(err){
    console.log("Login error:", err);
    res.status(500).json({message:"Server error"});
  }
});


module.exports = router;
