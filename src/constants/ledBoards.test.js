import { buildLedSlides, LED_BOARDS, toEmbedSrc } from './ledBoards';

beforeEach(() => { window.history.replaceState({}, '', '/'); });

test('registers Welcome Journey as a screen-selectable LED board', () => {
  const welcome = LED_BOARDS.find((entry) => entry.key === 'welcome');
  expect(welcome.path).toBe('/welcome-journey-board');
  expect(toEmbedSrc(welcome)).toContain('/welcome-journey-board?embed=1');
  const settings = { enabled: Object.fromEntries(LED_BOARDS.map((entry) => [entry.key, entry.key === 'welcome'])), screenPlaylists: {}, intervalSeconds: 30, hukamnamaSeconds: 60 };
  expect(buildLedSlides(settings, { welcomeJourneyEnabled: true })).toEqual([expect.objectContaining({ key: 'board:welcome', durationSeconds: 30 })]);
  expect(buildLedSlides(settings, { welcomeJourneyEnabled: false })).toEqual([]);
});