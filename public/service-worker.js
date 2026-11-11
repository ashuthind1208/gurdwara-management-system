const CACHE_NAME = 'ssm-app-shell-v5';
const APP_SHELL = ['/', '/manifest.json', '/default-gurdwara.svg', '/favicon-32.png', '/notification-icon.svg', '/notification-badge.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/')));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Gurdwara Community Platform', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Gurdwara Community Platform';
  const icon = new URL(payload.icon || '/notification-icon.svg', self.location.origin).href;
  const options = {
    body: payload.body || '',
    icon,
    image: new URL(payload.image || '/default-gurdwara.svg', self.location.origin).href,
    badge: new URL(payload.badge || '/notification-badge.svg', self.location.origin).href,
    tag: payload.tag || 'ssm-update',
    renotify: false,
    vibrate: [120, 60, 120],
    timestamp: Date.now(),
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [],
    data: { url: payload.url || '/', body: payload.body || '', actions: payload.actions || [], ...(payload.data || {}) }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const actionUrl = event.action
    ? event.notification.data?.actions?.find((action) => action.action === event.action)?.url
    : null;
  const targetUrl = new URL(actionUrl || event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      const existingClient = clientsList.find((client) => client.url.startsWith(self.location.origin));
      if (existingClient) {
        return existingClient.navigate(targetUrl).then(() => existingClient.focus());
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});