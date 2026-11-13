const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStreamOverlayHandler, createStreamOverlayStore } = require('./streamOverlayApi');

const collection = '/api/stream-overlay/overlays';
const settings = () => ({
  overlayOn: true, overlayLogo: true, overlayLanguages: 'gpe', overlayOpacity: 100,
  gurmukhiSize: 100, punjabiSize: 100, englishSize: 100, overlayAnnouncement: '',
  overlayHeaderMessage: '', headerSize: 100, headerPunjabiSize: 100, punjabiAnnouncement: '',
  headerPunjabi: '', upperEnglish: '', upperPunjabi: '', upperSpeed: 100, lowerSpeed: 100,
  tickerColors: { upperbg: '#004080', upperfg: '#ffffff', lowerbg: '#F89820', lowerfg: '#004080' },
  upperSize: 100, lowerSize: 100, overlayThemeId: 'brand-colors'
});
const profile = (overrides = {}) => ({ ...settings(), title: 'Main channel', slug: 'main-channel', description: 'Live channel', logoUrl: '/uploads/logo.png', isActive: true, ...overrides });
const createHarness = ({ connected = true, initial = { overlays: [] } } = {}) => {
  let saved = structuredClone(initial);
  const writes = [], reads = [], permissions = [], parseOptions = [];
  const eventsDb = {
    hasDatabaseConnection: connected,
    getSingleton: async (resource) => { reads.push(resource); await Promise.resolve(); return structuredClone(saved); },
    setSingleton: async (resource, data) => { await Promise.resolve(); saved = structuredClone(data); writes.push([resource, structuredClone(data)]); return data; }
  };
  const handler = createStreamOverlayHandler({
    eventsDb,
    canManageAdminPage: async (request, page) => { permissions.push(page); return request.authorized; },
    parseJsonObjectBody: async (request, options) => {
      parseOptions.push(options);
      if (request.bodyError) throw request.bodyError;
      return request.body;
    },
    sendJson: (response, status, body) => Object.assign(response, { status, body })
  });
  return {
    eventsDb, writes, reads, permissions, parseOptions,
    get saved() { return structuredClone(saved); },
    async request(url = collection, method = 'GET', body, authorized = true, bodyError) {
      const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; } };
      response.handled = await handler({ method, body, authorized, bodyError }, response, new URL(url, 'http://localhost'));
      return response;
    }
  };
};

test('accepts the upload service local image URLs', async () => {
  const api = createHarness();
  const created = await api.request(collection, 'POST', profile({ logoUrl: '/api/uploads/cms/2026/11/logo.png' }));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.logoUrl, '/api/uploads/cms/2026/11/logo.png');
});

test('CRUD persists flattened full records only in the protected singleton; legacy is not migrated', async () => {
  const api = createHarness();
  assert.deepEqual((await api.request()).body.data, []);
  assert.equal(api.writes.length, 0);
  const created = await api.request(collection, 'POST', profile());
  assert.equal(created.status, 201);
  const entry = created.body.data;
  assert.match(entry.id, /^[a-f0-9-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(entry.createdAt)));
  assert.equal(entry.createdAt, entry.updatedAt);
  assert.equal(entry.overlayOpacity, 100);
  assert.equal((await api.request()).body.data.length, 1);
  const updated = await api.request(`${collection}/${entry.id}`, 'PUT', profile({ title: 'Edited', overlayOpacity: 15, overlayLanguages: 'gp' }));
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.id, entry.id);
  assert.equal(updated.body.data.createdAt, entry.createdAt);
  assert.equal(updated.body.data.title, 'Edited');
  assert.equal(updated.body.data.overlayOpacity, 15);
  assert.deepEqual(api.saved, { overlays: [updated.body.data] });
  const publicResult = await api.request('/api/stream-overlay/public/main-channel', 'GET', undefined, false);
  assert.equal(publicResult.status, 200);
  assert.deepEqual(publicResult.body.data, updated.body.data);
  assert.equal(publicResult.headers['Cache-Control'], 'no-store');
  assert.equal((await api.request(`${collection}/${entry.id}`, 'DELETE')).status, 200);
  assert.equal((await api.request('/api/stream-overlay/public/main-channel')).status, 404);
  assert.deepEqual(api.saved, { overlays: [] });
  assert.ok(api.reads.every((key) => key === 'stream_overlay_profiles'));
  assert.ok(api.writes.every(([key]) => key === 'stream_overlay_profiles'));
  assert.ok(api.permissions.every((page) => page === '/admin/recitations'));
  assert.deepEqual(api.parseOptions[0], { maxBytes: 16 * 1024, allowEmpty: false });
});

