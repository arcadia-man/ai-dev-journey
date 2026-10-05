// src/verify-connection.js
// Quick script to confirm Neo4j is running and credentials work.
// Usage: npm run verify
require("./config/env");
const { verifyConnection, runQuery } = require("./config/neo4j");
const logger = require("./utils/logger");

async function main() {
  await verifyConnection();

  const records = await runQuery("RETURN 'Neo4j is working!' AS message");
  logger.info(records[0].get("message"));

  process.exit(0);
}

main().catch((err) => {
  logger.error("Connection failed", { message: err.message });
  process.exit(1);
});
