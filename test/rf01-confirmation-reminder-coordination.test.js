import assert from "node:assert/strict";
import test from "node:test";
import { Rf01N8nPostgresAdapter } from "../src/rf01-n8n-postgres-adapter.js";
import { createRf01CoordinatorHttpHandler } from "../src/rf01-coordinator-http-service.js";
import { createRf01CoordinatorConfirmationHttpClient } from "../src/rf01-coordinator-http-client.js";

const token = "synthetic-service-token-32-characters-minimum";
const identity = executionId => ({ executionId, serviceId: "service-1", operationKind: "reminder", operationRef: "rf01:service-1:reminder" });

class Database {
  constructor() {
    this.lock = null; this.generation = 0; this.operation = null; this.sends = 0;
    this.state = { service_id: "service-1", status: "request_sent", operation_phase: "idle", request_sent_at: "2026-10-13T12:00:00Z", review_confirmed_at: null, reminder_sent_at: null, version: 1 };
  }
  connect = async () => new Client(this, Symbol("client"));
}

class Client {
  constructor(db, id) { this.db = db; this.id = id; }
  async query(sql, values) {
    if (sql === "BEGIN") { this.snapshot = { state: { ...this.db.state }, operation: this.db.operation }; return { rows: [] }; }
    if (sql === "ROLLBACK") { this.db.state = this.snapshot.state; this.db.operation = this.snapshot.operation; this.snapshot = null; return { rows: [] }; }
    if (sql === "COMMIT") { this.snapshot = null; return { rows: [] }; }
    if (/UPDATE reviewflow_operational\.service_state/.test(sql) && /status='confirmed'/.test(sql)) {
      if (!this.#owner(values[0], values[1]) || this.db.state.version !== Number(values[3]) || this.db.state.review_confirmed_at || !this.db.state.request_sent_at) return { rows: [] };
      Object.assign(this.db.state, { status: "confirmed", operation_phase: "idle", review_confirmed_at: values[4], version: this.db.state.version + 1 });
      return { rows: [{ ...this.db.state }] };
    }
    if (/UPDATE reviewflow_operational\.service_state/.test(sql) && /operation_phase=\$5/.test(sql) && !/completion_reason/.test(sql)) {
      if (!this.#owner(values[0], values[1]) || this.db.state.version !== Number(values[3]) || this.db.state.operation_phase !== "idle" || this.db.state.review_confirmed_at || this.db.state.reminder_sent_at) return { rows: [] };
      this.db.state.operation_phase = values[4]; this.db.state.version++;
      return { rows: [{ ...this.db.state }] };
    }
    if (/UPDATE reviewflow_operational\.service_state/.test(sql) && /completion_reason/.test(sql)) {
      if (!this.#owner(values[0], values[1]) || this.db.state.version !== Number(values[3]) || this.db.state.operation_phase !== "reminder_prepared" || this.db.state.review_confirmed_at) return { rows: [] };
      Object.assign(this.db.state, { status: values[4], operation_phase: values[5], reminder_sent_at: values[6], version: this.db.state.version + 1 });
      return { rows: [{ ...this.db.state }] };
    }
    if (/SELECT \* FROM reviewflow_operational/.test(sql)) return { rows: this.db.state.service_id === values[0] ? [{ ...this.db.state }] : [] };
    const name = sql.match(/SELECT \* FROM reviewflow_coordinator\.([a-z_]+)/)?.[1] ??
      sql.match(/SELECT reviewflow_coordinator\.([a-z_]+)/)?.[1];
    if (name === "acquire_run") {
      if (this.db.lock) return { rows: [{ allowed: false, reason: "RUN_ALREADY_ACTIVE" }] };
      this.db.lock = { id: this.id, executionId: values[0], generation: ++this.db.generation };
      return { rows: [{ allowed: true, generation: this.db.generation }] };
    }
    if (name === "release_run") {
      const valid = this.db.lock?.id === this.id && this.db.lock.executionId === values[0] && this.db.lock.generation === Number(values[1]);
      if (valid) this.db.lock = null;
      return { rows: [{ released: valid, reason: valid ? null : "OWNER_MISMATCH" }] };
    }
    if (name === "owner_is_current") return { rows: [{ current: this.#owner(values[0], values[1]) }] };
    if (name === "reserve_operation") {
      if (this.db.operation) return { rows: [{ allowed: false, operation_id: 1, state: this.db.operation, reason: "IDEMPOTENCY_KEY_EXISTS" }] };
      this.db.operation = "prepared"; return { rows: [{ allowed: true, operation_id: 1, state: "prepared" }] };
    }
    if (name === "start_send") { this.db.operation = "sending"; return { rows: [{ allowed: true, state: "sending" }] }; }
    if (name === "record_result") { this.db.operation = values[3]; return { rows: [{ allowed: true, state: values[3] }] }; }
    throw new Error(`unexpected query: ${sql}`);
  }
  #owner(executionId, generation) { return this.db.lock?.id === this.id && this.db.lock.executionId === executionId && this.db.lock.generation === Number(generation); }
  async release() { if (this.db.lock?.id === this.id) this.db.lock = null; }
}

test("LISTO committed at the expected version blocks a stale reminder before send", async () => {
  const db = new Database(); const adapter = new Rf01N8nPostgresAdapter({ connect: db.connect });
  const confirmation = await adapter.runConfirmation({ executionId: "confirm-1", serviceId: "service-1", expectedVersion: 1, confirmedAt: "2026-10-13T13:00:00Z" });
  const reminder = await adapter.runReminder(identity("reminder-1"), 1, { send: async () => { db.sends++; return { status: "accepted", acceptedAt: "2026-10-13T14:00:00Z" }; } });
  assert.equal(confirmation.allowed, true); assert.equal(confirmation.version, 2);
  assert.equal(reminder.allowed, false); assert.equal(reminder.reason, "SERVICE_ALREADY_CONFIRMED"); assert.equal(db.sends, 0);
  assert.equal(db.state.status, "confirmed"); assert.equal(db.state.review_confirmed_at, "2026-10-13T13:00:00.000Z");
});

test("physical run lock rejects confirmation while reminder operation is in flight", async () => {
  const db = new Database(); const adapter = new Rf01N8nPostgresAdapter({ connect: db.connect });
  let releaseSend; const held = new Promise(resolve => { releaseSend = resolve; });
  const reminderPromise = adapter.runReminder(identity("reminder-1"), 1, { send: async () => { db.sends++; await held; return { status: "accepted", acceptedAt: "2026-10-13T14:00:00Z" }; } });
  await new Promise(resolve => setImmediate(resolve));
  const confirmation = await adapter.runConfirmation({ executionId: "confirm-1", serviceId: "service-1", expectedVersion: 1, confirmedAt: "2026-10-13T13:00:00Z" });
  assert.equal(confirmation.reason, "RUN_ALREADY_ACTIVE"); releaseSend();
  const reminder = await reminderPromise; assert.equal(reminder.allowed, true); assert.equal(reminder.service_version, 3); assert.equal(db.sends, 1);
});

test("ambiguous reminder is durable and cannot be resent automatically", async () => {
  const db = new Database(); const adapter = new Rf01N8nPostgresAdapter({ connect: db.connect });
  const send = async () => { db.sends++; return { status: "ambiguous", resultCode: "WA_TIMEOUT" }; };
  const first = await adapter.runReminder(identity("reminder-1"), 1, { send });
  const retry = await adapter.runReminder(identity("reminder-2"), first.service_version, { send });
  assert.equal(first.reason, "SEND_AMBIGUOUS"); assert.equal(db.state.operation_phase, "reminder_ambiguous");
  assert.equal(retry.reason, "STALE_VERSION"); assert.equal(db.sends, 1);
});

test("idempotency conflict rolls back reminder authorization", async () => {
  const db = new Database(); db.operation = "ambiguous";
  const adapter = new Rf01N8nPostgresAdapter({ connect: db.connect });
  const result = await adapter.runReminder(identity("reminder-conflict"), 1, { send: async () => { db.sends++; } });
  assert.equal(result.reason, "IDEMPOTENCY_KEY_EXISTS"); assert.equal(db.sends, 0);
  assert.equal(db.state.operation_phase, "idle"); assert.equal(db.state.version, 1);
});

test("HTTP contract authenticates confirmation and requires a version for reminders", async () => {
  const db = new Database();
  const handler = createRf01CoordinatorHttpHandler({ connect: db.connect, serviceToken: token, send: async () => { throw new Error("must not send"); } });
  const confirmation = await handler({ method: "POST", path: "/v1/confirmations", authorization: `Bearer ${token}`, body: { apiVersion: "v1", confirmation: { executionId: "confirm-http", serviceId: "service-1", expectedVersion: 1, confirmedAt: "2026-10-13T13:00:00Z" } } });
  assert.equal(confirmation.status, 200); assert.equal(confirmation.body.code, "CONFIRMATION_RECORDED"); assert.equal(confirmation.body.serviceVersion, 2);
  const reminder = await handler({ method: "POST", path: "/v1/operations/outgoing", authorization: `Bearer ${token}`, body: { apiVersion: "v1", operation: { ...identity("reminder-http") }, message: { phoneE164: "+12025550101", customerName: "Synthetic", reviewLink: "https://example.test/review" } } });
  assert.equal(reminder.status, 400); assert.equal(reminder.body.code, "EXPECTED_VERSION_REQUIRED");
});

test("confirmation HTTP client sends only the versioned confirmation contract", async () => {
  let captured;
  const client = createRf01CoordinatorConfirmationHttpClient({
    baseUrl: "https://coordinator.example.test", serviceToken: token,
    fetchImpl: async (url, options) => { captured = { url, options }; return { status: 200, json: async () => ({ outcome: "accepted", code: "CONFIRMATION_RECORDED" }) }; },
  });
  const confirmation = { executionId: "confirm-client", serviceId: "service-1", expectedVersion: 1, confirmedAt: "2026-10-13T13:00:00Z" };
  const result = await client(confirmation);
  assert.equal(result.outcome, "accepted"); assert.equal(captured.url, "https://coordinator.example.test/v1/confirmations");
  assert.deepEqual(JSON.parse(captured.options.body), { apiVersion: "v1", confirmation });
  assert.equal(captured.options.headers.authorization, `Bearer ${token}`);
});
