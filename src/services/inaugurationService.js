import apiClient from './apiClient';

export const INAUGURATION_QUERY_KEY = ['inauguration-settings'];
export const MAX_INAUGURATION_BUTTONS = 12;
export const MAX_OCCASION_LINKS = 4;
export const DEFAULT_INAUGURATION_OCCASION = Object.freeze({
  enabled: false, date: '', titleEnglish: '', titlePunjabi: '',
  descriptionEnglish: '', descriptionPunjabi: '', imageUrl: '', links: Object.freeze([]),
  contentEnglish: '', contentPunjabi: '',
  backgroundColor: '#071B36', textColor: '#FFFFFF', fontSize: 20, height: 80, speed: 60
});
export const DEFAULT_INAUGURATION_SETTINGS = Object.freeze({
  enabled: false,
  backgroundColor: '#071B36',
  textColor: '#FFFFFF',
  accentColor: '#F4A300',
  logoUrl: '',
  logoSize: 180,
  headingEnglish: 'Welcome to our inauguration',
  headingPunjabi: 'ਉਦਘਾਟਨ ਸਮਾਗਮ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ',
  messageEnglish: '',
  messagePunjabi: '',
  buttons: Object.freeze([]),
  occasion: DEFAULT_INAUGURATION_OCCASION
});

const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const color = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
const occasionContent = (occasion, language) => Object.hasOwn(occasion, `content${language}`)
  ? occasion[`content${language}`]
  : [text(occasion[`title${language}`]).trim(), text(occasion[`description${language}`]).trim()].filter(Boolean).join('\n');

// Only same-origin root paths and explicit HTTP(S) URLs; never executable schemes,
// protocol-relative URLs, credentials, backslashes, or control characters.
export const isSafeInaugurationUrl = (value) => {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\s\\]/.test(value)
    || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
};

export const normalizeInaugurationSettings = (settings = {}) => {
  const source = settings && typeof settings === 'object' ? settings : {};
  const defaults = DEFAULT_INAUGURATION_SETTINGS;
  const occasion = source.occasion || {};
  return {
    occasion: {
      enabled: occasion.enabled === true,
      backgroundColor: color(text(occasion.backgroundColor).trim(), DEFAULT_INAUGURATION_OCCASION.backgroundColor),
      textColor: color(text(occasion.textColor).trim(), DEFAULT_INAUGURATION_OCCASION.textColor),
      ...Object.fromEntries([['fontSize', 12, 40], ['height', 48, 160], ['speed', 10, 200]].map(([field, min, max]) => [field,
        Number.isInteger(occasion[field]) && occasion[field] >= min && occasion[field] <= max ? occasion[field] : DEFAULT_INAUGURATION_OCCASION[field]])),
      ...Object.fromEntries(['date', 'titleEnglish', 'titlePunjabi', 'descriptionEnglish', 'descriptionPunjabi', 'imageUrl'].map((field) => [field, text(occasion[field])])),
      ...Object.fromEntries(['English', 'Punjabi'].map((language) => [`content${language}`, text(occasionContent(occasion, language))])),
      links: (Array.isArray(occasion.links) ? occasion.links : []).slice(0, MAX_OCCASION_LINKS).map((link) => ({
        labelEnglish: text(link?.labelEnglish), labelPunjabi: text(link?.labelPunjabi), url: text(link?.url)
      }))
    },
    enabled: source.enabled === true,
    backgroundColor: color(source.backgroundColor, defaults.backgroundColor),
    textColor: color(source.textColor, defaults.textColor),
    accentColor: color(source.accentColor, defaults.accentColor),
    logoUrl: text(source.logoUrl),
    logoSize: Number.isFinite(Number(source.logoSize)) ? Math.min(320, Math.max(80, Number(source.logoSize))) : defaults.logoSize,
    headingEnglish: text(source.headingEnglish, defaults.headingEnglish),
    headingPunjabi: text(source.headingPunjabi, defaults.headingPunjabi),
    messageEnglish: text(source.messageEnglish),
    messagePunjabi: text(source.messagePunjabi),
    buttons: (Array.isArray(source.buttons) ? source.buttons : []).slice(0, MAX_INAUGURATION_BUTTONS).map((button, index) => ({
      id: text(button?.id, `inauguration-button-${index + 1}`),
      labelEnglish: text(button?.labelEnglish),
      labelPunjabi: text(button?.labelPunjabi),
      url: text(button?.url),
      enabled: button?.enabled === true,
      availableAt: text(button?.availableAt)
    }))
  };
};

