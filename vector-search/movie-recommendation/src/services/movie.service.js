// src/services/movie.service.js
//
// Service pattern — business logic lives here.
// Controllers call services; services never touch req/res.
//
// Key concept of this chapter:
//   getRecommendations() embeds the user's query, then ranks every movie
//   by cosine similarity between the query vector and each movie's vector.
//   No keyword matching — pure semantic distance.

const movieRepository  = require("../repositories/movie.repository");
const aiService        = require("../ai/ai.service");
const { cosineSimilarity } = require("../utils/math.utils");

/**
 * Return all movies, optionally filtered by a keyword search.
 * @param {string|undefined} search
 * @returns {Movie[]}
 */
function getMovies(search) {
  const movies = movieRepository.findAll();
  if (!search) return movies;

  const text = search.toLowerCase();
  return movies.filter(
    (m) =>
      m.movie_name.toLowerCase().includes(text) ||
      m.description.toLowerCase().includes(text)
  );
}

/**
 * Return top-N movies semantically closest to the query.
 *
 * Steps:
 *   1. Embed the query string → queryVector (768 numbers)
 *   2. Load all movies (each has a pre-computed embedding from the seeder)
 *   3. Compute cosineSimilarity(queryVector, movieVector) for each movie
 *   4. Sort descending, return top N
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{movie_name, description, url, similarity}>>}
 */
async function getRecommendations(query, limit = 5) {
  const queryEmbedding = await aiService.generateEmbedding(query);
  const movies         = movieRepository.findAll();

  return movies
    .map((movie) => ({
      movie_name:  movie.movie_name,
      description: movie.description,
      url:         movie.url,
      similarity:  cosineSimilarity(queryEmbedding, movie.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

module.exports = { getMovies, getRecommendations };
