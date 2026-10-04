// src/ai/ai.service.js
//
// AI Service — the only file the rest of the app imports for AI calls.
//
// The provider (Ollama) is an implementation detail hidden behind this service.
// If you swap providers, only ollama.provider.js changes — nothing else does.

const ollamaProvider = require("./providers/ollama.provider");

/**
 * Generate an embedding vector for the given text.
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function generateEmbedding(text) {
  return ollamaProvider.getEmbedding(text);
}

/**
 * Generate a text answer from a full prompt.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function generateAnswer(prompt) {
  return ollamaProvider.generate(prompt);
}

module.exports = { generateEmbedding, generateAnswer };
