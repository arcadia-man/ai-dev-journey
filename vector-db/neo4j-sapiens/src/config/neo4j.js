// src/config/neo4j.js
//
// Neo4j driver singleton.
// One driver instance shared across the whole app — sessions are cheap,
// drivers are expensive to create.

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
  try {
    logger.debug("Running Cypher", { cypher: cypher.trim().split("\n")[0] });
    const result = await session.run(cypher, params);
    return result.records;
  } catch (err) {
    logger.error("Neo4j query error", { message: err.message });
    throw err;
  } finally {
    await session.close();
  }
}

/**
 * Verify Neo4j is reachable. Call this on startup.
 */
async function verifyConnection() {
  await driver.verifyConnectivity();
  logger.info(`Neo4j connected → ${env.NEO4J_URI}`);
}

module.exports = { driver, runQuery, verifyConnection };
