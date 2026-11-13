const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStreamOverlayHandler } = require('./streamOverlayApi');
const { createAuditCleanupHandler } = require('./auditCleanupApi');

// Exercise the real index wiring, actor/page guard and route dispatch without
// importing index.js (which would connect databases and start schedulers).
const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const section = (startMarker, endMarker) => {
  const start = source.indexOf(startMarker), end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `Missing integration boundary: ${startMarker}`);
  return source.slice(start, end);
};
const createHarness = ({ role = 'Broadcaster', active = true, approval = 'approved', access = ['/admin/recitations'], connected = true } = {}) => {
  const writes = [], parses = [];
  let saved = { overlays: [] };
  const eventsDb = {
    hasDatabaseConnection: connected,
    listItems: async (resource) => { assert.equal(resource, 'users'); return [{ email: 'operator@example.test', role, isActive: active, approvalStatus: approval }]; },
    getSingleton: async (resource) => resource === 'admin_roles' ? [{ name: role, adminPageAccess: access }] : structuredClone(saved),
    setSingleton: async (resource, value) => { writes.push(resource); saved = structuredClone(value); return value; },
    cleanupAuditLogs: async () => assert.fail('Overlay requests must never clean audit logs')
  };
  const context = {
    eventsDb, createStreamOverlayHandler, createAuditCleanupHandler,
    recitationService: { isProtectedResource: () => false },
    parseJsonObjectBody: async (request) => { parses.push(request.body); return request.body; },
    sendJson: (response, status, body) => Object.assign(response, { status, body }),
    assertInput: (condition, message, status = 400) => { if (!condition) throw Object.assign(new Error(message), { status }); },
    ensureNoUnknownKeys: (body, allowed) => assert.ok(Object.keys(body).every((key) => allowed.includes(key)))
  };
  const auth = section('const getRequestActor =', 'const getBookingVenueType =');
  const wiring = ['streamOverlayHandler', 'auditCleanupHandler'].map((name) => source.match(new RegExp(`^const ${name} = .+;$`, 'm'))?.[0]);
  assert.ok(wiring.every(Boolean));
  const routes = section('  if (await auditCleanupHandler(', "  if (requestUrl.pathname === '/api/ask-granthi/board'");
  const protectedContent = section('  const contentGuardMatch =', '  const ledContentMutationMatch =');
  const dispatch = vm.runInNewContext(`${auth}\n${wiring.join('\n')}\n(async (request, response, requestUrl) => { ${routes}\n${protectedContent}\nresponse.status = 418; })`, context);
  return {
    writes, parses,
    async request(url, method = 'GET', body, headers = { 'x-actor-email': 'operator@example.test', 'x-actor-role': role }) {
      const response = { setHeader() {} };
      await dispatch({ method, body, headers }, response, new URL(url, 'https://example.test'));
      return response;
    }
  };
};

test('real dispatcher denies anonymous, unknown, mismatched, inactive, unapproved and unauthorized profile access before parsing', async () => {
  const cases = [
    [{}, {}], [{}, { 'x-actor-email': 'unknown@example.test', 'x-actor-role': 'Super Admin' }],
    [{}, { 'x-actor-email': 'operator@example.test', 'x-actor-role': 'Super Admin' }],
    [{ active: false }], [{ approval: 'pending' }], [{ access: ['/admin/audit-trail'] }]
  ];
  for (const [options, headers] of cases) {
    const api = createHarness(options);
    for (const [suffix, method] of [['', 'GET'], ['', 'POST'], ['/id', 'PUT'], ['/id', 'PATCH'], ['/id', 'DELETE']]) {
      const response = await api.request(`/api/stream-overlay/overlays${suffix}`, method, {}, headers);
      assert.equal(response.status, 403, JSON.stringify({ options, headers, method }));
    }
    assert.deepEqual(api.parses, []); assert.deepEqual(api.writes, []);
  }
});

test('real dispatcher honors verified admin or page-specific role access and keeps public lookup anonymous', async () => {
  for (const options of [{}, { role: 'Admin', access: [] }, { role: 'Super Admin', access: [] }]) {
    const api = createHarness(options);
    assert.equal((await api.request('/api/stream-overlay/overlays')).status, 200);
    assert.equal((await api.request('/api/stream-overlay/public/missing', 'GET', undefined, {})).status, 404);
    assert.equal((await api.request('/api/stream-overlay/overlays', 'POST', {})).status, 400);
    assert.equal(api.parses.length, 1); assert.deepEqual(api.writes, []);
  }
});

test('real content guard blocks profile singleton and item bypasses for every method, including mixed-case resources', async () => {
  const api = createHarness({ role: 'Super Admin' });
  for (const prefix of ['/api/content/', '/api/content-single/']) {
    for (const resource of ['stream_overlay_profiles', 'STREAM_OVERLAY_PROFILES']) {
      for (const suffix of ['', '/id']) {
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await api.request(`${prefix}${resource}${suffix}`, method, {})).status, 404);
      }
    }
  }
  assert.deepEqual(api.parses, []); assert.deepEqual(api.writes, []);
});

test('real wiring preserves legacy access guards and database-unavailable responses without writes', async () => {
  const api = createHarness({ connected: false });
  assert.equal((await api.request('/api/stream-overlay/overlays')).status, 503);
  assert.equal((await api.request('/api/stream-overlay/public/missing', 'GET', undefined, {})).status, 503);
  assert.equal((await api.request('/api/stream-overlay/settings')).status, 503);
  assert.equal((await api.request('/api/stream-overlay/settings', 'PUT', {}, {})).status, 403);
  assert.deepEqual(api.writes, []); assert.deepEqual(api.parses, []);
});