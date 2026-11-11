const crypto = require('crypto');

const normalizeSmsPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return '';
};

const shouldSendReconciledZeffySms = ({ payment, alreadyPersisted = false, now = Date.now() } = {}) => {
  if (alreadyPersisted) return false;
  const createdAtMs = Number(payment?.created) * 1000;
  const ageMs = Number(now) - createdAtMs;
  return Number.isFinite(createdAtMs) && createdAtMs > 0 && ageMs >= -5 * 60 * 1000 && ageMs <= 24 * 60 * 60 * 1000;
};

// Require an explicitly named SMS/text consent question, not the presence of a phone.
const zeffySmsConsent = (payment = {}) => {
  const affirmative = (value) => {
    if (value === true || value === 1) return true;
    if (Array.isArray(value)) return value.some(affirmative);
    if (value && typeof value === 'object') {
      return [value.value, value.answer, value.response, value.text, value.label, value.selected_option]
        .some(affirmative);
    }
    return /^(yes|true|1|agree\b|i agree\b|i consent\b|consent\b|opt[ -]?in\b)(?:[,! ]+.*)?$/i.test(String(value || '').trim());
  };
  const normalizeLabel = (value) => String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const isConsentPrompt = (value) => {
    const label = normalizeLabel(value);
    const exactSmsKey = /^(sms|text message) consent$/.test(label)
      || /^(consent|agree) to (receive )?(sms|text messages?)$/.test(label);
    const channel = /\b(sms|texts?|text messages?)\b/.test(label);
    const consentLanguage = /\b(consent|agree|agreement|opt in|opted in|permission|authorize|receive|would you like)\b/.test(label);
    return exactSmsKey || (channel && consentLanguage);
  };

  for (const fields of [payment.custom_fields, payment.customFields, payment.answers]) {
    const entries = Array.isArray(fields)
      ? fields.map((field) => ({
        labels: [field?.key, field?.name, field?.label, field?.question, field?.slug, field?.field_name, field?.title],
        values: [field?.value, field?.answer, field?.response, field?.text, field?.selected_option]
      }))
      : Object.entries(fields || {}).map(([key, value]) => ({
        labels: [key],
        values: [value]
      }));

    if (entries.some(({ labels, values }) => labels.some(isConsentPrompt) && values.some(affirmative))) {
      return true;
    }
  }
  return false;
};

const createDonationSms = ({ db, env = process.env, fetchImpl = fetch, logger = console }) => {
  const send = async (donation, consent) => {
    const provider = String(donation?.paymentProvider || '').toUpperCase();
    const skip = (reason) => {
      if (provider === 'ZEFFY') logger.warn('[donation-sms] Zeffy acknowledgement skipped.', { reason });
      return { skipped: true };
    };
    if (env.SMS_ENABLED !== 'true') return skip('sms_disabled');
    if (consent !== true) return skip('explicit_consent_not_found');
    if (String(donation?.paymentStatus).toUpperCase() !== 'PAID') return skip('payment_not_paid');
    const to = normalizeSmsPhone(donation.donorPhone || donation.phone);
    if (!to) return skip('missing_or_unsupported_phone');
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM_NUMBER) return skip('twilio_configuration_missing');
    const transaction = donation.gatewayTransactionId || donation.stripeSessionId || donation.id;
    if (!transaction) return { skipped: true };
    const id = crypto.createHash('sha256').update(`${donation.paymentProvider}:${transaction}`).digest('hex');
    // A unique database insert claims the send across duplicate webhooks/processes.
    // Never auto-retry an ambiguous provider timeout: it may already have sent.
    try {
      await db.createItem('donation_sms_delivery', { id, status: 'sending', smsConsent: true, consentSource: donation.paymentProvider === 'ZEFFY' ? 'verified-zeffy-form' : 'admin-attestation', createdAt: new Date().toISOString() });
    } catch (error) {
      if (['23505', 'ER_DUP_ENTRY'].includes(error.code)) return { duplicate: true };
      throw error;
    }
    try {
      const organization = String(env.SMS_ORGANIZATION_NAME || env.ORGANIZATION_NAME || 'Your Gurdwara');
      const amount = Number(donation.amount).toFixed(2);
      const donorName = String(donation.donorName || '').replace(/\s+/g, ' ').trim();
      const campaignName = String(donation.campaignName || '').replace(/\s+/g, ' ').trim();
      const greeting = donorName ? `${donorName}${/\bji$/i.test(donorName) ? '' : ' ji'}` : 'Sangat ji';
      const body = `${organization}: Thank you ${greeting} for your donation of CAD ${amount}${campaignName ? ` for ${campaignName}` : ''}. Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh.`;
      const response = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.TWILIO_ACCOUNT_SID)}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: to, From: env.TWILIO_FROM_NUMBER, Body: body }),
        signal: AbortSignal.timeout(12000)
      });
      const result = await response.json().catch(() => ({}));
      await db.updateItem('donation_sms_delivery', id, { status: response.ok ? 'accepted' : 'failed', providerId: result.sid || '', errorCode: result.code || null });
      if (!response.ok) {
        logger.error('[donation-sms] Twilio rejected acknowledgement.', { status: response.status, errorCode: result.code || null });
      }
      return { accepted: response.ok };
    } catch (error) {
      await db.updateItem('donation_sms_delivery', id, { status: 'unknown' });
      logger.error('[donation-sms] Provider outcome unknown; manual review required.');
      return { accepted: false };
    }
  };
  return { send };
};

module.exports = { createDonationSms, normalizeSmsPhone, shouldSendReconciledZeffySms, zeffySmsConsent };