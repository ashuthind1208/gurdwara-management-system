const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createInaugurationHandler, validateInaugurationSettings, DEFAULT_INAUGURATION_SETTINGS, INAUGURATION_SETTINGS_RESOURCE } = require('./inaugurationApi');

const endpoint = '/api/inauguration/settings';
const button = (overrides = {}) => ({ id: 'welcome', labelEnglish: 'Enter website', labelPunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ', url: '/home', enabled: true, availableAt: '', ...overrides });
const harness = ({ allowed = true, connected = true, saved = null, failure, parseFailure, authFailure } = {}) => {
  const calls = [];
  let stored = saved;
  const handler = createInaugurationHandler({
    eventsDb: {
      hasDatabaseConnection: connected,
      getSingleton: async (resource, fallback) => { calls.push(['get', resource]); if (failure) throw failure; return stored ?? fallback; },
      setSingleton: async (resource, value) => { calls.push(['set', resource, value]); if (failure) throw failure; stored = structuredClone(value); return stored; }
    },
    canManageAdminPage: async (_request, page) => { calls.push(['auth', page]); if (authFailure) throw authFailure; return allowed; },
    parseJsonObjectBody: async (request, options) => { calls.push(['parse', options]); if (parseFailure) throw parseFailure; return request.body; },
    sendJson: (response, status, body) => Object.assign(response, { status, body })
  });
  return {
    calls,
    async invoke(body = {}, method = 'GET', pathname = endpoint) {
      const headers = {};
      const response = { setHeader: (name, value) => { headers[name] = value; } };
      const handled = await handler({ method, body }, response, { pathname });
      return { ...response, handled, headers };
    }
  };
};

test('public GET returns exact disabled defaults without auth, parsing, or writes', async () => {
  const api = harness({ allowed: false });
  const result = await api.invoke();
  assert.equal(result.status, 200);
  assert.equal(result.handled, true);
  assert.deepEqual(result.body, { ok: true, data: DEFAULT_INAUGURATION_SETTINGS });
  assert.equal(result.body.data.enabled, false);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.deepEqual(api.calls, [['get', 'inauguration_settings']]);
});

test('no DB and failed DB reads fail closed with 503, never initialize storage', async () => {
  for (const options of [{ connected: false }, { failure: new Error('private SQL details') }, { saved: { enabled: 'true' } }]) {
    const api = harness(options);
    const result = await api.invoke();
    assert.deepEqual(result.body, { ok: false, message: 'Inauguration settings are temporarily unavailable.' });
    assert.equal(result.status, 503);
    assert.equal(api.calls.some(([kind]) => kind === 'set'), false);
    if (options.connected === false) assert.deepEqual(api.calls, []);
  }
});

test('PUT delegates verified page permission before body parsing or persistence, even without DB', async () => {
  for (const connected of [true, false]) {
    const api = harness({ allowed: false, connected, parseFailure: new Error('Must not parse') });
    assert.equal((await api.invoke({ enabled: true }, 'PUT')).status, 403);
    assert.deepEqual(api.calls, [['auth', '/admin/inauguration']]);
  }
  const unavailable = harness({ connected: false });
  assert.equal((await unavailable.invoke({}, 'PUT')).status, 503);
  assert.deepEqual(unavailable.calls, [['auth', '/admin/inauguration']]);
  const unverified = harness({ authFailure: new Error('private auth details') });
  assert.equal((await unverified.invoke({}, 'PUT')).status, 503);
  assert.deepEqual(unverified.calls, [['auth', '/admin/inauguration']]);
});

test('only exact settings route is handled and only GET/PUT are allowed', async () => {
  const api = harness();
  for (const route of ['/api/inauguration', `${endpoint}/extra`, '/api/content-single/inauguration_settings', '/']) {
    assert.equal((await api.invoke({}, 'PUT', route)).handled, false);
  }
  assert.deepEqual(api.calls, []);
  for (const method of ['POST', 'PATCH', 'DELETE', 'HEAD']) assert.equal((await api.invoke({}, method)).status, 405);
  assert.deepEqual(api.calls, []);
});

test('PUT trims and persists a full config once, and GET roundtrips scheduled buttons unchanged', async () => {
  const api = harness();
  const payload = {
    enabled: false, logoUrl: ' /api/uploads/logo.png ', logoSize: 320,
    backgroundColor: ' #123abc ', headingEnglish: ' Celebration ', headingPunjabi: ' ਸਮਾਗਮ ',
    messageEnglish: ' Welcome everyone ', messagePunjabi: ' ਜੀ ਆਇਆਂ ਨੂੰ ',
    buttons: [button({ id: ' enter ', url: ' https://example.test/welcome ', availableAt: ' 2099-11-20T12:00:00.000Z ' }), button({ id: 'past', url: '/events?day=today#schedule', enabled: false, availableAt: '2024-02-29T08:00:00-05:00' })]
  };
  const result = await api.invoke(payload, 'PUT');
  assert.equal(result.status, 200);
  assert.equal(result.body.data.headingEnglish, 'Celebration');
  assert.equal(result.body.data.backgroundColor, '#123abc');
  assert.equal(result.body.data.logoUrl, '/api/uploads/logo.png');
  assert.equal(result.body.data.textColor, '#FFFFFF');
  assert.equal(result.body.data.buttons[0].availableAt, '2099-11-20T12:00:00.000Z');
  assert.equal(result.body.data.buttons[1].enabled, false);
  assert.deepEqual(api.calls.map(([kind]) => kind), ['auth', 'parse', 'set']);
  assert.deepEqual(api.calls[1][1], { maxBytes: 64 * 1024, allowEmpty: false });
  assert.equal(api.calls[2][1], INAUGURATION_SETTINGS_RESOURCE);
  const loaded = await api.invoke();
  assert.deepEqual(loaded.body, result.body);
  assert.equal(loaded.body.data.buttons.length, 2, 'Schedules are preserved, not unlocked or filtered by GET');
});

test('omitted fields use defaults, PUT replaces previous config, and response mutation cannot mutate defaults', async () => {
  const api = harness({ saved: { enabled: true, headingEnglish: 'Old title' } });
  const result = await api.invoke({}, 'PUT');
  assert.deepEqual(result.body.data, DEFAULT_INAUGURATION_SETTINGS);
  result.body.data.buttons.push(button());
  assert.deepEqual(DEFAULT_INAUGURATION_SETTINGS.buttons, []);
  assert.deepEqual((await api.invoke()).body.data, DEFAULT_INAUGURATION_SETTINGS);
  const minimal = validateInaugurationSettings({ buttons: [{ id: 'link', labelEnglish: 'Link', url: '/home' }] });
  assert.deepEqual(minimal.buttons[0], { id: 'link', labelEnglish: 'Link', labelPunjabi: '', url: '/home', enabled: false, availableAt: '' });
});

test('strict top-level shape, booleans, colors, size, text types and limits reject without writes', async () => {
  const invalid = [null, [], 'config', { unknown: true }, { canSave: true }, JSON.parse('{"__proto__":{}}'),
    ...['true', 1, null, {}].map((enabled) => ({ enabled })),
    ...['red', '#fff', '#12345678', '#ZZZZZZ', null].flatMap((color) => ['backgroundColor', 'textColor', 'accentColor'].map((field) => ({ [field]: color }))),
    ...[79, 321, 180.5, '180', null].map((logoSize) => ({ logoSize })),
    ...['headingEnglish', 'headingPunjabi', 'messageEnglish', 'messagePunjabi'].flatMap((field) => [{ [field]: false }, { [field]: 'x'.repeat(field.startsWith('heading') ? 201 : 2001) }]),
    { logoUrl: 10 }, { logoUrl: `https://example.test/${'a'.repeat(2048)}` }, { buttons: null }, { buttons: {} }, { buttons: Array.from({ length: 13 }, (_, index) => button({ id: `b${index}` })) }];
  for (const body of invalid) {
    const api = harness();
    assert.equal((await api.invoke(body, 'PUT')).status, 400, JSON.stringify(body));
    assert.deepEqual(api.calls.map(([kind]) => kind), ['auth', 'parse']);
  }
  for (const logoSize of [80, 320]) assert.equal(validateInaugurationSettings({ logoSize }).logoSize, logoSize);
  assert.equal(validateInaugurationSettings({ buttons: Array.from({ length: 12 }, (_, index) => button({ id: `b${index}` })) }).buttons.length, 12);
});

test('buttons require safe unique IDs, English labels, URLs, strict optional types and known fields', async () => {
  const invalid = [null, [], {}, button({ id: '' }), button({ id: 'a/b' }), button({ id: 'a'.repeat(81) }),
    button({ labelEnglish: ' ' }), button({ labelEnglish: 'x'.repeat(121) }), button({ labelPunjabi: 'x'.repeat(121) }),
    button({ labelPunjabi: null }), button({ enabled: 'false' }), button({ availableAt: null }), button({ extra: true }),
    button({ url: '' }), button({ url: `https://example.test/${'x'.repeat(2048)}` })];
  for (const entry of invalid) assert.throws(() => validateInaugurationSettings({ buttons: [entry] }), { status: 400 });
  assert.throws(() => validateInaugurationSettings({ buttons: [button(), button({ id: ' welcome ' })] }), { status: 400 });
});

test('URLs reject unsafe schemes, credentials, protocol-relative URLs, encoding and browser normalization tricks', () => {
  // eslint-disable-next-line no-script-url -- Deliberately unsafe input for validation tests.
  const unsafe = ['javascript:alert(1)', 'data:image/png;base64,aaa', 'ftp://example.test/a', '//evil.test/a', '///evil.test',
    'https://user:password@example.test/a', 'http://user@example.test', 'https://', 'not-a-url',
    '/\\evil.test', '/%5cevil.test', '/%2fevil.test', '/%252fevil.test', '/%25252fevil.test',
    '/%0a/evil.test', '/a\tb', '/uploads/../secret', '/uploads/%2e%2e/secret', '/uploads/%252e%252e/secret', '/bad%zz'];
  for (const url of unsafe) {
    assert.throws(() => validateInaugurationSettings({ buttons: [button({ url })] }), { status: 400 }, url);
    assert.throws(() => validateInaugurationSettings({ logoUrl: url }), { status: 400 }, url);
  }
  for (const logoUrl of ['/home/logo.png', '/uploads', '/uploads/', '/api/uploads/', '/uploads-other/logo.png']) {
    assert.throws(() => validateInaugurationSettings({ logoUrl }), { status: 400 }, logoUrl);
  }
  for (const logoUrl of ['', '/uploads/logo.png', '/api/uploads/logo.png', 'https://example.test/logo.png', 'http://localhost:4242/uploads/logo.png']) {
    assert.equal(validateInaugurationSettings({ logoUrl }).logoUrl, logoUrl);
  }
  for (const url of ['/', '/home', '/events?day=20#details', 'https://example.test/path', 'http://example.test:8080/']) {
    assert.equal(validateInaugurationSettings({ buttons: [button({ url })] }).buttons[0].url, url);
  }
});

test('schedule accepts only real ISO timestamps with a timezone or an empty string', () => {
  for (const availableAt of ['', '2024-02-29T10:30:00Z', '2026-11-20T12:30:59.123+05:30', '2099-01-01T00:00:00Z']) {
    assert.equal(validateInaugurationSettings({ buttons: [button({ availableAt })] }).buttons[0].availableAt, availableAt);
  }
  for (const availableAt of ['tomorrow', '2026-11-20', '2026-11-20T10:00:00', '2026-02-29T10:00:00Z', '2026-04-31T10:00:00Z', '2026-13-01T10:00:00Z', '2026-01-00T10:00:00Z', '2026-11-20T24:00:00Z', '2026-11-20T10:60:00Z', '2026-11-20T10:00:60Z', '2026-11-20T10:00:00+24:00']) {
    assert.throws(() => validateInaugurationSettings({ buttons: [button({ availableAt })] }), { status: 400 }, availableAt);
  }
});

test('body and persistence failures are safe, do not report successful saves, and never retry', async () => {
  for (const status of [400, 413]) {
    const api = harness({ parseFailure: Object.assign(new Error('Invalid body'), { status }) });
    assert.equal((await api.invoke({}, 'PUT')).status, status);
    assert.deepEqual(api.calls.map(([kind]) => kind), ['auth', 'parse']);
  }
  const api = harness({ failure: new Error('private SQL password') });
  const result = await api.invoke({}, 'PUT');
  assert.equal(result.status, 503);
  assert.equal(result.body.message.includes('password'), false);
  assert.equal(api.calls.filter(([kind]) => kind === 'set').length, 1);
});

// Evaluate only the real guard statement; never import index.js or open a DB.
test('generic singleton PUT guard rejects inauguration regardless of resource casing before body parsing', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const start = source.indexOf("if (contentSingleMatch && request.method === 'PUT')");
  const section = source.slice(start, source.indexOf('const body =', start));
  const guard = section.match(/assertInput\(resource !== 'widget_placements'[^\n]+/);
  assert.ok(guard, 'Dedicated singleton guard must exist');
  for (const name of ['inauguration_settings', 'INAUGURATION_SETTINGS', 'Inauguration_Settings', 'widget_placements', 'welcome_journey_settings']) {
    assert.throws(() => new vm.Script(guard[0]).runInNewContext({
      resource: name.toLowerCase(),
      assertInput: (condition, message, status) => { if (!condition) throw Object.assign(new Error(message), { status }); }
    }), { status: 403 });
  }
  new vm.Script(guard[0]).runInNewContext({ resource: 'unrelated_settings', assertInput: (condition) => assert.equal(condition, true) });
  assert.match(source, /const \{ createInaugurationHandler \} = require\('\.\/inaugurationApi'\);/);
  assert.match(source, /const inaugurationHandler = createInaugurationHandler\(\{ eventsDb, canManageAdminPage, parseJsonObjectBody, sendJson \}\);/);
  assert.match(source, /if \(await inaugurationHandler\(request, response, requestUrl\)\) \{\s*return;\s*\}/);
});
