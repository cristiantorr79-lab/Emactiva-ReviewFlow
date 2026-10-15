import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { createRf01CoordinatorHttpHandler } from "../src/rf01-coordinator-http-service.js";

const enabled = process.env.RF01_BLOCK3_PG_TEST === "YES";
const token = "synthetic-block3-token-at-least-32-characters";

test("two overlapping executions yield one send and a recoverable authoritative projection", { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.RF01_BLOCK3_PG_URL, max: 5 });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const serviceId = `block3-${suffix}`;
  const service = { service_id: serviceId, customer_name: "Synthetic", phone_e164: "+12025550101", appointment_at: "2026-10-13T10:00:00Z", review_link: "https://example.test/review", status: "pending", request_sent: false, request_sent_at: null, review_confirmed: false, review_confirmed_at: null, reminder_sent: false, reminder_sent_at: null, thanks_sent: false, thanks_sent_at: null, completed_at: null, completion_reason: null, operation_phase: "idle", error_code: null, updated_at: "2026-10-13T10:00:00Z" };
  let releaseSend; const hold = new Promise(resolve => { releaseSend = resolve; }); let sends = 0;
  const handler = createRf01CoordinatorHttpHandler({ connect: () => pool.connect(), serviceToken: token, send: async () => { sends++; await hold; return { status: "accepted", acceptedAt: "2026-10-14T12:00:00Z", providerMessageRef: "synthetic-ref" }; } });
  const call = (path, body) => handler({ method: "POST", path, authorization: `Bearer ${token}`, body });
  const operation = executionId => ({ apiVersion: "v1", operation: { executionId, serviceId, operationKind: "request", operationRef: `rf01:${serviceId}:request`, expectedVersion: 1 }, message: { phoneE164: service.phone_e164, customerName: service.customer_name, reviewLink: service.review_link } });
  try {
    const resolved = await call("/v1/services/state/resolve", { apiVersion: "v1", service });
    assert.equal(resolved.status, 200); assert.equal(resolved.body.serviceVersion, 1);

    const firstPromise = call("/v1/operations/outgoing", operation(`first-${suffix}`));
    while (sends === 0) await new Promise(resolve => setImmediate(resolve));
    const second = await call("/v1/operations/outgoing", operation(`second-${suffix}`));
    assert.equal(second.status, 409); assert.equal(second.body.code, "RUN_ALREADY_ACTIVE");
    releaseSend(); const first = await firstPromise;
    assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.serviceVersion, 3); assert.equal(first.body.projection.request_sent, true); assert.equal(sends, 1);

    const stale = await call("/v1/operations/outgoing", operation(`stale-${suffix}`));
    assert.equal(stale.status, 409); assert.equal(stale.body.code, "STALE_VERSION"); assert.equal(sends, 1);
    const recovered = await call("/v1/services/state/resolve", { apiVersion: "v1", service });
    assert.equal(recovered.body.serviceVersion, 3); assert.equal(recovered.body.projection.request_sent, true);
  } finally {
    await pool.query("DELETE FROM reviewflow_coordinator.operation_transition WHERE operation_id IN (SELECT operation_id FROM reviewflow_coordinator.whatsapp_operation WHERE service_id=$1)", [serviceId]).catch(() => {});
    await pool.query("DELETE FROM reviewflow_coordinator.whatsapp_operation WHERE service_id=$1", [serviceId]).catch(() => {});
    await pool.query("DELETE FROM reviewflow_operational.service_state WHERE service_id=$1", [serviceId]).catch(() => {});
    await pool.end();
  }
});
