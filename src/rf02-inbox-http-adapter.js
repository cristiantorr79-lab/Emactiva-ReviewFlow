import { timingSafeEqual } from "node:crypto";

export function createRf02InboxHttpAdapter({ endpoint, serviceToken, allowLoopbackHttp = false, timeoutMs = 10_000, fetchImpl = globalThis.fetch }) {
  if (typeof allowLoopbackHttp !== "boolean" || !validEndpoint(endpoint, allowLoopbackHttp) || !validSecret(serviceToken) || typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60_000) throw new TypeError("INVALID_INBOX_ADAPTER_CONFIG");
  return async event => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, { method: "POST", headers: { authorization: `Bearer ${serviceToken}`, "content-type": "application/json" }, body: JSON.stringify({ apiVersion: "v1", event }), signal: controller.signal });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.apiVersion !== "v1" || !["persisted", "duplicate"].includes(body?.status) || !safeEqual(body?.providerEventId, event.provider_event_id)) return { status: "ambiguous" };
      return { status: body.status };
    } catch { return { status: "ambiguous" }; }
    finally { clearTimeout(timeout); }
  };
}

function validEndpoint(value, allowLoopbackHttp) {
  if (typeof value !== "string" || value.length > 2048) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === "https:") return true;
  if (!allowLoopbackHttp || url.protocol !== "http:") return false;
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?(?:\/|\?|$)/i.test(value) && ["localhost", "127.0.0.1"].includes(url.hostname.toLowerCase());
}
function validSecret(value) { return typeof value === "string" && value.length >= 32 && value.length <= 512; }
function safeEqual(left, right) { if (typeof left !== "string" || typeof right !== "string") return false; const a=Buffer.from(left),b=Buffer.from(right); return a.length===b.length&&timingSafeEqual(a,b); }
