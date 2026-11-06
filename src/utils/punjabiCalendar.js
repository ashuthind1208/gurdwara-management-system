import { NANAKSHAHI_ANNUAL_MONTH_STARTS } from '../constants/nanakshahiMonthStarts';

const NANAKSHAHI_MONTH_STARTS = [
  { name: 'Chet', namePa: 'ਚੇਤ', month: 3, day: 14 },
  { name: 'Vaisakh', namePa: 'ਵੈਸਾਖ', month: 4, day: 14 },
  { name: 'Jeth', namePa: 'ਜੇਠ', month: 5, day: 15 },
  { name: 'Harh', namePa: 'ਹਾੜ', month: 6, day: 15 },
  { name: 'Sawan', namePa: 'ਸਾਵਣ', month: 7, day: 16 },
  { name: 'Bhadon', namePa: 'ਭਾਦੋਂ', month: 8, day: 16 },
  { name: 'Assu', namePa: 'ਅੱਸੂ', month: 9, day: 15 },
  { name: 'Katak', namePa: 'ਕੱਤਕ', month: 10, day: 15 },
  { name: 'Maghar', namePa: 'ਮੱਘਰ', month: 11, day: 14 },
  { name: 'Poh', namePa: 'ਪੋਹ', month: 12, day: 14 },
  { name: 'Magh', namePa: 'ਮਾਘ', month: 1, day: 13 },
  { name: 'Phagun', namePa: 'ਫੱਗਣ', month: 2, day: 12 }
];

