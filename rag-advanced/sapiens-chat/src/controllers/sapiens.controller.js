// src/controllers/sapiens.controller.js
// Sapiens Controller
// Responsibility: HTTP layer for the RAG chat endpoint
// Concept: Reads req, delegates to service, sends res — no business logic here

const chatService = require("../services/chat.service");
const logger = require("../utils/logger");

/**
 * POST /api/chat
 * Body: { question: string, sessionId?: string }
 */
async function chat(req, res) {
  try {
    const { question, sessionId } = req.body;
    logger.info("Received chat request", { sessionId: sessionId || "new", question });
    const result = await chatService.chat(question, sessionId);
    logger.info("Sending chat response", {
      sessionId: result.sessionId,
      topics: result.topics,
      referenceCount: result.references.length,
      linkCount: result.links.length,
    });
    res.json(result);
  } catch (error) {
    logger.error("[ChatController] error:", { message: error.message, stack: error.stack });
    res.status(400).json({ error: error.message || "Failed to generate answer" });
  }
}

module.exports = { chat };
