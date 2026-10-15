import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = resolve(root, "src/rf01-core.js");
const outputPath = resolve(root, "workflows/rf01-synthetic-test.json");
const coreSource = await readFile(corePath, "utf8");
const coreHash = createHash("sha256").update(coreSource).digest("hex");
const embeddedCore = coreSource.replace(/\bexport\s+/g, "").trim();

const scenarioHarness = String.raw`

const syntheticConfig = {
  criticalConfigPresent: true,
  contactAuthorized: true,
  requestDelayHours: 2,
  reminderDelayHours: 12,
  confirmationWindowDays: 7,
};

const baseService = (overrides = {}) => ({
  service_id: "synthetic-service-1",
  customer_name: "Synthetic",
  phone_e164: "+56911111111",
  appointment_at: "2026-10-01T10:00:00Z",
  review_link: "https://example.test/review",
  status: "pending",
  request_sent: false,
  request_sent_at: null,
  review_confirmed: false,
  review_confirmed_at: null,
  reminder_sent: false,
  reminder_sent_at: null,
  thanks_sent: false,
  thanks_sent_at: null,
  completed_at: null,
  completion_reason: null,
  operation_phase: "idle",
  error_code: null,
  updated_at: "2026-10-01T10:00:00Z",
  ...overrides,
});

const sentService = (overrides = {}) => baseService({
  status: "request_sent",
  request_sent: true,
  request_sent_at: "2026-10-01T12:00:00Z",
  ...overrides,
});

const listo = (overrides = {}) => ({
  provider_event_id: "synthetic-event-1",
  phone_e164: "+56911111111",
  received_at: "2026-10-01T13:00:00Z",
  event_type: "LISTO",
  processing_status: "pending",
  ...overrides,
});

const scenarios = [
  {
    name: "eligible_request",
    now: "2026-10-01T12:00:00Z",
    services: [baseService()],
    events: [],
    expected: { effect: "request", blocked: false },
  },
  {
    name: "listo_with_thanks",
    now: "2026-10-01T13:00:00Z",
    services: [sentService()],
    events: [listo()],
    expected: { effect: "thanks", confirmed: true },
  },
  {
    name: "eligible_reminder",
    now: "2026-10-02T00:00:00Z",
    services: [sentService()],
    events: [],
    expected: { effect: "reminder", blocked: false },
  },
  {
    name: "ambiguous_listo_blocks_reminder",
    now: "2026-10-02T00:00:00Z",
    services: [sentService(), sentService({ service_id: "synthetic-service-2" })],
    events: [listo()],
    expected: { effect: null, blockedReason: "UNRESOLVED_CONFIRMATION_EVENT" },
  },
];

function matchesExpected(output, expected) {
  const operations = output.results.effects.map(item => item.operation);
  const blockedReasons = output.results.blocked.map(item => item.reason);
  if (expected.effect === null && operations.length !== 0) return false;
  if (expected.effect && !operations.includes(expected.effect)) return false;
  if (expected.blocked === false && blockedReasons.length !== 0) return false;
  if (expected.blockedReason && !blockedReasons.includes(expected.blockedReason)) return false;
  if (expected.confirmed && !output.services.some(service => service.review_confirmed)) return false;
  return true;
}

const items = [];
for (const scenario of scenarios) {
  const persistedServices = [];
  const persistedEvents = [];
  const sends = [];
  const sourceById = new Map(scenario.services.map(service => [service.service_id, service]));
  const adapters = {
    async now() { return scenario.now; },
    async isAllowedToSend() { return { status: "allowed" }; },
    async persistService(service) { persistedServices.push(clone(service)); },
    async persistEvent(event) { persistedEvents.push(clone(event)); },
    async send(operation) {
      sends.push({ kind: operation.kind, operationRef: operation.operationRef });
      return { status: "confirmed", accepted_at: scenario.now };
    },
    async rereadForReminder({ service_id }) {
      return { status: "confirmed", service: clone(sourceById.get(service_id)), events: [] };
    },
  };
  const output = await runRf01Cycle({
    now: scenario.now,
    config: syntheticConfig,
    services: scenario.services,
    inboxEvents: scenario.events,
    adapters,
  });
  const observed = {
    effects: output.results.effects.map(item => item.operation),
    eventResults: output.results.events.map(item => item.result),
    blockedReasons: [...new Set(output.results.blocked.map(item => item.reason))],
    confirmedServices: output.services.filter(service => service.review_confirmed).map(service => service.service_id),
    sends: sends.map(item => item.kind),
    serviceWrites: persistedServices.length,
    eventWrites: persistedEvents.length,
    rejectedRecords: output.results.validation.map(item => ({
      service_id: item.service_id,
      errors: item.errors,
    })),
  };
  items.push({
    json: {
      scenario: scenario.name,
      expected: scenario.expected,
      observed,
      result: matchesExpected(output, scenario.expected) ? "PASS" : "FAIL",
    },
  });
}

return items;
`;

const jsCode = `// GENERATED from src/rf01-core.js\n// source_sha256: ${coreHash}\n// Regenerate with: node scripts/generate-rf01-synthetic-workflow.mjs\n\n${embeddedCore}${scenarioHarness}`;

const workflow = {
  name: "ReviewFlow — RF-01 — Pruebas sintéticas",
  nodes: [
    {
      parameters: {},
      id: "0f6cd4ee-5e99-4ae8-831f-d643b842fe02",
      name: "Manual Trigger",
      type: "n8n-nodes-base.manualTrigger",
      typeVersion: 1,
      position: [0, 0],
    },
    {
      parameters: { jsCode },
      id: "b8bba600-750f-49ca-b76f-99691a301d08",
      name: "Run synthetic RF-01 scenarios",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [260, 0],
    },
  ],
  connections: {
    "Manual Trigger": {
      main: [[{ node: "Run synthetic RF-01 scenarios", type: "main", index: 0 }]],
    },
  },
  pinData: {},
  active: false,
  settings: { executionOrder: "v1" },
  tags: [],
};

const serialized = `${JSON.stringify(workflow, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== serialized) throw new Error("Generated workflow is out of sync with src/rf01-core.js");
  const parsed = JSON.parse(existing);
  if (parsed.active !== false) throw new Error("Workflow must remain inactive");
  if (parsed.name !== "ReviewFlow — RF-01 — Pruebas sintéticas") throw new Error("Unexpected workflow name");
  if (parsed.nodes.length !== 2 || parsed.nodes[0].type !== "n8n-nodes-base.manualTrigger" || parsed.nodes[1].type !== "n8n-nodes-base.code") {
    throw new Error("Unexpected workflow structure");
  }
  const items = await runInNewContext(`(async () => {${parsed.nodes[1].parameters.jsCode}})()`, {});
  if (!Array.isArray(items) || items.length !== 4 || items.some(item => item?.json?.result !== "PASS")) {
    throw new Error("Synthetic scenarios did not return four PASS results");
  }
  console.log("workflow JSON: valid");
  console.log("generated source: in sync");
  console.log("structure: manual trigger -> code, inactive");
  console.log("synthetic scenarios: 4/4 PASS");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`generated ${outputPath}`);
  console.log(`source_sha256 ${coreHash}`);
}