test('all admin methods require injected page authorization, even reads and disconnected storage', async () => {
  const api = createHarness({ connected: false });
  for (const [url, method] of [[collection, 'GET'], [collection, 'POST'], [`${collection}/id`, 'PUT'], [`${collection}/id`, 'DELETE'], [`${collection}/id`, 'PATCH']]) {
    assert.equal((await api.request(url, method, profile(), false)).status, 403);
  }
  assert.equal(api.reads.length, 0);
  assert.equal(api.writes.length, 0);
  assert.equal((await api.request()).status, 503);
  assert.equal((await api.request('/api/stream-overlay/public/missing', 'GET', undefined, false)).status, 503);
});

test('named identity trims on create, preserves omitted values on edit and clears fields independently', async () => {
  const api = createHarness();
  const created = await api.request(collection, 'POST', profile({ displayName: ' Community Milton ', displayAddress: ' 12 Community Road ' }));
  assert.equal(created.status, 201);
  const { id } = created.body.data;
  assert.equal(created.body.data.displayName, 'Community Milton');
  assert.equal(created.body.data.displayAddress, '12 Community Road');
  const edited = await api.request(`${collection}/${id}`, 'PUT', profile({ title: 'Edited channel' }));
  assert.equal(edited.status, 200);
  assert.equal(edited.body.data.displayName, 'Community Milton');
  assert.equal(edited.body.data.displayAddress, '12 Community Road');
  const nameOnly = await api.request(`${collection}/${id}`, 'PUT', profile({ displayName: '   ' }));
  assert.equal(nameOnly.body.data.displayName, '');
  assert.equal(nameOnly.body.data.displayAddress, '12 Community Road');
  const addressOnly = await api.request(`${collection}/${id}`, 'PUT', profile({ displayName: 'Other Milton', displayAddress: '' }));
  assert.equal(addressOnly.body.data.displayName, 'Other Milton');
  assert.equal(addressOnly.body.data.displayAddress, '');
  const published = await api.request('/api/stream-overlay/public/main-channel', 'GET', undefined, false);
  assert.equal(published.body.data.displayName, 'Other Milton');
  assert.equal(published.body.data.displayAddress, '');
});

test('missing identity defaults blank on create and existing pre-identity records remain readable and editable', async () => {
  const old = { ...profile(), id: 'old', createdAt: '2026-01-01T00:00:00Z' };
  const api = createHarness({ initial: { overlays: [old] } });
  assert.deepEqual((await api.request()).body.data, [old]);
  assert.deepEqual((await api.request('/api/stream-overlay/public/main-channel')).body.data, old);
  assert.equal(api.writes.length, 0);
  const updated = await api.request(`${collection}/old`, 'PUT', profile());
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.displayName, '');
  assert.equal(updated.body.data.displayAddress, '');
  assert.equal(updated.body.data.createdAt, old.createdAt);
  const created = await api.request(collection, 'POST', profile({ slug: 'new-channel' }));
  assert.equal(created.status, 201);
  assert.equal(created.body.data.displayName, '');
  assert.equal(created.body.data.displayAddress, '');
});

