const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_WELCOME_JOURNEY_SETTINGS, normalizeWelcomeJourneySettings, validateWelcomeFollowUp, allowWelcomeFollowUpSubmission } = require('./welcomeJourney');

test('provides bilingual Welcome Journey defaults with live program, langar, and opt-in enabled', () => {
  const settings = normalizeWelcomeJourneySettings();
  assert.equal(settings.enabled, true);
  assert.equal(settings.showProgram, true);
  assert.equal(settings.showLangar, true);
  assert.equal(settings.showFollowUp, true);
  assert.equal(settings.showDirections, true);
  assert.equal(settings.showLangarMenu, true);
  assert.equal(settings.langarServiceTimeEnglish, '');
  assert.equal(settings.langarServiceTimePunjabi, '');
  assert.deepEqual(settings.dishes, []);
  assert.deepEqual(settings.selectedDishIds, []);
  assert.ok(settings.titlePunjabi);
});

const dish = (id = 'dal') => ({ id, nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' });

test('normalizes a reusable catalog and preserves selected order, bilingual service times and switches', () => {
  const input = { dishes: [dish(), dish('rice')], selectedDishIds: ['rice', 'dal'], langarServiceTimeEnglish: '  From noon  ', langarServiceTimePunjabi: 'ਦੁਪਹਿਰ ਤੋਂ', showDirections: false, showLangarMenu: false, theme: 'warm' };
  const settings = normalizeWelcomeJourneySettings(input);
  assert.deepEqual(settings.dishes, input.dishes);
  assert.notEqual(settings.dishes, input.dishes);
  assert.deepEqual(settings.selectedDishIds, ['rice', 'dal']);
  assert.equal(settings.langarServiceTimeEnglish, 'From noon');
  assert.equal(settings.langarServiceTimePunjabi, 'ਦੁਪਹਿਰ ਤੋਂ');
  assert.equal(settings.showDirections, false);
  assert.equal(settings.showLangarMenu, false);
  assert.equal(settings.theme, 'warm');
  assert.deepEqual(normalizeWelcomeJourneySettings(settings), settings);
});

test('accepts 100 catalog dishes and 30 selections, with optional Punjabi names', () => {
  const dishes = Array.from({ length: 100 }, (_, index) => ({ id: `dish-${index}`, nameEnglish: 'A'.repeat(120), namePunjabi: '' }));
  const settings = normalizeWelcomeJourneySettings({ dishes, selectedDishIds: dishes.slice(0, 30).map(({ id }) => id) });
  assert.equal(settings.dishes.length, 100);
  assert.equal(settings.selectedDishIds.length, 30);
  const empty = normalizeWelcomeJourneySettings();
  empty.dishes.push(dish());
  empty.selectedDishIds.push('dal');
  assert.deepEqual(normalizeWelcomeJourneySettings().dishes, []);
  assert.deepEqual(normalizeWelcomeJourneySettings().selectedDishIds, []);
});

test('rejects invalid catalogs and selections with explicit 400 errors rather than trimming or dropping data', () => {
  const cases = [
    null, [], 'invalid',
    { dishes: null }, { dishes: {} }, { dishes: 'dal' },
    { dishes: Array.from({ length: 101 }, (_, index) => dish(`dish-${index}`)) },
    { dishes: [null] }, { dishes: [[]] }, { dishes: [dish(), dish(' dal ')] },
    { dishes: [{ ...dish(), id: '' }] }, { dishes: [{ ...dish(), id: 1 }] },
    { dishes: [{ ...dish(), id: 'a'.repeat(81) }] },
    { dishes: [{ ...dish(), nameEnglish: ' ' }] }, { dishes: [{ ...dish(), nameEnglish: 42 }] },
    { dishes: [{ ...dish(), nameEnglish: 'a'.repeat(121) }] },
    { dishes: [{ ...dish(), namePunjabi: 'ਪ'.repeat(121) }] }, { dishes: [{ ...dish(), namePunjabi: null }] },
    { selectedDishIds: null }, { selectedDishIds: {} }, { selectedDishIds: 'dal' },
    { selectedDishIds: ['missing'] }, { dishes: [dish()], selectedDishIds: ['dal', ' dal '] },
    { dishes: [dish()], selectedDishIds: [null] }, { selectedDishIds: Array(31).fill('dal') },
    { langarServiceTimeEnglish: 'x'.repeat(121) }, { langarServiceTimePunjabi: null },
    { showLangarMenu: 'false' }, { showDirections: 0 }
  ];
  for (const input of cases) assert.throws(() => normalizeWelcomeJourneySettings(input), (error) => error.status === 400 && Boolean(error.message), JSON.stringify(input));
});

test('normalizes settings and rejects non-HTTPS map URLs by reverting to safe default', () => {
  const settings = normalizeWelcomeJourneySettings({ ...DEFAULT_WELCOME_JOURNEY_SETTINGS, titleEnglish: '<New welcome>', directionsUrl: 'javascript:alert(1)', theme: 'bad' });
  assert.equal(settings.titleEnglish, '<New welcome>');
  assert.equal(settings.directionsUrl, DEFAULT_WELCOME_JOURNEY_SETTINGS.directionsUrl);
  assert.equal(settings.theme, 'navy');
});

test('requires clear consent and valid visitor email before saving follow-up', () => {
  assert.throws(() => validateWelcomeFollowUp({ name: 'Sangat Visitor', email: 'person@example.com' }), /confirm/);
  assert.throws(() => validateWelcomeFollowUp({ name: 'Sangat Visitor', email: 'bad', consent: true }), /valid email/);
  assert.deepEqual(validateWelcomeFollowUp({ name: 'Sangat Visitor', email: 'PERSON@example.com', phone: '905-555-1212', consent: true }).email, 'person@example.com');
});

test('rejects spam honeypot input and applies an hourly rate limit', () => {
  assert.throws(() => validateWelcomeFollowUp({ name: 'Robot', email: 'robot@example.com', website: 'spam', consent: true }), /Unable to accept/);
  const now = 1000000000;
  for (let count = 0; count < 5; count += 1) assert.equal(allowWelcomeFollowUpSubmission('test-ip', now + count), true);
  assert.equal(allowWelcomeFollowUpSubmission('test-ip', now + 6), false);
  assert.equal(allowWelcomeFollowUpSubmission('test-ip', now + 3600001), true);
});
