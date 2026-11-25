const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { VISITOR_COOKIE, createInaugurationVisitorsHandler } = require('./inaugurationVisitors');

const endpoint = '/api/inauguration/visitors';
const uuid = '11111111-1111-4111-8111-111111111111';
const hashOf = (value) => createHash('sha256').update(value).digest('hex');
const harness = ({ saved = { enabled: true }, connected = true, failure, production = false, parseFailure } = {}) => {
  const hashes = new Set();
  const calls = [];
  const dbCall = (kind) => { calls.push(kind); if (failure === kind) throw Object.assign(new Error('private SQL secret'), { status: 400 }); };
  const handler = createInaugurationVisitorsHandler({
    production,
    eventsDb: {
      hasDatabaseConnection: connected,
      getSingleton: async (resource, fallback) => { dbCall('settings'); assert.equal(resource, 'inauguration_settings'); assert.equal(fallback, null); return saved; },
      registerLandingVisitor: async (hash) => { dbCall('register'); hashes.add(hash); return hashes.size; },
      getLandingVisitorCount: async () => { dbCall('count'); return hashes.size; }
    },
    parseJsonObjectBody: async (request, options) => { calls.push('parse'); assert.deepEqual(options, { maxBytes: 1024, allowEmpty: true }); if (parseFailure) throw parseFailure; return request.body; },
    sendJson: (response, status, body) => Object.assign(response, { status, body })
  });
  return { calls, hashes, async invoke({ method = 'POST', headers = {}, body = {}, encrypted = false, pathname = endpoint } = {}) {
    const responseHeaders = {};
    const response = { setHeader: (name, value) => { responseHeaders[name] = value; } };
    const handled = await handler({ method, headers, body, socket: { encrypted } }, response, new URL(`http://localhost${pathname}`));
    return { ...response, headers: responseHeaders, handled };
  } };
};

test('first browser gets server UUID; repeat cookie refresh is idempotent and responses are aggregate only', async () => {
  const api = harness();
  const first = await api.invoke();
  assert.equal(first.status, 200);
  assert.equal(first.headers['Cache-Control'], 'no-store');
  const cookie = first.headers['Set-Cookie'].split(';')[0];
  const value = cookie.split('=')[1];
  assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(first.headers['Set-Cookie'], /; HttpOnly; SameSite=Lax; Path=\/; Max-Age=31536000$/);
  assert.deepEqual([...api.hashes], [hashOf(value)]);
  const repeat = await api.invoke({ headers: { cookie } });
  assert.equal(repeat.headers['Set-Cookie'], first.headers['Set-Cookie']);
  assert.deepEqual(repeat.body, { ok: true, data: { count: 1 } });
  assert.equal(api.hashes.size, 1);
  assert.deepEqual((await api.invoke()).body.data, { count: 2 });
});

test('malformed, duplicate, wrong-version and encoded cookies are handled safely', async () => {
  for (const value of ['bad', '%ZZ', '../x', '11111111-1111-1111-8111-111111111111', `${uuid}; ${VISITOR_COOKIE}=${uuid}`]) {
    const api = harness();
    const result = await api.invoke({ headers: { cookie: `${VISITOR_COOKIE}=${value}` } });
    assert.equal(result.status, 200);
    assert.equal(api.hashes.has(hashOf(uuid)), false);
  }
  const api = harness();
  await api.invoke({ headers: { cookie: `other=x; ${VISITOR_COOKIE}=${uuid.toUpperCase()}` } });
  assert.deepEqual([...api.hashes], [hashOf(uuid)]);
});

test('Secure uses direct trusted TLS or production, not spoofed forwarded headers or dispatcher URL', async () => {
  for (const [production, encrypted, expected] of [[false, false, false], [false, true, true], [true, false, true]]) {
    const result = await harness({ production }).invoke({ encrypted, headers: { 'x-forwarded-proto': 'https' } });
    assert.equal(result.headers['Set-Cookie'].endsWith('; Secure'), expected);
  }
});

