import { serviceResponse } from './serviceResponse';
import { normalizeErrorMessage } from './publicError';
import { withZeffyDonorDetails } from '../utils/zeffy';
import { isCampaignProgressVisible, normalizeCampaignProgressStatus } from '../constants/campaignProgress';
import apiClient from './apiClient';

const LAST_PENDING_DONATION_KEY = 'ssm-donation-last-pending-id';

let pendingCache = [];

const normalizeCampaignProgressPhoto = (photo) => {
  if (!photo) {
    return '';
  }

  if (typeof photo === 'string') {
    return photo.trim();
  }

  if (typeof photo === 'object') {
    return String(photo.url || photo.src || '').trim();
  }

  return '';
};

const normalizeCampaignProgressUpdate = (update = {}) => {
  if (!update || typeof update !== 'object') {
    return null;
  }

  const date = String(update.date || '').trim();
  const title = String(update.title || '').trim();
  const description = String(update.description || '').trim();
  const amountRaw = Number(update.amount);

  return {
    date,
    title,
    description,
    amount: Number.isFinite(amountRaw) ? amountRaw : 0
  };
};

const normalizeCampaignProgressItem = (item = {}, index = 0) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const photosSource = Array.isArray(item.photos) ? item.photos : [];
  const status = normalizeCampaignProgressStatus(item.status, item.isActive);

  return {
    id: String(item.id || `progress-${index + 1}`),
    title: String(item.title || '').trim(),
    description: String(item.description || '').trim(),
    details: String(item.details || '').trim(),
    date: String(item.date || '').trim(),
    status,
    isActive: isCampaignProgressVisible(status),
    photos: photosSource.map((photo) => normalizeCampaignProgressPhoto(photo)).filter(Boolean)
  };
};

const normalizeCampaignStoryBlock = (item = {}, index = 0) => {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    id: String(item.id || `story-${index + 1}`),
    title: String(item.title || '').trim(),
    summary: String(item.summary || '').trim(),
    quote: String(item.quote || '').trim(),
    beneficiary: String(item.beneficiary || '').trim(),
    impactMetric: String(item.impactMetric || '').trim(),
    imageUrl: String(item.imageUrl || item.image_url || '').trim(),
    isActive: item.isActive !== false
  };
};

const normalizeCampaign = (campaign = {}) => {
  const raisedValue = Number(campaign.raised ?? 0);
  const targetValue = Number(campaign.target ?? 0);
  const raised = Number.isFinite(raisedValue) ? Math.max(0, raisedValue) : 0;
  const target = Number.isFinite(targetValue) ? Math.max(0, targetValue) : 0;
  const isClosed = target > 0 && raised >= target;
  const provider = String(campaign.paymentProvider || campaign.payment_provider || 'STRIPE').toUpperCase();
  const progressPhotosSource = Array.isArray(campaign.progressPhotos)
    ? campaign.progressPhotos
    : (Array.isArray(campaign.progress_photos) ? campaign.progress_photos : []);
  const progressUpdatesSource = Array.isArray(campaign.progressUpdates)
    ? campaign.progressUpdates
    : (Array.isArray(campaign.progress_updates) ? campaign.progress_updates : []);
  const progressItemsSource = Array.isArray(campaign.progressItems)
    ? campaign.progressItems
    : (Array.isArray(campaign.progress_items) ? campaign.progress_items : []);
  const storyBlocksSource = Array.isArray(campaign.storyBlocks)
    ? campaign.storyBlocks
    : (Array.isArray(campaign.story_blocks) ? campaign.story_blocks : []);

  return {
    id: Number(campaign.id),
    name: campaign.name || '',
    description: campaign.description || '',
    progressTitle: String(campaign.progressTitle || campaign.progress_title || '').trim(),
    progressDescription: String(campaign.progressDescription || campaign.progress_description || '').trim(),
    progressPhotos: progressPhotosSource
      .map((entry) => normalizeCampaignProgressPhoto(entry))
      .filter(Boolean),
    progressUpdates: progressUpdatesSource
      .map((entry) => normalizeCampaignProgressUpdate(entry))
      .filter(Boolean),
    progressItems: progressItemsSource
      .map((entry, index) => normalizeCampaignProgressItem(entry, index))
      .filter((entry) => Boolean(entry && entry.title)),
    storyBlocks: storyBlocksSource
      .map((entry, index) => normalizeCampaignStoryBlock(entry, index))
      .filter((entry) => Boolean(entry && (entry.title || entry.summary || entry.quote))),
    raised,
    target,
    isActive: isClosed ? false : Boolean(campaign.isActive ?? campaign.is_active ?? true),
    isClosed,
    paymentProvider: ['STRIPE', 'PAYPAL', 'ZEFFY'].includes(provider) ? provider : 'STRIPE',
    paymentLink: campaign.paymentLink || campaign.payment_link || '',
    stripeBuyButtonId: campaign.stripeBuyButtonId || campaign.stripe_buy_button_id || '',
    stripePublishableKey: campaign.stripePublishableKey || campaign.stripe_publishable_key || '',
    hasZeffyApiKey: Boolean(campaign.hasZeffyApiKey ?? campaign.has_zeffy_api_key)
  };
};

