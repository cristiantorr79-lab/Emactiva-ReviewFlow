import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Rf01N8nPostgresAdapter } from "./rf01-n8n-postgres-adapter.js";
import { Rf01PostgresServiceStateRepository } from "./rf01-postgres-service-state-repository.js";
import { rf01ServiceStateFromSheetRow, rf01ServiceStateToSheetRow } from "./rf01-service-state-sheet-mapper.js";

export const RF01_COORDINATOR_API_VERSION = "v1";
const MAX_BODY_BYTES = 16 * 1024;

export function createRf01CoordinatorHttpHandler({ connect, serviceToken, send, timeoutMs = 15_000, logger = () => {} }) {
  if (typeof connect !== "function" || typeof send !== "function" || !validSecret(serviceToken)) throw new TypeError("INVALID_SERVICE_CONFIG");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new TypeError("INVALID_TIMEOUT");
  const adapter = new Rf01N8nPostgresAdapter({ connect });

  return async request => {
    if (request.method === "GET" && request.path === "/health") return response(200, { status: "ok", apiVersion: RF01_COORDINATOR_API_VERSION });
    const outgoing = request.method === "POST" && request.path === "/v1/operations/outgoing";
    const confirmation = request.method === "POST" && request.path === "/v1/confirmations";
    const resolveState = request.method === "POST" && request.path === "/v1/services/state/resolve";
    if (!outgoing && !confirmation && !resolveState) return response(404, { outcome: "rejected", code: "NOT_FOUND" });
    if (!authorized(request.authorization, serviceToken)) return response(401, { outcome: "rejected", code: "UNAUTHORIZED" });

    if (resolveState) {
      const parsed = parseStateResolution(request.body);
      if (!parsed.ok) return response(400, { outcome: "rejected", code: parsed.code });
      const result = await resolveAuthoritativeState(connect, parsed.row);
      logger({ event: "rf01_state_resolved", outcome: result.body.outcome, code: result.body.code });
      return result;
    }

    if (confirmation) {
      const parsed = parseConfirmation(request.body);
      if (!parsed.ok) return response(400, { outcome: "rejected", code: parsed.code });
      const result = await adapter.runConfirmation(parsed.confirmation);
      const mapped = mapConfirmationResult(result);
      logger({ event: "rf01_confirmation_completed", outcome: mapped.body.outcome, code: mapped.body.code });
      return mapped;
    }

    const parsed = parseOperation(request.body);
    if (!parsed.ok) return response(400, { outcome: "rejected", code: parsed.code });
    const { identity, message } = parsed;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let result;
    try {
      const effects = {
        send: context => send({ identity, message, operationId: context.operationId, signal: controller.signal }),
      };
      result = await adapter.runVersionedOutgoing(identity, parsed.expectedVersion, effects);
    } finally {
      clearTimeout(timeout);
    }
    const mapped = mapResult(result);
    logger({ event: "rf01_operation_completed", outcome: mapped.body.outcome, code: mapped.body.code });
    return mapped;
  };
}

export function createRf01CoordinatorHttpServer(options) {
  const handler = createRf01CoordinatorHttpHandler(options);
  return createServer(async (req, res) => {
    try {
      const body = await readBody(req, MAX_BODY_BYTES);
      const result = await handler({ method: req.method, path: new URL(req.url, "http://localhost").pathname, authorization: req.headers.authorization, body });
      res.writeHead(result.status, result.headers); res.end(JSON.stringify(result.body));
    } catch (error) {
      const status = error?.message === "BODY_TOO_LARGE" ? 413 : 500;
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify({ outcome: "blocked", code: status === 413 ? "BODY_TOO_LARGE" : "SERVICE_FAILURE" }));
    }
  });
}

function parseOperation(body) {
  let value;
  try { value = typeof body === "string" ? JSON.parse(body) : body; } catch { return { ok: false, code: "INVALID_JSON" }; }
  if (!value || value.apiVersion !== RF01_COORDINATOR_API_VERSION || !value.operation || !value.message) return { ok: false, code: "INVALID_REQUEST" };
  const identity = value.operation;
  const operationRef = `rf01:${identity.serviceId}:${identity.operationKind}`;
  if (!safeId(identity.executionId) || !safeId(identity.serviceId) || !["request", "reminder", "thanks"].includes(identity.operationKind) || identity.operationRef !== operationRef) return { ok: false, code: "INVALID_OPERATION_IDENTITY" };
  if (!positiveInteger(identity.expectedVersion)) return { ok: false, code: "EXPECTED_VERSION_REQUIRED" };
  const message = value.message;
  if (!/^\+[1-9]\d{7,14}$/.test(message.phoneE164) || !boundedText(message.customerName, 160) ||
      ((identity.operationKind === "request" || identity.operationKind === "reminder") && !validReviewLink(message.reviewLink))) return { ok: false, code: "INVALID_MESSAGE_DATA" };
  return { ok: true, identity, expectedVersion: Number(identity.expectedVersion), message: { phoneE164: message.phoneE164, customerName: message.customerName, reviewLink: message.reviewLink ?? null } };
}

function parseStateResolution(body) {
  let value;
  try { value = typeof body === "string" ? JSON.parse(body) : body; } catch { return { ok: false, code: "INVALID_JSON" }; }
  if (value?.apiVersion !== RF01_COORDINATOR_API_VERSION || !value.service || typeof value.service !== "object") return { ok: false, code: "INVALID_SERVICE_STATE" };
  try { rf01ServiceStateFromSheetRow(value.service, { version: 1 }); }
  catch { return { ok: false, code: "INVALID_SERVICE_STATE" }; }
  return { ok: true, row: value.service };
}