test('identity enforces string types and maximum lengths on both create and update without invalid writes', async () => {
  const api = createHarness();
  const created = await api.request(collection, 'POST', profile({ displayName: 'n'.repeat(120), displayAddress: 'a'.repeat(300) }));
  assert.equal(created.status, 201);
  const { id } = created.body.data;
  for (const [key, max] of Object.entries({ displayName: 120, displayAddress: 300 })) {
    for (const value of [null, 42, false, [], {}, 'x'.repeat(max + 1)]) {
      for (const [url, method] of [[collection, 'POST'], [`${collection}/${id}`, 'PUT']]) {
        const result = await api.request(url, method, profile({ [key]: value }));
        assert.equal(result.status, 400, `${method} ${key}: ${JSON.stringify(value)}`);
        assert.match(result.body.message, new RegExp(key));
      }
    }
  }
  assert.equal(api.writes.length, 1);
  assert.deepEqual(api.saved.overlays, [created.body.data]);
  assert.equal((await api.request(`${collection}/${id}`, 'PUT', profile({ displayName: 'm'.repeat(120), displayAddress: 'b'.repeat(300) }))).status, 200);
});

test('inactive public records force overlayOn false despite query overrides without altering stored settings', async () => {
  const api = createHarness();
  const entry = (await api.request(collection, 'POST', profile())).body.data;
  const toggled = await api.request(`${collection}/${entry.id}`, 'PATCH', { isActive: false });
  assert.equal(toggled.status, 200);
  assert.equal(toggled.body.data.overlayOn, true);
  const result = await api.request('/api/stream-overlay/public/main-channel?on=1&isActive=true&overlayOn=true', 'GET', undefined, false);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.isActive, false);
  assert.equal(result.body.data.overlayOn, false);
  assert.equal(api.saved.overlays[0].overlayOn, true);
  assert.equal((await api.request(`${collection}/${entry.id}`, 'PATCH', { isActive: true })).status, 200);
  assert.equal((await api.request('/api/stream-overlay/public/main-channel')).body.data.overlayOn, true);
  for (const body of [{}, { isActive: 'false' }, { isActive: false, overlayOn: true }]) assert.equal((await api.request(`${collection}/${entry.id}`, 'PATCH', body)).status, 400);
});

test('header colors default blank for old records and preserve omitted overrides independently', async () => {
  const old = { ...profile(), id: 'old', createdAt: '2026-01-01T00:00:00Z' };
  const api = createHarness({ initial: { overlays: [old] } });
  assert.deepEqual((await api.request('/api/stream-overlay/public/main-channel')).body.data, old);
  assert.equal(api.writes.length, 0);
  const updated = await api.request(`${collection}/old`, 'PUT', profile());
  assert.equal(updated.body.data.headerBackgroundColor, '');
  assert.equal(updated.body.data.headerBorderColor, '');
  const created = (await api.request(collection, 'POST', profile({ slug: 'colors', headerBackgroundColor: '#123ABC', headerBorderColor: '#654321' }))).body.data;
  assert.equal(created.headerBackgroundColor, '#123ABC');
  assert.equal(created.headerBorderColor, '#654321');
  const other = (await api.request(collection, 'POST', profile({ slug: 'other' }))).body.data;
  assert.equal(other.headerBackgroundColor, '');
  assert.equal(other.headerBorderColor, '');
  const edited = await api.request(`${collection}/${created.id}`, 'PUT', profile({ slug: 'colors', headerBackgroundColor: '' }));
  assert.equal(edited.body.data.headerBackgroundColor, '');
  assert.equal(edited.body.data.headerBorderColor, '#654321');
  const preserved = await api.request(`${collection}/${created.id}`, 'PUT', profile({ slug: 'colors' }));
  assert.equal(preserved.body.data.headerBorderColor, '#654321');
  const published = await api.request('/api/stream-overlay/public/colors?headerBorderColor=%23ffffff');
  assert.equal(published.body.data.headerBorderColor, '#654321');
  assert.deepEqual(published.body.data.tickerColors, settings().tickerColors);
  const reset = await api.request(`${collection}/${created.id}`, 'PUT', profile({ slug: 'colors', headerBorderColor: '' }));
  assert.equal(reset.body.data.headerBorderColor, '');
});

