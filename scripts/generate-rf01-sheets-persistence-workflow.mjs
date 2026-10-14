import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = resolve(root, "src/rf01-core.js");
const outputPath = resolve(root, "workflows/rf01-sheets-persistence-test.json");
const coreSource = await readFile(corePath, "utf8");
const coreHash = createHash("sha256").update(coreSource).digest("hex");
const embeddedCore = coreSource.replace(/\bexport\s+/g, "").trim();

const SERVICE_ID = "synthetic-persistence-service-1";
const EVENT_ID = "synthetic-persistence-event-1";
const INITIAL_UPDATED_AT = "2026-10-11T12:00:00.000Z";
const TEST_UPDATED_AT = "2026-10-11T12:01:00.000Z";
const collectCode = source => `const rows = $input.all().map(item => item.json).filter(row => row && Object.keys(row).length > 0);\nreturn [{ json: { source: "${source}", rows } }];`;

const preflightHarness = String.raw`

const SERVICE_ID = "synthetic-persistence-service-1";
const EVENT_ID = "synthetic-persistence-event-1";
const INITIAL_UPDATED_AT = "2026-10-11T12:00:00.000Z";
const TEST_UPDATED_AT = "2026-10-11T12:01:00.000Z";
const inputs = $input.all().map(item => item.json);
const servicesEnvelope = inputs.find(item => item.source === "services");
const eventsEnvelope = inputs.find(item => item.source === "inbox_events");
if (!servicesEnvelope || !eventsEnvelope) throw new Error("PERSISTENCE_PREFLIGHT_READ_INCOMPLETE");
const services = Array.isArray(servicesEnvelope.rows) ? servicesEnvelope.rows : [];
const events = Array.isArray(eventsEnvelope.rows) ? eventsEnvelope.rows : [];
const serviceMatches = services.filter(row => row.service_id === SERVICE_ID);
const eventMatches = events.filter(row => row.provider_event_id === EVENT_ID);
if (serviceMatches.length !== 1) throw new Error("PERSISTENCE_SERVICE_ID_NOT_UNIQUE");
if (eventMatches.length !== 1) throw new Error("PERSISTENCE_EVENT_ID_NOT_UNIQUE");

function strictBoolean(value, field) {
  if (value === true || value === false) return value;
  if (typeof value === "string" && value.trim().toLowerCase() === "true") return true;
  if (typeof value === "string" && value.trim().toLowerCase() === "false") return false;
  throw new Error("PERSISTENCE_AMBIGUOUS_BOOLEAN_" + field.toUpperCase());
}
function optional(value) { return value === "" || value === undefined ? null : value; }
const rawService = serviceMatches[0];
const service = {
  ...rawService,
  request_sent: strictBoolean(rawService.request_sent, "request_sent"),
  review_confirmed: strictBoolean(rawService.review_confirmed, "review_confirmed"),
  reminder_sent: strictBoolean(rawService.reminder_sent, "reminder_sent"),
  thanks_sent: strictBoolean(rawService.thanks_sent, "thanks_sent"),
  request_sent_at: optional(rawService.request_sent_at),
  review_confirmed_at: optional(rawService.review_confirmed_at),
  reminder_sent_at: optional(rawService.reminder_sent_at),
  thanks_sent_at: optional(rawService.thanks_sent_at),
  completed_at: optional(rawService.completed_at),
  completion_reason: optional(rawService.completion_reason),
  error_code: optional(rawService.error_code),
};
const serviceErrors = validateService(service);
if (serviceErrors.length) throw new Error("PERSISTENCE_SERVICE_INVALID:" + serviceErrors.join(","));
if (service.customer_name !== "Cliente Persistencia" || service.phone_e164 !== "+12025550103" ||
    service.appointment_at !== "2026-10-11T12:00:00Z" ||
    service.review_link !== "https://search.google.com/local/writereview?placeid=SYNTHETIC_PERSISTENCE_TEST" ||
    service.status !== "pending" || service.operation_phase !== "idle" ||
    service.request_sent || service.review_confirmed || service.reminder_sent || service.thanks_sent ||
    service.request_sent_at !== null || service.review_confirmed_at !== null ||
    service.reminder_sent_at !== null || service.thanks_sent_at !== null ||
    service.completed_at !== null || service.completion_reason !== null || service.error_code !== null ||
    !parseDate(service.updated_at) || parseDate(service.updated_at).toISOString() !== INITIAL_UPDATED_AT) {
  throw new Error("PERSISTENCE_SERVICE_INITIAL_STATE_MISMATCH");
}

const rawEvent = eventMatches[0];
const event = { ...rawEvent, service_id: optional(rawEvent.service_id) };
const eventErrors = validateEvent(event);
if (eventErrors.length) throw new Error("PERSISTENCE_EVENT_INVALID:" + eventErrors.join(","));
if (event.phone_e164 !== "+12025550104" || event.received_at !== "2026-10-11T18:00:00Z" ||
    event.event_type !== "LISTO" || event.processing_status !== "pending" || event.service_id !== null) {
  throw new Error("PERSISTENCE_EVENT_INITIAL_STATE_MISMATCH");
}
return [{ json: { service_id: SERVICE_ID, updated_at: TEST_UPDATED_AT, phase: "write_service_test" } }];
`;

