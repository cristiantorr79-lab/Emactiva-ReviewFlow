import assert from "node:assert/strict";
import test from "node:test";
import { Rf01N8nPostgresAdapter } from "../src/rf01-n8n-postgres-adapter.js";

class PhysicalClient {
  constructor(database, id) { this.database = database; this.id = id; this.owner = null; this.generation = null; this.released = false; }
  async query(sql, values) {
    this.database.calls.push({ client: this.id, name: sql.match(/reviewflow_coordinator\.([a-z_]+)/)?.[1] });
    const name = this.database.calls.at(-1).name;
    if (this.database.failOn === name) throw new Error("synthetic database failure");
    if (name === "acquire_run") { if (this.database.lock) return { rows: [{ allowed: false, reason: "RUN_ALREADY_ACTIVE" }] }; this.database.lock = this.id; this.owner = values[0]; this.generation = 1; return { rows: [{ allowed: true, generation: 1 }] }; }
    if (name === "release_run") { this.database.lock = null; return { rows: [{ released: true }] }; }
    if (name === "reserve_operation") { if (this.database.operation) return { rows: [{ allowed: false, operation_id: 1, state: this.database.operation, reason: "IDEMPOTENCY_KEY_EXISTS" }] }; this.database.operation = "prepared"; return { rows: [{ allowed: true, operation_id: 1, state: "prepared" }] }; }
    if (name === "start_send") { this.database.operation = "sending"; return { rows: [{ allowed: true, state: "sending" }] }; }
    if (name === "record_result") { this.database.operation = values[3]; return { rows: [{ allowed: true, state: values[3] }] }; }
    throw new Error("unexpected query");
  }
  async release(error) { this.released = true; this.destroyed = Boolean(error); if (this.database.lock === this.id) this.database.lock = null; }
}

const identity = { executionId: "n8n-execution-1", serviceId: "service-1", operationKind: "request", operationRef: "rf01:service-1:request" };
const setup = () => {
  const database = { calls: [], lock: null, operation: null, clients: 0 };
  const adapter = new Rf01N8nPostgresAdapter({ connect: async () => (database.client = new PhysicalClient(database, ++database.clients)) });
  return { database, adapter };
};

test("one physical client covers lock, checkpoint, send transition, result, and release", async () => {
  const { database, adapter } = setup();
  let checkpointSawLock = false; let sendSawLock = false;
  const result = await adapter.runOutgoing(identity, {
    beforeSend: async () => { checkpointSawLock = database.lock === database.client.id; return { confirmed: true }; },
    send: async () => { sendSawLock = database.lock === database.client.id; return { status: "accepted", acceptedAt: "2026-10-13T12:00:00-03:00", providerMessageRef: "wamid.synthetic" }; },
  });
  assert.equal(result.allowed, true); assert.equal(result.state, "accepted");
  assert.equal(result.accepted_at, "2026-10-13T15:00:00.000Z");
  assert.equal(checkpointSawLock, true); assert.equal(sendSawLock, true); assert.equal(database.client.released, true);
  assert.deepEqual(new Set(database.calls.map(call => call.client)), new Set([1]));
  assert.deepEqual(database.calls.map(call => call.name), ["acquire_run", "reserve_operation", "start_send", "record_result", "release_run"]);
});

test("checkpoint failure occurs under lock and prevents start_send and send", async () => {
  const { database, adapter } = setup(); let sends = 0;
  const result = await adapter.runOutgoing(identity, { beforeSend: async () => ({ confirmed: false }), send: async () => { sends++; } });
  assert.equal(result.reason, "CHECKPOINT_NOT_CONFIRMED"); assert.equal(sends, 0); assert.equal(database.operation, "prepared");
  assert.deepEqual(database.calls.map(call => call.name), ["acquire_run", "reserve_operation", "release_run"]);
});

test("send exception and invalid acceptance become durable ambiguous results", async () => {
  for (const send of [async () => { throw new Error("timeout"); }, async () => ({ status: "accepted", acceptedAt: "invalid" })]) {
    const { database, adapter } = setup();
    const result = await adapter.runOutgoing(identity, { send });
    assert.equal(result.allowed, false); assert.equal(result.state, "ambiguous"); assert.equal(database.operation, "ambiguous");
  }
});

test("database failure after send start fails closed and releases the locked client", async () => {
  const { database, adapter } = setup(); database.failOn = "record_result";
  const result = await adapter.runOutgoing(identity, { send: async () => ({ status: "ambiguous" }) });
  assert.equal(result.reason, "RESULT_NOT_DURABLE"); assert.equal(database.operation, "sending");
  assert.equal(database.client.destroyed, false);
});

test("a prior operation blocks a second send", async () => {
  const { database, adapter } = setup(); let sends = 0;
  await adapter.runOutgoing(identity, { send: async () => { sends++; return { status: "ambiguous" }; } });
  const second = await adapter.runOutgoing({ ...identity, executionId: "n8n-execution-2" }, { send: async () => { sends++; return { status: "accepted", acceptedAt: new Date().toISOString() }; } });
  assert.equal(second.reason, "IDEMPOTENCY_KEY_EXISTS"); assert.equal(sends, 1);
});
