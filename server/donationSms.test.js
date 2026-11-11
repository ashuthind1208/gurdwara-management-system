const test = require('node:test');
const assert = require('node:assert/strict');
const { createDonationSms, normalizeSmsPhone, shouldSendReconciledZeffySms, zeffySmsConsent } = require('./donationSms');

test('SMS phones and consent must be explicit', () => {
  assert.equal(normalizeSmsPhone('(905) 555-0123'), '+19055550123');
  assert.equal(normalizeSmsPhone('+44 7700 900123'), '');
  assert.equal(zeffySmsConsent({ buyer: { phone: '9055550123' } }), false);
  assert.equal(zeffySmsConsent({ custom_fields: { sms_consent: 'Yes' } }), true);
  assert.equal(zeffySmsConsent({ customFields: [{ label: 'I agree to receive a text message acknowledgement', value: 'Yes, I agree' }] }), true);
  assert.equal(zeffySmsConsent({ answers: [{ question: 'SMS consent', response: { value: 'I consent' } }] }), true);
  assert.equal(zeffySmsConsent({ answers: [{ question: 'Text message opt-in', answer: 'I agree to receive donation updates' }] }), true);
  assert.equal(zeffySmsConsent({ answers: [{ label: 'Consent to donation SMS', answer: 'No' }] }), false);
  assert.equal(zeffySmsConsent({ answers: [{ label: 'Consent to donation SMS', answer: 'I do not agree' }] }), false);
  assert.equal(zeffySmsConsent({ custom_fields: [{ label: 'SMS updates', value: 'Yes' }] }), false);
});

test('reconciliation SMS is restricted to new verified payments from the last 24 hours', () => {
  const now = Date.UTC(2026, 9, 18, 12, 0, 0);
  const recentPayment = { created: Math.floor((now - 60 * 60 * 1000) / 1000) };
  const oldPayment = { created: Math.floor((now - 25 * 60 * 60 * 1000) / 1000) };
  assert.equal(shouldSendReconciledZeffySms({ payment: recentPayment, now }), true);
  assert.equal(shouldSendReconciledZeffySms({ payment: recentPayment, alreadyPersisted: true, now }), false);
  assert.equal(shouldSendReconciledZeffySms({ payment: oldPayment, now }), false);
  assert.equal(shouldSendReconciledZeffySms({ payment: {}, now }), false);
});

test('send only paid opted-in donations, and claim each transaction once', async () => {
  const claims = new Set();
  const updates = [];
  let sent = 0;
  let message = '';
  const db = {
    createItem: async (_, record) => {
      if (claims.has(record.id)) throw Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
      claims.add(record.id);
    },
    updateItem: async (_, id, record) => updates.push(record)
  };
  const sender = createDonationSms({ db, env: { SMS_ENABLED: 'true', TWILIO_ACCOUNT_SID: 'test', TWILIO_AUTH_TOKEN: 'test', TWILIO_FROM_NUMBER: '+19055550100' }, fetchImpl: async (_, options) => { sent += 1; message = options.body.get('Body'); return { ok: true, json: async () => ({ sid: 'SM-test' }) }; } });
  const donation = { id: 'd1', paymentProvider: 'ZEFFY', gatewayTransactionId: 'p1', paymentStatus: 'PAID', donorPhone: '9055550123', donorName: 'Test Donor', campaignName: 'Gurdwara Fund', amount: 50 };
  await sender.send(donation, false);
  await sender.send({ ...donation, paymentStatus: 'PENDING' }, true);
  assert.equal(sent, 0);
  assert.deepEqual(await sender.send(donation, true), { accepted: true });
  assert.deepEqual(await sender.send(donation, true), { duplicate: true });
  assert.equal(sent, 1);
  assert.equal(updates[0].status, 'accepted');
  assert.equal(message, 'Your Gurdwara: Thank you Test Donor ji for your donation of CAD 50.00 for Gurdwara Fund. Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.');
});

test('disabled configuration never sends or claims a donation', async () => {
  const sender = createDonationSms({ db: {}, env: {}, fetchImpl: () => { throw new Error('must not call'); } });
  assert.deepEqual(await sender.send({ paymentStatus: 'PAID' }, true), { skipped: true });
});