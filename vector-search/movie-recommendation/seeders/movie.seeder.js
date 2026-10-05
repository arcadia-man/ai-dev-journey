// seeders/movie.seeder.js
//
// One-time script — runs BEFORE the server, not during it.
// Reads data.json, generates an embedding for each movie, writes embed-data.json.
//
// Why a seeder?
//   Embedding is slow (one Ollama call per movie).
//   We do it once and store the result so the server never waits for it.
//
// Usage: npm run seed

require("../src/config/env");
const fs        = require("fs");
const path      = require("path");
const aiService = require("../src/ai/ai.service");
const logger    = require("../src/utils/logger");

const INPUT_PATH  = path.join(__dirname, "../static/data.json");
const OUTPUT_PATH = path.join(__dirname, "../static/embed-data.json");

async function seed() {
  logger.info("Reading movies from data.json...");
  const movies = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  logger.info(`Generating embeddings for ${movies.length} movies...`);

  const moviesWithEmbeddings = [];

  for (const movie of movies) {
    // We embed both name + description so the vector captures the full meaning
    const text      = `Movie: ${movie.movie_name} Description: ${movie.description}`;
    const embedding = await aiService.generateEmbedding(text);

    moviesWithEmbeddings.push({ ...movie, embedding });
    logger.info(`  ✓ ${movie.movie_name}`);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(moviesWithEmbeddings));
  logger.info(`Saved ${moviesWithEmbeddings.length} movies to embed-data.json`);
}

seed().catch((err) => {
  logger.error("Seeder failed:", { message: err.message });
  process.exit(1);
});
