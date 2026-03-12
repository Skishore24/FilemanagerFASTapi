const jwt = require("jsonwebtoken");

function verifyAdmin(req,res,next){

 const authHeader = req.headers.authorization;

 if(!authHeader){
  return res.sendStatus(401);
 }

 const token = authHeader.split(" ")[1];

 jwt.verify(token,process.env.JWT_SECRET,(err,user)=>{

  if(err) return res.sendStatus(403);

  if(user.role !== "admin"){
   return res.status(403).json({message:"Admin access required"});
  }

  req.user = user;
  next();

 });

}

module.exports = verifyAdmin;