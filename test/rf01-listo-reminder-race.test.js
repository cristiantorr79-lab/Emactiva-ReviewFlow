import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = new URL("../workflows/ReviewFlow_RF01_Principal_actual.json", import.meta.url);

test("LISTO/reminder decisions use authoritative versioning and stale Sheets cannot overwrite confirmation", async () => {
  const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
  const node = name => workflow.nodes.find(candidate => candidate.name === name);
  const writtenColumns = name => Object.keys(node(name).parameters.columns.value);

  const technicalProjection = [
    "service_id", "status", "request_sent", "request_sent_at", "review_confirmed", "review_confirmed_at",
    "reminder_sent", "reminder_sent_at", "thanks_sent", "thanks_sent_at", "completed_at",
    "completion_reason", "operation_phase", "error_code", "updated_at",
  ];
  assert.deepEqual(writtenColumns("Persist confirmation"), technicalProjection);
  assert.deepEqual(writtenColumns("Persist final outgoing state"), technicalProjection);
  for (const forbidden of ["customer_name", "phone_e164", "appointment_at", "review_link"]) {
    assert.equal(technicalProjection.includes(forbidden), false);
  }
  assert.equal(node("Persist outgoing checkpoint"), undefined);
  assert.equal(writtenColumns("Persist final outgoing state").includes("review_confirmed"), true);
  assert.equal(writtenColumns("Persist final outgoing state").includes("review_confirmed_at"), true);

  const afterReread = workflow.connections["Wait for outgoing rereads"].main[0][0].node;
  assert.equal(afterReread, "Revalidate and prepare checkpoint");
  assert.equal(workflow.connections["Revalidate and prepare checkpoint"].main[0][0].node, "Resolve authoritative service state");
  assert.equal(
    workflow.connections["Prepare coordinator command"].main[0][0].node,
    "RF-01 Coordinator HTTP",
  );
  const classify = node("Classify coordinator result").parameters.jsCode;
  assert.match(classify, /SERVICE_ALREADY_CONFIRMED/);
  assert.match(classify, /version>a\.authoritativeVersion/);
  assert.match(classify, /projection\.service_id===a\.service_id/);
});
