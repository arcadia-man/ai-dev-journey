// src/ai/providers/ollama.provider.js
const env = require("../../config/env");

const EMBED_URL    = `${env.OLLAMA_URL}/api/embed`;
const GENERATE_URL = `${env.OLLAMA_URL}/api/generate`;

async function getEmbedding(text) {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.OLLAMA_EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed error: ${res.status}`);
  const data = await res.json();
  return data.embeddings[0];
}

async function generate(prompt, model = env.OLLAMA_CHAT_MODEL) {
  const res = await fetch(GENERATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });
  if (!res.ok) throw new Error(`Ollama generate error: ${res.status}`);
  const data = await res.json();
  return data.response;
}

module.exports = { getEmbedding, generate };