const normalizePending = (record = {}) => ({
  id: String(record.id || ''),
  campaignId: Number(record.campaignId || record.campaign_id || 0),
  campaignName: record.campaignName || record.campaign_name || '',
  donorName: record.donorName || record.donor_name || 'Anonymous',
  donorEmail: record.donorEmail || record.donor_email || '',
  donorPhone: record.donorPhone || record.donor_phone || '',
  amount: record.amount == null ? null : Number(record.amount),
  frequency: record.frequency || 'one-time',
  paymentProvider: String(record.paymentProvider || record.payment_provider || 'STRIPE').toUpperCase(),
  checkoutUrl: record.checkoutUrl || record.checkout_url || '',
  sessionId: record.sessionId || record.session_id || '',
  createdAt: record.createdAt || record.created_at || new Date().toISOString()
});

const normalizeDonation = (record = {}) => {
  const amountValue = Number(record.amount ?? 0);

  return {
    id: String(record.id || ''),
    receiptId: String(record.receiptId ?? record.receipt_id ?? ''),
    sourcePendingId: String(record.sourcePendingId ?? record.source_pending_id ?? ''),
    campaignId: record.campaignId != null || record.campaign_id != null
      ? Number(record.campaignId ?? record.campaign_id)
      : null,
    campaignName: String(record.campaignName ?? record.campaign_name ?? ''),
    donorName: String(record.donorName ?? record.donor_name ?? 'Anonymous'),
    donorEmail: String(record.donorEmail ?? record.donor_email ?? ''),
    donorPhone: String(record.donorPhone ?? record.donor_phone ?? record.phone ?? ''),
    amount: Number.isFinite(amountValue) ? amountValue : 0,
    frequency: String(record.frequency || 'one-time'),
    paymentProvider: String(record.paymentProvider ?? record.payment_provider ?? 'STRIPE').toUpperCase(),
    paymentStatus: String(record.paymentStatus ?? record.payment_status ?? 'PAID').toUpperCase(),
    gatewayTransactionId: String(record.gatewayTransactionId ?? record.gateway_transaction_id ?? ''),
    stripeSessionId: String(record.stripeSessionId ?? record.stripe_session_id ?? ''),
    stripeEventId: String(record.stripeEventId ?? record.stripe_event_id ?? ''),
    emailSent: Boolean(record.emailSent ?? record.email_sent),
    source: String(record.source || ''),
    createdAt: String(record.createdAt ?? record.created_at ?? new Date().toISOString()),
    updatedAt: String(record.updatedAt ?? record.updated_at ?? '')
  };
};

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || ''));

const applyCheckoutTemplate = (template, values) => {
  const replacements = {
    '{AMOUNT}': String(values.amount || ''),
    '{AMOUNT_CENTS}': String(values.amountCents || ''),
    '{EMAIL}': encodeURIComponent(values.email || ''),
    '{NAME}': encodeURIComponent(values.name || ''),
    '{CAMPAIGN}': encodeURIComponent(values.campaign || ''),
    '{REFERENCE}': encodeURIComponent(values.reference || '')
  };

  return Object.entries(replacements).reduce(
    (acc, [token, tokenValue]) => acc.split(token).join(tokenValue),
    String(template || '')
  );
};

const withQueryParams = (url, params) => {
  const next = new URL(String(url));
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      next.searchParams.set(key, String(value));
    }
  });
  return next.toString();
};

