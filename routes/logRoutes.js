const express = require("express");
const router = express.Router();
const db = require("../db");

/* SAVE VIEW LOG */
router.post("/save-view", (req,res)=>{

  const {file,name,mobile,country,state,device} = req.body;

  // Get real IP here
  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    req.ip;

  db.query(
    "INSERT INTO view_logs (file_name,name,mobile,ip,country,state,device,action) VALUES (?,?,?,?,?,?,?,?)",
    [file,name,mobile,ip,country,state,device,"view"],
    (err)=>{
      if(err){
        console.log(err);
        return res.json({success:false});
      }
      res.json({success:true});
    }
  );
});
router.post("/save-download", (req,res)=>{

  const {file,name,mobile,country,state,device} = req.body;

  const ip =
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    req.ip;

  db.query(
    "INSERT INTO view_logs (file_name,name,mobile,ip,country,state,device,action) VALUES (?,?,?,?,?,?,?,?)",
    [file,name,mobile,ip,country,state,device,"download"],
    (err)=>{
      if(err){
        console.log(err);
        return res.json({success:false});
      }
      res.json({success:true});
    }
  );
});

/* GET LOGS */
router.get("/logs", (req, res) => {

  const search = req.query.search || "";
  let date = req.query.date || "";
  const category = req.query.category || "All";

  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;

  const sort = req.query.sort === "oldest" ? "ASC" : "DESC";

  let where = "WHERE 1=1";
  let params = [];

  if(search){
    where += " AND (file_name LIKE ? OR mobile LIKE ?)";
    params.push("%"+search+"%");
    params.push("%"+search+"%");
  }

  // DATE FILTER
  if(date){
    where += " AND viewed_at LIKE ?";
    params.push(date+"%");
  }

  // CATEGORY FILTER
  if(category !== "All"){
    where += " AND file_name LIKE ?";
    params.push("%"+category+"%");
  }

  let dataQuery = `
    SELECT * FROM view_logs
    ${where}
    ORDER BY viewed_at ${sort}
    LIMIT ? OFFSET ?
  `;

  let countQuery = `
    SELECT COUNT(*) as total FROM view_logs
    ${where}
  `;

  db.query(countQuery, params, (err,countResult)=>{

    const totalRows = countResult[0].total;
    const totalPages = Math.ceil(totalRows/limit);

    db.query(
      dataQuery,
      [...params,limit,offset],
      (err,result)=>{

        res.json({
          logs: result,
          totalPages: totalPages
        });

      });

  });

});

const ExcelJS = require("exceljs");

router.get("/logs/export", async (req,res)=>{

  db.query("SELECT * FROM view_logs ORDER BY viewed_at DESC", async (err,rows)=>{
    if(err) return res.send("DB Error");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Logs");

    sheet.columns = [
      { header: "File", key: "file_name", width: 30 },
      { header: "Name", key: "name", width: 20 },
      { header: "Mobile", key: "mobile", width: 20 },
      { header: "IP", key: "ip", width: 20 },
      { header: "Viewed At", key: "viewed_at", width: 25 }
    ];

    rows.forEach(r => sheet.addRow(r));

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=logs.xlsx"
    );

    await workbook.xlsx.write(res);
    res.end();
  });
});

router.delete("/logs/:id", (req,res)=>{

  const id = req.params.id;

  db.query(
    "DELETE FROM view_logs WHERE id = ?",
    [id],
    (err)=>{
      if(err) return res.json({success:false});
      res.json({success:true});
    }
  );
});
router.post("/users/delete-user-logs", (req,res)=>{

  const { mobile } = req.body;

  let query;
  let params;

  // Delete Unknown users
  if(mobile === "Unknown"){

    query = `
      DELETE FROM view_logs
      WHERE mobile IS NULL
      OR mobile=''
      OR mobile='Unknown'
    `;

    params = [];

  }else{

    query = "DELETE FROM view_logs WHERE mobile=?";
    params = [mobile];

  }

  db.query(query,params,(err)=>{

    if(err){
      console.log(err);
      return res.json({success:false});
    }

    res.json({success:true});

  });

});


module.exports = router;
