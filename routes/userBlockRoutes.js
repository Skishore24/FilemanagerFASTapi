const express = require("express");
const router = express.Router();
const db = require("../db");


router.post("/check-block",(req,res)=>{
  const {mobile} = req.body;

  db.query(
    "SELECT * FROM blocked_users WHERE mobile=?",
    [mobile],
    (err,result)=>{
      res.json({blocked: result.length>0});
    }
  );
});

router.post("/block", (req,res)=>{
  const { mobile } = req.body;

  db.query(
    "INSERT INTO blocked_users (mobile) VALUES (?)",
    [mobile],
    (err)=>{
      if(err) return res.json({success:false});
      res.json({success:true});
    }
  );
});

module.exports = router;
