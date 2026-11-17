// src/server.js
// Server Entry Point
// Responsibility: load env, start the HTTP server
// Concept: Only file that calls app.listen() - keeps app.js pure and testable

require("./config/env"); // loads dotenv first
const app = require("./app");
const env = require("./config/env");
const logger = require("./utils/logger");

const PORT = env.PORT;

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
