import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workflow = JSON.parse(await readFile(new URL("../workflows/ReviewFlow_RF01_Principal_actual.json", import.meta.url), "utf8"));
const node = name => workflow.nodes.find(candidate => candidate.name === name);
const base = overrides => ({
  service_id: "synthetic-ca05-listo-1", customer_name: "Synthetic", phone_e164: "+12025550105",
  appointment_at: "2026-10-10T10:00:00Z", review_link: "https://example.test/review",
  status: "request_sent", request_sent: true, request_sent_at: "2026-10-10T12:00:00Z",
  review_confirmed: false, review_confirmed_at: null, reminder_sent: false, reminder_sent_at: null,
  thanks_sent: false, thanks_sent_at: null, completed_at: null, completion_reason: null,
  operation_phase: "idle", error_code: null, updated_at: "2026-10-10T12:00:00Z", ...overrides,
});
const event = { provider_event_id: "synthetic-ca05-event-1", phone_e164: "+12025550105", received_at: "2026-10-11T12:00:00Z", event_type: "LISTO", processing_status: "pending", service_id: null };

async function plan(services, events = [], mode = "manual") {
  const code = node("Plan one safe RF-01 command").parameters.jsCode;
  const $ = name => ({ first: () => {
    if ((mode === "manual" && name === "Manual Trigger") || (mode === "scheduled" && name.startsWith("Schedule Trigger"))) return { json: {} };
    throw new Error("not executed");
  } });
  const context = { items: [{ json: { source: "services", rows: services } }, { json: { source: "inbox_events", rows: events } }], $, $execution: { id: "synthetic-integrated-execution" }, Intl };
  return (await vm.runInNewContext(`const $input={all:()=>items};(async()=>{${code}})()`, context))[0].json;
}

async function classifyConfirmation(response, actionOverrides = {}) {
  const code = node("Classify coordinator result").parameters.jsCode;
  const action = { kind: "confirm", service_id: "synthetic-ca05-listo-1", provider_event_id: "synthetic-ca05-event-1", authoritativeVersion: 1, operationRef: "rf01:synthetic-ca05-listo-1:confirm", ...actionOverrides };
  return (await vm.runInNewContext(`const $input={first:()=>({json:response})};const $=()=>({first:()=>({json:action})});(async()=>{${code}})()`, { response, action }))[0].json;
}

async function revalidateReminder(events = []) {
  const code = node("Revalidate and prepare checkpoint").parameters.jsCode;
  const service = base({ service_id: "synthetic-ca07-reminder-1", phone_e164: "+12025550107", request_sent_at: "2026-10-10T00:00:00Z" });
  const action = {
    kind: "reminder", service_id: service.service_id, service, executionId: "synthetic-ca07-execution",
    operationRef: "rf01:synthetic-ca07-reminder-1:reminder", integratedTest: true,
    policy: { confirmationWindowDays: 7 },
    coordinator: { apiVersion: "v1", baseUrl: "http://host.docker.internal:18787", requestTimeoutMs: 1000, testMode: true, providerMode: "simulated" },
  };
  const items = [{ json: { source: "services", rows: [service] } }, { json: { source: "inbox_events", rows: events } }];
  const $ = () => ({ first: () => ({ json: action }) });
  return vm.runInNewContext(`const $input={all:()=>items};(async()=>{${code}})()`, { items, $ });
}

async function filterOutgoing(planResult, inputOverrides = {}) {
  const code = node("Filter outgoing command").parameters.jsCode;
  const input = { ...planResult.command, route: "outgoing", executionId: planResult.execution_id, coordinator: planResult.coordinator, policy: planResult.policy, ...inputOverrides };
  const items = [{ json: input }];
  const $ = () => ({ first: () => ({ json: planResult }) });
  return vm.runInNewContext(`const $input={all:()=>items};(async()=>{${code}})()`, { items, $ });
}

test("CA05-CA08 integrated mode authorizes only explicit synthetic confirm, reminder and thanks", async () => {
  assert.equal(workflow.nodes.length, 37);
  assert.equal(node("Schedule Trigger (requires RF01_SCHEDULE_CRON)").disabled, true);
  const scenarios = [
    ["confirm", [base({})], [event]],
    ["reminder", [base({ service_id: "synthetic-ca07-reminder-1", phone_e164: "+12025550107", request_sent_at: "2026-10-10T00:00:00Z" })], []],
    ["thanks", [base({ service_id: "synthetic-ca08-thanks-1", phone_e164: "+12025550108", status: "confirmed", review_confirmed: true, review_confirmed_at: "2026-10-11T00:00:00Z" })], []],
  ];
  for (const [kind, services, events] of scenarios) {
    const result = await plan(services, events);
    assert.equal(result.command.kind, kind);
    assert.equal(result.integrated_test_authorized, true);
    assert.equal(result.execution_authorized, true);
    assert.deepEqual(Object.values(result.gates), [false, false, false, false, false, false]);
    assert.equal(result.coordinator.baseUrl, "http://host.docker.internal:18787");
    assert.equal(result.coordinator.testMode, true);
    assert.equal(result.coordinator.providerMode, "simulated");
  }
  const confirmation = await classifyConfirmation({ apiVersion: "v1", outcome: "accepted", code: "CONFIRMATION_RECORDED", serviceVersion: 2, projection: { ...base({}), status: "confirmed", review_confirmed: true, review_confirmed_at: "2026-10-11T12:00:00.000Z" } });
  assert.equal(confirmation.route, "confirmation_projection");
  assert.equal(confirmation.send_result, "accepted");
  assert.equal(confirmation.service.review_confirmed, true);

  const outsider = await plan([base({ service_id: "real-or-unscoped-service", phone_e164: "+12025550999" })]);
  assert.equal(outsider.command, null);
  assert.equal(outsider.execution_authorized, false);
  const scheduled = await plan(scenarios[1][1], [], "scheduled");
  assert.equal(scheduled.execution_authorized, false);
  assert.equal(scheduled.integrated_test_authorized, false);
  assert.doesNotMatch(JSON.stringify(workflow), /graph\.facebook\.com|WhatsApp Business Cloud API/);
  assert.match(node("Revalidate and prepare checkpoint").parameters.jsCode, /action\.integratedTest===true/);
});

