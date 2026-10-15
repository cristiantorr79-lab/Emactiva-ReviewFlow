/* ReviewFlow — ingreso controlado desde registro_clientes.
 * Se ejecuta solo por acción explícita de menú al finalizar la atención.
 */

var RF01_REGISTER_SHEET_ = 'registro_clientes';
var RF01_SERVICES_SHEET_ = 'services';
var RF01_CONTROL_SHEET_ = 'registro_clientes_control';
var RF01_TECHNICAL_HEADERS_ = ['_rf01_intake_id','_rf01_source_fingerprint','_rf01_authorized_at','_rf01_notice_version'];
var RF01_NOTICE_VERSION_KEY_ = 'RF01_NOTICE_VERSION';
var RF01_REVIEW_LINK_KEY_ = 'RF01_REVIEW_LINK';
var RF01_VISIBLE_HEADERS_ = ['Nombre', 'País / Prefijo', 'WhatsApp', 'Autorización'];
var RF01_LEGACY_VISIBLE_HEADERS_ = ['Nombre', 'WhatsApp', 'Autorización'];
var RF01_COUNTRY_CHILE_ = 'Chile (+56)';
var RF01_COUNTRY_NANP_ = 'Estados Unidos / Canadá (+1)';
var RF01_COUNTRY_OPTIONS_ = [RF01_COUNTRY_CHILE_, RF01_COUNTRY_NANP_];
var RF01_SERVICE_HEADERS_ = ['service_id','customer_name','phone_e164','appointment_at','review_link','status','request_sent','request_sent_at','review_confirmed','review_confirmed_at','reminder_sent','reminder_sent_at','thanks_sent','thanks_sent_at','completed_at','completion_reason','operation_phase','error_code','updated_at'];
var RF01_CONTROL_HEADERS_ = ['intake_id','source_row','source_fingerprint','authorization','authorized_at','notice_version','appointment_at','service_id','state','error_code','updated_at'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('ReviewFlow')
    .addItem('Preparar ingreso controlado', 'rf01SetupClientIntake')
    .addItem('Incorporar atención seleccionada', 'rf01SubmitActiveClient')
    .addToUi();
}

function onEdit(e) {
  var range = e && e.range;
  if (!range || range.getSheet().getName() !== RF01_REGISTER_SHEET_ || range.getRow() < 2) return;
  if (range.getColumn() !== 1 && range.getColumn() !== 3) return;
  var countryCell = range.getSheet().getRange(range.getRow(), 2);
  if (!countryCell.getDisplayValue()) countryCell.setValue(RF01_COUNTRY_CHILE_);
}

function rf01SetupClientIntake() {
  var spreadsheet = SpreadsheetApp.getActive();
  var register = rf01RequiredSheet_(spreadsheet, RF01_REGISTER_SHEET_);
  var services = rf01RequiredSheet_(spreadsheet, RF01_SERVICES_SHEET_);
  rf01MigrateRegisterLayout_(register);
  rf01RequireHeaders_(register, RF01_VISIBLE_HEADERS_);
  rf01RequireHeaders_(services, RF01_SERVICE_HEADERS_);

  register.getRange(1, 5, 1, RF01_TECHNICAL_HEADERS_.length).setValues([RF01_TECHNICAL_HEADERS_]);
  register.hideColumns(5, RF01_TECHNICAL_HEADERS_.length);
  register.getRange(1, 5, register.getMaxRows(), RF01_TECHNICAL_HEADERS_.length).protect().setDescription('ReviewFlow protected intake evidence');
  var countryRange = register.getRange(2, 2, register.getMaxRows() - 1, 1);
  countryRange.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(RF01_COUNTRY_OPTIONS_, true).setAllowInvalid(false).build());
  register.getRange(2, 3, register.getMaxRows() - 1, 1).setNumberFormat('@');
  var usedRows = Math.max(0, register.getLastRow() - 1);
  if (usedRows) {
    var countries = register.getRange(2, 2, usedRows, 1).getDisplayValues();
    var phones = register.getRange(2, 3, usedRows, 1).getDisplayValues();
    for (var i = 0; i < usedRows; i++) if (!countries[i][0] && (register.getRange(i + 2, 1).getDisplayValue() || phones[i][0])) countries[i][0] = RF01_COUNTRY_CHILE_;
    register.getRange(2, 2, usedRows, 1).setValues(countries);
  }

  var control = spreadsheet.getSheetByName(RF01_CONTROL_SHEET_) || spreadsheet.insertSheet(RF01_CONTROL_SHEET_);
  control.getRange(1, 1, 1, RF01_CONTROL_HEADERS_.length).setValues([RF01_CONTROL_HEADERS_]);
  control.hideSheet();
  control.protect().setDescription('ReviewFlow authorization evidence and intake recovery');
  SpreadsheetApp.getActive().toast('Configuración preparada; complete las propiedades antes de incorporar.', 'ReviewFlow');
}

