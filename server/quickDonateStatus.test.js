const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyQuickDonation } = require('./quickDonateStatus');

const payment = { paymentIntentId: 'pi_guest', clientSecret: 'pi_guest_secret_test' };
const intent = {
  id: 'pi_guest', client_secret: payment.clientSecret, livemode: false, currency: 'cad',
  metadata: { quick_donate: 'true', pending_id: 'quick-123' },
  status: 'succeeded', amount: 1000, amount_received: 1000
};
const setup = (overrides = {}) => {
  const persisted = [];
  let retrieved = 0;
  return {
    persisted,
    get retrieved() { return retrieved; },
    stripe: { paymentIntents: { retrieve: async (id) => { retrieved++; assert.equal(id, 'pi_guest'); return { ...intent, ...overrides }; } } },
    persist: async (record) => persisted.push(record)
  };
};

test('confirms and persists a verified guest wallet payment without a donor account', async () => {
  const deps = setup();
  assert.deepEqual(await verifyQuickDonation(payment, deps), { status: 'succeeded', amount: 1000, currency: 'cad' });
  assert.equal(deps.persisted.length, 1);
});

for (const status of ['processing', 'requires_payment_method', 'canceled']) {
  test(`does not record ${status} as paid`, async () => {
    const deps = setup({ status });
    assert.equal((await verifyQuickDonation(payment, deps)).status, status);
    assert.equal(deps.persisted.length, 0);
  });
}

for (const overrides of [
  { client_secret: 'pi_guest_secret_other' }, { metadata: {} }, { livemode: true }, { currency: 'usd' }
]) {
  test(`rejects unrelated or unverified intent ${JSON.stringify(overrides)}`, async () => {
    const deps = setup(overrides);
    await assert.rejects(verifyQuickDonation(payment, deps), { status: 404 });
    assert.equal(deps.persisted.length, 0);
  });
}

test('requires a payment-scoped secret before contacting Stripe', async () => {
  const deps = setup();
  await assert.rejects(verifyQuickDonation({ paymentIntentId: 'pi_guest' }, deps), { status: 400 });
  assert.equal(deps.retrieved, 0);
});