const preflightCode = `// GENERATED from src/rf01-core.js\n// source_sha256: ${coreHash}\n\n${embeddedCore}${preflightHarness}`;
const verifyUniqueCode = ({ idField, id, field, expected, next }) => String.raw`
const ID = ${JSON.stringify(id)};
const rows = $input.all().map(item => item.json).filter(row => row && Object.keys(row).length > 0);
const matches = rows.filter(row => row[${JSON.stringify(idField)}] === ID);
if (matches.length !== 1) throw new Error("PERSISTENCE_REREAD_ID_NOT_UNIQUE");
const actual = matches[0][${JSON.stringify(field)}];
const normalized = ${field === "updated_at" ? "parseDate(actual)?.toISOString()" : "actual"};
if (normalized !== ${JSON.stringify(expected)}) throw new Error("PERSISTENCE_REREAD_VALUE_MISMATCH");
return [{ json: ${JSON.stringify(next)} }];
`;

const verifyServiceTestCode = `${embeddedCore}\n${verifyUniqueCode({ idField: "service_id", id: SERVICE_ID, field: "updated_at", expected: TEST_UPDATED_AT, next: { provider_event_id: EVENT_ID, processing_status: "ambiguous", phase: "write_event_test" } })}`;
const verifyEventTestCode = verifyUniqueCode({ idField: "provider_event_id", id: EVENT_ID, field: "processing_status", expected: "ambiguous", next: { service_id: SERVICE_ID, updated_at: INITIAL_UPDATED_AT, phase: "restore_service" } });
const verifyServiceRestoreCode = `${embeddedCore}\n${verifyUniqueCode({ idField: "service_id", id: SERVICE_ID, field: "updated_at", expected: INITIAL_UPDATED_AT, next: { provider_event_id: EVENT_ID, processing_status: "pending", phase: "restore_event" } })}`;
const finalVerifyCode = String.raw`
const ID = "synthetic-persistence-event-1";
const rows = $input.all().map(item => item.json).filter(row => row && Object.keys(row).length > 0);
const matches = rows.filter(row => row.provider_event_id === ID);
if (matches.length !== 1) throw new Error("PERSISTENCE_FINAL_EVENT_ID_NOT_UNIQUE");
if (matches[0].processing_status !== "pending") throw new Error("PERSISTENCE_FINAL_EVENT_NOT_RESTORED");
return [{ json: {
  result: "PASS",
  checks: ["preflight_unique_ids", "service_write_reread", "event_write_reread", "service_restored", "event_restored"],
  records: { service_id: "synthetic-persistence-service-1", provider_event_id: "synthetic-persistence-event-1" },
  limitations: "No acredita transacciones, concurrencia ni entrega exactamente una vez.",
} }];
`;