function rf01SubmitActiveClient() {
  var spreadsheet = SpreadsheetApp.getActive();
  var activeSheet = spreadsheet.getActiveSheet();
  var activeRange = spreadsheet.getActiveRange();
  if (!activeSheet || activeSheet.getName() !== RF01_REGISTER_SHEET_ || !activeRange || activeRange.getRow() < 2) {
    SpreadsheetApp.getUi().alert('Seleccione una fila de datos en registro_clientes.');
    return;
  }
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) {
    SpreadsheetApp.getUi().alert('ReviewFlow está procesando otro ingreso. Intente nuevamente.');
    return;
  }
  try {
    var properties = PropertiesService.getScriptProperties();
    var config = {
      noticeVersion: properties.getProperty(RF01_NOTICE_VERSION_KEY_),
      reviewLink: properties.getProperty(RF01_REVIEW_LINK_KEY_)
    };
    var repository = rf01SpreadsheetRepository_(spreadsheet);
    var result = rf01ProcessIntake_(activeRange.getRow(), repository, config, new Date().toISOString());
    SpreadsheetApp.getActive().toast(result.code, result.ok ? 'ReviewFlow PASS' : 'ReviewFlow bloqueado');
  } catch (error) {
    SpreadsheetApp.getUi().alert('Ingreso bloqueado por error interno. No reintente cambiando la fila; contacte al responsable.');
  } finally {
    lock.releaseLock();
  }
}

function rf01ProcessIntake_(rowNumber, repository, config, nowIso) {
  try {
    if (!Number.isInteger(rowNumber) || rowNumber < 2) return rf01Result_(false, 'SOURCE_ROW_INVALID');
    if (!rf01ValidTimestamp_(nowIso)) return rf01Result_(false, 'CLOCK_INVALID');
    if (!config || typeof config.noticeVersion !== 'string' || !config.noticeVersion.trim()) return rf01Result_(false, 'NOTICE_VERSION_MISSING');
    if (!rf01ValidHttps_(config.reviewLink)) return rf01Result_(false, 'REVIEW_LINK_INVALID');

    var source = repository.readSource(rowNumber);
    var name = typeof source.name === 'string' ? source.name.trim() : '';
    var phoneResult = rf01NormalizePhone_(source.country, source.phone, source.phoneIsFormula);
    var phone = phoneResult.phone_e164 || '';
    var authorization = typeof source.authorization === 'string' ? source.authorization.trim().toUpperCase() : '';
    var intakeId = typeof source.intakeId === 'string' ? source.intakeId.trim() : '';

    if (intakeId) {
      var existing = repository.findControl(intakeId);
      var currentFingerprint = name && phoneResult.ok ? repository.fingerprint(name, phone) : '';
      if (!name || !phoneResult.ok || authorization !== 'SI') {
        return rf01Result_(false, 'SOURCE_CHANGED_AFTER_SUBMISSION');
      }
      if (!existing) {
        if (currentFingerprint !== source.sourceFingerprint || !rf01ValidTimestamp_(source.authorizedAt) ||
            source.noticeVersion !== config.noticeVersion.trim()) return rf01Result_(false, 'CONTROL_RECORD_MISSING');
        existing = rf01Control_(intakeId, rowNumber, currentFingerprint, source.authorizedAt, source.noticeVersion);
        repository.createControl(existing);
        return rf01Resume_(existing, repository, config.reviewLink, { name: name, phone: phone });
      }
      if (currentFingerprint !== existing.source_fingerprint) return rf01Result_(false, 'SOURCE_CHANGED_AFTER_SUBMISSION');
      return rf01Resume_(existing, repository, config.reviewLink);
    }

    if (authorization !== 'SI') return rf01Result_(true, 'SKIPPED_NOT_AUTHORIZED');
    if (!name) return rf01Result_(false, 'NAME_INVALID');
    if (!phoneResult.ok) return rf01Result_(false, phoneResult.code);

    var fingerprint = repository.fingerprint(name, phone);
    intakeId = repository.assignIntake(rowNumber, fingerprint, nowIso, config.noticeVersion.trim());
    var control = rf01Control_(intakeId, rowNumber, fingerprint, nowIso, config.noticeVersion.trim());
    repository.createControl(control);
    return rf01Resume_(control, repository, config.reviewLink, { name: name, phone: phone });
  } catch (error) {
    return rf01Result_(false, 'INTAKE_UNCERTAIN');
  }
}

