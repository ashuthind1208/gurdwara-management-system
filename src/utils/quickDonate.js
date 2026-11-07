export const QUICK_DONATE_AMOUNTS = Object.freeze([5, 10, 20, 50, 100]);
export const QUICK_DONATE_CUSTOM_MIN_CENTS = 100;
export const QUICK_DONATE_CUSTOM_MAX_CENTS = 1000000;

export const parseQuickDonateCustomAmount = (value) => {
  const raw = String(value ?? '').trim();
  if (!/^\d{1,5}(?:\.\d{0,2})?$/.test(raw)) return null;
  const [whole, fraction = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0') || 0);
  return Number.isSafeInteger(cents) && cents >= QUICK_DONATE_CUSTOM_MIN_CENTS && cents <= QUICK_DONATE_CUSTOM_MAX_CENTS
    ? cents
    : null;
};

export const buildQuickDonatePath = (campaignId) => {
  if (campaignId === undefined || campaignId === null) return '/quick-donate';
  return `/quick-donate?${new URLSearchParams({ campaign: String(campaignId) })}`;
};

export const selectQuickDonateCampaign = (campaigns, campaignId) => {
  if (!Array.isArray(campaigns)) return null;
  const explicit = campaignId !== undefined && campaignId !== null;
  const matches = campaigns.filter((campaign) => {
    if (!campaign || campaign.isActive !== true || campaign.isClosed !== false) return false;
    const provider = String(campaign.paymentProvider || campaign.payment_provider || 'STRIPE').toUpperCase();
    if (provider !== 'STRIPE') return false;
    return explicit
      ? campaign.id !== undefined && campaign.id !== null && String(campaign.id) === String(campaignId)
      : true;
  });
  // Ambiguous configuration must not silently send a donor to another campaign.
  return matches.length === 1 ? matches[0] : null;
};