test('header colors reject nonstrings and anything except blank or six hex digits on named create/update', async () => {
  const api = createHarness();
  const created = (await api.request(collection, 'POST', profile())).body.data;
  for (const key of ['headerBackgroundColor', 'headerBorderColor']) {
    for (const value of [null, undefined, 123456, false, [], {}, '#fff', '#12345678', '123456', '#12345z', 'red', ' ', '#123456\n', ' #123456']) {
      for (const [url, method] of [[collection, 'POST'], [`${collection}/${created.id}`, 'PUT']]) {
        const result = await api.request(url, method, profile({ [key]: value }));
        assert.equal(result.status, 400, `${method} ${key}: ${JSON.stringify(value)}`);
        assert.match(result.body.message, new RegExp(key));
      }
    }
  }
  assert.equal(api.writes.length, 1);
});

test('serialized concurrent creates enforce uniqueness and a rejected mutation does not poison the queue', async () => {
  const api = createHarness();
  const results = await Promise.all(Array.from({ length: 10 }, () => api.request(collection, 'POST', profile())));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 409).length, 9);
  assert.equal(api.writes.length, 1);
  assert.equal((await api.request(collection, 'POST', profile({ slug: 'second-channel' }))).status, 201);
  assert.equal(api.saved.overlays.length, 2);
});

