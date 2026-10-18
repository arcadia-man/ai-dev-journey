// src/controllers/sapiens.controller.js
const chatService = require("../services/chat.service");
const logger      = require("../utils/logger");

async function chat(req, res) {
  try {
    const { question, sessionId } = req.body;
    const result = await chatService.chat(question, sessionId);
    res.json(result);
  } catch (error) {
    logger.error("[Controller] chat error", { message: error.message });
    res.status(400).json({ error: error.message || "Failed to generate answer" });
  }
}

module.exports = { chat };
