import { registerNanakshahiMonthStarts } from '../utils/punjabiCalendar';

const GURPURAB_HOLIDAYS_API_URL = '/api/gurpurab/holidays';
const GURPURAB_UPCOMING_API_URL = '/api/gurpurab/upcoming';
const REQUEST_TIMEOUT_MS = 12000;
const YEAR_CACHE_TTL_MS = 60 * 60 * 1000;
const EMPTY_YEAR_CACHE_TTL_MS = 5 * 60 * 1000;
const yearHolidayCache = new Map();

const withTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    window.clearTimeout(timeoutId);
  }
};

const isPlainNameNode = (value) => value && typeof value === 'object' && ('en' in value || 'pa' in value);

const getPrimaryLabel = (name) => {
  if (!name || typeof name !== 'object') {
    return { en: '', pa: '' };
  }

  if (isPlainNameNode(name)) {
    return {
      en: String(name.en || '').trim(),
      pa: String(name.pa || '').trim()
    };
  }

  const preferredOrder = ['guru', 'person', 'event', 'gurpurab'];
  for (const key of preferredOrder) {
    if (isPlainNameNode(name[key])) {
      return {
        en: String(name[key].en || '').trim(),
        pa: String(name[key].pa || '').trim()
      };
    }
  }

  const firstComposite = Object.values(name).find((node) => isPlainNameNode(node));
  if (firstComposite) {
    return {
      en: String(firstComposite.en || '').trim(),
      pa: String(firstComposite.pa || '').trim()
    };
  }

  return { en: '', pa: '' };
};

const getSecondaryLabel = (name) => {
  if (!name || typeof name !== 'object' || isPlainNameNode(name)) {
    return { en: '', pa: '' };
  }

  const preferredOrder = ['gurpurab', 'event'];
  for (const key of preferredOrder) {
    if (isPlainNameNode(name[key])) {
      return {
        en: String(name[key].en || '').trim(),
        pa: String(name[key].pa || '').trim()
      };
    }
  }

  return { en: '', pa: '' };
};

const joinParts = (...parts) => parts.filter(Boolean).join(' - ');

const mapHolidayToObservance = (holiday) => {
  const primary = getPrimaryLabel(holiday?.name);
  const secondary = getSecondaryLabel(holiday?.name);

  const titleEn = joinParts(primary.en, secondary.en) || String(holiday?.id || '').trim();
  const titlePa = joinParts(primary.pa, secondary.pa);

  const personNode = holiday?.name?.person || holiday?.name?.guru || null;
  const eventNode = holiday?.name?.event || holiday?.name?.gurpurab || null;

  const date = String(holiday?.gregorian || '').trim();
  const type = String(holiday?.type || 'observance').trim();

  return {
    id: String(holiday?.id || `${type}-${date}`).trim(),
    date,
    title: titleEn,
    titlePa,
    type,
    occasion: secondary.en || type,
    blurb: String(holiday?.significance?.en || '').trim(),
    blurbPa: String(holiday?.significance?.pa || '').trim(),
    significanceEn: String(holiday?.significance?.en || '').trim(),
    significancePa: String(holiday?.significance?.pa || '').trim(),
    personEn: String(personNode?.en || '').trim(),
    personPa: String(personNode?.pa || '').trim(),
    eventEn: String(eventNode?.en || '').trim(),
    eventPa: String(eventNode?.pa || '').trim(),
    eventType: type,
    isGurpurab: Boolean(holiday?.isGurpurab),
    importance: Number(holiday?.importance || 0),
    gregorianDate: date,
    nanakshahiDate: {
      day: Number(holiday?.nanakshahi?.day || 0),
      month: Number(holiday?.nanakshahi?.month || 0),
      monthNameEn: String(holiday?.nanakshahi?.monthName?.en || '').trim(),
      monthNamePa: String(holiday?.nanakshahi?.monthName?.pa || '').trim(),
      year: Number(holiday?.nanakshahi?.year || 0)
    }
  };
};

