// src/controllers/movie.controller.js
//
// Controller pattern — only handles HTTP concerns (parse req, send res).
// Zero business logic here.

const movieService = require("../services/movie.service");
const logger       = require("../utils/logger");

/**
 * GET /api/movies?search=...
 */
async function listMovies(req, res) {
  try {
    const movies = movieService.getMovies(req.query.search);
    res.json(movies);
  } catch (error) {
    logger.error("[MovieController] listMovies error:", { message: error.message });
    res.status(500).json({ error: "Failed to fetch movies" });
  }
}

/**
 * POST /api/movies/recommend
 * Body: { query: string, limit?: number }
 */
async function recommendMovies(req, res) {
  try {
    const { query, limit = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const recommendations = await movieService.getRecommendations(query, limit);
    res.json(recommendations);
  } catch (error) {
    logger.error("[MovieController] recommendMovies error:", { message: error.message });
    res.status(500).json({ error: "Failed to generate recommendations" });
  }
}

module.exports = { listMovies, recommendMovies };
