const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const CANADIAN_PROVINCES = new Map([
  ['AB', 'Alberta'], ['BC', 'British Columbia'], ['MB', 'Manitoba'], ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'], ['NS', 'Nova Scotia'], ['NT', 'Northwest Territories'],
  ['NU', 'Nunavut'], ['ON', 'Ontario'], ['PE', 'Prince Edward Island'], ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'], ['YT', 'Yukon']
]);

const buildGeocodingQueries = (address) => {
  const raw = String(address || '').trim();
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const queries = [raw];
  const tail = parts[parts.length - 1] || '';
  const abbreviatedTail = tail.match(/^(.+?)\s+([A-Z]{2})$/i);
  if (abbreviatedTail && CANADIAN_PROVINCES.has(abbreviatedTail[2].toUpperCase())) {
    queries.push(`${abbreviatedTail[1]}, ${abbreviatedTail[2].toUpperCase()}, Canada`);
  }
  if (parts.length >= 2) {
    const locality = parts.slice(-2).join(', ');
    queries.push(`${locality}, Canada`);
  }
  if (parts.length >= 3) queries.push(parts.slice(-3).join(', '));
  return [...new Set(queries.filter((query) => query.length >= 3))];
};

const weatherDescription = (code) => {
  const value = Number(code);
  if (value === 0) return 'Clear sky';
  if (value === 1) return 'Mainly clear';
  if (value === 2) return 'Partly cloudy';
  if (value === 3) return 'Overcast';
  if ([45, 48].includes(value)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(value)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'Snow';
  if ([95, 96, 99].includes(value)) return 'Thunderstorm';
  return 'Conditions unavailable';
};

const weatherIcon = (code) => {
  const value = Number(code);
  if (value === 0 || value === 1) return 'sun';
  if ([95, 96, 99].includes(value)) return 'storm';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(value)) return 'snow';
  return 'cloud';
};

const requestJson = async (url, signal) => {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Weather information is temporarily unavailable.');
  return response.json();
};

const weatherService = {
  getForAddress: async (address, { signal } = {}) => {
    const query = String(address || '').trim();
    if (query.length < 3) throw new Error('Gurdwara location is not set.');
    let place = null;
    for (const candidate of buildGeocodingQueries(query)) {
      const geocodingParams = new URLSearchParams({ name: candidate, count: '1', language: 'en', format: 'json' });
      const geocoding = await requestJson(`${GEOCODING_URL}?${geocodingParams}`, signal);
      place = geocoding?.results?.[0] || null;
      if (place) break;
    }
    if (!place || !Number.isFinite(Number(place.latitude)) || !Number.isFinite(Number(place.longitude))) {
      throw new Error('Gurdwara location could not be found.');
    }

    const forecastParams = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,weather_code',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset',
      temperature_unit: 'celsius',
      timezone: 'auto',
      forecast_days: '4'
    });
    const forecast = await requestJson(`${FORECAST_URL}?${forecastParams}`, signal);
    const daily = forecast?.daily || {};
    const days = (daily.time || []).slice(0, 4).map((date, index) => ({
      date,
      description: weatherDescription(daily.weather_code?.[index]),
      icon: weatherIcon(daily.weather_code?.[index]),
      high: Number.isFinite(Number(daily.temperature_2m_max?.[index])) ? Math.round(daily.temperature_2m_max[index]) : null,
      low: Number.isFinite(Number(daily.temperature_2m_min?.[index])) ? Math.round(daily.temperature_2m_min[index]) : null,
      sunrise: daily.sunrise?.[index] || '',
      sunset: daily.sunset?.[index] || ''
    }));
    const temperature = Number(forecast?.current?.temperature_2m);
    if (!Number.isFinite(temperature)) throw new Error('Current weather is unavailable.');

    return {
      location: [place.name, place.admin1].filter(Boolean).join(', '),
      temperature: Math.round(temperature),
      description: weatherDescription(forecast.current.weather_code),
      icon: weatherIcon(forecast.current.weather_code),
      days
    };
  }
};

export { weatherDescription, weatherIcon };
export { buildGeocodingQueries };
export default weatherService;
