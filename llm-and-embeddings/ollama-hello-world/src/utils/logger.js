// src/utils/logger.js
// Structured logger using winston.
// Usage: logger.info("message", { key: value })
const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: "debug",
  format: format.combine(
    format.timestamp({ format: "HH:mm:ss" }),
    format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [new transports.Console()],
});

module.exports = logger;
