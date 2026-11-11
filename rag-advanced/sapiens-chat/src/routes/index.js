// src/routes/index.js
// Route Aggregator
// Concept: One place to mount all feature routers under /api

const express = require("express");
const router = express.Router();

const sapiensRoutes = require("./sapiens.routes");

router.use("/chat", sapiensRoutes);

// Add new feature routes here:
// const bookRoutes = require("./book.routes");
// router.use("/books", bookRoutes);

module.exports = router;
