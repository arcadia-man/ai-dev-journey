require("./config/env");
const app = require("./app");
const env = require("./config/env");
const { closeClient } = require("./services/mcp-client");
const logger = require("./utils/logger");

const server = app.listen(env.UI_PORT, "0.0.0.0", () => {
  logger.info("ui.server.started", { url: `http://localhost:${env.UI_PORT}` });
});

async function shutdown() {
  server.close();
  await closeClient();
  logger.info("ui.server.stopped");
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);