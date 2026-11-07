const test = require('node:test');
const assert = require('node:assert/strict');
const { handleGurpurabRequest, requestHolidayData } = require('./gurpurabProxy');

const jsonResponse = (status, payload) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });

 test('proxies valid year requests to the fixed provider and caches successful payloads', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return jsonResponse(200, { holidays: [{ id: 'chet' }] }); };
  const first = await handleGurpurabRequest(new URL('http://site.test/api/gurpurab/holidays?year=558'), { fetchImpl });
  const second = await handleGurpurabRequest(new URL('http://site.test/api/gurpurab/holidays?year=558'), { fetchImpl });
  assert.equal(first.status, 200);
  assert.deepEqual(first.payload.holidays, [{ id: 'chet' }]);
  assert.equal(second.cached, true);
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0]).origin, 'https://api.gurpurab.com');
  assert.equal(new URL(calls[0]).searchParams.get('year'), '558');
});

test('proxies upcoming requests with a bounded limit', async () => {
  let requestedUrl = '';
  const result = await handleGurpurabRequest(new URL('http://site.test/api/gurpurab/upcoming?limit=7'), {
    fetchImpl: async (url) => { requestedUrl = url; return jsonResponse(200, { holidays: [] }); }
  });
  assert.equal(result.status, 200);
  assert.equal(new URL(requestedUrl).pathname, '/v1/holidays/upcoming');
  assert.equal(new URL(requestedUrl).searchParams.get('limit'), '7');
});

test('rejects invalid years, limits, and methods without contacting provider', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return jsonResponse(200, { holidays: [] }); };
  assert.equal((await handleGurpurabRequest(new URL('http://site/api/gurpurab/holidays?year=0'), { fetchImpl })).status, 400);
  assert.equal((await handleGurpurabRequest(new URL('http://site/api/gurpurab/holidays?year=558.2'), { fetchImpl })).status, 400);
  assert.equal((await handleGurpurabRequest(new URL('http://site/api/gurpurab/upcoming?limit=101'), { fetchImpl })).status, 400);
  assert.equal((await handleGurpurabRequest(new URL('http://site/api/gurpurab/upcoming?limit=5'), { fetchImpl, method: 'POST' })).status, 405);
  assert.equal(await handleGurpurabRequest(new URL('http://site/api/other'), { fetchImpl }), null);
  assert.equal(calls, 0);
});

test('maps provider payment and service failures to useful same-origin errors', async () => {
  const payment = await handleGurpurabRequest(new URL('http://site/api/gurpurab/holidays?year=562'), { fetchImpl: async () => jsonResponse(402, {}) });
  const failed = await handleGurpurabRequest(new URL('http://site/api/gurpurab/holidays?year=563'), { fetchImpl: async () => jsonResponse(500, {}) });
  assert.equal(payment.status, 503);
  assert.match(payment.payload.message, /provider is currently unavailable/i);
  assert.equal(failed.status, 502);
});

test('rejects alternate upstream hosts and validates the upstream payload shape', async () => {
  await assert.rejects(requestHolidayData({ resource: 'year', value: 558, baseUrl: 'https://attacker.example/api' }), /official HTTPS API host/);
  const result = await handleGurpurabRequest(new URL('http://site/api/gurpurab/holidays?year=560'), { fetchImpl: async () => jsonResponse(200, { unexpected: [] }) });
  assert.equal(result.status, 502);
  assert.match(result.payload.message, /invalid response/i);
});

test('maps upstream request timeout to a same-origin gateway error', async () => {
  const result = await requestHolidayData({
    resource: 'year', value: 561, timeoutMs: 1,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
  });
  assert.equal(result.status, 502);
  assert.match(result.payload.message, /timed out/i);
});
