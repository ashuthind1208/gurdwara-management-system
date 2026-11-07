const crypto = require('crypto');

// The client secret is a payment-scoped capability, not a website login.
const verifyQuickDonation = async ({ paymentIntentId, clientSecret }, { stripe, persist }) => {
  if (!/^pi_[a-zA-Z0-9_]+$/.test(paymentIntentId || '')
    || typeof clientSecret !== 'string' || clientSecret.length > 300
    || !clientSecret.startsWith(`${paymentIntentId}_secret_`)) {
    throw Object.assign(new Error('Invalid payment confirmation.'), { status: 400 });
  }
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  const expected = Buffer.from(intent.client_secret || '');
  const supplied = Buffer.from(clientSecret);
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)
    || intent.metadata?.quick_donate !== 'true' || intent.livemode !== false || intent.currency !== 'cad') {
    throw Object.assign(new Error('Payment could not be verified.'), { status: 404 });
  }
  // Persist only server-verified successful payments, using the same stable ID as the webhook.
  if (intent.status === 'succeeded') await persist(intent);
  return { status: intent.status, amount: intent.amount_received || intent.amount, currency: intent.currency };
};

module.exports = { verifyQuickDonation };