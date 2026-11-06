// src/utils/math.utils.js
// Math Utilities
// Responsibility: pure math functions with no external dependencies
// Concept: Utils = stateless, reusable helpers that any layer can import
//          They have no knowledge of HTTP, DB, or AI providers.

/**
 * Calculate cosine similarity between two numeric vectors.
 * Returns a value between 0 (no similarity) and 1 (identical direction).
 * Used for comparing embedding vectors in semantic search.
 *
 * @param {number[]} vectorA
 * @param {number[]} vectorB
 * @returns {number}
 */
function cosineSimilarity(vectorA, vectorB) {
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    magnitudeA += vectorA[i] * vectorA[i];
    magnitudeB += vectorB[i] * vectorB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  return magnitudeA === 0 || magnitudeB === 0
    ? 0
    : dotProduct / (magnitudeA * magnitudeB);
}

module.exports = { cosineSimilarity };