const documentLocator = { __rl: true, value: "", mode: "list", cachedResultName: "Select in n8n: Emactiva ReviewFlow — LAB-RF-001 — Pruebas" };
const sheetLocator = name => ({ __rl: true, value: "", mode: "list", cachedResultName: `Select in n8n: ${name}` });
const readNode = (id, name, sheet, position) => ({
  parameters: { operation: "read", documentId: documentLocator, sheetName: sheetLocator(sheet), options: {} },
  id, name, type: "n8n-nodes-base.googleSheets", typeVersion: 4.7, position, alwaysOutputData: true,
});
const SERVICE_COLUMNS = ["service_id", "customer_name", "phone_e164", "appointment_at", "review_link", "status", "request_sent", "request_sent_at", "review_confirmed", "review_confirmed_at", "reminder_sent", "reminder_sent_at", "thanks_sent", "thanks_sent_at", "completed_at", "completion_reason", "operation_phase", "error_code", "updated_at"];
const EVENT_COLUMNS = ["provider_event_id", "phone_e164", "received_at", "event_type", "processing_status", "service_id"];
const schema = (fields, idField) => fields.map(field => ({ id: field, displayName: field, required: false, defaultMatch: field === idField, display: true, type: "string", canBeUsedToMatch: true, removed: false }));
const updateNode = (id, name, sheet, idField, targetField, allFields, position) => ({
  parameters: {
    operation: "update", documentId: documentLocator, sheetName: sheetLocator(sheet),
    columns: {
      mappingMode: "defineBelow",
      value: { [idField]: `={{ $json.${idField} }}`, [targetField]: `={{ $json.${targetField} }}` },
      matchingColumns: [idField],
      schema: schema(allFields, idField),
      attemptToConvertTypes: false,
      convertFieldsToString: false,
    },
    options: {},
  },
  id, name, type: "n8n-nodes-base.googleSheets", typeVersion: 4.7, position,
});

const nodes = [
  { parameters: {}, id: "153d1456-27ab-4c92-8979-ef1169e12d87", name: "Manual Trigger", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 140] },
  readNode("691f21c8-41a3-4382-a59e-f80ea902c04e", "Preflight read services", "services", [220, 40]),
  readNode("01a95020-1a3a-4e0e-9759-fd79fb18451c", "Preflight read inbox_events", "inbox_events", [220, 240]),
  { parameters: { jsCode: collectCode("services") }, id: "238164bf-6b8d-46d6-a995-e37824440f13", name: "Collect preflight services", type: "n8n-nodes-base.code", typeVersion: 2, position: [460, 40] },
  { parameters: { jsCode: collectCode("inbox_events") }, id: "3f78bd7a-29a2-4709-bc56-b8652db543a3", name: "Collect preflight events", type: "n8n-nodes-base.code", typeVersion: 2, position: [460, 240] },
  { parameters: { mode: "append", options: {} }, id: "91415f23-34b3-420f-ad57-3e5d67b70a80", name: "Wait for preflight reads", type: "n8n-nodes-base.merge", typeVersion: 3, position: [700, 140] },
  { parameters: { jsCode: preflightCode }, id: "ac1b7db3-74e8-4604-84bf-0ed8a81c066b", name: "Preflight exact records", type: "n8n-nodes-base.code", typeVersion: 2, position: [940, 140] },
  updateNode("61a2f5de-ff2f-4931-bac9-9ec4154387b7", "Write service test value", "services", "service_id", "updated_at", SERVICE_COLUMNS, [1180, 140]),
  readNode("831e936f-5e52-468b-a3ec-9f1479229c73", "Reread service test value", "services", [1420, 140]),
  { parameters: { jsCode: verifyServiceTestCode }, id: "2a23551f-1d72-4ae2-b461-1e50adba84c2", name: "Verify service test value", type: "n8n-nodes-base.code", typeVersion: 2, position: [1660, 140] },
  updateNode("9bf3c987-10ff-42da-8d4f-6bcebb9a5933", "Write event test value", "inbox_events", "provider_event_id", "processing_status", EVENT_COLUMNS, [1900, 140]),
  readNode("0140bbf3-77cb-47e4-b4ca-30ea88ef5844", "Reread event test value", "inbox_events", [2140, 140]),
  { parameters: { jsCode: verifyEventTestCode }, id: "f6bf153f-bf22-4db1-ae17-ef7f2ac0fbc7", name: "Verify event test value", type: "n8n-nodes-base.code", typeVersion: 2, position: [2380, 140] },
  updateNode("47a623da-8a30-4ac9-85f7-8ba0e88146df", "Restore service", "services", "service_id", "updated_at", SERVICE_COLUMNS, [2620, 140]),
  readNode("fbde31ef-ef33-439d-8f4b-f4e7d1bef193", "Reread restored service", "services", [2860, 140]),
  { parameters: { jsCode: verifyServiceRestoreCode }, id: "1a20ef06-d01d-43d1-b62f-56860758f6d7", name: "Verify service restored", type: "n8n-nodes-base.code", typeVersion: 2, position: [3100, 140] },
  updateNode("a1575c2b-3b96-481b-be8b-2a2a46abe7df", "Restore event", "inbox_events", "provider_event_id", "processing_status", EVENT_COLUMNS, [3340, 140]),
  readNode("0aa7995b-760e-49d9-b68e-1585b7a4fa7d", "Reread restored event", "inbox_events", [3580, 140]),
  { parameters: { jsCode: finalVerifyCode }, id: "58c15476-fbe2-4e94-b56c-d5f78503c494", name: "Final PASS or FAIL", type: "n8n-nodes-base.code", typeVersion: 2, position: [3820, 140] },
];

