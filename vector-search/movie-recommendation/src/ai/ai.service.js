// src/ai/ai.service.js
// Single AI entry point — the rest of the app never imports the provider directly.
const ollamaProvider = require("./providers/ollama.provider");

async function generateEmbedding(text) {
  return ollamaProvider.getEmbedding(text);
}

async function generateAnswer(prompt) {
  return ollamaProvider.generate(prompt);
}

module.exports = { generateEmbedding, generateAnswer };