function rf01Resume_(control, repository, reviewLink, source) {
  try {
    var existingService = repository.findService(control.service_id);
    if (existingService) {
      if (!repository.serviceMatches(existingService, control)) return rf01Result_(false, 'SERVICE_ID_COLLISION');
      var wasComplete = control.state === 'complete';
      repository.completeControl(control.intake_id, control.updated_at);
      return rf01Result_(true, wasComplete ? 'ALREADY_IMPORTED' : 'RECOVERED_COMPLETE', control.service_id);
    }
    if (!source) return rf01Result_(false, 'SERVICE_MISSING_REQUIRES_REVIEW');
    var service = rf01InitialService_(control.service_id, source.name, source.phone, control.appointment_at, reviewLink);
    repository.appendService(service);
    repository.completeControl(control.intake_id, control.updated_at);
    return rf01Result_(true, 'IMPORTED', control.service_id);
  } catch (error) {
    try { repository.failControl(control.intake_id, 'SERVICE_WRITE_UNCERTAIN', control.updated_at); } catch (ignored) {}
    return rf01Result_(false, 'SERVICE_WRITE_UNCERTAIN');
  }
}

function rf01InitialService_(serviceId, name, phone, appointmentAt, reviewLink) {
  return {
    service_id: serviceId, customer_name: name, phone_e164: phone, appointment_at: appointmentAt,
    review_link: reviewLink, status: 'pending', request_sent: false, request_sent_at: '',
    review_confirmed: false, review_confirmed_at: '', reminder_sent: false, reminder_sent_at: '',
    thanks_sent: false, thanks_sent_at: '', completed_at: '', completion_reason: '',
    operation_phase: 'idle', error_code: '', updated_at: appointmentAt
  };
}

function rf01Control_(intakeId, rowNumber, fingerprint, authorizedAt, noticeVersion) {
  return { intake_id: intakeId, source_row: rowNumber, source_fingerprint: fingerprint, authorization: 'SI',
    authorized_at: authorizedAt, notice_version: noticeVersion, appointment_at: authorizedAt,
    service_id: 'svc_' + intakeId.replace(/[^A-Za-z0-9]/g, ''), state: 'prepared', error_code: '', updated_at: authorizedAt };
}

