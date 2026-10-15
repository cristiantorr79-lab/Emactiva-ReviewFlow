import pg from "pg";

const serviceId = process.argv.find(value => value.startsWith("synthetic-ca09-"));
const cleanup = process.argv.includes("--cleanup");
const databaseUrl = process.env.RF01_CA09_DATABASE_URL;
if (!databaseUrl) throw new Error("MISSING_RF01_CA09_DATABASE_URL");
if (!serviceId || !/^synthetic-ca09-[A-Za-z0-9._:-]+$/.test(serviceId)) throw new Error("INVALID_CA09_TEST_SERVICE_ID");

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
try {
  const operation = (await pool.query(
    `SELECT operation_id,state,attempt_count FROM reviewflow_coordinator.whatsapp_operation
     WHERE service_id=$1 AND operation_kind='request' ORDER BY operation_id`, [serviceId],
  )).rows;
  const state = (await pool.query(
    `SELECT status,operation_phase,request_sent_at,version FROM reviewflow_operational.service_state WHERE service_id=$1`, [serviceId],
  )).rows;
  if (operation.length !== 1 || operation[0].state !== "accepted" || Number(operation[0].attempt_count) !== 1) throw new Error("CA09_SINGLE_EFFECT_NOT_PROVEN");
  if (state.length !== 1 || state[0].status !== "request_sent" || state[0].operation_phase !== "idle" || !state[0].request_sent_at || Number(state[0].version) !== 3) throw new Error("CA09_FINAL_STATE_INVALID");
  console.log(JSON.stringify({ result: "PASS", serviceId, operations: 1, attempts: 1, operationState: "accepted", serviceVersion: 3 }));
  if (cleanup) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM reviewflow_coordinator.operation_transition WHERE operation_id=$1", [operation[0].operation_id]);
      await client.query("DELETE FROM reviewflow_coordinator.whatsapp_operation WHERE operation_id=$1 AND service_id=$2", [operation[0].operation_id, serviceId]);
      await client.query("DELETE FROM reviewflow_operational.service_state WHERE service_id=$1", [serviceId]);
      await client.query("COMMIT");
      console.log(JSON.stringify({ cleanup: "PASS", serviceId }));
    } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error; }
    finally { client.release(); }
  }
} finally { await pool.end(); }
