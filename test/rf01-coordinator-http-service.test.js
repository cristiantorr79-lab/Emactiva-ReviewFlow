import assert from "node:assert/strict";
import test from "node:test";
import { createRf01CoordinatorHttpHandler } from "../src/rf01-coordinator-http-service.js";
import { createRf01CoordinatorHttpClient } from "../src/rf01-coordinator-http-client.js";
import { createRf01WhatsAppCloudProvider } from "../src/rf01-whatsapp-cloud-provider.js";

const token = "synthetic-service-token-32-characters-minimum";
const request = (executionId = "execution-1") => ({
  method: "POST", path: "/v1/operations/outgoing", authorization: `Bearer ${token}`,
  body: { apiVersion: "v1", operation: { executionId, serviceId: "service-1", operationKind: "request", operationRef: "rf01:service-1:request", expectedVersion: 1 }, message: { phoneE164: "+12025550101", customerName: "Synthetic", reviewLink: "https://example.test/review" } },
});

class Database {
  constructor() { this.lock = null; this.generation = 0; this.operation = null; this.clients = []; this.failResult = false; this.state={service_id:"service-1",customer_name:"Synthetic",phone_e164:"+12025550101",appointment_at:"2026-10-13T10:00:00Z",review_link:"https://example.test/review",status:"pending",operation_phase:"idle",request_sent_at:null,review_confirmed_at:null,reminder_sent_at:null,thanks_sent_at:null,completed_at:null,completion_reason:null,error_code:null,version:1}; }
  connect = async () => { const client = new Client(this, this.clients.length + 1); this.clients.push(client); return client; };
}
class Client {
  constructor(db, id) { this.db = db; this.id = id; this.owner = null; this.generation = null; this.calls = []; }
  async query(sql, values) {
    if(sql==="BEGIN"){this.snapshot={state:{...this.db.state},operation:this.db.operation};return {rows:[]};}if(sql==="COMMIT"){this.snapshot=null;return {rows:[]};}if(sql==="ROLLBACK"){this.db.state=this.snapshot.state;this.db.operation=this.snapshot.operation;return {rows:[]};}
    if(/UPDATE reviewflow_operational\.service_state/.test(sql)&&/operation_phase=\$5/.test(sql)){if(this.db.state.version!==Number(values[3]))return {rows:[]};this.db.state.operation_phase=values[4];this.db.state.version++;return {rows:[{...this.db.state}]};}
    if(/UPDATE reviewflow_operational\.service_state/.test(sql)&&/completion_reason/.test(sql)){this.db.state.status=values[4];this.db.state.operation_phase=values[5];this.db.state.request_sent_at=values[6];this.db.state.version++;return {rows:[{...this.db.state}]};}
    if(/SELECT \* FROM reviewflow_operational/.test(sql))return {rows:[{...this.db.state}]};
    const name = sql.match(/reviewflow_coordinator\.([a-z_]+)/)?.[1]; this.calls.push(name);
    if (name === "acquire_run") { if (this.db.lock) return { rows: [{ allowed: false, reason: "RUN_ALREADY_ACTIVE" }] }; this.db.lock = this.id; this.owner = values[0]; this.generation = ++this.db.generation; return { rows: [{ allowed: true, generation: this.generation }] }; }
    if (name === "release_run") { if (this.db.lock !== this.id) return { rows: [{ released: false, reason: "OWNER_MISMATCH" }] }; this.db.lock = null; return { rows: [{ released: true }] }; }
    if (name === "owner_is_current") return { rows: [{ current: this.db.lock === this.id }] };
    if (name === "reserve_operation") { if (this.db.operation) return { rows: [{ allowed: false, operation_id: 1, state: this.db.operation, reason: "IDEMPOTENCY_KEY_EXISTS" }] }; this.db.operation = "prepared"; return { rows: [{ allowed: true, operation_id: 1, state: "prepared" }] }; }
    if (name === "start_send") { this.db.operation = "sending"; return { rows: [{ allowed: true, state: "sending" }] }; }
    if (name === "record_result") { if (this.db.failResult) throw new Error("storage unavailable"); this.db.operation = values[3]; return { rows: [{ allowed: true, state: values[3] }] }; }
    throw new Error("unexpected query");
  }
  async release(error) { this.destroyed = Boolean(error); if (this.db.lock === this.id) this.db.lock = null; }
}

