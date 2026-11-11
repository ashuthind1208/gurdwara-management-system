import { serviceResponse } from './serviceResponse';
import contentApiService from './contentApiService';

const HOME_CONTENT_RESOURCE = 'cms_home_content';
const PAGE_CONTENT_RESOURCE = 'cms_page_content';
const DEFAULT_HERO_SLIDE_INTERVAL_SECONDS = 5;

const defaultLangarItems = [
  { id: 'langar-1', name: 'Ginger', category: 'Grocery', addedOn: '2026-07-07', expiryDate: '', needed: true, stockStatus: 'required_soon', customStatusLabel: '', quantityRequired: 10, quantityReceived: 2, unit: 'kg' },
  { id: 'langar-2', name: 'Tomatoes', category: 'Grocery', addedOn: '2026-07-07', expiryDate: '', needed: true, stockStatus: 'required_soon', customStatusLabel: '', quantityRequired: 10, quantityReceived: 5, unit: 'kg' },
  { id: 'langar-3', name: 'Onions', category: 'Grocery', addedOn: '2026-07-06', expiryDate: '', needed: true, stockStatus: 'required_soon', customStatusLabel: '', quantityRequired: 10, quantityReceived: 5, unit: 'kg' },
  { id: 'langar-4', name: 'Milk', category: 'Dairy', addedOn: '2026-07-07', expiryDate: '', needed: true, stockStatus: 'required_soon', customStatusLabel: '', quantityRequired: 10, quantityReceived: 4, unit: 'bags' },
  { id: 'langar-5', name: 'Potatoes', category: 'Grocery', addedOn: '2026-07-05', expiryDate: '', needed: true, stockStatus: 'required_soon', customStatusLabel: '', quantityRequired: 10, quantityReceived: 6, unit: 'kg' },
  { id: 'langar-6', name: 'Paneer', category: 'Dairy', addedOn: '2026-07-05', expiryDate: '', needed: true, stockStatus: 'required_soon', customStatusLabel: '', quantityRequired: 10, quantityReceived: 1, unit: 'kg' }
];

const resolveLangarStatusLabel = (item = {}) => {
  if (item.stockStatus === 'custom' && item.customStatusLabel) {
    return item.customStatusLabel;
  }

  if (item.stockStatus === 'stock_available') {
    return 'Stock Available';
  }

  return 'Required Soon';
};

const defaultSchedule = {
  morning: [
    { id: 'morning-1', time: '5:00AM - 5:15AM', label: 'Parkash Sri Guru Granth Sahib' },
    { id: 'morning-2', time: '5:15AM - 6:00AM', label: '5 Baani da Paath' },
    { id: 'morning-3', time: '6:00 AM - 6:15 AM', label: 'Ardaas and Hukamnama' }
  ],
  evening: [
    { id: 'evening-1', time: '7:00PM - 7:30PM', label: 'Rehraas Sahib' },
    { id: 'evening-2', time: '7:30 PM - 7:45 PM', label: 'Hukamnama Katha' },
    { id: 'evening-3', time: '7:45 PM - 8:00 PM', label: 'Kirtan Sohila Sahib and Sukh Asan Sri Guru Granth Sahib' }
  ]
};

const sundayDefaultEntries = [
  {
    id: 'sunday-default-sukhmani-sahib',
    segment: 'morning',
    timeEn: '10:30 AM - 12:00 PM',
    timePa: '',
    titleEn: 'Sri Sukhmani Sahib Path',
    titlePa: '',
    noteEn: '',
    notePa: '',
    isHighlighted: false,
    isActive: true
  },
  {
    id: 'sunday-default-kirtan',
    segment: 'morning',
    timeEn: '12:00 PM - 12:45 PM',
    timePa: '',
    titleEn: 'Kirtan',
    titlePa: '',
    noteEn: '',
    notePa: '',
    isHighlighted: false,
    isActive: true
  },
  {
    id: 'sunday-default-katha',
    segment: 'morning',
    timeEn: '12:45 PM - 1:30 PM',
    timePa: '',
    titleEn: 'Katha',
    titlePa: '',
    noteEn: '',
    notePa: '',
    isHighlighted: false,
    isActive: true
  }
];

const normalizeScheduleLabelKey = (value = '') => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

