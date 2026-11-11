// Placement configuration contract: every field is consumed by DataWidget.
const limit = { key: 'limit', label: 'Items to show (1–20)', type: 'number', defaultValue: 4 };
const sourceId = { key: 'sourceId', label: 'Record ID (blank selects latest eligible record)', type: 'text', defaultValue: '' };
const filter = { key: 'filter', label: 'Exact category (blank shows all)', type: 'text', defaultValue: '' };
const date = { key: 'date', label: 'Schedule date YYYY-MM-DD (blank means today)', type: 'text', defaultValue: '' };
const month = { key: 'month', label: 'Month YYYY-MM (blank means current month)', type: 'text', defaultValue: '' };
const displayMode = { key: 'displayMode', label: 'Display style', type: 'select', defaultValue: 'list', options: ['list', 'cards'] };
const newsDisplayMode = { key: 'displayMode', label: 'Display style', type: 'select', defaultValue: 'list', options: ['list', 'featured'] };
const langarView = { key: 'view', label: 'Langar information to show', type: 'select', defaultValue: 'needs', options: ['needs', 'required soon', 'collection progress'] };
const gurdwara = { key: 'gurdwara', label: 'Gurdwara Hukamnama source', type: 'select', defaultValue: 'Sri Harmandir Sahib (BaniDB)', options: ['Sri Harmandir Sahib (BaniDB)', 'Singh Sabha Milton'] };
const ang = { key: 'ang', label: 'Sri Guru Granth Sahib Ji Ang (1–1430)', type: 'number', defaultValue: 1 };
const bani = { key: 'bani', label: 'Nitnem bani', type: 'select', defaultValue: 'Japji Sahib', options: ['Japji Sahib', 'Rehras Sahib', 'Kirtan Sohila'] };
const searchQuery = { key: 'query', label: 'Gurbani phrase to search', type: 'text', defaultValue: 'ਸਤਿ' };
const searchMode = { key: 'mode', label: 'Search language', type: 'select', defaultValue: 'Anywhere', options: ['Gurmukhi', 'English', 'Anywhere'] };
const quizTopic = { key: 'topic', label: 'Sikh learning topic', type: 'select', defaultValue: 'sikh-history', options: ['guru-nanak', 'ten-gurus', 'khalsa-panj-pyare', 'five-ks', 'gurdwara-gurbani', 'sikh-history', 'values-festivals', 'mixed-review'] };
const quizLanguage = { key: 'language', label: 'Question language', type: 'select', defaultValue: 'Both', options: ['English', 'Punjabi', 'Both'] };
const schedulePeriod = { key: 'period', label: 'Schedule period', type: 'select', defaultValue: 'all', options: ['all', 'morning', 'evening'] };
const imageUrl = { key: 'imageUrl', label: 'Image URL or uploaded image', type: 'image', defaultValue: '' };
const imageAlt = { key: 'imageAlt', label: 'Alternative text', type: 'text', defaultValue: 'Community photo' };
const imageWidth = { key: 'imageWidth', label: 'Image width (px)', type: 'number', defaultValue: 800 };
const imageHeight = { key: 'imageHeight', label: 'Image height (px)', type: 'number', defaultValue: 450 };
const imageFit = { key: 'imageFit', label: 'Image crop', type: 'select', defaultValue: 'cover', options: ['cover', 'contain'] };
const richContent = { key: 'contentHtml', label: 'Widget content', type: 'richtext', defaultValue: '<p>Add your content here.</p>' };
const appearanceFields = [
  { key: 'backgroundColor', label: 'Widget background color', type: 'color', defaultValue: '#ffffff' },
  { key: 'textColor', label: 'Widget text color', type: 'color', defaultValue: '#0f172a' }
];

const DEPRECATED_WIDGET_IDS = new Set([
  'featured-story', 'news-list', 'event-calendar', 'month-events', 'next-event',
  'morning-schedule', 'evening-schedule', 'urgent-langar-needs', 'langar-progress',
  'latest-video', 'latest-notice', 'notice-board', 'visiting-info'
]);