function rf01SpreadsheetRepository_(spreadsheet) {
  var register = rf01RequiredSheet_(spreadsheet, RF01_REGISTER_SHEET_);
  var services = rf01RequiredSheet_(spreadsheet, RF01_SERVICES_SHEET_);
  var control = rf01RequiredSheet_(spreadsheet, RF01_CONTROL_SHEET_);
  rf01RequireHeaders_(register, RF01_VISIBLE_HEADERS_.concat(RF01_TECHNICAL_HEADERS_));
  rf01RequireHeaders_(services, RF01_SERVICE_HEADERS_);
  rf01RequireHeaders_(control, RF01_CONTROL_HEADERS_);
  return {
    readSource: function (row) { var v = register.getRange(row, 1, 1, 8).getDisplayValues()[0]; var formula = register.getRange(row, 3).getFormula(); return { name: v[0], country: v[1], phone: v[2], authorization: v[3], intakeId: v[4], sourceFingerprint: v[5], authorizedAt: v[6], noticeVersion: v[7], phoneIsFormula: Boolean(formula) }; },
    assignIntake: function (row, fingerprint, authorizedAt, noticeVersion) { var id = Utilities.getUuid(); register.getRange(row, 5, 1, 4).setValues([[id, fingerprint, authorizedAt, noticeVersion]]); SpreadsheetApp.flush(); return id; },
    fingerprint: function (name, phone) { return rf01Fingerprint_(name, phone); },
    findControl: function (id) { return rf01FindObject_(control, RF01_CONTROL_HEADERS_, 'intake_id', id); },
    createControl: function (item) { if (rf01FindObject_(control, RF01_CONTROL_HEADERS_, 'intake_id', item.intake_id)) throw new Error('CONTROL_DUPLICATE'); rf01AppendObject_(control, RF01_CONTROL_HEADERS_, item); SpreadsheetApp.flush(); },
    findService: function (id) { return rf01FindObject_(services, RF01_SERVICE_HEADERS_, 'service_id', id); },
    serviceMatches: function (service, evidence) { return service.service_id === evidence.service_id && service.appointment_at === evidence.appointment_at; },
    appendService: function (item) { if (rf01FindObject_(services, RF01_SERVICE_HEADERS_, 'service_id', item.service_id)) throw new Error('SERVICE_DUPLICATE'); rf01AppendService_(services, RF01_SERVICE_HEADERS_, item); SpreadsheetApp.flush(); },
    completeControl: function (id, at) { rf01UpdateControl_(control, id, 'complete', '', at); },
    failControl: function (id, code, at) { rf01UpdateControl_(control, id, 'error', code, at); }
  };
}

function rf01FindObject_(sheet, headers, key, value) {
  var rows = sheet.getLastRow();
  if (rows < 2) return null;
  var values = sheet.getRange(2, 1, rows - 1, headers.length).getValues();
  var index = headers.indexOf(key);
  var matches = values.filter(function (row) { return String(row[index]) === String(value); });
  if (matches.length > 1) throw new Error('DUPLICATE_TECHNICAL_ID');
  if (!matches.length) return null;
  var result = {};
  headers.forEach(function (header, i) { result[header] = matches[0][i] instanceof Date ? matches[0][i].toISOString() : matches[0][i]; });
  return result;
}

function rf01AppendObject_(sheet, headers, item) {
  sheet.appendRow(headers.map(function (header) { return Object.prototype.hasOwnProperty.call(item, header) ? item[header] : ''; }));
}

function rf01AppendService_(sheet, headers, item) {
  var phoneIndex = headers.indexOf('phone_e164');
  if (phoneIndex < 0 || typeof item.phone_e164 !== 'string' || !/^\+[1-9]\d{7,14}$/.test(item.phone_e164)) throw new Error('SERVICE_PHONE_INVALID');
  var row = sheet.getLastRow() + 1;
  var values = headers.map(function (header) { return Object.prototype.hasOwnProperty.call(item, header) ? item[header] : ''; });
  values[phoneIndex] = "'" + item.phone_e164;
  sheet.getRange(row, phoneIndex + 1).setNumberFormat('@');
  sheet.getRange(row, 1, 1, headers.length).setValues([values]);
}

function rf01UpdateControl_(sheet, id, state, errorCode, at) {
  var rows = sheet.getLastRow();
  var ids = rows < 2 ? [] : sheet.getRange(2, 1, rows - 1, 1).getValues();
  var matches = [];
  ids.forEach(function (row, index) { if (String(row[0]) === String(id)) matches.push(index + 2); });
  if (matches.length !== 1) throw new Error('CONTROL_NOT_UNIQUE');
  sheet.getRange(matches[0], RF01_CONTROL_HEADERS_.indexOf('state') + 1).setValue(state);
  sheet.getRange(matches[0], RF01_CONTROL_HEADERS_.indexOf('error_code') + 1).setValue(errorCode);
  sheet.getRange(matches[0], RF01_CONTROL_HEADERS_.indexOf('updated_at') + 1).setValue(at);
  SpreadsheetApp.flush();
}