test('store instances on the same adapter share a lock and independent writes are not lost', async () => {
  const api = createHarness();
  const first = createStreamOverlayStore({ eventsDb: api.eventsDb });
  const second = createStreamOverlayStore({ eventsDb: api.eventsDb });
  const results = await Promise.allSettled([first.create(profile()), second.create(profile())]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  await Promise.all(Array.from({ length: 5 }, (_, i) => second.create(profile({ slug: `channel-${i}` }))));
  assert.equal((await first.list()).length, 6);
  const snapshot = await first.list();
  snapshot[0].title = 'Not persisted';
  assert.notEqual((await first.list())[0].title, snapshot[0].title);
});

test('slug rename changes public lookup, excludes self from uniqueness, and collisions are atomic', async () => {
  const api = createHarness();
  const first = (await api.request(collection, 'POST', profile())).body.data;
  const second = (await api.request(collection, 'POST', profile({ slug: 'second' }))).body.data;
  assert.equal((await api.request(`${collection}/${first.id}`, 'PUT', profile())).status, 200);
  const results = await Promise.all([
    api.request(`${collection}/${first.id}`, 'PUT', profile({ slug: 'renamed' })),
    api.request(`${collection}/${second.id}`, 'PUT', profile({ slug: 'renamed' }))
  ]);
  assert.deepEqual(results.map((result) => result.status), [200, 409]);
  assert.equal((await api.request('/api/stream-overlay/public/main-channel')).status, 404);
  assert.equal((await api.request('/api/stream-overlay/public/renamed')).body.data.id, first.id);
  assert.equal((await api.request('/api/stream-overlay/public/second')).body.data.id, second.id);
});

test('strict validation rejects unknown/read-only keys, bad metadata and invalid complete settings', async () => {
  const api = createHarness();
  const invalid = [
    null, [], {}, profile({ title: '' }), profile({ title: '   ' }), profile({ title: 'x'.repeat(101) }),
    profile({ description: 'x'.repeat(501) }), profile({ description: null }), profile({ isActive: 1 }),
    ...['', 'Default', 'default', 'settings', 'public', 'overlays', 'two--parts', '-lead', 'tail-', 'a_b', 'has space', 'x'.repeat(61)].map((slug) => profile({ slug })),
    profile({ extra: true }), profile({ id: 'spoof' }), profile({ createdAt: 'spoof' }), profile({ updatedAt: 'spoof' }),
    profile({ overlayOn: 1 }), profile({ overlayLogo: 'true' }), profile({ overlayLanguages: 'en' }),
    profile({ overlayThemeId: 'x'.repeat(81) }), profile({ overlayThemeId: null }),
    profile({ tickerColors: null }), profile({ tickerColors: [] }),
    profile({ tickerColors: { ...settings().tickerColors, extra: '#ffffff' } }),
    profile({ tickerColors: { ...settings().tickerColors, upperbg: 'red' } }), profile({ tickerColors: { upperbg: '#ffffff' } })
  ];
  for (const key of ['overlayOpacity', 'gurmukhiSize', 'punjabiSize', 'englishSize', 'headerSize', 'headerPunjabiSize', 'upperSpeed', 'lowerSpeed', 'upperSize', 'lowerSize']) {
    for (const value of [-1, 101, '50', NaN, Infinity, undefined]) invalid.push(profile({ [key]: value }));
  }
  invalid.push(profile({ overlayOpacity: 14 }));
  for (const [key, max] of Object.entries({ overlayAnnouncement: 180, overlayHeaderMessage: 120, punjabiAnnouncement: 180, headerPunjabi: 120, upperEnglish: 180, upperPunjabi: 180 })) invalid.push(profile({ [key]: 'x'.repeat(max + 1) }), profile({ [key]: undefined }));
  for (const body of invalid) assert.equal((await api.request(collection, 'POST', body)).status, 400, JSON.stringify(body));
  assert.equal(api.writes.length, 0);
});

test('logos use HTTP(S) or upload-service paths, never inline data or unsafe local URLs', async () => {
  const api = createHarness();
  // eslint-disable-next-line no-script-url
  for (const logoUrl of ['javascript:alert(1)', 'data:image/png;base64,abc', '//evil.test/x', '/logo.png', '/uploads/../private', '/uploads/%2e%2e/private', '/uploads/%252e%252e/private', '/uploads/%2f..%2fprivate', '/uploads/\\evil', '/uploads/%00x', 'https://user:pass@example.test/x', 'https:\\evil.test', ' https://example.test/x', 'ftp://example.test/x', null, 'x'.repeat(2049)]) assert.equal((await api.request(collection, 'POST', profile({ logoUrl }))).status, 400, String(logoUrl));
  for (const [i, logoUrl] of ['', '/uploads/logo.png', 'http://example.test/logo.png', 'https://example.test/logo.png?size=20'].entries()) assert.equal((await api.request(collection, 'POST', profile({ logoUrl, slug: `valid-${i}` }))).status, 201);
});

test('missing records, method errors, parser failures and unavailable storage fail safely', async () => {
  const api = createHarness();
  for (const method of ['PUT', 'PATCH', 'DELETE']) assert.equal((await api.request(`${collection}/missing`, method, method === 'PATCH' ? { isActive: true } : profile())).status, 404);
  assert.equal((await api.request('/api/stream-overlay/public/missing')).status, 404);
  for (const [url, method] of [[collection, 'DELETE'], [`${collection}/missing`, 'GET'], ['/api/stream-overlay/public/missing', 'POST']]) assert.equal((await api.request(url, method)).status, 405);
  for (const status of [400, 413]) assert.equal((await api.request(collection, 'POST', null, true, Object.assign(new Error('Body rejected'), { status }))).status, status);
  api.eventsDb.setSingleton = async () => { throw new Error('private database connection string'); };
  const result = await api.request(collection, 'POST', profile());
  assert.equal(result.status, 503);
  assert.doesNotMatch(result.body.message, /private database/);
  assert.equal(api.saved.overlays.length, 0);
  api.eventsDb.setSingleton = async () => {};
  assert.equal((await api.request(collection, 'POST', profile())).status, 201);
});

test('100-profile cap is checked inside the mutation lock and deletion frees a slot', async () => {
  const overlays = Array.from({ length: 99 }, (_, i) => ({ ...profile({ slug: `channel-${i}` }), id: `id-${i}` }));
  const api = createHarness({ initial: { overlays } });
  const results = await Promise.all(['last', 'overflow'].map((slug) => api.request(collection, 'POST', profile({ slug }))));
  assert.deepEqual(results.map((result) => result.status), [201, 409]);
  assert.equal(api.saved.overlays.length, 100);
  assert.equal((await api.request(`${collection}/id-0`, 'DELETE')).status, 200);
  assert.equal((await api.request(collection, 'POST', profile({ slug: 'replacement' }))).status, 201);
});

const createLegacyHarness = (initial = settings()) => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const start = source.indexOf("  if (requestUrl.pathname === '/api/stream-overlay/settings' && request.method === 'GET')");
  const end = source.indexOf("  if (requestUrl.pathname === '/api/ask-granthi/board'", start);
  assert.ok(start !== -1 && end > start);
  let saved = initial;
  const resources = [], writes = [];
  const legacy = vm.runInNewContext(`(async (request, response, requestUrl) => { ${source.slice(start, end)} })`, {
    eventsDb: {
      hasDatabaseConnection: true,
      getSingleton: async (resource) => { resources.push(resource); return saved; },
      setSingleton: async (resource, value) => { resources.push(resource); writes.push(value); saved = value; return value; }
    },
    canManageAdminPage: async (request, page) => request.authorized && page === '/admin/recitations',
    parseJsonObjectBody: async (request) => request.body,
    assertInput: (condition, message, status = 400) => { if (!condition) throw Object.assign(new Error(message), { status }); },
    ensureNoUnknownKeys: (body, allowed) => { assert.ok(Object.keys(body).every((key) => allowed.includes(key))); },
    sendJson: (response, status, body) => Object.assign(response, { status, body })
  });
  return { legacy, resources, writes };
};

