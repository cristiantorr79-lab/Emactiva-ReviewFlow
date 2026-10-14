import { createRf01CoordinatorHttpServer } from "../src/rf01-coordinator-http-service.js";
import { loadRf01CoordinatorRuntime } from "../src/rf01-coordinator-runtime.js";

const { Pool } = await import("pg");
const { config, send } = loadRf01CoordinatorRuntime();
const pool = new Pool({ connectionString: config.databaseUrl, max: config.poolMax, connectionTimeoutMillis: 5000 });
const server = createRf01CoordinatorHttpServer({
  connect: () => pool.connect(), serviceToken: config.serviceToken, send,
  timeoutMs: config.timeoutMs,
  logger: event => process.stdout.write(`${JSON.stringify(event)}\n`),
});
server.listen(config.port, config.host, () => process.stdout.write(`${JSON.stringify({ event: "rf01_coordinator_started", host: config.host, port: config.port, providerMode: config.providerMode })}\n`));

let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`${JSON.stringify({ event: "rf01_coordinator_stopping", signal })}\n`);
  const closeServer = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  try {
    await closeServer;
    await pool.end();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: "rf01_coordinator_shutdown_failed", code: error?.code || "SHUTDOWN_FAILED" })}\n`);
    process.exitCode = 1;
  }
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
