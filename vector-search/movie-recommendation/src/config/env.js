// src/config/env.js
require("dotenv").config();

const env = {
  PORT: process.env.PORT || 3000,
  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",
  OLLAMA_EMBED_MODEL: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL || "llama3",
};

module.exports = env;
