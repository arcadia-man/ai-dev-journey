// src/app.js
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const app       = express();
const staticDir = path.join(__dirname, "../static");

app.use(cors());
app.use(express.json());
app.use(express.static(staticDir));

app.get("/", (req, res) => res.sendFile(path.join(staticDir, "index.html")));
app.use("/api", require("./routes"));

module.exports = app;
