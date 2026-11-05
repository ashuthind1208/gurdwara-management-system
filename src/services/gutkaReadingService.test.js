import { emptyReadingHistory, readReadingHistory, subscribeReadingHistory, updateReadingHistory } from './gutkaReadingService';

beforeEach(() => localStorage.clear());

test('reads existing keys and merges updates from latest persisted history', () => {
  updateReadingHistory('member', (history) => ({ ...history, sessions: history.sessions + 1 }));
  updateReadingHistory('member', (history) => ({ ...history, sessions: history.sessions + 1 }));
  expect(readReadingHistory('member').sessions).toBe(2);
  expect(readReadingHistory('other')).toEqual(emptyReadingHistory());
});

test('guests are never stored or subscribed', () => {
  const listener = jest.fn();
  const update = jest.fn();
  const unsubscribe = subscribeReadingHistory(null, listener);
  updateReadingHistory(null, update);
  window.dispatchEvent(new Event('focus'));
  expect(update).not.toHaveBeenCalled();
  expect(listener).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  unsubscribe();
});

test('handles malformed history and unavailable storage without crashing', () => {
  localStorage.setItem('ssm-gutka-reading-v1:member', '{broken');
  expect(readReadingHistory('member')).toEqual(emptyReadingHistory());
  localStorage.setItem('ssm-gutka-reading-v1:member', JSON.stringify({ lines: -5, minutes: 'bad', angs: null, days: [], bySource: { broken: null } }));
  expect(readReadingHistory('member')).toMatchObject({ lines: 0, minutes: 0, angs: [], days: {}, bySource: { broken: { title: 'broken', lines: 0 } } });
  const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
  expect(() => updateReadingHistory('member', (history) => history)).not.toThrow();
  spy.mockRestore();
});

test('unsubscription removes all event listeners', () => {
  const listener = jest.fn();
  const unsubscribe = subscribeReadingHistory('member', listener);
  unsubscribe();
  updateReadingHistory('member', (history) => history);
  window.dispatchEvent(new StorageEvent('storage', { key: 'ssm-gutka-reading-v1:member' }));
  window.dispatchEvent(new Event('focus'));
  expect(listener).not.toHaveBeenCalled();
});