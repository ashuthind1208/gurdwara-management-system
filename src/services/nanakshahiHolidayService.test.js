import nanakshahiHolidayService from './nanakshahiHolidayService';

const sampleHoliday = {
  id: 'guru-nanak-gurpurab',
  gregorian: '2026-11-06',
  type: 'gurpurab',
  isGurpurab: true,
  name: { guru: { en: 'Guru Nanak', pa: 'ਗੁਰੂ ਨਾਨਕ' }, event: { en: 'Gurpurab', pa: 'ਗੁਰਪੁਰਬ' } },
  nanakshahi: { day: 1, month: 8, monthName: { en: 'Maghar', pa: 'ਮੱਘਰ' }, year: 558 },
  significance: { en: 'A celebration.', pa: 'ਇੱਕ ਜਸ਼ਨ।' }
};

beforeEach(() => jest.restoreAllMocks());

test('loads year data from same-origin backend rather than calling Gurpurab directly', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ holidays: [sampleHoliday] }) });
  const results = await nanakshahiHolidayService.getHolidaysForDateWindow(new Date(2026, 10, 6));
  expect(fetchMock).toHaveBeenCalled();
  for (const [url] of fetchMock.mock.calls) {
    expect(url).toMatch(/^\/api\/gurpurab\/holidays\?year=/);
    expect(url).not.toContain('api.gurpurab.com');
  }
  expect(results[0]).toMatchObject({ title: 'Guru Nanak - Gurpurab', gregorianDate: '2026-11-06' });
});

test('loads upcoming observances through the same-origin backend endpoint', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ holidays: [sampleHoliday] }) });
  const upcoming = await nanakshahiHolidayService.getUpcomingHolidays(3);
  expect(fetchMock).toHaveBeenCalledWith('/api/gurpurab/upcoming?limit=3', expect.objectContaining({ signal: expect.anything() }));
  expect(upcoming[0].gregorianDate).toBe('2026-11-06');
});