const setup = overrides => {
  const db = new Database(); const logs = [];
  const handler = createRf01CoordinatorHttpHandler({ connect: db.connect, serviceToken: token, send: async () => ({ status: "accepted", acceptedAt: "2026-10-13T15:00:00Z" }), logger: event => logs.push(event), ...overrides });
  return { db, logs, handler };
};

test("health is minimal and critical operation requires authentication", async () => {
  const { handler } = setup();
  assert.deepEqual((await handler({ method: "GET", path: "/health" })).body, { status: "ok", apiVersion: "v1" });
  const denied = await handler({ ...request(), authorization: "Bearer wrong" });
  assert.equal(denied.status, 401); assert.deepEqual(denied.body, { outcome: "rejected", code: "UNAUTHORIZED" });
});

test("accepted operation uses one physical client and returns no personal data", async () => {
  const { db, logs, handler } = setup(); const result = await handler(request());
  assert.equal(result.status, 200); assert.equal(result.body.outcome, "accepted");
  assert.equal(result.body.acceptedAt, "2026-10-13T15:00:00.000Z");
  assert.equal(db.clients.length, 1); assert.deepEqual(db.clients[0].calls.filter(Boolean), ["acquire_run", "reserve_operation", "start_send", "record_result", "release_run"]);
  assert.doesNotMatch(JSON.stringify(logs), /Synthetic|12025550101|example\.test/);
});

test("duplicate operation is blocked without a second provider call", async () => {
  let sends = 0; const { handler } = setup({ send: async () => { sends++; return { status: "ambiguous", resultCode: "WA_TIMEOUT" }; } });
  assert.equal((await handler(request())).body.outcome, "uncertain");
  const duplicate = await handler(request("execution-2"));
  assert.equal(duplicate.status, 409); assert.ok(["STALE_VERSION","IDEMPOTENCY_KEY_EXISTS"].includes(duplicate.body.code)); assert.equal(sends, 1);
});

test("concurrent request is rejected while first provider attempt holds the connection lock", async () => {
  let release; const hold = new Promise(resolve => { release = resolve; });
  const { handler } = setup({ send: async () => { await hold; return { status: "accepted", acceptedAt: "2026-10-13T15:00:00Z" }; } });
  const first = handler(request()); await new Promise(resolve => setImmediate(resolve));
  const concurrent = await handler(request("execution-2"));
  assert.equal(concurrent.status, 409); assert.equal(concurrent.body.code, "RUN_ALREADY_ACTIVE");
  release(); assert.equal((await first).body.outcome, "accepted");
});

test("provider failures and invalid acceptance become ambiguous and prevent recovery resend", async () => {
  for (const send of [async () => { throw new Error("connection interrupted"); }, async () => ({ status: "accepted" })]) {
    const { handler } = setup({ send });
    const first = await handler(request()); const retry = await handler(request("execution-2"));
    assert.equal(first.body.outcome, "uncertain"); assert.ok(["STALE_VERSION","IDEMPOTENCY_KEY_EXISTS"].includes(retry.body.code));
  }
});

test("result persistence failure leaves sending and fails closed", async () => {
  const { db, handler } = setup(); db.failResult = true;
  const result = await handler(request());
  assert.equal(result.status, 202); assert.equal(result.body.code, "RESULT_NOT_DURABLE"); assert.equal(db.operation, "sending");
});

test("WhatsApp provider builds approved template and classifies simulated responses", async () => {
  let captured; const provider = createRf01WhatsAppCloudProvider({ accessToken: "secret", phoneNumberId: "phone-id", businessName: "Business", now: () => new Date("2026-10-13T15:00:00Z"), fetchImpl: async (url, options) => { captured = { url, options }; return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.synthetic" }] }) }; } });
  const outcome = await provider({ identity: request().body.operation, message: request().body.message, signal: new AbortController().signal });
  assert.equal(outcome.status, "accepted"); const payload = JSON.parse(captured.options.body);
  assert.equal(payload.template.name, "reviewflow_solicitud_resena"); assert.equal(payload.template.language.code, "es_CL");
  assert.equal(captured.options.headers.authorization, "Bearer secret");
});

test("RF-01 HTTP client fails closed on transport uncertainty", async () => {
  const client = createRf01CoordinatorHttpClient({ baseUrl: "https://coordinator.example.test", serviceToken: token, fetchImpl: async () => { throw new Error("timeout"); } });
  assert.deepEqual(await client({ operation: request().body.operation, message: request().body.message }), { apiVersion: "v1", outcome: "uncertain", code: "COORDINATOR_REQUEST_UNCERTAIN" });
});
