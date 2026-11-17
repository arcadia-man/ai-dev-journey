require("dotenv").config();

module.exports = {
  UI_PORT: Number(process.env.UI_PORT || 3100),
  MCP_PORT: Number(process.env.MCP_PORT || 3101),
  MCP_URL: process.env.MCP_URL || `http://localhost:${process.env.MCP_PORT || 3101}/mcp`,
  OLLAMA_URL: process.env.OLLAMA_URL || "http://localhost:11434",
   OLLAMA_CHAT_MODEL: process.env.OLLAMA_CHAT_MODEL || "qwen2.5",
  SESSION_STORE_PATH: process.env.SESSION_STORE_PATH || "data/sessions",
  SESSION_HISTORY_LIMIT: Number(process.env.SESSION_HISTORY_LIMIT || 16),
  NEO4J_URI: process.env.NEO4J_URI || "bolt://localhost:7687",
  NEO4J_USER: process.env.NEO4J_USER || "neo4j",
  NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || "localpassword",
  SAPIENS_DOCUMENT_ID: process.env.SAPIENS_DOCUMENT_ID || "sapiens",
};