const test = require('node:test');
const assert = require('node:assert/strict');
const instacartConnect = require('./instacartConnect');

const ENV_KEYS = ['INSTACART_CONNECT_ENV', 'INSTACART_CONNECT_BASE_URL', 'INSTACART_CONNECT_CLIENT_ID', 'INSTACART_CONNECT_CLIENT_SECRET', 'INSTACART_CONNECT_TOKEN_URL', 'INSTACART_CONNECT_QUOTE_URL'];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const originalFetch = global.fetch;

test.afterEach(() => {
  ENV_KEYS.forEach((key) => {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  });
  global.fetch = originalFetch;
});

test('reports unavailable without configured server-side Connect credentials', () => {
  ENV_KEYS.forEach((key) => { delete process.env[key]; });
  assert.deepEqual(instacartConnect.getReadiness(), {
    environment: 'sandbox', credentialsConfigured: false, quoteConfigured: false, available: false,
    message: 'Instacart Connect sandbox credentials and a quote endpoint are not configured yet.'
  });
});

test('uses server credentials to fetch a bounded quote and returns only store options', async () => {
  Object.assign(process.env, {
    INSTACART_CONNECT_ENV: 'sandbox',
    INSTACART_CONNECT_BASE_URL: 'https://connect.example.test',
    INSTACART_CONNECT_CLIENT_ID: 'server-client-id',
    INSTACART_CONNECT_CLIENT_SECRET: 'server-client-secret',
    INSTACART_CONNECT_TOKEN_URL: 'https://connect.example.test/token',
    INSTACART_CONNECT_QUOTE_URL: 'https://connect.example.test/quote'
  });
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return String(url).endsWith('/token')
      ? { ok: true, json: async () => ({ access_token: 'temporary-access-token' }) }
      : { ok: true, json: async () => ({ stores: [{ id: 'store-1', name: 'Nearby Market', total: '$24.00' }], secret: 'must not escape' }) };
  };
  const result = await instacartConnect.getQuote({ items: [{ itemId: 'rice', name: 'Rice', quantity: 2, unit: 'bags' }], postalCode: 'L9T 0A1' });
  assert.equal(result.available, true);
  assert.equal(result.readiness.environment, 'sandbox');
  assert.deepEqual(result.stores, [{ id: 'store-1', name: 'Nearby Market', total: '$24.00' }]);
  assert.equal(Object.hasOwn(result, 'secret'), false);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.signal instanceof AbortSignal, true);
  assert.equal(new URLSearchParams(requests[0].options.body).get('client_secret'), 'server-client-secret');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer temporary-access-token');
  assert.deepEqual(JSON.parse(requests[1].options.body), { items: [{ itemId: 'rice', name: 'Rice', quantity: 2, unit: 'bags' }], postalCode: 'L9T 0A1', environment: 'sandbox' });
});
