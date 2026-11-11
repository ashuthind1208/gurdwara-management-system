const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const PUSH_SUBSCRIPTIONS_RESOURCE = 'push_subscriptions';
const VAPID_KEYS_FILE = path.join(__dirname, 'data', 'vapid-keys.json');
const DEFAULT_ICON = '/notification-icon.svg';
const DEFAULT_BADGE = '/notification-badge.svg';
const DEFAULT_IMAGE = '/default-gurdwara.svg';
const DEFAULT_TAG = 'ssm-update';

const loadOrCreateVapidKeys = () => {
  const envPublicKey = String(process.env.PUSH_VAPID_PUBLIC_KEY || '').trim();
  const envPrivateKey = String(process.env.PUSH_VAPID_PRIVATE_KEY || '').trim();
  if (envPublicKey && envPrivateKey) {
    return { publicKey: envPublicKey, privateKey: envPrivateKey };
  }

  try {
    if (fs.existsSync(VAPID_KEYS_FILE)) {
      const stored = JSON.parse(fs.readFileSync(VAPID_KEYS_FILE, 'utf8'));
      if (stored?.publicKey && stored?.privateKey) {
        return stored;
      }
    }
  } catch {
    // Fall through and generate a fresh key pair.
  }

  const generatedKeys = webpush.generateVAPIDKeys();
  try {
    fs.mkdirSync(path.dirname(VAPID_KEYS_FILE), { recursive: true });
    fs.writeFileSync(VAPID_KEYS_FILE, JSON.stringify(generatedKeys, null, 2));
  } catch (error) {
    console.warn('Unable to persist generated VAPID keys:', error.message || error);
  }
  return generatedKeys;
};

const vapidKeys = loadOrCreateVapidKeys();
const vapidSubject = String(process.env.PUSH_VAPID_SUBJECT || 'mailto:notifications@example.invalid').trim();

webpush.setVapidDetails(vapidSubject, vapidKeys.publicKey, vapidKeys.privateKey);

const getPublicKey = () => vapidKeys.publicKey;

const saveSubscription = async (eventsDb, subscription) => {
  const endpoint = String(subscription?.endpoint || '').trim();
  if (!endpoint) {
    throw new Error('A push subscription endpoint is required.');
  }

  const existing = await eventsDb.listItems(PUSH_SUBSCRIPTIONS_RESOURCE).catch(() => []);
  const duplicate = Array.isArray(existing) ? existing.find((entry) => String(entry?.endpoint || '') === endpoint) : null;
  const record = {
    endpoint,
    keys: subscription.keys || {},
    userAgent: String(subscription.userAgent || '').slice(0, 300),
    updatedAt: new Date().toISOString()
  };

  if (duplicate) {
    return eventsDb.updateItem(PUSH_SUBSCRIPTIONS_RESOURCE, duplicate.id, { ...duplicate, ...record });
  }

  return eventsDb.createItem(PUSH_SUBSCRIPTIONS_RESOURCE, {
    id: `push-sub-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...record
  });
};

const removeSubscription = async (eventsDb, endpoint) => {
  const normalizedEndpoint = String(endpoint || '').trim();
  if (!normalizedEndpoint) {
    return { removed: false };
  }

  const existing = await eventsDb.listItems(PUSH_SUBSCRIPTIONS_RESOURCE).catch(() => []);
  const match = Array.isArray(existing) ? existing.find((entry) => String(entry?.endpoint || '') === normalizedEndpoint) : null;
  if (match) {
    await eventsDb.removeItem(PUSH_SUBSCRIPTIONS_RESOURCE, match.id);
  }
  return { removed: Boolean(match) };
};

// Sends a native-style push notification to every subscribed device, pruning subscriptions the browser has revoked.
const broadcastNotification = async (eventsDb, { title, body, url = '/', tag = DEFAULT_TAG, icon = DEFAULT_ICON, badge = DEFAULT_BADGE, image = DEFAULT_IMAGE, actions = [], data = {} }) => {
  if (!eventsDb?.hasDatabaseConnection) {
    return { sent: 0, skipped: true, reason: 'no_database' };
  }

  let subscriptions = [];
  try {
    subscriptions = await eventsDb.listItems(PUSH_SUBSCRIPTIONS_RESOURCE);
  } catch (error) {
    console.error('Unable to load push subscriptions:', error.message || error);
    return { sent: 0, error: true };
  }

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return { sent: 0, total: 0 };
  }

  const payload = JSON.stringify({
    title: String(title || process.env.ORGANIZATION_NAME || 'Your Gurdwara').slice(0, 120),
    body: String(body || '').slice(0, 500),
    url,
    tag,
    icon,
    badge,
    badgeMonochrome: true,
    ...(image ? { image } : {}),
    actions: Array.isArray(actions) ? actions.slice(0, 2) : [],
    data: {
      ...(data && typeof data === 'object' ? data : {}),
      actions: Array.isArray(actions) ? actions.slice(0, 2) : []
    }
  });

  let sent = 0;
  const results = [];
  await Promise.all(subscriptions.map(async (entry) => {
    const pushSubscription = { endpoint: entry.endpoint, keys: entry.keys };
    try {
      await webpush.sendNotification(pushSubscription, payload, { TTL: 3600, urgency: 'high' });
      sent += 1;
      results.push({ id: entry.id, ok: true });
    } catch (error) {
      const statusCode = error?.statusCode;
      results.push({ id: entry.id, ok: false, statusCode: statusCode || null, message: error.message || String(error) });
      if (statusCode === 404 || statusCode === 410) {
        await eventsDb.removeItem(PUSH_SUBSCRIPTIONS_RESOURCE, entry.id).catch(() => undefined);
      } else {
        console.error('Push notification delivery failed:', error.message || error);
      }
    }
  }));

  return { sent, total: subscriptions.length, results };
};

module.exports = {
  PUSH_SUBSCRIPTIONS_RESOURCE,
  getPublicKey,
  saveSubscription,
  removeSubscription,
  broadcastNotification
};