test('module declines legacy GET/PUT, and existing legacy handlers still use only their original singleton', async () => {
  const api = createHarness();
  const legacyPath = '/api/stream-overlay/settings';
  for (const method of ['GET', 'PUT']) assert.equal((await api.request(legacyPath, method, settings())).handled, false);
  assert.equal(api.reads.length, 0);
  assert.equal(api.permissions.length, 0);
  const { legacy, resources } = createLegacyHarness();
  for (const method of ['GET', 'PUT']) {
    const response = {};
    await legacy({ method, body: settings(), authorized: true }, response, new URL(legacyPath, 'http://localhost'));
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(response.body.data)), method === 'GET' ? settings() : { ...settings(), headerBackgroundColor: '', headerBorderColor: '' });
  }
  const denied = {};
  await legacy({ method: 'PUT', body: settings(), authorized: false }, denied, new URL(legacyPath, 'http://localhost'));
  assert.equal(denied.status, 403);
  assert.deepEqual(resources, ['stream_overlay_settings', 'stream_overlay_settings', 'stream_overlay_settings']);
});

test('legacy optional header colors validate strictly, preserve omissions, and reset independently', async () => {
  const { legacy, writes } = createLegacyHarness();
  const request = async (body) => {
    const response = {};
    await legacy({ method: 'PUT', body, authorized: true }, response, new URL('/api/stream-overlay/settings', 'http://localhost'));
    return response;
  };
  let response = await request({ ...settings(), headerBackgroundColor: '#123ABC', headerBorderColor: '#654321' });
  assert.equal(response.status, 200);
  response = await request(settings());
  assert.equal(response.status, 200);
  assert.equal(response.body.data.headerBackgroundColor, '#123ABC');
  assert.equal(response.body.data.headerBorderColor, '#654321');
  response = await request({ ...settings(), headerBackgroundColor: '' });
  assert.equal(response.body.data.headerBackgroundColor, '');
  assert.equal(response.body.data.headerBorderColor, '#654321');
  assert.deepEqual(response.body.data.tickerColors, settings().tickerColors);
  response = await request({ ...settings(), headerBorderColor: '' });
  assert.equal(response.body.data.headerBorderColor, '');
  assert.equal(response.body.data.headerBackgroundColor, '');
  for (const key of ['headerBackgroundColor', 'headerBorderColor']) {
    for (const value of [null, undefined, 123456, false, [], {}, '#fff', '#12345678', '123456', '#12345z', 'red', ' ', '#123456\n', ' #123456']) {
      const invalid = await request({ ...settings(), [key]: value });
      assert.equal(invalid.status, 400, `${key}: ${JSON.stringify(value)}`);
      assert.match(invalid.body.message, new RegExp(key));
    }
  }
  assert.equal(writes.length, 4);
});

