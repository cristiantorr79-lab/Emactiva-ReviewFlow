import assert from "node:assert/strict";
import test from "node:test";
import { createRf01CoordinatorHttpHandler } from "../src/rf01-coordinator-http-service.js";

const token = "synthetic-block3-token-at-least-32-characters";
const row = { service_id: "service-1", customer_name: "Synthetic", phone_e164: "+12025550101", appointment_at: "2026-10-13T10:00:00Z", review_link: "https://example.test/review", status: "pending", request_sent: false, request_sent_at: null, review_confirmed: false, review_confirmed_at: null, reminder_sent: false, reminder_sent_at: null, thanks_sent: false, thanks_sent_at: null, completed_at: null, completion_reason: null, operation_phase: "idle", error_code: null, updated_at: "2026-10-13T10:00:00Z" };
const dbRow = { ...row, request_sent_at: null, review_confirmed_at: null, reminder_sent_at: null, thanks_sent_at: null, version: 1 };

function setup(existing = null) {
  const db = { state: existing };
  const connect = async () => ({
    query: async (sql, values) => {
      if (/^SELECT \* FROM reviewflow_operational/.test(sql)) return { rows: db.state?.service_id === values[0] ? [db.state] : [] };
      if (/^INSERT INTO/.test(sql)) { if (db.state) return { rows: [] }; db.state = { ...dbRow }; return { rows: [db.state] }; }
      throw new Error("unexpected query");
    },
    release: async () => {},
  });
  return { db, handler: createRf01CoordinatorHttpHandler({ connect, serviceToken: token, send: async () => { throw new Error("not used"); } }) };
}

const resolve = (handler, service = row) => handler({ method: "POST", path: "/v1/services/state/resolve", authorization: `Bearer ${token}`, body: { apiVersion: "v1", service } });

test("state resolution imports once and later returns PostgreSQL projection instead of stale Sheets state", async () => {
  const { db, handler } = setup(); const first = await resolve(handler);
  assert.equal(first.status, 200); assert.equal(first.body.serviceVersion, 1); assert.equal(first.body.projection.request_sent, false);
  db.state = { ...db.state, status: "request_sent", request_sent_at: "2026-10-14T12:00:00Z", version: 3 };
  const recovered = await resolve(handler, { ...row, status: "pending", request_sent: false });
  assert.equal(recovered.body.serviceVersion, 3); assert.equal(recovered.body.projection.request_sent, true);
});

test("identity mismatch and storage loss fail closed without a projection", async () => {
  const { handler } = setup({ ...dbRow, phone_e164: "+12025550102" });
  const mismatch = await resolve(handler); assert.equal(mismatch.status, 409); assert.equal(mismatch.body.code, "SERVICE_IDENTITY_MISMATCH"); assert.equal(mismatch.body.projection, undefined);
  const unavailable = createRf01CoordinatorHttpHandler({ connect: async () => { throw new Error("down"); }, serviceToken: token, send: async () => {} });
  const lost = await resolve(unavailable); assert.equal(lost.status, 503); assert.equal(lost.body.code, "COORDINATOR_UNAVAILABLE"); assert.equal(lost.body.projection, undefined);
});
