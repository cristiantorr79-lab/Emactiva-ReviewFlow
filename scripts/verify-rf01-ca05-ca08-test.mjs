import pg from "pg";

const scenario = process.argv.find(value => ["listo", "reminder", "thanks"].includes(value));
const cleanup = process.argv.includes("--cleanup");
const databaseUrl = process.env.RF01_CA05_CA08_DATABASE_URL;
const cases = {
  listo: { serviceId: "synthetic-ca05-listo-1", operationKind: null, status: "confirmed", completionReason: null, version: 2 },
  reminder: { serviceId: "synthetic-ca07-reminder-1", operationKind: "reminder", status: "completed", completionReason: "reminder_finished", version: 3 },
  thanks: { serviceId: "synthetic-ca08-thanks-1", operationKind: "thanks", status: "completed", completionReason: "confirmed_thanked", version: 3 },
};
if (!databaseUrl) throw new Error("MISSING_RF01_CA05_CA08_DATABASE_URL");
if (!scenario) throw new Error("SCENARIO_REQUIRED:listo|reminder|thanks");
const expected = cases[scenario];
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });

try {
  const stateRows = (await pool.query(
    `SELECT status,operation_phase,review_confirmed_at,reminder_sent_at,thanks_sent_at,completion_reason,version
       FROM reviewflow_operational.service_state WHERE service_id=$1`,
    [expected.serviceId],
  )).rows;
  const operations = (await pool.query(
    `SELECT operation_id,operation_kind,state,attempt_count
       FROM reviewflow_coordinator.whatsapp_operation WHERE service_id=$1 ORDER BY operation_id`,
    [expected.serviceId],
  )).rows;
  const state = stateRows[0];
  if (stateRows.length !== 1 || state.status !== expected.status || state.operation_phase !== "idle" || Number(state.version) !== expected.version) throw new Error("INTEGRATED_STATE_NOT_PROVEN");
  if ((state.completion_reason ?? null) !== expected.completionReason) throw new Error("INTEGRATED_COMPLETION_NOT_PROVEN");
  if (scenario === "listo" && (!state.review_confirmed_at || operations.length !== 0)) throw new Error("LISTO_PERSISTENCE_NOT_PROVEN");
  if (scenario !== "listo" && (operations.length !== 1 || operations[0].operation_kind !== expected.operationKind || operations[0].state !== "accepted" || Number(operations[0].attempt_count) !== 1)) throw new Error("SINGLE_EFFECT_NOT_PROVEN");
  if (scenario === "reminder" && !state.reminder_sent_at) throw new Error("REMINDER_TIMESTAMP_NOT_PROVEN");
  if (scenario === "thanks" && !state.thanks_sent_at) throw new Error("THANKS_TIMESTAMP_NOT_PROVEN");
  console.log(JSON.stringify({ result: "PASS", scenario, serviceId: expected.serviceId, operations: operations.length, attempts: operations.reduce((sum, row) => sum + Number(row.attempt_count), 0), version: Number(state.version) }));

  if (cleanup) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM reviewflow_coordinator.operation_transition WHERE operation_id IN (SELECT operation_id FROM reviewflow_coordinator.whatsapp_operation WHERE service_id=$1)`, [expected.serviceId]);
      await client.query("DELETE FROM reviewflow_coordinator.whatsapp_operation WHERE service_id=$1", [expected.serviceId]);
      await client.query("DELETE FROM reviewflow_operational.service_state WHERE service_id=$1", [expected.serviceId]);
      await client.query("COMMIT");
      console.log(JSON.stringify({ cleanup: "PASS", scenario, serviceId: expected.serviceId }));
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
