import apiClient from './apiClient';

export const INAUGURATION_QUERY_KEY = ['inauguration-settings'];
export const MAX_INAUGURATION_BUTTONS = 12;
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
  buttons: Object.freeze([])
});

const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const color = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;

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
  return {
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

export const validateInaugurationSettings = (settings) => {
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
