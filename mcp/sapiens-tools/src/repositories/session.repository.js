const fs = require("node:fs/promises");
const path = require("node:path");
const env = require("../config/env");
const logger = require("../utils/logger");

const storePath = path.resolve(__dirname, "../../", env.SESSION_STORE_PATH);

async function ensureStore() {
  await fs.mkdir(storePath, { recursive: true });
}

function sessionFile(sessionId) {
  return path.join(storePath, `${sessionId}.json`);
}

async function get(sessionId) {
  await ensureStore();
  try {
    const session = JSON.parse(await fs.readFile(sessionFile(sessionId), "utf8"));
    logger.debug("session.loaded", { sessionId, turnCount: session.turns.length });
    return session;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    logger.debug("session.created", { sessionId });
    return { id: sessionId, turns: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }
}

async function save(session) {
  await ensureStore();
  const target = sessionFile(session.id);
  const temporary = `${target}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, target);
  logger.debug("session.saved", { sessionId: session.id, turnCount: session.turns.length });
}

module.exports = { get, save };