const test = require('node:test');
const assert = require('node:assert/strict');
const { createWelcomeJourneyHandler } = require('./welcomeJourneyApi');
const { DEFAULT_WELCOME_JOURNEY_SETTINGS } = require('./welcomeJourney');

const adminUser = { email: 'admin@example.test', role: 'Super Admin', isActive: true, approvalStatus: 'approved' };
const adminHeaders = { authorization: 'Bearer live-google-access-token', 'x-actor-email': adminUser.email, 'x-actor-role': adminUser.role };
const settingsPath = '/api/welcome-journey/settings';
const followUpsPath = '/api/welcome-journey/follow-ups';

const createHarness = ({ users = [adminUser], verifiedProfile = { email: adminUser.email, email_verified: true }, storedSettings = null } = {}) => {
  const writes = [];
  const followUps = [];
  const audits = [];
  let settings = storedSettings;
  const handler = createWelcomeJourneyHandler({
    eventsDb: {
      hasDatabaseConnection: true,
      listItems: async (resource) => resource === 'users' ? users : followUps,
      getSingleton: async (resource, fallback) => resource === 'welcome_journey_settings' ? settings ?? fallback : fallback,
      setSingleton: async (resource, value) => { settings = value; writes.push([resource, value]); return value; },
      createItem: async (resource, item) => { const saved = { ...item }; followUps.push(saved); return saved; }
    },
    getRequestActor: (request) => ({ email: request.headers['x-actor-email'] || '', role: request.headers['x-actor-role'] || '' }),
    parseJsonObjectBody: async (request) => request.body,
    verifyGoogleAccessToken: async (token) => { if (token !== 'live-google-access-token') throw new Error('invalid token'); return verifiedProfile; },
    appendAuditLog: async (_request, record) => { audits.push(record); },
    sendJson: (response, status, body) => Object.assign(response, { status, body })
  });
  return {
    writes, followUps, audits,
    async request(path, method = 'GET', body = {}, headers = {}, ip = 'unique-test-ip') {
      const response = {};
      await handler({ method, url: path, headers, body, socket: { remoteAddress: ip } }, response, new URL(path, 'http://localhost'));
      return response;
    }
  };
};

test('public settings use safe defaults and the existing admin portal token authorizes an approved account', async () => {
  const api = createHarness();
  const visitor = await api.request(settingsPath);
  assert.equal(visitor.status, 200);
  assert.equal(visitor.body.data.enabled, true);
  assert.equal(visitor.body.data.canSave, false);
  assert.equal(visitor.body.data.canSaveReason, 'google_sign_in_required');
  assert.deepEqual(visitor.body.data.dishes, []);
  const admin = await api.request(settingsPath, 'GET', {}, adminHeaders);
  assert.equal(admin.body.data.canSave, true);
  assert.equal(admin.body.data.canSaveReason, null);
  assert.equal(admin.body.data.followUpAvailable, true);
  const memberAccount = { ...adminUser, role: 'Admin' };
  const adminOnly = createHarness({ users: [memberAccount] });
  const adminAccess = await adminOnly.request(settingsPath, 'GET', {}, { ...adminHeaders, 'x-actor-role': 'Admin' });
  assert.equal(adminAccess.body.data.canSave, false);
  assert.equal(adminAccess.body.data.canSaveReason, 'super_admin_required');
  const expired = createHarness();
  const expiredAccess = await expired.request(settingsPath, 'GET', {}, { ...adminHeaders, authorization: 'Bearer expired-token' });
  assert.equal(expiredAccess.body.data.canSaveReason, 'google_session_expired');
});

test('only an active approved Super Admin can save settings and saves are audited', async () => {
  const api = createHarness();
  const payload = { ...DEFAULT_WELCOME_JOURNEY_SETTINGS, titleEnglish: 'New welcome', dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: '' }], selectedDishIds: ['dal'] };
  const result = await api.request(settingsPath, 'PUT', payload, adminHeaders);
  assert.equal(result.status, 200);
  assert.equal(result.body.data.titleEnglish, 'New welcome');
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0][0], 'welcome_journey_settings');
  assert.equal(api.audits[0].action, 'welcome_journey.settings.update');
  for (const options of [
    { headers: { ...adminHeaders, 'x-actor-email': 'victim@example.test' } },
    { headers: { ...adminHeaders, authorization: 'Bearer google-session-token-1' } },
    { headers: adminHeaders, verifiedProfile: { email: adminUser.email, email_verified: false } },
    { headers: adminHeaders, users: [{ ...adminUser, isActive: false }] },
    { headers: adminHeaders, users: [{ ...adminUser, approvalStatus: 'pending' }] },
    { headers: adminHeaders, users: [{ ...adminUser, role: 'Admin' }] }
  ]) {
    const denied = createHarness(options);
    assert.equal((await denied.request(settingsPath, 'PUT', payload, options.headers || adminHeaders)).status, 403);
    assert.equal(denied.writes.length, 0);
  }
  const invalid = await api.request(settingsPath, 'PUT', { ...payload, privateKey: 'blocked' }, adminHeaders);
  assert.equal(invalid.status, 400);
});

test('visitors can submit only consented follow-ups, and only authorized admins can read private records', async () => {
  const api = createHarness();
  const body = { name: 'Sangat Visitor', email: 'VISITOR@example.test', phone: '', message: 'Please contact me', consent: true, website: '' };
  const submitted = await api.request(followUpsPath, 'POST', body, {}, 'submitter-ip');
  assert.equal(submitted.status, 201);
  assert.equal(submitted.body.data.email, undefined);
  assert.equal(api.followUps[0].email, 'visitor@example.test');
  assert.equal((await api.request(followUpsPath, 'GET')).status, 403);
  assert.equal((await api.request(followUpsPath, 'GET', {}, adminHeaders)).body.data[0].email, 'visitor@example.test');
  assert.equal((await api.request(followUpsPath, 'POST', { ...body, consent: false }, {}, 'no-consent-ip')).status, 400);
  assert.equal((await api.request(followUpsPath, 'POST', { ...body, website: 'bot' }, {}, 'bot-ip')).status, 400);
});

test('follow-up requests are rate limited and disabled when the feature is off', async () => {
  const api = createHarness();
  const body = { name: 'Visitor', email: 'visitor@example.test', consent: true };
  for (let index = 0; index < 5; index += 1) assert.equal((await api.request(followUpsPath, 'POST', body, {}, 'rate-limited-ip')).status, 201);
  assert.equal((await api.request(followUpsPath, 'POST', body, {}, 'rate-limited-ip')).status, 429);
  const disabled = createHarness({ storedSettings: { ...DEFAULT_WELCOME_JOURNEY_SETTINGS, showFollowUp: false } });
  assert.equal((await disabled.request(followUpsPath, 'POST', body, {}, 'disabled-ip')).status, 403);
});
