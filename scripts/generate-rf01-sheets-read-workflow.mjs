import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = resolve(root, "src/rf01-core.js");
const outputPath = resolve(root, "workflows/rf01-sheets-read-test.json");
const coreSource = await readFile(corePath, "utf8");
const coreHash = createHash("sha256").update(coreSource).digest("hex");
const embeddedCore = coreSource.replace(/\bexport\s+/g, "").trim();

const collectCode = source => `const rows = $input.all().map(item => item.json).filter(row => row && Object.keys(row).length > 0);\nreturn [{ json: { source: "${source}", rows } }];`;

const validationHarness = String.raw`

const serviceBooleanFields = ["request_sent", "review_confirmed", "reminder_sent", "thanks_sent"];
const serviceDateFields = ["appointment_at", "request_sent_at", "review_confirmed_at", "reminder_sent_at", "thanks_sent_at", "completed_at", "updated_at"];
const serviceOptionalFields = ["request_sent_at", "review_confirmed_at", "reminder_sent_at", "thanks_sent_at", "completed_at", "completion_reason", "error_code"];

function normalizeBoolean(value, field, errors) {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  errors.push("AMBIGUOUS_BOOLEAN_" + field.toUpperCase());
  return value;
}

function normalizeDate(value, field, optional, errors) {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    errors.push("MISSING_" + field.toUpperCase());
    return value;
  }
  if (typeof value !== "string") {
    errors.push("AMBIGUOUS_DATE_" + field.toUpperCase());
    return value;
  }
  const parsed = parseDate(value.trim());
  if (!parsed) {
    errors.push("INVALID_" + field.toUpperCase());
    return value;
  }
  return parsed.toISOString();
}

function normalizeText(value, field, optional, errors) {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    errors.push("MISSING_" + field.toUpperCase());
    return value;
  }
  if (typeof value !== "string") {
    errors.push("AMBIGUOUS_TEXT_" + field.toUpperCase());
    return value;
  }
  return value.trim();
}

function normalizeService(row) {
  const errors = [];
  const normalized = { ...row };
  for (const field of ["service_id", "customer_name", "phone_e164", "review_link", "status", "operation_phase"]) {
    normalized[field] = normalizeText(row[field], field, false, errors);
  }
  for (const field of ["completion_reason", "error_code"]) {
    normalized[field] = normalizeText(row[field], field, true, errors);
  }
  for (const field of serviceBooleanFields) normalized[field] = normalizeBoolean(row[field], field, errors);
  for (const field of serviceDateFields) normalized[field] = normalizeDate(row[field], field, serviceOptionalFields.includes(field), errors);
  errors.push(...validateService(normalized));
  return { normalized, errors: [...new Set(errors)] };
}

function normalizeEvent(row) {
  const errors = [];
  const normalized = { ...row };
  for (const field of ["provider_event_id", "phone_e164", "event_type", "processing_status"]) {
    normalized[field] = normalizeText(row[field], field, false, errors);
  }
  normalized.received_at = normalizeDate(row.received_at, "received_at", false, errors);
  errors.push(...validateEvent(normalized));
  return { normalized, errors: [...new Set(errors)] };
}

const inputs = $input.all().map(item => item.json);
const servicesEnvelope = inputs.find(item => item.source === "services");
const eventsEnvelope = inputs.find(item => item.source === "inbox_events");
if (!servicesEnvelope || !eventsEnvelope) throw new Error("INCOMPLETE_SHEETS_READ");
const serviceRows = Array.isArray(servicesEnvelope.rows) ? servicesEnvelope.rows : [];
const eventRows = Array.isArray(eventsEnvelope.rows) ? eventsEnvelope.rows : [];
const checkedServices = serviceRows.map(normalizeService);
const checkedEvents = eventRows.map(normalizeEvent);
const acceptedServices = checkedServices.filter(item => item.errors.length === 0).map(item => item.normalized.service_id);
const rejectedServices = checkedServices.filter(item => item.errors.length > 0).map(item => ({ service_id: item.normalized.service_id ?? null, errors: item.errors }));
const acceptedEvents = checkedEvents.filter(item => item.errors.length === 0).map(item => item.normalized.provider_event_id);
const rejectedEvents = checkedEvents.filter(item => item.errors.length > 0).map(item => ({ provider_event_id: item.normalized.provider_event_id ?? null, errors: item.errors }));

return [{ json: {
  counts: {
    servicesRead: serviceRows.length,
    servicesAccepted: acceptedServices.length,
    servicesRejected: rejectedServices.length,
    eventsRead: eventRows.length,
    eventsAccepted: acceptedEvents.length,
    eventsRejected: rejectedEvents.length,
  },
  accepted: { services: acceptedServices, events: acceptedEvents },
  rejected: { services: rejectedServices, events: rejectedEvents },
  note: "Un evento válido como registro no implica una atención confirmada.",
} }];
`;

