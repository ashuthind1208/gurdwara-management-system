const getConfig = () => ({
  environment: String(process.env.INSTACART_CONNECT_ENV || 'sandbox').trim().toLowerCase(),
  baseUrl: String(process.env.INSTACART_CONNECT_BASE_URL || '').trim().replace(/\/$/, ''),
  clientId: String(process.env.INSTACART_CONNECT_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.INSTACART_CONNECT_CLIENT_SECRET || '').trim(),
  tokenUrl: String(process.env.INSTACART_CONNECT_TOKEN_URL || '').trim(),
  quoteUrl: String(process.env.INSTACART_CONNECT_QUOTE_URL || '').trim()
});

const getReadiness = () => {
  const config = getConfig();
  const credentialsConfigured = Boolean(config.clientId && config.clientSecret && config.baseUrl);
  return {
    environment: config.environment === 'production' ? 'production' : 'sandbox',
    credentialsConfigured,
    quoteConfigured: Boolean(config.quoteUrl),
    available: credentialsConfigured && Boolean(config.quoteUrl),
    message: credentialsConfigured && config.quoteUrl
      ? 'Instacart sandbox fulfillment is configured.'
      : 'Instacart Connect sandbox credentials and a quote endpoint are not configured yet.'
  };
};

const requestAccessToken = async (config) => {
  if (!config.tokenUrl || !config.clientId || !config.clientSecret) {
    throw new Error('Instacart Connect OAuth configuration is incomplete.');
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || 'Unable to authenticate with Instacart Connect.');
  }
  return payload.access_token;
};

const getQuote = async ({ items, postalCode = '' }) => {
  const config = getConfig();
  if (!getReadiness().available) {
    return { available: false, readiness: getReadiness(), stores: [] };
  }

  const token = await requestAccessToken(config);
  const response = await fetch(config.quoteUrl, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ items, postalCode, environment: config.environment })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404 || String(payload.message || '').toLowerCase().includes('item was not found')) {
      throw new Error('Instacart did not return store options for this request. Confirm the Connect sandbox catalog contains these grocery items and that INSTACART_CONNECT_QUOTE_URL points to your approved fulfillment endpoint.');
    }
    throw new Error(payload.message || 'Instacart could not return store options.');
  }
  return { available: true, readiness: getReadiness(), stores: Array.isArray(payload.stores) ? payload.stores : [] };
};

module.exports = { getReadiness, getQuote };