async function resolveAuthoritativeState(connect, row) {
  let client;
  try {
    client = await connect();
    const repository = new Rf01PostgresServiceStateRepository({ query: client.query.bind(client) });
    const incoming = rf01ServiceStateFromSheetRow(row, { version: 1 });
    let current = await repository.getByServiceId(incoming.serviceId);
    if (!current) {
      const created = await repository.create(incoming);
      current = created.applied ? created.current : await repository.getByServiceId(incoming.serviceId);
    }
    if (!current) return response(503, { apiVersion: "v1", outcome: "blocked", code: "STATE_NOT_DURABLE" });
    if (!["customerName", "phoneE164", "appointmentAt", "reviewLink"].every(key => current[key] === incoming[key])) {
      return response(409, { apiVersion: "v1", outcome: "blocked", code: "SERVICE_IDENTITY_MISMATCH", serviceVersion: current.version });
    }
    return response(200, { apiVersion: "v1", outcome: "accepted", code: "STATE_RESOLVED", serviceVersion: current.version, projection: rf01ServiceStateToSheetRow(current, { updatedAt: new Date().toISOString() }) });
  } catch { return response(503, { apiVersion: "v1", outcome: "blocked", code: "COORDINATOR_UNAVAILABLE" }); }
  finally { try { await client?.release?.(); } catch {} }
}

function parseConfirmation(body) {
  let value;
  try { value = typeof body === "string" ? JSON.parse(body) : body; } catch { return { ok: false, code: "INVALID_JSON" }; }
  const confirmation = value?.confirmation;
  if (value?.apiVersion !== RF01_COORDINATOR_API_VERSION || !confirmation || !safeId(confirmation.executionId) ||
      !safeId(confirmation.serviceId) || !positiveInteger(confirmation.expectedVersion) || !validTimestamp(confirmation.confirmedAt)) {
    return { ok: false, code: "INVALID_CONFIRMATION" };
  }
  return { ok: true, confirmation: { ...confirmation, expectedVersion: Number(confirmation.expectedVersion), confirmedAt: new Date(confirmation.confirmedAt).toISOString() } };
}

function mapResult(result) {
  const common = { apiVersion: RF01_COORDINATOR_API_VERSION, operationId: result.operation_id ?? null, state: result.state ?? null, serviceVersion: result.service_version ?? null,
    projection: projectState(result.service_state) };
  if (["IDEMPOTENCY_KEY_EXISTS", "RUN_ALREADY_ACTIVE", "STALE_VERSION", "SERVICE_ALREADY_CONFIRMED", "OWNER_MISMATCH"].includes(result.reason)) return response(409, { ...common, outcome: "blocked", code: result.reason });
  if (result.allowed && result.state === "accepted") return response(200, { ...common, outcome: "accepted", code: "PROVIDER_ACCEPTED", acceptedAt: result.accepted_at });
  if (result.state === "ambiguous" || ["RESULT_NOT_DURABLE", "SERVICE_STATE_NOT_DURABLE"].includes(result.reason)) return response(202, { ...common, outcome: "uncertain", code: result.reason || "SEND_AMBIGUOUS" });
  if (result.state === "rejected" || result.reason === "SEND_REJECTED") return response(422, { ...common, outcome: "rejected", code: "SEND_REJECTED" });
  return response(503, { ...common, outcome: "blocked", code: result.reason || "COORDINATOR_UNAVAILABLE" });
}

function mapConfirmationResult(result) {
  const common = { apiVersion: RF01_COORDINATOR_API_VERSION, serviceVersion: result.version ?? result.current_version ?? null, projection: projectState(result.service_state) };
  if (result.allowed) return response(200, { ...common, outcome: "accepted", code: "CONFIRMATION_RECORDED" });
  if (["RUN_ALREADY_ACTIVE", "STALE_VERSION", "SERVICE_ALREADY_CONFIRMED", "OWNER_MISMATCH"].includes(result.reason)) return response(409, { ...common, outcome: "blocked", code: result.reason });
  return response(503, { ...common, outcome: "blocked", code: result.reason || "COORDINATOR_UNAVAILABLE" });
}

function projectState(row) {
  if (!row) return null;
  try {
    const state = row.serviceId ? row : {
      serviceId: row.service_id, customerName: row.customer_name, phoneE164: row.phone_e164,
      appointmentAt: row.appointment_at, reviewLink: row.review_link, status: row.status,
      operationPhase: row.operation_phase, requestSentAt: row.request_sent_at,
      reviewConfirmedAt: row.review_confirmed_at, reminderSentAt: row.reminder_sent_at,
      thanksSentAt: row.thanks_sent_at, completedAt: row.completed_at,
      completionReason: row.completion_reason, errorCode: row.error_code, version: Number(row.version),
    };
    return rf01ServiceStateToSheetRow(state, { updatedAt: new Date().toISOString() });
  } catch { return null; }
}

function response(status, body) { return { status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body }; }
function validSecret(value) { return typeof value === "string" && value.length >= 32 && value.length <= 512; }
function authorized(header, secret) {
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7)); const expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
function safeId(value) { return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value); }
function boundedText(value, max) { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validReviewLink(value) { try { const url = new URL(value); return url.protocol === "https:" && value.length <= 2048; } catch { return false; } }
function positiveInteger(value) { return Number.isSafeInteger(Number(value)) && Number(value) > 0; }
function validTimestamp(value) { return typeof value === "string" && !Number.isNaN(new Date(value).getTime()); }
async function readBody(req, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error("BODY_TOO_LARGE"); chunks.push(chunk); }
  return Buffer.concat(chunks).toString("utf8");
}