const jsCode = `// GENERATED from src/rf01-core.js\n// source_sha256: ${coreHash}\n// Regenerate with: node scripts/generate-rf01-sheets-read-workflow.mjs\n\n${embeddedCore}${validationHarness}`;
const documentLocator = { __rl: true, value: "", mode: "list", cachedResultName: "Select in n8n: Emactiva ReviewFlow — LAB-RF-001 — Pruebas" };
const sheetLocator = name => ({ __rl: true, value: name, mode: "name", cachedResultName: name });
const workflow = {
  name: "ReviewFlow — RF-01 — Lectura Google Sheets LAB",
  nodes: [
    { parameters: {}, id: "3388a7da-0039-43ae-aeb5-a07ea194c688", name: "Manual Trigger", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 120] },
    {
      parameters: { operation: "read", documentId: documentLocator, sheetName: sheetLocator("services"), options: {} },
      id: "812d7f38-ce73-47ff-b8de-89edbc0b0064", name: "Read services", type: "n8n-nodes-base.googleSheets", typeVersion: 4.7,
      position: [220, 20], alwaysOutputData: true,
    },
    {
      parameters: { operation: "read", documentId: documentLocator, sheetName: sheetLocator("inbox_events"), options: {} },
      id: "611cbf91-a9c4-47b7-a0f8-81c1014cf448", name: "Read inbox_events", type: "n8n-nodes-base.googleSheets", typeVersion: 4.7,
      position: [220, 220], alwaysOutputData: true,
    },
    { parameters: { jsCode: collectCode("services") }, id: "0d20c9de-16b9-487f-a840-b7f5f35d0944", name: "Collect services", type: "n8n-nodes-base.code", typeVersion: 2, position: [460, 20] },
    { parameters: { jsCode: collectCode("inbox_events") }, id: "c85e2650-7c70-4412-bf49-fc20e7827c79", name: "Collect inbox_events", type: "n8n-nodes-base.code", typeVersion: 2, position: [460, 220] },
    { parameters: { mode: "append", options: {} }, id: "94b87ca3-cd2b-4d62-b26d-cc3f5ba1dd45", name: "Wait for both reads", type: "n8n-nodes-base.merge", typeVersion: 3, position: [700, 120] },
    { parameters: { jsCode }, id: "071b0419-9048-40db-baec-f6a04427a6dc", name: "Normalize and validate", type: "n8n-nodes-base.code", typeVersion: 2, position: [940, 120] },
  ],
  connections: {
    "Manual Trigger": { main: [[{ node: "Read services", type: "main", index: 0 }, { node: "Read inbox_events", type: "main", index: 0 }]] },
    "Read services": { main: [[{ node: "Collect services", type: "main", index: 0 }]] },
    "Read inbox_events": { main: [[{ node: "Collect inbox_events", type: "main", index: 0 }]] },
    "Collect services": { main: [[{ node: "Wait for both reads", type: "main", index: 0 }]] },
    "Collect inbox_events": { main: [[{ node: "Wait for both reads", type: "main", index: 1 }]] },
    "Wait for both reads": { main: [[{ node: "Normalize and validate", type: "main", index: 0 }]] },
  },
  pinData: {},
  active: false,
  settings: { executionOrder: "v1" },
  tags: [],
};

