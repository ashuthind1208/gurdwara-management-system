import apiClient from './apiClient';
import inaugurationService, {
  DEFAULT_INAUGURATION_SETTINGS, normalizeInaugurationSettings, isSafeInaugurationUrl,
  getInaugurationAvailability, formatInaugurationTorontoTime,
  toInaugurationLocalDateTime, fromInaugurationLocalDateTime, validateInaugurationSettings
} from './inaugurationService';

jest.mock('./apiClient', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));

beforeEach(() => {
  apiClient.get.mockResolvedValue({ data: { data: { enabled: true } } });
  apiClient.put.mockImplementation(async (_, payload) => ({ data: { data: payload } }));
});

test('matches server defaults and safely normalizes malformed settings', () => {
  expect(normalizeInaugurationSettings()).toEqual(DEFAULT_INAUGURATION_SETTINGS);
  expect(normalizeInaugurationSettings(null)).toEqual(DEFAULT_INAUGURATION_SETTINGS);
  expect(normalizeInaugurationSettings({ backgroundColor: 'red', textColor: 'url(x)', logoSize: 999, buttons: [null] })).toMatchObject({
    backgroundColor: '#071B36', textColor: '#FFFFFF', logoSize: 320,
    buttons: [{ id: 'inauguration-button-1', enabled: false, availableAt: '' }]
  });
  expect(normalizeInaugurationSettings({ buttons: Array(15).fill({}) }).buttons).toHaveLength(12);
});

test.each(['/donation', '/path?one=1#two', 'https://example.com/page', 'http://localhost:3001/'])('accepts safe URL %s', (url) => {
  expect(isSafeInaugurationUrl(url)).toBe(true);
});
test.each(['', '//evil.com', '/\\evil.com', ['javascript', 'alert(1)'].join(':'), 'data:image/svg+xml,x', 'mailto:x@y.com', 'https://user:secret@example.com', 'https://example.com\n', ' https://example.com', 'https://', '/path\tbad'])('rejects unsafe URL %s', (url) => {
  expect(isSafeInaugurationUrl(url)).toBe(false);
});

test('GET uses the existing API client and normalizes settings', async () => {
  await expect(inaugurationService.getSettings()).resolves.toMatchObject({ enabled: true, logoSize: 180 });
  expect(apiClient.get).toHaveBeenCalledWith('/inauguration/settings');
});

test('PUT sends only the explicit contract and returns saved values', async () => {
  const settings = { ...normalizeInaugurationSettings(), enabled: true, canSave: true, preview: true,
    buttons: [{ id: 'a', enabled: true, labelEnglish: 'Enter', labelPunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ', url: '/home', availableAt: '', draftOnly: true }] };
  const saved = await inaugurationService.saveSettings(settings);
  expect(apiClient.put).toHaveBeenCalledWith('/inauguration/settings', normalizeInaugurationSettings(settings));
  expect(saved).not.toHaveProperty('canSave');
  expect(saved.buttons[0]).not.toHaveProperty('draftOnly');
});

test('invalid links and schedules fail before PUT; API errors propagate', async () => {
  const settings = { ...normalizeInaugurationSettings(), buttons: [{ labelEnglish: 'Enter', labelPunjabi: '', url: ['javascript', 'alert(1)'].join(':'), enabled: true, availableAt: '' }] };
  await expect(inaugurationService.saveSettings(settings)).rejects.toThrow('safe root-relative');
  expect(apiClient.put).not.toHaveBeenCalled();
  settings.buttons[0] = { ...settings.buttons[0], url: '/home', availableAt: 'invalid' };
  expect(validateInaugurationSettings(settings)).toMatch(/scheduled date/);
  apiClient.get.mockRejectedValue(new Error('Offline'));
  await expect(inaugurationService.getSettings()).rejects.toThrow('Offline');
  apiClient.put.mockRejectedValue(new Error('Forbidden'));
  await expect(inaugurationService.saveSettings(normalizeInaugurationSettings())).rejects.toThrow('Forbidden');
});

test('availability is fail-closed and unlocks at the exact scheduled instant', () => {
  const now = Date.parse('2026-11-20T17:00:00Z');
  const button = { enabled: true, url: '/home', availableAt: new Date(now + 1000).toISOString() };
  expect(getInaugurationAvailability(button, now)).toEqual({ available: false, message: 'Opens in 0h 0m 1s' });
  expect(getInaugurationAvailability(button, now + 1000).available).toBe(true);
  expect(getInaugurationAvailability({ ...button, enabled: false }, now + 2000).available).toBe(false);
  expect(getInaugurationAvailability({ ...button, availableAt: '' }, now).available).toBe(true);
  expect(getInaugurationAvailability({ ...button, availableAt: 'invalid' }, now).available).toBe(false);
  expect(getInaugurationAvailability({ ...button, url: '//evil.com' }, now + 2000).available).toBe(false);
});

test('formats Toronto winter/summer times and round-trips device-local datetime including seconds', () => {
  expect(formatInaugurationTorontoTime('2026-11-20T17:00:00Z')).toMatch(/12:00:00.*EST/);
  expect(formatInaugurationTorontoTime('2026-07-20T17:00:00Z')).toMatch(/1:00:00.*EDT/);
  const iso = '2026-11-20T17:12:34.000Z';
  expect(fromInaugurationLocalDateTime(toInaugurationLocalDateTime(iso))).toBe(iso);
  const local = toInaugurationLocalDateTime(iso);
  expect(fromInaugurationLocalDateTime(`${local}.000`)).toBe(iso);
  expect(fromInaugurationLocalDateTime('')).toBe('');
  expect(toInaugurationLocalDateTime('bad')).toBe('');
  expect(() => fromInaugurationLocalDateTime('bad')).toThrow('valid local date');
  expect(() => fromInaugurationLocalDateTime('2026-02-30T12:00')).toThrow('valid local date');
});
