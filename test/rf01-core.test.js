import test from "node:test";
import assert from "node:assert/strict";
import { runRf01Cycle, validateService } from "../src/rf01-core.js";

const config = { criticalConfigPresent: true, contactAuthorized: true, requestDelayHours: 2, reminderDelayHours: 12, confirmationWindowDays: 7 };
const baseService = (overrides = {}) => ({
  service_id: "svc-1", customer_name: "Synthetic", phone_e164: "+56911111111",
  appointment_at: "2026-10-01T10:00:00Z", review_link: "https://example.test/review",
  status: "pending", request_sent: false, request_sent_at: null,
  review_confirmed: false, review_confirmed_at: null,
  reminder_sent: false, reminder_sent_at: null, thanks_sent: false, thanks_sent_at: null,
  completed_at: null, completion_reason: null, operation_phase: "idle", error_code: null,
  updated_at: "2026-10-01T10:00:00Z", ...overrides,
});
const sentService = (overrides = {}) => baseService({
  status: "request_sent", request_sent: true, request_sent_at: "2026-10-01T12:00:00Z", ...overrides,
});
const event = (overrides = {}) => ({
  provider_event_id: "evt-1", phone_e164: "+56911111111", received_at: "2026-10-01T13:00:00Z",
  event_type: "LISTO", processing_status: "pending", ...overrides,
});

function harness(options = {}) {
  const calls = [];
  let serviceWrites = 0;
  let eventWrites = 0;
  return {
    calls,
    adapters: {
      async now() {
        const value = options.nowTimes?.length ? options.nowTimes.shift() : options.defaultNow;
        if (value instanceof Error) throw value;
        return value;
      },
      ...(options.omitSchedule ? {} : {
        async isAllowedToSend({ kind }) {
          if (options.scheduleError) throw new Error("synthetic schedule failure");
          return { status: options.scheduleByKind?.[kind] ?? options.scheduleStatus ?? "allowed" };
        },
      }),
      async persistService(value) {
        serviceWrites += 1; calls.push(["persistService", structuredClone(value)]);
        if (options.failServiceWriteAt === serviceWrites) throw new Error("synthetic write failure");
      },
      async persistEvent(value) {
        eventWrites += 1; calls.push(["persistEvent", structuredClone(value)]);
        if (options.failEventWriteAt === eventWrites) throw new Error("synthetic event write failure");
      },
      async send(value) {
        calls.push(["send", structuredClone(value)]);
        return options.sendResults?.shift() ?? { status: "confirmed" };
      },
      async rereadForReminder(value) {
        calls.push(["reread", structuredClone(value)]);
        if (options.rereadError) throw new Error("synthetic reread failure");
        return options.reread ?? { status: "confirmed", service: sentService(), events: [] };
      },
    },
  };
}

async function run({ now = "2026-10-01T12:00:00Z", services = [baseService()], events = [], cfg = config, options = {} } = {}) {
  const h = harness({ defaultNow: now, ...options });
  const output = await runRf01Cycle({ now, config: cfg, services, inboxEvents: events, adapters: h.adapters });
  return { ...output, calls: h.calls };
}

test("request boundary: before +2h has no effect; exact +2h sends after checkpoint", async () => {
  const before = await run({ now: "2026-10-01T11:59:59.999Z" });
  assert.equal(before.results.effects.length, 0);
  const exact = await run();
  assert.deepEqual(exact.calls.slice(0, 2).map(c => [c[0], c[1].operation_phase ?? c[1].kind]), [["persistService", "request_prepared"], ["send", "request"]]);
  assert.equal(exact.services[0].request_sent_at, "2026-10-01T12:00:00.000Z");
});

test("reminder boundary: before +12h has no effect; exact +12h revalidates then sends once", async () => {
  const service = sentService();
  const before = await run({ now: "2026-10-01T23:59:59.999Z", services: [service] });
  assert.equal(before.results.effects.length, 0);
  const exact = await run({ now: "2026-10-02T00:00:00Z", services: [service], options: { reread: { status: "confirmed", service, events: [] } } });
  assert.deepEqual(exact.calls.map(c => c[0]), ["reread", "persistService", "send", "persistService"]);
  assert.equal(exact.services[0].completion_reason, "reminder_finished");
});

