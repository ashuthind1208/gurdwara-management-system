import apiClient from './apiClient';
import inaugurationService, {
  DEFAULT_INAUGURATION_SETTINGS, normalizeInaugurationSettings, isSafeInaugurationUrl,
  getInaugurationAvailability, formatInaugurationTorontoTime,
  toInaugurationLocalDateTime, fromInaugurationLocalDateTime, validateInaugurationSettings,
  getInaugurationOccasionAvailability, validateInaugurationOccasion
} from './inaugurationService';

jest.mock('./apiClient', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));

test('legacy settings get independent disabled occasion defaults and occasion survives explicit PUT', async () => {
  const legacy = normalizeInaugurationSettings({ enabled: true });
  expect(legacy.occasion).toEqual(DEFAULT_INAUGURATION_SETTINGS.occasion);
  legacy.occasion.links.push({ labelEnglish: 'More', url: 'https://example.com' });
  expect(DEFAULT_INAUGURATION_SETTINGS.occasion.links).toHaveLength(0);
  legacy.occasion.enabled = true;
  legacy.occasion.contentEnglish = 'Celebration';
  await expect(inaugurationService.saveSettings(legacy)).resolves.toMatchObject({ occasion: legacy.occasion });
  expect(apiClient.put).toHaveBeenCalledWith('/inauguration/settings', expect.objectContaining({ occasion: normalizeInaugurationSettings(legacy).occasion }));
});

test('strict occasion validation rejects unknown fields, invalid dates, nested links and image URLs before PUT', async () => {
  const invalid = [null, [], { extra: true }, { enabled: 'false' }, { enabled: true },
    ...['2026-02-29', '1900-02-29', '2026-04-31', '0000-01-01', '2026-13-01', '2026-1-01', null].map((date) => ({ date })),
    { titleEnglish: 1 }, { titlePunjabi: 'x'.repeat(201) }, { descriptionEnglish: 'x'.repeat(2001) }, { descriptionPunjabi: null },
    ...['contentEnglish', 'contentPunjabi'].flatMap((field) => [null, 1, {}, false, 'x'.repeat(4001)].map((value) => ({ [field]: value }))),
    ...['/home/photo.png', '//evil.com', '/uploads/%252e%252e/secret', 'https://user:pass@example.com', '/bad%zz'].map((imageUrl) => ({ imageUrl })),
    { links: {} }, { links: Array(5).fill({}) }, { links: [null] }, { links: [{ labelEnglish: 'More', url: 'https://example.com', extra: true }] },
    { links: [{ labelEnglish: 'x'.repeat(121), url: 'https://example.com' }] }, { links: [{ labelEnglish: 'More', labelPunjabi: null, url: 'https://example.com' }] },
    ...['/home', '//evil.com', 'https://user@example.com', 'https://example.com/%252e%252e/a', 'https://example.com/%0a', 'https://'].map((url) => ({ links: [{ labelEnglish: 'More', url }] }))];
  for (const occasion of invalid) {
    expect(validateInaugurationOccasion(occasion)).not.toBe('');
    await expect(inaugurationService.saveSettings({ ...normalizeInaugurationSettings(), occasion })).rejects.toThrow();
  }
  expect(apiClient.put).not.toHaveBeenCalled();
  expect(validateInaugurationOccasion({ date: '2000-02-29', imageUrl: '/api/uploads/photo.png' })).toBe('');
});

test('occasion availability uses Toronto civil dates across midnight, summer and DST transitions', () => {
  const occasion = { enabled: true, titleEnglish: 'Celebration' };
  expect(getInaugurationOccasionAvailability(occasion, Date.parse('2026-11-25T04:59:59Z'))).toEqual({ visible: true, date: '2026-11-24' });
  expect(getInaugurationOccasionAvailability(occasion, Date.parse('2026-11-25T05:00:00Z'))).toEqual({ visible: true, date: '2026-11-25' });
  const dated = { ...occasion, date: '2026-07-20' };
  expect(getInaugurationOccasionAvailability(dated, Date.parse('2026-07-20T03:59:59Z')).visible).toBe(false);
  expect(getInaugurationOccasionAvailability(dated, Date.parse('2026-07-20T04:00:00Z')).visible).toBe(true);
  expect(getInaugurationOccasionAvailability(dated, Date.parse('2026-07-21T04:00:00Z')).visible).toBe(false);
  for (const now of ['2026-11-01T05:30:00Z', '2026-11-01T06:30:00Z', '2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z']) {
    expect(getInaugurationOccasionAvailability(occasion, Date.parse(now))).toEqual({ visible: true, date: now.slice(0, 10) });
  }
  expect(getInaugurationOccasionAvailability({ ...occasion, enabled: false }).visible).toBe(false);
  expect(getInaugurationOccasionAvailability({ ...occasion, date: '2026-02-30' }).visible).toBe(false);
});

