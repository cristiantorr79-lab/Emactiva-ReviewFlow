import { createRf01ServiceState } from "./rf01-service-state.js";

export function rf01ServiceStateFromSheetRow(row, { version }) {
  const boolean = (value, name) => {
    if (value === true || value === false) return value;
    if (typeof value === "string" && /^(true|false)$/i.test(value.trim())) return value.trim().toLowerCase() === "true";
    throw new TypeError(`INVALID_${name.toUpperCase()}`);
  };
  const flags = {
    request: boolean(row?.request_sent, "request_sent"),
    confirmation: boolean(row?.review_confirmed, "review_confirmed"),
    reminder: boolean(row?.reminder_sent, "reminder_sent"),
    thanks: boolean(row?.thanks_sent, "thanks_sent"),
  };
  for (const [name, flag] of Object.entries(flags)) if (!flag && present(row?.[`${name === "confirmation" ? "review_confirmed" : `${name}_sent`}_at`])) throw new TypeError("FLAG_TIMESTAMP_MISMATCH");
  return createRf01ServiceState({
    serviceId: row.service_id, customerName: row.customer_name, phoneE164: row.phone_e164,
    appointmentAt: row.appointment_at, reviewLink: row.review_link, status: row.status,
    operationPhase: row.operation_phase, requestSentAt: flags.request ? row.request_sent_at : null,
    reviewConfirmedAt: flags.confirmation ? row.review_confirmed_at : null,
    reminderSentAt: flags.reminder ? row.reminder_sent_at : null,
    thanksSentAt: flags.thanks ? row.thanks_sent_at : null,
    completedAt: empty(row.completed_at), completionReason: empty(row.completion_reason),
    errorCode: empty(row.error_code), version,
  });
}

export function rf01ServiceStateToSheetRow(state, { updatedAt }) {
  const value = createRf01ServiceState(state);
  const observed = new Date(updatedAt);
  if (!updatedAt || Number.isNaN(observed.getTime())) throw new TypeError("INVALID_UPDATED_AT");
  return {
    service_id: value.serviceId, customer_name: value.customerName, phone_e164: value.phoneE164,
    appointment_at: value.appointmentAt, review_link: value.reviewLink, status: value.status,
    request_sent: value.requestSentAt !== null, request_sent_at: value.requestSentAt,
    review_confirmed: value.reviewConfirmedAt !== null, review_confirmed_at: value.reviewConfirmedAt,
    reminder_sent: value.reminderSentAt !== null, reminder_sent_at: value.reminderSentAt,
    thanks_sent: value.thanksSentAt !== null, thanks_sent_at: value.thanksSentAt,
    completed_at: value.completedAt, completion_reason: value.completionReason,
    operation_phase: value.operationPhase, error_code: value.errorCode, updated_at: observed.toISOString(),
  };
}

const empty = value => value === "" || value === undefined ? null : value;
const present = value => value !== null && value !== undefined && value !== "";
