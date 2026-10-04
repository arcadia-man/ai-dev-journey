// src/ai/providers/ollama.provider.js
//
// Raw HTTP communication with the Ollama API.
//
// Provider pattern — swap this file to switch AI backends
// (OpenAI, Gemini, etc.) without touching any other code.
//
// Ollama must be running locally: https://ollama.com

const env = require("../../config/env");

const EMBED_URL = `${env.OLLAMA_URL}/api/embed`;
const GENERATE_URL = `${env.OLLAMA_URL}/api/generate`;

/**
 * Generate an embedding vector for the given text.
 * Returns a number[] of length 768 (nomic-embed-text).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function getEmbedding(text) {
  const response = await fetch(EMBED_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.OLLAMA_EMBED_MODEL, input: text }),
  });

  if (!response.ok) {
    throw new Error(`Ollama embed error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings[0];
}

/**
 * Generate a text completion using the chat model (llama3).
 *
 * @param {string} prompt  Full prompt including any context
 * @param {string} [model] Override the default chat model
 * @returns {Promise<string>}
 */
async function generate(prompt, model = env.OLLAMA_CHAT_MODEL) {
  const response = await fetch(GENERATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt, stream: false }),
  });

  if (!response.ok) {
    throw new Error(`Ollama generate error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.response;
}

module.exports = { getEmbedding, generate };