test("LISTO uses inclusive received_at window and rejects before request or after +7d", async () => {
  for (const received_at of ["2026-10-01T12:00:00Z", "2026-10-08T12:00:00Z"]) {
    const out = await run({ services: [sentService()], events: [event({ received_at })] });
    assert.equal(out.services[0].review_confirmed, true);
    assert.equal(out.services[0].completion_reason, "confirmed_thanked");
  }
  for (const received_at of ["2026-10-01T11:59:59.999Z", "2026-10-08T12:00:00.001Z"]) {
    const out = await run({ services: [sentService()], events: [event({ received_at })] });
    assert.equal(out.services[0].review_confirmed, false);
    assert.equal(out.results.events[0].result, "ambiguous");
  }
});

test("invalid dates and duplicate service_id block affected records without effects", async () => {
  const invalid = baseService({ appointment_at: "not-a-date" });
  const out = await run({ services: [invalid, baseService({ appointment_at: "2026-09-01T10:00:00Z" })] });
  assert.equal(out.results.validation.length, 2);
  assert.equal(out.calls.length, 0);
  assert.ok(out.results.validation.some(v => v.errors.includes("DUPLICATE_SERVICE_ID")));
});

test("multiple candidate services make LISTO ambiguous and produce no outgoing effect", async () => {
  const out = await run({ services: [sentService(), sentService({ service_id: "svc-2" })], events: [event()] });
  assert.equal(out.results.events[0].reason, "AMBIGUOUS_CUSTOMER_MATCH");
  assert.equal(out.calls.filter(c => c[0] === "send").length, 0);
});

test("same provider ID and two distinct LISTO never create a second thank-you", async () => {
  const duplicate = await run({ services: [sentService()], events: [event(), event()] });
  assert.equal(duplicate.calls.filter(c => c[0] === "send" && c[1].kind === "thanks").length, 1);
  assert.equal(duplicate.results.events[1].result, "duplicate");
  const two = await run({ services: [sentService()], events: [event(), event({ provider_event_id: "evt-2" })] });
  assert.equal(two.calls.filter(c => c[0] === "send" && c[1].kind === "thanks").length, 1);
});

test("failure after confirmation before event processed preserves confirmation on adapter boundary", async () => {
  const out = await run({ services: [sentService()], events: [event()], options: { failEventWriteAt: 1 } });
  assert.equal(out.services[0].review_confirmed, true);
  assert.equal(out.results.blocked[0].reason, "EVENT_STATE_WRITE_FAILED");
  assert.equal(out.services[0].thanks_sent, true);
});

test("pending LISTO is reprocessed after interruption without repeating confirmation or thanks", async () => {
  const interrupted = await run({ services: [sentService()], events: [event()], options: { failEventWriteAt: 1 } });
  assert.equal(interrupted.services[0].review_confirmed, true);
  assert.equal(interrupted.services[0].thanks_sent, true);
  assert.equal(interrupted.inboxEvents[0].processing_status, "pending");

  const recovered = await run({ services: interrupted.services, events: interrupted.inboxEvents });
  assert.equal(recovered.inboxEvents[0].processing_status, "processed");
  assert.equal(recovered.inboxEvents[0].service_id, "svc-1");
  assert.equal(recovered.calls.filter(call => call[0] === "persistService").length, 0);
  assert.equal(recovered.calls.filter(call => call[0] === "send").length, 0);
  assert.equal(recovered.calls.filter(call => call[0] === "persistEvent").length, 1);
  assert.deepEqual(recovered.results.events, [{ provider_event_id: "evt-1", result: "processed", service_id: "svc-1" }]);
});

test("failed checkpoint prevents send; residual prepared and restart also prevent blind resend", async () => {
  const failed = await run({ options: { failServiceWriteAt: 1 } });
  assert.equal(failed.calls.filter(c => c[0] === "send").length, 0);
  assert.equal(failed.results.blocked[0].reason, "CHECKPOINT_WRITE_FAILED");
  const residual = await run({ services: [baseService({ operation_phase: "request_prepared" })] });
  assert.equal(residual.calls.length, 0);
  assert.equal(residual.results.effects.length, 0);
  assert.equal(residual.results.blocked[0].reason, "OPERATION_NEEDS_RECONCILIATION");
});

