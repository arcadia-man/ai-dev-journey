require("./config/env");
const { spawn } = require("node:child_process");
const path = require("node:path");
const logger = require("./utils/logger");

const entryPoints = ["mcp/server.js", "server.js"];
const processes = entryPoints.map((entryPoint) => spawn(
  process.execPath,
  [path.join(__dirname, entryPoint)],
  { stdio: "inherit", env: process.env }
));

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) if (!child.killed) child.kill("SIGTERM");
  process.exitCode = code;
}

for (const child of processes) {
  child.once("error", (error) => {
    logger.error("services.start.failed", { error: error.message });
    stop(1);
  });
  child.once("exit", (code) => {
    if (!stopping) stop(code || 0);
  });
}

process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());