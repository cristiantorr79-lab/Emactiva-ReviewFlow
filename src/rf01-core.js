const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const STATUSES = new Set(["pending", "request_sent", "confirmed", "reminder_sent", "completed"]);
export const PHASES = new Set([
  "idle", "request_prepared", "request_ambiguous", "reminder_prepared",
  "reminder_ambiguous", "thanks_prepared", "thanks_ambiguous", "needs_reconciliation",
]);
export const EVENT_STATUSES = new Set(["pending", "processed", "ambiguous", "invalid"]);

const clone = (value, seen = new WeakMap()) => {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(clone(item, seen));
    return copy;
  }
  if (Object.prototype.toString.call(value) !== "[object Object]") {
    throw new TypeError("UNSUPPORTED_CLONE_VALUE");
  }
  const copy = {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) copy[key] = clone(value[key], seen);
  return copy;
};
const iso = date => date.toISOString();
const parseDate = value => {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? null : date;
};
const validPhone = value => typeof value === "string" && /^\+[1-9]\d{7,14}$/.test(value);
const validBoolean = value => typeof value === "boolean";
const validHttpsUrl = value => {
  if (typeof value !== "string" || /\s/.test(value)) return false;
  if (typeof URL === "function") {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && Boolean(parsed.hostname);
    } catch { return false; }
  }
  const match = value.match(/^https:\/\/([^/?#]+)(?:[/?#][^\s]*)?$/i);
  if (!match || match[1].includes("@")) return false;
  let host = match[1];
  let port = null;
  if (host.startsWith("[")) {
    const closing = host.indexOf("]");
    if (closing < 2 || !/^[0-9a-f:.]+$/i.test(host.slice(1, closing))) return false;
    const remainder = host.slice(closing + 1);
    if (remainder && !/^:\d+$/.test(remainder)) return false;
    port = remainder ? remainder.slice(1) : null;
  } else {
    if ((host.match(/:/g) ?? []).length > 1) return false;
    const colon = host.lastIndexOf(":");
    if (colon >= 0) { port = host.slice(colon + 1); host = host.slice(0, colon); }
    const labels = host.split(".");
    if (!labels.length || labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
  }
  return port === null || (/^\d{1,5}$/.test(port) && Number(port) >= 1 && Number(port) <= 65535);
};

export function validateConfig(config) {
  const errors = [];
  if (!config || config.criticalConfigPresent !== true) errors.push("CRITICAL_CONFIG_MISSING");
  if (!config || config.contactAuthorized !== true) errors.push("CONTACT_NOT_AUTHORIZED");
  for (const [key, expected] of [["requestDelayHours", 2], ["reminderDelayHours", 12]]) {
    if (!config || config[key] !== expected) errors.push(`INVALID_${key.toUpperCase()}`);
  }
  if (!config || !Number.isFinite(config.confirmationWindowDays) || config.confirmationWindowDays <= 0) errors.push("INVALID_CONFIRMATIONWINDOWDAYS");
  return errors;
}

export function validateService(service) {
  const errors = [];
  if (!service || typeof service.service_id !== "string" || !service.service_id.trim()) errors.push("INVALID_SERVICE_ID");
  if (!validPhone(service?.phone_e164)) errors.push("INVALID_PHONE");
  if (!parseDate(service?.appointment_at)) errors.push("INVALID_APPOINTMENT_AT");
  if (!STATUSES.has(service?.status)) errors.push("INVALID_STATUS");
  if (!PHASES.has(service?.operation_phase)) errors.push("INVALID_OPERATION_PHASE");
  for (const key of ["request_sent", "review_confirmed", "reminder_sent", "thanks_sent"]) {
    if (!validBoolean(service?.[key])) errors.push(`INVALID_${key.toUpperCase()}`);
    if (service?.[key] === true && !parseDate(service?.[`${key}_at`])) errors.push(`MISSING_${key.toUpperCase()}_AT`);
  }
  if (service?.request_sent_at && !parseDate(service.request_sent_at)) errors.push("INVALID_REQUEST_SENT_AT");
  if (service?.review_confirmed_at && !parseDate(service.review_confirmed_at)) errors.push("INVALID_REVIEW_CONFIRMED_AT");
  if (service?.reminder_sent_at && !parseDate(service.reminder_sent_at)) errors.push("INVALID_REMINDER_SENT_AT");
  if (service?.thanks_sent_at && !parseDate(service.thanks_sent_at)) errors.push("INVALID_THANKS_SENT_AT");
  if (service?.completed_at && !parseDate(service.completed_at)) errors.push("INVALID_COMPLETED_AT");
  if (service?.completed_at && !["reminder_finished", "confirmed_thanked"].includes(service?.completion_reason)) errors.push("INVALID_COMPLETION_REASON");
  if (service?.completion_reason && !service?.completed_at) errors.push("MISSING_COMPLETED_AT");
  if (service?.completion_reason === "confirmed_thanked" && service?.thanks_sent !== true) errors.push("CONFIRMED_THANKED_WITHOUT_THANKS");
  if (service?.request_sent === false && ["request_sent", "confirmed", "reminder_sent", "completed"].includes(service?.status)) errors.push("STATUS_REQUIRES_REQUEST_SENT");
  if (service?.review_confirmed === true && service?.request_sent !== true) errors.push("CONFIRMATION_REQUIRES_REQUEST");
  if (service?.reminder_sent === true && service?.request_sent !== true) errors.push("REMINDER_REQUIRES_REQUEST");
  if (service?.thanks_sent === true && service?.review_confirmed !== true) errors.push("THANKS_REQUIRES_CONFIRMATION");
  if (service?.status === "confirmed" && service?.review_confirmed !== true) errors.push("STATUS_REQUIRES_CONFIRMATION");
  if (service?.status === "completed" && !service?.completion_reason) errors.push("COMPLETED_REQUIRES_REASON");
  if (service?.review_confirmed === true && service?.status === "pending") errors.push("CONFIRMED_PENDING_CONTRADICTION");
  if (!validHttpsUrl(service?.review_link)) errors.push("INVALID_REVIEW_LINK");
  return [...new Set(errors)];
}

export function validateEvent(event) {
  const errors = [];
  if (!event || typeof event.provider_event_id !== "string" || !event.provider_event_id.trim()) errors.push("INVALID_WEBHOOK_EVENT");
  if (!validPhone(event?.phone_e164)) errors.push("INVALID_PHONE");
  if (!parseDate(event?.received_at)) errors.push("INVALID_DATE");
  if (event?.event_type !== "LISTO") errors.push("INVALID_WEBHOOK_EVENT");
  if (!EVENT_STATUSES.has(event?.processing_status)) errors.push("INVALID_EVENT_STATUS");
  return [...new Set(errors)];
}

function eligibleForRequest(service, now, config) {
  const at = parseDate(service.appointment_at);
  return service.status === "pending" && !service.request_sent && service.operation_phase === "idle" &&
    now.getTime() >= at.getTime() + config.requestDelayHours * HOUR_MS;
}

function eligibleForReminder(service, now, config) {
  const sent = parseDate(service.request_sent_at);
  return service.request_sent && !service.review_confirmed && !service.reminder_sent &&
    service.operation_phase === "idle" && sent && now.getTime() >= sent.getTime() + config.reminderDelayHours * HOUR_MS;
}

function correlationForEvent(event, services, config) {
  const received = parseDate(event.received_at);
  if (!received) return { candidates: [], potential: services.filter(service => service?.phone_e164 === event.phone_e164), uncertain: true };
  const candidates = [];
  const potential = [];
  let uncertain = false;
  for (const service of services) {
    if (service?.phone_e164 !== event.phone_e164) continue;
    if (service.request_sent !== true) {
      if (service.request_sent !== false) { uncertain = true; potential.push(service); }
      continue;
    }
    const sent = parseDate(service.request_sent_at);
    if (!sent) { uncertain = true; potential.push(service); continue; }
    if (received.getTime() >= sent.getTime() && received.getTime() <= sent.getTime() + config.confirmationWindowDays * DAY_MS) {
      candidates.push(service);
      potential.push(service);
    }
  }
  return { candidates, potential, uncertain };
}

const operationRefFor = (service, kind) => `rf01:${service.service_id}:${kind}`;

async function observedNow(adapters) {
  if (typeof adapters.now !== "function") return null;
  try {
    const value = await adapters.now();
    return parseDate(value instanceof Date ? value.toISOString() : value);
  } catch { return null; }
}

async function safePersistService(adapters, service) {
  await adapters.persistService(clone(service));
}

async function markEvent(adapters, event, status, serviceId, errorCode) {
  const next = { ...event, processing_status: status };
  if (serviceId) next.service_id = serviceId;
  if (errorCode) next.error_code = errorCode;
  await adapters.persistEvent(clone(next));
  Object.assign(event, next);
}

async function outgoing(kind, service, adapters, results) {
  const prefix = kind === "request" ? "request" : kind === "reminder" ? "reminder" : "thanks";
  const operationRef = operationRefFor(service, kind);
  if (service.operation_phase !== "idle") {
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "OPERATION_NEEDS_RECONCILIATION" });
    return false;
  }
  const decisionNow = await observedNow(adapters);
  if (!decisionNow) {
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "OPERATION_TIME_UNAVAILABLE", operation: kind });
    return false;
  }
  if (typeof adapters.isAllowedToSend !== "function") {
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "SCHEDULE_POLICY_MISSING", operation: kind });
    return false;
  }
  let schedule;
  try { schedule = await adapters.isAllowedToSend({ kind, service: clone(service), now: iso(decisionNow), operationRef }); }
  catch { schedule = { status: "ambiguous" }; }
  if (!schedule || schedule.status !== "allowed") {
    const reason = schedule?.status === "denied" ? "SCHEDULE_DENIED" : "SCHEDULE_UNCERTAIN";
    results.blocked.push({ service_id: service.service_id, operationRef, reason, operation: kind });
    return false;
  }
  const prepared = { ...service, operation_phase: `${prefix}_prepared`, updated_at: iso(decisionNow) };
  try {
    await safePersistService(adapters, prepared);
    Object.assign(service, prepared);
  } catch {
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "CHECKPOINT_WRITE_FAILED", operation: kind });
    return false;
  }

  let result;
  try { result = await adapters.send({ kind, service: clone(service), operationRef }); }
  catch { result = { status: "ambiguous" }; }

  if (!result || result.status === "ambiguous") {
    const ambiguousAt = await observedNow(adapters) ?? decisionNow;
    const ambiguous = { ...service, operation_phase: `${prefix}_ambiguous`, error_code: "WA_RESULT_AMBIGUOUS", updated_at: iso(ambiguousAt) };
    try { await safePersistService(adapters, ambiguous); Object.assign(service, ambiguous); } catch { /* already unsafe */ }
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "WA_RESULT_AMBIGUOUS", operation: kind });
    return false;
  }
  if (result.status === "failed") {
    const failedAt = await observedNow(adapters) ?? decisionNow;
    const failed = { ...service, operation_phase: "idle", error_code: "WA_SEND_FAILED", updated_at: iso(failedAt) };
    try { await safePersistService(adapters, failed); Object.assign(service, failed); } catch {
      results.blocked.push({ service_id: service.service_id, operationRef, reason: "SHEETS_WRITE_FAILED", operation: kind });
      return false;
    }
    results.failed.push({ service_id: service.service_id, operationRef, operation: kind, reason: "WA_SEND_FAILED" });
    return false;
  }
  if (result.status !== "confirmed") {
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "WA_RESULT_AMBIGUOUS", operation: kind });
    return false;
  }

  const acceptedAt = result.accepted_at ? parseDate(result.accepted_at) : await observedNow(adapters);
  if (!acceptedAt) {
    const ambiguous = { ...service, operation_phase: `${prefix}_ambiguous`, error_code: "WA_RESULT_AMBIGUOUS", updated_at: iso(decisionNow) };
    try { await safePersistService(adapters, ambiguous); Object.assign(service, ambiguous); } catch { /* already unsafe */ }
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "ACCEPTANCE_TIME_UNAVAILABLE", operation: kind });
    return false;
  }
  const acceptedIso = iso(acceptedAt);
  const done = { ...service, operation_phase: "idle", error_code: null, updated_at: acceptedIso };
  if (kind === "request") Object.assign(done, { status: "request_sent", request_sent: true, request_sent_at: acceptedIso });
  if (kind === "reminder") Object.assign(done, { status: "completed", reminder_sent: true, reminder_sent_at: acceptedIso, completed_at: acceptedIso, completion_reason: "reminder_finished" });
  if (kind === "thanks") Object.assign(done, { status: "completed", thanks_sent: true, thanks_sent_at: acceptedIso, completed_at: acceptedIso, completion_reason: "confirmed_thanked" });
  try {
    await safePersistService(adapters, done);
    Object.assign(service, done);
    results.effects.push({ service_id: service.service_id, operationRef, operation: kind, accepted_at: acceptedIso, result: "confirmed" });
    return true;
  } catch {
    const ambiguous = { ...service, operation_phase: `${prefix}_ambiguous`, error_code: "WA_RESULT_AMBIGUOUS", updated_at: acceptedIso };
    try { await safePersistService(adapters, ambiguous); Object.assign(service, ambiguous); } catch { /* retain conservative in-memory phase */ }
    results.blocked.push({ service_id: service.service_id, operationRef, reason: "WA_RESULT_AMBIGUOUS", operation: kind });
    return false;
  }
}

