const { randomUUID } = require('crypto');

const RESOURCE = 'stream_overlay_profiles';
const MAX_OVERLAYS = 100;
// Share the queue across handlers/stores using the same database adapter in this process.
const mutationQueues = new WeakMap();
const reservedSlugs = new Set(['default', 'settings', 'public', 'overlays']);
const numericRanges = {
  overlayOpacity: [15, 100], gurmukhiSize: [0, 100], punjabiSize: [0, 100], englishSize: [0, 100],
  headerSize: [0, 100], headerPunjabiSize: [0, 100], upperSpeed: [0, 100], lowerSpeed: [0, 100],
  upperSize: [0, 100], lowerSize: [0, 100]
};
const textLimits = {
  overlayThemeId: 80, overlayAnnouncement: 180, overlayHeaderMessage: 120,
  punjabiAnnouncement: 180, headerPunjabi: 120, upperEnglish: 180, upperPunjabi: 180
};
const colorKeys = ['upperbg', 'upperfg', 'lowerbg', 'lowerfg'];
const headerColorKeys = ['headerBackgroundColor', 'headerBorderColor'];
const identityLimits = { displayName: 120, displayAddress: 300 };
const writableKeys = new Set([
  'title', 'description', 'slug', 'logoUrl', 'isActive', 'overlayOn', 'overlayLogo', 'overlayLanguages',
  'tickerColors', ...headerColorKeys, ...Object.keys(identityLimits), ...Object.keys(numericRanges), ...Object.keys(textLimits)
]);
const check = (condition, message, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), { status });
};
const objectBody = (body) => check(body && typeof body === 'object' && !Array.isArray(body), 'Body must be a JSON object.');
const onlyKeys = (body, keys) => {
  const unknown = Object.keys(body).find((key) => !keys.has(key));
  check(!unknown, `Unknown field: ${unknown}.`);
};
const hasControlCharacters = (value) => [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);

