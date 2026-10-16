import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

export const RF02_API_VERSION = "v1";
const MAX_BODY_BYTES = 256 * 1024;
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/;
const SAFE_PROVIDER_ID = /^[A-Za-z0-9._:-]{1,200}$/;

export function createRf02WebhookHandler({ appSecret, verifyToken, persistEvent, logger = () => {} }) {
  if (!validSecret(appSecret) || !validSecret(verifyToken) || typeof persistEvent !== "function") throw new TypeError("INVALID_RF02_CONFIG");

  return async request => {
    if (request.method === "GET" && request.path === "/webhooks/whatsapp") {
      const query = request.query ?? {};
      if (query["hub.mode"] !== "subscribe" || !safeEqualText(query["hub.verify_token"], verifyToken) || !validChallenge(query["hub.challenge"])) {
        return textResponse(403, "verification rejected");
      }
      return textResponse(200, query["hub.challenge"]);
    }
    if (request.method !== "POST" || request.path !== "/webhooks/whatsapp") return jsonResponse(404, { outcome: "rejected", code: "NOT_FOUND" });
    const rawBody = Buffer.isBuffer(request.rawBody) ? request.rawBody : null;
    if (!rawBody || !validSignature(request.signature, rawBody, appSecret)) {
      logger({ event: "rf02_webhook_rejected", outcome: "rejected", code: "INVALID_SIGNATURE" });
      return jsonResponse(401, { outcome: "rejected", code: "INVALID_SIGNATURE" });
    }

    let payload;
    try { payload = JSON.parse(rawBody.toString("utf8")); }
    catch { return jsonResponse(400, { outcome: "rejected", code: "INVALID_JSON" }); }
    const normalized = normalizeWhatsAppPayload(payload);
    if (!normalized.ok) {
      logger({ event: "rf02_webhook_rejected", outcome: "rejected", code: normalized.code });
      return jsonResponse(400, { outcome: "rejected", code: normalized.code });
    }
    if (normalized.events.length === 0) {
      logger({ event: "rf02_webhook_ignored", outcome: "ignored", code: "NO_LISTO_EVENT" });
      return jsonResponse(200, { outcome: "ignored", code: "NO_LISTO_EVENT" });
    }

    const accepted = [];
    for (const event of normalized.events) {
      let result;
      try { result = await persistEvent({ ...event }); }
      catch { result = { status: "ambiguous" }; }
      if (!result || !["persisted", "duplicate"].includes(result.status)) {
        logger({ event: "rf02_persistence_blocked", outcome: "uncertain", code: "EVENT_NOT_CONFIRMED" });
        return jsonResponse(503, { outcome: "uncertain", code: "EVENT_NOT_CONFIRMED" });
      }
      accepted.push(result.status);
    }
    logger({ event: "rf02_webhook_completed", outcome: "accepted", code: accepted.every(value => value === "duplicate") ? "DUPLICATE_CONFIRMED" : "EVENTS_PERSISTED", count: accepted.length });
    return jsonResponse(200, { outcome: "accepted", code: accepted.every(value => value === "duplicate") ? "DUPLICATE_CONFIRMED" : "EVENTS_PERSISTED", count: accepted.length });
  };
}

export function normalizeWhatsAppPayload(payload) {
  if (!payload || payload.object !== "whatsapp_business_account" || !Array.isArray(payload.entry)) return { ok: false, code: "INVALID_WEBHOOK_EVENT" };
  const events = [];
  for (const entry of payload.entry) {
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (change?.field !== "messages" || !Array.isArray(change?.value?.messages)) continue;
      for (const message of change.value.messages) {
        if (message?.type !== "text" || typeof message?.text?.body !== "string" || message.text.body.trim().toUpperCase() !== "LISTO") continue;
        if (!SAFE_PROVIDER_ID.test(message.id ?? "") || !/^\d{8,15}$/.test(message.from ?? "") || !/^\d{10,13}$/.test(message.timestamp ?? "")) return { ok: false, code: "INVALID_WEBHOOK_EVENT" };
        const milliseconds = Number(message.timestamp) * 1000;
        if (!Number.isSafeInteger(milliseconds)) return { ok: false, code: "INVALID_WEBHOOK_EVENT" };
        const received = new Date(milliseconds);
        if (Number.isNaN(received.getTime())) return { ok: false, code: "INVALID_WEBHOOK_EVENT" };
        events.push({ provider_event_id: message.id, phone_e164: `+${message.from}`, received_at: received.toISOString(), event_type: "LISTO", processing_status: "pending" });
      }
    }
  }
  return { ok: true, events };
}

export function validSignature(header, rawBody, appSecret) {
  if (typeof header !== "string" || !Buffer.isBuffer(rawBody)) return false;
  const match = header.match(SIGNATURE_PATTERN);
  if (!match) return false;
  const supplied = Buffer.from(match[1], "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createRf02WebhookServer(options) {
  const handler = createRf02WebhookHandler(options);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const rawBody = req.method === "POST" ? await readRawBody(req, MAX_BODY_BYTES) : Buffer.alloc(0);
      const result = await handler({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), signature: req.headers["x-hub-signature-256"], rawBody });
      res.writeHead(result.status, result.headers); res.end(result.body);
    } catch (error) {
      const status = error?.message === "BODY_TOO_LARGE" ? 413 : 500;
      const result = jsonResponse(status, { outcome: "rejected", code: status === 413 ? "BODY_TOO_LARGE" : "SERVICE_FAILURE" });
      res.writeHead(result.status, result.headers); res.end(result.body);
    }
  });
}

function validSecret(value) { return typeof value === "string" && value.length >= 32 && value.length <= 512; }
function validChallenge(value) { return typeof value === "string" && /^[A-Za-z0-9._-]{1,256}$/.test(value); }
function safeEqualText(supplied, expected) {
  if (typeof supplied !== "string") return false;
  const left = Buffer.from(supplied); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function jsonResponse(status, value) { return { status, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(value) }; }
function textResponse(status, value) { return { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, body: value }; }
async function readRawBody(req, limit) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new Error("BODY_TOO_LARGE"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
