import assert from "node:assert/strict";
import test from "node:test";
import { loadRf01CoordinatorRuntime } from "../src/rf01-coordinator-runtime.js";

const base = {
  RF01_DATABASE_URL: "postgresql://reviewflow.invalid/test",
  RF01_COORDINATOR_SERVICE_TOKEN: "synthetic-service-token-32-characters-minimum",
};

test("runtime defaults to loopback and a simulated provider without Meta credentials", async () => {
  const runtime = loadRf01CoordinatorRuntime(base, { now: () => new Date("2026-10-13T18:00:00Z") });
  assert.equal(runtime.config.providerMode, "simulated");
  assert.equal(runtime.config.host, "127.0.0.1");
  assert.deepEqual(await runtime.send({}), {
    status: "accepted", acceptedAt: "2026-10-13T18:00:00.000Z", resultCode: "SIMULATED_ACCEPTANCE",
  });
});

test("real provider requires mode, explicit allow switch and all external settings", () => {
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_PROVIDER_MODE: "whatsapp" }), /REAL_WHATSAPP_NOT_EXPLICITLY_ALLOWED/);
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_PROVIDER_MODE: "other" }), /REAL_WHATSAPP_NOT_EXPLICITLY_ALLOWED/);
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_PROVIDER_MODE: "whatsapp", RF01_ALLOW_REAL_WHATSAPP: "YES" }), /MISSING_RF01_WA_ACCESS_TOKEN/);
});

test("invalid secret and numeric settings fail before the server starts", () => {
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_COORDINATOR_SERVICE_TOKEN: "short" }), /INVALID_RF01_COORDINATOR_SERVICE_TOKEN/);
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_COORDINATOR_PORT: "0" }), /INVALID_RF01_COORDINATOR_PORT/);
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_DB_POOL_MAX: "many" }), /INVALID_RF01_DB_POOL_MAX/);
});

test("simulated delay is explicit, bounded and never enables the real provider", async () => {
  const started = Date.now();
  const runtime = loadRf01CoordinatorRuntime({ ...base, RF01_PROVIDER_MODE: "simulated", RF01_SIMULATED_DELAY_MS: "10" }, { now: () => new Date("2026-10-14T18:00:00Z") });
  const result = await runtime.send({});
  assert.ok(Date.now() - started >= 8); assert.equal(runtime.config.simulatedDelayMs, 10);
  assert.equal(result.resultCode, "SIMULATED_ACCEPTANCE");
  assert.throws(() => loadRf01CoordinatorRuntime({ ...base, RF01_SIMULATED_DELAY_MS: "60001" }), /INVALID_RF01_SIMULATED_DELAY_MS/);
});