const scheduleTimeOverrides = {
  [normalizeScheduleLabelKey('Parkash Sri Guru Granth Sahib')]: '5:00AM - 5:15AM',
  [normalizeScheduleLabelKey('5 Baani da Paath')]: '5:15AM - 6:00AM',
  [normalizeScheduleLabelKey('Ardaas and Hukamnama')]: '6:00 AM - 6:15 AM',
  [normalizeScheduleLabelKey('Rehraas Sahib')]: '7:00PM - 7:30PM',
  [normalizeScheduleLabelKey('Hukamnama Katha')]: '7:30 PM - 7:45 PM',
  [normalizeScheduleLabelKey('Kirtan Sohila Sahib and Sukh Asan Sri Guru Granth Sahib')]: '7:45 PM - 8:00 PM'
};

const resolveScheduleTime = (title = '', time = '') => {
  const key = normalizeScheduleLabelKey(title);
  if (key && scheduleTimeOverrides[key]) {
    return scheduleTimeOverrides[key];
  }

  return time || '';
};

const buildDefaultScheduleDay = (legacySchedule = defaultSchedule) => ({
  id: 'schedule-default',
  dateKey: 'default',
  dateLabel: 'Daily Default',
  title: 'Standard Daily Maryada',
  isSpecial: false,
  highlightTitle: '',
  highlightNoteEn: '',
  highlightNotePa: '',
  entries: [
    ...(legacySchedule.morning || []).map((item, index) => ({
      id: item.id || `morning-${index + 1}`,
      segment: 'morning',
      timeEn: item.time || '',
      timePa: '',
      titleEn: item.label || '',
      titlePa: '',
      noteEn: '',
      notePa: '',
      isHighlighted: false,
      isActive: true,
      sortOrder: index + 1
    })),
    ...(legacySchedule.evening || []).map((item, index) => ({
      id: item.id || `evening-${index + 1}`,
      segment: 'evening',
      timeEn: item.time || '',
      timePa: '',
      titleEn: item.label || '',
      titlePa: '',
      noteEn: '',
      notePa: '',
      isHighlighted: false,
      isActive: true,
      sortOrder: (legacySchedule.morning || []).length + index + 1
    }))
  ]
});

const normalizeScheduleTimelineEntry = (entry = {}, index = 0) => ({
  id: entry.id || `schedule-entry-${Date.now()}-${index}`,
  segment: ['morning', 'evening', 'special'].includes(entry.segment) ? entry.segment : 'morning',
  timeEn: resolveScheduleTime(entry.titleEn || entry.label || '', entry.timeEn || entry.time || ''),
  timePa: entry.timePa || '',
  titleEn: entry.titleEn || entry.label || '',
  titlePa: entry.titlePa || '',
  noteEn: entry.noteEn || '',
  notePa: entry.notePa || '',
  isHighlighted: Boolean(entry.isHighlighted),
  isActive: entry.isActive !== false,
  sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : index + 1
});

const migrateDefaultScheduleEntries = (entries = []) => {
  const kirtanKey = normalizeScheduleLabelKey('Kirtan Sohila Sahib');
  const sukhAsanKey = normalizeScheduleLabelKey('Sukh Asan Sri Guru Granth Sahib');
  const combinedKey = normalizeScheduleLabelKey('Kirtan Sohila Sahib and Sukh Asan Sri Guru Granth Sahib');
  let combinedAdded = false;

  return entries.flatMap((entry) => {
    const key = normalizeScheduleLabelKey(entry.titleEn || entry.label || '');
    if ([kirtanKey, sukhAsanKey, combinedKey].includes(key)) {
      if (combinedAdded) {
        return [];
      }
      combinedAdded = true;
      return [{
        ...entry,
        segment: 'evening',
        timeEn: '7:45 PM - 8:00 PM',
        titleEn: 'Kirtan Sohila Sahib and Sukh Asan Sri Guru Granth Sahib'
      }];
    }

    return [{
      ...entry,
      timeEn: resolveScheduleTime(entry.titleEn || entry.label || '', entry.timeEn || entry.time || '')
    }];
  });
};

