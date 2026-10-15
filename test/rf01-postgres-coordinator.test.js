import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { Rf01PostgresCoordinator } from "../src/rf01-postgres-coordinator.js";

class FakeDatabase {
  constructor() { this.lock = null; this.generation = 0; this.operations = new Map(); this.nextId = 1; this.fail = false; this.failRelease = false; this.forceOwnerMismatch = false; }
  connect = async () => { if (this.fail) throw new Error("synthetic postgres failure"); this.lastClient = new FakeClient(this); return this.lastClient; };
}

class FakeClient {
  constructor(db) { this.db = db; this.backend = Symbol("backend"); this.owner = null; this.generation = null; }
  async query(sql, params) {
    if (this.db.fail) throw new Error("synthetic postgres failure");
    const name = sql.match(/reviewflow_coordinator\.([a-z_]+)/)?.[1];
    const row = this[name](...params);
    return { rows: [row] };
  }
  acquire_run(owner) {
    if (this.db.lock) return { allowed: false, reason: "RUN_ALREADY_ACTIVE" };
    this.db.lock = this.backend; this.owner = owner; this.generation = ++this.db.generation;
    return { allowed: true, generation: this.generation, reason: null };
  }
  release_run(owner, generation) {
    if (this.db.failRelease) return { released: false, reason: "SYNTHETIC_RELEASE_FAILURE" };
    if (!this.current(owner, generation)) return { released: false, reason: "OWNER_MISMATCH" };
    this.db.lock = null; return { released: true, reason: null };
  }
  reserve_operation(owner, generation, serviceId, kind, operationRef) {
    if (!this.current(owner, generation)) return { allowed: false, reason: "OWNER_MISMATCH" };
    const key = `${serviceId}:${kind}`;
    if (this.db.operations.has(key)) { const op = this.db.operations.get(key); return { allowed: false, operation_id: op.id, state: op.state, reason: "IDEMPOTENCY_KEY_EXISTS" }; }
    const op = { id: this.db.nextId++, key, operationRef, state: "prepared", owner, generation, attempts: 0 };
    this.db.operations.set(key, op); return { allowed: true, operation_id: op.id, state: op.state, reason: null };
  }
  start_send(owner, generation, id) {
    const op = this.find(id); if (!this.current(owner, generation) || this.db.forceOwnerMismatch) { this.db.forceOwnerMismatch = false; return { allowed: false, state: op?.state, reason: "OWNER_MISMATCH" }; }
    if (!op || op.state !== "prepared" || op.owner !== owner || op.generation !== generation) return { allowed: false, state: op?.state, reason: "STATE_OR_OWNER_MISMATCH" };
    op.state = "sending"; op.attempts++; return { allowed: true, state: op.state, reason: null };
  }
  record_result(owner, generation, id, status) {
    const op = this.find(id); if (!this.current(owner, generation) || !op || op.state !== "sending") return { allowed: false, state: op?.state, reason: "STATE_OR_OWNER_MISMATCH" };
    op.state = status; return { allowed: true, state: op.state, reason: null };
  }
  reconcile_operation(owner, generation, id, outcome) {
    const op = this.find(id); if (!this.current(owner, generation) || !op || !["prepared","sending","ambiguous"].includes(op.state)) return { allowed: false, state: op?.state, reason: "STATE_NOT_RECONCILABLE" };
    op.state = `reconciled_${outcome}`; return { allowed: true, state: op.state, reason: null };
  }
  current(owner, generation) { return this.db.lock === this.backend && this.owner === owner && this.generation === Number(generation); }
  find(id) { return [...this.db.operations.values()].find(op => op.id === Number(id)); }
  async release(error) { if (error) this.destroyed = true; if (this.db.lock === this.backend) this.db.lock = null; }
}

const operation = (serviceId = "service-1", operationKind = "request") => ({ serviceId, operationKind, operationRef: `rf01:${serviceId}:${operationKind}` });

test("first run and operation are authorized; concurrent run is blocked", async () => {
  const db = new FakeDatabase(); const coordinator = new Rf01PostgresCoordinator({ connect: db.connect });
  let release; const hold = new Promise(resolve => { release = resolve; });
  const first = coordinator.withExclusiveRun("execution-1", async session => { const reserved = await session.reserve(operation()); await hold; return reserved; });
  await new Promise(resolve => setImmediate(resolve));
  const second = await coordinator.withExclusiveRun("execution-2", async () => ({ allowed: true }));
  assert.equal(second.allowed, false); assert.equal(second.reason, "RUN_ALREADY_ACTIVE");
  release(); assert.equal((await first).allowed, true);
});

