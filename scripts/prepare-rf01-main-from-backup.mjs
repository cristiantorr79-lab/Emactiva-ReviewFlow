import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const expectedName = "ReviewFlow — RF-01 — Principal";
const expectedId = "1T1SDDgZNUdWQhvD";
const outputPath = resolve("workflows/ReviewFlow_RF01_Principal_actual.json");
const backupArgument = process.argv[2];
if (!backupArgument) throw new Error("BACKUP_PATH_REQUIRED");
const localUrlIndex = process.argv.indexOf("--local-simulated-url");
const localSimulatedUrl = localUrlIndex >= 0 ? process.argv[localUrlIndex + 1] : null;
const ca09Index = process.argv.indexOf("--ca09-test-service-id");
const ca09ServiceId = ca09Index >= 0 ? process.argv[ca09Index + 1] : null;
if (localUrlIndex >= 0) {
  let parsed;
  try { parsed = new URL(localSimulatedUrl); } catch { throw new Error("INVALID_LOCAL_SIMULATED_URL"); }
  if (parsed.protocol !== "http:" || parsed.hostname !== "host.docker.internal") throw new Error("LOCAL_SIMULATED_URL_NOT_AUTHORIZED");
}
if (ca09Index >= 0 && !/^synthetic-ca09-[A-Za-z0-9._:-]+$/.test(ca09ServiceId || "")) throw new Error("INVALID_CA09_TEST_SERVICE_ID");

const backup = JSON.parse(await readFile(resolve(backupArgument), "utf8"));
const existingOutput = await readFile(outputPath, "utf8");
const generated = JSON.parse(existingOutput);
const checkOnly = process.argv.includes("--check");
if (backup.name !== expectedName || backup.id !== expectedId || !Array.isArray(backup.nodes)) throw new Error("BACKUP_IDENTITY_MISMATCH");
if (backup.active !== false) throw new Error("BACKUP_MUST_BE_INACTIVE");
if (generated.name !== expectedName || generated.active !== false) throw new Error("GENERATED_WORKFLOW_IDENTITY_MISMATCH");

const backupByName = new Map(backup.nodes.map(node => [node.name, node]));
const copied = { googleSheets: [], compatibleMappings: [], compatibleConnections: [], coordinatorCredential: [] };
for (const node of generated.nodes) {
  if (node.type === "n8n-nodes-base.googleSheets") {
    const source = backupByName.get(node.name);
    if (!source || source.type !== node.type) throw new Error(`MISSING_COMPATIBLE_SHEETS_NODE:${node.name}`);
    assertCredentialReference(source.credentials, node.name);
    assertResourceLocator(source.parameters?.documentId, `${node.name}.documentId`);
    assertResourceLocator(source.parameters?.sheetName, `${node.name}.sheetName`);
    node.credentials = structuredClone(source.credentials);
    node.parameters.documentId = structuredClone(source.parameters.documentId);
    node.parameters.sheetName = structuredClone(source.parameters.sheetName);
    if (node.parameters.operation === "update" && same(source.parameters?.columns, node.parameters.columns)) {
      node.parameters.columns = structuredClone(source.parameters.columns);
      copied.compatibleMappings.push(node.name);
    }
    copied.googleSheets.push(node.name);
  }
}

const coordinatorSource = backupByName.get("RF-01 Coordinator HTTP");
assertCredentialReference(coordinatorSource?.credentials, "RF-01 Coordinator HTTP");
for (const name of ["Resolve authoritative service state", "RF-01 Coordinator HTTP"]) {
  const node = generated.nodes.find(candidate => candidate.name === name);
  if (!node || node.type !== "n8n-nodes-base.httpRequest") throw new Error(`MISSING_COORDINATOR_NODE:${name}`);
  node.credentials = structuredClone(coordinatorSource.credentials);
  copied.coordinatorCredential.push(name);
}

const schedule = generated.nodes.find(node => node.type === "n8n-nodes-base.scheduleTrigger");
if (!schedule || schedule.disabled !== true) throw new Error("SCHEDULE_NOT_DISABLED");
const plannerNode = generated.nodes.find(node => node.name === "Plan one safe RF-01 command");
let planner = plannerNode?.parameters?.jsCode;
const configMatch = planner?.match(/const localConfig=(\{.*?\});\s*const ran=/s);
if (!configMatch) throw new Error("LOCAL_CONFIG_NOT_FOUND");
const config = JSON.parse(configMatch[1]);
if (localSimulatedUrl) {
  config.coordinator = { ...config.coordinator, baseUrl: localSimulatedUrl.replace(/\/$/, ""), testMode: true, providerMode: "simulated" };
}
if (ca09ServiceId) {
  if (!localSimulatedUrl) throw new Error("CA09_TEST_REQUIRES_LOCAL_SIMULATED_URL");
  config.ca09Test = { enabled: true, serviceId: ca09ServiceId, operationKind: "request" };
}
if (localSimulatedUrl || ca09ServiceId) {
  plannerNode.parameters.jsCode = planner.replace(configMatch[1], JSON.stringify(config));
  planner = plannerNode.parameters.jsCode;
}
for (const gate of ["criticalConfigPresent", "exclusiveExecutionVerified", "sheetsWriteEnabled", "sendEnabled"]) {
  if (config[gate] !== false) throw new Error(`OPERATIVE_GATE_ENABLED:${gate}`);
}

