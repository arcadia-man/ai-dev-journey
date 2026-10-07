// src/routes/index.js
const express = require("express");
const router  = express.Router();

router.use("/chat", require("./sapiens.routes"));

module.exports = router;
