export const GUTKA_READING_UPDATED = 'ssm-gutka-reading-updated';
const PREFIX = 'ssm-gutka-reading-v1';
export const emptyReadingHistory = () => ({ sessions: 0, lines: 0, minutes: 0, angs: [], bySource: {}, days: {} });
export const readingHistoryKey = (userId) => userId === null || userId === undefined || userId === '' ? '' : `${PREFIX}:${userId}`;
const count = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

export const readReadingHistory = (userId) => {
  const key = readingHistoryKey(userId);
  if (!key) return emptyReadingHistory();
  try {
    const data = record(JSON.parse(window.localStorage.getItem(key) || 'null'));
    return {
      sessions: count(data.sessions), lines: count(data.lines), minutes: count(data.minutes),
      angs: Array.isArray(data.angs) ? [...new Set(data.angs.map(Number).filter((ang) => Number.isInteger(ang) && ang >= 1 && ang <= 1430))] : [],
      bySource: Object.fromEntries(Object.entries(record(data.bySource)).map(([source, item]) => [source, { title: String(item?.title || source), lines: count(item?.lines) }])),
      days: Object.fromEntries(Object.entries(record(data.days)).map(([day, value]) => [day, count(value)]))
    };
  } catch { return emptyReadingHistory(); }
};

export const updateReadingHistory = (userId, update) => {
  const key = readingHistoryKey(userId);
  if (!key) return emptyReadingHistory();
  const next = update(readReadingHistory(userId));
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(GUTKA_READING_UPDATED, { detail: { key } }));
  } catch { /* Storage can be unavailable; do not claim activity was saved. */ }
  return next;
};

export const subscribeReadingHistory = (userId, listener) => {
  const key = readingHistoryKey(userId);
  if (!key) return () => {};
  const onUpdate = (event) => { if (event.detail?.key === key) listener(); };
  const onStorage = (event) => { if (event.key === key || event.key === null) listener(); };
  window.addEventListener(GUTKA_READING_UPDATED, onUpdate);
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener(GUTKA_READING_UPDATED, onUpdate);
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', listener);
  };
};