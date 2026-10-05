// src/utils/math.utils.js
//
// Pure math helpers — no external dependencies, no side effects.
//
// Key concept of this chapter:
//   Cosine similarity measures the angle between two vectors.
//   Two sentences with similar meaning produce vectors that point in
//   nearly the same direction → similarity close to 1.
//   Unrelated sentences point in different directions → similarity close to 0.

/**
 * Cosine similarity between two numeric vectors.
 * Returns a value in [0, 1] — higher means more similar.
 *
 * Formula:  dot(A, B) / (|A| * |B|)
 *
 * @param {number[]} vectorA
 * @param {number[]} vectorB
 * @returns {number}
 */
function cosineSimilarity(vectorA, vectorB) {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < vectorA.length; i++) {
    dot  += vectorA[i] * vectorB[i];
    magA += vectorA[i] * vectorA[i];
    magB += vectorB[i] * vectorB[i];
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  return magA === 0 || magB === 0 ? 0 : dot / (magA * magB);
}

module.exports = { cosineSimilarity };