const chain = ["Wait for preflight reads", "Preflight exact records", "Write service test value", "Reread service test value", "Verify service test value", "Write event test value", "Reread event test value", "Verify event test value", "Restore service", "Reread restored service", "Verify service restored", "Restore event", "Reread restored event", "Final PASS or FAIL"];
const connections = {
  "Manual Trigger": { main: [[{ node: "Preflight read services", type: "main", index: 0 }, { node: "Preflight read inbox_events", type: "main", index: 0 }]] },
  "Preflight read services": { main: [[{ node: "Collect preflight services", type: "main", index: 0 }]] },
  "Preflight read inbox_events": { main: [[{ node: "Collect preflight events", type: "main", index: 0 }]] },
  "Collect preflight services": { main: [[{ node: "Wait for preflight reads", type: "main", index: 0 }]] },
  "Collect preflight events": { main: [[{ node: "Wait for preflight reads", type: "main", index: 1 }]] },
};
for (let index = 0; index < chain.length - 1; index += 1) connections[chain[index]] = { main: [[{ node: chain[index + 1], type: "main", index: 0 }]] };

const workflow = { name: "ReviewFlow — RF-01 — Persistencia Google Sheets LAB", nodes, connections, pinData: {}, active: false, settings: { executionOrder: "v1" }, tags: [] };
const serialized = `${JSON.stringify(workflow, null, 2)}\n`;