generated.id = expectedId;
generated.active = false;
const nodeNames = new Set(generated.nodes.map(node => node.name));
for (const [source, outputs] of Object.entries(generated.connections || {})) {
  if (!nodeNames.has(source)) throw new Error(`UNKNOWN_CONNECTION_SOURCE:${source}`);
  for (const groups of Object.values(outputs)) for (const group of groups) for (const edge of group) if (!nodeNames.has(edge.node)) throw new Error(`UNKNOWN_CONNECTION_TARGET:${edge.node}`);
  if (same(backup.connections?.[source], outputs)) copied.compatibleConnections.push(source);
}
for (const forbidden of ["Persist outgoing checkpoint", "Reread outgoing checkpoint", "Verify checkpoint persisted", "Classify WhatsApp result"]) {
  if (nodeNames.has(forbidden)) throw new Error(`OBSOLETE_FUNCTIONAL_NODE:${forbidden}`);
}
for (const required of ["Resolve authoritative service state", "Prepare coordinator command", "RF-01 Coordinator HTTP", "Filter confirmation projection", "Filter outgoing projection"]) {
  if (!nodeNames.has(required)) throw new Error(`MISSING_RF001_T02_NODE:${required}`);
}
if (config.ca09Test?.enabled === true) {
  if (!/^synthetic-ca09-[A-Za-z0-9._:-]+$/.test(config.ca09Test.serviceId) || config.ca09Test.operationKind !== "request") throw new Error("UNSAFE_CA09_TEST_CONFIG");
  if (generated.connections?.["CA09 synthetic result"]) throw new Error("CA09_TEST_RESULT_HAS_SIDE_EFFECT_CONNECTION");
  if (config.coordinator?.testMode !== true || config.coordinator?.providerMode !== "simulated") throw new Error("CA09_TEST_PROVIDER_NOT_SIMULATED");
}
const updates = generated.nodes.filter(node => node.type === "n8n-nodes-base.googleSheets" && node.parameters?.operation === "update");
if (updates.length !== 3) throw new Error("INVALID_PROJECTION_WRITE_COUNT");
if (generated.nodes.some(node => JSON.stringify(node).includes("graph.facebook.com") || JSON.stringify(node.parameters?.headerParameters || {}).toLowerCase().includes("authorization"))) throw new Error("EMBEDDED_PROVIDER_OR_AUTHORIZATION");

const serialized = `${JSON.stringify(generated, null, 2)}\n`;
if (checkOnly && existingOutput !== serialized) throw new Error("PREPARED_WORKFLOW_OUT_OF_SYNC");
if (!checkOnly) await writeFile(outputPath, serialized, "utf8");
console.log(`${checkOnly ? "validated" : "prepared"} ${outputPath}`);
console.log(`sheets references preserved: ${copied.googleSheets.length}`);
console.log(`compatible mappings preserved: ${copied.compatibleMappings.length}`);
console.log(`compatible connection sources preserved: ${copied.compatibleConnections.length}`);
console.log(`coordinator credential reference preserved: ${copied.coordinatorCredential.length}`);
console.log(`coordinator.baseUrl configured: ${Boolean(config.coordinator?.baseUrl)}`);
console.log(`local simulated mode: ${config.coordinator?.testMode === true && config.coordinator?.providerMode === "simulated"}`);
console.log(`CA09 synthetic route: ${config.ca09Test?.enabled === true ? config.ca09Test.serviceId : "disabled"}`);

function assertCredentialReference(credentials, label) {
  if (!credentials || typeof credentials !== "object" || !Object.keys(credentials).length) throw new Error(`MISSING_CREDENTIAL_REFERENCE:${label}`);
  for (const reference of Object.values(credentials)) {
    if (!reference || typeof reference.id !== "string" || typeof reference.name !== "string" || Object.keys(reference).some(key => !["id", "name"].includes(key))) {
      throw new Error(`INVALID_CREDENTIAL_REFERENCE:${label}`);
    }
  }
}
function assertResourceLocator(locator, label) {
  if (!locator || typeof locator !== "object" || !locator.value || !["list", "id", "url"].includes(locator.mode)) throw new Error(`MISSING_RESOURCE_LOCATOR:${label}`);
}
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