test('GET preview reads count without settings, registration, body parsing, or cookie refresh', async () => {
  const api = harness({ saved: null });
  const result = await api.invoke({ method: 'GET', headers: { cookie: `${VISITOR_COOKIE}=${uuid}` }, body: { visitorId: uuid } });
  assert.deepEqual(result.body, { ok: true, data: { count: 0 } });
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.deepEqual(api.calls, ['count']);
});

test('registration requires persisted enabled strictly true; inactive never parses or writes', async () => {
  for (const saved of [null, {}, { enabled: false }, { enabled: 'true' }, { enabled: 1 }]) {
    const api = harness({ saved });
    const result = await api.invoke();
    assert.equal(result.status, 403);
    assert.equal(result.headers['Set-Cookie'], undefined);
    assert.deepEqual(api.calls, ['settings']);
  }
});

test('no DB and all DB failures return safe 503 with no cookie and do not handle settings route', async () => {
  for (const options of [{ connected: false }, { failure: 'settings' }, { failure: 'register' }, { failure: 'count' }]) {
    const api = harness(options);
    const result = await api.invoke({ method: options.failure === 'count' ? 'GET' : 'POST' });
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { ok: false, message: 'Visitor count is temporarily unavailable.' });
    assert.equal(result.headers['Set-Cookie'], undefined);
    assert.equal(result.headers['Cache-Control'], 'no-store');
    if (!options.connected && !options.failure) assert.deepEqual(api.calls, []);
    assert.equal((await api.invoke({ pathname: '/api/inauguration/settings' })).handled, false);
  }
});

test('cross-site, opaque and malformed origins fail before DB; Host wins over localhost dispatcher', async () => {
  for (const headers of [{ origin: 'https://evil.test', host: 'site.test' }, { origin: 'null' }, { origin: 'bad' },
    { origin: 'https://site.test:8443', host: 'site.test' }, { 'sec-fetch-site': 'cross-site' },
    { origin: 'https://site.test', host: 'site.test', 'sec-fetch-site': 'cross-site' }]) {
    const api = harness();
    assert.equal((await api.invoke({ headers })).status, 403);
    assert.deepEqual(api.calls, []);
  }
  for (const headers of [{}, { origin: 'https://site.test', host: 'site.test' }, { origin: 'http://localhost' }, { 'sec-fetch-site': 'same-origin' }]) {
    assert.equal((await harness().invoke({ headers })).status, 200);
  }
});

test('body identifiers and other body fields reject before registration; methods and parse failures are bounded', async () => {
  for (const body of [{ uuid }, { visitor_hash: hashOf(uuid) }, { count: 1 }, [], null, 'id']) {
    const api = harness();
    assert.equal((await api.invoke({ body })).status, 400);
    assert.equal(api.calls.includes('register'), false);
  }
  for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD']) {
    const api = harness();
    assert.equal((await api.invoke({ method })).status, 405);
    assert.deepEqual(api.calls, []);
  }
  assert.equal((await harness({ parseFailure: Object.assign(new Error('Too large'), { status: 413 }) }).invoke()).status, 413);
});

// Evaluate adapters with fake drivers and fake environment: no real DB module is loaded.
const loadAdapter = (engine, connected = true) => {
  const calls = [];
  const hashes = new Set();
  let failure = false;
  const query = async (sql, params) => {
    calls.push({ sql, params });
    if (failure) throw new Error('mock database failure');
    if (/^INSERT INTO landing_page_visitors/.test(sql)) hashes.add(params[0]);
    const rows = /SELECT COUNT/.test(sql) ? [{ count: String(hashes.size) }] : [];
    return engine === 'mysql' ? [rows] : { rows };
  };
  const pool = { query, execute: query };
  const module = { exports: {} };
  const env = connected ? { MYSQL_URL: 'mysql://mock', DATABASE_URL: 'postgres://mock' } : {};
  const source = fs.readFileSync(path.join(__dirname, 'db', `${engine}.js`), 'utf8');
  new vm.Script(source).runInNewContext({ module, exports: module.exports, process: { env }, console,
    require: (name) => {
      if (name === 'pg') return { Pool: function () { return pool; } };
      if (name === 'mysql2/promise') return { createPool: () => pool };
      if (name === './mysql-relational-schema') return { allTableNames: [], relationalSchemaStatements: [] };
      if (name === './mysql-relational-mirrors') return {};
      throw new Error(`Unexpected module: ${name}`);
    }
  });
  return { adapter: module.exports, calls, hashes, fail: () => { failure = true; } };
};

