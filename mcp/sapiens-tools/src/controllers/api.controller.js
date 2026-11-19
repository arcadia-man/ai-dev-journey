const { z } = require("zod");
const chatService = require("../services/chat.service");
const { listTools } = require("../services/mcp-client");
const logger = require("../utils/logger");

async function status(_req, res) {
  try {
    const tools = await listTools();
    res.json({ status: "connected", toolCount: tools.length });
  } catch (error) {
    logger.warn("api.status.disconnected", { error: error.message });
    res.status(503).json({ status: "disconnected", message: "MCP server unavailable." });
  }
}

async function tools(_req, res) {
  try {
    res.json({ tools: await listTools() });
  } catch (error) {
    logger.warn("api.tools.failed", { error: error.message });
    res.status(503).json({ error: "MCP server unavailable." });
  }
}

async function session(req, res) {
  try {
    res.json(await chatService.getSession(req.params.sessionId));
  } catch (error) {
    const invalidId = error instanceof z.ZodError;
    const statusCode = invalidId ? 400 : 500;
    logger.warn("api.session.failed", { error: error.message, statusCode });
    res.status(statusCode).json({ error: invalidId ? "Invalid session id." : "Could not load this session." });
  }
}

async function chat(req, res) {
  try {
    res.json(await chatService.respond(req.body || {}));
  } catch (error) {
    const statusCode = error.status || 502;
    logger.error("api.chat.failed", { error: error.message, statusCode });
    res.status(statusCode).json({ error: error.status === 400 ? error.message : "The assistant could not complete this request. Check the Ollama and MCP services." });
  }
}

module.exports = { status, tools, session, chat };