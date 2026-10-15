import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { Rf01N8nPostgresAdapter } from "../src/rf01-n8n-postgres-adapter.js";

const enabled = process.env.RF01_T02_PG_TEST === "YES";

test("LISTO/reminder coordination works with the least-privileged PostgreSQL role", { skip: !enabled }, async () => {
  const pool = new pg.Pool({ connectionString: process.env.RF01_T02_PG_URL, max: 4 });
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const serviceId = `t02-confirm-${suffix}`;
  const reminderId = `t02-reminder-${suffix}`;
  try {
    const privileges = (await pool.query(
      `SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,
       has_schema_privilege(current_user,'reviewflow_operational','USAGE') AS operational_usage,
       has_table_privilege(current_user,'reviewflow_operational.service_state','SELECT,INSERT,UPDATE') AS state_dml
       FROM pg_roles r WHERE r.rolname=current_user`,
    )).rows[0];
    assert.deepEqual(privileges, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, operational_usage: true, state_dml: true });

    for (const id of [serviceId, reminderId]) {
      await pool.query(
        `INSERT INTO reviewflow_operational.service_state
         (service_id,customer_name,phone_e164,appointment_at,review_link,status,operation_phase,request_sent_at)
         VALUES ($1,'Synthetic','+12025550101','2026-10-13T10:00:00Z','https://example.test/review','request_sent','idle','2026-10-13T12:00:00Z')`,
        [id],
      );
    }

    const adapter = new Rf01N8nPostgresAdapter({ connect: () => pool.connect() });
    const confirmation = await adapter.runConfirmation({ executionId: `confirm-${suffix}`, serviceId, expectedVersion: 1, confirmedAt: "2026-10-13T13:00:00Z" });
    let staleSends = 0;
    const staleReminder = await adapter.runReminder(
      { executionId: `stale-${suffix}`, serviceId, operationKind: "reminder", operationRef: `rf01:${serviceId}:reminder` }, 1,
      { send: async () => { staleSends++; return { status: "accepted", acceptedAt: "2026-10-13T14:00:00Z" }; } },
    );
    assert.equal(confirmation.allowed, true); assert.equal(confirmation.version, 2);
    assert.equal(staleReminder.reason, "SERVICE_ALREADY_CONFIRMED"); assert.equal(staleSends, 0);

    let ambiguousSends = 0;
    const ambiguous = await adapter.runReminder(
      { executionId: `ambiguous-${suffix}`, serviceId: reminderId, operationKind: "reminder", operationRef: `rf01:${reminderId}:reminder` }, 1,
      { send: async () => { ambiguousSends++; return { status: "ambiguous", resultCode: "WA_TIMEOUT" }; } },
    );
    const retry = await adapter.runReminder(
      { executionId: `retry-${suffix}`, serviceId: reminderId, operationKind: "reminder", operationRef: `rf01:${reminderId}:reminder` }, ambiguous.service_version,
      { send: async () => { ambiguousSends++; return { status: "accepted", acceptedAt: "2026-10-13T14:00:00Z" }; } },
    );
    assert.equal(ambiguous.reason, "SEND_AMBIGUOUS"); assert.equal(retry.reason, "STALE_VERSION"); assert.equal(ambiguousSends, 1);
  } finally {
    await pool.query("DELETE FROM reviewflow_operational.service_state WHERE service_id IN ($1,$2)", [serviceId, reminderId]).catch(() => {});
    await pool.end();
  }
});
