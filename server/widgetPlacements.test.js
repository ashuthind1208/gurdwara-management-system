const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const widgets = require('./widgetPlacements');

const placement = (overrides = {}) => ({
  id: 'home-events', widgetId: 'event-list', pagePath: '/',
  slot: 'main', order: 0, config: { title: 'Upcoming Events', limit: 4, filter: '' }, ...overrides
});
const admin = { email: 'admin@example.test', role: 'Admin', isActive: true, approvalStatus: 'approved' };
const headers = { 'x-actor-email': admin.email, 'x-actor-role': admin.role };

// Test the real routing/parser without loading env files, starting schedulers,
// binding ports, or touching the actual database.
const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const section = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing server section: ${start}`);
  return source.slice(from, to);
};
const script = new vm.Script([
  section('const readBody =', 'const parsePositiveIntEnv ='),
  section('const getRequestActor =', 'const normalizeVolunteerRegistrationForReminder ='),
  section('const widgetPlacementsHandler =', '\n\nconst bootstrap =')
].join('\n'));

const harness = ({ users = [admin], connected = true, stored, failRead = false, failWrite = false, rateLimited = false } = {}) => {
  const writes = [];
  const reads = [];
  let handler;
  const context = vm.createContext({
    ...widgets, Buffer, URL, JSON,
    createWelcomeJourneyHandler: () => async () => {},
    appendAuditLog: async () => {},
    maxJsonBodyBytes: 2 * 1024 * 1024,
    http: { createServer: (callback) => { handler = callback; } },
    whatsappWebhookHandler: async () => false,
    recitationService: { handleLive: () => false, handleApi: async () => false, isProtectedResource: () => false },
    socialPostingService: { handleApi: async () => false },
    ledScreenService: { handleApi: async () => false },
    enforceRateLimit: async (_request, response) => {
      if (rateLimited) Object.assign(response, { status: 429 });
      return !rateLimited;
    },
    sendJson: (response, status, body) => Object.assign(response, { status, body }),
    eventsDb: {
      hasDatabaseConnection: connected,
      listItems: async (resource) => { assert.equal(resource, 'users'); return users; },
      getSingleton: async (resource, fallback) => {
        reads.push(resource);
        assert.equal(resource, 'widget_placements');
        if (failRead) throw new Error('PRIVATE database connection details');
        return stored ?? fallback;
      },
      setSingleton: async (resource, value) => {
        if (failWrite) throw new Error('PRIVATE database connection details');
        writes.push({ resource, value });
        stored = value;
        return value;
      }
    }
  });
  script.runInContext(context);
  return {
    writes, reads,
    async request(method = 'PUT', body = { placements: [placement()] }, actorHeaders = headers, url = '/api/widget-placements') {
      const request = { method, url, headers: actorHeaders,
        __cachedBodyBuffer: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) };
      const response = {};
      await handler(request, response);
      return response;
    }
  };
};

test('static widget IDs and public field types match registry without evaluating frontend code', () => {
  const registry = fs.readFileSync(path.join(__dirname, '../src/constants/widgetRegistry.js'), 'utf8');
  const entries = [...registry.matchAll(/define\('([^']+)',\s*'[^']+',\s*'[^']+',\s*'[^']+',\s*'[^']+'(?:,\s*\[([^\]]*)\])?\)/g)];
  assert.deepEqual(Object.keys(widgets.PUBLIC_WIDGET_FIELDS), entries.map((entry) => entry[1]));
  const types = { text: 'string', textarea: 'string', select: 'string', number: 'number', checkbox: 'boolean', image: 'string', richtext: 'string', color: 'string' };
  const fieldDefinitions = new Map([...registry.matchAll(/const (\w+) = \{ key: '([^']+)', label: '[^']*', type: '([^']+)'/g)]
    .map((field) => [field[1], { key: field[2], type: types[field[3]] }]));
  for (const [, id, refs = ''] of entries) {
    const fields = [{ title: 'string' }, { backgroundColor: 'string' }, { textColor: 'string' }];
    for (const ref of refs.split(',').map((field) => field.trim()).filter(Boolean)) {
      const field = fieldDefinitions.get(ref);
      assert.ok(field, `Missing registry field definition: ${ref}`);
      fields.push({ [field.key]: field.type });
    }
    assert.deepEqual(widgets.PUBLIC_WIDGET_FIELDS[id], Object.assign({}, ...fields));
  }
});

test('GET defaults to an empty public state; PUT persists placements and layouts and supports clearing', async () => {
  const api = harness();
  assert.deepEqual((await api.request('GET', {}, {})).body.data, { placements: [], layouts: [] });
  const placements = [placement({ extraPrivateMetadata: 'not persisted' }), placement({ id: 'second', pagePath: '/news/community', slot: 'left' })];
  const layouts = [{ pagePath: '/', layoutId: 'single-column' }, { pagePath: '/news/community', layoutId: 'three-column-header-footer' }];
  const response = await api.request('PUT', { placements, layouts });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, { placements: placements.map(({ extraPrivateMetadata, ...entry }) => entry), layouts });
  assert.equal(api.writes[0].resource, 'widget_placements');
  assert.deepEqual((await api.request('GET', {}, {})).body.data, response.body.data);
  assert.equal((await api.request('PUT', { placements: [], layouts: [] })).status, 200);
  assert.deepEqual((await api.request('GET', {}, {})).body.data, { placements: [], layouts: [] });
});

test('public GET never returns private metadata or unregistered config fields/types', async () => {
  const stored = [placement({ secret: 'private', config: { title: 'Public', limit: 'wrong', token: 'private', users: [{ email: 'private' }] } }),
    placement({ id: 'invalid', widgetId: 'private-widget' }), null];
  const api = harness({ stored });
  for (const url of ['/api/widget-placements', '/api/content-single/widget_placements', '/api/content-single/WIDGET_PLACEMENTS']) {
    const response = await api.request('GET', {}, {}, url);
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.data, { placements: [placement({ config: { title: 'Public' } })], layouts: [] });
    assert.ok(!JSON.stringify(response.body).includes('private'));
  }
  assert.equal(api.writes.length, 0);
  for (const value of [null, {}, 'bad', 1]) assert.deepEqual(widgets.projectPublicWidgetPlacements(value), { placements: [], layouts: [] });
});

test('PUT requires a stored active approved Admin/Super Admin, not a role header', async () => {
  for (const options of [
    { users: [] }, { users: null },
    ...['Member', 'CMS Editor', ''].map((role) => ({ users: [{ ...admin, role }] })),
    ...[false, undefined, 'true', 1].map((isActive) => ({ users: [{ ...admin, isActive }] })),
    ...['pending', 'rejected', undefined, ''].map((approvalStatus) => ({ users: [{ ...admin, approvalStatus }] }))
  ]) {
    const api = harness(options);
    assert.equal((await api.request()).status, 403, JSON.stringify(options));
    assert.equal(api.writes.length, 0);
  }
  for (const actor of [{}, { 'x-actor-role': 'Super Admin' }, { ...headers, 'x-actor-email': 'unknown@example.test' }, { ...headers, 'x-actor-role': 'Super Admin' }]) {
    const api = harness();
    assert.equal((await api.request('PUT', undefined, actor)).status, 403);
    assert.equal(api.writes.length, 0);
  }
  for (const role of ['Admin', 'Super Admin']) {
    for (const actorRole of [role, undefined]) {
      const api = harness({ users: [{ ...admin, role }] });
      assert.equal((await api.request('PUT', undefined, { 'x-actor-email': ' ADMIN@EXAMPLE.TEST ', 'x-actor-role': actorRole })).status, 200);
    }
  }
});

test('page paths reject private/auth, standalone display, malformed, and remote paths', () => {
  const denied = ['/admin', '/admin/cms', '/api', '/api/health', '/auth/login', '/auth', '/login', '/join', '/logout', '/signup', '/register', '/reset-password', '/forgot-password',
    '/quick-donate', '/quick-donate/success', '/quick-donate-board', '/donation-board', '/event-calendar-board', '/langar-board', '/daily-schedule-board',
    '/led-boards', '/special-events-board', '/community-announcements-board', '/welcome-journey-board', '/hukamnama-board', '/recitation-board', '/board', '/boards',
    '/stream-overlay', '/granthi-remote', '/ask-a-granthi', '//evil.test', 'https://evil.test', '/UPPER', '/news?x=1', '/news#x', '/a/../admin', '/%61dmin', '/a\\admin', '/a//b', '', '/-bad', '/a_b', '/a' + 'b'.repeat(159)];
  for (const pagePath of denied) assert.throws(() => widgets.validateWidgetPlacements({ placements: [placement({ pagePath })] }), undefined, pagePath);
  for (const pagePath of ['/', '/news', '/news/', '/news/community-2026', '/family-dashboard', '/administrator', '/a' + 'b'.repeat(158)]) {
    assert.equal(widgets.validateWidgetPlacements({ placements: [placement({ pagePath })] }).placements[0].pagePath, pagePath);
  }
});

test('Sikh widgets only accept supported sources, banis and Ang numbers', () => {
  for (const [widgetId, config] of [
    ['gurdwara-hukamnama', { gurdwara: 'https://untrusted.example' }],
    ['gurbani-ang', { ang: 0 }], ['gurbani-ang', { ang: 1431 }], ['gurbani-ang', { ang: 1.5 }],
    ['nitnem-reader', { bani: 'Unknown bani' }]
  ]) assert.throws(() => widgets.validateWidgetPlacements({ placements: [placement({ widgetId, config })] }));
  for (const gurdwara of ['Sri Harmandir Sahib (BaniDB)', 'Singh Sabha Milton']) {
    assert.equal(widgets.validateWidgetPlacements({ placements: [placement({ widgetId: 'gurdwara-hukamnama', config: { gurdwara } })] }).placements[0].config.gurdwara, gurdwara);
  }
});

test('custom photo and rich-text widgets validate dimensions, colors, and content size', () => {
  const valid = placement({ widgetId: 'photo-only', config: {
    title: 'Sangat photo', imageUrl: 'https://example.test/photo.jpg', imageAlt: 'Sangat', imageWidth: 1200, imageHeight: 800, imageFit: 'cover', backgroundColor: '#ffffff', textColor: '#123456'
  } });
  assert.equal(widgets.validateWidgetPlacements({ placements: [valid] }).placements[0].config.imageWidth, 1200);
  for (const config of [
    { imageUrl: 'javascript:alert(1)' }, { imageUrl: '//evil.example/image.png' }, { imageWidth: 1921 },
    { imageHeight: 0 }, { imageFit: 'stretch' }, { backgroundColor: 'red' }, { textColor: '#12zz00' }
  ]) assert.throws(() => widgets.validateWidgetPlacements({ placements: [placement({ widgetId: 'photo-only', config })] }));
  assert.equal(widgets.validateWidgetPlacements({ placements: [placement({ widgetId: 'rich-content', config: { contentHtml: '<p>Safe</p>', backgroundColor: '#fef3c7', textColor: '#713f12' } })] }).placements[0].config.contentHtml, '<p>Safe</p>');
  assert.throws(() => widgets.validateWidgetPlacements({ placements: [placement({ widgetId: 'rich-content', config: { contentHtml: 'x'.repeat(50001) } })] }));
});

test('validation rejects bad arrays, identifiers, config keys, unknown types, and prototypes atomically', async () => {
  const invalidEntries = [null, [], 1, 'bad',
    ...['', ' ', 'a'.repeat(121), 5, null].map((id) => placement({ id })),
    ...['unknown', '__proto__', 'constructor', null, 5].map((widgetId) => placement({ widgetId })),
    ...[null, [], 'bad', 3, { token: 'private' }, { title: 'a'.repeat(2001) }, { title: false }, { limit: '4' }, { limit: null }, { title: {} }, { title: [] }, { showDate: 1 },
      Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`field${i}`, 'value'])),
      ...['__proto__', 'constructor', 'prototype'].map((key) => JSON.parse(`{"${key}":"bad"}`))].map((config) => placement({ config }))];
  for (const entry of invalidEntries) {
    const api = harness();
    const response = await api.request('PUT', { placements: [placement({ id: 'valid-first' }), entry] });
    assert.equal(response.status, 400, JSON.stringify(entry));
    assert.equal(api.writes.length, 0);
  }
  for (const body of [{}, { placements: null }, { placements: {} }, { placements: Array(101).fill(placement()) }, { placements: [placement(), placement()] }, { placements: [], layouts: {} }, { placements: [], extra: true },
    JSON.parse('{"placements":[],"__proto__":{}}')]) {
    assert.equal((await harness().request('PUT', body)).status, 400);
  }
  for (const config of [{ limit: Infinity }, { limit: NaN }, { title: undefined }, { title: () => {} }, { title: 1n }, Object.create({ title: 'inherited' })]) {
    assert.throws(() => widgets.validateWidgetPlacements({ placements: [placement({ config })] }));
  }
  assert.throws(() => widgets.validateWidgetPlacements({ placements: [Object.assign(Object.create({ private: true }), placement())] }));
  assert.equal({}.polluted, undefined);
});

test('maximum valid boundaries and all registry widget IDs are accepted', () => {
  const placements = Array.from({ length: 100 }, (_, i) => placement({ id: `${i}`.padEnd(120, 'a'), config: { title: 'a'.repeat(2000), limit: 0 } }));
  assert.equal(widgets.validateWidgetPlacements({ placements }).placements.length, 100);
  for (const widgetId of Object.keys(widgets.PUBLIC_WIDGET_FIELDS)) {
    assert.equal(widgets.validateWidgetPlacements({ placements: [placement({ widgetId, config: {} })] }).placements[0].widgetId, widgetId);
  }
});

test('generic singleton PUT cannot bypass authorization or validation, even for admins', async () => {
  for (const resource of ['widget_placements', 'WIDGET_PLACEMENTS']) {
    for (const actor of [{}, headers]) {
      const api = harness();
      const response = await api.request('PUT', { placements: [] }, actor, `/api/content-single/${resource}`);
      assert.equal(response.status, 403);
      assert.equal(api.writes.length, 0);
    }
  }
});

test('JSON parsing, storage failures, OPTIONS, methods, and rate limits are handled safely', async () => {
  for (const [body, status] of [['', 400], ['{', 400], ['[]', 400], ['null', 400], ['x'.repeat(2 * 1024 * 1024 + 1), 413]]) {
    const api = harness();
    assert.equal((await api.request('PUT', body)).status, status);
    assert.equal(api.writes.length, 0);
  }
  assert.equal((await harness({ connected: false }).request()).status, 503);
  for (const [options, method] of [[{ failRead: true }, 'GET'], [{ failWrite: true }, 'PUT']]) {
    const response = await harness(options).request(method);
    assert.equal(response.status, 500);
    assert.ok(!JSON.stringify(response.body).includes('PRIVATE'));
  }
  const api = harness();
  assert.equal((await api.request('OPTIONS')).status, 204);
  for (const method of ['POST', 'PATCH', 'DELETE']) assert.equal((await api.request(method)).status, 405);
  assert.equal(api.reads.length, 0);
  assert.equal(api.writes.length, 0);
  const limited = harness({ rateLimited: true });
  assert.equal((await limited.request('GET')).status, 429);
  assert.equal(limited.reads.length, 0);
});