const FIXED_OBSERVANCES = [
  { date: '2026-07-05', title: 'Foundation Stone of Sachkhand Sri Harimandir Sahib, Sri Amritsar (Golden Temple)', type: 'Celebration' },
  { date: '2026-07-09', title: 'Bhai Mani Singh Ji', type: 'Shaheedi' },
  { date: '2026-07-14', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-07-16', title: 'Bhai Taru Singh Ji', type: 'Shaheedi' },
  { date: '2026-07-24', title: 'Miri Piri Divas', type: 'Celebration' },
  { date: '2026-07-29', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2026-07-31', title: 'Sardar Udham Singh', type: 'Shaheedi' },
  { date: '2026-08-07', title: 'Guru HarKrishan Sahib Ji', type: 'Prakash' },
  { date: '2026-08-08', title: 'Morcha Guru ka Baag', type: 'Historical' },
  { date: '2026-08-12', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-08-28', title: 'Pyare Bhai Daya Singh Ji', type: 'Birth' },
  { date: '2026-08-28', title: 'Jorh Mela - Baba Bakala', type: 'Historical' },
  { date: '2026-08-28', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2026-08-30', title: 'Sampuranta Divas Sri Guru Granth Sahib Ji', type: 'Historical' },
  { date: '2026-09-09', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-09-12', title: '1st Prakash Sri Guru Granth Sahib Ji', type: 'Prakash' },
  { date: '2026-09-13', title: 'Guru Arjan Dev Ji', type: 'Gurgaddi' },
  { date: '2026-09-14', title: 'Guru Ram Das Ji', type: 'Joti Jot' },
  { date: '2026-09-18', title: 'Jorh Mela Gurdwara Kandh Sahib / Marriage of Guru Nanak Dev', type: 'Celebration' },
  { date: '2026-09-24', title: 'Guru Ram Das Ji', type: 'Gurgaddi' },
  { date: '2026-09-26', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2026-09-26', title: 'Guru Amar Das Ji', type: 'Joti Jot' },
  { date: '2026-10-01', title: 'Guru Angad Dev Ji', type: 'Gurgaddi' },
  { date: '2026-10-05', title: 'Guru Nanak Dev Ji', type: 'Joti Jot' },
  { date: '2026-10-06', title: 'Jorh Mela (Retirement) - Baba Budha Ji (Thatha)', type: 'Historical' },
  { date: '2026-10-07', title: 'Jorh Mela (Retirement) - Baba Budha Ji (Thatha)', type: 'Historical' },
  { date: '2026-10-10', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-10-10', title: 'Bhai Taru Singh Ji', type: 'Birth' },
  { date: '2026-10-20', title: 'Darbar Khalsa (Dussehra)', type: 'Celebration' },
  { date: '2026-10-23', title: 'Baba Budha Ji', type: 'Birth' },
  { date: '2026-10-23', title: 'Pyare Bhai Dharam Singh Ji', type: 'Birth' },
  { date: '2026-10-23', title: 'Passing of Jassa Singh Ahluwalia', type: 'Historical' },
  { date: '2026-10-26', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-10-27', title: 'Guru Ram Das Ji', type: 'Prakash' },
  { date: '2026-11-03', title: 'Guru HarKrishan Sahib Ji', type: 'Gurgaddi' },
  { date: '2026-11-03', title: 'Guru Har Rai Ji', type: 'Joti Jot' },
  { date: '2026-11-03', title: 'Mata Sahib Dev (Mother of Khalsa)', type: 'Birth' },
  { date: '2026-11-08', title: 'Bandi Chhor (Divali)', type: 'Holiday' },
  { date: '2026-11-09', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-11-11', title: 'Sri Guru Granth Sahib Ji (Nanded)', type: 'Gurgaddi' },
  { date: '2026-11-14', title: 'Sri Guru Gobind Singh Ji', type: 'Joti Jot' },
  { date: '2026-11-15', title: 'Baba Deep Singh Ji', type: 'Shaheedi' },
  { date: '2026-11-24', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2026-11-24', title: 'Guru Nanak Dev Ji', type: 'Prakash' },
  { date: '2026-11-28', title: 'Merging of Bhai Mardana Ji', type: 'Merging' },
  { date: '2026-11-30', title: 'Sahibzada Baba Joravar Singh Ji', type: 'Birth' },
  { date: '2026-12-08', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2026-12-12', title: 'Guru Gobind Singh Ji', type: 'Gurgaddi' },
  { date: '2026-12-13', title: 'Bhai Dyala, Mati Das & Sati Das Ji', type: 'Shaheedi' },
  { date: '2026-12-14', title: 'Guru Tegh Bahadur Sahib Ji', type: 'Shaheedi' },
  { date: '2026-12-14', title: 'Sahibzada Baba Fateh Singh Ji', type: 'Birth' },
  { date: '2026-12-14', title: 'Panj Piare - Guru Khalsa at Chamkaur Sahib', type: 'Gurgaddi' },
  { date: '2026-12-23', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2026-12-21', title: 'Leaving of Anandpur Sahib Fort', type: 'History' },
  { date: '2026-12-22', title: "Splitting of Guru's Family at Sirsa", type: 'Merging' },
  { date: '2026-12-22', title: 'Bhai Jivan Singh (Bhai Jaita Ji)', type: 'Shaheedi' },
  { date: '2026-12-23', title: 'Sahibzada Baba Ajit Singh Ji', type: 'Shaheedi' },
  { date: '2026-12-23', title: 'Sahibzada Baba Jujhar Singh Ji', type: 'Shaheedi' },
  { date: '2026-12-23', title: 'Saka Chamkaur Sahib Ji', type: 'Historical' },
  { date: '2026-12-24', title: 'Bhai Sangat Singh Ji', type: 'Shaheedi' },
  { date: '2026-12-28', title: 'Sahibzada Baba Jorawar Singh Ji', type: 'Shaheedi' },
  { date: '2026-12-28', title: 'Sahibzada Baba Fateh Singh Ji', type: 'Shaheedi' },
  { date: '2026-12-28', title: 'Mata Gujri Ji', type: 'Shaheedi' },
  { date: '2027-01-07', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2027-01-14', title: 'Foundation Stone of Sachkhand Sri Harimandir Sahib, Sri Amritsar (Golden Temple)', type: 'Celebration' },
  { date: '2027-01-14', title: 'Sri Muktsar Sahib (Maaghi)', type: 'Jor Mela' },
  { date: '2027-01-15', title: 'Sri Guru Gobind Singh Ji', type: 'Prakash' },
  { date: '2027-01-18', title: 'Pyare Bhai Himmat Singh Ji', type: 'Birth' },
  { date: '2027-01-20', title: 'Chabiyan Da Morcha, Sri Amritsar (Golden Temple)', type: 'Historical' },
  { date: '2027-01-22', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2027-01-27', title: 'Baba Deep Singh Ji', type: 'Birthday' },
  { date: '2027-02-06', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2027-02-09', title: 'Wadda Ghallughara (Kup Rohira - Sangrur)', type: 'Historical' },
  { date: '2027-02-11', title: 'Marriage of Guru Gobind Singh Ji & Mata Jito Ji (Guru Ka Lahore)', type: 'Celebration' },
  { date: '2027-02-11', title: 'Basant Panchmi', type: 'Historical' },
  { date: '2027-02-12', title: 'Sahibzada Baba Ajit Singh Ji', type: 'Birth' },
  { date: '2027-02-20', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2027-02-20', title: 'Bhagat Ravidas Ji', type: 'Birth' },
  { date: '2027-02-21', title: 'Jaito da Mela (Faridkot)', type: 'Historical' },
  { date: '2027-02-21', title: 'Saka Nankana Sahib', type: 'Historical' },
  { date: '2027-03-14', title: 'New Year (Bikrami Year 2082-83) / Nanakshahi Samvat 558 starts', type: 'Festival' },
  { date: '2027-03-14', title: 'Jathedar Akali Phula Singh Ji', type: 'Shaheedi' },
  { date: '2027-03-15', title: 'Sardar Baghel Singh conquering of Delhi', type: 'Historical' },
  { date: '2027-03-17', title: 'Sri Guru HarRai Sahib Ji', type: 'Gurgaddi' },
  { date: '2027-03-18', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2027-03-19', title: 'Guru Amar Das Sahib Ji', type: 'Gurgaddi' },
  { date: '2027-03-22', title: 'Guru Angad Dev Ji', type: 'Joti Jot' },
  { date: '2027-03-23', title: 'Guru Hargobind Sahib Ji', type: 'Joti Jot' },
  { date: '2027-03-23', title: 'Shaheedi Bhagat Singh', type: 'Shaheedi' },
  { date: '2027-03-25', title: 'Bhai Subheg Singh & Bhai Shabaz Singh', type: 'Shaheedi' },
  { date: '2027-04-01', title: 'Guru Tegh Bahadur Sahib Ji', type: 'Gurgaddi' },
  { date: '2027-04-01', title: 'Guru HarKrishan Sahib Ji', type: 'Joti Jot' },
  { date: '2027-04-02', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2027-04-07', title: 'Guru Tegh Bahadur Sahib Ji', type: 'Prakash' },
  { date: '2027-04-09', title: 'Guru Arjan Dev Ji', type: 'Prakash' },
  { date: '2027-04-09', title: 'Sahibzada Baba Jujhar Singh Ji', type: 'Birth' },
  { date: '2027-04-13', title: 'Sikh Dastaar Divas (Sikh Turban Day)', type: 'Celebration' },
  { date: '2027-04-14', title: 'Khalsa Saajna Divas (Creation of Khalsa)', type: 'Celebration' },
  { date: '2027-04-17', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2027-04-18', title: 'Guru Angad Dev Ji', type: 'Prakash' },
  { date: '2027-04-21', title: 'Bhagat Dhanna Ji', type: 'Birth' },
  { date: '2027-04-30', title: 'Guru Amar Das Sahib Ji', type: 'Prakash' },
  { date: '2027-05-01', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2027-05-04', title: 'Sri Muktsar Sahib ~ Jorh Mela', type: 'Shaheedi' },
  { date: '2027-05-05', title: 'Jassa Singh Ramgarhia', type: 'Birthday' },
  { date: '2027-05-12', title: 'Victory at Sirhind (Banda Bahadur & Baba Deep Singh)', type: 'Historical' },
  { date: '2027-05-16', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2027-05-17', title: 'Chhota GhaluGhara (Gurdaspur)', type: 'Historical' },
  { date: '2027-05-19', title: 'Jassa Singh Ahluwalia', type: 'Birthday' },
  { date: '2027-06-15', title: 'Masya (new moon)', type: 'Masya' },
  { date: '2027-06-18', title: 'Guru Arjan Dev Ji', type: 'Shaheedi' },
  { date: '2027-06-18', title: 'Pyare Bhai Sahib Singh Ji', type: 'Birth' },
  { date: '2027-06-25', title: 'Banda Singh Bahadur', type: 'Shaheedi' },
  { date: '2027-06-29', title: 'Puranmaasi (full moon)', type: 'Puranmashi' },
  { date: '2027-06-29', title: 'Bhagat Kabir Ji', type: 'Birthday' },
  { date: '2027-06-30', title: 'Guru Hargobind Sahib Ji', type: 'Prakash' }
];

export const getFallbackNanakshahiObservances = () => FIXED_OBSERVANCES.map((item, index) => ({
  ...item,
  id: `local-nanakshahi-${item.date}-${index}`,
  gregorianDate: item.date
}));

export const mergeNanakshahiObservances = (remote = [], fallback = getFallbackNanakshahiObservances()) => {
  const primary = Array.isArray(remote) ? remote : [];
  const known = new Set(primary.map((item) => `${String(item.date || item.gregorianDate || '').slice(0, 10)}::${String(item.title || '').trim().toLowerCase()}`));
  return [...primary, ...(Array.isArray(fallback) ? fallback : []).filter((item) => !known.has(`${String(item.date || item.gregorianDate || '').slice(0, 10)}::${String(item.title || '').trim().toLowerCase()}`))];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const GURMUKHI_DIGITS = ['੦', '੧', '੨', '੩', '੪', '੫', '੬', '੭', '੮', '੯'];
const WEEK_DAYS = 7;
const NANAKSHAHI_MONTH_INDEX_BY_NAME = {
  Chet: 1,
  Vaisakh: 2,
  Jeth: 3,
  Harh: 4,
  Sawan: 5,
  Bhadon: 6,
  Assu: 7,
  Katak: 8,
  Maghar: 9,
  Poh: 10,
  Magh: 11,
  Phagun: 12
};

const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseAsLocalDate = (value) => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'string') {
    const match = value.match(ISO_DATE_ONLY_PATTERN);
    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);
      return new Date(year, monthIndex, day);
    }
  }

  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const toDateOnly = (value) => {
  return parseAsLocalDate(value);
};

const toDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (date) => new Intl.DateTimeFormat('en-CA', {
  weekday: 'short',
  month: 'short',
  day: 'numeric'
}).format(date);

const formatDateLabelPa = (date) => {
  const day = date.getDate();
  const month = date.toLocaleString('en-CA', { month: 'short' });
  return `${toGurmukhiNumber(day)} ${month}`;
};

const buildApiNanakshahiLabel = (nanakshahiDate) => {
  if (!nanakshahiDate) {
    return { en: '', pa: '' };
  }

  const day = Number(nanakshahiDate.day || 0);
  const monthNameEn = String(nanakshahiDate.monthNameEn || '').trim();
  const monthNamePa = String(nanakshahiDate.monthNamePa || '').trim();
  const year = Number(nanakshahiDate.year || 0);

  if (!day || !monthNameEn || !year) {
    return { en: '', pa: '' };
  }

  const labelEn = `${day} ${monthNameEn} ${year} Nanakshahi`;
  const labelPa = `${toGurmukhiNumber(day)} ${monthNamePa} ${toGurmukhiNumber(year)} ਨਾਨਕਸ਼ਾਹੀ`.trim();

  return { en: labelEn, pa: labelPa };
};
const buildCalendarLabelMetadata = (event, dateObj) => {
  const fixedNanakshahi = getNanakshahiDate(dateObj);
  const apiLabels = buildApiNanakshahiLabel(event.nanakshahiDate || null);

  const hasAlternate = Boolean(
    apiLabels.en
    && apiLabels.en.toLowerCase() !== fixedNanakshahi.label.toLowerCase()
  );

  const primaryLabelEn = fixedNanakshahi.label;
  const primaryLabelPa = fixedNanakshahi.labelPa;
  const alternateLabelEn = hasAlternate ? apiLabels.en : '';
  const alternateLabelPa = hasAlternate ? (apiLabels.pa || apiLabels.en) : '';

  const noteEn = hasAlternate
    ? `Primary display: ${primaryLabelEn}. Alternate reference: ${alternateLabelEn}.`
    : 'Nanakshahi date uses published annual Sangrand dates where available.';
  const notePa = hasAlternate
    ? `ਮੁੱਖ ਮਿਤੀ: ${primaryLabelPa}। ਵਿਕਲਪਿਕ ਹਵਾਲਾ: ${alternateLabelPa}।`
    : 'ਨਾਨਕਸ਼ਾਹੀ ਮਿਤੀ ਉਪਲਬਧ ਪ੍ਰਕਾਸ਼ਿਤ ਸਾਲਾਨਾ ਸੰਗਰਾਂਦ ਮਿਤੀਆਂ ਅਨੁਸਾਰ ਹੈ।';

  return {
    primaryLabelEn,
    primaryLabelPa,
    alternateLabelEn,
    alternateLabelPa,
    hasAlternate,
    noteEn,
    notePa,
    fixedNanakshahiDate: fixedNanakshahi,
    apiNanakshahiDate: event.nanakshahiDate || null
  };
};

const hasGurmukhiScript = (value = '') => /[\u0A00-\u0A7F]/.test(String(value));

const transliterateTitleToGurmukhi = (value = '') => {
  const text = String(value || '').trim();
  if (!text || hasGurmukhiScript(text)) {
    return text;
  }

  const replacements = [
    ['Sahibzada Baba Joravar Singh Ji', 'ਸਾਹਿਬਜ਼ਾਦਾ ਬਾਬਾ ਜ਼ੋਰਾਵਰ ਸਿੰਘ ਜੀ'],
    ['Sahibzada Baba Fateh Singh Ji', 'ਸਾਹਿਬਜ਼ਾਦਾ ਬਾਬਾ ਫਤਹ ਸਿੰਘ ਜੀ'],
    ['Sahibzada Baba Ajit Singh Ji', 'ਸਾਹਿਬਜ਼ਾਦਾ ਬਾਬਾ ਅਜੀਤ ਸਿੰਘ ਜੀ'],
    ['Sahibzada Baba Jujhar Singh Ji', 'ਸਾਹਿਬਜ਼ਾਦਾ ਬਾਬਾ ਜੁਝਾਰ ਸਿੰਘ ਜੀ'],
    ['Bhai Jivan Singh (Bhai Jaita Ji)', 'ਭਾਈ ਜੀਵਨ ਸਿੰਘ (ਭਾਈ ਜੈਤਾ ਜੀ)'],
    ['Bhai Mani Singh Ji', 'ਭਾਈ ਮਨੀ ਸਿੰਘ ਜੀ'],
    ['Bhai Taru Singh Ji', 'ਭਾਈ ਤਾਰੂ ਸਿੰਘ ਜੀ'],
    ['Bhai Deep Singh Ji', 'ਭਾਈ ਦੀਪ ਸਿੰਘ ਜੀ'],
    ['Baba Deep Singh Ji', 'ਬਾਬਾ ਦੀਪ ਸਿੰਘ ਜੀ'],
    ['Guru Nanak Dev Ji', 'ਗੁਰੂ ਨਾਨਕ ਦੇਵ ਜੀ'],
    ['Guru Gobind Singh Ji', 'ਗੁਰੂ ਗੋਬਿੰਦ ਸਿੰਘ ਜੀ'],
    ['Guru HarKrishan Sahib Ji', 'ਗੁਰੂ ਹਰਿਕ੍ਰਿਸ਼ਨ ਸਾਹਿਬ ਜੀ'],
    ['Guru Har Rai Ji', 'ਗੁਰੂ ਹਰਿਰਾਇ ਜੀ'],
    ['Guru Har Rai Sahib Ji', 'ਗੁਰੂ ਹਰਿਰਾਇ ਸਾਹਿਬ ਜੀ'],
    ['Guru Hargobind Sahib Ji', 'ਗੁਰੂ ਹਰਿਗੋਬਿੰਦ ਸਾਹਿਬ ਜੀ'],
    ['Guru Tegh Bahadur Sahib Ji', 'ਗੁਰੂ ਤੇਗ਼ ਬਹਾਦਰ ਸਾਹਿਬ ਜੀ'],
    ['Guru Angad Dev Ji', 'ਗੁਰੂ ਅੰਗਦ ਦੇਵ ਜੀ'],
    ['Guru Amar Das Sahib Ji', 'ਗੁਰੂ ਅਮਰ ਦਾਸ ਸਾਹਿਬ ਜੀ'],
    ['Guru Arjan Dev Ji', 'ਗੁਰੂ ਅਰਜਨ ਦੇਵ ਜੀ'],
    ['Guru Ram Das Ji', 'ਗੁਰੂ ਰਾਮ ਦਾਸ ਜੀ'],
    ['Sri Guru Granth Sahib Ji', 'ਸ੍ਰੀ ਗੁਰੂ ਗ੍ਰੰਥ ਸਾਹਿਬ ਜੀ'],
    ['Mata Sahib Dev', 'ਮਾਤਾ ਸਾਹਿਬ ਦੇਵ'],
    ['Mata Sahib Kaur Ji', 'ਮਾਤਾ ਸਾਹਿਬ ਕੌਰ ਜੀ'],
    ['Mata Gujri Ji', 'ਮਾਤਾ ਗੁਜਰੀ ਜੀ'],
    ['Pyare Bhai Himmat Singh Ji', 'ਪਿਆਰੇ ਭਾਈ ਹਿੰਮਤ ਸਿੰਘ ਜੀ'],
    ['Pyare Bhai Daya Singh Ji', 'ਪਿਆਰੇ ਭਾਈ ਦਇਆ ਸਿੰਘ ਜੀ'],
    ['Pyare Bhai Sahib Singh Ji', 'ਪਿਆਰੇ ਭਾਈ ਸਾਹਿਬ ਸਿੰਘ ਜੀ'],
    ['Pyare Bhai Dharam Singh Ji', 'ਪਿਆਰੇ ਭਾਈ ਧਰਮ ਸਿੰਘ ਜੀ'],
    ['Pyare Bhai Mohkam Singh Ji', 'ਪਿਆਰੇ ਭਾਈ ਮੋਹਕਮ ਸਿੰਘ ਜੀ'],
    ['Bhagat Ravidas Ji', 'ਭਗਤ ਰਵਿਦਾਸ ਜੀ'],
    ['Bhagat Kabir Ji', 'ਭਗਤ ਕਬੀਰ ਜੀ'],
    ['Bhagat Dhanna Ji', 'ਭਗਤ ਧੰਨਾ ਜੀ'],
    ['Jorh Mela', 'ਜੋੜ ਮੇਲਾ'],
    ['Masya (new moon)', 'ਮੱਸਿਆ (ਨਵਾਂ ਚੰਨ)'],
    ['Masya (Maseya)', 'ਮੱਸਿਆ'],
    ['Puranmaasi (full moon)', 'ਪੂਰਨਮਾਸ਼ੀ'],
    ['Puranmashi (Full Moon)', 'ਪੂਰਨਮਾਸ਼ੀ'],
    ['New Year (Bikrami Year 2082-83) / Nanakshahi Samvat 558 starts', 'ਨਵਾਂ ਸਾਲ (ਬਿਕਰਮੀ ਸਾਲ ੨੦੮੨-੮੩) / ਨਾਨਕਸ਼ਾਹੀ ਸੰਮਤ ੫੫੮ ਸ਼ੁਰੂ'],
    ['Bandi Chhor (Divali)', 'ਬੰਦੀ ਛੋੜ (ਦੀਵਾਲੀ)'],
    ['Khalsa Saajna Divas (Creation of Khalsa)', 'ਖ਼ਾਲਸਾ ਸਾਜਣਾ ਦਿਵਸ (ਖ਼ਾਲਸਾ ਦੀ ਸਿਰਜਣਾ)'],
    ['Sikh Dastaar Divas (Sikh Turban Day)', 'ਸਿੱਖ ਦਸਤਾਰ ਦਿਵਸ (ਸਿੱਖ ਪੱਗੜੀ ਦਿਵਸ)'],
    ['Celebration', 'ਸਮਾਗਮ'],
    ['Historical', 'ਇਤਿਹਾਸਕ'],
    ['Festival', 'ਤਿਉਹਾਰ'],
    ['Shaheedi', 'ਸ਼ਹੀਦੀ'],
    ['Prakash', 'ਪ੍ਰਕਾਸ਼'],
    ['Birthday', 'ਜਨਮ'],
    ['Birth', 'ਜਨਮ'],
    ['Gurgaddi', 'ਗੁਰਗੱਦੀ'],
    ['Joti Jot', 'ਜੋਤੀ ਜੋਤਿ'],
    ['Merging', 'ਅਕਾਲ ਚਲਾਣਾ'],
    ['Holiday', 'ਛੁੱਟੀ'],
    ['History', 'ਇਤਿਹਾਸਕ']
  ];

  let output = text;
  for (const [source, target] of replacements) {
    output = output.replaceAll(source, target);
  }

  return output;
};

const buildObservanceContext = (entry) => {
  const token = String(entry.type || '').toLowerCase();

  if (token.includes('masya') || token.includes('massia')) {
    return {
      blurb: 'A reflective moon phase day for ardas, simran, humility, and renewed spiritual focus.',
      blurbPa: 'ਮੱਸਿਆ ਮਨਨ, ਅਰਦਾਸ, ਸਿਮਰਨ ਅਤੇ ਨਿਮਰਤਾ ਨਾਲ ਰੂਹਾਨੀ ਕੇਂਦ੍ਰਿਤਤਾ ਨਵੀਂ ਕਰਨ ਦਾ ਦਿਨ ਹੈ।'
    };
  }

  if (token.includes('puranmashi')) {
    return {
      blurb: 'A full moon day for reflection, gratitude, and calm remembrance in sangat and seva.',
      blurbPa: 'ਪੂਰਨਮਾਸ਼ੀ ਮਨਨ, ਸ਼ੁਕਰਾਨੇ ਅਤੇ ਸੰਗਤ ਤੇ ਸੇਵਾ ਵਿਚ ਸ਼ਾਂਤ ਯਾਦ ਦਾ ਦਿਨ ਹੈ।'
    };
  }

  if (token.includes('sangrand')) {
    return {
      blurb: 'Sangrand begins a new month, encouraging discipline, seva, gratitude, and spiritual reset.',
      blurbPa: 'ਸੰਗਰਾਂਦ ਨਵਾਂ ਮਹੀਨਾ ਸ਼ੁਰੂ ਕਰਦੀ ਹੈ, ਅਨੁਸ਼ਾਸਨ, ਸੇਵਾ, ਸ਼ੁਕਰਾਨਾ ਅਤੇ ਰੂਹਾਨੀ ਨਵੀਂ ਸ਼ੁਰੂਆਤ ਲਈ।'
    };
  }

  if (token.includes('shaheedi')) {
    return {
      blurb: 'A remembrance day honoring sacrifice, courage, faith, and steadfast commitment to Gurmat values.',
      blurbPa: 'ਸ਼ਹੀਦੀ ਦਿਨ ਕੁਰਬਾਨੀ, ਹਿੰਮਤ, ਵਿਸ਼ਵਾਸ ਅਤੇ ਗੁਰਮਤ ਮੁੱਲਾਂ ਨਾਲ ਅਡੋਲ ਨਿਭਾਅ ਦੀ ਯਾਦ ਹੈ।'
    };
  }

  if (token.includes('gurpurab') || token.includes('gurgaddi') || token.includes('joti jot') || token.includes('prakash') || token.includes('birth') || token.includes('birthday') || token.includes('holiday')) {
    return {
      blurb: 'A sacred Gurpurab observance inspiring sangat unity, kirtan devotion, seva, and gratitude today.',
      blurbPa: 'ਇਹ ਪਵਿੱਤਰ ਗੁਰਪੁਰਬ ਸੰਗਤ ਇਕਤਾ, ਕੀਰਤਨ ਭਗਤੀ, ਸੇਵਾ ਅਤੇ ਸ਼ੁਕਰਾਨੇ ਦੀ ਪ੍ਰੇਰਨਾ ਦਿੰਦਾ ਹੈ।'
    };
  }

  return {
    blurb: 'A meaningful Sikh calendar observance for remembrance, reflection, and values-led daily living.',
    blurbPa: 'ਇਹ ਸਿੱਖ ਕੈਲੰਡਰ ਅਨੁਸਾਰ ਅਰਥਪੂਰਨ ਦਿਹਾੜਾ ਹੈ, ਜੋ ਯਾਦ ਅਤੇ ਮਨਨ ਦੀ ਪ੍ਰੇਰਨਾ ਦਿੰਦਾ ਹੈ।'
  };
};

const normalizeObservanceEntry = (entry) => {
  const context = buildObservanceContext(entry);
  const title = String(entry.title || '').trim();
  const titlePa = String(entry.titlePa || '').trim();

  return {
    ...entry,
    title,
    titlePa: titlePa || transliterateTitleToGurmukhi(title),
    type: String(entry.type || entry.eventType || 'observance').trim(),
    occasion: String(entry.occasion || entry.eventEn || entry.type || 'Observance').trim(),
    blurb: String(entry.blurb || entry.significanceEn || context.blurb).trim(),
    blurbPa: String(entry.blurbPa || entry.significancePa || context.blurbPa).trim(),
    personEn: String(entry.personEn || '').trim(),
    personPa: String(entry.personPa || '').trim(),
    eventEn: String(entry.eventEn || '').trim(),
    eventPa: String(entry.eventPa || '').trim(),
    eventType: String(entry.eventType || entry.type || '').trim(),
    significanceEn: String(entry.significanceEn || entry.blurb || '').trim(),
    significancePa: String(entry.significancePa || entry.blurbPa || '').trim(),
    gregorianDate: String(entry.gregorianDate || entry.date || '').trim(),
    nanakshahiDate: entry.nanakshahiDate || null
  };
};

const buildObservancesByDate = (observances) => observances.reduce((acc, rawEntry) => {
  const normalized = normalizeObservanceEntry(rawEntry);
  const dateKey = String(normalized.date || normalized.gregorianDate || '').trim();
  if (!dateKey) {
    return acc;
  }

  if (!acc[dateKey]) {
    acc[dateKey] = [];
  }

  acc[dateKey].push(normalized);
  return acc;
}, {});

export const toGurmukhiNumber = (value) => String(value)
  .split('')
  .map((char) => (char >= '0' && char <= '9' ? GURMUKHI_DIGITS[Number(char)] : char))
  .join('');

const buildMonthStartCandidates = (year) => {
  const candidates = [];
  for (const monthInfo of NANAKSHAHI_MONTH_STARTS) {
    const monthIndex = NANAKSHAHI_MONTH_STARTS.indexOf(monthInfo);
    const calendarYear = monthInfo.month < 3 ? year - 1469 : year - 1468;
    const annualDate = NANAKSHAHI_ANNUAL_MONTH_STARTS[calendarYear]?.[monthIndex];
    candidates.push({
      ...monthInfo,
      date: annualDate ? parseAsLocalDate(annualDate) : new Date(year, monthInfo.month - 1, monthInfo.day)
    });
  }
  return candidates;
};

// Only accept a complete annual Sangrand set; do not infer month starts from
// arbitrary festival dates, since movable observances may use another convention.
export const registerNanakshahiMonthStarts = (holidays = []) => {
  const years = new Map();
  holidays.forEach((holiday) => {
    const { year, month, day } = holiday?.nanakshahi || {};
    const date = String(holiday?.gregorian || '');
    if (holiday?.type !== 'sangrand' || Number(day) !== 1 || !Number.isInteger(year) || month < 1 || month > 12 || !ISO_DATE_ONLY_PATTERN.test(date)) return;
    const starts = years.get(year) || [];
    starts[month - 1] = date;
    years.set(year, starts);
  });
  years.forEach((starts, year) => {
    if (starts.filter(Boolean).length !== 12) return;
    const timestamps = starts.map((date) => Date.parse(`${date}T00:00:00Z`));
    if (timestamps.some((time, index) => !Number.isFinite(time) || (index > 0 && (time - timestamps[index - 1] < 28 * DAY_MS || time - timestamps[index - 1] > 33 * DAY_MS)))) return;
    if (!starts[0].startsWith(`${year + 1468}-03-`)) return;
    NANAKSHAHI_ANNUAL_MONTH_STARTS[year] = starts;
  });
};

export const getNanakshahiDate = (inputDate = new Date()) => {
  const target = toDateOnly(inputDate);
  const candidates = [
    ...buildMonthStartCandidates(target.getFullYear() - 1),
    ...buildMonthStartCandidates(target.getFullYear()),
    ...buildMonthStartCandidates(target.getFullYear() + 1)
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let start = candidates[0];
  for (const candidate of candidates) {
    if (candidate.date.getTime() <= target.getTime()) {
      start = candidate;
    }
  }

  // Compare civil dates, not elapsed local milliseconds (a DST day can be 23/25 hours).
  const civilDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSince = Math.round((civilDay(target) - civilDay(start.date)) / DAY_MS);
  const chetStartCurrentYear = new Date(target.getFullYear(), 2, 14);
  const nanakshahiYear = target >= chetStartCurrentYear ? target.getFullYear() - 1468 : target.getFullYear() - 1469;

  return {
    day: daysSince + 1,
    month: start.name,
    monthPa: start.namePa,
    year: nanakshahiYear,
    label: `${daysSince + 1} ${start.name} ${nanakshahiYear} Nanakshahi`,
    labelPa: `${toGurmukhiNumber(daysSince + 1)} ${start.namePa} ${toGurmukhiNumber(nanakshahiYear)} ਨਾਨਕਸ਼ਾਹੀ`
  };
};

export const getNanakshahiMonthCalendar = (inputDate = new Date(), observanceSource = FIXED_OBSERVANCES) => {
  const target = toDateOnly(inputDate);
  const candidates = [
    ...buildMonthStartCandidates(target.getFullYear() - 1),
    ...buildMonthStartCandidates(target.getFullYear()),
    ...buildMonthStartCandidates(target.getFullYear() + 1)
  ].sort((a, b) => a.date.getTime() - b.date.getTime());

  let monthStart = candidates[0];
  let nextMonthStart = candidates[candidates.length - 1];

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const nextCandidate = candidates[index + 1] || candidates[index];

    if (candidate.date.getTime() <= target.getTime() && nextCandidate.date.getTime() > target.getTime()) {
      monthStart = candidate;
      nextMonthStart = nextCandidate;
      break;
    }
  }

  const totalDays = Math.max(1, Math.round((nextMonthStart.date.getTime() - monthStart.date.getTime()) / DAY_MS));
  const activeDate = getNanakshahiDate(target);
  const startWeekday = monthStart.date.getDay();
  const source = Array.isArray(observanceSource) ? observanceSource : FIXED_OBSERVANCES;
  const observancesByDate = buildObservancesByDate(source);
  const activeMonthIndex = NANAKSHAHI_MONTH_INDEX_BY_NAME[activeDate.month];

  const dedupeCellObservances = (items = []) => {
    const seen = new Set();
    const output = [];

    items.forEach((entry) => {
      const key = [
        String(entry?.id || '').trim().toLowerCase(),
        String(entry?.type || '').trim().toLowerCase(),
        String(entry?.title || '').trim().toLowerCase(),
        String(entry?.personEn || '').trim().toLowerCase(),
        String(entry?.eventEn || '').trim().toLowerCase()
      ].join('::');

      if (!seen.has(key)) {
        seen.add(key);
        output.push(entry);
      }
    });

    return output;
  };

  const observancesByNanakshahiDay = source.reduce((acc, rawEntry) => {
    const entry = normalizeObservanceEntry(rawEntry);
    const hasGregorianDate = Boolean(String(entry?.date || entry?.gregorianDate || '').trim());
    if (hasGregorianDate) {
      return acc;
    }

    const monthValue = Number(entry?.nanakshahiDate?.month || 0);
    const dayValue = Number(entry?.nanakshahiDate?.day || 0);
    const yearValue = Number(entry?.nanakshahiDate?.year || 0);

    if (monthValue !== activeMonthIndex || dayValue < 1 || yearValue !== Number(activeDate.year)) {
      return acc;
    }

    if (!acc[dayValue]) {
      acc[dayValue] = [];
    }

    acc[dayValue].push(entry);
    return acc;
  }, {});

  const cells = Array.from({ length: startWeekday }, () => null);

  for (let day = 1; day <= totalDays; day += 1) {
    const gregorianDate = new Date(monthStart.date.getFullYear(), monthStart.date.getMonth(), monthStart.date.getDate() + day - 1);
    const dateKey = toDateKey(gregorianDate);
    const gregorianObservances = observancesByDate[dateKey] || [];
    const fallbackNanakshahiObservances = observancesByNanakshahiDay[day] || [];
    const observances = dedupeCellObservances([...gregorianObservances, ...fallbackNanakshahiObservances]);
    cells.push({
      day,
      displayDay: day,
      dayPa: toGurmukhiNumber(day),
      gregorianDate,
      isToday: day === activeDate.day,
      observances,
      hasObservance: observances.length > 0
    });
  }

  while (cells.length % WEEK_DAYS !== 0) {
    cells.push(null);
  }

  const weeks = [];
  for (let index = 0; index < cells.length; index += WEEK_DAYS) {
    weeks.push(cells.slice(index, index + WEEK_DAYS));
  }

  return {
    month: activeDate.month,
    monthPa: activeDate.monthPa,
    year: activeDate.year,
    yearPa: toGurmukhiNumber(activeDate.year),
    currentDay: activeDate.day,
    currentDayPa: toGurmukhiNumber(activeDate.day),
    label: `${activeDate.month} ${activeDate.year}`,
    labelPa: `${activeDate.monthPa} ${toGurmukhiNumber(activeDate.year)}`,
    monthStartGregorian: new Date(monthStart.date.getTime()),
    nextMonthStartGregorian: new Date(nextMonthStart.date.getTime()),
    weeks
  };
};

export const getUpcomingPunjabiObservances = (
  daysAhead = 10,
  now = new Date(),
  observanceSource = FIXED_OBSERVANCES
) => {
  const today = toDateOnly(now);
  const windowEnd = new Date(today.getTime() + daysAhead * DAY_MS);
  const source = (Array.isArray(observanceSource) ? observanceSource : FIXED_OBSERVANCES)
    .map((entry) => normalizeObservanceEntry(entry));

  return source
    .map((event) => ({ ...event, dateObj: toDateOnly(event.date) }))
    .filter((event) => event.dateObj >= today && event.dateObj <= windowEnd)
    .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
    .map((event) => {
      const calendarMeta = buildCalendarLabelMetadata(event, event.dateObj);

      return ({
      id: event.id || `${event.type}-${event.date}`,
      title: event.title,
      titlePa: event.titlePa,
      type: event.type,
      occasion: event.occasion || event.type || 'Observance',
      date: event.date,
      dateLabel: formatDateLabel(event.dateObj),
      dateLabelPa: formatDateLabelPa(event.dateObj),
      nanakshahiLabel: calendarMeta.primaryLabelEn,
      nanakshahiLabelPa: calendarMeta.primaryLabelPa,
      alternateNanakshahiLabel: calendarMeta.alternateLabelEn,
      alternateNanakshahiLabelPa: calendarMeta.alternateLabelPa,
      hasAlternateNanakshahiLabel: calendarMeta.hasAlternate,
      calendarNoteEn: calendarMeta.noteEn,
      calendarNotePa: calendarMeta.notePa,
      personEn: event.personEn,
      personPa: event.personPa,
      eventEn: event.eventEn,
      eventPa: event.eventPa,
      eventType: event.eventType,
      significanceEn: event.significanceEn,
      significancePa: event.significancePa,
      gregorianDate: event.gregorianDate,
      nanakshahiDate: calendarMeta.fixedNanakshahiDate,
      apiNanakshahiDate: calendarMeta.apiNanakshahiDate
      });
    });
};