const extractAmountFromUrl = (url) => {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(String(url));
    const amountValue =
      parsedUrl.searchParams.get('amount') ||
      parsedUrl.searchParams.get('amount_total') ||
      parsedUrl.searchParams.get('amount_decimal') ||
      parsedUrl.searchParams.get('prefilled_amount') ||
      '';

    if (!amountValue) {
      return null;
    }

    const parsedNumber = Number(amountValue);
    if (!Number.isFinite(parsedNumber) || parsedNumber <= 0) {
      return null;
    }

    if (parsedUrl.searchParams.get('amount_cents')) {
      return parsedNumber / 100;
    }

    return parsedNumber;
  } catch {
    return null;
  }
};

const fetchJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false) {
    const error = new Error(normalizeErrorMessage({ response, message: data?.message }, `Unable to complete the request right now.`, 'donationService'));
    error.response = response;
    error.data = data;
    throw error;
  }
  return data;
};

const readCampaignsFromServer = async () => {
  const response = await fetchJson('/api/donation-campaigns');
  return Array.isArray(response.data) ? response.data.map(normalizeCampaign) : [];
};

const readPendingFromServer = async () => {
  const response = await fetchJson('/api/donation-pending');
  const rows = Array.isArray(response.data) ? response.data.map(normalizePending) : [];
  pendingCache = rows;
  return rows;
};

const readLatestPendingFromServer = async () => {
  const response = await fetchJson('/api/donation-pending/latest');
  const row = response.data ? normalizePending(response.data) : null;
  if (row) {
    pendingCache = [row, ...pendingCache.filter((entry) => entry.id !== row.id)];
  }
  return row;
};

const writeLastPendingDonationId = (pendingId) => {
  try {
    if (pendingId) {
      window.localStorage.setItem(LAST_PENDING_DONATION_KEY, pendingId);
      return;
    }
    window.localStorage.removeItem(LAST_PENDING_DONATION_KEY);
  } catch {
    // Ignore local cache write errors.
  }
};

const readLastPendingDonationId = () => {
  try {
    return window.localStorage.getItem(LAST_PENDING_DONATION_KEY) || '';
  } catch {
    return '';
  }
};

const sendReceiptEmail = async ({ donorEmail, donorName, receiptId, amount, campaignName }) => {
  if (!donorEmail) {
    return { sent: false, reason: 'missing_email' };
  }

  return serviceResponse(
    {
      sent: true,
      to: donorEmail,
      subject: `Donation receipt ${receiptId}`,
      donorName,
      amount,
      campaignName
    },
    200
  ).then((res) => res.data);
};

const readServerDonations = async () => {
  const response = await fetchJson('/api/donations');
  return Array.isArray(response.data) ? response.data.map(normalizeDonation) : [];
};

const readServerDonationSummary = async () => {
  const response = await fetchJson('/api/donations/summary');
  return response.data || {};
};

const mergeDonations = (serverRecords) => {
  const map = new Map();

  const normalizeKey = (value) => String(value || '').trim();

  const getStableKey = (normalized) => {
    // Prefer canonical identifiers first; these should be unique per donation.
    const id = normalizeKey(normalized.id);
    if (id) return `id:${id}`;

    const receiptId = normalizeKey(normalized.receiptId);
    if (receiptId) return `receipt:${receiptId}`;

    const sourcePendingId = normalizeKey(normalized.sourcePendingId);
    if (sourcePendingId) return `pending:${sourcePendingId}`;

    const stripeSessionId = normalizeKey(normalized.stripeSessionId);
    if (stripeSessionId) return `stripe:${stripeSessionId}`;

    // Keep gateway transaction as a last fallback to avoid collapsing unrelated
    // records that happen to reuse a generic/manual gateway reference.
    const gatewayTransactionId = normalizeKey(normalized.gatewayTransactionId);
    if (gatewayTransactionId) return `gateway:${gatewayTransactionId}`;

    return `fallback:${normalizeKey(normalized.campaignId)}:${normalizeKey(normalized.donorEmail)}:${normalizeKey(normalized.amount)}:${normalizeKey(normalized.createdAt)}`;
  };

  serverRecords.forEach((entry) => {
    const normalized = normalizeDonation(entry);
    const key = getStableKey(normalized);
    if (!key) {
      return;
    }

    if (!map.has(key)) {
      map.set(key, normalized);
      return;
    }

    const existing = map.get(key);
    const chooseCurrent = String(normalized.source || '').includes('stripe-webhook');
    map.set(key, chooseCurrent ? { ...existing, ...normalized } : existing);
  });

  return [...map.values()].sort((left, right) => {
    const l = new Date(left.createdAt || 0).getTime();
    const r = new Date(right.createdAt || 0).getTime();
    return r - l;
  });
};

