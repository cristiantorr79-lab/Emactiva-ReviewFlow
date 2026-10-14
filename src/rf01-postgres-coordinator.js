const safeId = value => typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value);
const kinds = new Set(["request", "reminder", "thanks"]);

export class Rf01PostgresCoordinator {
  constructor({ connect }) {
    if (typeof connect !== "function") throw new TypeError("INVALID_CONNECTOR");
    this.connect = connect;
  }

  async withExclusiveRun(executionId, work) {
    if (!safeId(executionId) || typeof work !== "function") return denied("INPUT_INVALID");
    let client;
    let generation;
    let result;
    let releaseError;
    try {
      client = await this.connect();
      const acquired = first(await client.query(
        "SELECT * FROM reviewflow_coordinator.acquire_run($1)", [executionId]
      ));
      if (!acquired?.allowed) result = denied(acquired?.reason || "RUN_NOT_ACQUIRED");
      else {
        generation = Number(acquired.generation);
        const session = new CoordinatorSession(client, executionId, generation);
        result = await work(session);
      }
    } catch {
      result = denied("COORDINATOR_UNAVAILABLE");
    } finally {
      if (client && generation) {
        try {
          const released = first(await client.query("SELECT * FROM reviewflow_coordinator.release_run($1,$2)", [executionId, generation]));
          if (!released?.released) throw new Error("RUN_RELEASE_DENIED");
        } catch (error) {
          releaseError = error;
          result = denied("COORDINATOR_RELEASE_FAILED");
        }
      }
      try { await client?.release?.(releaseError); } catch { result = denied("COORDINATOR_RELEASE_FAILED"); }
    }
    return result;
  }
}

class CoordinatorSession {
  constructor(client, executionId, generation) {
    this.client = client;
    this.executionId = executionId;
    this.generation = generation;
  }

  async reserve({ serviceId, operationKind, operationRef }) {
    if (!safeId(serviceId) || !kinds.has(operationKind) || operationRef !== `rf01:${serviceId}:${operationKind}`) return denied("OPERATION_IDENTITY_INVALID");
    return this.#call("reserve_operation", [serviceId, operationKind, operationRef]);
  }

  async prepareReminder(identity, expectedVersion) {
    return this.prepareOutgoing(identity, expectedVersion);
  }

  async prepareOutgoing(identity, expectedVersion) {
    try {
      await this.client.query("BEGIN");
      const authorization = await this.authorizeOutgoing({ serviceId: identity.serviceId, operationKind: identity.operationKind, expectedVersion });
      if (!authorization.allowed) { await this.client.query("ROLLBACK"); return authorization; }
      const reserved = await this.reserve(identity);
      if (!reserved.allowed) { await this.client.query("ROLLBACK"); return reserved; }
      await this.client.query("COMMIT");
      return { allowed: true, authorization, reserved };
    } catch {
      try { await this.client.query("ROLLBACK"); } catch {}
      return denied("COORDINATOR_UNAVAILABLE");
    }
  }

  async confirmService({ serviceId, expectedVersion, confirmedAt }) {
    if (!safeId(serviceId) || !positiveInteger(expectedVersion) || !validTimestamp(confirmedAt)) return denied("CONFIRMATION_INVALID");
    try {
      const result = await this.client.query(
        `UPDATE reviewflow_operational.service_state AS s SET
         status='confirmed',review_confirmed_at=$5,operation_phase='idle',error_code=NULL,
         version=s.version+1,updated_at=clock_timestamp()
         WHERE s.service_id=$3 AND s.version=$4 AND s.review_confirmed_at IS NULL
           AND s.request_sent_at IS NOT NULL
           AND reviewflow_coordinator.owner_is_current($1,$2)
         RETURNING s.*`,
        [this.executionId, this.generation, serviceId, Number(expectedVersion), new Date(confirmedAt).toISOString()],
      );
      const row = first(result);
      if (row) return { ...row, allowed: true, version: Number(row.version) };
      return this.#stateConflict(serviceId, "CONFIRMATION_NOT_APPLIED");
    } catch { return denied("COORDINATOR_UNAVAILABLE"); }
  }

  async authorizeReminder({ serviceId, expectedVersion }) {
    return this.authorizeOutgoing({ serviceId, operationKind: "reminder", expectedVersion });
  }

  async authorizeOutgoing({ serviceId, operationKind, expectedVersion }) {
    if (!safeId(serviceId) || !kinds.has(operationKind) || !positiveInteger(expectedVersion)) return denied("OUTGOING_AUTHORIZATION_INVALID");
    try {
      const result = await this.client.query(
        `UPDATE reviewflow_operational.service_state AS s SET
         operation_phase=$5,version=s.version+1,updated_at=clock_timestamp()
         WHERE s.service_id=$3 AND s.version=$4 AND s.operation_phase='idle'
           AND (($6='request' AND s.request_sent_at IS NULL AND s.review_confirmed_at IS NULL)
             OR ($6='reminder' AND s.request_sent_at IS NOT NULL AND s.review_confirmed_at IS NULL AND s.reminder_sent_at IS NULL)
             OR ($6='thanks' AND s.review_confirmed_at IS NOT NULL AND s.thanks_sent_at IS NULL))
           AND reviewflow_coordinator.owner_is_current($1,$2)
         RETURNING s.*`,
        [this.executionId, this.generation, serviceId, Number(expectedVersion), `${operationKind}_prepared`, operationKind],
      );
      const row = first(result);
      if (row) return { ...row, allowed: true, version: Number(row.version) };
      return this.#stateConflict(serviceId, "REMINDER_NOT_AUTHORIZED");
    } catch { return denied("COORDINATOR_UNAVAILABLE"); }
  }