test('named and legacy APIs accept blank or strict six-digit footer colors on every channel', async () => {
  const api = createHarness();
  const created = (await api.request(collection, 'POST', profile())).body.data;
  const { legacy } = createLegacyHarness();
  const legacyRequest = async (tickerColors) => {
    const response = {};
    await legacy({ method: 'PUT', body: { ...settings(), tickerColors }, authorized: true }, response, new URL('/api/stream-overlay/settings', 'http://localhost'));
    return response;
  };
  for (const key of Object.keys(settings().tickerColors)) {
    for (const value of ['', '#123ABC']) {
      const tickerColors = { ...settings().tickerColors, [key]: value };
      const named = await api.request(collection, 'POST', profile({ slug: `footer-${key}-${value === '' ? 'blank' : 'hex'}`, tickerColors }));
      const updated = await api.request(`${collection}/${created.id}`, 'PUT', profile({ tickerColors }));
      const old = await legacyRequest(tickerColors);
      assert.equal(named.status, 201);
      assert.equal(updated.status, 200);
      assert.equal(old.status, 200);
      for (const response of [named, updated, old]) assert.equal(response.body.data.tickerColors[key], value);
    }
    for (const value of [undefined, null, false, 0, 123456, [], {}, '#fff', '#12345678', '123456', '#12345z', 'red', ' ', '#123456\n', ' #123456']) {
      const tickerColors = { ...settings().tickerColors, [key]: value };
      assert.equal((await api.request(collection, 'POST', profile({ tickerColors }))).status, 400, `${key}: ${JSON.stringify(value)}`);
      assert.equal((await api.request(`${collection}/${created.id}`, 'PUT', profile({ tickerColors }))).status, 400);
      assert.equal((await legacyRequest(tickerColors)).status, 400);
    }
  }
  const tickerColors = { upperbg: '', upperfg: '', lowerbg: '', lowerfg: '' };
  assert.equal((await api.request(`${collection}/${created.id}`, 'PUT', profile({ tickerColors }))).status, 200);
  assert.equal((await legacyRequest(tickerColors)).status, 200);
});

test('generic list/single/item read and write routes cannot bypass protected storage', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  const start = source.indexOf('  const contentGuardMatch =');
  const end = source.indexOf('  const ledContentMutationMatch =', start);
  assert.ok(start !== -1 && end > start);
  const guard = vm.runInNewContext(`(requestUrl, response) => { ${source.slice(start, end)} }`, {
    recitationService: { isProtectedResource: () => false },
    sendJson: (response, status, body) => Object.assign(response, { status, body })
  });
  for (const prefix of ['/api/content/', '/api/content-single/']) {
    for (const suffix of ['', '/id']) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        const response = {};
        guard({ pathname: `${prefix}stream_overlay_profiles${suffix}`, method }, response);
        assert.equal(response.status, 404);
      }
    }
  }
});