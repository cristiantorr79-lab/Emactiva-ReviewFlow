import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseUrl = process.env.RF01_PG_TEST_URL;
const allowReset = process.env.RF01_PG_TEST_ALLOW_RESET === "YES";
const enabled = Boolean(databaseUrl && allowReset);

function psql(args, input) {
  return spawnSync("psql", [databaseUrl, "--set", "ON_ERROR_STOP=1", ...args], {
    encoding: "utf8",
    input,
    windowsHide: true,
  });
}

test("migration 006 and incremental correction execute start_send on real PostgreSQL", { skip: !enabled }, () => {
  const version = spawnSync("psql", ["--version"], { encoding: "utf8", windowsHide: true });
  assert.equal(version.status, 0, version.stderr || "psql is unavailable");

  const migration006 = readFileSync(new URL("../db/migrations/006_rf001_t01_operation_coordinator.sql", import.meta.url), "utf8");
  const migration007 = readFileSync(new URL("../db/migrations/007_rf001_t01_qualify_operation_state.sql", import.meta.url), "utf8");
  const exercise = String.raw`
DO $test$
DECLARE
  v_run record;
  v_operation record;
  v_started record;
BEGIN
  SELECT * INTO v_run FROM reviewflow_coordinator.acquire_run('rf001-test-A');
  IF NOT v_run.allowed THEN RAISE EXCEPTION 'acquire failed: %', v_run.reason; END IF;
  SELECT * INTO v_operation FROM reviewflow_coordinator.reserve_operation(
    'rf001-test-A', v_run.generation, 'synthetic-service-pg-1', 'request', 'rf01:synthetic-service-pg-1:request'
  );
  IF NOT v_operation.allowed THEN RAISE EXCEPTION 'reserve failed: %', v_operation.reason; END IF;
  SELECT * INTO v_started FROM reviewflow_coordinator.start_send(
    'rf001-test-A', v_run.generation, v_operation.operation_id
  );
  IF NOT v_started.allowed OR v_started.state <> 'sending' THEN
    RAISE EXCEPTION 'start_send failed: state %, reason %', v_started.state, v_started.reason;
  END IF;
  PERFORM reviewflow_coordinator.release_run('rf001-test-A', v_run.generation);
END
$test$;
SELECT 'RF001_PG_INTEGRATION_PASS';
`;

  const result = psql([], `DROP SCHEMA IF EXISTS reviewflow_coordinator CASCADE;\n${migration006}\n${migration007}\n${exercise}`);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /RF001_PG_INTEGRATION_PASS/);
});
