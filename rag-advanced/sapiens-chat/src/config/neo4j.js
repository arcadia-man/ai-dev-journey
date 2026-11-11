// src/config/neo4j.js
// Neo4j Driver Singleton
// Concept: Config pattern - one driver instance shared across the whole app.
//          Import this wherever you need to run Cypher queries.

const neo4j = require("neo4j-driver");
const env = require("./env");
const logger = require("../utils/logger");

const driver = neo4j.driver(
  env.NEO4J_URI,
  neo4j.auth.basic(env.NEO4J_USER, env.NEO4J_PASSWORD)
);

/**
 * Run a Cypher query and return all records.
 * @param {string} cypher
 * @param {object} params
 * @returns {Promise<import("neo4j-driver").Record[]>}
 */
async function runQuery(cypher, params = {}) {
  const session = driver.session();
  const loggedParams = Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      Array.isArray(value) && value.length > 12
        ? `[array with ${value.length} items]`
        : typeof value === "string" && value.length > 160
          ? `${value.slice(0, 160)}... [${value.length} chars]`
          : value,
    ])
  );
  try {
    logger.info("Executing Cypher query", { cypher, params: loggedParams });
    const result = await session.run(cypher, params);
    logger.debug("Cypher query completed", { recordCount: result.records.length });
    return result.records;
  } catch (err) {
    logger.error("Neo4j Query Error:", { error: err.message, cypher });
    throw err;
  } finally {
    await session.close();
  }
}

/**
 * Verify connectivity to Neo4j. Useful on server startup.
 */
async function verifyConnection() {
  await driver.verifyConnectivity();
  logger.info(`Neo4j connected successfully to ${env.NEO4J_URI}`);
}

module.exports = { driver, runQuery, verifyConnection };
