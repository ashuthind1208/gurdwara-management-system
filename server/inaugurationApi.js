const INAUGURATION_SETTINGS_RESOURCE = 'inauguration_settings';
const DEFAULT_INAUGURATION_SETTINGS = Object.freeze({
  enabled: false,
  backgroundColor: '#071B36',
  textColor: '#FFFFFF',
  accentColor: '#F4A300',
  logoUrl: '',
  logoSize: 180,
  headingEnglish: 'Welcome to our inauguration',
  headingPunjabi: 'ਉਦਘਾਟਨ ਸਮਾਗਮ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ',
  messageEnglish: 'A new beginning for our sangat. Join us in celebrating faith, seva, and community.',
  messagePunjabi: 'ਸੰਗਤ ਲਈ ਇੱਕ ਨਵੀਂ ਸ਼ੁਰੂਆਤ। ਆਓ ਮਿਲ ਕੇ ਸੇਵਾ ਅਤੇ ਸੰਗਤ ਦਾ ਜਸ਼ਨ ਮਨਾਈਏ।',
  buttons: Object.freeze([])
});

const check = (condition, message, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), { status });
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, field, maxLength, required = false) => {
  check(typeof value === 'string', `${field} must be a string.`);
  const trimmed = value.trim();
  check(trimmed.length <= maxLength && (!required || trimmed.length > 0), `${field} must ${required ? 'contain 1' : 'contain 0'} to ${maxLength} characters.`);
  return trimmed;
};