test("timeout is ambiguous; provider acceptance followed by state-write failure is ambiguous", async () => {
  const timeout = await run({ options: { sendResults: [{ status: "ambiguous" }] } });
  assert.equal(timeout.services[0].operation_phase, "request_ambiguous");
  assert.equal(timeout.results.effects.length, 0);
  const writeFail = await run({ options: { failServiceWriteAt: 2 } });
  assert.equal(writeFail.services[0].operation_phase, "request_ambiguous");
  assert.equal(writeFail.services[0].request_sent, false);
});

test("LISTO found during reminder reread cancels reminder; reread failure blocks it", async () => {
  const service = sentService();
  const found = await run({ now: "2026-10-02T00:00:00Z", services: [service], options: { reread: { status: "confirmed", service, events: [event()] } } });
  assert.equal(found.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), false);
  assert.equal(found.calls.some(c => c[0] === "send" && c[1].kind === "thanks"), true);
  assert.equal(found.services[0].review_confirmed, true);
  const failed = await run({ now: "2026-10-02T00:00:00Z", services: [service], options: { rereadError: true } });
  assert.equal(failed.results.blocked[0].reason, "REMINDER_REVALIDATION_FAILED");
  assert.equal(failed.calls.some(c => c[0] === "send"), false);
});

test("late confirmation after reminder keeps reminder history and only confirmed thanks changes closure", async () => {
  const completed = sentService({ status: "completed", reminder_sent: true, reminder_sent_at: "2026-10-02T00:00:00Z", completed_at: "2026-10-02T00:00:00Z", completion_reason: "reminder_finished" });
  const out = await run({ now: "2026-10-03T00:00:00Z", services: [completed], events: [event({ received_at: "2026-10-03T00:00:00Z" })] });
  assert.equal(out.services[0].reminder_sent_at, "2026-10-02T00:00:00Z");
  assert.equal(out.services[0].completion_reason, "confirmed_thanked");
});

test("ambiguous thank keeps confirmation and never marks confirmed_thanked", async () => {
  const out = await run({ services: [sentService()], events: [event()], options: { sendResults: [{ status: "ambiguous" }] } });
  assert.equal(out.services[0].review_confirmed, true);
  assert.equal(out.services[0].thanks_sent, false);
  assert.notEqual(out.services[0].completion_reason, "confirmed_thanked");
  assert.equal(out.services[0].operation_phase, "thanks_ambiguous");
});

test("missing authorization or critical configuration blocks every outgoing decision", async () => {
  for (const cfg of [{ ...config, contactAuthorized: false }, { ...config, criticalConfigPresent: false }]) {
    const out = await run({ cfg });
    assert.equal(out.calls.length, 0);
    assert.equal(out.results.blocked.length, 1);
  }
});

test("service invariants reject contradictory completion and sent flags", () => {
  const errors = validateService(baseService({ thanks_sent: true, thanks_sent_at: null, completed_at: "2026-10-01T12:00:00Z", completion_reason: "confirmed_thanked" }));
  assert.ok(errors.includes("MISSING_THANKS_SENT_AT"));
  assert.ok(errors.includes("THANKS_REQUIRES_CONFIRMATION"));
});

test("denied, missing or uncertain schedule makes zero sends for request, reminder and thanks while confirmation persists", async () => {
  const scenarios = [
    { services: [baseService()], now: "2026-10-01T12:00:00Z" },
    { services: [sentService()], now: "2026-10-02T00:00:00Z", options: { reread: { status: "confirmed", service: sentService(), events: [] } } },
    { services: [sentService()], events: [event()] },
  ];
  for (const policy of [{ scheduleStatus: "denied" }, { omitSchedule: true }, { scheduleStatus: "ambiguous" }]) {
    for (const scenario of scenarios) {
      const out = await run({ ...scenario, options: { ...scenario.options, ...policy } });
      assert.equal(out.calls.some(c => c[0] === "send"), false);
      if (scenario.events) assert.equal(out.services[0].review_confirmed, true);
    }
  }
});