const normalizeScheduleDay = (day = {}, index = 0) => {
  const normalizedDateKey = day.dateKey || day.date || (index === 0 ? 'default' : `override-${index + 1}`);
  const entries = Array.isArray(day.entries) ? day.entries : [];
  const normalizedEntries = entries
    .map((entry, entryIndex) => normalizeScheduleTimelineEntry(entry, entryIndex))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    .map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex + 1 }));
  const migratedEntries = normalizedDateKey === 'default'
    ? migrateDefaultScheduleEntries(normalizedEntries)
    : normalizedEntries;

  return {
    id: day.id || `schedule-day-${normalizedDateKey}`,
    dateKey: normalizedDateKey,
    dateLabel: day.dateLabel || (normalizedDateKey === 'default' ? 'Daily Default' : normalizedDateKey),
    title: day.title || (normalizedDateKey === 'default' ? 'Standard Daily Maryada' : 'Special Day Schedule'),
    isSpecial: normalizedDateKey === 'default' ? false : day.isSpecial !== false,
    highlightTitle: day.highlightTitle || '',
    highlightNoteEn: day.highlightNoteEn || '',
    highlightNotePa: day.highlightNotePa || '',
    entries: migratedEntries.map((entry, entryIndex) => ({ ...entry, sortOrder: entryIndex + 1 }))
  };
};

const normalizeScheduleDays = (scheduleDays = [], legacySchedule = defaultSchedule) => {
  const sourceDays = Array.isArray(scheduleDays) && scheduleDays.length > 0
    ? scheduleDays.map((day, index) => normalizeScheduleDay(day, index))
    : [normalizeScheduleDay(buildDefaultScheduleDay(legacySchedule), 0)];

  const hasDefault = sourceDays.some((day) => day.dateKey === 'default');
  if (hasDefault) {
    return sourceDays;
  }

  return [normalizeScheduleDay(buildDefaultScheduleDay(legacySchedule), 0), ...sourceDays];
};

const isSundayDateKey = (dateKey = '') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const date = new Date(`${dateKey}T12:00:00`);
  return !Number.isNaN(date.getTime()) && date.getDay() === 0;
};

const appendSundayDefaultEntries = (entries = []) => {
  const existingKeys = new Set(entries.map((entry) => (
    `${normalizeScheduleLabelKey(entry.titleEn || entry.label)}|${String(entry.timeEn || entry.time || '').replace(/\s+/g, '').toLowerCase()}`
  )));

  const additions = sundayDefaultEntries.filter((entry) => {
    const key = `${normalizeScheduleLabelKey(entry.titleEn)}|${entry.timeEn.replace(/\s+/g, '').toLowerCase()}`;
    return !existingKeys.has(key);
  });

  return [...entries, ...additions].map((entry, index) => ({
    ...entry,
    sortOrder: index + 1
  }));
};

export const resolveScheduleForDate = (scheduleDays = [], dateKey = 'default') => {
  const normalizedDays = normalizeScheduleDays(scheduleDays, defaultSchedule);
  const savedDay = normalizedDays.find((day) => day.dateKey === dateKey);
  if (savedDay) {
    return savedDay;
  }

  const defaultDay = normalizedDays.find((day) => day.dateKey === 'default') || normalizedDays[0];
  if (!isSundayDateKey(dateKey)) {
    return defaultDay;
  }

  return {
    ...defaultDay,
    entries: appendSundayDefaultEntries(defaultDay.entries || [])
  };
};

const deriveLegacyScheduleFromDay = (day) => {
  const normalizedDay = day || normalizeScheduleDay(buildDefaultScheduleDay(defaultSchedule));
  const toLegacyItem = (entry, index, prefix) => ({
    id: entry.id || `${prefix}-${index + 1}`,
    time: entry.timeEn || '',
    label: entry.titleEn || ''
  });

  return {
    morning: normalizedDay.entries.filter((entry) => entry.segment === 'morning').map((entry, index) => toLegacyItem(entry, index, 'morning')),
    evening: normalizedDay.entries.filter((entry) => entry.segment === 'evening').map((entry, index) => toLegacyItem(entry, index, 'evening'))
  };
};