const sources = {
  news: ['News articles · active, published and unexpired', '/admin/news', '/news', 'Read community news'],
  events: ['Events · active public programs, never registrant records', '/admin/events', '/events', 'Explore events'],
  schedule: ['Daily Maryada · CMS date overrides and default schedule', '/admin/schedule', '/daily-schedule-board', 'View daily schedule'],
  langar: ['Langar inventory · public needs and recorded quantities from Home Content', '/admin/langar', '/langar-contribute', 'Help with langar needs'],
  gallery: ['Gallery · active public albums', '/admin/gallery', '/gallery', 'Browse albums'],
  videos: ['Videos · published media library', '/admin/videos', '/videos', 'Browse videos'],
  sponsors: ['Sponsors · active, unexpired sponsor banners', '/admin/sponsors', '/contact', 'Contact us about sponsorship'],
  campaigns: ['Donation campaigns · public campaign totals only, no donor records', '/admin/donations', '/donation', 'View donation campaigns'],
  notices: ['Community announcements · approved notices in their publication window', '/admin/community-announcements', '/community-announcements-board', 'Browse public notices'],
  branding: ['Gurdwara branding · organization contact and social settings', '/admin/gurdwara-branding', '/contact', 'Contact the Gurdwara'],
  hukamnama: ['BaniDB Darbar Sahib feed or the locally scheduled Milton Hukamnama; source date is shown', 'https://api.banidb.com/v2/hukamnamas', '', ''],
  scripture: ['BaniDB · Sri Guru Granth Sahib Ji with English translations', 'https://www.banidb.com', '', ''],
  nitnem: ['BaniDB · selected Nitnem composition with English translations', 'https://www.banidb.com', '', ''],
  'sikh-resources': ['Curated Sikh learning websites · direct source links, not a live feed', 'https://sikhri.org', '', ''],
  'scripture-search': ['Gurbani search · BaniDB via the site recitation API', '/gurbani-library', '/gurbani-library', 'Explore Gurbani'],
  quiz: ['Sikh learning quiz bank · verified questions from the site education library', '/kids-learning', '/kids-learning', 'Take the quiz'],
  'live-recitation': ['Current sangat recitation session · live site status', '/gurbani-library', '/gurbani-library', 'Browse Gurbani'],
  custom: ['Admin-provided image or rich text · displayed on the selected page', '/admin/widgets', '', ''],
  'live-kirtan': ['Configured continuous Sri Harmandir Sahib audio stream', '/admin/streaming', '/live-kirtan', 'Open live kirtan']
};

const define = (id, name, category, source, description, extraFields = []) => {
  const [sourceLabel, managePath, publicPath, actionLabel] = sources[source];
  const fields = [{ key: 'title', label: 'Title', type: 'text', defaultValue: name }, ...extraFields.map((field) => ({ ...field })), ...appearanceFields.map((field) => ({ ...field }))];
  return {
    id, name, category, source, description, sourceLabel, managePath, publicPath, actionLabel, fields,
    deprecated: DEPRECATED_WIDGET_IDS.has(id),
    defaultConfig: Object.fromEntries(fields.map((field) => [field.key, field.defaultValue]))
  };
};

