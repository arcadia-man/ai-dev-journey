// src/utils/math.utils.js
function cosineSimilarity(vectorA, vectorB) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dot += vectorA[i] * vectorB[i];
    magA += vectorA[i] * vectorA[i];
    magB += vectorB[i] * vectorB[i];
  }
  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);
  return magA === 0 || magB === 0 ? 0 : dot / (magA * magB);
}

module.exports = { cosineSimilarity };
