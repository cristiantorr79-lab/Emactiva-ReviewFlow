const statuses = new Set(["pending", "request_sent", "confirmed", "reminder_sent", "completed"]);
const phases = new Set(["idle", "request_prepared", "request_ambiguous", "reminder_prepared", "reminder_ambiguous", "thanks_prepared", "thanks_ambiguous", "needs_reconciliation"]);
const completionReasons = new Set([null, "reminder_finished", "confirmed_thanked"]);
const transitionKeys = new Set([
  "status", "operationPhase", "requestSentAt", "reviewConfirmedAt", "reminderSentAt",
  "thanksSentAt", "completedAt", "completionReason", "errorCode",
]);

export function createRf01ServiceState(value) {
  const state = {
    serviceId: value?.serviceId,
    customerName: value?.customerName,
    phoneE164: value?.phoneE164,
    appointmentAt: requiredUtc(value?.appointmentAt, "INVALID_APPOINTMENT_AT"),
    reviewLink: value?.reviewLink,
    status: value?.status,
    operationPhase: value?.operationPhase,
    requestSentAt: nullableUtc(value?.requestSentAt),
    reviewConfirmedAt: nullableUtc(value?.reviewConfirmedAt),
    reminderSentAt: nullableUtc(value?.reminderSentAt),
    thanksSentAt: nullableUtc(value?.thanksSentAt),
    completedAt: nullableUtc(value?.completedAt),
    completionReason: value?.completionReason ?? null,
    errorCode: value?.errorCode ?? null,
    version: Number(value?.version),
  };
  assertState(state);
  return Object.freeze(state);
}

export function applyRf01ServiceTransition(current, expectedVersion, changes) {
  const state = createRf01ServiceState(current);
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("INVALID_EXPECTED_VERSION");
  if (state.version !== expectedVersion) return { applied: false, reason: "STALE_VERSION", current: state };
  if (!changes || typeof changes !== "object" || Object.keys(changes).some(key => !transitionKeys.has(key))) throw new TypeError("INVALID_TRANSITION");
  const next = createRf01ServiceState({ ...state, ...changes, version: state.version + 1 });
  return { applied: true, previousVersion: state.version, current: next };
}

export function assertRf01ServiceStateRepository(repository) {
  if (!repository || typeof repository.getByServiceId !== "function" || typeof repository.create !== "function" || typeof repository.applyTransition !== "function") {
    throw new TypeError("INVALID_SERVICE_STATE_REPOSITORY");
  }
  return repository;
}

function assertState(state) {
  if (typeof state.serviceId !== "string" || !/^[A-Za-z0-9._:-]{1,160}$/.test(state.serviceId)) throw new TypeError("INVALID_SERVICE_ID");
  if (typeof state.customerName !== "string" || !state.customerName.trim() || state.customerName.length > 160) throw new TypeError("INVALID_CUSTOMER_NAME");
  if (typeof state.phoneE164 !== "string" || !/^\+[1-9]\d{7,14}$/.test(state.phoneE164)) throw new TypeError("INVALID_PHONE");
  if (!state.appointmentAt) throw new TypeError("INVALID_APPOINTMENT_AT");
  if (!validHttps(state.reviewLink)) throw new TypeError("INVALID_REVIEW_LINK");
  if (!statuses.has(state.status)) throw new TypeError("INVALID_STATUS");
  if (!phases.has(state.operationPhase)) throw new TypeError("INVALID_OPERATION_PHASE");
  if (!completionReasons.has(state.completionReason)) throw new TypeError("INVALID_COMPLETION_REASON");
  if (!Number.isSafeInteger(state.version) || state.version < 1) throw new TypeError("INVALID_VERSION");
  if (state.requestSentAt === null && ["request_sent", "confirmed", "reminder_sent", "completed"].includes(state.status)) throw new TypeError("STATUS_REQUIRES_REQUEST");
  if (state.reviewConfirmedAt !== null && state.requestSentAt === null) throw new TypeError("CONFIRMATION_REQUIRES_REQUEST");
  if (state.reminderSentAt !== null && state.requestSentAt === null) throw new TypeError("REMINDER_REQUIRES_REQUEST");
  if (state.thanksSentAt !== null && state.reviewConfirmedAt === null) throw new TypeError("THANKS_REQUIRES_CONFIRMATION");
  if (state.status === "confirmed" && state.reviewConfirmedAt === null) throw new TypeError("STATUS_REQUIRES_CONFIRMATION");
  if (state.status === "completed" && (!state.completedAt || !state.completionReason)) throw new TypeError("COMPLETED_REQUIRES_REASON");
  if (state.completionReason && !state.completedAt) throw new TypeError("MISSING_COMPLETED_AT");
  if (state.completionReason === "confirmed_thanked" && state.thanksSentAt === null) throw new TypeError("CONFIRMED_THANKED_WITHOUT_THANKS");
  if (state.errorCode !== null && (typeof state.errorCode !== "string" || !/^[A-Z0-9_:-]{1,80}$/.test(state.errorCode))) throw new TypeError("INVALID_ERROR_CODE");
}

function requiredUtc(value, code) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) throw new TypeError(code);
  return date.toISOString();
}
function nullableUtc(value) { return value === null || value === undefined || value === "" ? null : requiredUtc(value, "INVALID_TIMESTAMP"); }
function validHttps(value) { try { return new URL(value).protocol === "https:"; } catch { return false; } }