function vmRun(code, items) {
  const wrapper = `const __items = ${JSON.stringify(items)}; const $input = { all: () => __items }; (async () => {${code}})()`;
  return runInNewContext(wrapper, {});
}
const initialService = { service_id: SERVICE_ID, customer_name: "Cliente Persistencia", phone_e164: "+12025550103", appointment_at: "2026-10-11T12:00:00Z", review_link: "https://search.google.com/local/writereview?placeid=SYNTHETIC_PERSISTENCE_TEST", status: "pending", request_sent: "false", request_sent_at: "", review_confirmed: "false", review_confirmed_at: "", reminder_sent: "false", reminder_sent_at: "", thanks_sent: "false", thanks_sent_at: "", completed_at: "", completion_reason: "", operation_phase: "idle", error_code: "", updated_at: "2026-10-11T12:00:00Z" };
const initialEvent = { provider_event_id: EVENT_ID, phone_e164: "+12025550104", received_at: "2026-10-11T18:00:00Z", event_type: "LISTO", processing_status: "pending", service_id: "" };

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  if (existing !== serialized) throw new Error("Generated workflow is out of sync");
  const parsed = JSON.parse(existing);
  if (parsed.active !== false || parsed.nodes.length !== 19) throw new Error("Unexpected workflow structure");
  if (parsed.nodes.some(node => node.credentials || node.parameters?.documentId?.value)) throw new Error("Embedded credential or document ID");
  if (parsed.nodes.some(node => /whatsapp/i.test(node.type + node.name))) throw new Error("WhatsApp node is forbidden");
  const sheets = parsed.nodes.filter(node => node.type === "n8n-nodes-base.googleSheets");
  if (sheets.filter(node => node.parameters.operation === "update").length !== 4) throw new Error("Expected four controlled writes");
  if (sheets.some(node => node.parameters.sheetName.mode !== "list" || node.parameters.sheetName.value !== "")) throw new Error("Every sheet must be selected visually by GID");
  const updates = sheets.filter(node => node.parameters.operation === "update");
  for (const node of updates) {
    const isService = node.parameters.sheetName.cachedResultName.endsWith("services");
    const expectedId = isService ? "service_id" : "provider_event_id";
    const expectedTarget = isService ? "updated_at" : "processing_status";
    const columns = node.parameters.columns;
    if (columns.mappingMode !== "defineBelow" || JSON.stringify(columns.matchingColumns) !== JSON.stringify([expectedId])) throw new Error(`Invalid matching column in ${node.name}`);
    if (JSON.stringify(Object.keys(columns.value)) !== JSON.stringify([expectedId, expectedTarget])) throw new Error(`Unexpected values in ${node.name}`);
    if (columns.value[expectedId] !== `={{ $json.${expectedId} }}` || columns.value[expectedTarget] !== `={{ $json.${expectedTarget} }}`) throw new Error(`Invalid expression in ${node.name}`);
    if (!columns.schema.find(field => field.id === expectedId && field.defaultMatch === true) || !columns.schema.find(field => field.id === expectedTarget)) throw new Error(`Incomplete schema in ${node.name}`);
  }
  const preflight = await vmRun(preflightCode, [{ json: { source: "services", rows: [initialService] } }, { json: { source: "inbox_events", rows: [initialEvent] } }]);
  if (preflight[0].json.service_id !== SERVICE_ID || preflight[0].json.updated_at !== TEST_UPDATED_AT) throw new Error("Preflight output mismatch");
  let duplicateStopped = false;
  try { await vmRun(preflightCode, [{ json: { source: "services", rows: [initialService, initialService] } }, { json: { source: "inbox_events", rows: [initialEvent] } }]); } catch { duplicateStopped = true; }
  if (!duplicateStopped) throw new Error("Duplicate ID did not stop preflight");
  await vmRun(verifyServiceTestCode, [{ json: { ...initialService, updated_at: TEST_UPDATED_AT } }]);
  await vmRun(verifyEventTestCode, [{ json: { ...initialEvent, processing_status: "ambiguous" } }]);
  await vmRun(verifyServiceRestoreCode, [{ json: initialService }]);
  const final = await vmRun(finalVerifyCode, [{ json: initialEvent }]);
  if (final[0].json.result !== "PASS") throw new Error("Final result mismatch");
  console.log("workflow JSON/connections: valid and inactive");
  console.log("credentials/document ID: absent; writes: 4 controlled updates by contractual ID");
  console.log("update mappings: exact ID + target expressions; full sheet schemas; visual GID selection");
  console.log("VM checks: preflight, duplicate stop, write rereads and restoration PASS");
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, serialized, "utf8");
  console.log(`generated ${outputPath}`);
  console.log(`source_sha256 ${coreHash}`);
}