test('ticker normalization defaults malformed styles without coercing integers and preserves legacy images', () => {
  const defaults = DEFAULT_INAUGURATION_SETTINGS.occasion;
  for (const value of [null, false, '20', 20.5, NaN, Infinity, {}, -1, 999]) {
    expect(normalizeInaugurationSettings({ occasion: { backgroundColor: value, textColor: value, fontSize: value, height: value, speed: value, imageUrl: '/uploads/legacy.png' } }).occasion).toMatchObject({
      backgroundColor: defaults.backgroundColor, textColor: defaults.textColor, fontSize: 20, height: 80, speed: 60, imageUrl: '/uploads/legacy.png'
    });
  }
  expect(normalizeInaugurationSettings({ occasion: { backgroundColor: ' #aBc123 ', textColor: '#FEDCBA', fontSize: 40, height: 160 } }).occasion).toMatchObject({ backgroundColor: '#aBc123', textColor: '#FEDCBA', fontSize: 40, height: 160 });
});

test('ticker style validation rejects invalid types and bounds before PUT and saves inclusive bounds', async () => {
  const invalid = [
    ...['backgroundColor', 'textColor'].flatMap((field) => ['red', '#fff', '#12345678', '#GGGGGG', '', null, 123456, {}, false].map((value) => ({ [field]: value }))),
    ...[['fontSize', 11, 41], ['height', 47, 161], ['speed', 9, 201]].flatMap(([field, below, above]) => [below, above, 20.5, '20', null, false, {}, NaN, Infinity].map((value) => ({ [field]: value })))
  ];
  for (const occasion of invalid) {
    expect(validateInaugurationOccasion(occasion)).toMatch(/occasion\.(backgroundColor|textColor|fontSize|height|speed)/);
    await expect(inaugurationService.saveSettings({ ...normalizeInaugurationSettings(), occasion })).rejects.toThrow();
  }
  expect(apiClient.put).not.toHaveBeenCalled();
  for (const [fontSize, height, speed] of [[12, 48, 10], [40, 160, 200]]) {
    const settings = normalizeInaugurationSettings({ occasion: { fontSize, height, speed, backgroundColor: '#aBc123', textColor: '#FEDCBA', imageUrl: '/uploads/legacy.png' } });
    await expect(inaugurationService.saveSettings(settings)).resolves.toEqual(settings);
    expect(apiClient.put).toHaveBeenLastCalledWith('/inauguration/settings', settings);
  }
});

test('content migrates absent legacy fields, preserves explicit blanks and multiline text, and saves either language', async () => {
  const legacy = { enabled: true, titleEnglish: ' Legacy ', descriptionEnglish: ' First\nSecond ', titlePunjabi: 'ਸਮਾਗਮ', descriptionPunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ',
    links: [{ labelEnglish: 'More', url: 'https://example.com' }] };
  const normalized = normalizeInaugurationSettings({ occasion: legacy }).occasion;
  expect(normalized).toMatchObject({ contentEnglish: 'Legacy\nFirst\nSecond', contentPunjabi: 'ਸਮਾਗਮ\nਜੀ ਆਇਆਂ ਨੂੰ', speed: 60, titleEnglish: ' Legacy ', links: legacy.links });
  expect(normalizeInaugurationSettings({ occasion: { ...legacy, contentEnglish: '', contentPunjabi: 'New\nPunjabi' } }).occasion).toMatchObject({ contentEnglish: '', contentPunjabi: 'New\nPunjabi' });
  expect(normalizeInaugurationSettings({ occasion: { titleEnglish: 'Title only' } }).occasion.contentEnglish).toBe('Title only');
  expect(normalizeInaugurationSettings({ occasion: { descriptionPunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ' } }).occasion.contentPunjabi).toBe('ਜੀ ਆਇਆਂ ਨੂੰ');
  for (const occasion of [legacy, { enabled: true, contentEnglish: 'English\nOnly' }, { enabled: true, contentPunjabi: 'ਸਮਾਗਮ\nਜੀ ਆਇਆਂ ਨੂੰ' }, { enabled: true, contentEnglish: 'x'.repeat(4000), contentPunjabi: 'ਪ'.repeat(4000) }]) {
    const settings = { ...normalizeInaugurationSettings(), occasion };
    await expect(inaugurationService.saveSettings(settings)).resolves.toMatchObject({ occasion: normalizeInaugurationSettings(settings).occasion });
    expect(apiClient.put).toHaveBeenLastCalledWith('/inauguration/settings', normalizeInaugurationSettings(settings));
  }
  for (const occasion of [{ enabled: true, contentEnglish: ' \n', contentPunjabi: ' ' }, { ...legacy, contentEnglish: '', contentPunjabi: '' }]) {
    expect(validateInaugurationOccasion(occasion)).toMatch(/English or Punjabi content/);
  }
});

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
