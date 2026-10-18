// src/services/sapiens.service.js
//
// RAG Basic — the simplest complete RAG pipeline.
//
// Flow:
//   1. Embed the question (+ conversation history for follow-up support)
//   2. Find top-K similar chunks from Neo4j using cosine similarity
//   3. Expand context for the top 2 hits (fetch prev + next chunk via [:NEXT])
//   4. Build a grounded prompt and call the LLM
//   5. Return answer + references

const aiService          = require("../ai/ai.service");
const documentRepository = require("../repositories/document.repository");
const logger             = require("../utils/logger");

const TOP_K = 5;

async function chat(question, history = []) {
  const conversation = history
    .map((t) => `User: ${t.question}\nAssistant: ${t.answer}`)
    .join("\n");

  // Step 1 — embed query + history so follow-ups resolve correctly
  const retrievalQuery = [conversation, `User: ${question}`]
    .filter(Boolean)
    .join("\n");

  logger.info("Embedding query for retrieval", { question });
  const queryEmbedding = await aiService.generateEmbedding(retrievalQuery);

  // Step 2 — cosine similarity search over all stored chunks
  const chunks = await documentRepository.findSimilarChunks(
    queryEmbedding,
    TOP_K,
    "Sapiens: A Brief History of Humankind"
  );

  if (chunks.length === 0) {
    return {
      answer: "I don't have enough context from the book to answer that question.",
      references: [],
      relatedTopics: [],
      links: [],
    };
  }

  // Step 3 — expand context for top 2 hits (get surrounding chunks)
  let context = "";
  for (let i = 0; i < Math.min(2, chunks.length); i++) {
    const expanded = await documentRepository.getExpandedContext(chunks[i].id);
    context += `[Chapter: ${chunks[i].chapterTitle}]\n${expanded || chunks[i].text}\n\n`;
  }
  for (let i = 2; i < chunks.length; i++) {
    context += `[Chapter: ${chunks[i].chapterTitle}]\n${chunks[i].text}\n\n`;
  }

  // Step 4 — grounded prompt
  const prompt = `You answer questions about "Sapiens: A Brief History of Humankind".
Use ONLY the book context below. If the passages are insufficient, say so honestly.

Conversation context:
${conversation || "No earlier turns."}

--- CONTEXT START ---
${context}
--- CONTEXT END ---

Question: ${question}
Answer:`;

  logger.debug("Generating answer");
  const answer = await aiService.generateAnswer(prompt);

  return {
    answer: answer.trim(),
    references: chunks.map((c) => ({
      title:      c.chapterTitle,
      data:       c.text.substring(0, 200) + (c.text.length > 200 ? "…" : ""),
      page:       c.page,
      similarity: Math.round(c.similarity * 1000) / 1000,
    })),
    relatedTopics: [],
    links: [],
  };
}

module.exports = { chat };
