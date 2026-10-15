import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../apps-script/rf01-concurrency/Code.gs', import.meta.url), 'utf8');

function harness({ now = 0, secret = 'synthetic-secret', lockAvailable = true, failStorage = false } = {}) {
  const values = new Map([['RF01_CONCURRENCY_SHARED_SECRET', secret], ['RF01_CONCURRENCY_TTL_MS', '10000']]);
  const properties = {
    getProperty(key) { if (failStorage) throw new Error('synthetic storage failure'); return values.has(key) ? values.get(key) : null; },
    setProperty(key, value) { if (failStorage) throw new Error('synthetic storage failure'); values.set(key, value); },
    deleteProperty(key) { if (failStorage) throw new Error('synthetic storage failure'); values.delete(key); }
  };
  const lock = { tryLock() { return lockAvailable; }, releaseLock() {} };
  const context = { Date, JSON, Number, Boolean, String, RegExp, Error };
  vm.runInNewContext(source, context);
  const environment = { properties, lock, now: () => now };
  return {
    call(operation, extra = {}) { return context.rf01Dispatch_({ secret, operation, ...extra }, environment); },
    advance(ms) { now += ms; },
    context
  };
}

const identity = { owner: 'rf01-scheduled', executionId: 'execution-1' };

test('first acquisition succeeds and simultaneous acquisition has one owner', () => {
  const h = harness();
  const first = h.call('acquire', identity);
  const second = h.call('acquire', { owner: 'rf01-scheduled', executionId: 'execution-2' });
  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.reason, 'LEASE_HELD');
});

test('only the current owner and fencing version may renew or release', () => {
  const h = harness();
  const lease = h.call('acquire', identity);
  assert.equal(h.call('renew', { ...identity, version: lease.version }).allowed, true);
  assert.equal(h.call('renew', { owner: identity.owner, executionId: 'execution-2', version: lease.version }).reason, 'OWNER_MISMATCH');
  assert.equal(h.call('release', { ...identity, version: lease.version + 1 }).reason, 'OWNER_MISMATCH');
  assert.equal(h.call('release', { ...identity, version: lease.version }).allowed, true);
});

test('expired lease is recovered with a new fencing version and old execution is rejected', () => {
  const h = harness();
  const oldLease = h.call('acquire', identity);
  h.advance(10001);
  const current = h.call('acquire', { owner: 'rf01-scheduled', executionId: 'execution-2' });
  assert.equal(current.allowed, true);
  assert.ok(current.version > oldLease.version);
  assert.equal(h.call('renew', { ...identity, version: oldLease.version }).reason, 'OWNER_MISMATCH');
  assert.equal(h.call('release', { ...identity, version: oldLease.version }).reason, 'OWNER_MISMATCH');
});

test('storage and lock failures deny safely', () => {
  assert.equal(harness({ failStorage: true }).call('acquire', identity).reason, 'INTERNAL_DENY');
  assert.equal(harness({ lockAvailable: false }).call('acquire', identity).reason, 'LOCK_UNAVAILABLE');
});

test('source has no logging, personal fixtures, or embedded production secret', () => {
  assert.doesNotMatch(source, /Logger\.|console\.|phone_e164|customer_name|\+\d{8,}/);
  assert.doesNotMatch(source, /synthetic-secret/);
  assert.match(source, /RF01_CONCURRENCY_SHARED_SECRET/);
});
