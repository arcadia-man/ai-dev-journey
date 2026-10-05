// src/ai/providers/ollama.provider.js
// Raw HTTP calls to Ollama. Provider pattern — swap for OpenAI/Gemini here.
const env = require("../../config/env");

const EMBED_URL    = `${env.OLLAMA_URL}/api/embed`;
const GENERATE_URL = `${env.OLLAMA_URL}/api/generate`;

async function getEmbedding(text) {
  const response = await fetch(EMBED_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ model: env.OLLAMA_EMBED_MODEL, input: text }),
  });
  if (!response.ok) throw new Error(`Ollama embed error: ${response.status}`);
  const data = await response.json();
  return data.embeddings[0];
}

async function generate(prompt, model = env.OLLAMA_CHAT_MODEL) {
  const response = await fetch(GENERATE_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ model, prompt, stream: false }),
  });
  if (!response.ok) throw new Error(`Ollama generate error: ${response.status}`);
  const data = await response.json();
  return data.response;
}

module.exports = { getEmbedding, generate };