export const getInaugurationAvailability = (button, now = Date.now()) => {
  if (!button.enabled) return { available: false, message: 'Not available' };
  if (!isSafeInaugurationUrl(button.url)) return { available: false, message: 'Link unavailable' };
  if (!button.availableAt) return { available: true, message: 'Available now' };
  const timestamp = Date.parse(button.availableAt);
  if (!Number.isFinite(timestamp)) return { available: false, message: 'Schedule unavailable' };
  const seconds = Math.max(0, Math.ceil((timestamp - now) / 1000));
  if (!seconds) return { available: true, message: 'Available now' };
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return { available: false, message: `Opens in ${days ? `${days}d ` : ''}${hours}h ${minutes}m ${seconds % 60}s` };
};

export const formatInaugurationTorontoTime = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Toronto', year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
}).format(new Date(value));

export const toInaugurationLocalDateTime = (iso) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

export const fromInaugurationLocalDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const wallTime = value.split('.')[0];
  // Reject nonexistent local times during the spring DST jump rather than silently
  // moving the user's schedule to a different wall-clock time.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)
    || !Number.isFinite(date.getTime()) || toInaugurationLocalDateTime(date.toISOString()).slice(0, wallTime.length) !== wallTime) {
    throw new Error('Choose a valid local date and time. Daylight-saving gaps cannot be scheduled.');
  }
  return date.toISOString();
};