const safeLogoUrl = (value) => {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (!value) return true;
  // Reject controls, URL-parser normalization, and encoded local traversal/separators.
  if (/[\s\\]/.test(value) || hasControlCharacters(value)) return false;
  if (/^\/(?:api\/)?uploads\//.test(value)) {
    try {
      const decoded = decodeURIComponent(value);
      return !decoded.includes('\\') && !hasControlCharacters(decoded)
        && !decoded.split(/[/?#]/).some((part) => part === '.' || part === '..')
        && !/%(?:2e|2f|5c|25)/i.test(value)
        && /^\/(?:api\/)?uploads\//.test(new URL(value, 'https://local.invalid').pathname);
    } catch { return false; }
  }
  try {
    const url = new URL(value);
    return /^https?:\/\//i.test(value) && ['http:', 'https:'].includes(url.protocol)
      && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
};

const validateOverlay = (body, existing = {}) => {
  objectBody(body);
  onlyKeys(body, writableKeys);
  check(typeof body.title === 'string' && body.title.trim().length > 0 && body.title.length <= 100, 'title is required and must be text up to 100 characters.');
  check(typeof body.slug === 'string' && body.slug.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug) && !reservedSlugs.has(body.slug), 'slug must be unique lower kebab-case up to 60 characters and cannot be reserved.');
  const description = body.description === undefined ? existing.description ?? '' : body.description;
  const logoUrl = body.logoUrl === undefined ? existing.logoUrl ?? '' : body.logoUrl;
  const isActive = body.isActive === undefined ? existing.isActive ?? true : body.isActive;
  const headerColors = Object.fromEntries(headerColorKeys.map((key) => {
    const value = Object.prototype.hasOwnProperty.call(body, key) ? body[key] : existing[key] ?? '';
    check(typeof value === 'string' && (value === '' || (value.length === 7 && /^#[0-9a-f]{6}$/i.test(value))), `${key} must be a six-digit hex color or blank.`);
    return [key, value];
  }));
  const identity = Object.fromEntries(Object.entries(identityLimits).map(([key, max]) => {
    const value = body[key] === undefined ? existing[key] ?? '' : body[key];
    check(typeof value === 'string' && value.length <= max, `${key} must be text up to ${max} characters.`);
    return [key, value.trim()];
  }));
  check(typeof description === 'string' && description.length <= 500, 'description must be text up to 500 characters.');
  check(safeLogoUrl(logoUrl), 'logoUrl must be an HTTP(S) URL or a local upload path. Upload logos using the upload service, not base64.');
  check(typeof isActive === 'boolean', 'isActive must be a boolean.');
  ['overlayOn', 'overlayLogo'].forEach((key) => check(typeof body[key] === 'boolean', `${key} must be a boolean.`));
  Object.entries(numericRanges).forEach(([key, [min, max]]) => {
    check(typeof body[key] === 'number' && Number.isFinite(body[key]) && body[key] >= min && body[key] <= max, `${key} must be between ${min} and ${max}.`);
  });
  check(typeof body.overlayLanguages === 'string' && ['gpe', 'ge', 'gp', 'g'].includes(body.overlayLanguages), 'overlayLanguages is invalid.');
  Object.entries(textLimits).forEach(([key, max]) => check(typeof body[key] === 'string' && body[key].length <= max, `${key} must be text up to ${max} characters.`));
  objectBody(body.tickerColors);
  onlyKeys(body.tickerColors, new Set(colorKeys));
  colorKeys.forEach((key) => check(typeof body.tickerColors[key] === 'string' && (body.tickerColors[key] === '' || (body.tickerColors[key].length === 7 && /^#[0-9a-f]{6}$/i.test(body.tickerColors[key]))), `tickerColors.${key} must be a six-digit hex color or blank.`));
  return { ...body, ...identity, ...headerColors, title: body.title.trim(), description, logoUrl, isActive, tickerColors: { ...body.tickerColors } };
};

const createStreamOverlayStore = ({ eventsDb }) => {
  const list = async () => {
    check(eventsDb.hasDatabaseConnection, 'Stream overlay storage is temporarily unavailable.', 503);
    const saved = await eventsDb.getSingleton(RESOURCE, { overlays: [] });
    check(saved && Array.isArray(saved.overlays) && saved.overlays.length <= MAX_OVERLAYS, 'Stream overlay storage is invalid.', 503);
    return structuredClone(saved.overlays);
  };
  const mutate = (operation) => {
    const pending = (mutationQueues.get(eventsDb) || Promise.resolve()).then(async () => {
      const overlays = await list();
      const result = operation(overlays);
      await eventsDb.setSingleton(RESOURCE, { overlays });
      return result;
    });
    // A failed validation/write must not poison subsequent operations.
    mutationQueues.set(eventsDb, pending.catch(() => {}));
    return pending;
  };
  const findIndex = (overlays, id) => {
    const index = overlays.findIndex((entry) => entry.id === id);
    check(index !== -1, 'Stream overlay not found.', 404);
    return index;
  };
  return {
    list,
    async publicBySlug(slug) {
      const entry = (await list()).find((overlay) => overlay.slug === slug);
      check(entry, 'Stream overlay not found.', 404);
      return { ...entry, overlayOn: entry.isActive === false ? false : entry.overlayOn };
    },
    create: (body) => mutate((overlays) => {
      const entry = validateOverlay(body);
      check(!overlays.some((overlay) => overlay.slug === entry.slug), 'An overlay with this slug already exists.', 409);
      check(overlays.length < MAX_OVERLAYS, 'A maximum of 100 overlays is allowed.', 409);
      const now = new Date().toISOString();
      const record = { ...entry, id: randomUUID(), createdAt: now, updatedAt: now };
      overlays.push(record);
      return record;
    }),
    update: (id, body) => mutate((overlays) => {
      const index = findIndex(overlays, id);
      const existing = overlays[index];
      const entry = validateOverlay(body, existing);
      check(!overlays.some((overlay) => overlay.id !== id && overlay.slug === entry.slug), 'An overlay with this slug already exists.', 409);
      overlays[index] = { ...entry, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
      return overlays[index];
    }),
    setActive: (id, body) => mutate((overlays) => {
      objectBody(body);
      onlyKeys(body, new Set(['isActive']));
      check(typeof body.isActive === 'boolean', 'isActive must be a boolean.');
      const index = findIndex(overlays, id);
      overlays[index] = { ...overlays[index], isActive: body.isActive, updatedAt: new Date().toISOString() };
      return overlays[index];
    }),
    remove: (id) => mutate((overlays) => {
      overlays.splice(findIndex(overlays, id), 1);
      return { id, deleted: true };
    })
  };
};

const createStreamOverlayHandler = ({ eventsDb, canManageAdminPage, parseJsonObjectBody, sendJson }) => {
  const store = createStreamOverlayStore({ eventsDb });
  return async (request, response, requestUrl) => {
    const path = requestUrl.pathname;
    const collection = path === '/api/stream-overlay/overlays';
    const item = path.match(/^\/api\/stream-overlay\/overlays\/([^/]+)$/);
    const publicMatch = path.match(/^\/api\/stream-overlay\/public\/([^/]+)$/);
    // In particular, never intercept the legacy settings endpoint.
    if (!collection && !item && !publicMatch) return false;
    try {
      if (!publicMatch) check(await canManageAdminPage(request, '/admin/recitations'), 'Live Recitation admin access is required to manage stream overlays.', 403);
      check(eventsDb.hasDatabaseConnection, 'Stream overlay storage is temporarily unavailable.', 503);
      let data;
      let status = 200;
      if (publicMatch && request.method === 'GET') {
        // Query overrides are deliberately ignored, including on=1 for inactive records.
        response.setHeader?.('Cache-Control', 'no-store');
        data = await store.publicBySlug(publicMatch[1]);
      } else if (collection && request.method === 'GET') {
        data = await store.list();
      } else if ((collection && request.method === 'POST') || (item && ['PUT', 'PATCH'].includes(request.method))) {
        const body = await parseJsonObjectBody(request, { maxBytes: 16 * 1024, allowEmpty: false });
        if (collection) {
          data = await store.create(body);
          status = 201;
        } else {
          data = await store[request.method === 'PUT' ? 'update' : 'setActive'](item[1], body);
        }
      } else if (item && request.method === 'DELETE') {
        data = await store.remove(item[1]);
      } else {
        check(false, 'Method not allowed.', 405);
      }
      sendJson(response, status, { ok: true, data });
    } catch (error) {
      const status = [400, 403, 404, 405, 409, 413, 503].includes(error.status) ? error.status : 503;
      sendJson(response, status, { ok: false, message: status === 503 ? 'Stream overlay storage is temporarily unavailable.' : error.message });
    }
    return true;
  };
};

module.exports = { createStreamOverlayHandler, createStreamOverlayStore };