const serialized = `${JSON.stringify(workflow, null, 2)}\n`;
async function executeValidation(items) {
  const wrapper = `const __items = ${JSON.stringify(items)}; const $input = { all: () => __items }; (async () => {${jsCode}})()`;
  return runInNewContext(wrapper, {});
}

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== serialized) throw new Error("Generated workflow is out of sync with src/rf01-core.js");
  const parsed = JSON.parse(existing);
  if (parsed.active !== false || parsed.nodes.length !== 7) throw new Error("Unexpected workflow structure or activation");
  if (parsed.nodes.filter(node => node.type === "n8n-nodes-base.googleSheets").length !== 2) throw new Error("Expected exactly two Google Sheets nodes");
  if (parsed.nodes.some(node => node.credentials || node.parameters?.documentId?.value)) throw new Error("Credentials or document ID must be selected visually");
  const services = [
    { service_id: "synthetic-service-1", customer_name: "Cliente Prueba 1", phone_e164: "+12025550101", appointment_at: "2026-10-11T12:00:00Z", review_link: "https://search.google.com/local/writereview?placeid=SYNTHETIC_TEST", status: "pending", request_sent: "false", request_sent_at: "", review_confirmed: "false", review_confirmed_at: "", reminder_sent: "false", reminder_sent_at: "", thanks_sent: "false", thanks_sent_at: "", completed_at: "", completion_reason: "", operation_phase: "idle", error_code: "", updated_at: "2026-10-11T12:00:00Z" },
    { service_id: "synthetic-service-2", customer_name: "Cliente Prueba 2", phone_e164: "telefono_invalido", appointment_at: "2026-10-11T12:00:00Z", review_link: "https://search.google.com/local/writereview?placeid=SYNTHETIC_TEST", status: "pending", request_sent: false, request_sent_at: "", review_confirmed: false, review_confirmed_at: "", reminder_sent: false, reminder_sent_at: "", thanks_sent: false, thanks_sent_at: "", completed_at: "", completion_reason: "", operation_phase: "idle", error_code: "", updated_at: "2026-10-11T12:00:00Z" },
  ];
  const events = [{ provider_event_id: "synthetic-event-1", phone_e164: "+12025550101", received_at: "2026-10-11T18:00:00Z", event_type: "LISTO", processing_status: "pending" }];
  const populated = await executeValidation([{ json: { source: "services", rows: services } }, { json: { source: "inbox_events", rows: events } }]);
  const result = populated[0].json;
  if (result.counts.servicesAccepted !== 1 || result.counts.servicesRejected !== 1 || result.counts.eventsAccepted !== 1) throw new Error("Unexpected populated-sheet validation result");
  if (!result.rejected.services[0].errors.includes("INVALID_PHONE")) throw new Error("Expected invalid phone rejection");
  const empty = await executeValidation([{ json: { source: "services", rows: services } }, { json: { source: "inbox_events", rows: [] } }]);
  if (empty[0].json.counts.eventsRead !== 0 || empty[0].json.counts.eventsRejected !== 0) throw new Error("Empty inbox must be accepted");
  const ambiguous = await executeValidation([{ json: { source: "services", rows: [{ ...services[0], request_sent: "yes" }] } }, { json: { source: "inbox_events", rows: [] } }]);
  if (!ambiguous[0].json.rejected.services[0].errors.includes("AMBIGUOUS_BOOLEAN_REQUEST_SENT")) throw new Error("Ambiguous boolean must be rejected");
  console.log("workflow JSON: valid, inactive, no credentials or document ID");
  console.log("connections: two reads -> two collectors -> merge -> validation");
  console.log("VM without URL/structuredClone: populated fixtures PASS");
  console.log("normalization: ambiguous boolean rejected; empty inbox accepted");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`generated ${outputPath}`);
  console.log(`source_sha256 ${coreHash}`);
}
