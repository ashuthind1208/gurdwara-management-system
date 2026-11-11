import sikhWidgetService, { BANI_IDS, GURDWARA_OPTIONS, HUKAMNAMA_URL, normalizeSikhWidgetConfig, sikhWidgetDateKey } from './sikhWidgetService';
import recitationService from './recitationService';
import hukamnamaService from './hukamnamaService';

jest.mock('./recitationService', () => ({ getText: jest.fn() }));
jest.mock('./hukamnamaService', () => ({ getDailyHukamnama: jest.fn() }));

const live = () => ({
  date: { gregorian: { year: 2026, month: 11, date: 10 } },
  shabads: [{ shabadInfo: { pageNo: 678 }, verses: [
    { verse: { unicode: 'ਧਨਾਸਰੀ ਮਹਲਾ ੫ ॥' }, translation: { en: { ssk: 'Dhanaasaree, Fifth Mehl:', bdb: 'Not the selected translation' } }, transliteration: { english: 'dhanaasaree mahalaa panjavaa' } },
    { verse: { unicode: 'ਦੂਜੀ ਪੰਕਤੀ' }, translation: { en: { ssk: 'Second line' } } }
  ] }]
});
const originalFetch = global.fetch;
const originalTimeout = AbortSignal.timeout;

beforeEach(() => {
  jest.clearAllMocks();
  AbortSignal.timeout = jest.fn(() => new AbortController().signal);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => live() });
  recitationService.getText.mockResolvedValue({ lines: [{ g: 'ਸਤਿ ਨਾਮੁ', e: 'True Name', r: 'sat naam', a: 1 }] });
});
afterAll(() => { global.fetch = originalFetch; AbortSignal.timeout = originalTimeout; });

test('parses verified BaniDB fields, numeric date, Ang, English SSK and transliteration with a bounded fetch', async () => {
  const result = await sikhWidgetService.getContent('hukamnama', { limit: 1, url: 'https://untrusted.example' });
  expect(result.sourceDate).toBe('2026-11-10');
  expect(result.lines).toEqual([{ gurmukhi: 'ਧਨਾਸਰੀ ਮਹਲਾ ੫ ॥', english: 'Dhanaasaree, Fifth Mehl:', transliteration: 'dhanaasaree mahalaa panjavaa', ang: 678 }]);
  expect(global.fetch).toHaveBeenCalledWith(HUKAMNAMA_URL, expect.objectContaining({ signal: expect.anything(), cache: 'no-store' }));
  expect(AbortSignal.timeout).toHaveBeenCalledWith(12000);
  expect(result.credits[0].url).toBe(HUKAMNAMA_URL);
});

test('switches to the actual local daily envelope without using external or current/fallback feeds', async () => {
  const today = sikhWidgetDateKey();
  hukamnamaService.getDailyHukamnama.mockResolvedValue({ data: { date: today, entry: {
    date: today, ang: 12, selectedShabadId: '7', selectedShabadLines: [], lines: [
      { shabadId: '6', gurmukhi: 'Not selected' },
      { shabadId: '7', gurmukhi: 'ਸਥਾਨਕ ਪੰਕਤੀ', translationEnglish: 'Local scheduled text', transliteration: 'local' }
    ]
  }, morning: null, evening: null } });
  const result = await sikhWidgetService.getContent('hukamnama', { gurdwara: GURDWARA_OPTIONS[1] });
  expect(hukamnamaService.getDailyHukamnama).toHaveBeenCalledWith(today);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(result.lines).toEqual([{ gurmukhi: 'ਸਥਾਨਕ ਪੰਕਤੀ', english: 'Local scheduled text', transliteration: 'local', ang: 12 }]);
  expect(result.sourceDate).toBe(today);
  expect(result.credits[0].url).toBe('/hukamnama');
});

test('local missing daily entry is empty, while stale/fallback entries fail explicitly', async () => {
  const date = sikhWidgetDateKey();
  hukamnamaService.getDailyHukamnama.mockResolvedValue({ data: { date, entry: null } });
  expect((await sikhWidgetService.getContent('hukamnama', { gurdwara: GURDWARA_OPTIONS[1] })).lines).toEqual([]);
  for (const entry of [{ date: '2000-01-01', lines: [] }, { date, isFallback: true, lines: [] }]) {
    hukamnamaService.getDailyHukamnama.mockResolvedValue({ data: { date, entry } });
    await expect(sikhWidgetService.getContent('hukamnama', { gurdwara: GURDWARA_OPTIONS[1] })).rejects.toThrow();
  }
});