const defaultPageContent = {
  about: {
    heroTitle: 'About Our Gurdwara',
    heroDescription: 'Serving the sangat with spiritual guidance, seva, and community development.',
    intro: 'Our Gurdwara supports spiritual learning, family connection, and seva-led community development in Milton.',
    mediaUrl: 'https://images.unsplash.com/photo-1592861956120-e524fc739696?auto=format&fit=crop&w=1400&q=80',
    sections: [
      {
        id: 'about-history',
        title: 'History',
        body: 'Established to support Sikh families in Milton through worship, education, and seva.',
        mediaUrl: ''
      },
      {
        id: 'about-vision',
        title: 'Vision',
        body: 'A spiritually strong, inclusive, and service-led community for future generations.',
        mediaUrl: ''
      },
      {
        id: 'about-mission',
        title: 'Mission',
        body: 'Promote Sikh values, support youth, and provide meaningful seva opportunities for all.',
        mediaUrl: ''
      },
      {
        id: 'about-management',
        title: 'Committee and Management',
        body: 'Executive committee, granthis, and volunteers work together for daily maryada and community support.',
        mediaUrl: ''
      }
    ]
  },
  sikhism: {
    heroTitle: 'Learn Sikhism',
    heroDescription: 'Structured learning resources prepared for community education.',
    intro: 'Begin with core Sikh beliefs and continue into Gurus, Gurbani, and history.',
    mediaUrl: '',
    sections: [
      { id: 'sikhism-1', title: 'Introduction to Sikhism', body: 'Foundational Sikh principles and spiritual worldview.', mediaUrl: '' },
      { id: 'sikhism-2', title: 'Ten Gurus', body: 'Teachings, legacy, and contributions of the ten Sikh Gurus.', mediaUrl: '' },
      { id: 'sikhism-3', title: 'Guru Granth Sahib', body: 'Understanding Gurbani, structure, and daily relationship with Shabad.', mediaUrl: '' },
      { id: 'sikhism-4', title: 'Five Ks and Rehat', body: 'Identity, discipline, and practical living in Sikhi.', mediaUrl: '' }
    ]
  },
  events: {
    heroTitle: 'Events and Registrations',
    heroDescription: 'Calendar, list view, filters, and RSVP for all programs.',
    intro: 'Track samagams, workshops, seva drives, and Gurpurab programs in one place.',
    mediaUrl: '',
    sections: []
  },
  gallery: {
    heroTitle: 'Gallery',
    heroDescription: 'Browse albums of photos and videos from samagams and seva drives.',
    intro: '',
    mediaUrl: '',
    sections: []
  },
  membership: {
    heroTitle: 'Membership Registration',
    heroDescription: 'Membership registration information and disclaimer.',
    intro: '',
    mediaUrl: '',
    sections: []
  },
  contact: {
    heroTitle: 'Contact Us',
    heroDescription: '',
    intro: 'Use phone, email, or the contact form below for support and program information.',
    mediaUrl: '',
    phone: '',
    email: '',
    address: '',
    contactHours: [
      { label: 'Darbar Sahib', value: 'Daily: 5:00 AM to 9:00 PM' },
      { label: 'Langar Hall', value: 'Weekends and Gurpurab Specials' },
      { label: 'Office Support', value: 'Mon-Sun: 10:00 AM to 6:00 PM' }
    ],
    socialLinks: {
      facebook: '',
      instagram: ''
    },
    sections: []
  }
};

const normalizeScheduleEntries = (entries = [], prefix) => entries.map((entry, index) => {
  if (typeof entry === 'string') {
    const splitIndex = entry.indexOf(' - ');
    if (splitIndex === -1) {
      return {
        id: `${prefix}-${index + 1}`,
        time: entry,
        label: ''
      };
    }

    return {
      id: `${prefix}-${index + 1}`,
      time: entry.slice(0, splitIndex),
      label: entry.slice(splitIndex + 3)
    };
  }

  return {
    id: entry.id || `${prefix}-${index + 1}`,
    time: resolveScheduleTime(entry.label || '', entry.time || ''),
    label: entry.label || ''
  };
});

const normalizeSlides = (slides = []) => {
  const sorted = [...slides]
    .map((slide, index) => ({
      id: slide.id || `slide-${Date.now()}-${index}`,
      order: Number.isFinite(Number(slide.order)) ? Number(slide.order) : index + 1,
      image: slide.image || '',
      eyebrow: slide.eyebrow || '',
      title: slide.title || slide.heading || '',
      description: slide.description || slide.caption || '',
      primaryCtaLabel: slide.primaryCtaLabel || slide.ctaLabel || '',
      primaryCtaPath: slide.primaryCtaPath || slide.ctaPath || '',
      secondaryCtaLabel: slide.secondaryCtaLabel || '',
      secondaryCtaPath: slide.secondaryCtaPath || '',
      contentLinkLabel: slide.contentLinkLabel || '',
      contentLinkPath: slide.contentLinkPath || '',
      contentLinkTwoLabel: slide.contentLinkTwoLabel || '',
      contentLinkTwoPath: slide.contentLinkTwoPath || ''
    }))
    .sort((a, b) => a.order - b.order);

  return sorted.map((slide, index) => ({ ...slide, order: index + 1 }));
};

