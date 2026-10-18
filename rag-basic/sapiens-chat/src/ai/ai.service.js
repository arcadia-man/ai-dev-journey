// src/ai/ai.service.js
const ollamaProvider = require("./providers/ollama.provider");

async function generateEmbedding(text) { return ollamaProvider.getEmbedding(text); }
async function generateAnswer(prompt)  { return ollamaProvider.generate(prompt); }

module.exports = { generateEmbedding, generateAnswer };