test('Ang uses the full bilingual recitation view and honors limit', async () => {
  const result = await sikhWidgetService.getContent('scripture', { ang: 1430, limit: 1 });
  expect(recitationService.getText).toHaveBeenCalledWith('ang', 1430, 'full');
  expect(result.lines[0]).toMatchObject({ gurmukhi: 'ਸਤਿ ਨਾਮੁ', english: 'True Name', transliteration: 'sat naam' });
  expect(result.credits[0].url).toBe('https://api.banidb.com/v2/angs/1430/G');
});

test.each(Object.entries(BANI_IDS))('%s uses verified bani ID %s', async (bani, id) => {
  const result = await sikhWidgetService.getContent('nitnem', { bani });
  expect(recitationService.getText).toHaveBeenCalledWith('bani', id, 'full');
  expect(result.title).toBe(bani);
});

test('resource cards are fixed curated links, limited, and require no live request', async () => {
  const result = await sikhWidgetService.getContent('sikh-resources');
  expect(result.provenance).toMatch(/Curated.*not a live feed/);
  expect(result.resources.map((item) => item.url)).toEqual(['https://sikhri.org', 'https://www.sikhcoalition.org/about-sikhs/', 'https://www.sikhitothemax.org', 'https://sgpc.net']);
  expect((await sikhWidgetService.getContent('sikh-resources', { limit: 2 })).resources).toHaveLength(2);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(recitationService.getText).not.toHaveBeenCalled();
});

test.each([
  ['hukamnama', { gurdwara: 'Unverified Gurdwara' }], ['scripture', { ang: 0 }],
  ['scripture', { ang: 1431 }], ['scripture', { ang: 2.5 }],
  ['nitnem', { bani: 'Unknown' }], ['unknown', {}]
])('rejects invalid selection %s %j', async (source, config) => {
  await expect(sikhWidgetService.getContent(source, config)).rejects.toThrow();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(recitationService.getText).not.toHaveBeenCalled();
});

test('clamps excerpt size and excludes malformed line values rather than inventing text', async () => {
  expect(normalizeSikhWidgetConfig('scripture', { limit: 100 }).limit).toBe(12);
  expect(normalizeSikhWidgetConfig('scripture', { limit: -1 }).limit).toBe(1);
  recitationService.getText.mockResolvedValue({ lines: [null, 'unstructured', { g: { unicode: 'wrong shape' } }, { g: 'valid', e: { html: 'wrong shape' } }] });
  expect((await sikhWidgetService.getContent('scripture')).lines).toEqual([{ gurmukhi: 'valid', english: '', transliteration: '', ang: null }]);
});

test.each([
  { date: live().date, shabads: {} },
  { date: live().date, shabads: [{ verses: {} }] },
  { ...live(), date: { gregorian: { year: 2026, month: 2, date: 30 } } },
  { ...live(), date: { gregorian: { year: '2026', month: 11, date: 10 } } }
])('rejects malformed external date/list shapes %#', async (payload) => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => payload });
  await expect(sikhWidgetService.getContent('hukamnama')).rejects.toThrow();
});

test('empty external arrays are empty, malformed recitation arrays and request failures reject', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...live(), shabads: [] }) });
  expect((await sikhWidgetService.getContent('hukamnama')).lines).toEqual([]);
  global.fetch.mockResolvedValueOnce({ ok: false });
  await expect(sikhWidgetService.getContent('hukamnama')).rejects.toThrow('unavailable');
  global.fetch.mockRejectedValueOnce(new Error('timeout'));
  await expect(sikhWidgetService.getContent('hukamnama')).rejects.toThrow('timeout');
  recitationService.getText.mockResolvedValue({ lines: {} });
  await expect(sikhWidgetService.getContent('nitnem')).rejects.toThrow('invalid list');
  recitationService.getText.mockRejectedValue(new Error('offline'));
  await expect(sikhWidgetService.getContent('scripture')).rejects.toThrow('offline');
});