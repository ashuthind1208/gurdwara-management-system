const PREFIX = 'ssm-guest-payment:';
const ACTIVE_KEY = 'ssm-active-guest-payment';

// Store only the payment-scoped capability in this tab, never donor data or a merchant key.
export const readQuickDonateConfirmation = (paymentIntentId) => {
  if (!/^pi_[a-zA-Z0-9_]+$/.test(paymentIntentId || '')) return '';
  try {
    return sessionStorage.getItem(`${PREFIX}${paymentIntentId}`) || '';
  } catch {
    return '';
  }
};

export const saveQuickDonateConfirmation = ({ paymentIntentId, clientSecret }) => {
  if (!/^pi_[a-zA-Z0-9_]+$/.test(paymentIntentId || '')
    || !clientSecret?.startsWith(`${paymentIntentId}_secret_`)) return false;
  try {
    sessionStorage.setItem(`${PREFIX}${paymentIntentId}`, clientSecret);
    return true;
  } catch {
    return false;
  }
};

export const rememberActiveQuickDonation = (payment) => {
  if (!saveQuickDonateConfirmation(payment)) return false;
  try {
    sessionStorage.setItem(ACTIVE_KEY, payment.paymentIntentId);
    return true;
  } catch {
    return false;
  }
};

export const readActiveQuickDonation = () => {
  try {
    const id = sessionStorage.getItem(ACTIVE_KEY);
    return readQuickDonateConfirmation(id) ? id : '';
  } catch {
    return '';
  }
};

export const clearActiveQuickDonation = (paymentIntentId) => {
  try {
    if (sessionStorage.getItem(ACTIVE_KEY) === paymentIntentId) sessionStorage.removeItem(ACTIVE_KEY);
  } catch {
    // Storage can be blocked; server-side verification remains authoritative.
  }
};