const insertSlideAtOrder = (slides, nextSlide, requestedOrder) => {
  const orderedSlides = normalizeSlides(slides);
  const normalizedOrder = Math.max(1, Math.min(Number(requestedOrder) || orderedSlides.length + 1, orderedSlides.length + 1));
  const before = orderedSlides.slice(0, normalizedOrder - 1);
  const after = orderedSlides.slice(normalizedOrder - 1);
  return normalizeSlides([...before, nextSlide, ...after]);
};

const blankPageContent = { heroTitle: '', heroDescription: '', intro: '', mediaUrl: '', phone: '', email: '', address: '', contactHours: [], socialLinks: {}, sections: [] };

export const normalizeCmsPagePath = (path) => {
  const key = String(path || '').trim().replace(/^\/+|\/+$/g, '');
  const reserved = /^(admin|api|login|join|family-dashboard|gurbani-library|hukamnama|bookings|seva|donation|kids-learning|media|news|library|videos|faq|welcome|donationsuccess|donation-board|event-calendar-board|langar-board|langar-contribute|daily-schedule-board|led-boards|special-events-board|community-announcements-board|welcome-journey-board|hukamnama-board|recitation-board|stream-overlay|follow|granthi-remote|ask-a-granthi)(\/|$)/;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(key) || reserved.test(key)) {
    throw new Error('Enter a lowercase public page path with letters, numbers, and hyphens; application routes are reserved.');
  }
  return key;
};

const normalizePageEntry = (pageValue = {}, fallback = {}) => pageValue.deleted === true ? { ...blankPageContent, deleted: true } : ({
  ...fallback,
  ...pageValue,
  sections: (pageValue.sections || fallback.sections || []).map((section, index) => ({
    id: section.id || `section-${index + 1}`,
    title: section.title || '',
    body: section.body || '',
    mediaUrl: section.mediaUrl || ''
  }))
});

const normalizeAllPageContent = (allContent = {}) => ({
  ...Object.fromEntries(Object.entries(allContent).filter(([key, value]) => /^[a-z0-9][a-z0-9/-]*$/.test(key) && value && typeof value === 'object' && !Array.isArray(value)).map(([key, value]) => [key, normalizePageEntry(value)])),
  about: normalizePageEntry(allContent.about, defaultPageContent.about),
  sikhism: normalizePageEntry(allContent.sikhism, defaultPageContent.sikhism),
  events: normalizePageEntry(allContent.events, defaultPageContent.events),
  gallery: normalizePageEntry(allContent.gallery, defaultPageContent.gallery),
  membership: normalizePageEntry(allContent.membership, defaultPageContent.membership),
  contact: normalizePageEntry(allContent.contact, defaultPageContent.contact)
});

const normalizeContent = (content) => {
  const normalizedScheduleDays = normalizeScheduleDays(content.scheduleDays, content.schedule || defaultSchedule);
  const defaultScheduleDay = resolveScheduleForDate(normalizedScheduleDays, 'default');
  const requestedSlideInterval = Number(content.hero?.slideIntervalSeconds);

  return {
  ...defaultContent,
  ...content,
  hero: {
    ...defaultContent.hero,
    ...(content.hero || {}),
    slideIntervalSeconds: Number.isFinite(requestedSlideInterval)
      ? Math.min(60, Math.max(3, Math.round(requestedSlideInterval)))
      : DEFAULT_HERO_SLIDE_INTERVAL_SECONDS,
    slides: normalizeSlides(content.hero?.slides || defaultContent.hero.slides)
  },
  scheduleDays: normalizedScheduleDays,
  schedule: deriveLegacyScheduleFromDay(defaultScheduleDay),
  langarItems: (content.langarItems || defaultLangarItems).map((item, index) => ({
    id: item.id || `langar-${index + 1}`,
    name: item.name || '',
    category: item.category || 'Grocery',
    brand: item.brand || '',
    addedOn: item.addedOn || new Date().toISOString().slice(0, 10),
    expiryDate: item.expiryDate || '',
    needed: typeof item.needed === 'boolean' ? item.needed : true,
    stockStatus: item.stockStatus || ((typeof item.needed === 'boolean' ? item.needed : true) ? 'required_soon' : 'stock_available'),
    customStatusLabel: item.customStatusLabel || '',
    quantityRequired: Math.max(0, Number(item.quantityRequired ?? 0)),
    quantityReceived: Math.max(0, Number(item.quantityReceived ?? 0)),
    walkInReceipts: Array.isArray(item.walkInReceipts) ? item.walkInReceipts.map((receipt) => ({
      id: String(receipt?.id || ''),
      quantity: Math.max(0, Number(receipt?.quantity || 0)),
      unit: String(receipt?.unit || item.unit || 'items'),
      donorName: String(receipt?.donorName || '').trim(),
      receivedAt: String(receipt?.receivedAt || '').trim(),
      expiryDate: String(receipt?.expiryDate || '').trim(),
      imageUrl: String(receipt?.imageUrl || '').trim()
    })) : [],
    unit: item.unit || 'items',
    imageUrl: item.imageUrl || '',
    updatedAt: item.updatedAt || '',
    displayStatusLabel: resolveLangarStatusLabel(item)
  }))
  };
};

