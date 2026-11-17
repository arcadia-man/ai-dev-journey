// src/app.js
// Express Application Setup
// Responsibility: configure middleware and mount routes
// Concept: Separated from server.js so app can be imported in tests without starting a server

const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");

const app = express();
const staticDir = path.join(__dirname, "../static");

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(staticDir));

// ── Static UI ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

// ── API Routes ───────────────────────────────────────────────────────────────
app.use("/api", routes);

module.exports = app;
