// src/ai/ai.service.js
// AI Service
// Responsibility: wraps the AI provider - generates embeddings and text responses
// Concept: The rest of the app calls THIS, never the provider directly.
//          Math utilities (cosine similarity) live in src/utils/math.utils.js

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
 * Generate a text answer from a full prompt using the chat model (Llama3).
 * @param {string} prompt
 * @returns {Promise<string>}
 */
async function generateAnswer(prompt) {
  return ollamaProvider.generate(prompt);
}

module.exports = { generateEmbedding, generateAnswer };