export const widgetRegistry = [
  define('latest-news', 'News & Updates', 'Content', 'news', 'One configurable news widget. Filter by category and choose a compact list or featured story display.', [limit, filter, newsDisplayMode]),
  define('featured-story', 'Featured News Story', 'Content', 'news', 'One live article with its image and summary; select a record ID or use the latest.', [sourceId]),
  define('news-list', 'News Headlines', 'Content', 'news', 'Compact dated headline index without article summaries.', [limit]),
  define('event-list', 'Events', 'Events', 'events', 'One configurable events widget. Filter by category/month and choose a compact list or cards.', [limit, filter, month, displayMode]),
  define('event-calendar', 'Event Calendar', 'Events', 'events', 'Dated agenda grouped by start day for the next 90 days.', [limit, filter]),
  define('month-events', 'Events This Month', 'Events', 'events', 'Programs overlapping the selected calendar month, including multi-day events.', [limit, month, filter]),
  define('next-event', 'Next Event', 'Events', 'events', 'The next upcoming or ongoing public program.', [filter]),
  define('daily-schedule', 'Daily Schedule', 'Schedule', 'schedule', 'One schedule widget with date and morning/evening filters.', [limit, date, schedulePeriod]),
  define('morning-schedule', 'Morning Maryada', 'Schedule', 'schedule', 'Only morning entries from the resolved daily schedule.', [limit, date]),
  define('evening-schedule', 'Evening Maryada', 'Schedule', 'schedule', 'Only evening entries from the resolved daily schedule.', [limit, date]),
  define('langar-menu', 'Langar Needs & Progress', 'Giving', 'langar', 'Choose outstanding needs, urgent requests, or actual received-versus-required quantities.', [limit, filter, langarView]),
  define('urgent-langar-needs', 'Langar Required Soon', 'Giving', 'langar', 'Outstanding inventory marked required soon by the langar team.', [limit, filter]),
  define('langar-progress', 'Langar Collection Progress', 'Giving', 'langar', 'Recorded received quantities against required quantities, per public need.', [limit, filter]),
  define('gallery-grid', 'Public Photo Albums', 'Media', 'gallery', 'Recent active album covers, dates and descriptions.', [limit]),
  define('featured-album', 'Featured Photo Album', 'Media', 'gallery', 'One public album with a cover and sample photos.', [sourceId]),
  define('video-showcase', 'Video Library', 'Media', 'videos', 'Recent recordings with safe watch links and category filtering.', [limit, filter]),
  define('latest-video', 'Latest Video', 'Media', 'videos', 'The latest recording in the selected category.', [filter]),
  define('sponsor-list', 'Community Sponsors', 'Community', 'sponsors', 'Current sponsor names and banners, without invented sponsorship tiers.', [limit]),
  define('donation-drive', 'Donation Campaigns', 'Giving', 'campaigns', 'Open campaigns with descriptions and real donation links.', [limit]),
  define('campaign-progress', 'Campaign Progress', 'Giving', 'campaigns', 'Recorded raised and target amounts for a selected campaign or latest open campaign.', [sourceId]),
  define('quick-donate', 'Quick Donate Campaign', 'Giving', 'campaigns', 'Link to wallet checkout for one open Stripe campaign; no payment is initiated here.', [sourceId]),
  define('announcements', 'Community Announcements', 'Content', 'notices', 'Approved public notices with descriptions and publication dates.', [limit, filter]),
  define('notice-board', 'Featured Community Notices', 'Content', 'notices', 'Only notices explicitly marked featured by moderators.', [limit, filter]),
  define('latest-notice', 'Latest Community Notice', 'Content', 'notices', 'One most recently published notice in a selected category.', [filter]),
  define('contact-card', 'Contact Us', 'Contact', 'branding', 'Configured organization name, telephone, email and address.'),
  define('map-location', 'Directions', 'Contact', 'branding', 'Configured street address with a working map directions link.'),
  define('social-feed', 'Official Social Channels', 'Social', 'branding', 'Configured official social links, not a fabricated live post feed.'),
  define('visiting-info', 'Visiting the Gurdwara', 'Contact', 'branding', 'Organization identity, tagline, address and links to contact and daily Maryada.'),
  define('gurdwara-hukamnama', 'Gurdwara Hukamnama', 'Gurbani', 'hukamnama', 'Choose Sri Harmandir Sahib via BaniDB or the local Milton daily entry; dated Gurmukhi and English excerpts.', [gurdwara, limit]),
  define('gurbani-ang', 'Gurbani Ang Reader', 'Gurbani', 'scripture', 'Read a selected Ang of Sri Guru Granth Sahib Ji with English translations from BaniDB.', [ang, limit]),
  define('nitnem-reader', 'Nitnem Bani Reader', 'Gurbani', 'nitnem', 'Choose Japji Sahib, Rehras Sahib or Kirtan Sohila for a bilingual reading excerpt.', [bani, limit]),
  define('gurbani-search', 'Gurbani Phrase Search', 'Gurbani', 'scripture-search', 'Search verified Gurbani by phrase and language; results link the text to its Ang and source.', [searchQuery, searchMode, limit]),
  define('sikh-quiz-question', 'Sikh Learning Question', 'Learning', 'quiz', 'Show one bilingual question from the selected, locally maintained Sikh education topic. Answers stay hidden.', [quizTopic, quizLanguage]),
  define('live-recitation', 'Live Sangat Recitation', 'Gurbani', 'live-recitation', 'Shows the current recitation title, reciter and progress when the sangat starts a live session.', []),
  define('sikh-learning-resources', 'Explore Sikh Learning', 'Learning', 'sikh-resources', 'Useful direct links to SikhRI, the Sikh Coalition, SikhiToTheMax and official SGPC information.', [limit]),
  define('photo-only', 'Photo Only', 'Custom', 'custom', 'A single uploaded or linked image. Set its display dimensions and crop.', [imageUrl, imageAlt, imageWidth, imageHeight, imageFit]),
  define('rich-content', 'Rich Content', 'Custom', 'custom', 'A standalone WYSIWYG content block; no separate page is required.', [richContent]),
  define('live-kirtan', 'Live Kirtan Player', 'Gurbani', 'live-kirtan', 'Listen to the configured continuous Sri Harmandir Sahib live audio stream.', [])
];

export const availableWidgetRegistry = widgetRegistry.filter((widget) => !widget.deprecated);
export const widgetCategories = ['All', ...new Set(availableWidgetRegistry.map((widget) => widget.category))];
