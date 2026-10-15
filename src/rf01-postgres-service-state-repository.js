import { assertRf01ServiceStateRepository, createRf01ServiceState } from "./rf01-service-state.js";

export class Rf01PostgresServiceStateRepository {
  constructor({ query }) {
    if (typeof query !== "function") throw new TypeError("INVALID_QUERY");
    this.query = query;
  }

  async getByServiceId(serviceId) {
    if (!safeId(serviceId)) throw new TypeError("INVALID_SERVICE_ID");
    const result = await this.query("SELECT * FROM reviewflow_operational.service_state WHERE service_id=$1", [serviceId]);
    return result?.rows?.[0] ? fromRow(result.rows[0]) : null;
  }

  async create(value) {
    const state = createRf01ServiceState(value);
    if (state.version !== 1) throw new TypeError("INITIAL_VERSION_MUST_BE_ONE");
    const result = await this.query(
      `INSERT INTO reviewflow_operational.service_state
       (service_id,customer_name,phone_e164,appointment_at,review_link,status,operation_phase,request_sent_at,review_confirmed_at,reminder_sent_at,thanks_sent_at,completed_at,completion_reason,error_code,version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (service_id) DO NOTHING RETURNING *`,
      params(state, false),
    );
    const row = result?.rows?.[0];
    if (row) return { applied: true, current: fromRow(row) };
    const existing = await this.getByServiceId(state.serviceId);
    return { applied: false, reason: "SERVICE_EXISTS", currentVersion: existing?.version ?? null };
  }

  async applyTransition(serviceId, expectedVersion, changes) {
    if (!safeId(serviceId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new TypeError("INVALID_TRANSITION_IDENTITY");
    const current = await this.getByServiceId(serviceId);
    if (!current) return { applied: false, reason: "SERVICE_NOT_FOUND", currentVersion: null };
    const candidate = createRf01ServiceState({ ...current, ...changes, serviceId, version: expectedVersion + 1 });
    const result = await this.query(
      `UPDATE reviewflow_operational.service_state SET
       status=$3,operation_phase=$4,request_sent_at=$5,review_confirmed_at=$6,reminder_sent_at=$7,thanks_sent_at=$8,
       completed_at=$9,completion_reason=$10,error_code=$11,version=version+1,updated_at=clock_timestamp()
       WHERE service_id=$1 AND version=$2 RETURNING *`,
      [serviceId, expectedVersion, candidate.status, candidate.operationPhase, candidate.requestSentAt,
        candidate.reviewConfirmedAt, candidate.reminderSentAt, candidate.thanksSentAt, candidate.completedAt,
        candidate.completionReason, candidate.errorCode],
    );
    const row = result?.rows?.[0];
    if (row) return { applied: true, current: fromRow(row) };
    const latest = await this.getByServiceId(serviceId);
    return { applied: false, reason: latest ? "STALE_VERSION" : "SERVICE_NOT_FOUND", currentVersion: latest?.version ?? null };
  }
}

assertRf01ServiceStateRepository(Rf01PostgresServiceStateRepository.prototype);

function params(state) {
  return [state.serviceId, state.customerName, state.phoneE164, state.appointmentAt, state.reviewLink,
    state.status, state.operationPhase, state.requestSentAt, state.reviewConfirmedAt, state.reminderSentAt,
    state.thanksSentAt, state.completedAt, state.completionReason, state.errorCode, state.version];
}
function fromRow(row) {
  return createRf01ServiceState({
    serviceId: row.service_id, customerName: row.customer_name, phoneE164: row.phone_e164,
    appointmentAt: row.appointment_at, reviewLink: row.review_link, status: row.status,
    operationPhase: row.operation_phase, requestSentAt: row.request_sent_at,
    reviewConfirmedAt: row.review_confirmed_at, reminderSentAt: row.reminder_sent_at,
    thanksSentAt: row.thanks_sent_at, completedAt: row.completed_at,
    completionReason: row.completion_reason, errorCode: row.error_code, version: Number(row.version),
  });
}
const safeId = value => typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
