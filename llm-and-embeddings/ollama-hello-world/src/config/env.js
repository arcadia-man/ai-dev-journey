// src/config/env.js
// Load and export environment variables with safe defaults.
// Always require this file first before anything else.
require("dotenv").config();

const env = {
  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL || "llama3",
};

module.exports = env;
