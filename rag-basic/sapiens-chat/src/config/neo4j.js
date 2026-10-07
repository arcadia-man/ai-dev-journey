// src/config/neo4j.js
const neo4j  = require("neo4j-driver");
const env    = require("./env");
const logger = require("../utils/logger");

const driver = neo4j.driver(
  env.NEO4J_URI,
  neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD)
);

async function runQuery(cypher, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } catch (err) {
    logger.error("Neo4j query error", { message: err.message });
    throw err;
  } finally {
    await session.close();
  }
}

async function verifyConnection() {
  await driver.verifyConnectivity();
  logger.info(`Neo4j connected → ${env.NEO4J_URI}`);
}

module.exports = { driver, runQuery, verifyConnection };
