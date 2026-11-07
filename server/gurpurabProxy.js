const DEFAULT_UPSTREAM = 'https://api.gurpurab.com/v1/holidays';
const REQUEST_TIMEOUT_MS = 10000;
const SUCCESS_CACHE_TTL_MS = 60 * 60 * 1000;
const EMPTY_CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();

const resolveUpstream = (baseUrl) => {
  const parsed = new URL(String(baseUrl || DEFAULT_UPSTREAM));
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'api.gurpurab.com' || parsed.username || parsed.password || parsed.port) {
    throw new Error('Gurpurab upstream must use the official HTTPS API host.');
  }
  parsed.pathname = '/v1/holidays';
  parsed.search = '';
  parsed.hash = '';
  return parsed;
};

const requestHolidayData = async ({ resource, value, fetchImpl = global.fetch, baseUrl = DEFAULT_UPSTREAM, timeoutMs = REQUEST_TIMEOUT_MS }) => {
  const endpoint = resolveUpstream(baseUrl);
  const key = `${resource}:${value}`;
  const existing = cache.get(key);
  if (existing?.data && Date.now() - existing.fetchedAt < (existing.data.holidays.length ? SUCCESS_CACHE_TTL_MS : EMPTY_CACHE_TTL_MS)) {
    return { status: 200, payload: existing.data, cached: true };
  }
  if (existing?.promise) return existing.promise;

  const url = new URL(resource === 'upcoming' ? `${endpoint.pathname}/upcoming` : endpoint.pathname, endpoint.origin);
  url.searchParams.set(resource === 'upcoming' ? 'limit' : 'year', String(value));
  const pending = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 402) {
          const fallbackPayload = {
            holidays: [],
            providerUnavailable: true,
            message: 'Gurpurab data provider is currently unavailable. Local Nanakshahi observances remain available.'
          };
          cache.set(key, { data: fallbackPayload, fetchedAt: Date.now() });
          return { status: 200, payload: fallbackPayload, cached: false };
        }
        return { status: 502, payload: { ok: false, message: 'Unable to retrieve holiday data.' } };
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.holidays)) {
        return { status: 502, payload: { ok: false, message: 'Holiday provider returned an invalid response.' } };
      }
      cache.set(key, { data: payload, fetchedAt: Date.now() });
      return { status: 200, payload, cached: false };
    } catch (error) {
      return { status: 502, payload: { ok: false, message: error?.name === 'AbortError' ? 'Holiday provider timed out.' : 'Unable to retrieve holiday data.' } };
    } finally {
      clearTimeout(timer);
    }
  })();
  cache.set(key, { promise: pending });
  const result = await pending;
  if (result.status !== 200) cache.delete(key);
  return result;
};

const handleGurpurabRequest = async (requestUrl, { fetchImpl, baseUrl, timeoutMs, method = 'GET' } = {}) => {
  const yearMatch = requestUrl.pathname === '/api/gurpurab/holidays';
  const upcomingMatch = requestUrl.pathname === '/api/gurpurab/upcoming';
  if (!yearMatch && !upcomingMatch) return null;
  if (method !== 'GET') return { status: 405, payload: { ok: false, message: 'Method not allowed.' } };

  const param = yearMatch ? 'year' : 'limit';
  const raw = requestUrl.searchParams.get(param);
  const numeric = Number(raw);
  const valid = raw != null && /^\d+$/.test(raw) && Number.isSafeInteger(numeric)
    && (yearMatch ? numeric >= 1 && numeric <= 9999 : numeric >= 1 && numeric <= 100);
  if (!valid) return { status: 400, payload: { ok: false, message: yearMatch ? 'A valid year is required.' : 'Limit must be between 1 and 100.' } };
  return requestHolidayData({ resource: yearMatch ? 'year' : 'upcoming', value: numeric, fetchImpl, baseUrl, timeoutMs });
};

module.exports = { DEFAULT_UPSTREAM, handleGurpurabRequest, requestHolidayData };
