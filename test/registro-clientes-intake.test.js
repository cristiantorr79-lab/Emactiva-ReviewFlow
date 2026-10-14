import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../apps-script/registro-clientes/Code.gs', import.meta.url), 'utf8');
const context = { Date, JSON, Number, Boolean, String, RegExp, Error, Object };
vm.runInNewContext(source, context);

const now = '2026-10-12T15:30:00.000Z';
const config = { noticeVersion: 'privacy-notice-v1', reviewLink: 'https://example.test/review' };

function repository(rows, options = {}) {
  const controls = new Map();
  const services = new Map();
  let sequence = 0;
  return {
    controls, services,
    readSource(row) { return rows.get(row); },
    assignIntake(row, fingerprint, authorizedAt, noticeVersion) { const id = `intake-${++sequence}`; Object.assign(rows.get(row), { intakeId: id, sourceFingerprint: fingerprint, authorizedAt, noticeVersion }); return id; },
    fingerprint(name, phone) { return createHash('sha256').update(`${name}\n${phone}`).digest('hex'); },
    findControl(id) { return controls.get(id) ?? null; },
    createControl(item) { if (options.failControlOnce) { options.failControlOnce = false; throw new Error('synthetic control failure'); } controls.set(item.intake_id, { ...item }); },
    findService(id) { return services.get(id) ?? null; },
    serviceMatches(service, evidence) { return service.service_id === evidence.service_id && service.appointment_at === evidence.appointment_at; },
    appendService(item) { services.set(item.service_id, { ...item }); if (options.failAfterAppend) { options.failAfterAppend = false; throw new Error('synthetic uncertain append'); } },
    completeControl(id, at) { const item = controls.get(id); item.state = 'complete'; item.error_code = ''; item.updated_at = at; },
    failControl(id, code, at) { const item = controls.get(id); item.state = 'error'; item.error_code = code; item.updated_at = at; }
  };
}

function validRow(overrides = {}) { return { name: 'Cliente Sintético', country: 'Chile (+56)', phone: '912345678', authorization: 'SI', intakeId: '', phoneIsFormula: false, ...overrides }; }

test('authorized complete row creates exact initial service and evidence', () => {
  const rows = new Map([[2, validRow()]]); const repo = repository(rows);
  const result = context.rf01ProcessIntake_(2, repo, config, now);
  assert.equal(result.code, 'IMPORTED');
  const service = repo.services.get(result.service_id);
  assert.equal(JSON.stringify(Object.keys(service)), JSON.stringify(context.RF01_SERVICE_HEADERS_));
  assert.equal(service.status, 'pending'); assert.equal(service.operation_phase, 'idle');
  assert.equal(service.phone_e164, '+56912345678');
  assert.equal(service.appointment_at, now); assert.equal(service.updated_at, now);
  assert.equal(service.request_sent, false); assert.equal(service.review_confirmed, false);
  const evidence = [...repo.controls.values()][0];
  assert.equal(evidence.authorization, 'SI'); assert.equal(evidence.authorized_at, now);
  assert.equal(evidence.notice_version, 'privacy-notice-v1');
});

test('NO and blank authorization never create service', () => {
  for (const authorization of ['NO', '']) { const repo = repository(new Map([[2, validRow({ authorization })]])); const result = context.rf01ProcessIntake_(2, repo, config, now); assert.equal(result.code, 'SKIPPED_NOT_AUTHORIZED'); assert.equal(repo.services.size, 0); }
});

test('invalid name or phone is blocked', () => {
  assert.equal(context.rf01ProcessIntake_(2, repository(new Map([[2, validRow({ name: '' })]])), config, now).code, 'NAME_INVALID');
  assert.equal(context.rf01ProcessIntake_(2, repository(new Map([[2, validRow({ phone: 'telefono_invalido' })]])), config, now).code, 'PHONE_INVALID');
  assert.equal(context.rf01ProcessIntake_(2, repository(new Map([[2, validRow({ country: 'País no admitido (+99)' })]])), config, now).code, 'COUNTRY_UNSUPPORTED');
  assert.equal(context.rf01ProcessIntake_(2, repository(new Map([[2, validRow({ phoneIsFormula: true })]])), config, now).code, 'PHONE_FORMULA_NOT_ALLOWED');
});

test('verified Chile and NANP plans normalize to E.164', () => {
  assert.equal(context.rf01NormalizePhone_('Chile (+56)', '987654321', false).phone_e164, '+56987654321');
  assert.equal(context.rf01NormalizePhone_('Estados Unidos / Canadá (+1)', '2025550101', false).phone_e164, '+12025550101');
});

test('services writer escapes phone_e164 as literal text with exact E.164 value and no formula', () => {
  const service = context.rf01InitialService_('svc_synthetic', 'Cliente Sintético', '+56912345678', now, config.reviewLink);
  const events = []; let written; let storedPhone; let storedFormula = '';
  const sheet = {
    getLastRow() { return 1; },
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        setNumberFormat(format) { events.push({ action: 'format', row, column, rowCount, columnCount, format }); },
        setValues(values) {
          events.push({ action: 'write', row, column, rowCount, columnCount }); written = values[0];
          const input = written[context.RF01_SERVICE_HEADERS_.indexOf('phone_e164')];
          if (typeof input === 'string' && input.startsWith("'")) storedPhone = input.slice(1);
          else if (typeof input === 'string' && input.startsWith('+')) { storedPhone = Number(input.slice(1)); storedFormula = input; }
          else storedPhone = input;
        },
        getValue() { return storedPhone; },
        getFormula() { return storedFormula; }
      };
    }
  };
  context.rf01AppendService_(sheet, context.RF01_SERVICE_HEADERS_, service);
  const phoneIndex = context.RF01_SERVICE_HEADERS_.indexOf('phone_e164');
  assert.deepEqual(events[0], { action: 'format', row: 2, column: phoneIndex + 1, rowCount: 1, columnCount: 1, format: '@' });
  assert.equal(events[1].action, 'write'); assert.equal(written[phoneIndex], "'+56912345678");
  const phoneCell = sheet.getRange(2, phoneIndex + 1);
  assert.equal(phoneCell.getValue(), '+56912345678'); assert.equal(typeof phoneCell.getValue(), 'string'); assert.equal(phoneCell.getFormula(), '');
  const expected = context.RF01_SERVICE_HEADERS_.map(header => service[header]); expected[phoneIndex] = "'+56912345678";
  assert.equal(JSON.stringify(written), JSON.stringify(expected));
});