for (const engine of ['mysql', 'postgres']) {
  test(`${engine}: mock-only schema, concurrent atomic inserts followed by COUNT, validation and failure propagation`, async () => {
    const { adapter, calls, hashes, fail } = loadAdapter(engine);
    await adapter.ensureEventsSchema();
    const ddl = calls.filter(({ sql }) => /CREATE TABLE IF NOT EXISTS landing_page_visitors/.test(sql));
    assert.equal(ddl.length, 1);
    assert.match(ddl[0].sql, /visitor_hash CHAR\(64\) PRIMARY KEY/);
    assert.match(ddl[0].sql, /created_at .*NOT NULL DEFAULT/);
    assert.doesNotMatch(ddl[0].sql, /updated_at|payload|user_agent|\bip\b/i);
    calls.length = 0;
    const hash = hashOf(uuid);
    const results = await Promise.all(Array.from({ length: 30 }, () => adapter.registerLandingVisitor(hash)));
    assert.equal(results.every((count) => count === 1), true);
    assert.equal(hashes.size, 1);
    assert.equal(calls.slice(0, 30).every(({ sql }) => /^INSERT/.test(sql)), true);
    for (const { sql, params } of calls.filter(({ sql }) => /^INSERT/.test(sql))) {
      assert.equal(params.length, 1);
      assert.equal(params[0], hash);
      assert.match(sql, engine === 'mysql' ? /VALUES \(\?\)\s+ON DUPLICATE KEY UPDATE visitor_hash = visitor_hash/ : /VALUES \(\$1\)\s+ON CONFLICT \(visitor_hash\) DO NOTHING/);
      assert.doesNotMatch(sql, /created_at\s*=/);
    }
    assert.equal(calls.filter(({ sql }) => sql === 'SELECT COUNT(*) AS count FROM landing_page_visitors').length, 30);
    await Promise.all(Array.from({ length: 10 }, (_, i) => adapter.registerLandingVisitor(hashOf(String(i)))));
    assert.equal(await adapter.getLandingVisitorCount(), 11);
    const before = calls.length;
    for (const bad of [uuid, '', null, 'x'.repeat(64), hash.toUpperCase()]) await assert.rejects(adapter.registerLandingVisitor(bad));
    assert.equal(calls.length, before);
    fail();
    await assert.rejects(adapter.registerLandingVisitor(hash));
    await assert.rejects(adapter.getLandingVisitorCount());
    const disconnected = loadAdapter(engine, false).adapter;
    await assert.rejects(disconnected.registerLandingVisitor(hash));
    await assert.rejects(disconnected.getLandingVisitorCount());
  });
}

test('dispatcher integrates isolated visitor handler beside unchanged settings handler', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  assert.match(source, /require\('\.\/inaugurationVisitors'\)/);
  assert.match(source, /const inaugurationVisitorsHandler = createInaugurationVisitorsHandler\(\{ eventsDb, parseJsonObjectBody, sendJson \}\);/);
  assert.match(source, /if \(await inaugurationHandler\(request, response, requestUrl\)\) \{\s*return;\s*\}\s*if \(await inaugurationVisitorsHandler\(request, response, requestUrl\)\) \{\s*return;\s*\}/);
});