// src/repositories/movie.repository.js
//
// Repository pattern — isolates WHERE data comes from.
// The service never reads files directly; only this file does.
// When a DB is added, only this file changes.

const fs   = require("fs");
const path = require("path");
const Movie = require("../models/movie.model");

const EMBED_DATA_PATH = path.join(__dirname, "../../static/embed-data.json");

/**
 * Fetch all movies (with embeddings) from the JSON data store.
 * @returns {Movie[]}
 */
function findAll() {
  const raw = JSON.parse(fs.readFileSync(EMBED_DATA_PATH, "utf-8"));
  return raw.map((item) => new Movie(item));
}

module.exports = { findAll };
