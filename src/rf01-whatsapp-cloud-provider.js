const templateNames = Object.freeze({ request: "reviewflow_solicitud_resena", reminder: "reviewflow_recordatorio_resena", thanks: "reviewflow_agradecimiento_resena" });

export function createRf01WhatsAppCloudProvider({ fetchImpl = fetch, accessToken, phoneNumberId, businessName, apiVersion = "v25.0", language = "es_CL", now = () => new Date() }) {
  if (typeof fetchImpl !== "function" || !accessToken || !phoneNumberId || !businessName || language !== "es_CL" || !/^v\d+\.\d+$/.test(apiVersion)) throw new TypeError("INVALID_WHATSAPP_CONFIG");
  return async ({ identity, message, signal }) => {
    const texts = identity.operationKind === "thanks" ? [message.customerName, businessName] : [message.customerName, businessName, message.reviewLink];
    const payload = { messaging_product: "whatsapp", to: message.phoneE164, type: "template", template: { name: templateNames[identity.operationKind], language: { code: language }, components: [{ type: "body", parameters: texts.map(text => ({ type: "text", text })) }] } };
    try {
      const result = await fetchImpl(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
        method: "POST", signal, headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      if (result.ok) {
        const body = await result.json().catch(() => null);
        if (Array.isArray(body?.messages) && body.messages[0]?.id) return { status: "accepted", acceptedAt: now().toISOString() };
        return { status: "ambiguous", resultCode: "WA_ACCEPTANCE_INVALID" };
      }
      if (result.status >= 400 && result.status < 500) return { status: "rejected", resultCode: "WA_HTTP_4XX" };
      return { status: "ambiguous", resultCode: "WA_HTTP_UNCERTAIN" };
    } catch {
      return { status: "ambiguous", resultCode: signal?.aborted ? "WA_TIMEOUT" : "WA_NETWORK_ERROR" };
    }
  };
}