const applyServerRaisedTotals = async (campaigns) => {
  try {
    const summary = await readServerDonationSummary();
    return campaigns.map((campaign) => {
      const byId = Number(summary[`id:${campaign.id}`] || 0);
      const byName = Number(summary[`name:${String(campaign.name).toLowerCase()}`] || 0);
      const serverRaisedById = Number.isFinite(byId) ? byId : 0;
      const serverRaisedByName = Number.isFinite(byName) ? byName : 0;
      const serverRaised = Math.max(0, serverRaisedById, serverRaisedByName);
      const campaignRaised = Number.isFinite(Number(campaign.raised)) ? Number(campaign.raised) : 0;

      // Campaign.raised is persisted by backend updates; summary is a safety fallback.
      // Use the higher value to prevent stale values, without double-counting.
      const mergedRaised = Math.max(campaignRaised, serverRaised);
      return normalizeCampaign({ ...campaign, raised: mergedRaised });
    });
  } catch {
    return campaigns;
  }
};

const createServerCheckoutSession = async ({ campaign, pendingId, donorName, donorEmail, frequency, amount }) => {
  const parsedAmount = Number(amount);
  const amountCents = Number.isFinite(parsedAmount) && parsedAmount > 0 ? Math.round(parsedAmount * 100) : undefined;

  const payload = {
    pendingId,
    campaignId: campaign.id,
    campaignName: campaign.name,
    donorName,
    donorEmail,
    frequency,
    amount: Number.isFinite(parsedAmount) ? parsedAmount : undefined,
    amountCents,
    donationPurpose: campaign.description || campaign.name,
    origin: window.location.origin
  };

  const response = await fetchJson('/api/stripe/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  return response.data || null;
};

const resolveStripePaymentDetails = async ({ sessionId = '', paymentIntentId = '' } = {}) => {
  const trimmedSessionId = String(sessionId || '').trim();
  const trimmedPaymentIntentId = String(paymentIntentId || '').trim();
  if (!trimmedSessionId && !trimmedPaymentIntentId) {
    return null;
  }

  const url = new URL('/api/stripe/resolve', window.location.origin);
  if (trimmedSessionId) {
    url.searchParams.set('session_id', trimmedSessionId);
  }
  if (trimmedPaymentIntentId) {
    url.searchParams.set('payment_intent', trimmedPaymentIntentId);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' }
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    const error = new Error(normalizeErrorMessage({ response, message: data?.message }, 'Unable to resolve Stripe payment details.', 'donationService'));
    error.response = response;
    error.data = data;
    throw error;
  }

  return data.data || null;
};

const resolveCheckoutUrl = async ({ campaign, amount, donorName, donorEmail, donorPhone, pendingId }) => {
  const paymentLink = String(campaign.paymentLink || '').trim();
  if (!paymentLink) {
    throw new Error('Payment setup missing. Add a checkout URL in admin campaign settings.');
  }

  const hasAmount = Number.isFinite(Number(amount)) && Number(amount) > 0;

  if (!isHttpUrl(paymentLink)) {
    const response = await fetch(paymentLink, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.id,
        campaignName: campaign.name,
        amount: hasAmount ? amount : undefined,
        amountCents: hasAmount ? Math.round(amount * 100) : undefined,
        donorName,
        donorEmail,
        donorPhone,
        clientReferenceId: pendingId
      })
    });

    if (!response.ok) {
      throw new Error('Checkout session endpoint failed. Please verify campaign payment endpoint.');
    }

    const data = await response.json();
    const sessionUrl = data.checkoutUrl || data.url || data.sessionUrl;
    if (!sessionUrl) {
      throw new Error('Checkout endpoint did not return a checkout URL.');
    }
    return sessionUrl;
  }

  const templated = applyCheckoutTemplate(paymentLink, {
    amount: hasAmount ? amount : '',
    amountCents: hasAmount ? Math.round(amount * 100) : '',
    email: donorEmail,
    name: donorName,
    campaign: campaign.name,
    reference: pendingId
  });

  if (campaign.paymentProvider === 'PAYPAL') {
    return withQueryParams(templated, {
      amount: hasAmount ? amount : undefined,
      currency_code: 'CAD',
      item_name: campaign.name,
      custom: pendingId
    });
  }

  const checkoutUrl = withQueryParams(templated, {
    amount: hasAmount ? amount : undefined,
    amount_decimal: hasAmount ? amount : undefined,
    amount_cents: hasAmount ? Math.round(amount * 100) : undefined,
    prefilled_amount: hasAmount ? amount : undefined,
    client_reference_id: pendingId
  });

  if (campaign.paymentProvider === 'ZEFFY') {
    return withZeffyDonorDetails(checkoutUrl, { donorName, donorEmail });
  }

  return checkoutUrl;
};

