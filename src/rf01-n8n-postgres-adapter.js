import { Rf01PostgresCoordinator } from "./rf01-postgres-coordinator.js";

const terminalStatuses = new Set(["accepted", "rejected", "ambiguous"]);
const safeCode = value => typeof value === "string" && /^[A-Z0-9_:-]{1,80}$/.test(value);
const safeProviderRef = value => value === null || value === undefined ||
  (typeof value === "string" && /^[A-Za-z0-9._:-]{1,255}$/.test(value));

// This adapter must run inside one n8n node invocation. The injected connect()
// must return one checked-out physical client; it is never serialized between nodes.
export class Rf01N8nPostgresAdapter {
  constructor({ connect }) {
    this.coordinator = new Rf01PostgresCoordinator({ connect });
  }

  async runOutgoing(identity, effects) {
    if (!validIdentity(identity) || !validEffects(effects)) return denied("INPUT_INVALID");
    return this.coordinator.withExclusiveRun(identity.executionId, async session => {
      const reserved = await session.reserve(identity);
      if (!reserved.allowed) return reserved;

      if (effects.beforeSend) {
        try {
          const checkpoint = await effects.beforeSend({ operationId: reserved.operation_id });
          if (checkpoint?.confirmed !== true) return denied("CHECKPOINT_NOT_CONFIRMED", reserved);
        } catch {
          return denied("CHECKPOINT_NOT_CONFIRMED", reserved);
        }
      }

      const started = await session.startSend(reserved.operation_id);
      if (!started.allowed) return started;

      let outcome;
      try {
        outcome = normalizeOutcome(await effects.send({ operationId: reserved.operation_id }));
      } catch {
        outcome = { status: "ambiguous", resultCode: "SEND_EXCEPTION" };
      }
      const recorded = await session.recordResult(reserved.operation_id, outcome);
      if (!recorded.allowed) return denied("RESULT_NOT_DURABLE", { operation_id: reserved.operation_id });
      return {
        allowed: outcome.status === "accepted",
        operation_id: reserved.operation_id,
        state: recorded.state,
        accepted_at: outcome.status === "accepted" ? outcome.acceptedAt : null,
        reason: outcome.status === "accepted" ? null : outcome.status === "ambiguous" ? "SEND_AMBIGUOUS" : "SEND_REJECTED",
      };
    });
  }

  async runConfirmation({ executionId, serviceId, expectedVersion, confirmedAt }) {
    if (typeof executionId !== "string" || typeof serviceId !== "string") return denied("INPUT_INVALID");
    return this.coordinator.withExclusiveRun(executionId, async session => {
      const result = await session.confirmService({ serviceId, expectedVersion, confirmedAt });
      return result.allowed ? { ...result, service_state: result } : result;
    });
  }

  async runReminder(identity, expectedVersion, effects) {
    if (identity?.operationKind !== "reminder") return denied("INPUT_INVALID");
    return this.runVersionedOutgoing(identity, expectedVersion, effects);
  }

  async runVersionedOutgoing(identity, expectedVersion, effects) {
    if (!validIdentity(identity) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1 || !validEffects(effects)) return denied("INPUT_INVALID");
    return this.coordinator.withExclusiveRun(identity.executionId, async session => {
      const prepared = await session.prepareOutgoing(identity, expectedVersion);
      if (!prepared.allowed) return prepared;
      const { authorization, reserved } = prepared;
      const started = await session.startSend(reserved.operation_id);
      if (!started.allowed) return started;
      let outcome;
      try { outcome = normalizeOutcome(await effects.send({ operationId: reserved.operation_id })); }
      catch { outcome = { status: "ambiguous", resultCode: "SEND_EXCEPTION" }; }
      const recorded = await session.recordResult(reserved.operation_id, outcome);
      if (!recorded.allowed) return denied("RESULT_NOT_DURABLE", { operation_id: reserved.operation_id });
      const state = await session.finishOutgoing({ serviceId: identity.serviceId, operationKind: identity.operationKind, expectedVersion: authorization.version, outcome });
      if (!state.allowed) return denied("SERVICE_STATE_NOT_DURABLE", { operation_id: reserved.operation_id, state: recorded.state, reason_detail: state.reason });
      return {
        allowed: outcome.status === "accepted", operation_id: reserved.operation_id, state: recorded.state,
        accepted_at: outcome.status === "accepted" ? outcome.acceptedAt : null, service_version: state.version, service_state: state,
        reason: outcome.status === "accepted" ? null : outcome.status === "ambiguous" ? "SEND_AMBIGUOUS" : "SEND_REJECTED",
      };
    });
  }
}

function validIdentity(value) {
  return value && typeof value === "object" && typeof value.executionId === "string" &&
    typeof value.serviceId === "string" && typeof value.operationKind === "string" &&
    typeof value.operationRef === "string";
}

function validEffects(value) {
  return value && typeof value === "object" && typeof value.send === "function" &&
    (value.beforeSend === undefined || typeof value.beforeSend === "function");
}

function normalizeOutcome(value) {
  if (!value || !terminalStatuses.has(value.status)) return { status: "ambiguous", resultCode: "SEND_RESULT_INVALID" };
  if (value.status === "accepted") {
    const accepted = new Date(value.acceptedAt);
    if (!value.acceptedAt || Number.isNaN(accepted.getTime()) || !safeProviderRef(value.providerMessageRef)) {
      return { status: "ambiguous", resultCode: "ACCEPTANCE_EVIDENCE_INVALID" };
    }
    return {
      status: "accepted",
      acceptedAt: accepted.toISOString(),
      providerMessageRef: value.providerMessageRef ?? null,
      resultCode: safeCode(value.resultCode) ? value.resultCode : null,
    };
  }
  return {
    status: value.status,
    acceptedAt: null,
    providerMessageRef: null,
    resultCode: safeCode(value.resultCode) ? value.resultCode : value.status === "ambiguous" ? "SEND_RESULT_AMBIGUOUS" : "SEND_REJECTED",
  };
}

const denied = (reason, details = {}) => ({ ...details, allowed: false, reason });
