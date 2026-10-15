import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyRf01ServiceTransition, createRf01ServiceState } from "../src/rf01-service-state.js";
import { rf01ServiceStateFromSheetRow, rf01ServiceStateToSheetRow } from "../src/rf01-service-state-sheet-mapper.js";
import { Rf01PostgresServiceStateRepository } from "../src/rf01-postgres-service-state-repository.js";

const initial = (overrides = {}) => ({
  serviceId: "service-state-1", customerName: "Synthetic", phoneE164: "+12025550101",
  appointmentAt: "2026-10-13T12:00:00Z", reviewLink: "https://example.test/review",
  status: "pending", operationPhase: "idle", requestSentAt: null, reviewConfirmedAt: null,
  reminderSentAt: null, thanksSentAt: null, completedAt: null, completionReason: null,
  errorCode: null, version: 1, ...overrides,
});

test("domain transition uses expected version and rejects a stale snapshot", () => {
  const current = createRf01ServiceState(initial());
  const accepted = applyRf01ServiceTransition(current, 1, {
    status: "request_sent", requestSentAt: "2026-10-13T15:00:00Z",
  });
  assert.equal(accepted.applied, true);
  assert.equal(accepted.current.version, 2);
  assert.equal(accepted.current.requestSentAt, "2026-10-13T15:00:00.000Z");
  assert.deepEqual(applyRf01ServiceTransition(accepted.current, 1, { operationPhase: "request_prepared" }), {
    applied: false, reason: "STALE_VERSION", current: accepted.current,
  });
});

test("PostgreSQL repository permits only one concurrent transition from the same version", async () => {
  const database = new MemoryDatabase(initial());
  const repository = new Rf01PostgresServiceStateRepository({ query: database.query });
  const [first, second] = await Promise.all([
    repository.applyTransition("service-state-1", 1, { status: "request_sent", requestSentAt: "2026-10-13T15:00:00Z" }),
    repository.applyTransition("service-state-1", 1, { status: "request_sent", requestSentAt: "2026-10-13T15:01:00Z" }),
  ]);
  assert.equal([first, second].filter(result => result.applied).length, 1);
  const rejected = [first, second].find(result => !result.applied);
  assert.equal(rejected.reason, "STALE_VERSION");
  assert.equal(rejected.currentVersion, 2);
  assert.equal((await repository.getByServiceId("service-state-1")).version, 2);
});

test("Sheets mapper preserves the approved 19-column contract without leaking it into the domain model", () => {
  const row = {
    service_id: "service-state-1", customer_name: "Synthetic", phone_e164: "+12025550101",
    appointment_at: "2026-10-13T12:00:00Z", review_link: "https://example.test/review", status: "request_sent",
    request_sent: "true", request_sent_at: "2026-10-13T15:00:00Z", review_confirmed: "false", review_confirmed_at: "",
    reminder_sent: false, reminder_sent_at: "", thanks_sent: false, thanks_sent_at: "", completed_at: "",
    completion_reason: "", operation_phase: "idle", error_code: "", updated_at: "2026-10-13T15:00:00Z",
  };
  const state = rf01ServiceStateFromSheetRow(row, { version: 4 });
  assert.equal(state.version, 4);
  assert.equal("request_sent" in state, false);
  const projected = rf01ServiceStateToSheetRow(state, { updatedAt: "2026-10-13T15:02:00Z" });
  assert.equal(Object.keys(projected).length, 19);
  assert.equal(projected.request_sent, true);
  assert.equal(projected.review_confirmed, false);
});

test("invalid transition integrity and migration safety fail closed", async () => {
  assert.throws(() => createRf01ServiceState(initial({ status: "confirmed" })), /STATUS_REQUIRES_REQUEST/);
  assert.throws(() => applyRf01ServiceTransition(initial(), 1, { customerName: "Changed" }), /INVALID_TRANSITION/);
  const sql = await readFile(new URL("../db/migrations/008_rf001_operational_service_state.sql", import.meta.url), "utf8");
  assert.match(sql, /version bigint NOT NULL DEFAULT 1/);
  assert.match(sql, /PRIMARY KEY/);
  assert.match(sql, /REVOKE ALL/);
  assert.doesNotMatch(sql, /DROP\s|TRUNCATE\s|google|sheets|n8n/i);
});

class MemoryDatabase {
  constructor(value) { this.row = toRow(createRf01ServiceState(value)); }
  query = async (sql, values) => {
    if (sql.startsWith("SELECT")) return { rows: this.row?.service_id === values[0] ? [{ ...this.row }] : [] };
    if (sql.startsWith("UPDATE")) {
      if (!this.row || this.row.service_id !== values[0] || this.row.version !== values[1]) return { rows: [] };
      Object.assign(this.row, {
        status: values[2], operation_phase: values[3], request_sent_at: values[4], review_confirmed_at: values[5],
        reminder_sent_at: values[6], thanks_sent_at: values[7], completed_at: values[8], completion_reason: values[9],
        error_code: values[10], version: this.row.version + 1,
      });
      return { rows: [{ ...this.row }] };
    }
    throw new Error("UNEXPECTED_QUERY");
  };
}

function toRow(value) {
  return {
    service_id: value.serviceId, customer_name: value.customerName, phone_e164: value.phoneE164,
    appointment_at: value.appointmentAt, review_link: value.reviewLink, status: value.status,
    operation_phase: value.operationPhase, request_sent_at: value.requestSentAt,
    review_confirmed_at: value.reviewConfirmedAt, reminder_sent_at: value.reminderSentAt,
    thanks_sent_at: value.thanksSentAt, completed_at: value.completedAt,
    completion_reason: value.completionReason, error_code: value.errorCode, version: value.version,
  };
}
