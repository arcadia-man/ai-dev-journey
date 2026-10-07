// src/routes/sapiens.routes.js
const express = require("express");
const router  = express.Router();
const sapiensController = require("../controllers/sapiens.controller");

router.post("/", sapiensController.chat);

module.exports = router;