test("CA05 recovers SERVICE_ALREADY_CONFIRMED only from a valid authoritative confirmation projection", async () => {
  const valid = { apiVersion: "v1", outcome: "blocked", code: "SERVICE_ALREADY_CONFIRMED", serviceVersion: 1, projection: { ...base({}), status: "confirmed", review_confirmed: true, review_confirmed_at: "2026-10-11T12:00:00.000Z" } };
  const recovered = await classifyConfirmation(valid);
  assert.equal(recovered.route, "confirmation_projection");
  assert.equal(recovered.send_result, "recovered_projection");

  const invalid = [
    { ...valid, serviceVersion: 0 },
    { ...valid, projection: { ...valid.projection, service_id: "synthetic-ca05-other" } },
    { ...valid, projection: { service_id: "synthetic-ca05-listo-1", status: "confirmed", review_confirmed: true } },
  ];
  for (const response of invalid) {
    const blocked = await classifyConfirmation(response);
    assert.equal(blocked.route, "blocked");
    assert.equal(blocked.send_result, "blocked");
    assert.equal(blocked.service, undefined);
  }
  const wrongCommand = await classifyConfirmation(valid, { kind: "reminder", operationRef: "rf01:synthetic-ca05-listo-1:reminder" });
  assert.equal(wrongCommand.route, "blocked");
  assert.equal(wrongCommand.service, undefined);
});

test("CA07 revalidation returns n8n items and blocks unresolved confirmation events", async () => {
  const output = await revalidateReminder();
  assert.equal(Array.isArray(output), true);
  assert.equal(output.length, 1);
  assert.deepEqual(Object.keys(output[0]), ["json"]);
  const serialized = JSON.parse(JSON.stringify(output));
  assert.equal(serialized[0].json.kind, "reminder");
  assert.equal(serialized[0].json.operationRef, "rf01:synthetic-ca07-reminder-1:reminder");
  assert.equal(serialized[0].json.coordinatorRequest.service.service_id, "synthetic-ca07-reminder-1");

  const matching = { provider_event_id: "synthetic-ca07-event-1", phone_e164: "+12025550107", received_at: "2026-10-11T00:00:00Z", event_type: "LISTO", processing_status: "pending", service_id: null };
  await assert.rejects(revalidateReminder([matching]), /REMINDER_BLOCKED_BY_UNRESOLVED_EVENT/);
  await assert.rejects(revalidateReminder([{ ...matching, received_at: "invalid" }]), /REMINDER_BLOCKED_BY_UNCERTAIN_EVENT/);

  const unrelated = await revalidateReminder([{ ...matching, provider_event_id: "synthetic-ca07-other", phone_e164: "+12025550999" }]);
  assert.equal(unrelated[0].json.service.service_id, "synthetic-ca07-reminder-1");
});

test("CA07 outgoing filter restores only planner-authorized isolated marker", async () => {
  const service = base({ service_id: "synthetic-ca07-reminder-1", phone_e164: "+12025550107", request_sent_at: "2026-10-10T00:00:00Z" });
  const authorizedPlan = await plan([service]);
  const authorized = await filterOutgoing(authorizedPlan, { integratedTest: undefined });
  assert.equal(authorized.length, 1);
  assert.equal(authorized[0].json.integratedTest, true);

  const scheduledPlan = await plan([service], [], "scheduled");
  const scheduled = await filterOutgoing(scheduledPlan, { integratedTest: true });
  assert.equal(scheduled[0].json.integratedTest, false);

  const wrongIdentity = await filterOutgoing(authorizedPlan, { service_id: "synthetic-ca07-other", integratedTest: true });
  assert.equal(wrongIdentity[0].json.integratedTest, false);
  const realProvider = await filterOutgoing({ ...authorizedPlan, coordinator: { ...authorizedPlan.coordinator, providerMode: "real" } }, { integratedTest: true });
  assert.equal(realProvider[0].json.integratedTest, false);
});