export const isValidOccasionDate = (value) => {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// Match the API's safeUrl logo rules, including repeatedly encoded traversal.
const isSafeOccasionUrl = (value, image = false) => {
  if (typeof value !== 'string' || value.trim().length > 2048) return false;
  const url = value.trim();
  if (!url) return image;
  let decoded = url;
  try {
    for (let index = 0; index < 5; index += 1) {
      if (/[\s\\]/u.test(decoded) || [...decoded].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return false;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      if (index === 4) return false;
      decoded = next;
    }
    const internal = url.startsWith('/');
    if (internal ? !image || !decoded.startsWith('/') || decoded.startsWith('//') : !/^https?:\/\//i.test(url)) return false;
    const parsed = new URL(decoded, 'https://inauguration.invalid');
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return false;
    const path = decoded.split(/[?#]/)[0];
    if (path.split('/').some((part) => part === '.' || part === '..')) return false;
    return !internal || /^\/(?:api\/)?uploads\/[^/].*/.test(path);
  } catch { return false; }
};

export const validateInaugurationOccasion = (input = DEFAULT_INAUGURATION_OCCASION) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'occasion must be an object.';
  if (Object.keys(input).some((key) => !Object.hasOwn(DEFAULT_INAUGURATION_OCCASION, key))) return 'occasion contains an unknown field.';
  const occasion = { ...DEFAULT_INAUGURATION_OCCASION, ...input };
  if (typeof occasion.enabled !== 'boolean') return 'occasion.enabled must be a boolean.';
  for (const field of ['backgroundColor', 'textColor']) {
    if (typeof occasion[field] !== 'string' || !/^#[\da-f]{6}$/i.test(occasion[field].trim())) return `occasion.${field} must be a six-digit hex color.`;
  }
  for (const [field, min, max] of [['fontSize', 12, 40], ['height', 48, 160], ['speed', 10, 200]]) {
    if (!Number.isInteger(occasion[field]) || occasion[field] < min || occasion[field] > max) return `occasion.${field} must be an integer from ${min} to ${max}.`;
  }
  if (typeof occasion.date !== 'string' || !isValidOccasionDate(occasion.date.trim())) return 'occasion.date must be a real YYYY-MM-DD date or blank.';
  for (const field of ['titleEnglish', 'titlePunjabi', 'descriptionEnglish', 'descriptionPunjabi']) {
    if (typeof occasion[field] !== 'string' || occasion[field].trim().length > (field.startsWith('title') ? 200 : 2000)) return `occasion.${field} has an invalid type or length.`;
  }
  for (const language of ['English', 'Punjabi']) {
    const value = occasionContent(input, language);
    if (typeof value !== 'string' || value.trim().length > 4000) return `occasion.content${language} has an invalid type or length.`;
  }
  if (occasion.enabled && !occasionContent(input, 'English').trim() && !occasionContent(input, 'Punjabi').trim()) return 'Enabled occasion needs English or Punjabi content.';
  if (!isSafeOccasionUrl(occasion.imageUrl, true)) return 'occasion.imageUrl must be a safe uploaded image path or HTTP(S) URL.';
  if (!Array.isArray(occasion.links) || occasion.links.length > MAX_OCCASION_LINKS) return 'occasion.links allows at most 4 links.';
  for (const [index, link] of occasion.links.entries()) {
    const field = `occasion.links[${index}]`;
    if (!link || typeof link !== 'object' || Array.isArray(link) || Object.keys(link).some((key) => !['labelEnglish', 'labelPunjabi', 'url'].includes(key))) return `${field} has invalid fields.`;
    if (typeof link.labelEnglish !== 'string' || !link.labelEnglish.trim() || link.labelEnglish.trim().length > 120) return `${field} needs an English label of at most 120 characters.`;
    if (Object.hasOwn(link, 'labelPunjabi') && (typeof link.labelPunjabi !== 'string' || link.labelPunjabi.trim().length > 120)) return `${field} needs a Punjabi label of at most 120 characters.`;
    if (!isSafeOccasionUrl(link.url)) return `${field} needs an external HTTP(S) URL without credentials.`;
  }
  return '';
};

// Civil dates must never be compared using the browser's timezone or UTC date.
export const getInaugurationOccasionAvailability = (occasion, now = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(now));
  const part = (type) => parts.find((entry) => entry.type === type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const date = typeof occasion?.date === 'string' ? occasion.date.trim() : '';
  return { visible: occasion?.enabled === true && !validateInaugurationOccasion(occasion) && (!date || date === today), date: date || today };
};

export const validateInaugurationSettings = (settings) => {
  const occasionError = validateInaugurationOccasion(settings.occasion);
  if (occasionError) return occasionError;
  for (const key of ['backgroundColor', 'textColor', 'accentColor']) {
    if (!/^#[\da-f]{6}$/i.test(settings[key] || '')) return 'Choose valid six-digit hex colors.';
  }
  if (settings.logoUrl && !isSafeInaugurationUrl(settings.logoUrl)) return 'Logo URL must be a root-relative path or an HTTP(S) URL.';
  if (settings.buttons.length > MAX_INAUGURATION_BUTTONS) return 'A maximum of 12 buttons is allowed.';
  for (const [index, button] of settings.buttons.entries()) {
    if (!button.labelEnglish.trim() && !button.labelPunjabi.trim()) return `Button ${index + 1} needs a label.`;
    if (!isSafeInaugurationUrl(button.url)) return `Button ${index + 1} needs a safe root-relative path or HTTP(S) URL.`;
    if (button.availableAt && !Number.isFinite(Date.parse(button.availableAt))) return `Button ${index + 1} needs a valid scheduled date.`;
  }
  return '';
};

const inaugurationService = {
  getSettings: async () => normalizeInaugurationSettings((await apiClient.get('/inauguration/settings')).data?.data),
  saveSettings: async (settings) => {
    const error = validateInaugurationSettings(settings);
    if (error) throw new Error(error);
    // Whitelist the server contract: preview state and capability flags are not saved.
    const payload = normalizeInaugurationSettings(settings);
    const response = await apiClient.put('/inauguration/settings', payload);
    return normalizeInaugurationSettings(response.data?.data || payload);
  }
};

export default inaugurationService;
