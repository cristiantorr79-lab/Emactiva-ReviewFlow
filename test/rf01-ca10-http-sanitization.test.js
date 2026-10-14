import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workflowPath = new URL("../workflows/ReviewFlow_RF01_Principal_actual.json", import.meta.url);
const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
const node = name => workflow.nodes.find(candidate => candidate.name === name);

async function classify(response) {
  const action = {
    kind: "request",
    service_id: "synthetic-service-1",
    authoritativeVersion: 1,
    operationRef: "rf01:synthetic-service-1:request",
  };
  const code = node("Classify coordinator result").parameters.jsCode;
  return (await vm.runInNewContext(
    `const $input={first:()=>({json:response})};const $=()=>({first:()=>({json:action})});(async()=>{${code}})()`,
    { response, action },
  ))[0].json;
}

async function prepare(response) {
  const source = {
    kind: "request",
    service_id: "synthetic-service-1",
    executionId: "synthetic-execution",
    coordinator: { baseUrl: "https://coordinator.example.test", requestTimeoutMs: 20000 },
  };
  const code = node("Prepare coordinator command").parameters.jsCode;
  return (await vm.runInNewContext(
    `const $input={first:()=>({json:response})};const $=()=>({first:()=>({json:source})});(async()=>{${code}})()`,
    { response, source },
  ))[0].json;
}

test("post-CA10 consumes direct application bodies and remains fail-closed", async () => {
  assert.equal(workflow.nodes.length, 37);
  for (const name of ["Resolve authoritative service state", "RF-01 Coordinator HTTP"]) {
    const current = node(name);
    const options = current.parameters.options.response.response;
    assert.equal(current.onError, "stopWorkflow");
    assert.equal(options.neverError, true);
    assert.equal(options.fullResponse, undefined);
    assert.equal(options.responseFormat, undefined);
  }
  assert.equal(workflow.connections["RF-01 Coordinator HTTP"].main.length, 1);

  const projection = { service_id: "synthetic-service-1", status: "request_sent", request_sent: true, request_sent_at: "2026-10-14T15:00:00.000Z", operation_phase: "idle" };
  const resolvedProjection = { ...projection, customer_name: "Synthetic", phone_e164: "+12025550101", review_link: "https://example.test/review" };
  const prepared = await prepare({ apiVersion: "v1", outcome: "accepted", code: "STATE_RESOLVED", serviceVersion: 1, projection: resolvedProjection });
  assert.equal(prepared.authoritativeVersion, 1);
  assert.equal(prepared.coordinatorRequest.operation.expectedVersion, 1);

  assert.equal((await classify({ apiVersion: "v1", outcome: "accepted", code: "PROVIDER_ACCEPTED", serviceVersion: 2, projection })).route, "outgoing_projection");
  assert.equal((await classify({ apiVersion: "v1", outcome: "blocked", code: "STALE_VERSION", serviceVersion: 2, projection })).send_result, "recovered_projection");
  assert.equal((await classify({ apiVersion: "v1", outcome: "blocked", code: "RUN_ALREADY_ACTIVE" })).send_result, "blocked");
  assert.equal((await classify({ apiVersion: "v1", outcome: "rejected", code: "SEND_REJECTED" })).send_result, "rejected");

  for (const response of [
    { error: "connection refused", request: { headers: { authorization: "Bearer synthetic-secret" } } },
    { apiVersion: "v1", outcome: "accepted", code: "PROVIDER_ACCEPTED" },
    { apiVersion: "v1", outcome: "blocked", code: "Bearer synthetic-secret", headers: { authorization: "Bearer synthetic-secret" } },
    { outcome: "blocked", code: "RUN_ALREADY_ACTIVE" },
  ]) {
    const result = await classify(response);
    assert.equal(result.route, "blocked");
    assert.equal(result.send_result, "uncertain");
    assert.doesNotMatch(JSON.stringify(result), /authorization|synthetic-secret|"headers"|"request"\s*:/i);
  }

  await assert.rejects(
    prepare({ outcome: "accepted", code: "STATE_RESOLVED", serviceVersion: 1, projection: resolvedProjection }),
    /AUTHORITATIVE_STATE_NOT_RESOLVED/,
  );
});