const safeUrl = (value, field, logo = false) => {
  const url = text(value, field, 2048, !logo);
  if (!url) return url;
  // Reject browser URL normalization tricks, including multiply encoded paths.
  let decoded = url;
  try {
    for (let index = 0; index < 5; index += 1) {
      const unsafeCharacters = /[\s\\]/u.test(decoded) || [...decoded].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
      check(!unsafeCharacters, `${field} contains unsafe characters.`);
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      check(index < 4, `${field} is excessively encoded.`);
      decoded = next;
    }
    const internal = url.startsWith('/');
    check(internal || /^https?:\/\//i.test(url), `${field} must be an HTTP(S) URL or an internal path.`);
    check(!internal || (decoded.startsWith('/') && !decoded.startsWith('//')), `${field} cannot be a protocol-relative URL.`);
    const parsed = new URL(decoded, 'https://inauguration.invalid');
    check(['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password, `${field} must not contain credentials or an unsafe scheme.`);
    const path = decoded.split(/[?#]/)[0];
    check(!path.split('/').some((part) => part === '.' || part === '..'), `${field} must not contain path traversal.`);
    if (logo && internal) check(/^\/(?:api\/)?uploads\/[^/].*/.test(path), `${field} must use /api/uploads/ or /uploads/.`);
  } catch (error) {
    if (error.status === 400) throw error;
    check(false, `${field} must be a valid, safely encoded URL.`);
  }
  return url;
};

const timestamp = (value, field) => {
  const result = text(value, field, 40);
  if (!result) return result;
  const match = result.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  check(Boolean(match), `${field} must be an ISO timestamp with a timezone or an empty string.`);
  const [, year, month, day, hour, minute, second, zone] = match;
  const leapYear = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  check(Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= days && Number(hour) <= 23 && Number(minute) <= 59 && Number(second) <= 59 && (zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) <= 59)) && Number.isFinite(Date.parse(result)), `${field} must be a valid ISO timestamp.`);
  return result;
};

// PUT is a full replacement: omitted settings use defaults, not a previous save.
const validateInaugurationSettings = (input) => {
  check(isObject(input), 'Settings must be a JSON object.');
  check(Object.keys(input).every((key) => Object.hasOwn(DEFAULT_INAUGURATION_SETTINGS, key)), 'Settings contain an unknown field.');
  const settings = { ...DEFAULT_INAUGURATION_SETTINGS, ...input };
  check(typeof settings.enabled === 'boolean', 'enabled must be a boolean.');
  for (const field of ['backgroundColor', 'textColor', 'accentColor']) {
    settings[field] = text(settings[field], field, 7, true);
    check(/^#[0-9a-f]{6}$/i.test(settings[field]), `${field} must be a six-digit hex color.`);
  }
  settings.logoUrl = safeUrl(settings.logoUrl, 'logoUrl', true);
  check(Number.isInteger(settings.logoSize) && settings.logoSize >= 80 && settings.logoSize <= 320, 'logoSize must be an integer from 80 to 320.');
  for (const field of ['headingEnglish', 'headingPunjabi']) settings[field] = text(settings[field], field, 200);
  for (const field of ['messageEnglish', 'messagePunjabi']) settings[field] = text(settings[field], field, 2000);
  check(Array.isArray(settings.buttons) && settings.buttons.length <= 12, 'buttons must be an array with at most 12 entries.');
  const ids = new Set();
  settings.buttons = settings.buttons.map((button, index) => {
    const field = `buttons[${index}]`;
    check(isObject(button), `${field} must be an object.`);
    check(Object.keys(button).every((key) => ['id', 'labelEnglish', 'labelPunjabi', 'url', 'enabled', 'availableAt'].includes(key)), `${field} contains an unknown field.`);
    const id = text(button.id, `${field}.id`, 80, true);
    check(/^[a-z0-9_-]+$/i.test(id) && !ids.has(id), `${field}.id must be unique and contain only letters, numbers, underscores or hyphens.`);
    ids.add(id);
    const enabled = Object.hasOwn(button, 'enabled') ? button.enabled : false;
    check(typeof enabled === 'boolean', `${field}.enabled must be a boolean.`);
    return {
      id,
      labelEnglish: text(button.labelEnglish, `${field}.labelEnglish`, 120, true),
      labelPunjabi: text(Object.hasOwn(button, 'labelPunjabi') ? button.labelPunjabi : '', `${field}.labelPunjabi`, 120),
      url: safeUrl(button.url, `${field}.url`),
      enabled,
      availableAt: timestamp(Object.hasOwn(button, 'availableAt') ? button.availableAt : '', `${field}.availableAt`)
    };
  });
  return settings;
};

const createInaugurationHandler = ({ eventsDb, canManageAdminPage, parseJsonObjectBody, sendJson }) => async (request, response, requestUrl) => {
  if (requestUrl.pathname !== '/api/inauguration/settings') return false;
  response.setHeader?.('Cache-Control', 'no-store');
  try {
    check(['GET', 'PUT'].includes(request.method), 'Method not allowed.', 405);
    if (request.method === 'PUT') {
      // Authorize before parsing the body or touching configuration storage.
      check(await canManageAdminPage(request, '/admin/inauguration'), 'Inauguration admin access is required.', 403);
    }
    check(eventsDb?.hasDatabaseConnection, 'Inauguration storage is temporarily unavailable.', 503);
    let settings;
    if (request.method === 'GET') {
      settings = validateInaugurationSettings(await eventsDb.getSingleton(INAUGURATION_SETTINGS_RESOURCE, null) ?? {});
    } else {
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: false });
      settings = validateInaugurationSettings(body);
      await eventsDb.setSingleton(INAUGURATION_SETTINGS_RESOURCE, settings);
    }
    sendJson(response, 200, { ok: true, data: settings });
  } catch (error) {
    // Bad persisted configuration must fail closed, not activate a broken homepage.
    const status = request.method === 'GET' ? 503 : ([400, 403, 405, 413, 503].includes(error.status) ? error.status : 503);
    sendJson(response, status, { ok: false, message: status === 503 ? 'Inauguration settings are temporarily unavailable.' : error.message });
  }
  return true;
};

module.exports = { INAUGURATION_SETTINGS_RESOURCE, DEFAULT_INAUGURATION_SETTINGS, validateInaugurationSettings, createInaugurationHandler };
