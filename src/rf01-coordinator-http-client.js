export function createRf01CoordinatorHttpClient({ fetchImpl = fetch, baseUrl, serviceToken, timeoutMs = 20_000 }) {
  if (typeof fetchImpl !== "function" || !validHttpsUrl(baseUrl) || typeof serviceToken !== "string" || serviceToken.length < 32) throw new TypeError("INVALID_CLIENT_CONFIG");
  return async operation => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/v1/operations/outgoing`, {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify({ apiVersion: "v1", ...operation }),
      });
      const body = await response.json().catch(() => ({ outcome: "blocked", code: "INVALID_SERVICE_RESPONSE" }));
      return { httpStatus: response.status, ...body };
    } catch {
      return { apiVersion: "v1", outcome: "uncertain", code: "COORDINATOR_REQUEST_UNCERTAIN" };
    } finally { clearTimeout(timeout); }
  };
}

export function createRf01CoordinatorConfirmationHttpClient(options) {
  const request = createRequest(options);
  return confirmation => request("/v1/confirmations", { confirmation });
}

function createRequest({ fetchImpl = fetch, baseUrl, serviceToken, timeoutMs = 20_000 }) {
  if (typeof fetchImpl !== "function" || !validHttpsUrl(baseUrl) || typeof serviceToken !== "string" || serviceToken.length < 32) throw new TypeError("INVALID_CLIENT_CONFIG");
  return async (path, payload) => {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, "")}${path}`, {
        method: "POST", signal: controller.signal,
        headers: { authorization: `Bearer ${serviceToken}`, "content-type": "application/json" },
        body: JSON.stringify({ apiVersion: "v1", ...payload }),
      });
      const body = await response.json().catch(() => ({ outcome: "blocked", code: "INVALID_SERVICE_RESPONSE" }));
      return { httpStatus: response.status, ...body };
    } catch { return { apiVersion: "v1", outcome: "uncertain", code: "COORDINATOR_REQUEST_UNCERTAIN" }; }
    finally { clearTimeout(timeout); }
  };
}

function validHttpsUrl(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