const dedupeByIdAndDate = (items) => {
  const seen = new Set();
  const unique = [];

  items.forEach((item) => {
    const key = `${item.id}::${item.date}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  });

  return unique;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toDayTimestamp = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return Number.NaN;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  return Date.UTC(year, monthIndex, day);
};

const normalizeToken = (value) => String(value || '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const buildConsecutiveDuplicateFingerprint = (item) => {
  return [
    normalizeToken(item.type),
    normalizeToken(item.title),
    normalizeToken(item.significanceEn),
    normalizeToken(item.personEn),
    normalizeToken(item.eventEn)
  ].join('::');
};

const scoreObservanceCompleteness = (item) => {
  let score = 0;
  if (item.titlePa) score += 1;
  if (item.significancePa) score += 1;
  if (item.personPa) score += 1;
  if (item.eventPa) score += 1;
  score += Number(item.importance || 0);
  return score;
};

const dedupeConsecutiveEquivalentObservances = (items) => {
  const sorted = [...items].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const filtered = [];

  for (const item of sorted) {
    const currentDate = toDayTimestamp(item.date);
    const fingerprint = buildConsecutiveDuplicateFingerprint(item);
    const previousIndex = filtered.findIndex((entry) => buildConsecutiveDuplicateFingerprint(entry) === fingerprint);

    if (previousIndex === -1) {
      filtered.push(item);
      continue;
    }

    const previous = filtered[previousIndex];
    const previousDate = toDayTimestamp(previous.date);
    const isConsecutiveDuplicate = Number.isFinite(currentDate)
      && Number.isFinite(previousDate)
      && Math.abs(currentDate - previousDate) <= DAY_MS;

    if (!isConsecutiveDuplicate) {
      filtered.push(item);
      continue;
    }

    const currentScore = scoreObservanceCompleteness(item);
    const previousScore = scoreObservanceCompleteness(previous);

    if (currentScore > previousScore) {
      filtered[previousIndex] = item;
      continue;
    }

    if (currentScore === previousScore && String(item.date) < String(previous.date)) {
      filtered[previousIndex] = item;
    }
  }

  return filtered.sort((a, b) => String(a.date).localeCompare(String(b.date)));
};

const getNanakshahiYearFromDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const isOnOrAfterChetOne = month > 2 || (month === 2 && day >= 14);
  return isOnOrAfterChetOne ? year - 1468 : year - 1469;
};

const fetchYear = async (year) => {
  const cached = yearHolidayCache.get(year);
  if (cached?.data && Date.now() - cached.fetchedAt < (cached.data.length ? YEAR_CACHE_TTL_MS : EMPTY_YEAR_CACHE_TTL_MS)) {
    return cached.data;
  }
  if (cached?.promise) {
    return cached.promise;
  }

  const pending = (async () => {
  const response = await withTimeout(`${GURPURAB_HOLIDAYS_API_URL}?year=${encodeURIComponent(String(year))}`);

  if (!response.ok) {
    throw new Error(`Gurpurab holidays request failed for year ${year} with status ${response.status}`);
  }

  const payload = await response.json();
  const holidays = Array.isArray(payload?.holidays) ? payload.holidays : [];
    registerNanakshahiMonthStarts(holidays);
    const mapped = holidays.map(mapHolidayToObservance).filter((entry) => entry.date);
    yearHolidayCache.set(year, { data: mapped, fetchedAt: Date.now() });
    return mapped;
  })();

  yearHolidayCache.set(year, { promise: pending });

  try {
    return await pending;
  } catch (error) {
    yearHolidayCache.delete(year);
    throw error;
  }
};

const getHolidaysForDateWindow = async (anchorDate = new Date()) => {
  const currentYear = getNanakshahiYearFromDate(anchorDate);
  const years = [currentYear - 1, currentYear, currentYear + 1];

  const responses = await Promise.all(years.map((year) => fetchYear(year).catch(() => [])));
  const merged = responses.flat();

  return dedupeConsecutiveEquivalentObservances(
    dedupeByIdAndDate(merged)
  );
};

const getUpcomingHolidays = async (limit = 5) => {
  const safeLimit = Math.max(1, Number(limit) || 5);
  const response = await withTimeout(`${GURPURAB_UPCOMING_API_URL}?limit=${encodeURIComponent(String(safeLimit))}`);

  if (!response.ok) {
    throw new Error(`Gurpurab upcoming holidays request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const holidays = Array.isArray(payload?.holidays) ? payload.holidays : [];
  return dedupeConsecutiveEquivalentObservances(
    dedupeByIdAndDate(holidays.map(mapHolidayToObservance).filter((entry) => entry.date))
  ).slice(0, safeLimit);
};

const nanakshahiHolidayService = {
  getHolidaysForDateWindow,
  getUpcomingHolidays,
  getNanakshahiYearFromDate
};

export default nanakshahiHolidayService;
