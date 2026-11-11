import { buildLedSlides, getSlideDurationSeconds, LED_BOARDS, toEmbedSrc } from './ledBoards';

beforeEach(() => { window.history.replaceState({}, '', '/'); });

test('registers Welcome Journey as a screen-selectable LED board', () => {
  const welcome = LED_BOARDS.find((entry) => entry.key === 'welcome');
  expect(welcome.path).toBe('/welcome-journey-board');
  expect(toEmbedSrc(welcome)).toContain('/welcome-journey-board?embed=1');
  const settings = { enabled: Object.fromEntries(LED_BOARDS.map((entry) => [entry.key, entry.key === 'welcome'])), screenPlaylists: {}, intervalSeconds: 30, hukamnamaSeconds: 60 };
  expect(buildLedSlides(settings, { welcomeJourneyEnabled: true })).toEqual([expect.objectContaining({ key: 'board:welcome', durationSeconds: 30 })]);
  expect(buildLedSlides(settings, { welcomeJourneyEnabled: false })).toEqual([]);
});

test('uses individual board durations and applies them to every announcement slide', () => {
  const settings = {
    enabled: Object.fromEntries(LED_BOARDS.map((entry) => [entry.key, true])),
    screenPlaylists: {}, intervalSeconds: 15, hukamnamaSeconds: 60,
    slideDurations: { events: 42, special: 25, welcome: 35, hukamnama: 180 }
  };
  expect(getSlideDurationSeconds(settings, 'langar')).toBe(15);
  expect(getSlideDurationSeconds(settings, 'events')).toBe(42);
  expect(getSlideDurationSeconds(settings, 'hukamnama')).toBe(180);
  const slides = buildLedSlides(settings, { hasHukamnama: true, liveAnnouncements: [{ id: 'notice-1', title: 'Notice' }, { id: 'notice-2', title: 'Another' }] });
  expect(slides.find((slide) => slide.key === 'board:events').durationSeconds).toBe(42);
  expect(slides.find((slide) => slide.key === 'board:hukamnama').durationSeconds).toBe(180);
  expect(slides.filter((slide) => slide.kind === 'announcement').map((slide) => slide.durationSeconds)).toEqual([25, 25]);
  expect(slides.find((slide) => slide.key === 'board:welcome').durationSeconds).toBe(35);
});