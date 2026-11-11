// src/routes/sapiens.routes.js
// Sapiens / RAG Routes

const express = require("express");
const router = express.Router();
const sapiensController = require("../controllers/sapiens.controller");

// POST /api/chat   → RAG question answering from Sapiens book
router.post("/", sapiensController.chat);

module.exports = router;