const donationService = {
  getCampaigns: async () => {
    const campaigns = await applyServerRaisedTotals(await readCampaignsFromServer());
    return serviceResponse(campaigns.filter((campaign) => campaign.isActive));
  },

  getAllCampaigns: async () => {
    const campaigns = await applyServerRaisedTotals(await readCampaignsFromServer());
    return serviceResponse(campaigns);
  },

  getDonations: async () => {
    const merged = mergeDonations(await readServerDonations());
    return serviceResponse(merged);
  },

  getPendingDonations: async () => serviceResponse(await readPendingFromServer()),

  getLastPendingDonationId: () => readLastPendingDonationId(),

  getPendingDonationById: (pendingId) => pendingCache.find((entry) => entry.id === pendingId) || null,

  getLatestPendingDonation: () => {
    if (pendingCache.length === 0) {
      return null;
    }

    return [...pendingCache]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())[0] || null;
  },

  createCampaign: async (payload) => {
    const normalizedPayload = normalizeCampaign(payload || {});
    const response = await fetchJson('/api/donation-campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        isActive: normalizedPayload.isActive,
        raised: normalizedPayload.raised,
        target: normalizedPayload.target
      })
    });
    return serviceResponse(normalizeCampaign(response.data || { ...payload, isActive: normalizedPayload.isActive }));
  },

  updateCampaign: async (id, payload) => {
    const sourcePayload = payload || {};
    const normalizedPayload = normalizeCampaign({ id, ...sourcePayload });
    const hasOwn = (key) => Object.prototype.hasOwnProperty.call(sourcePayload, key);

    const patchPayload = {
      ...sourcePayload,
      ...(hasOwn('isActive') || hasOwn('active') ? { isActive: normalizedPayload.isActive } : {}),
      ...(hasOwn('raised') ? { raised: normalizedPayload.raised } : {}),
      ...(hasOwn('target') ? { target: normalizedPayload.target } : {})
    };

    const response = await fetchJson(`/api/donation-campaigns/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patchPayload)
    });
    return serviceResponse(normalizeCampaign(response.data || { ...patchPayload, id }));
  },

  removeCampaign: async (id) => {
    await fetchJson(`/api/donation-campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return serviceResponse({ success: true });
  },

  clearDonations: async () => {
    await fetchJson('/api/donations', { method: 'DELETE' });
    pendingCache = [];
    writeLastPendingDonationId('');
    return serviceResponse({ success: true, cleared: true });
  },

  removeDonation: async (id) => {
    const response = await apiClient.delete(`/donations/${encodeURIComponent(String(id || ''))}`);
    return serviceResponse(normalizeDonation(response.data?.data || {}));
  },

  addCashDonation: async ({ campaign, amount, receiptId, donorName = '', donorEmail = '', donorPhone = '', paidAt, smsConsent = false }) => {
    const normalizedAmount = Number(amount || 0);
    if (!campaign?.id) {
      throw new Error('Campaign is required.');
    }
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    const createdAt = paidAt ? new Date(`${String(paidAt)}T12:00:00`).toISOString() : new Date().toISOString();
    const normalizedReceiptId = String(receiptId || '').trim() || `CASH-${Date.now()}`;
    const uniqueRecordId = typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const donationRecord = {
      id: `cash-${uniqueRecordId}`,
      receiptId: normalizedReceiptId,
      sourcePendingId: '',
      campaignId: Number(campaign.id),
      campaignName: String(campaign.name || ''),
      donorName: String(donorName || '').trim() || 'Walk-in Donor',
      donorEmail: String(donorEmail || '').trim(),
      phone: String(donorPhone || '').trim(),
      smsConsent: smsConsent === true,
      amount: normalizedAmount,
      frequency: 'one-time',
      paymentProvider: 'CASH',
      paymentStatus: 'PAID',
      gatewayTransactionId: '',
      createdAt,
      emailSent: false,
      source: 'admin-cash'
    };

    const response = await apiClient.post('/donations', donationRecord);

    return serviceResponse(normalizeDonation(response.data?.data || donationRecord));
  },

  emailDonationInvoice: async ({
    donation,
    campaignDescription = '',
    organizationName = '',
    address = '',
    phone = '',
    fileName = '',
    attachmentBase64 = ''
  }) => {
    const donationId = String(donation?.id || '').trim();
    const donationReceiptId = String(donation?.receiptId || '').trim();

    const payload = {
      donation: {
        id: donationId,
        receiptId: donationReceiptId
      },
      campaignDescription: String(campaignDescription || ''),
      organizationName: String(organizationName || ''),
      address: String(address || ''),
      phone: String(phone || ''),
      fileName: String(fileName || ''),
      attachmentBase64: String(attachmentBase64 || '')
    };

    const response = await fetchJson('/api/donations/email-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    return serviceResponse(response.data || { success: true });
  },

  emailBulkDonationStatement: async ({
    donor,
    donationIds = [],
    campaignName = '',
    dateFrom = '',
    dateTo = '',
    organizationName = '',
    address = '',
    phone = '',
    fileName = '',
    attachmentBase64 = ''
  }) => {
    const response = await apiClient.post('/donations/email-statement', {
      donor: {
        name: String(donor?.name || '').trim(),
        email: String(donor?.email || '').trim(),
        phone: String(donor?.phone || '').trim()
      },
      donationIds: donationIds.map((id) => String(id || '').trim()).filter(Boolean),
      campaignName: String(campaignName || ''),
      dateFrom: String(dateFrom || ''),
      dateTo: String(dateTo || ''),
      organizationName: String(organizationName || ''),
      address: String(address || ''),
      phone: String(phone || ''),
      fileName: String(fileName || ''),
      attachmentBase64: String(attachmentBase64 || '')
    });

    return serviceResponse(response.data?.data || { success: true });
  },

  resolveStripePaymentDetails,

  getQuickDonateConfig: async () => {
    const response = await fetchJson('/api/stripe/quick-donate-config');
    return serviceResponse(response.data || {});
  },

  verifyQuickDonation: async ({ paymentIntentId, clientSecret }) => {
    const response = await fetchJson('/api/stripe/quick-donate-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentIntentId, clientSecret })
    });
    return serviceResponse(response.data || {});
  },

  createQuickDonatePaymentIntent: async ({ campaignId, amountCents }) => {
    const response = await fetchJson('/api/stripe/create-quick-donate-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId, amountCents })
    });
    return serviceResponse(response.data || {});
  },

  initiateDonation: async (payload) => {
    const campaignId = Number(payload.campaignId);
    const campaigns = await readCampaignsFromServer();
    const campaign = campaigns.find((entry) => Number(entry.id) === campaignId);

    if (!campaign) {
      throw new Error('Campaign not found.');
    }
    if (!campaign.isActive) {
      throw new Error('This campaign is currently inactive.');
    }
    if (campaign.target > 0 && campaign.raised >= campaign.target) {
      throw new Error('Donation target has been achieved for this campaign.');
    }

    const pendingId = `pending-${Date.now()}`;
    let checkoutUrl = '';
    let sessionId = '';

    if (campaign.paymentProvider === 'STRIPE') {
      try {
        const session = await createServerCheckoutSession({
          campaign,
          pendingId,
          donorName: payload.donorName,
          donorEmail: payload.donorEmail,
          frequency: payload.frequency || 'one-time',
          amount: payload.amount
        });
        checkoutUrl = String(session?.checkoutUrl || '');
        sessionId = String(session?.sessionId || '');
      } catch (error) {
        throw new Error(normalizeErrorMessage(error, 'Unable to start Stripe Checkout session.', 'donationService'));
      }
    }

    if (!checkoutUrl) {
      checkoutUrl = await resolveCheckoutUrl({
        campaign,
        amount: payload.amount,
        donorName: payload.donorName,
        donorEmail: payload.donorEmail,
        donorPhone: payload.donorPhone,
        pendingId
      });
    }

    const resolvedAmount = Number.isFinite(Number(payload.amount)) && Number(payload.amount) > 0
      ? Number(payload.amount)
      : extractAmountFromUrl(checkoutUrl) || extractAmountFromUrl(campaign.paymentLink) || null;

    const pendingRecord = normalizePending({
      id: pendingId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      donorName: payload.donorName || 'Anonymous',
      donorEmail: payload.donorEmail || '',
      donorPhone: payload.donorPhone || '',
      amount: resolvedAmount,
      frequency: payload.frequency || 'one-time',
      paymentProvider: campaign.paymentProvider,
      checkoutUrl,
      sessionId,
      createdAt: new Date().toISOString()
    });

    const response = await fetchJson('/api/donation-pending', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingRecord)
    });

    const createdPending = normalizePending(response.data || pendingRecord);
    pendingCache = [createdPending, ...pendingCache.filter((entry) => entry.id !== createdPending.id)];
    writeLastPendingDonationId(createdPending.id);

    return serviceResponse({
      success: true,
      pendingId: createdPending.id,
      checkoutUrl: createdPending.checkoutUrl,
      campaign,
      sessionId: createdPending.sessionId,
      amount: createdPending.amount,
      donorName: createdPending.donorName,
      donorEmail: createdPending.donorEmail,
      donorPhone: createdPending.donorPhone,
      frequency: createdPending.frequency,
      paymentProvider: createdPending.paymentProvider
    });
  },

  confirmDonationPayment: async ({ pendingId, gatewayTransactionId = '', amount: amountOverride = null }) => {
    const donations = await readServerDonations();
    const existingDonation = donations.find((entry) => (
      String(entry.sourcePendingId || '').trim() === String(pendingId || '').trim() ||
      (String(gatewayTransactionId || '').trim() && String(entry.gatewayTransactionId || '').trim() === String(gatewayTransactionId || '').trim())
    ));

    if (existingDonation) {
      if (pendingId) {
        await fetchJson(`/api/donation-pending/${encodeURIComponent(pendingId)}`, { method: 'DELETE' }).catch(() => ({}));
      }
      pendingCache = pendingCache.filter((entry) => entry.id !== pendingId);
      if (readLastPendingDonationId() === pendingId) {
        writeLastPendingDonationId('');
      }

      const campaigns = await readCampaignsFromServer();
      const campaign = campaigns.find((entry) => Number(entry.id) === Number(existingDonation.campaignId)) || null;
      return serviceResponse({
        success: true,
        receiptId: existingDonation.receiptId,
        emailSent: Boolean(existingDonation.emailSent),
        campaign,
        donation: existingDonation,
        idempotent: true
      });
    }

    let record = pendingCache.find((entry) => entry.id === pendingId) || null;
    if (!record && pendingId) {
      const pendingRows = await readPendingFromServer();
      record = pendingRows.find((entry) => entry.id === pendingId) || null;
    }
    if (!record) {
      record = await readLatestPendingFromServer();
    }

    if (!record) {
      throw new Error('Pending payment not found. Start donation again.');
    }

    const campaigns = await readCampaignsFromServer();
    const campaign = campaigns.find((entry) => Number(entry.id) === Number(record.campaignId));

    if (!campaign) {
      throw new Error('Campaign not found for this payment.');
    }
    if (campaign.target > 0 && campaign.raised >= campaign.target) {
      throw new Error('Donation target has already been achieved for this campaign.');
    }

    const confirmedAmount = Number.isFinite(Number(amountOverride)) && Number(amountOverride) > 0
      ? Number(amountOverride)
      : Number(record.amount || extractAmountFromUrl(record.checkoutUrl) || extractAmountFromUrl(campaign.paymentLink) || 0);

    if (confirmedAmount <= 0) {
      throw new Error('Donation amount could not be determined from checkout confirmation.');
    }

    const receiptId = `R-${Date.now()}`;
    const donationRecord = {
      id: `don-${Date.now()}`,
      receiptId,
      sourcePendingId: record.id,
      campaignId: record.campaignId,
      campaignName: record.campaignName,
      donorName: record.donorName,
      donorEmail: record.donorEmail,
      amount: confirmedAmount,
      frequency: record.frequency,
      paymentProvider: record.paymentProvider,
      paymentStatus: 'PAID',
      gatewayTransactionId: gatewayTransactionId || '',
      createdAt: new Date().toISOString()
    };

    const emailResult = await sendReceiptEmail(donationRecord);
    donationRecord.emailSent = Boolean(emailResult.sent);

    await fetchJson('/api/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(donationRecord)
    });

    const nextRaised = Number(campaign.raised || 0) + confirmedAmount;
    await fetchJson(`/api/donation-campaigns/${encodeURIComponent(campaign.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raised: nextRaised,
        isActive: nextRaised < Number(campaign.target || 0)
      })
    });

    await fetchJson(`/api/donation-pending/${encodeURIComponent(record.id)}`, { method: 'DELETE' }).catch(() => ({}));
    pendingCache = pendingCache.filter((entry) => entry.id !== record.id);
    if (readLastPendingDonationId() === record.id) {
      writeLastPendingDonationId('');
    }

    return serviceResponse({
      success: true,
      receiptId,
      emailSent: donationRecord.emailSent,
      campaign: normalizeCampaign({ ...campaign, raised: nextRaised }),
      donation: donationRecord
    });
  },

  confirmLatestPendingDonation: async ({ gatewayTransactionId = '' } = {}) => {
    let latestPending = donationService.getLatestPendingDonation();
    if (!latestPending) {
      latestPending = await readLatestPendingFromServer();
    }
    if (!latestPending?.id) {
      throw new Error('No pending donation found to verify.');
    }

    return donationService.confirmDonationPayment({
      pendingId: latestPending.id,
      gatewayTransactionId: gatewayTransactionId || 'latest-pending-fallback'
    });
  },

  recordCompletedDonation: async (payload) => {
    const amount = Number(payload.amount || 0);
    const campaignId = Number(payload.campaignId);
    const campaigns = await readCampaignsFromServer();
    const campaign = campaigns.find((entry) => Number(entry.id) === campaignId);

    if (!campaign) {
      throw new Error('Campaign not found.');
    }
    if (!campaign.isActive) {
      throw new Error('This campaign is currently inactive.');
    }
    if (campaign.target > 0 && campaign.raised >= campaign.target) {
      throw new Error('Donation target has been achieved for this campaign.');
    }
    if (amount <= 0) {
      throw new Error('Donation amount must be greater than 0.');
    }

    const receiptId = `R-${Date.now()}`;
    const donationRecord = {
      id: `don-${Date.now()}`,
      receiptId,
      campaignId: campaign.id,
      campaignName: campaign.name,
      donorName: payload.donorName || 'Anonymous',
      donorEmail: payload.donorEmail || '',
      amount,
      frequency: payload.frequency || 'one-time',
      paymentProvider: campaign.paymentProvider,
      paymentStatus: 'PAID',
      gatewayTransactionId: payload.gatewayTransactionId || 'manual-confirm',
      createdAt: new Date().toISOString()
    };

    const emailResult = await sendReceiptEmail(donationRecord);
    donationRecord.emailSent = Boolean(emailResult.sent);

    await fetchJson('/api/donations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(donationRecord)
    });

    const nextRaised = Number(campaign.raised || 0) + amount;
    await fetchJson(`/api/donation-campaigns/${encodeURIComponent(campaign.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ raised: nextRaised })
    });

    return serviceResponse({
      success: true,
      receiptId,
      emailSent: donationRecord.emailSent,
      campaign: normalizeCampaign({ ...campaign, raised: nextRaised }),
      donation: donationRecord
    });
  },

  donate: async (payload) => {
    const initiated = await donationService.initiateDonation(payload);
    return donationService.confirmDonationPayment({ pendingId: initiated.data.pendingId });
  }
};

export default donationService;
