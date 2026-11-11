import { BookOpenIcon, CalendarDaysIcon, GiftIcon, MegaphoneIcon, QueueListIcon, SparklesIcon, Squares2X2Icon } from '@heroicons/react/24/outline';

export const LED_BOARDS = [
  { key: 'donation', title: 'Donation Board', description: 'Live campaigns, progress, donors, and donation QR code.', path: '/donation-board', embedParams: { fullscreen: '1' }, icon: GiftIcon, accent: 'border-amber-300 bg-amber-50 text-amber-800' },
  { key: 'events', title: 'Events Calendar Board', description: 'Upcoming events, Nanakshahi dates, and registration activity.', path: '/event-calendar-board', icon: CalendarDaysIcon, accent: 'border-sky-300 bg-sky-50 text-sky-800' },
  { key: 'langar', title: 'Langar Needs Board', description: 'Current grocery needs, progress, contributors, and QR code.', path: '/langar-board', icon: QueueListIcon, accent: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  { key: 'schedule', title: 'Daily Schedule Board', description: 'Today\'s activities with the ongoing program highlighted.', path: '/daily-schedule-board', icon: Squares2X2Icon, accent: 'border-blue-300 bg-blue-50 text-blue-800' },
  { key: 'hukamnama', title: 'Daily Hukamnama Board', description: 'Today\'s hukamnama with translations, sized to fit the screen.', path: '/hukamnama-board', icon: BookOpenIcon, accent: 'border-orange-300 bg-orange-50 text-orange-800', hasOwnDuration: true },
  { key: 'granthi', title: 'Ask a Granthi Board', description: 'A public question screen for the sangat.', path: '/ask-a-granthi?screen=welcome', icon: SparklesIcon, accent: 'border-violet-300 bg-violet-50 text-violet-800' },
  { key: 'special', title: 'Special Events Board', description: 'Event photos and formatted announcements managed below.', path: '/special-events-board', icon: MegaphoneIcon, accent: 'border-rose-300 bg-rose-50 text-rose-800', isAnnouncementBoard: true },
  { key: 'community', title: 'Community Announcements Board', description: 'Moderated bilingual community notices and services.', path: '/community-announcements-board', icon: MegaphoneIcon, accent: 'border-amber-300 bg-amber-50 text-amber-900' },
  { key: 'welcome', title: 'Sangat Welcome Journey', description: 'Welcome visitors with today’s program, langar, directions, and optional follow-up.', path: '/welcome-journey-board', icon: SparklesIcon, accent: 'border-cyan-300 bg-cyan-50 text-cyan-900', hasOwnDuration: true }
];

export const LED_SCREENS = [
  { id: 'main', label: 'Main Hall' },
  { id: 'darbar', label: 'Darbar Hall' },
  { id: 'langar', label: 'Langar Hall' },
  { id: 'lobby', label: 'Lobby' }
];

export const SCREEN_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,29}$/;
export const MAX_CUSTOM_SCREENS = 20;

export const slugifyScreenId = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

// Built-in screens plus any custom ones saved in the LED settings.
export const getLedScreens = (settings) => [...LED_SCREENS, ...(settings?.customScreens || [])];

export const readScreenId = (value) => {
  const id = String(value || 'main').trim().toLowerCase();
  return SCREEN_ID_PATTERN.test(id) ? id : 'main';
};

export const MIN_INTERVAL_SECONDS = 3;
export const MAX_INTERVAL_SECONDS = 600;
export const DEFAULT_INTERVAL_SECONDS = 15;
export const INTERVAL_PRESETS = [10, 15, 30, 60];

// The hukamnama is read, not glanced at, so it has its own, longer time on screen.
export const HUKAMNAMA_MIN_SECONDS = 10;
export const HUKAMNAMA_MAX_SECONDS = 1800;
export const DEFAULT_HUKAMNAMA_SECONDS = 60;
export const HUKAMNAMA_PRESETS = [90, 120];
export const WELCOME_MIN_SECONDS = 10;
export const WELCOME_MAX_SECONDS = 300;
export const DEFAULT_WELCOME_SECONDS = 30;
export const WELCOME_PRESETS = [30, 45, 60];

export const getSlideDurationSeconds = (settings, boardKey) => {
  const configured = Number(settings?.slideDurations?.[boardKey]);
  if (Number.isInteger(configured) && configured > 0) return configured;
  if (boardKey === 'hukamnama') return settings?.hukamnamaSeconds || DEFAULT_HUKAMNAMA_SECONDS;
  return settings?.intervalSeconds || DEFAULT_INTERVAL_SECONDS;
};

export const toEmbedSrc = (board) => {
  const url = new URL(board.path, window.location.origin);
  url.searchParams.set('embed', '1');
  Object.entries(board.embedParams || {}).forEach(([name, value]) => url.searchParams.set(name, value));
  return `${url.pathname}${url.search}`;
};

// Builds the slide list the LED screen plays: enabled boards in order, with one slide per live announcement.
// Boards with nothing to show (no announcements, no hukamnama posted yet) are skipped.
export const buildLedSlides = (settings, { liveAnnouncements = [], hasHukamnama = false, screenId = 'main', festivalSlides = [], welcomeJourneyEnabled = true } = {}) => {
  const selectedKeys = [...(settings.screenPlaylists?.[screenId] || LED_BOARDS.filter((board) => settings.enabled[board.key]).map((board) => board.key))];
  if (screenId === 'lobby' && settings.enabled.welcome && !selectedKeys.includes('welcome')) selectedKeys.push('welcome');
  const orderedBoards = selectedKeys.map((key) => LED_BOARDS.find((board) => board.key === key)).filter(Boolean);
  const slides = orderedBoards
  .filter((board) => settings.enabled[board.key] && (board.key !== 'hukamnama' || hasHukamnama) && (board.key !== 'welcome' || welcomeJourneyEnabled))
  .flatMap((board) => (board.isAnnouncementBoard
    ? liveAnnouncements.map((announcement) => ({ key: `announcement:${announcement.id}`, kind: 'announcement', label: `Special Event · ${announcement.title || 'Announcement'}`, announcement, durationSeconds: getSlideDurationSeconds(settings, board.key) }))
    : [{ key: `board:${board.key}`, kind: 'board', label: board.title, src: toEmbedSrc(board), durationSeconds: getSlideDurationSeconds(settings, board.key) } ]));
  if (settings.festivalBannersEnabled !== false) slides.push(...festivalSlides);
  return slides;
};