test("same idempotency key is blocked while different operation kinds remain independent", async () => {
  const db = new FakeDatabase(); const coordinator = new Rf01PostgresCoordinator({ connect: db.connect });
  await coordinator.withExclusiveRun("execution-1", session => session.reserve(operation()));
  const duplicate = await coordinator.withExclusiveRun("execution-2", session => session.reserve(operation()));
  const reminder = await coordinator.withExclusiveRun("execution-3", session => session.reserve(operation("service-1", "reminder")));
  assert.equal(duplicate.reason, "IDEMPOTENCY_KEY_EXISTS"); assert.equal(reminder.allowed, true);
});

test("interruptions before and after send start block automatic retry", async () => {
  const db = new FakeDatabase(); const coordinator = new Rf01PostgresCoordinator({ connect: db.connect });
  const prepared = await coordinator.withExclusiveRun("execution-1", session => session.reserve(operation("service-prepared")));
  const blockedPrepared = await coordinator.withExclusiveRun("execution-2", session => session.reserve(operation("service-prepared")));
  const sending = await coordinator.withExclusiveRun("execution-3", async session => { const reserved = await session.reserve(operation("service-sending")); return session.startSend(reserved.operation_id); });
  const blockedSending = await coordinator.withExclusiveRun("execution-4", session => session.reserve(operation("service-sending")));
  assert.equal(prepared.state, "prepared"); assert.equal(blockedPrepared.state, "prepared");
  assert.equal(sending.state, "sending"); assert.equal(blockedSending.state, "sending");
});

test("timeout becomes ambiguous, wrong owner is denied, and reconciliation never resends", async () => {
  const db = new FakeDatabase(); const coordinator = new Rf01PostgresCoordinator({ connect: db.connect });
  const ambiguous = await coordinator.withExclusiveRun("execution-1", async session => { const reserved = await session.reserve(operation("service-ambiguous")); await session.startSend(reserved.operation_id); return session.recordResult(reserved.operation_id, { status: "ambiguous", resultCode: "WA_TIMEOUT" }); });
  assert.equal(ambiguous.state, "ambiguous");
  db.forceOwnerMismatch = true;
  const wrong = await coordinator.withExclusiveRun("execution-2", async session => { const reserved = await session.reserve(operation("service-owner")); return session.startSend(reserved.operation_id); });
  assert.equal(wrong.reason, "OWNER_MISMATCH");
  const reconciled = await coordinator.withExclusiveRun("execution-3", async session => { const existing = db.operations.get("service-ambiguous:request"); return session.reconcile(existing.id, { outcome: "rejected", reasonCode: "PROVIDER_NOT_ACCEPTED" }); });
  const retry = await coordinator.withExclusiveRun("execution-4", session => session.reserve(operation("service-ambiguous")));
  assert.equal(reconciled.state, "reconciled_rejected"); assert.equal(retry.reason, "IDEMPOTENCY_KEY_EXISTS");
  assert.equal(db.operations.get("service-ambiguous:request").attempts, 1);
});

test("PostgreSQL failure denies safely", async () => {
  const db = new FakeDatabase(); db.fail = true;
  const result = await new Rf01PostgresCoordinator({ connect: db.connect }).withExclusiveRun("execution-1", async () => ({ allowed: true }));
  assert.deepEqual(result, { allowed: false, reason: "COORDINATOR_UNAVAILABLE" });
});

test("release failure denies result and destroys pooled session", async () => {
  const db = new FakeDatabase(); db.failRelease = true;
  const result = await new Rf01PostgresCoordinator({ connect: db.connect }).withExclusiveRun("execution-1", async () => ({ allowed: true }));
  assert.equal(result.reason, "COORDINATOR_RELEASE_FAILED"); assert.equal(db.lastClient.destroyed, true);
});

test("migration and interface contain no secrets, phones, customer data, or payload logging", async () => {
  const sql = await readFile(new URL("../db/migrations/006_rf001_t01_operation_coordinator.sql", import.meta.url), "utf8");
  const correction = await readFile(new URL("../db/migrations/007_rf001_t01_qualify_operation_state.sql", import.meta.url), "utf8");
  const source = await readFile(new URL("../src/rf01-postgres-coordinator.js", import.meta.url), "utf8");
  assert.match(sql, /UNIQUE \(service_id, operation_kind\)/);
  assert.match(sql, /pg_try_advisory_lock/); assert.match(sql, /owner_backend_pid = pg_backend_pid\(\)/);
  for (const migration of [sql, correction]) {
    assert.doesNotMatch(migration, /AND state = '(?:prepared|sending)'/);
    assert.doesNotMatch(migration, /SELECT state INTO v_previous/);
    assert.doesNotMatch(migration, /WHERE operation_id = p_operation_id/);
    assert.match(migration, /o\.state = 'prepared'/);
    assert.match(migration, /o\.state = 'sending'/);
    assert.match(migration, /SELECT o\.state INTO v_previous/);
  }
  assert.doesNotMatch(sql + correction + source, /phone_e164|customer_name|review_link|access[_-]?token|console\.|Logger\./i);
});
