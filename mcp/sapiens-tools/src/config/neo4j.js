const neo4j = require("neo4j-driver");
const env = require("./env");
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
  } catch (error) {
    logger.error("neo4j.query.failed", { error: error.message });
    throw error;
  } finally {
    await session.close();
  }
}

function toNumber(value) {
  return value && typeof value.toNumber === "function" ? value.toNumber() : value;
}

module.exports = { driver, runQuery, toNumber };