  async finishReminder({ serviceId, expectedVersion, outcome }) {
    return this.finishOutgoing({ serviceId, operationKind: "reminder", expectedVersion, outcome });
  }

  async finishOutgoing({ serviceId, operationKind, expectedVersion, outcome }) {
    if (!safeId(serviceId) || !kinds.has(operationKind) || !positiveInteger(expectedVersion) || !outcome || !["accepted", "rejected", "ambiguous"].includes(outcome.status)) return denied("OUTGOING_RESULT_INVALID");
    const acceptedAt = outcome.status === "accepted" && validTimestamp(outcome.acceptedAt) ? new Date(outcome.acceptedAt).toISOString() : null;
    if (outcome.status === "accepted" && !acceptedAt) return denied("REMINDER_RESULT_INVALID");
    const status = outcome.status !== "accepted" ? operationKind === "request" ? "pending" : operationKind === "thanks" ? "confirmed" : "request_sent"
      : operationKind === "request" ? "request_sent" : "completed";
    const phase = outcome.status === "ambiguous" ? `${operationKind}_ambiguous` : "idle";
    const reason = outcome.status === "accepted" ? operationKind === "reminder" ? "reminder_finished" : operationKind === "thanks" ? "confirmed_thanked" : null : null;
    const error = outcome.status === "ambiguous" ? "WA_RESULT_AMBIGUOUS" : outcome.status === "rejected" ? "WA_SEND_FAILED" : null;
    try {
      const result = await this.client.query(
        `UPDATE reviewflow_operational.service_state AS s SET
         status=$5::text,operation_phase=$6::text,
         request_sent_at=CASE WHEN $10::text='request' AND $7::timestamptz IS NOT NULL THEN $7::timestamptz ELSE s.request_sent_at END,
         reminder_sent_at=CASE WHEN $10::text='reminder' AND $7::timestamptz IS NOT NULL THEN $7::timestamptz ELSE s.reminder_sent_at END,
         thanks_sent_at=CASE WHEN $10::text='thanks' AND $7::timestamptz IS NOT NULL THEN $7::timestamptz ELSE s.thanks_sent_at END,
         completed_at=CASE WHEN $10::text IN ('reminder','thanks') AND $7::timestamptz IS NOT NULL THEN $7::timestamptz ELSE s.completed_at END,
         completion_reason=CASE WHEN $10::text IN ('reminder','thanks') AND $7::timestamptz IS NOT NULL THEN $8::text ELSE s.completion_reason END,error_code=$9::text,
         version=s.version+1,updated_at=clock_timestamp()
         WHERE s.service_id=$3::text AND s.version=$4::bigint AND s.operation_phase=$11::text
           AND reviewflow_coordinator.owner_is_current($1,$2)
         RETURNING s.*`,
        [this.executionId, this.generation, serviceId, Number(expectedVersion), status, phase, acceptedAt, reason, error, operationKind, `${operationKind}_prepared`],
      );
      const row = first(result);
      if (row) return { ...row, allowed: true, version: Number(row.version) };
      return this.#stateConflict(serviceId, "REMINDER_RESULT_NOT_APPLIED");
    } catch { return denied("COORDINATOR_UNAVAILABLE"); }
  }

  async startSend(operationId) {
    if (!positiveInteger(operationId)) return denied("OPERATION_ID_INVALID");
    return this.#call("start_send", [operationId]);
  }

  async recordResult(operationId, { status, acceptedAt = null, providerMessageRef = null, resultCode = null }) {
    if (!positiveInteger(operationId) || !["accepted", "rejected", "ambiguous"].includes(status)) return denied("RESULT_INVALID");
    return this.#call("record_result", [operationId, status, acceptedAt, providerMessageRef, resultCode]);
  }

  async reconcile(operationId, { outcome, acceptedAt = null, providerMessageRef = null, reasonCode = null }) {
    if (!positiveInteger(operationId) || !["accepted", "rejected"].includes(outcome)) return denied("RECONCILIATION_INVALID");
    return this.#call("reconcile_operation", [operationId, outcome, acceptedAt, providerMessageRef, reasonCode]);
  }

  async #call(functionName, values) {
    try {
      const placeholders = values.map((_, index) => `$${index + 3}`).join(",");
      const row = first(await this.client.query(
        `SELECT * FROM reviewflow_coordinator.${functionName}($1,$2${placeholders ? `,${placeholders}` : ""})`,
        [this.executionId, this.generation, ...values]
      ));
      return row?.allowed ? { ...row, allowed: true } : denied(row?.reason || "TRANSITION_DENIED", row);
    } catch {
      return denied("COORDINATOR_UNAVAILABLE");
    }
  }

  async #stateConflict(serviceId, fallback) {
    try {
      const row = first(await this.client.query(
        "SELECT * FROM reviewflow_operational.service_state WHERE service_id=$1",
        [serviceId],
      ));
      if (!row) return denied("SERVICE_NOT_FOUND");
      if (!await this.#ownerCurrent()) return denied("OWNER_MISMATCH", { current_version: Number(row.version), service_state: row });
      if (row.review_confirmed_at) return denied("SERVICE_ALREADY_CONFIRMED", { current_version: Number(row.version), service_state: row });
      return denied("STALE_VERSION", { current_version: Number(row.version), service_state: row, detail: fallback });
    } catch { return denied("COORDINATOR_UNAVAILABLE"); }
  }

  async #ownerCurrent() {
    const row = first(await this.client.query("SELECT reviewflow_coordinator.owner_is_current($1,$2) AS current", [this.executionId, this.generation]));
    return row?.current === true;
  }
}

const first = result => result?.rows?.[0];
const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const validTimestamp = value => typeof value === "string" && !Number.isNaN(new Date(value).getTime());
const denied = (reason, details = {}) => ({ ...details, allowed: false, reason });
