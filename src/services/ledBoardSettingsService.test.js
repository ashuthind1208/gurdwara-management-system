import { LED_BOARDS } from '../constants/ledBoards';
import { normalizeSettings } from './ledBoardSettingsService';

test('all slides except Hukamnama share the common default duration', () => {
  const settings = normalizeSettings({});
  expect(settings.slideDurations.hukamnama).toBe(settings.hukamnamaSeconds);
  for (const board of LED_BOARDS.filter(({ key }) => key !== 'hukamnama')) {
    expect(settings.slideDurations[board.key]).toBe(settings.intervalSeconds);
  }
});

test('retains explicit per-slide custom durations and clamps them to board limits', () => {
  const settings = normalizeSettings({
    intervalSeconds: 20,
    slideDurations: { events: 47, hukamnama: 900, welcome: 120, special: 0 }
  });
  expect(settings.slideDurations.events).toBe(47);
  expect(settings.slideDurations.hukamnama).toBe(900);
  expect(settings.slideDurations.welcome).toBe(120);
  expect(settings.slideDurations.special).toBe(20);
});

test('migrates the old default Welcome duration to shared timing but retains non-default custom duration', () => {
  expect(normalizeSettings({ intervalSeconds: 18, welcomeSeconds: 30 }).slideDurations.welcome).toBe(18);
  expect(normalizeSettings({ intervalSeconds: 18, welcomeSeconds: 45 }).slideDurations.welcome).toBe(45);
});