async function consumeEvent(event, allServices, config, now, adapters, results, seenIds, duplicateIds, reminderBlocks) {
  if (!["pending", "ambiguous"].includes(event.processing_status)) return { outcome: "ignored", affected: [] };
  if (seenIds.has(event.provider_event_id)) {
    await markEvent(adapters, event, "processed", undefined, "DUPLICATE_PROVIDER_EVENT");
    results.events.push({ provider_event_id: event.provider_event_id, result: "duplicate" });
    return { outcome: "duplicate", affected: [] };
  }
  const errors = validateEvent(event);
  if (errors.length) {
    await markEvent(adapters, event, "invalid", undefined, errors[0]);
    seenIds.add(event.provider_event_id);
    results.events.push({ provider_event_id: event.provider_event_id, result: "invalid", errors });
    return { outcome: "invalid", affected: [] };
  }
  const { candidates, potential, uncertain } = correlationForEvent(event, allServices, config);
  const affected = [...new Set(potential.map(service => service.service_id))];
  const duplicateCandidate = candidates.some(service => duplicateIds.has(service.service_id));
  if (uncertain || candidates.length !== 1 || duplicateCandidate || validateService(candidates[0]).length) {
    const reason = uncertain || candidates.length ? "AMBIGUOUS_CUSTOMER_MATCH" : "CUSTOMER_NOT_FOUND";
    for (const serviceId of affected) reminderBlocks.add(serviceId);
    if (event.processing_status !== "ambiguous" || event.error_code !== reason) {
      try { await markEvent(adapters, event, "ambiguous", undefined, reason); }
      catch {
        results.blocked.push({ provider_event_id: event.provider_event_id, reason: "EVENT_STATE_WRITE_FAILED" });
      }
    }
    results.events.push({ provider_event_id: event.provider_event_id, result: "ambiguous", reason });
    return { outcome: "ambiguous", affected };
  }
  const service = candidates[0];
  if (!service.review_confirmed) {
    const confirmed = { ...service, status: "confirmed", review_confirmed: true, review_confirmed_at: event.received_at, error_code: null, updated_at: iso(now) };
    try { await safePersistService(adapters, confirmed); }
    catch {
      reminderBlocks.add(service.service_id);
      results.blocked.push({ service_id: service.service_id, provider_event_id: event.provider_event_id, reason: "CONFIRMATION_WRITE_FAILED" });
      return { outcome: "persistence_failed", affected: [service.service_id] };
    }
    Object.assign(service, confirmed);
  }
  try {
    await markEvent(adapters, event, "processed", service.service_id);
  } catch {
    results.blocked.push({ service_id: service.service_id, provider_event_id: event.provider_event_id, reason: "EVENT_STATE_WRITE_FAILED" });
    reminderBlocks.add(service.service_id);
    return { outcome: "persistence_failed", affected: [service.service_id] };
  }
  results.events.push({ provider_event_id: event.provider_event_id, result: "processed", service_id: service.service_id });
  seenIds.add(event.provider_event_id);
  return { outcome: "processed", affected: [service.service_id] };
}