test("advancing operation clock uses acceptance time and does not anticipate reminder from cycle start", async () => {
  const out = await run({
    now: "2026-10-01T12:00:00Z",
    options: {
      nowTimes: [
        "2026-10-01T12:00:00Z", "2026-10-01T12:00:01Z", "2026-10-01T12:05:00Z",
        "2026-10-02T00:04:59Z",
      ],
    },
  });
  assert.equal(out.services[0].request_sent_at, "2026-10-01T12:05:00.000Z");
  assert.equal(out.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), false);
  const exact = await run({
    now: "2026-10-02T00:05:00Z", services: [sentService({ request_sent_at: "2026-10-01T12:05:00Z" })],
    options: { reread: { status: "confirmed", service: sentService({ request_sent_at: "2026-10-01T12:05:00Z" }), events: [] } },
  });
  assert.equal(exact.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), true);
});

test("trusted adapter acceptance timestamp is normalized and invalid time makes operation ambiguous", async () => {
  const accepted = await run({ options: { sendResults: [{ status: "confirmed", accepted_at: "2026-10-01T09:30:00-03:00" }] } });
  assert.equal(accepted.services[0].request_sent_at, "2026-10-01T12:30:00.000Z");
  const invalid = await run({ options: { sendResults: [{ status: "confirmed", accepted_at: "not-a-date" }] } });
  assert.equal(invalid.services[0].operation_phase, "request_ambiguous");
  assert.equal(invalid.services[0].request_sent, false);
});

test("reread identity mismatch blocks reminder and leaves original row intact", async () => {
  const original = sentService();
  for (const rereadService of [sentService({ service_id: "svc-other" }), sentService({ phone_e164: "+56922222222" })]) {
    const out = await run({ now: "2026-10-02T00:00:00Z", services: [original], options: { reread: { status: "confirmed", service: rereadService, events: [] } } });
    assert.equal(out.calls.some(c => c[0] === "send"), false);
    assert.deepEqual(out.services[0], original);
    assert.equal(out.results.blocked.at(-1).reason, "REMINDER_REVALIDATION_IDENTITY_MISMATCH");
  }
});

test("invalid or duplicate potentially matching rows prevent arbitrary LISTO correlation", async () => {
  const invalidDate = await run({ services: [sentService(), sentService({ service_id: "svc-2", request_sent_at: "invalid" })], events: [event()] });
  assert.equal(invalidDate.services[0].review_confirmed, false);
  assert.equal(invalidDate.results.events[0].reason, "AMBIGUOUS_CUSTOMER_MATCH");
  const duplicateId = await run({ services: [sentService(), sentService()], events: [event()] });
  assert.equal(duplicateId.results.events[0].reason, "AMBIGUOUS_CUSTOMER_MATCH");
  assert.equal(duplicateId.calls.some(c => c[0] === "send"), false);
});

test("operationRef is stable across cycles and distinct between operation types", async () => {
  const first = await run();
  const second = await run();
  const requestRef = first.results.effects[0].operationRef;
  assert.equal(requestRef, second.results.effects[0].operationRef);
  const thanks = await run({ services: [sentService()], events: [event()] });
  assert.notEqual(requestRef, thanks.results.effects[0].operationRef);
  assert.equal(first.calls.find(c => c[0] === "send")[1].operationRef, requestRef);
});

test("confirmation window accepts positive finite alternatives and blocks invalid values", async () => {
  const alternative = await run({ cfg: { ...config, confirmationWindowDays: 2 }, services: [sentService()], events: [event({ received_at: "2026-10-03T12:00:00Z" })] });
  assert.equal(alternative.services[0].review_confirmed, true);
  for (const value of [0, -1, Infinity, NaN, undefined]) {
    const out = await run({ cfg: { ...config, confirmationWindowDays: value }, services: [sentService()], events: [event()] });
    assert.equal(out.calls.length, 0);
    assert.equal(out.results.blocked[0].reason, "INVALID_CONFIRMATIONWINDOWDAYS");
  }
});

test("two LISTO candidates found during reread block every potentially affected reminder", async () => {
  const first = sentService();
  const second = sentService({ service_id: "svc-2" });
  const out = await run({
    now: "2026-10-02T00:00:00Z", services: [first, second],
    options: { reread: { status: "confirmed", service: first, events: [event()] } },
  });
  assert.equal(out.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), false);
  assert.ok(out.results.blocked.some(item => item.reason === "UNRESOLVED_CONFIRMATION_EVENT"));
});

