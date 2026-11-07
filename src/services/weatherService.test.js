import weatherService, { buildGeocodingQueries } from './weatherService';

const geocodeResult = { results: [{ name: 'Milton', admin1: 'Ontario', latitude: 43.51681, longitude: -79.88294 }] };
const forecastResult = {
  current: { temperature_2m: 18.4, weather_code: 2 },
  daily: {
    time: ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'],
    weather_code: [2, 0, 61, 3],
    temperature_2m_max: [20, 21, 16, 14],
    temperature_2m_min: [12, 11, 9, 8],
    sunrise: ['2026-11-06T07:45', '2026-11-07T07:47', '2026-11-08T07:48', '2026-11-09T07:50'],
    sunset: ['2026-11-06T17:02', '2026-11-07T17:00', '2026-11-08T16:59', '2026-11-09T16:57']
  }
};

beforeEach(() => jest.restoreAllMocks());

test('derives a geocoder-friendly Canadian locality from a street address', () => {
  expect(buildGeocodingQueries('7035 Sixth Line, Milton ON')).toEqual([
    '7035 Sixth Line, Milton ON',
    'Milton, ON, Canada',
    '7035 Sixth Line, Milton ON, Canada'
  ]);
  expect(buildGeocodingQueries('Milton, Ontario')).toContain('Milton, Ontario, Canada');
});

test('falls back from an unrecognized street address and returns local forecast and sun times', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    .mockResolvedValueOnce({ ok: true, json: async () => geocodeResult })
    .mockResolvedValueOnce({ ok: true, json: async () => forecastResult });

  const result = await weatherService.getForAddress('7035 Sixth Line, Milton ON');

  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('name')).toBe('7035 Sixth Line, Milton ON');
  expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get('name')).toBe('Milton, ON, Canada');
  expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get('latitude')).toBe('43.51681');
  expect(result).toMatchObject({ location: 'Milton, Ontario', temperature: 18, description: 'Partly cloudy', days: expect.arrayContaining([expect.objectContaining({ sunrise: '2026-11-06T07:45', sunset: '2026-11-06T17:02' })]) });
});

test('uses a newly saved Gurdwara address to geocode the updated location', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce({ ok: true, json: async () => geocodeResult })
    .mockResolvedValueOnce({ ok: true, json: async () => forecastResult });
  await weatherService.getForAddress('123 Main Street, Milton ON');
  expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get('name')).toBe('123 Main Street, Milton ON');
});
