// src/run.js
//
// Entry point for Chapter 1 — LLM and Embeddings.
//
// What this demonstrates:
//   1. Calling Ollama to generate an embedding vector
//   2. Calling Ollama to generate a text answer
//   3. Inspecting what an embedding actually looks like

require("./config/env");

const aiService = require("./ai/ai.service");
const logger = require("./utils/logger");

async function main() {
  // ── Demo 1: Generate an embedding ─────────────────────────────────────────
  const text = "The Cognitive Revolution changed human history forever.";

  logger.info("Generating embedding for:", { text });
  const embedding = await aiService.generateEmbedding(text);

  logger.info("Embedding received", {
    dimensions: embedding.length,
    first5values: embedding.slice(0, 5).map((v) => v.toFixed(4)),
  });

  // ── Demo 2: Generate a text answer ────────────────────────────────────────
  const prompt = `Answer in one sentence: What is an embedding vector?`;

  logger.info("Sending prompt to LLM", { prompt });
  const answer = await aiService.generateAnswer(prompt);

  logger.info("LLM answered", { answer });
}

main().catch((err) => {
  logger.error("Failed:", { message: err.message });
  process.exit(1);
});
