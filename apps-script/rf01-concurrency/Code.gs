/* ReviewFlow RF-01 concurrency lease for Google Apps Script.
 * Copy this complete file to the bound Apps Script project. Do not log request data.
 */

var RF01_STATE_KEY_ = 'RF01_CONCURRENCY_STATE_V1';
var RF01_VERSION_KEY_ = 'RF01_CONCURRENCY_VERSION_V1';
var RF01_SECRET_KEY_ = 'RF01_CONCURRENCY_SHARED_SECRET';
var RF01_TTL_KEY_ = 'RF01_CONCURRENCY_TTL_MS';
var RF01_DEFAULT_TTL_MS_ = 120000;
var RF01_MAX_TTL_MS_ = 600000;

function doPost(e) {
  var response;
  try {
    var request = JSON.parse(e && e.postData && e.postData.contents || '{}');
    response = rf01Dispatch_(request, rf01GasEnvironment_());
  } catch (error) {
    response = rf01Denied_('INTERNAL_DENY');
  }
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function rf01GasEnvironment_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    now: function () { return Date.now(); },
    properties: properties,
    lock: LockService.getScriptLock()
  };
}

function rf01Dispatch_(request, environment) {
  try {
    var configuredSecret = environment.properties.getProperty(RF01_SECRET_KEY_);
    if (!configuredSecret || typeof request.secret !== 'string' || request.secret !== configuredSecret) {
      return rf01Denied_('AUTH_DENIED');
    }
    if (!environment.lock.tryLock(5000)) return rf01Denied_('LOCK_UNAVAILABLE');
    try {
      return rf01OperateLocked_(request, environment);
    } finally {
      environment.lock.releaseLock();
    }
  } catch (error) {
    return rf01Denied_('INTERNAL_DENY');
  }
}

function rf01OperateLocked_(request, environment) {
  var operation = request.operation;
  var now = Number(environment.now());
  if (!Number.isFinite(now)) return rf01Denied_('CLOCK_INVALID');
  var state = rf01ReadState_(environment.properties);

  if (operation === 'status') {
    return {
      ok: true,
      allowed: false,
      operation: 'status',
      held: Boolean(state && state.expiresAt > now),
      version: state ? state.version : null,
      expiresAt: state ? new Date(state.expiresAt).toISOString() : null
    };
  }

  if (!rf01ValidId_(request.executionId) || !rf01ValidId_(request.owner)) {
    return rf01Denied_('IDENTITY_INVALID');
  }

  if (operation === 'acquire') {
    if (state && state.expiresAt > now) return rf01Denied_('LEASE_HELD');
    var version = rf01NextVersion_(environment.properties);
    var ttl = rf01Ttl_(environment.properties);
    var acquired = { executionId: request.executionId, owner: request.owner, expiresAt: now + ttl, version: version };
    environment.properties.setProperty(RF01_STATE_KEY_, JSON.stringify(acquired));
    return rf01Granted_('acquire', acquired);
  }

  if (!state || state.expiresAt <= now) return rf01Denied_('LEASE_EXPIRED');
  if (!rf01Owns_(request, state)) return rf01Denied_('OWNER_MISMATCH');

  if (operation === 'renew') {
    state.expiresAt = now + rf01Ttl_(environment.properties);
    environment.properties.setProperty(RF01_STATE_KEY_, JSON.stringify(state));
    return rf01Granted_('renew', state);
  }
  if (operation === 'release') {
    environment.properties.deleteProperty(RF01_STATE_KEY_);
    return { ok: true, allowed: true, operation: 'release', version: state.version };
  }
  return rf01Denied_('OPERATION_INVALID');
}

function rf01ReadState_(properties) {
  var raw = properties.getProperty(RF01_STATE_KEY_);
  if (!raw) return null;
  var value = JSON.parse(raw);
  if (!rf01ValidId_(value.executionId) || !rf01ValidId_(value.owner) ||
      !Number.isSafeInteger(value.version) || value.version < 1 ||
      !Number.isFinite(value.expiresAt)) throw new Error('STATE_INVALID');
  return value;
}

function rf01NextVersion_(properties) {
  var current = Number(properties.getProperty(RF01_VERSION_KEY_) || '0');
  if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) throw new Error('VERSION_INVALID');
  var next = current + 1;
  properties.setProperty(RF01_VERSION_KEY_, String(next));
  return next;
}

function rf01Ttl_(properties) {
  var raw = properties.getProperty(RF01_TTL_KEY_);
  if (raw === null) return RF01_DEFAULT_TTL_MS_;
  var ttl = Number(raw);
  if (!Number.isFinite(ttl) || ttl < 10000 || ttl > RF01_MAX_TTL_MS_) throw new Error('TTL_INVALID');
  return ttl;
}

function rf01Owns_(request, state) {
  return request.executionId === state.executionId && request.owner === state.owner &&
    Number(request.version) === state.version;
}

function rf01ValidId_(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function rf01Granted_(operation, state) {
  return {
    ok: true,
    allowed: true,
    operation: operation,
    version: state.version,
    expiresAt: new Date(state.expiresAt).toISOString()
  };
}

function rf01Denied_(reason) {
  return { ok: false, allowed: false, reason: reason };
}
