const { randomUUID, createHash } = require('node:crypto');

const VISITOR_COOKIE = 'landing_visitor';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const check = (condition, message, status) => {
  if (!condition) throw Object.assign(new Error(message), { status });
};

const storageCall = async (operation) => {
  try {
    return await operation();
  } catch {
    // Driver/storage errors are always 503, regardless of any attached status.
    throw new Error('Visitor storage is temporarily unavailable.');
  }
};

const readVisitorCookie = (header) => {
  const matches = String(header || '').split(';').map((part) => part.trim())
    .filter((part) => part.startsWith(`${VISITOR_COOKIE}=`));
  if (matches.length !== 1) return null;
  try {
    const value = decodeURIComponent(matches[0].slice(VISITOR_COOKIE.length + 1));
    return UUID_PATTERN.test(value) ? value.toLowerCase() : null;
  } catch {
    return null;
  }
};

const guardOrigin = (request, requestUrl) => {
  const headers = request.headers || {};
  check(String(headers['sec-fetch-site'] || '').toLowerCase() !== 'cross-site', 'Cross-site registration is not allowed.', 403);
  if (headers.origin !== undefined) {
    let sameHost = false;
    try {
      const origin = new URL(headers.origin);
      const host = new URL(`http://${headers.host || requestUrl.host}`);
      sameHost = ['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password
        && origin.origin === String(headers.origin) && origin.host === host.host;
    } catch { /* Malformed and opaque origins fail closed. */ }
    check(sameHost, 'Cross-site registration is not allowed.', 403);
  }
};

const createInaugurationVisitorsHandler = ({ eventsDb, parseJsonObjectBody, sendJson, production = process.env.NODE_ENV === 'production' }) => async (request, response, requestUrl) => {
  if (requestUrl.pathname !== '/api/inauguration/visitors') return false;
  response.setHeader('Cache-Control', 'no-store');
  try {
    check(['GET', 'POST'].includes(request.method), 'Method not allowed.', 405);
    if (request.method === 'POST') guardOrigin(request, requestUrl);
    check(eventsDb?.hasDatabaseConnection, 'Visitor storage is temporarily unavailable.', 503);
    let count;
    if (request.method === 'POST') {
      const settings = await storageCall(() => eventsDb.getSingleton('inauguration_settings', null));
      check(settings?.enabled === true, 'Inauguration landing page is inactive.', 403);
      const body = await parseJsonObjectBody(request, { maxBytes: 1024, allowEmpty: true });
      check(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0, 'Visitor registration accepts no body fields.', 400);
      const uuid = readVisitorCookie(request.headers?.cookie) || randomUUID();
      const hash = createHash('sha256').update(uuid).digest('hex');
      count = await storageCall(() => eventsDb.registerLandingVisitor(hash));
      check(Number.isSafeInteger(count) && count >= 0, 'Visitor storage is temporarily unavailable.', 503);
      // Only direct TLS is trusted here. Never trust client-supplied forwarded headers.
      const secure = production || request.socket?.encrypted === true;
      response.setHeader('Set-Cookie', `${VISITOR_COOKIE}=${uuid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}${secure ? '; Secure' : ''}`);
    } else {
      count = await storageCall(() => eventsDb.getLandingVisitorCount());
      check(Number.isSafeInteger(count) && count >= 0, 'Visitor storage is temporarily unavailable.', 503);
    }
    sendJson(response, 200, { ok: true, data: { count } });
  } catch (error) {
    const status = [400, 403, 405, 413].includes(error.status) ? error.status : 503;
    sendJson(response, status, { ok: false, message: status === 503 ? 'Visitor count is temporarily unavailable.' : error.message });
  }
  return true;
};

module.exports = { VISITOR_COOKIE, createInaugurationVisitorsHandler };