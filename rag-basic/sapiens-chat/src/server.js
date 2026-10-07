// src/server.js
require("./config/env");
const app = require("./app");
const env = require("./config/env");
const logger = require("./utils/logger");

app.listen(env.PORT, () => {
  logger.info(`Sapiens chat server running on http://localhost:${env.PORT}`);
});
