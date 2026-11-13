import apiClient from './apiClient';

export const STREAM_OVERLAY_SETTINGS_KEY = 'ssm-stream-overlay-settings-v1';
export const STREAM_OVERLAY_SETTINGS_URL = '/api/stream-overlay/settings';

export const DEFAULT_STREAM_OVERLAY_SETTINGS = Object.freeze({
  overlayOn: true,
  overlayLogo: true,
  overlayLanguages: 'gpe',
  overlayOpacity: 100,
  gurmukhiSize: 100,
  punjabiSize: 100,
  englishSize: 100,
  overlayAnnouncement: '',
  overlayHeaderMessage: '',
  headerSize: 100,
  headerPunjabiSize: 100,
  headerBackgroundColor: '',
  headerBorderColor: '',
  punjabiAnnouncement: '',
  headerPunjabi: '',
  upperEnglish: '',
  upperPunjabi: '',
  upperSpeed: 100,
  lowerSpeed: 100,
  tickerColors: Object.freeze({ upperbg: '', upperfg: '', lowerbg: '', lowerfg: '' }),
  upperSize: 100,
  lowerSize: 100,
  overlayThemeId: 'brand-colors'
});

const LEGACY_TICKER_COLORS = { upperbg: '#004080', upperfg: '#ffffff', lowerbg: '#F89820', lowerfg: '#004080' };

// Migrate only a complete old default palette, never individual matching colors.
// Run migration at read boundaries, not while serializing an edited draft.
export const normalizeTickerColors = (colors, { migrateLegacy = false } = {}) => {
  const saved = colors && typeof colors === 'object' && !Array.isArray(colors) ? colors : {};
  const legacy = migrateLegacy && Object.keys(saved).length === 4 && Object.entries(LEGACY_TICKER_COLORS)
    .every(([key, value]) => typeof saved[key] === 'string' && saved[key].toLowerCase() === value.toLowerCase());
  return Object.fromEntries(Object.keys(LEGACY_TICKER_COLORS).map((key) => [key,
    !legacy && typeof saved[key] === 'string' && saved[key].length === 7 && /^#[0-9a-f]{6}$/i.test(saved[key]) ? saved[key] : ''
  ]));
};

export const readStreamOverlaySettings = (storage = window.localStorage) => {
  try {
    const saved = JSON.parse(storage.getItem(STREAM_OVERLAY_SETTINGS_KEY) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULT_STREAM_OVERLAY_SETTINGS };
    return {
      ...DEFAULT_STREAM_OVERLAY_SETTINGS,
      ...saved,
      tickerColors: normalizeTickerColors(saved.tickerColors, { migrateLegacy: true })
    };
  } catch {
    return { ...DEFAULT_STREAM_OVERLAY_SETTINGS };
  }
};

export const saveStreamOverlaySettings = (settings, storage = window.localStorage) => {
  try {
    storage.setItem(STREAM_OVERLAY_SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

export const getPublishedStreamOverlaySettings = async (slug = '') => {
  const url = typeof slug === 'string' && slug ? `/api/stream-overlay/public/${encodeURIComponent(slug)}` : STREAM_OVERLAY_SETTINGS_URL;
  const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Overlay settings request failed (${response.status}).`);
  const payload = await response.json();
  return payload?.data && typeof payload.data === 'object' ? payload.data : {};
};

export const publishStreamOverlaySettings = async (settings) => {
  const response = await apiClient.put('/stream-overlay/settings', settings);
  return response.data?.data || settings;
};