const persistContent = async (nextValue) => {
  await contentApiService.setSingleton(HOME_CONTENT_RESOURCE, nextValue);
  return nextValue;
};

const readAllPageContent = async () => {
  // Reads must not write or revive defaults when storage is unavailable.
  const payload = await contentApiService.getSingleton(PAGE_CONTENT_RESOURCE, null);
  return normalizeAllPageContent(payload || defaultPageContent);
};

const persistPageContent = async (nextValue) => {
  await contentApiService.setSingleton(PAGE_CONTENT_RESOURCE, nextValue);
  return nextValue;
};

const defaultContent = {
  hero: {
    eyebrow: 'Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh',
    title: 'Your Gurdwara',
    description:
      'Daily hukamnama, samagams, seva opportunities, and community updates for your sangat.',
    slideIntervalSeconds: DEFAULT_HERO_SLIDE_INTERVAL_SECONDS,
    primaryCta: 'Donate for Langar',
    primaryCtaPath: '/donation',
    secondaryCta: 'Join Seva',
    secondaryCtaPath: '/seva',
    slides: [
      {
        image:
          'https://assets.cdn.filesafe.space/b9aAKZlXnebGhQoRLosa/media/654583d092b8570d5a8c5f1a.png',
        eyebrow: 'Weekly Diwan',
        title: 'Sunday Samagam',
        description: 'Sukhmani Sahib, Kirtan, Katha, and Ardaas with Langar sewa for the full sangat.',
        primaryCtaLabel: 'View Sunday Program',
        primaryCtaPath: '/events',
        secondaryCtaLabel: 'Register for Seva',
        secondaryCtaPath: '/seva',
        contentLinkLabel: 'See full weekly schedule',
        contentLinkPath: '/events',
        contentLinkTwoLabel: 'Support langar',
        contentLinkTwoPath: '/donation'
      },
      {
        image:
          'https://images.leadconnectorhq.com/image/f_webp/q_80/r_320/u_https://storage.googleapis.com/msgsndr/knES3eSWYIsc5YSZ3YLl/media/62beef4f9f43b0c53e585a8f.jpeg',
        eyebrow: 'Community Life',
        title: 'Sangat and Community',
        description: 'Families, youth, and elders connected through Gurbani, seva, and shared learning.',
        primaryCtaLabel: 'Register for Seva',
        primaryCtaPath: '/seva',
        secondaryCtaLabel: 'Explore Sikh Education',
        secondaryCtaPath: '/sikhism',
        contentLinkLabel: 'Read daily hukamnama',
        contentLinkPath: '/hukamnama',
        contentLinkTwoLabel: 'Browse gallery',
        contentLinkTwoPath: '/gallery'
      }
    ]
  },
  schedule: defaultSchedule,
  langarItems: defaultLangarItems
};

const readHomeContent = async () => {
  try {
    const payload = await contentApiService.getSingleton(HOME_CONTENT_RESOURCE, null);
    if (!payload) {
      const seeded = normalizeContent(defaultContent);
      await contentApiService.setSingleton(HOME_CONTENT_RESOURCE, seeded);
      return seeded;
    }

    return normalizeContent(payload);
  } catch {
    return normalizeContent(defaultContent);
  }
};