test('same row is idempotent while two rows for same customer are distinct attentions', () => {
  const rows = new Map([[2, validRow()], [3, validRow()]]); const repo = repository(rows);
  const first = context.rf01ProcessIntake_(2, repo, config, now);
  const retry = context.rf01ProcessIntake_(2, repo, config, now);
  const second = context.rf01ProcessIntake_(3, repo, config, '2026-10-12T16:00:00.000Z');
  assert.equal(retry.code, 'ALREADY_IMPORTED'); assert.equal(repo.services.size, 2);
  assert.notEqual(first.service_id, second.service_id);
});

test('post-import edit and silent NO to SI behavior are safe', () => {
  const rows = new Map([[2, validRow()]]); const repo = repository(rows);
  context.rf01ProcessIntake_(2, repo, config, now);
  rows.get(2).phone = '923456789';
  assert.equal(context.rf01ProcessIntake_(2, repo, config, now).code, 'SOURCE_CHANGED_AFTER_SUBMISSION');
  const notSubmitted = repository(new Map([[4, validRow({ authorization: 'NO' })]]));
  assert.equal(context.rf01ProcessIntake_(4, notSubmitted, config, now).code, 'SKIPPED_NOT_AUTHORIZED');
  assert.equal(notSubmitted.services.size, 0);
});

test('uncertain append is recovered without duplicate service', () => {
  const rows = new Map([[2, validRow()]]); const options = { failAfterAppend: true }; const repo = repository(rows, options);
  assert.equal(context.rf01ProcessIntake_(2, repo, config, now).code, 'SERVICE_WRITE_UNCERTAIN');
  assert.equal(repo.services.size, 1);
  const recovered = context.rf01ProcessIntake_(2, repo, config, now);
  assert.equal(recovered.code, 'RECOVERED_COMPLETE'); assert.equal(repo.services.size, 1);
});

test('partial technical-control creation recovers from protected row evidence', () => {
  const rows = new Map([[2, validRow()]]); const options = { failControlOnce: true }; const repo = repository(rows, options);
  assert.equal(context.rf01ProcessIntake_(2, repo, config, now).code, 'INTAKE_UNCERTAIN');
  assert.equal(repo.services.size, 0);
  const recovered = context.rf01ProcessIntake_(2, repo, config, '2026-10-12T15:31:00.000Z');
  assert.equal(recovered.code, 'IMPORTED'); assert.equal(repo.services.size, 1);
  const evidence = [...repo.controls.values()][0];
  assert.equal(evidence.authorized_at, now); assert.equal(evidence.notice_version, config.noticeVersion);
});

test('legacy column migration preserves incorporated metadata and converts phone', () => {
  const matrix = [
    ['Nombre','WhatsApp','Autorización','_rf01_intake_id','_rf01_source_fingerprint','_rf01_authorized_at','_rf01_notice_version'],
    ['Cliente Sintético','+12025550101','SI','intake-1','fingerprint-1',now,'privacy-notice-v1']
  ];
  const sheet = {
    getLastRow() { return matrix.length; },
    insertColumnBefore(column) { matrix.forEach(row => row.splice(column - 1, 0, '')); },
    getRange(row, column, rowCount = 1, columnCount = 1) {
      return {
        getDisplayValues() { return Array.from({ length: rowCount }, (_, r) => Array.from({ length: columnCount }, (_, c) => String(matrix[row - 1 + r]?.[column - 1 + c] ?? ''))); },
        setValue(value) { matrix[row - 1][column - 1] = value; },
        setValues(values) { values.forEach((valuesRow, r) => valuesRow.forEach((value, c) => { matrix[row - 1 + r][column - 1 + c] = value; })); }
      };
    }
  };
  context.rf01MigrateRegisterLayout_(sheet);
  assert.equal(JSON.stringify(matrix[0]), JSON.stringify(['Nombre','País / Prefijo','WhatsApp','Autorización','_rf01_intake_id','_rf01_source_fingerprint','_rf01_authorized_at','_rf01_notice_version']));
  assert.equal(matrix[1][1], 'Estados Unidos / Canadá (+1)'); assert.equal(matrix[1][2], '2025550101');
  assert.equal(JSON.stringify(matrix[1].slice(4)), JSON.stringify(['intake-1','fingerprint-1',now,'privacy-notice-v1']));
});

test('setup source protects shifted metadata and never defaults authorization', () => {
  assert.match(source, /hideColumns\(5, RF01_TECHNICAL_HEADERS_\.length\)/);
  assert.match(source, /getRange\(1, 5, register\.getMaxRows\(\), RF01_TECHNICAL_HEADERS_\.length\)\.protect\(\)/);
  assert.doesNotMatch(source, /setValue\(['"]SI['"]\)/);
  assert.match(source, /getRange\(row, phoneIndex \+ 1\)\.setNumberFormat\('@'\)/);
});