function rf01Fingerprint_(name, phone) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, name + '\n' + phone, Utilities.Charset.UTF_8);
  return bytes.map(function (value) { var hex = (value < 0 ? value + 256 : value).toString(16); return hex.length === 1 ? '0' + hex : hex; }).join('');
}

function rf01NormalizePhone_(country, nationalNumber, isFormula) {
  if (isFormula) return { ok: false, code: 'PHONE_FORMULA_NOT_ALLOWED' };
  var selected = typeof country === 'string' ? country.trim() : '';
  var national = typeof nationalNumber === 'string' ? nationalNumber.trim() : '';
  if (!/^\d+$/.test(national)) return { ok: false, code: 'PHONE_INVALID' };
  if (selected === RF01_COUNTRY_CHILE_ && /^9\d{8}$/.test(national)) return { ok: true, phone_e164: '+56' + national };
  if (selected === RF01_COUNTRY_NANP_ && /^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return { ok: true, phone_e164: '+1' + national };
  return { ok: false, code: RF01_COUNTRY_OPTIONS_.indexOf(selected) < 0 ? 'COUNTRY_UNSUPPORTED' : 'PHONE_INVALID' };
}

function rf01MigrateRegisterLayout_(sheet) {
  var current = sheet.getRange(1, 1, 1, 8).getDisplayValues()[0];
  if (JSON.stringify(current) === JSON.stringify(RF01_VISIBLE_HEADERS_.concat(RF01_TECHNICAL_HEADERS_))) return;
  var legacy = current.slice(0, 7);
  if (JSON.stringify(legacy) !== JSON.stringify(RF01_LEGACY_VISIBLE_HEADERS_.concat(RF01_TECHNICAL_HEADERS_))) throw new Error('REGISTER_LAYOUT_INCOMPATIBLE');
  var rows = Math.max(0, sheet.getLastRow() - 1);
  var technicalBefore = rows ? sheet.getRange(2, 4, rows, 4).getDisplayValues() : [];
  sheet.insertColumnBefore(2);
  sheet.getRange(1, 2).setValue('País / Prefijo');
  if (rows) {
    var migrated = sheet.getRange(2, 1, rows, 8).getDisplayValues();
    for (var i = 0; i < migrated.length; i++) {
      var converted = rf01MigratePhoneValue_(migrated[i][2]);
      if (converted) {
        sheet.getRange(i + 2, 2).setValue(converted.country);
        sheet.getRange(i + 2, 3).setValue(converted.national);
      }
    }
    var technicalAfter = sheet.getRange(2, 5, rows, 4).getDisplayValues();
    if (JSON.stringify(technicalBefore) !== JSON.stringify(technicalAfter)) throw new Error('TECHNICAL_METADATA_MOVED_UNSAFELY');
  }
}

function rf01MigratePhoneValue_(value) {
  var phone = typeof value === 'string' ? value.trim() : '';
  if (/^\+569\d{8}$/.test(phone)) return { country: RF01_COUNTRY_CHILE_, national: phone.slice(3) };
  if (/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return { country: RF01_COUNTRY_NANP_, national: phone.slice(2) };
  return null;
}

function rf01RequiredSheet_(spreadsheet, name) { var sheet = spreadsheet.getSheetByName(name); if (!sheet) throw new Error('SHEET_MISSING'); return sheet; }
function rf01RequireHeaders_(sheet, expected) { var actual = sheet.getRange(1, 1, 1, expected.length).getDisplayValues()[0]; if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('HEADERS_INVALID'); }
function rf01ValidTimestamp_(value) { var date = new Date(value); return typeof value === 'string' && !Number.isNaN(date.getTime()) && /[zZ]|[+-]\d\d:\d\d$/.test(value); }
function rf01ValidHttps_(value) { return typeof value === 'string' && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/.test(value); }
function rf01Result_(ok, code, serviceId) { var result = { ok: ok, code: code }; if (serviceId) result.service_id = serviceId; return result; }