export async function runRf01Cycle(input) {
  const now = parseDate(input?.now);
  if (!now) throw new Error("INVALID_CLOCK");
  const services = clone(input.services ?? []);
  const events = clone(input.inboxEvents ?? []);
  const adapters = input.adapters;
  if (!adapters || !["persistService", "persistEvent", "send", "rereadForReminder"].every(k => typeof adapters[k] === "function")) throw new Error("INVALID_ADAPTERS");
  const results = { effects: [], events: [], blocked: [], failed: [], validation: [] };
  const configErrors = validateConfig(input.config);
  const timingErrors = configErrors.filter(error => error.startsWith("INVALID_"));
  if (timingErrors.length) {
    results.blocked.push({ reason: configErrors[0], errors: configErrors });
    return { services, inboxEvents: events, results };
  }
  const outboundBlocked = configErrors.length > 0;
  const ids = new Set();
  const duplicateIds = new Set();
  for (const service of services) {
    const errors = validateService(service);
    if (ids.has(service.service_id)) { errors.push("DUPLICATE_SERVICE_ID"); duplicateIds.add(service.service_id); }
    ids.add(service.service_id);
    if (errors.length) results.validation.push({ service_id: service.service_id, errors: [...new Set(errors)] });
    if (PHASES.has(service.operation_phase) && service.operation_phase !== "idle") {
      results.blocked.push({ service_id: service.service_id, reason: "OPERATION_NEEDS_RECONCILIATION" });
    }
  }
  const invalidIds = new Set(results.validation.map(v => v.service_id));
  const validServices = services.filter(s => !invalidIds.has(s.service_id));
  const seenIds = new Set(events.filter(e => ["processed", "invalid"].includes(e.processing_status)).map(e => e.provider_event_id));
  const reminderBlocks = new Set();

  for (const event of events) await consumeEvent(event, services, input.config, now, adapters, results, seenIds, duplicateIds, reminderBlocks);

  if (outboundBlocked) {
    results.blocked.push({ reason: configErrors[0], errors: configErrors });
    return { services, inboxEvents: events, results };
  }

  // Recover a confirmed-but-not-thanked service independently of any later duplicate LISTO.
  for (const service of validServices) {
    if (service.review_confirmed && !service.thanks_sent) await outgoing("thanks", service, adapters, results);
  }

  for (const service of validServices) {
    const current = await observedNow(adapters);
    if (!current) {
      results.blocked.push({ service_id: service.service_id, operationRef: operationRefFor(service, "request"), reason: "OPERATION_TIME_UNAVAILABLE", operation: "request" });
      continue;
    }
    if (eligibleForRequest(service, current, input.config)) await outgoing("request", service, adapters, results);
  }

  for (const service of validServices) {
    if (reminderBlocks.has(service.service_id)) {
      results.blocked.push({ service_id: service.service_id, reason: "UNRESOLVED_CONFIRMATION_EVENT" });
      continue;
    }
    let current = await observedNow(adapters);
    if (!current) {
      results.blocked.push({ service_id: service.service_id, operationRef: operationRefFor(service, "reminder"), reason: "OPERATION_TIME_UNAVAILABLE", operation: "reminder" });
      continue;
    }
    if (!eligibleForReminder(service, current, input.config)) continue;
    let reread;
    try { reread = await adapters.rereadForReminder({ service_id: service.service_id, phone_e164: service.phone_e164 }); }
    catch { reread = { status: "failed" }; }
    if (!reread || reread.status !== "confirmed" || !reread.service || !Array.isArray(reread.events)) {
      results.blocked.push({ service_id: service.service_id, reason: "REMINDER_REVALIDATION_FAILED" });
      continue;
    }
    const freshErrors = validateService(reread.service);
    if (reread.service.service_id !== service.service_id || reread.service.phone_e164 !== service.phone_e164) {
      results.blocked.push({ service_id: service.service_id, reason: "REMINDER_REVALIDATION_IDENTITY_MISMATCH" });
      continue;
    }
    if (freshErrors.length) {
      results.blocked.push({ service_id: service.service_id, reason: "REMINDER_REVALIDATION_INVALID" });
      continue;
    }
    Object.assign(service, clone(reread.service));
    for (const event of clone(reread.events)) await consumeEvent(event, services, input.config, now, adapters, results, seenIds, duplicateIds, reminderBlocks);
    if (reminderBlocks.has(service.service_id)) {
      results.blocked.push({ service_id: service.service_id, reason: "UNRESOLVED_CONFIRMATION_EVENT" });
      continue;
    }
    if (service.review_confirmed) {
      if (!service.thanks_sent) await outgoing("thanks", service, adapters, results);
      continue;
    }
    current = await observedNow(adapters);
    if (!current) {
      results.blocked.push({ service_id: service.service_id, operationRef: operationRefFor(service, "reminder"), reason: "OPERATION_TIME_UNAVAILABLE", operation: "reminder" });
      continue;
    }
    if (!eligibleForReminder(service, current, input.config)) continue;
    await outgoing("reminder", service, adapters, results);
  }
  return { services, inboxEvents: events, results };
}
