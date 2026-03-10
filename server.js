require("dotenv").config();

const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 5000;
const path = require("path");


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const otpRoutes = require("./routes/otpRoutes");
const fileRoutes = require("./routes/fileRoutes");
const categoriesRoutes = require("./routes/categoriesRoutes");
const logRoutes = require("./routes/logRoutes");
const userRoutes = require("./routes/userRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const protectedFiles = require("./routes/protectedFiles");
const authRoutes = require("./routes/authRoutes");

app.use("/api", otpRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api", logRoutes);
app.use("/api/users", userRoutes);
app.use("/api", dashboardRoutes);
app.use("/api/auth", authRoutes);
app.use("/secure-files", protectedFiles);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/secure-files", express.static("secure-files"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use(express.static("public"));

app.listen(PORT, () => console.log("Server running on port " + PORT));
