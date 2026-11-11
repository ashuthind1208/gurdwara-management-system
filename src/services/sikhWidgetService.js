import recitationService from './recitationService';
import hukamnamaService from './hukamnamaService';
import kidsQuizBankService from './kidsQuizBankService';

export const HUKAMNAMA_URL = 'https://api.banidb.com/v2/hukamnamas';
export const GURDWARA_OPTIONS = ['Sri Harmandir Sahib (BaniDB)', 'Singh Sabha Milton'];
export const BANI_IDS = Object.freeze({ 'Japji Sahib': 2, 'Rehras Sahib': 21, 'Kirtan Sohila': 23 });
export const QUIZ_TOPICS = Object.freeze({
  'guru-nanak': '001_guru_nanak.json', 'ten-gurus': '002_ten_gurus.json',
  'khalsa-panj-pyare': '003_khalsa_panj_pyare.json', 'five-ks': '004_five_ks_symbols.json',
  'gurdwara-gurbani': '005_gurdwara_gurbani.json', 'sikh-history': '006_sikh_history.json',
  'values-festivals': '007_sikh_values_festivals.json', 'mixed-review': '008_mixed_review.json'
});
export const SIKH_WIDGET_SOURCES = Object.freeze({
  'gurdwara-hukamnama': 'hukamnama',
  'gurbani-ang': 'scripture',
  'nitnem-reader': 'nitnem',
  'sikh-learning-resources': 'sikh-resources',
  'gurbani-search': 'scripture-search',
  'sikh-quiz-question': 'quiz',
  'live-recitation': 'live-recitation'
});

const RESOURCES = [
  { title: 'Sikh Research Institute', url: 'https://sikhri.org', description: 'Sikhi learning through courses, research, articles and podcasts.' },
  { title: 'The Sikh Coalition', url: 'https://www.sikhcoalition.org/about-sikhs/', description: 'An introduction to Sikh beliefs, identity and history from a civil rights organization.' },
  { title: 'SikhiToTheMax', url: 'https://www.sikhitothemax.org', description: 'Search and read Gurbani with translations and transliterations.' },
  { title: 'SGPC', url: 'https://sgpc.net', description: 'Official website of the Shiromani Gurdwara Parbandhak Committee, with Sikh and gurdwara information.' }
];

const text = (value) => typeof value === 'string' ? value.trim() : '';
const array = (value) => {
  if (!Array.isArray(value)) throw new Error('The source returned an invalid list.');
  return value;
};
export const sikhWidgetDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const validDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('The source date is missing or invalid.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error('The source date is invalid.');
  return value;
};

export const normalizeSikhWidgetConfig = (source, config = {}) => {
  const numericLimit = Number(config.limit);
  const limit = Number.isFinite(numericLimit) ? Math.min(12, Math.max(1, Math.trunc(numericLimit))) : 4;
  if (source === 'hukamnama') {
    const gurdwara = config.gurdwara ?? GURDWARA_OPTIONS[0];
    if (!GURDWARA_OPTIONS.includes(gurdwara)) throw new Error('Choose a supported hukamnama source.');
    return { gurdwara, limit };
  }
  if (source === 'scripture') {
    const ang = Number(config.ang ?? 1);
    if (!Number.isInteger(ang) || ang < 1 || ang > 1430) throw new Error('Choose an Ang between 1 and 1430.');
    return { ang, limit };
  }
  if (source === 'nitnem') {
    const bani = config.bani ?? 'Japji Sahib';
    if (!Object.prototype.hasOwnProperty.call(BANI_IDS, bani)) throw new Error('Choose a supported Nitnem bani.');
    return { bani, limit };
  }
  if (source === 'scripture-search') {
    const query = text(config.query);
    const mode = config.mode ?? 'Anywhere';
    if (query.length < 2 || query.length > 80) throw new Error('Enter a Gurbani phrase between 2 and 80 characters.');
    if (!['Gurmukhi', 'English', 'Anywhere'].includes(mode)) throw new Error('Choose a supported search language.');
    return { query, mode, limit };
  }
  if (source === 'quiz') {
    const topic = config.topic ?? 'sikh-history';
    const language = config.language ?? 'Both';
    if (!Object.prototype.hasOwnProperty.call(QUIZ_TOPICS, topic)) throw new Error('Choose a supported Sikh learning topic.');
    if (!['English', 'Punjabi', 'Both'].includes(language)) throw new Error('Choose a supported question language.');
    return { topic, language };
  }
  if (source === 'live-recitation') return {};
  if (source === 'sikh-resources') return { limit };
  throw new Error('Unsupported Sikh widget source.');
};

const line = (gurmukhi, english, transliteration, ang) => ({
  gurmukhi: text(gurmukhi), english: text(english), transliteration: text(transliteration),
  ang: Number.isInteger(Number(ang)) && Number(ang) > 0 ? Number(ang) : null
});
const excerpt = (lines, limit) => lines.filter((item) => item.gurmukhi).slice(0, limit);

