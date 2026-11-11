// Static public field schema, manually mirrored from src/constants/widgetRegistry.js.
// Never load/evaluate frontend code in the backend.
const PUBLIC_WIDGET_FIELDS = Object.freeze({
  'latest-news': { title: 'string', limit: 'number', filter: 'string', displayMode: 'string' },
  'featured-story': { title: 'string', sourceId: 'string' },
  'news-list': { title: 'string', limit: 'number' },
  'event-list': { title: 'string', limit: 'number', filter: 'string', month: 'string', displayMode: 'string' },
  'event-calendar': { title: 'string', limit: 'number', filter: 'string' },
  'month-events': { title: 'string', limit: 'number', month: 'string', filter: 'string' },
  'next-event': { title: 'string', filter: 'string' },
  'daily-schedule': { title: 'string', limit: 'number', date: 'string', period: 'string' },
  'morning-schedule': { title: 'string', limit: 'number', date: 'string' },
  'evening-schedule': { title: 'string', limit: 'number', date: 'string' },
  'langar-menu': { title: 'string', limit: 'number', filter: 'string', view: 'string' },
  'urgent-langar-needs': { title: 'string', limit: 'number', filter: 'string' },
  'langar-progress': { title: 'string', limit: 'number', filter: 'string' },
  'gallery-grid': { title: 'string', limit: 'number' },
  'featured-album': { title: 'string', sourceId: 'string' },
  'video-showcase': { title: 'string', limit: 'number', filter: 'string' },
  'latest-video': { title: 'string', filter: 'string' },
  'sponsor-list': { title: 'string', limit: 'number' },
  'donation-drive': { title: 'string', limit: 'number' },
  'campaign-progress': { title: 'string', sourceId: 'string' },
  'quick-donate': { title: 'string', sourceId: 'string' },
  announcements: { title: 'string', limit: 'number', filter: 'string' },
  'notice-board': { title: 'string', limit: 'number', filter: 'string' },
  'latest-notice': { title: 'string', filter: 'string' },
  'contact-card': { title: 'string' },
  'map-location': { title: 'string' },
  'social-feed': { title: 'string' },
  'visiting-info': { title: 'string' },
  'gurdwara-hukamnama': { title: 'string', gurdwara: 'string', limit: 'number' },
  'gurbani-ang': { title: 'string', ang: 'number', limit: 'number' },
  'nitnem-reader': { title: 'string', bani: 'string', limit: 'number' },
  'gurbani-search': { title: 'string', query: 'string', mode: 'string', limit: 'number' },
  'sikh-quiz-question': { title: 'string', topic: 'string', language: 'string' },
  'live-recitation': { title: 'string' },
  'sikh-learning-resources': { title: 'string', limit: 'number' },
  'photo-only': { title: 'string', imageUrl: 'string', imageAlt: 'string', imageWidth: 'number', imageHeight: 'number', imageFit: 'string' },
  'rich-content': { title: 'string', contentHtml: 'string' },
  'live-kirtan': { title: 'string' }
});
Object.values(PUBLIC_WIDGET_FIELDS).forEach((schema) => Object.assign(schema, { backgroundColor: 'string', textColor: 'string' }));
Object.values(PUBLIC_WIDGET_FIELDS).forEach(Object.freeze);

const PUBLIC_WIDGET_LAYOUTS = Object.freeze({
  'single-column': ['main'],
  'two-column': ['left', 'right'],
  'three-column': ['left', 'center', 'right'],
  'two-column-header-footer': ['header', 'left', 'right', 'footer'],
  'two-column-header': ['header', 'left', 'right'],
  'two-column-footer': ['left', 'right', 'footer'],
  'three-column-header-footer': ['header', 'left', 'center', 'right', 'footer'],
  'three-column-header': ['header', 'left', 'center', 'right'],
  'three-column-footer': ['left', 'center', 'right', 'footer']
});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const dangerousKeys = new Set(['__proto__', 'prototype', 'constructor']);
const plainObject = (value) => Boolean(value) && typeof value === 'object'
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const check = (condition, message, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), { status });
};
const safeKeys = (value) => check(!Object.keys(value).some((key) => dangerousKeys.has(key)), 'Prototype-related keys are not allowed.');

const isPublicPagePath = (value) => {
  if (typeof value !== 'string' || value.length > 160) return false;
  if (value !== '/' && !/^\/[a-z0-9][a-z0-9/-]*$/.test(value)) return false;
  if (value.includes('//')) return false;
  const first = value.split('/')[1];
  return !['admin', 'api', 'auth', 'login', 'logout', 'join', 'signup', 'register',
    'forgot-password', 'reset-password', 'quick-donate', 'quick-donate-board',
    'board', 'boards', 'led-boards', 'stream-overlay', 'granthi-remote', 'ask-a-granthi'].includes(first)
    && !first.endsWith('-board');
};

