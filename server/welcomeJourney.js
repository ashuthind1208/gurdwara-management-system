const DEFAULT_WELCOME_JOURNEY_SETTINGS = Object.freeze({
  enabled: true,
  titleEnglish: 'Welcome to Singh Sabha Milton',
  titlePunjabi: 'ਸਿੰਘ ਸਭਾ ਮਿਲਟਨ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ',
  introEnglish: 'We are glad you are here. Scan this code for today’s program, langar, directions, and a way to stay connected.',
  introPunjabi: 'ਸਾਨੂੰ ਖੁਸ਼ੀ ਹੈ ਕਿ ਤੁਸੀਂ ਆਏ ਹੋ। ਅੱਜ ਦਾ ਪ੍ਰੋਗਰਾਮ, ਲੰਗਰ, ਰਸਤਾ ਅਤੇ ਸਾਡੇ ਨਾਲ ਜੁੜਨ ਲਈ ਇਹ ਕੋਡ ਸਕੈਨ ਕਰੋ।',
  scanHeadingEnglish: 'Your visit starts here',
  theme: 'navy',
  locationName: 'Gurdwara Singh Sabha Milton',
  address: '7035 Sixth Line, Milton, ON',
  directionsUrl: 'https://maps.google.com/?q=7035+Sixth+Line+Milton+ON',
  directionsLabel: 'Get directions',
  programHeadingEnglish: 'Today’s program',
  programHeadingPunjabi: 'ਅੱਜ ਦਾ ਪ੍ਰੋਗਰਾਮ',
  programNoteEnglish: 'You are welcome to join any program.',
  langarHeadingEnglish: 'Langar today',
  langarHeadingPunjabi: 'ਅੱਜ ਦਾ ਲੰਗਰ',
  langarNoteEnglish: 'Langar is served to everyone. Please join us.',
  langarServiceTimeEnglish: '',
  langarServiceTimePunjabi: '',
  dishes: Object.freeze([]),
  selectedDishIds: Object.freeze([]),
  showProgram: true,
  showLangar: true,
  showLangarMenu: true,
  showDirections: true,
  showFollowUp: true,
  followUpHeadingEnglish: 'Would you like us to follow up?',
  followUpCopyEnglish: 'Leave your details only if you would like a member of our sangat team to contact you.',
  followUpConsentEnglish: 'I agree to be contacted by Singh Sabha Milton about my visit.',
  followUpSuccessEnglish: 'Thank you. A member of our team will be in touch.'
});
const followUpRateBuckets = new Map();
const WELCOME_FOLLOW_UP_RATE_WINDOW_MS = 60 * 60 * 1000;
const WELCOME_FOLLOW_UP_RATE_LIMIT = 5;