test("ambiguous LISTO from initial inbox remains a reminder block in later cycles", async () => {
  const services = [sentService(), sentService({ service_id: "svc-2" })];
  const initial = await run({ now: "2026-10-02T00:00:00Z", services, events: [event()] });
  assert.equal(initial.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), false);
  const unresolved = event({ processing_status: "ambiguous", error_code: "AMBIGUOUS_CUSTOMER_MATCH" });
  const later = await run({ now: "2026-10-03T00:00:00Z", services, events: [unresolved] });
  assert.equal(later.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), false);
  assert.equal(later.results.events[0].result, "ambiguous");
});

test("confirmation or event persistence failure never enables a reminder", async () => {
  const service = sentService();
  const confirmationFail = await run({ now: "2026-10-02T00:00:00Z", services: [service], events: [event()], options: { failServiceWriteAt: 1 } });
  assert.equal(confirmationFail.calls.some(c => c[0] === "send"), false);
  assert.equal(confirmationFail.services[0].review_confirmed, false);
  assert.ok(confirmationFail.results.blocked.some(item => item.reason === "CONFIRMATION_WRITE_FAILED"));
  const eventFail = await run({ now: "2026-10-02T00:00:00Z", services: [service], events: [event()], options: { failEventWriteAt: 1 } });
  assert.equal(eventFail.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), false);
  assert.ok(eventFail.results.blocked.some(item => item.reason === "EVENT_STATE_WRITE_FAILED"));
});

test("duplicate service_id across different phones prevents confirmation and thanks", async () => {
  const services = [sentService(), sentService({ phone_e164: "+56922222222" })];
  const out = await run({ services, events: [event()] });
  assert.equal(out.services.some(service => service.review_confirmed), false);
  assert.equal(out.calls.some(c => c[0] === "persistService"), false);
  assert.equal(out.calls.some(c => c[0] === "send" && c[1].kind === "thanks"), false);
  assert.equal(out.results.events[0].result, "ambiguous");
});

test("unrelated-phone and demonstrably out-of-window events do not block a healthy reminder", async () => {
  const service = sentService();
  for (const unrelated of [
    event({ phone_e164: "+56933333333" }),
    event({ received_at: "2026-10-09T12:00:00Z" }),
  ]) {
    const out = await run({
      now: "2026-10-02T00:00:00Z", services: [service], events: [unrelated],
      options: { reread: { status: "confirmed", service, events: [] } },
    });
    assert.equal(out.calls.some(c => c[0] === "send" && c[1].kind === "reminder"), true);
  }
});

test("core runs without structuredClone and keeps persisted values isolated", async () => {
  const originalStructuredClone = globalThis.structuredClone;
  const persisted = [];
  try {
    globalThis.structuredClone = undefined;
    const output = await runRf01Cycle({
      now: "2026-10-01T12:00:00Z",
      config,
      services: [baseService()],
      inboxEvents: [],
      adapters: {
        async now() { return "2026-10-01T12:00:00Z"; },
        async isAllowedToSend() { return { status: "allowed" }; },
        async persistService(service) { persisted.push(service); },
        async persistEvent() {},
        async send() { return { status: "confirmed", accepted_at: "2026-10-01T12:00:00Z" }; },
        async rereadForReminder() { throw new Error("not expected"); },
      },
    });
    assert.equal(output.results.effects[0].operation, "request");
    persisted[0].customer_name = "Mutated adapter copy";
    assert.equal(output.services[0].customer_name, "Synthetic");
  } finally {
    globalThis.structuredClone = originalStructuredClone;
  }
});

test("service validation and execution work when sandbox does not expose URL", async () => {
  const originalUrl = globalThis.URL;
  try {
    globalThis.URL = undefined;
    assert.deepEqual(validateService(baseService()), []);
    const out = await run();
    assert.equal(out.results.validation.length, 0);
    assert.equal(out.results.effects[0].operation, "request");
  } finally {
    globalThis.URL = originalUrl;
  }
});
