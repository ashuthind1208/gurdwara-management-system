const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { verifyQuickDonation } = require('./quickDonateStatus');

// Execute the actual payment route blocks with isolated Stripe/database doubles.
// No server bootstrap, credentials, database connection or external requests are used.
const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const between = (start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `Missing payment test anchor: ${start}`);
  return source.slice(from, to);
};
const routes = between("  if (requestUrl.pathname === '/api/stripe/quick-donate-config'", "  if (requestUrl.pathname === '/api/stripe/create-checkout-session'");
const webhook = between("  if (requestUrl.pathname === '/api/stripe/webhook'", "  if (requestUrl.pathname === '/api/zeffy/webhook'");
const mapping = between('const mapWebhookDonation =', 'const summarizeByCampaign =');
const reconciliation = between('const reconcilePaidPendingDonations =', 'const clearDonations =');
const numberValidation = between('const readNumberField =', 'const readBooleanField =');

const campaign = { id: 7, name: 'Building fund', isActive: true, isClosed: false, paymentProvider: 'STRIPE', target: 1000, raised: 10 };
const intent = {
  id: 'pi_guest', client_secret: 'pi_guest_secret_test', status: 'succeeded',
  livemode: false, currency: 'cad', amount: 1234, amount_received: 1234, created: 1700000000,
  metadata: { quick_donate: 'true', pending_id: 'quick-pending', campaign_id: '7', campaign_name: campaign.name }
};
const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const setup = (options = {}) => {
  const ledger = new Map();
  const created = [];
  const removed = [];
  const totals = [];
  const pending = [];
  const checkoutReads = [];
  const verifiedIntent = { ...intent, ...options.intent };
  const stripe = {
    paymentIntents: {
      create: async (payload) => { created.push(payload); return { ...verifiedIntent, metadata: payload.metadata }; },
      retrieve: async () => verifiedIntent
    },
    checkout: { sessions: { retrieve: async (id) => {
      checkoutReads.push(id);
      return { id, status: 'complete', payment_status: 'paid', amount_total: 500, metadata: { campaign_id: '7' } };
    } } },
    webhooks: { constructEvent: (body, signature, secret) => {
      assert.equal(signature, 'fixture-signature');
      assert.equal(secret, 'fixture-signing-secret');
      if (options.invalidSignature) throw new Error('Invalid signature');
      return options.event || { id: 'evt_guest', type: 'payment_intent.succeeded', data: { object: verifiedIntent } };
    } }
  };
  const context = vm.createContext({
    crypto, stripe, verifyQuickDonation,
    stripeSecretKey: options.secretKey ?? 'sk_test_fixture',
    stripePublishableKey: options.publicKey ?? 'pk_test_fixture',
    stripeWebhookSecret: 'fixture-signing-secret',
    maxJsonBodyBytes: 16384,
    request: { method: options.method || 'POST', headers: { 'stripe-signature': 'fixture-signature' } },
    requestUrl: { pathname: options.pathname || '/api/stripe/create-quick-donate-intent' },
    response: {},
    parseJsonObjectBody: async () => options.body || { campaignId: 7, amountCents: 1234 },
    ensureNoUnknownKeys: (body, allowed) => { if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Unknown field'); },
    assertInput: (condition, message) => { if (!condition) fail(message); },
    throwInputError: fail,
    requireStripeClient: () => stripe,
    getDonationCampaigns: async () => options.campaigns || [campaign],
    createPendingDonation: async (row) => { pending.push(row); },
    getPendingDonations: async () => options.pending || [],
    removePendingDonation: async (id) => { removed.push(id); },
    upsertDonation: async (row) => { ledger.set(row.id, row); return row; },
    syncCampaignRaisedTotal: async (row) => { totals.push(row); },
    attachDonationReceiptToBooking: async () => {},
    readBody: async () => Buffer.from('fixture-body'),
    logServerError: () => {},
    sendJson: (_response, code, body) => { context.result = { code, body }; }
  });
  vm.runInContext(`${numberValidation}\n${mapping}\n${reconciliation}`, context);
  return {
    ledger, created, removed, totals, pending, checkoutReads,
    route: async () => { await vm.runInContext(`(async () => { ${routes} })()`, context); return context.result; },
    webhook: async () => {
      context.requestUrl.pathname = '/api/stripe/webhook';
      context.request.method = 'POST';
      await vm.runInContext(`(async () => { ${webhook} })()`, context);
      return context.result;
    },
    reconcile: () => vm.runInContext('reconcilePaidPendingDonations()', context)
  };
};

test('creates only a CAD wallet intent with server-owned campaign metadata and anonymous pending record', async () => {
  const deps = setup();
  const result = await deps.route();
  assert.equal(result.code, 200);
  assert.equal(deps.created.length, 1);
  assert.equal(deps.created[0].amount, 1234);
  assert.equal(deps.created[0].currency, 'cad');
  assert.equal(deps.created[0].metadata.campaign_id, '7');
  assert.equal(deps.created[0].metadata.quick_donate, 'true');
  assert.equal(deps.pending[0].donorName, 'Anonymous');
  assert.equal(deps.pending[0].sessionId, 'pi_guest');
  assert.equal(deps.ledger.size, 0);
});

for (const keys of [{ secretKey: '' }, { publicKey: '' }, { secretKey: 'sk_live_fixture' }, { publicKey: 'pk_live_fixture' }]) {
  test(`fails closed for missing/live wallet keys (${Object.keys(keys)[0]})`, async () => {
    const deps = setup(keys);
    assert.equal((await deps.route()).code, 503);
    assert.equal(deps.created.length, 0);
    const config = await setup({ ...keys, pathname: '/api/stripe/quick-donate-config', method: 'GET' }).route();
    assert.equal(config.body.data.configured, false);
    assert.equal(config.body.data.publishableKey, '');
  });
}

test('config exposes only the test publishable key, never merchant/signing keys', async () => {
  const result = await setup({ pathname: '/api/stripe/quick-donate-config', method: 'GET' }).route();
  assert.equal(JSON.stringify(result.body.data), JSON.stringify({ configured: true, publishableKey: 'pk_test_fixture' }));
});

for (const body of [{ campaignId: 7 }, { amountCents: 100 }, { campaignId: 7, amountCents: 99 }, { campaignId: 7, amountCents: 1000001 }, { campaignId: 7, amountCents: 100.5 }, { campaignId: 7, amountCents: '100' }, { campaignId: 7, amountCents: 100, donorEmail: 'fixture@example.com' }]) {
  test(`rejects missing/invalid/client-owned creation fields (${JSON.stringify(body)})`, async () => {
    const deps = setup({ body });
    assert.equal((await deps.route()).code, 400);
    assert.equal(deps.created.length, 0);
  });
}

for (const override of [{ id: 8 }, { isActive: false }, { isActive: undefined }, { isClosed: true }, { isClosed: undefined }, { paymentProvider: 'ZEFFY' }, { raised: 1000 }]) {
  test(`rejects unavailable, different or non-Stripe campaign (${JSON.stringify(override)})`, async () => {
    const deps = setup({ campaigns: [{ ...campaign, ...override }] });
    assert.ok([404, 409].includes((await deps.route()).code));
    assert.equal(deps.created.length, 0);
  });
}

test('guest verification, signed webhook and reconciliation share a stable paid ledger ID', async () => {
  const deps = setup({ pathname: '/api/stripe/quick-donate-status', body: { paymentIntentId: intent.id, clientSecret: intent.client_secret }, pending: [{ id: 'quick-pending', sessionId: intent.id, paymentProvider: 'STRIPE', campaignId: 7 }] });
  assert.equal((await deps.route()).body.data.status, 'succeeded');
  assert.equal((await deps.webhook()).code, 200);
  await deps.reconcile();
  assert.equal(deps.ledger.size, 1);
  assert.equal(deps.ledger.get('stripe-pi_guest').amount, 12.34);
  assert.equal(deps.removed.length, 3);
  assert.equal(deps.checkoutReads.length, 0);
});

for (const override of [{ livemode: true }, { currency: 'usd' }, { metadata: {} }, { status: 'processing' }]) {
  test(`does not reconcile unsafe or incomplete wallet intents (${JSON.stringify(override)})`, async () => {
    const deps = setup({ intent: override, pending: [{ id: 'quick-pending', sessionId: intent.id, paymentProvider: 'STRIPE' }] });
    await deps.reconcile();
    assert.equal(deps.ledger.size, 0);
    assert.equal(deps.removed.length, 0);
  });
}

for (const override of [{ livemode: true }, { currency: 'usd' }, { metadata: {} }]) {
  test(`ignores unrelated/live Quick Donate webhook intents (${JSON.stringify(override)})`, async () => {
    const deps = setup({ intent: override });
    assert.equal((await deps.webhook()).code, 200);
    assert.equal(deps.ledger.size, 0);
  });
}

test('rejects invalid webhook signatures without recording a donation', async () => {
  const deps = setup({ invalidSignature: true });
  assert.equal((await deps.webhook()).code, 400);
  assert.equal(deps.ledger.size, 0);
});

test('continues reconciling legacy hosted-checkout pending records', async () => {
  const deps = setup({ pending: [{ id: 'legacy-pending', sessionId: 'cs_fixture', paymentProvider: 'STRIPE', campaignId: 7 }] });
  await deps.reconcile();
  assert.deepEqual(deps.checkoutReads, ['cs_fixture']);
  assert.equal(deps.ledger.get('stripe-cs_fixture').amount, 5);
  assert.deepEqual(deps.removed, ['legacy-pending']);
});