import contentApiService from './contentApiService';
import { serviceResponse } from './serviceResponse';
import { DEFAULT_HUKAMNAMA_SECONDS, DEFAULT_INTERVAL_SECONDS, DEFAULT_WELCOME_SECONDS, HUKAMNAMA_MAX_SECONDS, HUKAMNAMA_MIN_SECONDS, LED_BOARDS, LED_SCREENS, MAX_CUSTOM_SCREENS, MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, SCREEN_ID_PATTERN, WELCOME_MAX_SECONDS, WELCOME_MIN_SECONDS } from '../constants/ledBoards';

const RESOURCE = 'led_board_settings';

export const clampInterval = (value) => Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, Math.round(Number(value) || DEFAULT_INTERVAL_SECONDS)));

export const clampHukamnamaSeconds = (value) => Math.min(HUKAMNAMA_MAX_SECONDS, Math.max(HUKAMNAMA_MIN_SECONDS, Math.round(Number(value) || DEFAULT_HUKAMNAMA_SECONDS)));
export const clampWelcomeSeconds = (value) => Math.min(WELCOME_MAX_SECONDS, Math.max(WELCOME_MIN_SECONDS, Math.round(Number(value) || DEFAULT_WELCOME_SECONDS)));

const normalizeCustomScreens = (raw) => {
  const reserved = new Set(LED_SCREENS.map((screen) => screen.id));
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).reduce((screens, entry) => {
    const id = String(entry?.id || '').trim().toLowerCase();
    if (!SCREEN_ID_PATTERN.test(id) || reserved.has(id) || seen.has(id) || screens.length >= MAX_CUSTOM_SCREENS) return screens;
    seen.add(id);
    screens.push({ id, label: String(entry?.label || id).trim().slice(0, 60) || id });
    return screens;
  }, []);
};

// Boards missing from saved settings default to on, so a newly added board shows up without extra setup.
export const normalizeSettings = (raw = {}) => {
  const customScreens = normalizeCustomScreens(raw?.customScreens);
  const knownScreens = new Set([...LED_SCREENS, ...customScreens].map((screen) => screen.id));
  return {
    enabled: Object.fromEntries(LED_BOARDS.map((board) => [board.key, typeof raw?.enabled?.[board.key] === 'boolean' ? raw.enabled[board.key] : true])),
    intervalSeconds: clampInterval(raw?.intervalSeconds),
    hukamnamaSeconds: clampHukamnamaSeconds(raw?.hukamnamaSeconds),
    welcomeSeconds: clampWelcomeSeconds(raw?.welcomeSeconds),
    customScreens,
    screenPlaylists: Object.fromEntries(Object.entries(raw?.screenPlaylists || {}).filter(([screen]) => knownScreens.has(screen)).map(([screen, keys]) => [screen, [...new Set((Array.isArray(keys) ? keys : []).filter((key) => LED_BOARDS.some((board) => board.key === key)))]])),
    festivalBannersEnabled: raw?.festivalBannersEnabled !== false,
    updatedAt: String(raw?.updatedAt || '')
  };
};

const ledBoardSettingsService = {
  getSettings: async () => {
    try {
      const data = await contentApiService.getSingleton(RESOURCE, null);
      return serviceResponse(normalizeSettings(data || {}));
    } catch {
      return serviceResponse(normalizeSettings({}));
    }
  },

  saveSettings: async (settings) => {
    const next = { ...normalizeSettings(settings), updatedAt: new Date().toISOString() };
    await contentApiService.setSingleton(RESOURCE, next);
    return serviceResponse(next);
  }
};

export default ledBoardSettingsService;