const sanitizePlacement = (placement, { publicRead = false } = {}) => {
  check(plainObject(placement), 'Each placement must be a plain object.');
  safeKeys(placement);
  const { id, widgetId, pagePath, config } = placement;
  check(typeof id === 'string' && id.trim().length > 0 && id.length <= 120, 'Placement id must be a non-empty string of at most 120 characters.');
  check(typeof widgetId === 'string' && own(PUBLIC_WIDGET_FIELDS, widgetId), 'Unknown widgetId.');
  check(isPublicPagePath(pagePath), 'pagePath must be a public local page path of at most 160 characters.');
  check(plainObject(config), 'config must be a plain object.');
  safeKeys(config);
  check(Object.keys(config).length <= 40, 'config must contain at most 40 keys.');
  const schema = PUBLIC_WIDGET_FIELDS[widgetId];
  const sanitizedConfig = {};
  for (const [key, value] of Object.entries(config)) {
    const valid = own(schema, key) && typeof value === schema[key]
      && (typeof value !== 'number' || Number.isFinite(value))
      && (typeof value !== 'string' || value.length <= (key === 'contentHtml' ? 50000 : 2000));
    if (publicRead && !valid) continue;
    check(valid, 'config contains an unknown field, invalid type, or oversized text.');
    sanitizedConfig[key] = value;
  }
  const validSelection = (key, valid) => {
    if (!own(sanitizedConfig, key) || valid(sanitizedConfig[key])) return;
    if (publicRead) delete sanitizedConfig[key];
    else check(false, `Invalid ${key} selection.`);
  };
  if (widgetId === 'gurdwara-hukamnama') validSelection('gurdwara', (value) => ['Sri Harmandir Sahib (BaniDB)', 'This Gurdwara'].includes(value));
  if (widgetId === 'gurbani-ang') validSelection('ang', (value) => Number.isInteger(value) && value >= 1 && value <= 1430);
  if (widgetId === 'nitnem-reader') validSelection('bani', (value) => ['Japji Sahib', 'Rehras Sahib', 'Kirtan Sohila'].includes(value));
  if (widgetId === 'gurbani-search') validSelection('mode', (value) => ['Gurmukhi', 'English', 'Anywhere'].includes(value));
  if (widgetId === 'sikh-quiz-question') {
    validSelection('topic', (value) => ['guru-nanak', 'ten-gurus', 'khalsa-panj-pyare', 'five-ks', 'gurdwara-gurbani', 'sikh-history', 'values-festivals', 'mixed-review'].includes(value));
    validSelection('language', (value) => ['English', 'Punjabi', 'Both'].includes(value));
  }
  if (widgetId === 'latest-news') validSelection('displayMode', (value) => ['list', 'featured'].includes(value));
  if (widgetId === 'event-list') {
    validSelection('displayMode', (value) => ['list', 'cards'].includes(value));
    validSelection('month', (value) => value === '' || /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
  }
  if (widgetId === 'langar-menu') validSelection('view', (value) => ['needs', 'required soon', 'collection progress'].includes(value));
  for (const key of ['backgroundColor', 'textColor']) validSelection(key, (value) => /^#[0-9a-f]{6}$/i.test(value));
  if (widgetId === 'photo-only') {
    validSelection('imageUrl', (value) => value === '' || (value.length <= 2000 && ((value.startsWith('/') && !value.startsWith('//')) || /^https?:\/\//i.test(value))));
    validSelection('imageWidth', (value) => Number.isInteger(value) && value >= 1 && value <= 1920);
    validSelection('imageHeight', (value) => Number.isInteger(value) && value >= 1 && value <= 1920);
    validSelection('imageFit', (value) => ['cover', 'contain'].includes(value));
  }
  const slot = placement.slot == null ? 'main' : placement.slot;
  const order = placement.order == null ? 0 : placement.order;
  check(typeof slot === 'string' && slot.length <= 30, 'slot must be a short string.');
  check(Number.isInteger(order) && order >= 0 && order <= 1000, 'order must be an integer from 0 to 1000.');
  return { id, widgetId, pagePath, slot, order, config: sanitizedConfig };
};

const sanitizePageLayout = (layout) => {
  check(plainObject(layout), 'Each page layout must be a plain object.');
  safeKeys(layout);
  check(isPublicPagePath(layout.pagePath), 'layout pagePath must be a public local path.');
  check(typeof layout.layoutId === 'string' && own(PUBLIC_WIDGET_LAYOUTS, layout.layoutId), 'Unknown page layout.');
  return { pagePath: layout.pagePath, layoutId: layout.layoutId };
};

const validateWidgetPlacements = (body) => {
  check(plainObject(body), 'Request body must be a plain object.');
  safeKeys(body);
  check(Object.keys(body).every((key) => ['placements', 'layouts'].includes(key)), 'Only placements and layouts are allowed in the request body.');
  check(Array.isArray(body.placements) && body.placements.length <= 100, 'placements must be an array of at most 100 items.');
  check(body.layouts == null || Array.isArray(body.layouts), 'layouts must be an array.');
  const layouts = (body.layouts || []).map(sanitizePageLayout);
  check(layouts.length <= 100, 'layouts must contain at most 100 items.');
  const layoutByPage = new Map();
  layouts.forEach((layout) => {
    check(!layoutByPage.has(layout.pagePath), 'Each page may only have one layout.');
    layoutByPage.set(layout.pagePath, layout);
  });
  const ids = new Set();
  const placements = body.placements.map((entry) => {
    const placement = sanitizePlacement(entry);
    check(!ids.has(placement.id), 'Placement ids must be unique.');
    ids.add(placement.id);
    const layout = layoutByPage.get(placement.pagePath);
    const slots = PUBLIC_WIDGET_LAYOUTS[layout?.layoutId || 'single-column'];
    check(slots.includes(placement.slot), `Slot ${placement.slot} is not available in the selected page layout.`);
    return placement;
  });
  return { placements, layouts };
};

// Fail closed for malformed historical rows; never return arbitrary stored config.
const projectPublicWidgetPlacements = (stored) => {
  const rawPlacements = Array.isArray(stored) ? stored : stored?.placements;
  const rawLayouts = Array.isArray(stored?.layouts) ? stored.layouts : [];
  const layouts = [];
  const seenPages = new Set();
  rawLayouts.forEach((entry) => {
    try {
      const layout = sanitizePageLayout(entry);
      if (!seenPages.has(layout.pagePath)) layouts.push(layout);
      seenPages.add(layout.pagePath);
    } catch { /* Invalid persisted layout is not public. */ }
  });
  if (!Array.isArray(rawPlacements)) return { placements: [], layouts };
  const result = [];
  const ids = new Set();
  for (const entry of rawPlacements.slice(0, 100)) {
    try {
      const placement = sanitizePlacement(entry, { publicRead: true });
      const layout = layouts.find((candidate) => candidate.pagePath === placement.pagePath);
      if (!ids.has(placement.id) && PUBLIC_WIDGET_LAYOUTS[layout?.layoutId || 'single-column'].includes(placement.slot)) result.push(placement);
      ids.add(placement.id);
    } catch { /* Invalid persisted placements are not public. */ }
  }
  return { placements: result, layouts };
};

const createWidgetPlacementsHandler = ({ eventsDb, getRequestActor, parseJsonObjectBody, sendJson }) => async (request, response) => {
  try {
    if (request.method === 'GET') {
      const stored = await eventsDb.getSingleton('widget_placements', []);
      sendJson(response, 200, { ok: true, data: projectPublicWidgetPlacements(stored) });
      return;
    }
    if (request.method !== 'PUT') {
      sendJson(response, 405, { ok: false, message: 'Use GET or PUT for widget placements.' });
      return;
    }
    const actor = getRequestActor(request);
    const email = String(actor.email || '').trim().toLowerCase();
    check(Boolean(email), 'Admin access is required.', 403);
    const users = await eventsDb.listItems('users');
    const user = (Array.isArray(users) ? users : []).find((entry) => String(entry?.email || '').trim().toLowerCase() === email);
    const role = String(user?.role || '').trim().toLowerCase();
    check(user?.isActive === true && String(user?.approvalStatus || '').trim().toLowerCase() === 'approved'
      && ['admin', 'super admin'].includes(role), 'Active approved Admin access is required.', 403);
    check(!actor.role || String(actor.role).trim().toLowerCase() === role, 'Your session permissions changed. Please sign in again.', 403);
    check(eventsDb.hasDatabaseConnection, 'Widget placement storage is temporarily unavailable.', 503);
    const body = await parseJsonObjectBody(request, { maxBytes: 2 * 1024 * 1024, allowEmpty: false });
    const next = validateWidgetPlacements(body);
    await eventsDb.setSingleton('widget_placements', next);
    sendJson(response, 200, { ok: true, data: next });
  } catch (error) {
    const status = [400, 403, 413, 503].includes(error.status) ? error.status : 500;
    sendJson(response, status, { ok: false, message: status === 500 ? 'Unable to access widget placements.' : error.message });
  }
};

module.exports = { PUBLIC_WIDGET_FIELDS, PUBLIC_WIDGET_LAYOUTS, isPublicPagePath, validateWidgetPlacements, projectPublicWidgetPlacements, createWidgetPlacementsHandler };