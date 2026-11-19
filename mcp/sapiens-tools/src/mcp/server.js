const express = require("express");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const env = require("../config/env");
const { driver } = require("../config/neo4j");
const { registerSimpleTools, simpleToolNames } = require("./tools/simple.tools");
const { registerSapiensTools, sapiensToolNames } = require("./tools/sapiens.tools");
const logger = require("../utils/logger");

const app = express();
app.use(express.json({ limit: "1mb" }));

function createMcpServer() {
  const server = new McpServer({ name: "sapiens-learning-tools", version: "1.0.0" });
  registerSimpleTools(server);
  registerSapiensTools(server);
  return server;
}

app.all("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error("mcp.request.failed", { error: error.message });
    if (!res.headersSent) res.status(500).json({ error: "MCP request failed." });
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});

app.get("/health", (_req, res) => res.json({
  status: "ok",
  transport: "Streamable HTTP",
  tools: simpleToolNames.length + sapiensToolNames.length,
}));

const httpServer = app.listen(env.MCP_PORT, "0.0.0.0", () => {
  logger.info("mcp.server.started", {
    endpoint: `http://localhost:${env.MCP_PORT}/mcp`,
    transport: "Streamable HTTP",
    utilityToolCount: simpleToolNames.length,
    sapiensToolCount: sapiensToolNames.length,
  });
});

async function shutdown() {
  httpServer.close();
  await driver.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);