const allowWelcomeFollowUpSubmission = (key, now = Date.now()) => {
  const bucketKey = String(key || 'unknown');
  const previous = followUpRateBuckets.get(bucketKey) || [];
  const recent = previous.filter((timestamp) => now - timestamp < WELCOME_FOLLOW_UP_RATE_WINDOW_MS);
  if (recent.length >= WELCOME_FOLLOW_UP_RATE_LIMIT) {
    followUpRateBuckets.set(bucketKey, recent);
    return false;
  }
  recent.push(now);
  followUpRateBuckets.set(bucketKey, recent);
  if (followUpRateBuckets.size > 2000) {
    for (const [candidate, timestamps] of followUpRateBuckets) {
      if (!timestamps.some((timestamp) => now - timestamp < WELCOME_FOLLOW_UP_RATE_WINDOW_MS)) followUpRateBuckets.delete(candidate);
    }
  }
  return true;
};

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const invalidSettings = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const settingsText = (value, field, max, required = false) => {
  if (typeof value !== 'string') invalidSettings(`${field} must be a string.`);
  const text = value.trim();
  if (value.length > max) invalidSettings(`${field} must be at most ${max} characters.`);
  if (required && !text) invalidSettings(`${field} is required.`);
  return text;
};
const normalizeWelcomeJourneySettings = (value = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalidSettings('Welcome Journey settings must be an object.');
  const input = value;
  const result = { ...DEFAULT_WELCOME_JOURNEY_SETTINGS };
  for (const key of Object.keys(DEFAULT_WELCOME_JOURNEY_SETTINGS)) {
    if (Array.isArray(DEFAULT_WELCOME_JOURNEY_SETTINGS[key])) continue;
    if (typeof DEFAULT_WELCOME_JOURNEY_SETTINGS[key] === 'boolean') {
      if (input[key] !== undefined && typeof input[key] !== 'boolean') invalidSettings(`${key} must be a boolean.`);
      result[key] = input[key] ?? DEFAULT_WELCOME_JOURNEY_SETTINGS[key];
    }
    else result[key] = clean(input[key] ?? DEFAULT_WELCOME_JOURNEY_SETTINGS[key], key.toLowerCase().includes('url') ? 500 : 500);
  }
  for (const key of ['langarServiceTimeEnglish', 'langarServiceTimePunjabi']) {
    result[key] = settingsText(input[key] === undefined ? '' : input[key], key, 120);
  }
  const dishes = input.dishes === undefined ? [] : input.dishes;
  const selectedDishIds = input.selectedDishIds === undefined ? [] : input.selectedDishIds;
  if (!Array.isArray(dishes)) invalidSettings('dishes must be an array.');
  if (dishes.length > 100) invalidSettings('dishes must contain at most 100 dishes.');
  const ids = new Set();
  result.dishes = dishes.map((dish, index) => {
    if (!dish || typeof dish !== 'object' || Array.isArray(dish)) invalidSettings(`dishes[${index}] must be an object.`);
    const id = settingsText(dish.id, `dishes[${index}].id`, 80, true);
    if (ids.has(id)) invalidSettings(`Duplicate dish id: ${id}.`);
    ids.add(id);
    return {
      id,
      nameEnglish: settingsText(dish.nameEnglish, `dishes[${index}].nameEnglish`, 120, true),
      namePunjabi: settingsText(dish.namePunjabi === undefined ? '' : dish.namePunjabi, `dishes[${index}].namePunjabi`, 120)
    };
  });
  if (!Array.isArray(selectedDishIds)) invalidSettings('selectedDishIds must be an array.');
  if (selectedDishIds.length > 30) invalidSettings('selectedDishIds must contain at most 30 dishes.');
  const selected = new Set();
  result.selectedDishIds = selectedDishIds.map((value, index) => {
    const id = settingsText(value, `selectedDishIds[${index}]`, 80, true);
    if (selected.has(id)) invalidSettings(`Duplicate selected dish id: ${id}.`);
    if (!ids.has(id)) invalidSettings(`Selected dish id is not in the catalog: ${id}.`);
    selected.add(id);
    return id;
  });
  if (result.directionsUrl && !/^https:\/\//i.test(result.directionsUrl)) result.directionsUrl = DEFAULT_WELCOME_JOURNEY_SETTINGS.directionsUrl;
  if (!['navy', 'blue', 'warm'].includes(input.theme)) result.theme = 'navy';
  return result;
};

const validateWelcomeFollowUp = (payload = {}) => {
  const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (String(input.website || '').trim()) throw Object.assign(new Error('Unable to accept this request.'), { status: 400 });
  const name = clean(input.name, 120);
  const email = clean(input.email, 254).toLowerCase();
  const phone = clean(input.phone, 30);
  const message = clean(input.message, 1000);
  if (!name) throw Object.assign(new Error('Please enter your name.'), { status: 400 });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  if (phone && !/^\+?[0-9 ()-]{7,24}$/.test(phone)) throw Object.assign(new Error('Enter a valid phone number.'), { status: 400 });
  if (input.consent !== true) throw Object.assign(new Error('Please confirm that we may contact you.'), { status: 400 });
  return { name, email, phone, message, consent: true, source: 'sangat-welcome-journey', status: 'new', submittedAt: new Date().toISOString() };
};

module.exports = { DEFAULT_WELCOME_JOURNEY_SETTINGS, normalizeWelcomeJourneySettings, validateWelcomeFollowUp, allowWelcomeFollowUpSubmission };