const getContent = async (source, config = {}) => {
  const selection = normalizeSikhWidgetConfig(source, config);
  const checkedAt = new Date().toISOString();
  const today = sikhWidgetDateKey();
  if (source === 'sikh-resources') return {
    source, title: 'Sikh learning resources', provenance: 'Curated resources — not a live feed',
    checkedAt, sourceDate: null, lines: [], resources: RESOURCES.slice(0, selection.limit).map((item) => ({ ...item })), credits: []
  };
  if (source === 'scripture-search') {
    const results = array(await recitationService.search(selection.query, selection.mode.toLowerCase()));
    return {
      source, title: `Gurbani search · ${selection.query}`, provenance: 'Search results from Sri Guru Granth Sahib Ji · BaniDB',
      checkedAt, sourceDate: null, resources: [],
      lines: excerpt(results.map((item) => line(item?.gurmukhi, item?.english, '', item?.ang)), selection.limit),
      credits: [{ label: 'BaniDB search via the site recitation API', url: 'https://www.banidb.com' }]
    };
  }
  if (source === 'quiz') {
    const response = await kidsQuizBankService.getQuizFileQuestions(QUIZ_TOPICS[selection.topic]);
    const questions = array(response?.data);
    const dayIndex = Math.floor(Date.now() / 86400000);
    const question = questions.length ? questions[dayIndex % questions.length] : null;
    return {
      source, title: 'Sikh learning question', provenance: `Sikh Sabha education quiz · ${selection.topic.replace(/-/g, ' ')}`,
      checkedAt, sourceDate: today, resources: [],
      quizQuestion: question ? {
        prompt: selection.language === 'Punjabi' ? text(question.question?.pa) : text(question.question?.en),
        promptPunjabi: selection.language === 'Both' ? text(question.question?.pa) : '',
        options: (question.options || []).map((option) => selection.language === 'Punjabi' ? text(option.pa) : text(option.en)).filter(Boolean)
      } : null,
      lines: [], credits: [{ label: 'Open Sikh learning', url: '/kids-learning' }]
    };
  }
  if (source === 'live-recitation') {
    const state = await recitationService.getState();
    return {
      source, title: 'Live sangat recitation', provenance: 'Current session status from this Gurdwara',
      checkedAt, sourceDate: null, resources: [], lines: [],
      session: state?.session ? {
        title: text(state.session.titleEnglish || state.session.title), reciter: text(state.session.reciter),
        status: text(state.session.status), currentIndex: Number(state.session.currentIndex) || 0,
        totalLines: Number(state.session.totalLines) || 0, startedAt: text(state.session.startedAt)
      } : null,
      credits: [{ label: 'Browse Gurbani', url: '/gurbani-library' }]
    };
  }
  if (source === 'hukamnama' && selection.gurdwara === GURDWARA_OPTIONS[1]) {
    const response = await hukamnamaService.getDailyHukamnama(today);
    const data = response?.data;
    if (!data || data.date !== today) throw new Error('The local daily source did not return the requested date.');
    const entry = data.entry;
    if (entry?.isFallback || (entry && entry.date !== today)) throw new Error('No verified local hukamnama is available for today.');
    const selected = entry?.selectedShabadId && Array.isArray(entry.selectedShabadLines) && entry.selectedShabadLines.length
      ? entry.selectedShabadLines : entry?.selectedShabadId
        ? array(entry.lines).filter((item) => String(item?.shabadId) === String(entry.selectedShabadId)) : entry?.lines;
    return {
      source, title: 'Singh Sabha Milton hukamnama', provenance: 'Singh Sabha Milton · locally scheduled daily hukamnama',
      sourceDate: today, checkedAt, resources: [],
      lines: entry ? excerpt(array(selected).map((item) => line(item?.gurmukhi, item?.translationEnglish, item?.transliteration, entry.ang)), selection.limit) : [],
      credits: [{ label: 'Singh Sabha Milton hukamnama', url: '/hukamnama' }]
    };
  }
  if (source === 'hukamnama') {
    const response = await fetch(HUKAMNAMA_URL, { signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('BaniDB hukamnama is unavailable.');
    const data = await response.json();
    const date = data?.date?.gregorian;
    if (![date?.year, date?.month, date?.date].every(Number.isInteger)) throw new Error('The source date is missing or invalid.');
    const sourceDate = validDate(`${date.year}-${String(date.month).padStart(2, '0')}-${String(date.date).padStart(2, '0')}`);
    const lines = array(data.shabads).flatMap((shabad) => array(shabad?.verses).map((verse) => line(
      verse?.verse?.unicode, verse?.translation?.en?.ssk, verse?.transliteration?.english, shabad?.shabadInfo?.pageNo
    )));
    return {
      source, title: 'Sri Harmandir Sahib hukamnama', provenance: 'Sri Harmandir Sahib (Darbar Sahib) · BaniDB · English: Sant Singh Khalsa',
      sourceDate, checkedAt, resources: [], lines: excerpt(lines, selection.limit),
      credits: [{ label: 'BaniDB hukamnama source', url: HUKAMNAMA_URL }]
    };
  }
  const isAng = source === 'scripture';
  const id = isAng ? selection.ang : BANI_IDS[selection.bani];
  // The default "text" view is Gurmukhi-only; "full" returns {g, e, r, p, a} lines.
  const data = await recitationService.getText(isAng ? 'ang' : 'bani', id, 'full');
  return {
    source, title: isAng ? `Sri Guru Granth Sahib Ji · Ang ${id}` : selection.bani,
    provenance: 'BaniDB via the local recitation service · English translation where available',
    sourceDate: null, checkedAt, resources: [],
    lines: excerpt(array(data?.lines).map((item) => line(item?.g, item?.e, item?.r, item?.a)), selection.limit),
    credits: [{ label: 'BaniDB text source', url: isAng ? `https://api.banidb.com/v2/angs/${id}/G` : `https://api.banidb.com/v2/banis/${id}` }]
  };
};

export const sikhWidgetService = { getContent };
export default sikhWidgetService;