const cmsService = {
  getHomeContent: async () => serviceResponse(await readHomeContent()),
  updateHomeContent: async (payload) => {
    const current = await readHomeContent();
    const nextValue = {
      ...current,
      ...payload,
      hero: {
        ...current.hero,
        ...(payload.hero || {}),
        slides: normalizeSlides(payload.hero?.slides || current.hero.slides)
      },
      schedule: payload.schedule
        ? {
            morning: normalizeScheduleEntries(payload.schedule.morning || current.schedule.morning, 'morning'),
            evening: normalizeScheduleEntries(payload.schedule.evening || current.schedule.evening, 'evening')
          }
        : current.schedule,
      scheduleDays: payload.scheduleDays || current.scheduleDays,
      langarItems: payload.langarItems || current.langarItems
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)));
  },
  getHeroSlides: async () => serviceResponse((await readHomeContent()).hero.slides),
  addHeroSlide: async (payload) => {
    const current = await readHomeContent();
    const nextSlide = {
      ...payload,
      id: payload.id || `slide-${Date.now()}`
    };

    const nextSlides = insertSlideAtOrder(current.hero.slides, nextSlide, payload.order);
    const nextValue = {
      ...current,
      hero: {
        ...current.hero,
        slides: nextSlides
      }
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).hero.slides);
  },
  updateHeroSlide: async (id, payload) => {
    const current = await readHomeContent();
    const existing = current.hero.slides.find((slide) => slide.id === id);
    if (!existing) {
      return serviceResponse(current.hero.slides);
    }

    const remaining = current.hero.slides.filter((slide) => slide.id !== id);
    const nextSlide = {
      ...existing,
      ...payload,
      id
    };

    const nextSlides = insertSlideAtOrder(remaining, nextSlide, payload.order || existing.order);
    const nextValue = {
      ...current,
      hero: {
        ...current.hero,
        slides: nextSlides
      }
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).hero.slides);
  },
  removeHeroSlide: async (id) => {
    const current = await readHomeContent();
    const nextValue = {
      ...current,
      hero: {
        ...current.hero,
        slides: normalizeSlides(current.hero.slides.filter((slide) => slide.id !== id))
      }
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).hero.slides);
  },
  addLangarItem: async (payload) => {
    const current = await readHomeContent();
    const nextItem = {
      id: `langar-${Date.now()}`,
      name: payload.name,
      category: payload.category || 'Grocery',
      brand: payload.brand || '',
      addedOn: payload.addedOn || new Date().toISOString().slice(0, 10),
      expiryDate: payload.expiryDate || '',
      needed: payload.needed,
      stockStatus: payload.stockStatus || (payload.needed ? 'required_soon' : 'stock_available'),
      customStatusLabel: payload.customStatusLabel || '',
      quantityRequired: Math.max(0, Number(payload.quantityRequired || 0)),
      quantityReceived: Math.max(0, Number(payload.quantityReceived || 0)),
      walkInReceipts: Array.isArray(payload.walkInReceipts) ? payload.walkInReceipts : [],
      unit: payload.unit || 'items',
      imageUrl: payload.imageUrl || '',
      updatedAt: new Date().toISOString()
    };
    const nextValue = {
      ...current,
      langarItems: [nextItem, ...current.langarItems]
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).langarItems);
  },
  removeLangarItem: async (id) => {
    const current = await readHomeContent();
    const nextValue = {
      ...current,
      langarItems: current.langarItems.filter((item) => item.id !== id)
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).langarItems);
  },
  updateLangarItem: async (id, payload) => {
    const current = await readHomeContent();
    const updatedItem = { ...(current.langarItems.find((item) => item.id === id) || {}), ...payload, updatedAt: new Date().toISOString() };
    const nextValue = {
      ...current,
      langarItems: current.langarItems.map((item) => (
        item.id === id ? updatedItem : item
      ))
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).langarItems);
  },
  updateSchedule: async (schedule) => {
    const current = await readHomeContent();
    const normalizedDays = normalizeScheduleDays(current.scheduleDays, current.schedule || defaultSchedule);

    if (Array.isArray(schedule.scheduleDays)) {
      const nextValue = {
        ...current,
        scheduleDays: normalizeScheduleDays(schedule.scheduleDays, current.schedule || defaultSchedule)
      };

      return serviceResponse(normalizeContent(await persistContent(nextValue)).scheduleDays);
    }

    if (schedule.day) {
      const nextDay = normalizeScheduleDay(schedule.day);
      const remaining = normalizedDays.filter((item) => item.dateKey !== nextDay.dateKey);
      const nextValue = {
        ...current,
        scheduleDays: [...remaining, nextDay].sort((left, right) => left.dateKey.localeCompare(right.dateKey))
      };

      return serviceResponse(normalizeContent(await persistContent(nextValue)).scheduleDays);
    }

    const nextValue = {
      ...current,
      schedule: {
        morning: normalizeScheduleEntries(schedule.morning || [], 'morning'),
        evening: normalizeScheduleEntries(schedule.evening || [], 'evening')
      },
      scheduleDays: normalizeScheduleDays([], {
        morning: normalizeScheduleEntries(schedule.morning || [], 'morning'),
        evening: normalizeScheduleEntries(schedule.evening || [], 'evening')
      })
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).schedule);
  },
  getScheduleForDate: async (dateKey) => {
    const current = await readHomeContent();
    return serviceResponse(resolveScheduleForDate(current.scheduleDays, dateKey || 'default'));
  },
  copyScheduleDay: async ({ sourceDateKey, targetDateKey }) => {
    const current = await readHomeContent();
    const normalizedDays = normalizeScheduleDays(current.scheduleDays, current.schedule || defaultSchedule);
    const sourceDay = resolveScheduleForDate(normalizedDays, sourceDateKey || 'default');
    const copiedDay = normalizeScheduleDay({
      ...sourceDay,
      id: `schedule-day-${targetDateKey}`,
      dateKey: targetDateKey,
      dateLabel: targetDateKey,
      title: sourceDay.title,
      isSpecial: targetDateKey !== 'default',
      entries: sourceDay.entries.map((entry) => ({ ...entry, id: `schedule-entry-${Date.now()}-${entry.id}` }))
    });

    const remaining = normalizedDays.filter((item) => item.dateKey !== targetDateKey);
    const nextValue = {
      ...current,
      scheduleDays: [...remaining, copiedDay].sort((left, right) => left.dateKey.localeCompare(right.dateKey))
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).scheduleDays);
  },
  removeScheduleDay: async (dateKey) => {
    const current = await readHomeContent();
    if (!dateKey || dateKey === 'default') {
      return serviceResponse(normalizeContent(current).scheduleDays);
    }

    const nextValue = {
      ...current,
      scheduleDays: normalizeScheduleDays(current.scheduleDays, current.schedule || defaultSchedule).filter((day) => day.dateKey !== dateKey)
    };

    return serviceResponse(normalizeContent(await persistContent(nextValue)).scheduleDays);
  },
  // Admin reads preserve deletion markers; public lists exclude deleted pages.
  readAllPageContent: async () => serviceResponse(await readAllPageContent()),
  getAllPageContent: async () => serviceResponse(Object.fromEntries(Object.entries(await readAllPageContent()).filter(([, page]) => !page.deleted))),
  getPageContent: async (pageKey) => {
    const allContent = await readAllPageContent();
    return serviceResponse(Object.prototype.hasOwnProperty.call(allContent, pageKey) ? allContent[pageKey] : { heroTitle: pageKey.split('/').pop().replace(/-/g, ' '), heroDescription: '', intro: '', mediaUrl: '', sections: [] });
  },
  updatePageContent: async (pageKey, payload) => {
    const allContent = await readAllPageContent();
    pageKey = normalizeCmsPagePath(pageKey);
    if (allContent[pageKey]?.deleted) throw new Error('This page was deleted. Add it again to publish new content.');
    const fallback = defaultPageContent[pageKey] || {};
    const nextValue = {
      ...allContent,
      [pageKey]: normalizePageEntry({
        ...allContent[pageKey],
        ...payload,
        sections: payload.sections || allContent[pageKey]?.sections || []
      }, fallback)
    };

    const saved = normalizeAllPageContent(await persistPageContent(nextValue));
    return serviceResponse(saved[pageKey]);
  },
  createPageContent: async (path, payload) => {
    const pageKey = normalizeCmsPagePath(path);
    const allContent = await readAllPageContent();
    if (Object.prototype.hasOwnProperty.call(allContent, pageKey) && !allContent[pageKey].deleted) throw new Error('A page already exists at this path. Use Edit instead.');
    const page = normalizePageEntry({ ...blankPageContent, ...payload, deleted: false });
    await persistPageContent({ ...allContent, [pageKey]: page });
    return serviceResponse(page);
  },
  deletePageContent: async (path) => {
    const pageKey = normalizeCmsPagePath(path);
    const allContent = await readAllPageContent();
    if (Object.prototype.hasOwnProperty.call(defaultPageContent, pageKey)) {
      allContent[pageKey] = normalizePageEntry({ deleted: true });
    } else {
      delete allContent[pageKey];
    }
    await persistPageContent(allContent);
    return serviceResponse(null);
  }
};

export default cmsService;
