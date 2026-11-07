import { buildQuickDonatePath, parseQuickDonateCustomAmount, QUICK_DONATE_AMOUNTS, selectQuickDonateCampaign } from './quickDonate';

const campaign = { id: 7, isActive: true, isClosed: false, paymentProvider: 'STRIPE' };

test('builds a local path with an optional safely encoded string campaign ID', () => {
  expect(buildQuickDonatePath()).toBe('/quick-donate');
  expect(buildQuickDonatePath(null)).toBe('/quick-donate');
  expect(buildQuickDonatePath(0)).toBe('/quick-donate?campaign=0');
  expect(buildQuickDonatePath('abc &?/#')).toBe('/quick-donate?campaign=abc+%26%3F%2F%23');
  expect(buildQuickDonatePath('')).toBe('/quick-donate?campaign=');
});

test('exposes only the supported preset amounts', () => {
  expect(QUICK_DONATE_AMOUNTS).toEqual([5, 10, 20, 50, 100]);
});

test.each([
  ['1', 100], ['12.3', 1230], ['12.34', 1234], ['10000.00', 1000000], [' 5 ', 500]
])('parses valid custom CAD amount %s into cents', (value, cents) => {
  expect(parseQuickDonateCustomAmount(value)).toBe(cents);
});

test.each(['', '0.99', '10000.01', '100000', '1.234', '1,25', '1e2', '-1', '$5'])('rejects invalid custom CAD amount %j', (value) => {
  expect(parseQuickDonateCustomAmount(value)).toBeNull();
});

test('selects a unique active campaign by default and requires an ID when ambiguous', () => {
  const other = { ...campaign, id: 3, name: 'Another cause' };
  expect(selectQuickDonateCampaign([campaign])).toBe(campaign);
  expect(selectQuickDonateCampaign([other, campaign])).toBeNull();
  expect(selectQuickDonateCampaign([other], '3')).toBe(other);
});

test('uses exact string IDs with no fallback when an explicit campaign is missing', () => {
  expect(selectQuickDonateCampaign([campaign], '7')).toBe(campaign);
  expect(selectQuickDonateCampaign([campaign], '07')).toBeNull();
  expect(selectQuickDonateCampaign([campaign], '')).toBeNull();
  expect(selectQuickDonateCampaign([campaign], 'missing')).toBeNull();
  const named = { ...campaign, id: 'named-campaign' };
  expect(selectQuickDonateCampaign([named], 'named-campaign')).toBe(named);
});

test.each(['PAYPAL', 'ZEFFY'])('does not select a %s campaign for Stripe wallet checkout', (paymentProvider) => {
  const nonStripeCampaign = { ...campaign, paymentProvider };
  expect(selectQuickDonateCampaign([nonStripeCampaign])).toBeNull();
  expect(selectQuickDonateCampaign([nonStripeCampaign], String(campaign.id))).toBeNull();
  expect(selectQuickDonateCampaign([campaign, nonStripeCampaign])).toBe(campaign);
  expect(selectQuickDonateCampaign([campaign, nonStripeCampaign], String(campaign.id))).toBe(campaign);
});

test.each([
  { isActive: false }, { isActive: undefined }, { isActive: 'false' },
  { isClosed: true }, { isClosed: undefined }, { isClosed: 'false' }
])('fails closed for unavailable or malformed campaign state: %j', (overrides) => {
  const unavailable = { ...campaign, ...overrides };
  expect(selectQuickDonateCampaign([unavailable])).toBeNull();
  expect(selectQuickDonateCampaign([unavailable], '7')).toBeNull();
});

test('fails closed for empty, malformed and ambiguous campaign lists', () => {
  for (const campaigns of [undefined, {}, [], [null], [campaign, { ...campaign }]]) {
    expect(selectQuickDonateCampaign(campaigns)).toBeNull();
    expect(selectQuickDonateCampaign(campaigns, '7')).toBeNull();
  }
});