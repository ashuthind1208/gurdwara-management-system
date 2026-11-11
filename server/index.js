const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { URL } = require('url');
const Stripe = require('stripe');
const crypto = require('crypto');
const { verifyQuickDonation } = require('./quickDonateStatus');
const { handleGurpurabRequest } = require('./gurpurabProxy');
const { createDonationSms, shouldSendReconciledZeffySms, zeffySmsConsent } = require('./donationSms');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default;
const {
  extractZeffyPaymentId,
  mapZeffyApiPayment,
  normalizeEventType,
  verifyZeffyWebhookToken
} = require('./zeffyWebhook');
const { createGurmatGuide } = require('./gurmatGuide');
const {
  findStoredGurmatGuide,
  listRecentGurmatGuides,
  listStoredGurmatGuides,
  storeGurmatGuide
} = require('./gurmatGuideStore');
const { createAiQuiz } = require('./aiQuiz');
const { findDailyAiQuiz, listStoredAiQuizzes, storeDailyAiQuiz } = require('./aiQuizStore');
const { createGranthiAnswer, normalizeGranthiQuestion } = require('./askGranthi');
const { DEFAULT_SITE_NAVIGATION, normalizeSiteNavigation } = require('./siteNavigation');
const {
  COMMUNITY_ANNOUNCEMENT_CATEGORIES,
  isCommunityAnnouncementCurrentlyPublished,
  normalizeCommunityAnnouncementReview,
  normalizeCommunityAnnouncementSubmission,
  projectPublicCommunityAnnouncement
} = require('./communityAnnouncements');
const {
  completeGranthiAnswer,
  createThinkingQuestion,
  failGranthiAnswer,
  findReusableAnswer,
  listGranthiQuestions,
  listPublicGranthiQuestions,
  normalizeQuestionKey,
  reuseGranthiAnswer,
} = require('./askGranthiStore');
const { getGurdwaraBranding, saveGurdwaraBranding, BRANDING_FONTS, BRANDING_CORNER_STYLES, BRANDING_THEME_KEYS } = require('./gurdwaraBrandingStore');
const { resolveMembershipRenewal } = require('./membershipReminder');
const {
  InstagramService,
  WhatsAppService,
  buildInstagramCaption,
  buildWhatsAppTemplatePayload
} = require('./socialAutomation');

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 0) {
      return;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      return;
    }

    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  });
};

const workspaceRoot = path.resolve(__dirname, '..');
loadEnvFile(path.join(workspaceRoot, '.env'));
loadEnvFile(path.join(workspaceRoot, '.env.local'));

const eventsDb = require('./db/adapter');
const pushNotifications = require('./pushNotifications');
const instacartConnect = require('./instacartConnect');
const { createRecitationService } = require('./recitation');
const { createSocialPostingService } = require('./socialPosting');
const { createLedScreenService } = require('./ledScreenService');
const { createWhatsAppWebhookHandler } = require('./whatsappWebhook');
const { createWelcomeJourneyHandler } = require('./welcomeJourneyApi');
const { createWidgetPlacementsHandler, projectPublicWidgetPlacements } = require('./widgetPlacements');
const langarBoardEventClients = new Set();

const API_VERSION = '2026-07-27.phase2';
const API_STARTUP_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const PHASE2_TRANSLITERATION_VARIANTS = {
  gurdwara: ['gurudwara', 'gurdawara'],
  gurudwara: ['gurdwara', 'gurdawara'],
  seva: ['sewa'],
  sewa: ['seva'],
  waheguru: ['vaheguru'],
  vaheguru: ['waheguru'],
  gurbani: ['gurubani'],
  gurubani: ['gurbani'],
  langar: ['lungar'],
  lungar: ['langar'],
  nanakshahi: ['nanak shahi']
};

const buildPhase2SearchVariants = (query) => {
  const trimmed = String(query || '').trim().toLowerCase();
  if (!trimmed) {
    return [];
  }

  const variants = new Set([trimmed]);
  const tokens = trimmed.split(/\s+/).filter(Boolean);

  tokens.forEach((token) => {
    const replacements = PHASE2_TRANSLITERATION_VARIANTS[token] || [];
    replacements.forEach((candidate) => {
      variants.add(tokens.map((part) => (part === token ? candidate : part)).join(' '));
      variants.add(candidate);
    });
  });

  return Array.from(variants).slice(0, 5);
};

const resolveServerPort = () => {
  const preferred = Number(process.env.SERVER_PORT || process.env.STRIPE_API_PORT || process.env.PORT || 4242);
  if (Number.isFinite(preferred) && preferred > 0) {
    return preferred;
  }
  return 4242;
};

const port = resolveServerPort();
const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
const stripePublishableKey = String(process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
const stripeWebhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
const stripeCurrency = String(process.env.STRIPE_CURRENCY || 'cad').toLowerCase();
const zeffyApiKey = String(process.env.ZEFFY_API_KEY || '').trim();
const zeffyWebhookToken = String(process.env.ZEFFY_WEBHOOK_TOKEN || '').trim();
const zeffyCampaignId = Number(process.env.ZEFFY_CAMPAIGN_ID || 0);
const zeffyCampaignName = String(process.env.ZEFFY_CAMPAIGN_NAME || 'Help Us Build Our Gurdwara').trim();
const youtubeApiKey = String(process.env.YOUTUBE_API_KEY || '').trim();
const dataDir = path.resolve(__dirname, 'data');
const buildDir = path.resolve(workspaceRoot, 'build');
const usersPath = path.join(dataDir, 'users.json');
const volunteerReminderLogPath = path.join(dataDir, 'volunteer-reminder-log.json');
const eventReminderLogPath = path.join(dataDir, 'event-reminder-log.json');
const bookingReminderLogPath = path.join(dataDir, 'booking-reminder-log.json');
const configuredUploadsDir = String(process.env.UPLOAD_DIR || '').trim();
if (process.env.NODE_ENV === 'production' && !configuredUploadsDir) {
  throw new Error('UPLOAD_DIR is required in production and must point to persistent storage.');
}
if (configuredUploadsDir && !path.isAbsolute(configuredUploadsDir)) {
  throw new Error('UPLOAD_DIR must be an absolute filesystem path.');
}
const uploadsDir = configuredUploadsDir || path.resolve(__dirname, 'uploads');
const quizBankDir = path.resolve(workspaceRoot, 'public', 'quiz');
const maxUploadBytes = 15 * 1024 * 1024;
const uploadServiceMimePolicies = {
  cms: ['image/*', 'video/*', 'application/pdf'],
  events: ['image/*', 'video/*', 'application/pdf'],
  news: ['image/*', 'video/*', 'application/pdf', 'text/plain'],
  library: ['image/*'],
  sponsors: ['image/*'],
  advertisements: ['image/*'],
  users: ['image/*'],
  'community-notices': ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  default: ['image/*']
};
const maxJsonBodyBytes = 2 * 1024 * 1024;

const resolveLocalWebhookUrl = (value, fallbackPath = '/api/internal/mail-relay') => {
  const normalizedFallbackPath = String(fallbackPath || '/api/internal/mail-relay').trim();
  const trimmed = String(value || '').trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const rawPath = trimmed || normalizedFallbackPath;
  const pathValue = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return `http://127.0.0.1:${port}${pathValue}`;
};

const internalMailRelayUrl = resolveLocalWebhookUrl(
  process.env.INTERNAL_MAIL_RELAY_URL || '/api/internal/mail-relay',
  '/api/internal/mail-relay'
);
const volunteerReminderWebhookUrl = resolveLocalWebhookUrl(
  process.env.VOLUNTEER_REMINDER_WEBHOOK_URL || process.env.REACT_APP_APPROVAL_EMAIL_WEBHOOK_URL || internalMailRelayUrl,
  '/api/internal/mail-relay'
);
const volunteerReminderLogoUrl = String(process.env.VOLUNTEER_REMINDER_LOGO_URL || '').trim();
const volunteerReminderLogoPath = String(process.env.VOLUNTEER_REMINDER_LOGO_PATH || '').trim();
const defaultOrganizationName = String(process.env.ORGANIZATION_NAME || 'Your Gurdwara').trim();
const defaultOrganizationShortName = String(process.env.ORGANIZATION_SHORT_NAME || defaultOrganizationName).trim();
const defaultOrganizationAddress = String(process.env.ORGANIZATION_ADDRESS || '').trim();
const defaultOrganizationPhone = String(process.env.ORGANIZATION_PHONE || '').trim();
const defaultOrganizationEmail = String(process.env.ORGANIZATION_EMAIL || '').trim();
const defaultOrganizationContactLine = [defaultOrganizationAddress, defaultOrganizationPhone, defaultOrganizationEmail].filter(Boolean).join(' | ');
const publicSiteBaseUrl = String(process.env.PUBLIC_SITE_URL || process.env.SITE_BASE_URL || '').trim().replace(/\/$/, '');
const calendarUidDomain = (() => { try { return new URL(publicSiteBaseUrl).hostname; } catch { return 'example.invalid'; } })();
const volunteerReminderSiteName = String(process.env.VOLUNTEER_REMINDER_ORG_NAME || defaultOrganizationName).trim();
const volunteerReminderBaseUrl = String(process.env.VOLUNTEER_REMINDER_BASE_URL || publicSiteBaseUrl || 'http://localhost:3001').trim().replace(/\/$/, '');
const volunteerReminderHtmlTemplateEnabled = String(process.env.VOLUNTEER_REMINDER_HTML_TEMPLATE_ENABLED || 'true').trim().toLowerCase() !== 'false';
const volunteerReminderSendTimeRaw = String(process.env.VOLUNTEER_REMINDER_SEND_TIME || '09:00').trim();
const volunteerReminderTimeZone = String(process.env.VOLUNTEER_REMINDER_TIME_ZONE || 'America/Toronto').trim() || 'America/Toronto';
const volunteerReminderDays = [10, 5, 2, 1];
const eventReminderWebhookUrl = resolveLocalWebhookUrl(
  process.env.EVENT_REMINDER_WEBHOOK_URL || internalMailRelayUrl,
  '/api/internal/mail-relay'
);
const donationInvoiceWebhookUrl = resolveLocalWebhookUrl(
  process.env.DONATION_INVOICE_WEBHOOK_URL || process.env.DONATION_EMAIL_WEBHOOK_URL || internalMailRelayUrl,
  '/api/internal/mail-relay'
);
const eventReminderSendTimeRaw = String(process.env.EVENT_REMINDER_SEND_TIME || volunteerReminderSendTimeRaw || '09:00').trim();
const eventReminderTimeZone = String(process.env.EVENT_REMINDER_TIME_ZONE || volunteerReminderTimeZone || 'America/Toronto').trim() || 'America/Toronto';
const eventReminderDays = String(process.env.EVENT_REMINDER_DAYS || '7,3,1')
  .split(',')
  .map((value) => Number(String(value || '').trim()))
  .filter((value) => Number.isFinite(value) && value >= 0);
const bookingReminderWebhookUrl = resolveLocalWebhookUrl(
  process.env.BOOKING_REMINDER_WEBHOOK_URL || internalMailRelayUrl,
  '/api/internal/mail-relay'
);
const bookingReminderSendTimeRaw = String(process.env.BOOKING_REMINDER_SEND_TIME || eventReminderSendTimeRaw || '09:00').trim();
const bookingReminderTimeZone = String(process.env.BOOKING_REMINDER_TIME_ZONE || eventReminderTimeZone || 'America/Toronto').trim() || 'America/Toronto';
const bookingReminderDays = String(process.env.BOOKING_REMINDER_DAYS || '5,3,2,1')
  .split(',')
  .map((value) => Number(String(value || '').trim()))
  .filter((value) => Number.isFinite(value) && value >= 0);
const membershipReminderWebhookUrl = resolveLocalWebhookUrl(
  process.env.MEMBERSHIP_REMINDER_WEBHOOK_URL || internalMailRelayUrl,
  '/api/internal/mail-relay'
);
const membershipReminderDays = [30, 15, 10, 5, 2];
const localMailFromAddress = String(process.env.LOCAL_MAIL_FROM || 'no-reply@localhost').trim() || 'no-reply@localhost';
const localMailTransport = String(process.env.LOCAL_MAIL_TRANSPORT || 'sendmail').trim().toLowerCase();
const smtpProvider = String(process.env.SMTP_PROVIDER || 'gmail').trim().toLowerCase();
const supportedSmtpProviders = new Set(['gmail', 'smtp2go', 'custom']);
if (!supportedSmtpProviders.has(smtpProvider)) {
  throw new Error(`Unsupported SMTP_PROVIDER "${smtpProvider}". Use "gmail", "smtp2go", or "custom".`);
}
const smtpProviderConfig = smtpProvider === 'smtp2go'
  ? {
    host: String(process.env.SMTP2GO_HOST || 'mail.smtp2go.com').trim(),
    port: Number(process.env.SMTP2GO_PORT || 587),
    secure: String(process.env.SMTP2GO_SECURE || 'false').trim().toLowerCase() === 'true',
    user: String(process.env.SMTP2GO_USER || '').trim(),
    pass: String(process.env.SMTP2GO_PASS || '').trim(),
    from: String(process.env.SMTP2GO_FROM || localMailFromAddress).trim() || localMailFromAddress
  }
  : {
    host: String(process.env.SMTP_HOST || (smtpProvider === 'gmail' ? 'smtp.gmail.com' : '')).trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').trim().toLowerCase() === 'true',
    user: String(process.env.SMTP_USER || '').trim(),
    pass: String(process.env.SMTP_PASS || '').trim(),
    from: String(process.env.SMTP_FROM || localMailFromAddress).trim() || localMailFromAddress
  };
const smtpHost = smtpProviderConfig.host;
const smtpPortRaw = smtpProviderConfig.port;
const smtpSecure = smtpProviderConfig.secure;
const smtpUser = smtpProviderConfig.user;
const smtpPass = smtpProviderConfig.pass;
const smtpFromAddress = smtpProviderConfig.from;
const newsletterPublicBaseUrl = String(process.env.PUBLIC_SITE_URL || process.env.NEWSLETTER_PUBLIC_BASE_URL || volunteerReminderBaseUrl).trim().replace(/\/$/, '');
const newsletterUnsubscribeSecret = String(process.env.NEWSLETTER_UNSUBSCRIBE_SECRET || smtpPass || stripeWebhookSecret || '').trim();
const newsletterSendConcurrency = Math.max(1, Math.min(10, Number(process.env.NEWSLETTER_SEND_CONCURRENCY || 3)));
const contactUsInboxAddress = String(process.env.CONTACT_US_EMAIL || smtpFromAddress || smtpUser || localMailFromAddress).trim();
const socialAutomationEnabled = String(process.env.ENABLE_SOCIAL_AUTOMATION || 'true').trim().toLowerCase() !== 'false';
const socialInstagramService = socialAutomationEnabled && String(process.env.META_PAGE_ACCESS_TOKEN || '').trim() && String(process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '').trim()
  ? new InstagramService({
      pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN,
      instagramBusinessAccountId: process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID,
      logger: console
    })
  : null;
const socialWhatsAppService = socialAutomationEnabled && String(process.env.META_WA_ACCESS_TOKEN || '').trim() && String(process.env.META_WA_PHONE_NUMBER_ID || '').trim()
  ? new WhatsAppService({
      accessToken: process.env.META_WA_ACCESS_TOKEN,
      phoneNumberId: process.env.META_WA_PHONE_NUMBER_ID,
      templateName: process.env.WHATSAPP_TEMPLATE_NAME || 'event_announcement',
      templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
      logger: console
    })
  : null;
const normalizeSocialNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return '';
  }
  return digits.startsWith('00') ? digits.slice(2) : digits;
};
const triggerSocialAutomation = async ({ type, payload = {} }) => {
  if (!socialAutomationEnabled) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const normalizedType = String(type || '').trim();
  if (!normalizedType) {
    return { ok: true, skipped: true, reason: 'missing_type' };
  }

  const results = [];
  const normalizedPayload = payload || {};
  const actionTitle = String(normalizedPayload.title || normalizedPayload.name || 'Community Update').trim();
  const actionSummary = String(normalizedPayload.summary || normalizedPayload.description || normalizedPayload.message || '').trim();
  const actionLink = String(normalizedPayload.link || process.env.APP_URL || '').trim();
  const whatsappNumber = normalizeSocialNumber(normalizedPayload.whatsappNumber || process.env.WHATSAPP_GROUP_NUMBER || '');
  const instagramCaption = buildInstagramCaption({
    title: actionTitle,
    summary: actionSummary,
    type: normalizedType.replace(/\./g, ' ').replace(/\b\w/g, (match) => match.toUpperCase()),
    link: actionLink,
    hashtags: normalizedPayload.hashtags || ['Gurdwara', 'Community', 'Seva']
  });

  if (socialInstagramService) {
    try {
      const instagramResponse = await socialInstagramService.publishPost({
        mediaType: normalizedPayload.mediaType || 'IMAGE',
        imageUrl: normalizedPayload.imageUrl || normalizedPayload.coverImageUrl || normalizedPayload.featuredImageUrl || null,
        videoUrl: normalizedPayload.videoUrl || null,
        caption: instagramCaption
      });
      results.push({ platform: 'instagram', ok: true, data: instagramResponse });
    } catch (error) {
      results.push({ platform: 'instagram', ok: false, error: error?.response?.data || error?.message || String(error) });
    }
  }

  if (socialWhatsAppService && whatsappNumber) {
    try {
      const whatsappParameters = normalizedPayload.whatsappParameters || [
        actionTitle || 'Community Update',
        normalizedPayload.date || normalizedPayload.eventDate || new Date().toLocaleDateString(),
        normalizedPayload.location || normalizedPayload.summary || 'Community',
        actionLink || process.env.APP_URL || 'https://example.com'
      ];
      const templateName = normalizedPayload.templateName || process.env.WHATSAPP_TEMPLATE_NAME || 'event_announcement';
      const whatsappResponse = await socialWhatsAppService.sendTemplateMessage({
        to: whatsappNumber,
        templateName,
        parameters: whatsappParameters
      });
      results.push({ platform: 'whatsapp', ok: true, data: whatsappResponse });
    } catch (error) {
      results.push({ platform: 'whatsapp', ok: false, error: error?.response?.data || error?.message || String(error) });
    }
  }

  return {
    ok: true,
    skipped: !results.length,
    type: normalizedType,
    results
  };
};

// Sends a native-style push notification without ever failing the request that triggered it.
const notifyAppUpdate = ({ title, body, url = '/', tag = 'ssm-update', icon, badge, image, actions, data }) => {
  if (String(tag || '').startsWith('ssm-langar')) {
    langarBoardEventClients.forEach((client) => {
      try {
        client.write(`event: refresh\ndata: {"type":"langar-refresh"}\n\n`);
      } catch {
        langarBoardEventClients.delete(client);
      }
    });
  }
  const uniqueTag = `${String(tag || 'ssm-update').slice(0, 80)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  pushNotifications.broadcastNotification(eventsDb, {
    title,
    body: `${String(body || '').trim()} You are receiving this because you enabled ${defaultOrganizationShortName} app notifications.`,
    url,
    tag: uniqueTag,
    icon,
    badge,
    image,
    actions: actions || [{ action: 'open', title: 'View update' }, { action: 'dismiss', title: 'Dismiss' }],
    data: { ...(data || {}), category: tag }
  }).then((result) => {
    if (result?.error || (Number(result?.total || 0) > 0 && Number(result?.sent || 0) < Number(result.total))) {
      console.warn(`Push notification delivery incomplete (${result?.sent || 0}/${result?.total || 0}) for ${tag}.`);
    }
  }).catch((error) => {
    console.error('Push notification broadcast failed:', error.message || error);
  });
};

let smtpTransport = null;
let volunteerReminderSweepRunning = false;
let volunteerReminderLastRunDateKey = '';
let eventReminderSweepRunning = false;
let eventReminderLastRunDateKey = '';
let bookingReminderSweepRunning = false;
let bookingReminderLastRunDateKey = '';
let membershipReminderSweepRunning = false;
let membershipReminderLastRunDateKey = '';
const darbarSahibStreamSource = String(process.env.DARBAR_SAHIB_STREAM_PROXY_TARGET || 'http://live.sgpc.net:4835/;').trim();
const darbarSahibAacSampleRates = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
const darbarSahibHlsTargetDuration = 2;
const darbarSahibHlsPlaylistSize = 6;
const darbarSahibHlsMaxSegments = 12;
let darbarSahibHlsRequest = null;
let darbarSahibHlsResponse = null;
let darbarSahibHlsReconnectTimer = null;
let darbarSahibHlsBuffer = Buffer.alloc(0);
let darbarSahibHlsFrames = [];
let darbarSahibHlsFrameDuration = 0;
let darbarSahibHlsSequence = 0;
let darbarSahibHlsDecodeTime = 0;
let darbarSahibHlsSegments = [];
const adOrganicViewCooldownMs = Number(process.env.AD_ORGANIC_VIEW_COOLDOWN_MS || (24 * 60 * 60 * 1000));

const resolveClientIp = (request) => {
  const forwarded = String(request.headers['x-forwarded-for'] || '').trim();
  if (forwarded) {
    const parts = forwarded.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length > 0) {
      return parts[0];
    }
  }

  const remote = request.socket?.remoteAddress || request.connection?.remoteAddress || '';
  return String(remote || '').trim();
};

const buildAdViewerHash = (request) => {
  const ip = resolveClientIp(request);
  const ua = String(request.headers['user-agent'] || '').trim();
  const fingerprint = `${ip}|${ua}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex');
};

const parseReminderSendTime = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return { hour: 9, minute: 0 };
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return { hour: 9, minute: 0 };
  }

  return { hour, minute };
};

const volunteerReminderSendTime = parseReminderSendTime(volunteerReminderSendTimeRaw);
const eventReminderSendTime = parseReminderSendTime(eventReminderSendTimeRaw);
const bookingReminderSendTime = parseReminderSendTime(bookingReminderSendTimeRaw);

const getDatePartsInTimeZone = (date = new Date(), timeZone = 'UTC') => {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date);
    const lookup = (type) => parts.find((part) => part.type === type)?.value || '';
    return {
      year: Number(lookup('year')) || date.getUTCFullYear(),
      month: Number(lookup('month')) || (date.getUTCMonth() + 1),
      day: Number(lookup('day')) || date.getUTCDate(),
      hour: Number(lookup('hour')) || 0,
      minute: Number(lookup('minute')) || 0
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes()
    };
  }
};

const toDateKeyFromParts = ({ year, month, day }) => {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const shouldRunVolunteerReminderSweep = (date = new Date()) => {
  const nowParts = getDatePartsInTimeZone(date, volunteerReminderTimeZone);
  const todayDateKey = toDateKeyFromParts(nowParts);
  const nowMinutes = (nowParts.hour * 60) + nowParts.minute;
  const scheduledMinutes = (volunteerReminderSendTime.hour * 60) + volunteerReminderSendTime.minute;

  if (volunteerReminderLastRunDateKey === todayDateKey) {
    return false;
  }

  return nowMinutes >= scheduledMinutes;
};

const runScheduledVolunteerReminderSweep = async () => {
  if (!shouldRunVolunteerReminderSweep()) {
    return null;
  }

  const result = await runVolunteerReminderSweep();
  const nowParts = getDatePartsInTimeZone(new Date(), volunteerReminderTimeZone);
  volunteerReminderLastRunDateKey = toDateKeyFromParts(nowParts);
  return result;
};

const buildLogoDataUri = () => {
  if (!volunteerReminderLogoPath || !fs.existsSync(volunteerReminderLogoPath)) return '';
  const extension = path.extname(volunteerReminderLogoPath).toLowerCase();
  const contentType = extension === '.png' ? 'image/png' : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : extension === '.webp' ? 'image/webp' : '';
  if (!contentType) return '';
  try {
    const binary = fs.readFileSync(volunteerReminderLogoPath);
    if (binary.length) return `data:${contentType};base64,${binary.toString('base64')}`;
  } catch { /* Optional branded logo; omit when unreadable. */ }
  return '';
};

const embeddedVolunteerReminderLogo = buildLogoDataUri();
const emailLogoContentId = 'gurdwara-brand-logo';
const emailLogoSrc = embeddedVolunteerReminderLogo
  ? `cid:${emailLogoContentId}`
  : volunteerReminderLogoUrl;
const buildInlineEmailLogoAttachment = () => {
  const match = embeddedVolunteerReminderLogo.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  const contentType = match[1];
  return {
    filename: contentType === 'image/png' ? 'gurdwara-brand-logo.png' : contentType === 'image/jpeg' ? 'gurdwara-brand-logo.jpg' : 'gurdwara-brand-logo.webp',
    contentType,
    content: match[2],
    encoding: 'base64',
    contentId: emailLogoContentId,
    disposition: 'inline'
  };
};
const withInlineEmailLogo = (payload = {}) => {
  const logoAttachment = buildInlineEmailLogoAttachment();
  const htmlBody = String(payload.html || payload.bodyHtml || payload.content || '').trim();
  if (!logoAttachment || !htmlBody.includes(`cid:${emailLogoContentId}`)) {
    return payload;
  }

  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const hasLogo = attachments.some((entry) => String(entry?.contentId || '').trim() === emailLogoContentId);
  return hasLogo ? payload : { ...payload, attachments: [...attachments, logoAttachment] };
};
const withNormalizedInlineEmailLogo = (htmlBody = '', attachments = []) => {
  const logoAttachment = buildInlineEmailLogoAttachment();
  const normalizedAttachments = Array.isArray(attachments) ? attachments : [];
  if (!logoAttachment || !String(htmlBody || '').includes(`cid:${emailLogoContentId}`)) {
    return normalizedAttachments;
  }

  const hasLogo = normalizedAttachments.some((entry) => String(entry?.contentId || '').trim() === emailLogoContentId);
  return hasLogo ? normalizedAttachments : [...normalizedAttachments, {
    filename: logoAttachment.filename,
    contentType: logoAttachment.contentType,
    contentBase64: logoAttachment.content,
    contentId: logoAttachment.contentId,
    disposition: logoAttachment.disposition
  }];
};
const ADMIN_PAGE_PATHS = [
  '/admin',
  '/admin/cms',
  '/admin/news',
  '/admin/schedule',
  '/admin/hukamnama',
  '/admin/langar',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/library',
  '/admin/videos',
  '/admin/streaming',
  '/admin/advertisements',
  '/admin/sponsors',
  '/admin/events',
  '/admin/booking-duties',
  '/admin/donations',
  '/admin/newsletter',
  '/admin/audit-trail',
  '/admin/users'
];

const MEMBER_ALLOWED_ADMIN_PAGE_PATHS = [
  '/admin',
  '/admin/hukamnama',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/library',
  '/admin/videos',
  '/admin/streaming',
  '/admin/events'
];
const VOLUNTEER_ALLOWED_ADMIN_PAGE_PATHS = [
  '/admin',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/videos',
  '/admin/events'
];

const getDefaultAdminPageAccessForRole = (role) => {
  if (role === 'Super Admin' || role === 'Admin') {
    return [...ADMIN_PAGE_PATHS];
  }

  if (role === 'Member') {
    return [...MEMBER_ALLOWED_ADMIN_PAGE_PATHS];
  }

  if (role === 'Volunteer') {
    return [...VOLUNTEER_ALLOWED_ADMIN_PAGE_PATHS];
  }

  return [];
};

const bootstrapAdminEmail = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
const seedUsers = bootstrapAdminEmail ? [{
  id: 'bootstrap-super-admin',
  name: String(process.env.BOOTSTRAP_ADMIN_NAME || 'Gurdwara Administrator').trim(),
  role: 'Super Admin',
  email: bootstrapAdminEmail,
  phone: '',
  address: '',
  memberType: 'Admin',
  authProvider: 'GOOGLE',
  avatarUrl: '',
  registrationComplete: true,
  approvalStatus: 'approved',
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}] : [];

const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;
const whatsappWebhookHandler = createWhatsAppWebhookHandler({
  verifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '',
  appSecret: process.env.META_APP_SECRET || '',
  onEvent: (event) => console.info('WhatsApp webhook received', {
    object: event?.object || '',
    entryCount: Array.isArray(event?.entry) ? event.entry.length : 0
  })
});

const publicServerErrorMessage = 'An unexpected error occurred. Please try again later.';

const looksLikeInternalErrorMessage = (value) => {
  const text = String(value || '');
  return /\/Users\/|\/var\/|node_modules|\.js:\d+|\.ts:\d+|stack trace|syntax error|invalid input syntax|SQLSTATE|PostgreSQL|Prisma|Sequelize|ENOENT|EACCES|ECONN|relation .* does not exist|permission denied/i.test(text);
};

const sanitizeResponseMessage = (statusCode, message) => {
  const normalizedMessage = String(message || '').trim();
  if (!normalizedMessage) {
    return statusCode >= 500 ? publicServerErrorMessage : '';
  }

  if (statusCode >= 500 && looksLikeInternalErrorMessage(normalizedMessage)) {
    return publicServerErrorMessage;
  }

  return normalizedMessage;
};

const sendJson = (response, statusCode, payload) => {
  const nextPayload = payload && typeof payload === 'object' ? { ...payload } : payload;
  if (nextPayload && typeof nextPayload === 'object' && 'message' in nextPayload) {
    nextPayload.message = sanitizeResponseMessage(statusCode, nextPayload.message);
  }

  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature, X-Zeffy-Webhook-Token, X-API-Key, Authorization, X-Actor-Email, X-Actor-Role, X-Actor-Name',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
  });
  response.end(JSON.stringify(nextPayload));
};

const logServerError = (error, context) => {
  console.error(`[${context}]`, {
    message: error?.message || 'Unknown error',
    stack: error?.stack || '',
    name: error?.name || 'Error',
    status: error?.status || null,
    statusCode: error?.statusCode || null,
    code: error?.code || null,
    cause: error?.cause || null
  });
};

const extractGoogleImageResults = (html = '', limit = 10) => {
  const unescapeUrl = (value) => value.replace(/\\u003d/gi, '=').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
  const isImageUrl = (value) => {
    try {
      const parsed = new URL(unescapeUrl(value));
      if (!/^https?:$/.test(parsed.protocol) || /(^|\.)google\./i.test(parsed.hostname) || /encrypted-tbn/i.test(parsed.hostname)) return false;
      return /\.(?:jpg|jpeg|png|webp|gif)(?:$|[?#])/i.test(parsed.pathname + parsed.search) || /[?&](?:imgurl|image|w)=/i.test(parsed.search);
    } catch {
      return false;
    }
  };
  const candidates = [];
  const source = String(html || '');
  const addCandidates = (pattern) => {
    for (const match of source.matchAll(pattern)) {
      const candidate = unescapeUrl(match[1]);
      if (isImageUrl(candidate) && !candidates.includes(candidate)) candidates.push(candidate);
    }
  };

  addCandidates(/"ou":"(https?:\\?\/\\?\/[^"\\]+?)"/gi);
  addCandidates(/\["(https?:\\?\/\\?\/[^"\\]+?)",\d+,\d+\]/gi);
  addCandidates(/(https?:\\?\/\\?\/[^"'\s\\]+?(?:\.(?:jpg|jpeg|png|webp|gif)(?:[?#][^"'\s\\]*)?))/gi);
  return candidates.slice(0, limit);
};

const fetchDuckDuckGoImages = async (query, limit = 10) => {
  const headers = { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US,en;q=0.9' };
  const landingUrl = new URL('https://duckduckgo.com/');
  landingUrl.searchParams.set('q', query);
  landingUrl.searchParams.set('iax', 'images');
  landingUrl.searchParams.set('ia', 'images');
  const landingResponse = await fetch(landingUrl, { headers });
  if (!landingResponse.ok) return [];
  const landingHtml = await landingResponse.text();
  const token = landingHtml.match(/vqd="([^"]+)"/)?.[1] || '';
  if (!token) return [];

  const imageUrl = new URL('https://duckduckgo.com/i.js');
  imageUrl.searchParams.set('l', 'us-en');
  imageUrl.searchParams.set('o', 'json');
  imageUrl.searchParams.set('q', query);
  imageUrl.searchParams.set('vqd', token);
  imageUrl.searchParams.set('f', ',,,,,');
  imageUrl.searchParams.set('p', '1');
  imageUrl.searchParams.set('s', '0');
  const imageResponse = await fetch(imageUrl, { headers: { ...headers, Referer: landingUrl.toString() } });
  if (!imageResponse.ok) return [];
  const imageData = await imageResponse.json();
  return (imageData?.results || [])
    .map((result) => String(result?.image || '').trim())
    .filter((image) => image && !/(^|:\/\/)(?:[^/]+\.)?google\./i.test(image))
    .slice(0, limit);
};

const readBody = async (request) => {
  if (request.__cachedBodyBuffer) {
    return request.__cachedBodyBuffer;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  request.__cachedBodyBuffer = Buffer.concat(chunks);
  return request.__cachedBodyBuffer;
};

class InputValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'InputValidationError';
    this.status = status;
  }
}

const throwInputError = (message, status = 400) => {
  throw new InputValidationError(message, status);
};

const isPlainObject = (value) => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
};

const assertInput = (condition, message, status = 400) => {
  if (!condition) {
    throwInputError(message, status);
  }
};

const parseJsonObjectBody = async (request, options = {}) => {
  const maxBytes = Number.isFinite(Number(options.maxBytes)) ? Number(options.maxBytes) : maxJsonBodyBytes;
  const allowEmpty = options.allowEmpty !== false;
  const buffer = await readBody(request);

  if (buffer.length > maxBytes) {
    throwInputError('Request body too large.', 413);
  }

  const raw = buffer.toString('utf8').trim();
  if (!raw) {
    return allowEmpty ? {} : throwInputError('Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throwInputError('Invalid JSON payload.');
  }

  assertInput(isPlainObject(parsed), 'Request body must be a JSON object.');
  return parsed;
};

const isLoopbackAddress = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1') {
    return true;
  }
  return normalized.startsWith('::ffff:127.');
};

const sanitizeHeaderValue = (value = '') => {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
};

const decodeDataUrlBase64 = (value = '') => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  const match = text.match(/^data:[^;]+;base64,(.+)$/i);
  if (!match) {
    return '';
  }
  return String(match[1] || '').trim();
};

const encodeMimeBase64 = (value = '') => {
  const content = Buffer.from(String(value || ''), 'utf8').toString('base64');
  return content.replace(/(.{76})/g, '$1\r\n');
};

const normalizeRecipientList = (payload = {}) => {
  const list = [];

  const pushIfEmail = (candidate) => {
    const email = String(candidate || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return;
    }
    if (!list.includes(email)) {
      list.push(email);
    }
  };

  const toField = String(payload.to || payload.email || payload.primaryRecipient || '').trim();
  if (toField) {
    toField.split(',').forEach((entry) => pushIfEmail(entry));
  }

  const toList = Array.isArray(payload.toList) ? payload.toList : [];
  toList.forEach((entry) => pushIfEmail(entry));

  const recipientEmails = Array.isArray(payload.recipientEmails) ? payload.recipientEmails : [];
  recipientEmails.forEach((entry) => pushIfEmail(entry));

  const recipients = Array.isArray(payload.recipients) ? payload.recipients : [];
  recipients.forEach((entry) => pushIfEmail(entry));

  return list;
};

const normalizeBccRecipientList = (payload = {}) => {
  const list = [];

  const pushIfEmail = (candidate) => {
    const email = String(candidate || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return;
    }
    if (!list.includes(email)) {
      list.push(email);
    }
  };

  const bccField = String(payload.bcc || '').trim();
  if (bccField) {
    bccField.split(',').forEach((entry) => pushIfEmail(entry));
  }

  const bccList = Array.isArray(payload.bccList) ? payload.bccList : [];
  bccList.forEach((entry) => pushIfEmail(entry));

  const bccRecipients = Array.isArray(payload.bccRecipients) ? payload.bccRecipients : [];
  bccRecipients.forEach((entry) => pushIfEmail(entry));

  return list;
};

const normalizeAttachmentList = (payload = {}) => {
  const attachments = [];
  const raw = Array.isArray(payload.attachments) ? payload.attachments : [];

  raw.forEach((entry, index) => {
    const fileName = sanitizeHeaderValue(entry?.filename || `attachment-${index + 1}.bin`) || `attachment-${index + 1}.bin`;
    const contentType = sanitizeHeaderValue(entry?.contentType || 'application/octet-stream') || 'application/octet-stream';
    const directBase64 = String(entry?.content || '').trim();
    const dataUrlBase64 = decodeDataUrlBase64(entry?.dataUrl || entry?.url || '');
    const base64 = directBase64 || dataUrlBase64;
    if (!base64) {
      return;
    }
    attachments.push({
      filename: fileName,
      contentType,
      contentBase64: base64.replace(/\s+/g, ''),
      contentId: sanitizeHeaderValue(entry?.contentId || ''),
      disposition: String(entry?.disposition || '').trim().toLowerCase() === 'inline' || entry?.inline === true ? 'inline' : 'attachment'
    });
  });

  const invoiceName = sanitizeHeaderValue(payload.invoicePdfFileName || 'invoice.pdf') || 'invoice.pdf';
  const invoiceData = decodeDataUrlBase64(payload.invoicePdfDataUrl || '');
  if (invoiceData) {
    const exists = attachments.some((entry) => String(entry.filename || '').toLowerCase() === String(invoiceName || '').toLowerCase());
    if (!exists) {
      attachments.push({
        filename: invoiceName,
        contentType: 'application/pdf',
        contentBase64: invoiceData.replace(/\s+/g, '')
      });
    }
  }

  return attachments;
};

const buildMimeEmail = ({ from, toList, bccList = [], subject, textBody, htmlBody, attachments = [] }) => {
  const safeFrom = sanitizeHeaderValue(from || localMailFromAddress) || localMailFromAddress;
  const safeSubject = sanitizeHeaderValue(subject || 'Notification');
  const safeTo = toList.map((entry) => sanitizeHeaderValue(entry)).filter(Boolean).join(', ') || 'undisclosed-recipients:;';
  const safeBcc = bccList.map((entry) => sanitizeHeaderValue(entry)).filter(Boolean).join(', ');
  const plainText = String(textBody || '').trim() || `Notification from ${defaultOrganizationName}.`;
  const html = String(htmlBody || '').trim();

  const headers = [
    `From: ${safeFrom}`,
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0'
  ];

  if (safeBcc) {
    headers.push(`Bcc: ${safeBcc}`);
  }

  const altBoundary = `alt_${crypto.randomBytes(8).toString('hex')}`;
  const mixBoundary = `mix_${crypto.randomBytes(8).toString('hex')}`;

  const plainPart = [
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBase64(plainText)
  ].join('\r\n');

  const htmlPart = html
    ? [
      `--${altBoundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      encodeMimeBase64(html)
    ].join('\r\n')
    : '';

  const alternativeBody = [
    plainPart,
    htmlPart,
    `--${altBoundary}--`
  ].filter(Boolean).join('\r\n');

  if (attachments.length === 0) {
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
    return `${headers.join('\r\n')}\r\n\r\n${alternativeBody}\r\n`;
  }

  headers.push(`Content-Type: multipart/mixed; boundary="${mixBoundary}"`);

  const attachmentParts = attachments.map((entry) => {
    const safeName = sanitizeHeaderValue(entry.filename || 'attachment.bin') || 'attachment.bin';
    const safeType = sanitizeHeaderValue(entry.contentType || 'application/octet-stream') || 'application/octet-stream';
    const safeContentId = sanitizeHeaderValue(entry.contentId || '');
    const safeDisposition = String(entry.disposition || '').trim().toLowerCase() === 'inline' ? 'inline' : 'attachment';
    const encoded = String(entry.contentBase64 || '').replace(/\s+/g, '').replace(/(.{76})/g, '$1\r\n');
    return [
      `--${mixBoundary}`,
      `Content-Type: ${safeType}; name="${safeName}"`,
      `Content-Disposition: ${safeDisposition}; filename="${safeName}"`,
      ...(safeContentId ? [`Content-ID: <${safeContentId}>`] : []),
      'Content-Transfer-Encoding: base64',
      '',
      encoded
    ].join('\r\n');
  });

  const message = [
    headers.join('\r\n'),
    '',
    `--${mixBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    alternativeBody,
    ...attachmentParts,
    `--${mixBoundary}--`,
    ''
  ].join('\r\n');

  return message;
};

const extractEmailAddress = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const angleMatch = raw.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    return String(angleMatch[1]).trim().toLowerCase();
  }

  return raw.toLowerCase();
};

const sendViaLocalSendmail = async ({ from, toList, bccList, subject, textBody, htmlBody, attachments }) => {
  const message = buildMimeEmail({ from, toList, bccList, subject, textBody, htmlBody, attachments });
  const envelopeFromCandidate = extractEmailAddress(from);
  const envelopeFrom = isValidEmailAddress(envelopeFromCandidate)
    ? envelopeFromCandidate
    : localMailFromAddress;

  await new Promise((resolve, reject) => {
    const child = spawn('/usr/sbin/sendmail', ['-t', '-oi', '-f', envelopeFrom]);
    let stderr = '';

    child.on('error', (error) => reject(error));
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const relayError = stderr.trim() || `sendmail exited with code ${code}`;
      reject(new Error(`${relayError} (envelope-from=${envelopeFrom})`));
    });

    child.stdin.write(message, 'utf8');
    child.stdin.end();
  });

  return {
    provider: 'local-sendmail',
    envelopeFrom,
    fromHeader: from
  };
};

const sendViaSmtp = async ({ from, toList, bccList, subject, textBody, htmlBody, attachments }) => {
  if (!smtpHost) {
    throw new Error(`SMTP host is required for SMTP_PROVIDER=${smtpProvider}.`);
  }
  if (smtpProvider !== 'custom' && (!smtpUser || !smtpPass)) {
    const credentialPrefix = smtpProvider === 'smtp2go' ? 'SMTP2GO' : 'SMTP';
    throw new Error(`${credentialPrefix}_USER and ${credentialPrefix}_PASS are required for SMTP delivery.`);
  }
  if (smtpProvider === 'custom' && Boolean(smtpUser) !== Boolean(smtpPass)) {
    throw new Error('SMTP_USER and SMTP_PASS must both be set when custom SMTP authentication is enabled.');
  }

  const smtpPort = Number.isFinite(smtpPortRaw) && smtpPortRaw > 0 ? smtpPortRaw : 587;
  const authEnabled = Boolean(smtpUser && smtpPass);

  let nodemailer = null;
  try {
    // Lazy load so sendmail-only deployments do not require nodemailer.
    nodemailer = require('nodemailer');
  } catch {
    throw new Error('nodemailer is not installed. Run: npm install nodemailer');
  }

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      pool: true,
      maxConnections: newsletterSendConcurrency,
      maxMessages: 100,
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(authEnabled ? { auth: { user: smtpUser, pass: smtpPass } } : {})
    });
  }

  const normalizedAttachments = Array.isArray(attachments)
    ? attachments.map((entry) => ({
      filename: String(entry?.filename || 'attachment.bin').trim() || 'attachment.bin',
      contentType: String(entry?.contentType || 'application/octet-stream').trim() || 'application/octet-stream',
      content: Buffer.from(String(entry?.contentBase64 || '').replace(/\s+/g, ''), 'base64'),
      cid: String(entry?.contentId || '').trim() || undefined,
      contentDisposition: String(entry?.disposition || '').trim().toLowerCase() === 'inline' ? 'inline' : 'attachment'
    }))
    : [];

  // Use a mailbox authenticated with SMTP to avoid provider-side silent drops.
  const fromHeader = smtpFromAddress;
  const replyToCandidate = extractEmailAddress(from);
  const replyToHeader = isValidEmailAddress(replyToCandidate) ? replyToCandidate : undefined;
  const smtpInfo = await smtpTransport.sendMail({
    from: fromHeader,
    replyTo: replyToHeader,
    to: Array.isArray(toList) && toList.length > 0 ? toList : undefined,
    bcc: Array.isArray(bccList) && bccList.length > 0 ? bccList : undefined,
    subject,
    text: textBody || undefined,
    html: htmlBody || undefined,
    attachments: normalizedAttachments
  });

  const acceptedRecipients = Array.isArray(smtpInfo?.accepted)
    ? smtpInfo.accepted.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean)
    : [];
  if (acceptedRecipients.length === 0) {
    const rejectedRecipients = Array.isArray(smtpInfo?.rejected)
      ? smtpInfo.rejected.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean)
      : [];
    throw new Error(`SMTP did not accept any recipients. Rejected: ${rejectedRecipients.join(', ') || 'unknown'}`);
  }

  return {
    provider: `smtp-${smtpProvider}`,
    envelopeFrom: smtpFromAddress,
    fromHeader,
    messageId: String(smtpInfo?.messageId || '').trim(),
    accepted: acceptedRecipients,
    rejected: Array.isArray(smtpInfo?.rejected)
      ? smtpInfo.rejected.filter(Boolean).map((entry) => String(entry).trim()).filter(Boolean)
      : []
  };
};

const sendViaConfiguredMailTransport = async ({ from, toList, bccList = [], subject, textBody, htmlBody, attachments }) => {
  const deliveryAttachments = withNormalizedInlineEmailLogo(htmlBody, attachments);
  if (localMailTransport === 'smtp') {
    return sendViaSmtp({ from, toList, bccList, subject, textBody, htmlBody, attachments: deliveryAttachments });
  }

  return sendViaLocalSendmail({ from, toList, bccList, subject, textBody, htmlBody, attachments: deliveryAttachments });
};

const isInternalMailRelayTarget = (value = '') => {
  try {
    const target = new URL(String(value || '').trim());
    const hostname = target.hostname.replace(/^\[|\]$/g, '');
    return isLoopbackAddress(hostname) && target.pathname === '/api/internal/mail-relay';
  } catch {
    return false;
  }
};

const deliverWorkflowEmail = async (webhookUrl, payload = {}) => {
  const deliveryPayload = withInlineEmailLogo(payload);
  if (!isInternalMailRelayTarget(webhookUrl)) {
    return fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deliveryPayload)
    });
  }

  const recipients = normalizeRecipientList(deliveryPayload);
  const bccRecipients = normalizeBccRecipientList(deliveryPayload);
  if (recipients.length === 0 && bccRecipients.length === 0) {
    throwInputError('Recipient address required.');
  }

  const subject = sanitizeHeaderValue(deliveryPayload.subject || deliveryPayload.title || `${defaultOrganizationShortName} Notification`)
    || `${defaultOrganizationShortName} Notification`;
  const htmlBody = String(deliveryPayload.html || deliveryPayload.bodyHtml || deliveryPayload.content || deliveryPayload.message || '').trim();
  const textBody = String(deliveryPayload.text || deliveryPayload.bodyText || deliveryPayload.message || '').trim();
  const attachments = normalizeAttachmentList(deliveryPayload);

  await sendViaConfiguredMailTransport({
    from: localMailFromAddress,
    toList: recipients,
    bccList: bccRecipients,
    subject,
    textBody,
    htmlBody,
    attachments
  });

  return {
    ok: true,
    status: 200,
    text: async () => ''
  };
};

const createNewsletterUnsubscribeToken = (subscriber = {}) => {
  if (!newsletterUnsubscribeSecret) {
    throw new Error('NEWSLETTER_UNSUBSCRIBE_SECRET is required for newsletter delivery.');
  }
  const payload = Buffer.from(JSON.stringify({
    id: String(subscriber.id || '').trim(),
    email: String(subscriber.email || '').trim().toLowerCase()
  }), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', newsletterUnsubscribeSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const parseNewsletterUnsubscribeToken = (token = '') => {
  if (!newsletterUnsubscribeSecret) {
    throw new Error('Newsletter unsubscribe is not configured.');
  }
  const [payload, signature] = String(token || '').trim().split('.');
  if (!payload || !signature) {
    throw new Error('Invalid unsubscribe link.');
  }
  const expected = crypto.createHmac('sha256', newsletterUnsubscribeSecret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    throw new Error('Invalid unsubscribe link.');
  }
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  const id = String(decoded?.id || '').trim();
  const email = String(decoded?.email || '').trim().toLowerCase();
  if (!id || !isValidEmailAddress(email)) {
    throw new Error('Invalid unsubscribe link.');
  }
  return { id, email };
};

const appendNewsletterUnsubscribe = ({ htmlBody = '', textBody = '', unsubscribeUrl = '' }) => ({
  htmlBody: `${String(htmlBody || '')}<div style="max-width:760px;margin:0 auto;padding:16px 24px 28px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#64748b;">You are receiving this email because you subscribed to ${escapeHtml(defaultOrganizationShortName)} updates.<br/><a href="${escapeHtml(unsubscribeUrl)}" style="color:#0b67c2;text-decoration:underline;">Unsubscribe from this newsletter</a></div>`,
  textBody: `${String(textBody || '').trim()}\n\nYou are receiving this email because you subscribed to ${defaultOrganizationShortName} updates.\nUnsubscribe: ${unsubscribeUrl}`.trim()
});

const sendNewsletterPrivately = async ({ relayPayload, recipients, subject, htmlBody, textBody, attachments }) => {
  const subscribers = await eventsDb.listItems('subscribers');
  const byEmail = new Map((Array.isArray(subscribers) ? subscribers : [])
    .filter((entry) => entry?.active !== false && isValidEmailAddress(entry?.email))
    .map((entry) => [String(entry.email).trim().toLowerCase(), entry]));
  const deliveries = recipients.map((email) => ({ email, subscriber: byEmail.get(email) })).filter((entry) => entry.subscriber);
  if (deliveries.length === 0) {
    throw new Error('No active newsletter subscribers matched the recipient list.');
  }

  let nextIndex = 0;
  const results = [];
  const worker = async () => {
    while (nextIndex < deliveries.length) {
      const current = deliveries[nextIndex];
      nextIndex += 1;
      const token = createNewsletterUnsubscribeToken(current.subscriber);
      const unsubscribeUrl = `${newsletterPublicBaseUrl}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
      const personalized = appendNewsletterUnsubscribe({ htmlBody, textBody, unsubscribeUrl });
      try {
        const delivery = await sendViaConfiguredMailTransport({
          from: localMailFromAddress,
          toList: [],
          bccList: [current.email],
          subject,
          textBody: personalized.textBody,
          htmlBody: personalized.htmlBody,
          attachments
        });
        results.push({ email: current.email, sent: true, provider: delivery?.provider || localMailTransport });
      } catch (error) {
        results.push({ email: current.email, sent: false, error: error?.message || 'Delivery failed.' });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(newsletterSendConcurrency, deliveries.length) }, () => worker()));
  const failed = results.filter((entry) => !entry.sent);
  if (failed.length > 0) {
    throw new Error(`Newsletter delivery failed for ${failed.length} of ${results.length} recipients.`);
  }
  return {
    provider: results[0]?.provider || localMailTransport,
    accepted: results.map((entry) => entry.email),
    newsletterRecipients: results.length,
    campaignId: relayPayload.campaignId
  };
};

const ensureNoUnknownKeys = (payload, allowedKeys, label = 'body') => {
  const keySet = new Set(allowedKeys);
  Object.keys(payload || {}).forEach((key) => {
    if (!keySet.has(key)) {
      throwInputError(`${label}.${key} is not allowed.`);
    }
  });
};

const readStringField = (payload, key, options = {}) => {
  const value = payload?.[key];
  const required = options.required === true;
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 0;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 10000;
  const pattern = options.pattern instanceof RegExp ? options.pattern : null;
  const trim = options.trim !== false;

  if (value == null || value === '') {
    if (required) {
      throwInputError(`${key} is required.`);
    }
    return '';
  }

  assertInput(typeof value === 'string', `${key} must be a string.`);
  const normalized = trim ? value.trim() : value;
  assertInput(normalized.length >= min, `${key} must be at least ${min} characters.`);
  assertInput(normalized.length <= max, `${key} must be at most ${max} characters.`);
  if (pattern) {
    assertInput(pattern.test(normalized), `${key} has an invalid format.`);
  }
  return options.toLowerCase === true ? normalized.toLowerCase() : normalized;
};

const readPhoneField = (payload, key, options = {}) => {
  const value = readStringField(payload, key, { required: options.required === true, max: 40 });
  if (!value) {
    return '';
  }

  // Strip optional +1 country code prefix before validating
  const stripped = value.replace(/^\+?1[\s-]?/, '');
  assertInput(/^[0-9()\-\s]+$/.test(stripped), `${key} may contain numbers only.`);
  const digits = stripped.replace(/\D/g, '');
  assertInput(digits.length === 10, `${key} must contain exactly 10 numbers in the format (905)-123-4567.`);
  const normalized = `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
  payload[key] = normalized;
  return normalized;
};

const readNumberField = (payload, key, options = {}) => {
  const value = payload?.[key];
  const required = options.required === true;
  if (value == null || value === '') {
    if (required) {
      throwInputError(`${key} is required.`);
    }
    return null;
  }

  assertInput(typeof value === 'number' && Number.isFinite(value), `${key} must be a finite number.`);
  if (options.integer === true) {
    assertInput(Number.isInteger(value), `${key} must be an integer.`);
  }
  if (Number.isFinite(Number(options.min))) {
    assertInput(value >= Number(options.min), `${key} must be >= ${Number(options.min)}.`);
  }
  if (Number.isFinite(Number(options.max))) {
    assertInput(value <= Number(options.max), `${key} must be <= ${Number(options.max)}.`);
  }
  return value;
};

const readBooleanField = (payload, key, options = {}) => {
  const value = payload?.[key];
  const required = options.required === true;
  if (value == null) {
    if (required) {
      throwInputError(`${key} is required.`);
    }
    return null;
  }

  assertInput(typeof value === 'boolean', `${key} must be a boolean.`);
  return value;
};

const readObjectField = (payload, key, options = {}) => {
  const value = payload?.[key];
  const required = options.required === true;
  if (value == null) {
    if (required) {
      throwInputError(`${key} is required.`);
    }
    return null;
  }

  assertInput(isPlainObject(value), `${key} must be an object.`);
  return value;
};

const readArrayField = (payload, key, options = {}) => {
  const value = payload?.[key];
  const required = options.required === true;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 1000;
  if (value == null) {
    if (required) {
      throwInputError(`${key} is required.`);
    }
    return null;
  }

  assertInput(Array.isArray(value), `${key} must be an array.`);
  assertInput(value.length <= max, `${key} must contain at most ${max} items.`);
  return value;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const simpleIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const mimeTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,79}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,79}$/i;

const readEmailField = (payload, key, options = {}) => {
  const value = readStringField(payload, key, {
    required: options.required === true,
    min: 3,
    max: 254,
    toLowerCase: true
  });
  if (!value) {
    return '';
  }
  assertInput(emailPattern.test(value), `${key} must be a valid email.`);
  return value;
};

const parseNumericPathId = (rawValue, fieldName) => {
  const value = String(rawValue || '').trim();
  assertInput(/^\d{1,12}$/.test(value), `${fieldName} must be a numeric id.`);
  return Number(value);
};

const parseStringPathId = (rawValue, fieldName) => {
  const value = String(rawValue || '').trim();
  assertInput(simpleIdPattern.test(value), `${fieldName} has an invalid format.`);
  return value;
};

const validateGenericJsonValue = (value, fieldPath = 'body', depth = 0) => {
  assertInput(depth <= 8, `${fieldPath} is nested too deeply.`);

  if (value == null) {
    return;
  }

  const valueType = typeof value;
  if (valueType === 'string') {
    assertInput(value.length <= 10000, `${fieldPath} is too long.`);
    return;
  }

  if (valueType === 'number') {
    assertInput(Number.isFinite(value), `${fieldPath} must be a finite number.`);
    return;
  }

  if (valueType === 'boolean') {
    return;
  }

  if (Array.isArray(value)) {
    assertInput(value.length <= 1500, `${fieldPath} has too many items.`);
    value.forEach((entry, index) => validateGenericJsonValue(entry, `${fieldPath}[${index}]`, depth + 1));
    return;
  }

  assertInput(isPlainObject(value), `${fieldPath} must be an object.`);
  const keys = Object.keys(value);
  assertInput(keys.length <= 200, `${fieldPath} contains too many properties.`);
  keys.forEach((key) => {
    assertInput(key.length > 0 && key.length <= 80, `${fieldPath}.${key} has an invalid key length.`);
    assertInput(key !== '__proto__' && key !== 'constructor' && key !== 'prototype', `${fieldPath}.${key} is not allowed.`);
    validateGenericJsonValue(value[key], `${fieldPath}.${key}`, depth + 1);
  });
};

const parseAndValidateGenericObjectBody = async (request, options = {}) => {
  const body = await parseJsonObjectBody(request, options);
  validateGenericJsonValue(body, 'body');
  return body;
};

const parseAndValidateGenericStructuredBody = async (request, options = {}) => {
  const maxBytes = Number.isFinite(Number(options.maxBytes)) ? Number(options.maxBytes) : maxJsonBodyBytes;
  const buffer = await readBody(request);
  if (buffer.length > maxBytes) {
    throwInputError('Request body too large.', 413);
  }

  const raw = buffer.toString('utf8').trim();
  if (!raw) {
    throwInputError('Request body is required.');
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throwInputError('Invalid JSON payload.');
  }

  assertInput(Array.isArray(body) || isPlainObject(body), 'Request body must be a JSON object or array.');
  validateGenericJsonValue(body, 'body');
  return body;
};

const parsePositiveIntEnv = (envName, fallback) => {
  const parsed = Number(process.env[envName]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const parseBooleanEnv = (envName, fallback = false) => {
  const raw = String(process.env[envName] || '').trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const parseCsvEnv = (envName, fallback = []) => {
  const raw = String(process.env[envName] || '').trim();
  if (!raw) {
    return fallback;
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
};

const rateLimitConfig = {
  enabled: parseBooleanEnv('RATE_LIMIT_ENABLED', true),
  publicWindowMs: parsePositiveIntEnv('RATE_LIMIT_PUBLIC_WINDOW_MS', 60 * 1000),
  publicMaxRequests: parsePositiveIntEnv('RATE_LIMIT_PUBLIC_MAX_REQUESTS', 180),
  authenticatedWindowMs: parsePositiveIntEnv('RATE_LIMIT_AUTHENTICATED_WINDOW_MS', 60 * 1000),
  authenticatedMaxRequests: parsePositiveIntEnv('RATE_LIMIT_AUTHENTICATED_MAX_REQUESTS', 600),
  authIpWindowMs: parsePositiveIntEnv('RATE_LIMIT_AUTH_IP_WINDOW_MS', 60 * 1000),
  authIpMaxAttempts: parsePositiveIntEnv('RATE_LIMIT_AUTH_IP_MAX_ATTEMPTS', 12),
  authAccountWindowMs: parsePositiveIntEnv('RATE_LIMIT_AUTH_ACCOUNT_WINDOW_MS', 5 * 60 * 1000),
  authAccountMaxAttempts: parsePositiveIntEnv('RATE_LIMIT_AUTH_ACCOUNT_MAX_ATTEMPTS', 6),
  authBackoffBaseMs: parsePositiveIntEnv('RATE_LIMIT_AUTH_BACKOFF_BASE_MS', 1000),
  authBackoffMaxMs: parsePositiveIntEnv('RATE_LIMIT_AUTH_BACKOFF_MAX_MS', 30 * 60 * 1000),
  gurmatAiWindowMs: parsePositiveIntEnv('RATE_LIMIT_GURMAT_AI_WINDOW_MS', 60 * 60 * 1000),
  gurmatAiMaxRequests: parsePositiveIntEnv('RATE_LIMIT_GURMAT_AI_MAX_REQUESTS', 10),
  cleanupIntervalMs: parsePositiveIntEnv('RATE_LIMIT_CLEANUP_INTERVAL_MS', 5 * 60 * 1000),
  authRouteRules: parseCsvEnv('RATE_LIMIT_AUTH_ROUTE_RULES', [
    'POST:/api/auth/*',
    'POST:/api/users/upsert-by-email',
    'POST:/api/users/complete-registration',
    'POST:/api/users',
    'POST:/api/users/by-email',
    'PATCH:/api/users/*/approval'
  ])
};

const fixedWindowRateState = new Map();
const authIpRateState = new Map();
const authAccountRateState = new Map();

const isRouteMatch = (rule, method, pathname) => {
  const normalizedRule = String(rule || '').trim();
  if (!normalizedRule) {
    return false;
  }

  const dividerIndex = normalizedRule.indexOf(':');
  if (dividerIndex < 0) {
    return false;
  }

  const ruleMethod = normalizedRule.slice(0, dividerIndex).trim().toUpperCase() || '*';
  const rulePath = normalizedRule.slice(dividerIndex + 1).trim();
  if (!rulePath) {
    return false;
  }

  if (ruleMethod !== '*' && ruleMethod !== String(method || '').toUpperCase()) {
    return false;
  }

  if (rulePath.endsWith('*')) {
    const prefix = rulePath.slice(0, -1);
    return pathname.startsWith(prefix);
  }

  return pathname === rulePath;
};

const isAuthRateLimitedRoute = (method, pathname) => {
  return rateLimitConfig.authRouteRules.some((rule) => isRouteMatch(rule, method, pathname));
};

const getCachedJsonBody = async (request) => {
  if (request.__cachedJsonBody !== undefined) {
    return request.__cachedJsonBody;
  }

  try {
    const raw = (await readBody(request)).toString('utf8').trim();
    request.__cachedJsonBody = raw ? JSON.parse(raw) : {};
  } catch {
    request.__cachedJsonBody = {};
  }

  return request.__cachedJsonBody;
};

const extractAccountIdentifier = async (request, requestUrl) => {
  const body = await getCachedJsonBody(request);
  const queryEmail = String(requestUrl?.searchParams?.get('email') || '').trim().toLowerCase();
  const headerEmail = String(request.headers['x-actor-email'] || '').trim().toLowerCase();
  const candidates = [
    body?.email,
    body?.donorEmail,
    body?.username,
    body?.userName,
    body?.actorEmail,
    body?.contact,
    queryEmail,
    headerEmail
  ]
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

  return candidates[0] || 'anonymous-account';
};

const evaluateFixedWindowLimit = (stateMap, key, maxRequests, windowMs, now) => {
  const current = stateMap.get(key);
  if (!current || current.resetAt <= now) {
    stateMap.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return { limited: false, retryAfterMs: 0 };
  }

  if (current.count < maxRequests) {
    current.count += 1;
    stateMap.set(key, current);
    return { limited: false, retryAfterMs: 0 };
  }

  return {
    limited: true,
    retryAfterMs: Math.max(1, current.resetAt - now)
  };
};

const evaluateAuthBackoffLimit = (stateMap, key, maxAttempts, windowMs, backoffBaseMs, backoffMaxMs, now) => {
  const current = stateMap.get(key) || {
    count: 0,
    windowStart: now,
    blockedUntil: 0
  };

  if (current.blockedUntil > now) {
    return {
      limited: true,
      retryAfterMs: current.blockedUntil - now
    };
  }

  if ((now - current.windowStart) >= windowMs) {
    current.count = 0;
    current.windowStart = now;
    current.blockedUntil = 0;
  }

  current.count += 1;
  if (current.count <= maxAttempts) {
    stateMap.set(key, current);
    return { limited: false, retryAfterMs: 0 };
  }

  const overflow = current.count - maxAttempts;
  const backoffMs = Math.min(backoffMaxMs, backoffBaseMs * (2 ** Math.max(0, overflow - 1)));
  current.blockedUntil = now + backoffMs;
  stateMap.set(key, current);

  return {
    limited: true,
    retryAfterMs: backoffMs
  };
};

const sendRateLimitExceeded = (response, retryAfterMs, message, scope = 'request') => {
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  response.writeHead(429, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Stripe-Signature, X-Zeffy-Webhook-Token, X-API-Key, Authorization, X-Actor-Email, X-Actor-Role, X-Actor-Name',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Retry-After': String(retryAfterSeconds),
    'X-RateLimit-Scope': scope
  });
  response.end(JSON.stringify({
    ok: false,
    message,
    retryAfterSeconds,
    scope
  }));
};

const enforceRateLimit = async (request, response, requestUrl) => {
  if (!rateLimitConfig.enabled) {
    return true;
  }

  if (String(request.method || '').toUpperCase() === 'OPTIONS') {
    return true;
  }

  const method = String(request.method || 'GET').toUpperCase();
  const pathname = String(requestUrl?.pathname || '/');
  // Many phones on the Gurdwara Wi-Fi share one public IP; these reads are cached in memory and must not be throttled.
  if (method === 'GET' && (pathname === '/api/recitation/state' || pathname === '/api/recitation/text')) {
    return true;
  }
  const now = Date.now();
  const clientIp = resolveClientIp(request) || 'unknown-ip';
  const actorEmail = String(request.headers['x-actor-email'] || '').trim().toLowerCase();

  if (isAuthRateLimitedRoute(method, pathname)) {
    const accountIdentifier = await extractAccountIdentifier(request, requestUrl);
    const ipKey = `${method}:${pathname}:ip:${clientIp}`;
    const accountKey = `${method}:${pathname}:account:${accountIdentifier}`;

    const ipDecision = evaluateAuthBackoffLimit(
      authIpRateState,
      ipKey,
      rateLimitConfig.authIpMaxAttempts,
      rateLimitConfig.authIpWindowMs,
      rateLimitConfig.authBackoffBaseMs,
      rateLimitConfig.authBackoffMaxMs,
      now
    );

    if (ipDecision.limited) {
      sendRateLimitExceeded(response, ipDecision.retryAfterMs, 'Too many authentication attempts from this IP. Please retry later.', 'auth-ip');
      return false;
    }

    const accountDecision = evaluateAuthBackoffLimit(
      authAccountRateState,
      accountKey,
      rateLimitConfig.authAccountMaxAttempts,
      rateLimitConfig.authAccountWindowMs,
      rateLimitConfig.authBackoffBaseMs,
      rateLimitConfig.authBackoffMaxMs,
      now
    );

    if (accountDecision.limited) {
      sendRateLimitExceeded(response, accountDecision.retryAfterMs, 'Too many authentication attempts for this account. Please retry later.', 'auth-account');
      return false;
    }

    return true;
  }

  const isAuthenticatedAction = Boolean(actorEmail) && method !== 'GET' && method !== 'HEAD';
  const bucketKey = isAuthenticatedAction
    ? `${method}:${pathname}:actor:${actorEmail}`
    : `${method}:${pathname}:ip:${clientIp}`;

  const decision = evaluateFixedWindowLimit(
    fixedWindowRateState,
    bucketKey,
    isAuthenticatedAction ? rateLimitConfig.authenticatedMaxRequests : rateLimitConfig.publicMaxRequests,
    isAuthenticatedAction ? rateLimitConfig.authenticatedWindowMs : rateLimitConfig.publicWindowMs,
    now
  );

  if (decision.limited) {
    sendRateLimitExceeded(
      response,
      decision.retryAfterMs,
      isAuthenticatedAction
        ? 'Too many authenticated requests. Please retry shortly.'
        : 'Too many requests. Please retry shortly.',
      isAuthenticatedAction ? 'authenticated' : 'public'
    );
    return false;
  }

  return true;
};

const pruneRateLimitStates = () => {
  const now = Date.now();

  for (const [key, value] of fixedWindowRateState.entries()) {
    if (!value || value.resetAt <= now) {
      fixedWindowRateState.delete(key);
    }
  }

  for (const [key, value] of authIpRateState.entries()) {
    if (!value) {
      authIpRateState.delete(key);
      continue;
    }
    const stale = (now - value.windowStart) > (rateLimitConfig.authIpWindowMs * 2) && value.blockedUntil <= now;
    if (stale) {
      authIpRateState.delete(key);
    }
  }

  for (const [key, value] of authAccountRateState.entries()) {
    if (!value) {
      authAccountRateState.delete(key);
      continue;
    }
    const stale = (now - value.windowStart) > (rateLimitConfig.authAccountWindowMs * 2) && value.blockedUntil <= now;
    if (stale) {
      authAccountRateState.delete(key);
    }
  }
};

const rateLimitPruneTimer = setInterval(pruneRateLimitStates, rateLimitConfig.cleanupIntervalMs);
if (typeof rateLimitPruneTimer?.unref === 'function') {
  rateLimitPruneTimer.unref();
}

const waitForDarbarSahibHlsSegments = async (minimumSegments = 2, timeoutMs = 12000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (darbarSahibHlsSegments.length >= minimumSegments) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
};

const unsigned16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16BE(value >>> 0);
  return buffer;
};

const unsigned32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
};

const unsigned64 = (value) => {
  const buffer = Buffer.alloc(8);
  const normalized = BigInt(value);
  buffer.writeUInt32BE(Number((normalized >> 32n) & 0xffffffffn), 0);
  buffer.writeUInt32BE(Number(normalized & 0xffffffffn), 4);
  return buffer;
};

const mp4Box = (type, ...payloads) => {
  const body = Buffer.concat(payloads);
  return Buffer.concat([unsigned32(body.length + 8), Buffer.from(type, 'ascii'), body]);
};

const mp4FullBox = (type, version, flags, ...payloads) => mp4Box(
  type,
  Buffer.from([version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff]),
  ...payloads
);

const buildDarbarSahibHlsInitSegment = () => {
  const matrix = Buffer.concat([
    unsigned32(0x00010000), unsigned32(0), unsigned32(0),
    unsigned32(0), unsigned32(0x00010000), unsigned32(0),
    unsigned32(0), unsigned32(0), unsigned32(0x40000000)
  ]);
  const ftyp = mp4Box(
    'ftyp',
    Buffer.from('iso6', 'ascii'),
    unsigned32(1),
    Buffer.from('isomiso6mp41', 'ascii')
  );
  const mvhd = mp4FullBox(
    'mvhd', 0, 0,
    Buffer.alloc(8),
    unsigned32(1000),
    unsigned32(0),
    unsigned32(0x00010000),
    unsigned16(0x0100),
    Buffer.alloc(10),
    matrix,
    Buffer.alloc(24),
    unsigned32(2)
  );
  const tkhd = mp4FullBox(
    'tkhd', 0, 0x000007,
    Buffer.alloc(8),
    unsigned32(1),
    unsigned32(0),
    unsigned32(0),
    Buffer.alloc(8),
    unsigned16(0),
    unsigned16(0),
    unsigned16(0x0100),
    unsigned16(0),
    matrix,
    unsigned32(0),
    unsigned32(0)
  );
  const mdhd = mp4FullBox(
    'mdhd', 0, 0,
    Buffer.alloc(8),
    unsigned32(44100),
    unsigned32(0),
    unsigned16(0x55c4),
    unsigned16(0)
  );
  const hdlr = mp4FullBox(
    'hdlr', 0, 0,
    unsigned32(0),
    Buffer.from('soun', 'ascii'),
    Buffer.alloc(12),
    Buffer.from('SoundHandler\0', 'ascii')
  );
  const smhd = mp4FullBox('smhd', 0, 0, Buffer.alloc(4));
  const dataReference = mp4FullBox(
    'dref', 0, 0,
    unsigned32(1),
    mp4FullBox('url ', 0, 1)
  );
  const dinf = mp4Box('dinf', dataReference);
  const audioSpecificConfig = Buffer.from([0x2b, 0x92, 0x08]);
  const esDescriptor = Buffer.concat([
    Buffer.from([0x03, 0x1a, 0x00, 0x01, 0x00, 0x04, 0x12, 0x40, 0x15, 0x00, 0x00, 0x00]),
    unsigned32(28000),
    unsigned32(28000),
    Buffer.from([0x05, audioSpecificConfig.length]),
    audioSpecificConfig,
    Buffer.from([0x06, 0x01, 0x02])
  ]);
  const esds = mp4FullBox('esds', 0, 0, esDescriptor);
  const mp4a = mp4Box(
    'mp4a',
    Buffer.alloc(6),
    unsigned16(1),
    Buffer.alloc(8),
    unsigned16(2),
    unsigned16(16),
    unsigned16(0),
    unsigned16(0),
    unsigned32(44100 * 65536),
    esds
  );
  const stbl = mp4Box(
    'stbl',
    mp4FullBox('stsd', 0, 0, unsigned32(1), mp4a),
    mp4FullBox('stts', 0, 0, unsigned32(0)),
    mp4FullBox('stsc', 0, 0, unsigned32(0)),
    mp4FullBox('stsz', 0, 0, unsigned32(0), unsigned32(0)),
    mp4FullBox('stco', 0, 0, unsigned32(0))
  );
  const minf = mp4Box('minf', smhd, dinf, stbl);
  const mdia = mp4Box('mdia', mdhd, hdlr, minf);
  const trak = mp4Box('trak', tkhd, mdia);
  const trex = mp4FullBox(
    'trex', 0, 0,
    unsigned32(1),
    unsigned32(1),
    unsigned32(2048),
    unsigned32(0),
    unsigned32(0)
  );
  return Buffer.concat([ftyp, mp4Box('moov', mvhd, trak, mp4Box('mvex', trex))]);
};

const darbarSahibHlsInitSegment = buildDarbarSahibHlsInitSegment();

const buildDarbarSahibHlsMediaSegment = (sequence, decodeTime, frames) => {
  const mfhd = mp4FullBox('mfhd', 0, 0, unsigned32(sequence));
  const tfhd = mp4FullBox('tfhd', 0, 0x020000, unsigned32(1));
  const tfdt = mp4FullBox('tfdt', 1, 0, unsigned64(decodeTime));
  const buildTrun = (dataOffset) => mp4FullBox(
    'trun', 0, 0x000301,
    unsigned32(frames.length),
    unsigned32(dataOffset),
    ...frames.flatMap((frame) => [unsigned32(2048), unsigned32(frame.length)])
  );
  let moof = mp4Box('moof', mfhd, mp4Box('traf', tfhd, tfdt, buildTrun(0)));
  moof = mp4Box('moof', mfhd, mp4Box('traf', tfhd, tfdt, buildTrun(moof.length + 8)));
  return Buffer.concat([moof, mp4Box('mdat', ...frames)]);
};

const appendDarbarSahibHlsSegment = () => {
  if (!darbarSahibHlsFrames.length) {
    return;
  }

  darbarSahibHlsSequence += 1;
  const segmentFrameCount = darbarSahibHlsFrames.length;
  darbarSahibHlsSegments.push({
    sequence: darbarSahibHlsSequence,
    duration: darbarSahibHlsFrameDuration,
    data: buildDarbarSahibHlsMediaSegment(
      darbarSahibHlsSequence,
      darbarSahibHlsDecodeTime,
      darbarSahibHlsFrames
    )
  });
  darbarSahibHlsDecodeTime += segmentFrameCount * 2048;
  darbarSahibHlsSegments = darbarSahibHlsSegments.slice(-darbarSahibHlsMaxSegments);
  darbarSahibHlsFrames = [];
  darbarSahibHlsFrameDuration = 0;
};

const consumeDarbarSahibAacChunk = (chunk) => {
  darbarSahibHlsBuffer = Buffer.concat([darbarSahibHlsBuffer, chunk]);

  while (darbarSahibHlsBuffer.length >= 7) {
    if (darbarSahibHlsBuffer[0] !== 0xff || (darbarSahibHlsBuffer[1] & 0xf6) !== 0xf0) {
      darbarSahibHlsBuffer = darbarSahibHlsBuffer.subarray(1);
      continue;
    }

    const frameLength = ((darbarSahibHlsBuffer[3] & 0x03) << 11)
      | (darbarSahibHlsBuffer[4] << 3)
      | ((darbarSahibHlsBuffer[5] & 0xe0) >> 5);
    const headerLength = (darbarSahibHlsBuffer[1] & 0x01) === 1 ? 7 : 9;
    if (frameLength < headerLength || frameLength > 8192) {
      darbarSahibHlsBuffer = darbarSahibHlsBuffer.subarray(1);
      continue;
    }
    if (darbarSahibHlsBuffer.length < frameLength) {
      break;
    }

    const sampleRateIndex = (darbarSahibHlsBuffer[2] & 0x3c) >> 2;
    const sampleRate = darbarSahibAacSampleRates[sampleRateIndex];
    if (!sampleRate) {
      darbarSahibHlsBuffer = darbarSahibHlsBuffer.subarray(frameLength);
      continue;
    }

    const rawDataBlocks = darbarSahibHlsBuffer[6] & 0x03;
    darbarSahibHlsFrames.push(Buffer.from(darbarSahibHlsBuffer.subarray(headerLength, frameLength)));
    darbarSahibHlsFrameDuration += (1024 * (rawDataBlocks + 1)) / sampleRate;
    darbarSahibHlsBuffer = darbarSahibHlsBuffer.subarray(frameLength);

    if (darbarSahibHlsFrameDuration >= darbarSahibHlsTargetDuration) {
      appendDarbarSahibHlsSegment();
    }
  }
};

const scheduleDarbarSahibHlsReconnect = () => {
  if (darbarSahibHlsReconnectTimer) {
    return;
  }
  darbarSahibHlsReconnectTimer = setTimeout(() => {
    darbarSahibHlsReconnectTimer = null;
    startDarbarSahibHls();
  }, 1500);
  darbarSahibHlsReconnectTimer.unref?.();
};

const startDarbarSahibHls = (sourceUrl = darbarSahibStreamSource, redirectsRemaining = 2) => {
  if (darbarSahibHlsRequest || darbarSahibHlsResponse) {
    return;
  }

  let parsedSource;
  try {
    parsedSource = new URL(sourceUrl);
  } catch {
    scheduleDarbarSahibHlsReconnect();
    return;
  }

  const transport = parsedSource.protocol === 'https:' ? https : http;
  const upstreamRequest = transport.request(parsedSource, {
    headers: {
      Accept: 'audio/aac,audio/aacp,audio/*;q=0.9,*/*;q=0.1',
      'Icy-MetaData': '0',
      'User-Agent': 'GurdwaraCommunityPlatform/1.0'
    }
  }, (upstreamResponse) => {
    const statusCode = Number(upstreamResponse.statusCode || 502);
    const redirectLocation = String(upstreamResponse.headers.location || '').trim();
    if (statusCode >= 300 && statusCode < 400 && redirectLocation && redirectsRemaining > 0) {
      darbarSahibHlsRequest = null;
      upstreamResponse.resume();
      startDarbarSahibHls(new URL(redirectLocation, parsedSource).toString(), redirectsRemaining - 1);
      return;
    }
    if (statusCode < 200 || statusCode >= 300) {
      darbarSahibHlsRequest = null;
      upstreamResponse.resume();
      scheduleDarbarSahibHlsReconnect();
      return;
    }

    darbarSahibHlsRequest = null;
    darbarSahibHlsResponse = upstreamResponse;
    upstreamResponse.on('data', consumeDarbarSahibAacChunk);
    upstreamResponse.once('close', () => {
      if (darbarSahibHlsResponse === upstreamResponse) {
        darbarSahibHlsResponse = null;
        scheduleDarbarSahibHlsReconnect();
      }
    });
  });

  darbarSahibHlsRequest = upstreamRequest;
  upstreamRequest.setTimeout(15000, () => upstreamRequest.destroy(new Error('Darbar Sahib stream timed out.')));
  upstreamRequest.once('error', () => {
    if (darbarSahibHlsRequest === upstreamRequest) {
      darbarSahibHlsRequest = null;
    }
    scheduleDarbarSahibHlsReconnect();
  });
  upstreamRequest.end();
};

const buildDarbarSahibHlsPlaylist = () => {
  const segments = darbarSahibHlsSegments.slice(-darbarSahibHlsPlaylistSize);
  const targetDuration = Math.max(
    darbarSahibHlsTargetDuration,
    ...segments.map((segment) => Math.ceil(segment.duration))
  );
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    `#EXT-X-TARGETDURATION:${targetDuration}`,
    `#EXT-X-MEDIA-SEQUENCE:${segments[0]?.sequence || 0}`,
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MAP:URI="init.mp4"'
  ];
  segments.forEach((segment) => {
    lines.push(`#EXTINF:${segment.duration.toFixed(3)},`);
    lines.push(`segment-${segment.sequence}.m4s`);
  });
  return `${lines.join('\n')}\n`;
};

const proxyDarbarSahibAudio = (request, response, sourceUrl = darbarSahibStreamSource, redirectsRemaining = 2) => {
  let parsedSource;
  try {
    parsedSource = new URL(sourceUrl);
  } catch {
    sendJson(response, 500, { ok: false, message: 'Darbar Sahib stream source is invalid.' });
    return;
  }

  const transport = parsedSource.protocol === 'https:' ? https : http;
  const upstreamRequest = transport.request(parsedSource, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: {
      Accept: 'audio/aac,audio/aacp,audio/*;q=0.9,*/*;q=0.1',
      'Icy-MetaData': '0',
      'User-Agent': 'GurdwaraCommunityPlatform/1.0'
    }
  }, (upstreamResponse) => {
    const statusCode = Number(upstreamResponse.statusCode || 502);
    const redirectLocation = String(upstreamResponse.headers.location || '').trim();
    if (statusCode >= 300 && statusCode < 400 && redirectLocation && redirectsRemaining > 0) {
      upstreamResponse.resume();
      proxyDarbarSahibAudio(
        request,
        response,
        new URL(redirectLocation, parsedSource).toString(),
        redirectsRemaining - 1
      );
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      upstreamResponse.resume();
      sendJson(response, 502, { ok: false, message: `Darbar Sahib stream returned ${statusCode}.` });
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'audio/aac',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') {
      upstreamResponse.destroy();
      response.end();
      return;
    }

    upstreamResponse.pipe(response);
    response.once('close', () => upstreamResponse.destroy());
  });

  upstreamRequest.setTimeout(15000, () => upstreamRequest.destroy(new Error('Darbar Sahib stream timed out.')));
  upstreamRequest.once('error', (error) => {
    if (!response.headersSent) {
      sendJson(response, 502, { ok: false, message: error.message || 'Unable to connect to the Darbar Sahib stream.' });
      return;
    }
    response.destroy(error);
  });
  request.once('close', () => upstreamRequest.destroy());
  upstreamRequest.end();
};

const stopDarbarSahibHls = () => {
  if (darbarSahibHlsReconnectTimer) {
    clearTimeout(darbarSahibHlsReconnectTimer);
    darbarSahibHlsReconnectTimer = null;
  }
  darbarSahibHlsRequest?.destroy();
  darbarSahibHlsResponse?.destroy();
  darbarSahibHlsRequest = null;
  darbarSahibHlsResponse = null;
};

process.once('exit', stopDarbarSahibHls);
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.once(signal, () => {
    stopDarbarSahibHls();
    process.exit(0);
  });
});

const ensureStorage = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(usersPath)) {
    fs.writeFileSync(usersPath, JSON.stringify(seedUsers, null, 2), 'utf8');
  }
  if (!fs.existsSync(volunteerReminderLogPath)) {
    fs.writeFileSync(volunteerReminderLogPath, JSON.stringify({ sent: {} }, null, 2), 'utf8');
  }
  if (!fs.existsSync(eventReminderLogPath)) {
    fs.writeFileSync(eventReminderLogPath, JSON.stringify({ sent: {} }, null, 2), 'utf8');
  }
  if (!fs.existsSync(bookingReminderLogPath)) {
    fs.writeFileSync(bookingReminderLogPath, JSON.stringify({ sent: {} }, null, 2), 'utf8');
  }
};

const readVolunteerReminderLog = () => {
  ensureStorage();
  try {
    const raw = fs.readFileSync(volunteerReminderLogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const sent = parsed && typeof parsed.sent === 'object' && parsed.sent ? parsed.sent : {};
    return { sent };
  } catch {
    return { sent: {} };
  }
};

const writeVolunteerReminderLog = (payload) => {
  ensureStorage();
  const next = {
    sent: payload && typeof payload.sent === 'object' && payload.sent ? payload.sent : {}
  };
  fs.writeFileSync(volunteerReminderLogPath, JSON.stringify(next, null, 2), 'utf8');
};

const readEventReminderLog = () => {
  ensureStorage();
  try {
    const raw = fs.readFileSync(eventReminderLogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const sent = parsed && typeof parsed.sent === 'object' && parsed.sent ? parsed.sent : {};
    return { sent };
  } catch {
    return { sent: {} };
  }
};

const writeEventReminderLog = (payload) => {
  ensureStorage();
  const next = {
    sent: payload && typeof payload.sent === 'object' && payload.sent ? payload.sent : {}
  };
  fs.writeFileSync(eventReminderLogPath, JSON.stringify(next, null, 2), 'utf8');
};

const readBookingReminderLog = () => {
  ensureStorage();
  try {
    const raw = fs.readFileSync(bookingReminderLogPath, 'utf8');
    const parsed = JSON.parse(raw);
    const sent = parsed && typeof parsed.sent === 'object' && parsed.sent ? parsed.sent : {};
    return { sent };
  } catch {
    return { sent: {} };
  }
};

const writeBookingReminderLog = (payload) => {
  ensureStorage();
  const next = {
    sent: payload && typeof payload.sent === 'object' && payload.sent ? payload.sent : {}
  };
  fs.writeFileSync(bookingReminderLogPath, JSON.stringify(next, null, 2), 'utf8');
};

const getUtcStartOfDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const getDaysUntilDate = (dateValue) => {
  const target = getUtcStartOfDay(dateValue);
  if (target == null) {
    return null;
  }

  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - today) / (24 * 60 * 60 * 1000));
};

const formatDateTimeLabel = (dateValue, fallback = 'Date TBD') => {
  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  try {
    return parsed.toLocaleString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return parsed.toISOString();
  }
};

const escapeIcsText = (value) => {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
};

const formatIcsDateUtc = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
};

const buildEventIcsBody = (event, urlBase = '') => {
  const start = new Date(event?.date || '');
  const endCandidate = new Date(event?.endDate || event?.end || '');
  const end = Number.isNaN(endCandidate.getTime()) ? new Date(start.getTime() + (60 * 60 * 1000)) : endCandidate;

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '';
  }

  const uid = `${String(event?.id || 'event')}@${calendarUidDomain}`;
  const created = formatIcsDateUtc(new Date());
  const startUtc = formatIcsDateUtc(start);
  const endUtc = formatIcsDateUtc(end);
  const location = escapeIcsText(event?.location || defaultOrganizationName);
  const title = escapeIcsText(event?.title || 'Event');
  const description = escapeIcsText(event?.description || 'Sangat event');
  const eventUrl = urlBase
    ? `${String(urlBase).replace(/\/$/, '')}/events?eventId=${encodeURIComponent(String(event?.id || ''))}`
    : '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gurdwara Community Platform//Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${created}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${title}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    ...(eventUrl ? [`URL:${escapeIcsText(eventUrl)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return `${lines.join('\r\n')}\r\n`;
};

const buildEventsCalendarIcsBody = (events = [], urlBase = '') => {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gurdwara Community Platform//Events Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];
  const footer = ['END:VCALENDAR'];
  const nowStamp = formatIcsDateUtc(new Date());

  const items = (Array.isArray(events) ? events : [])
    .filter((event) => Boolean(event?.date))
    .map((event) => {
      const start = new Date(event.date);
      if (Number.isNaN(start.getTime())) {
        return '';
      }

      const endCandidate = new Date(event.endDate || event.end || '');
      const end = Number.isNaN(endCandidate.getTime()) ? new Date(start.getTime() + (60 * 60 * 1000)) : endCandidate;
      const eventUrl = urlBase
        ? `${String(urlBase).replace(/\/$/, '')}/events?eventId=${encodeURIComponent(String(event.id || ''))}`
        : '';

      return [
        'BEGIN:VEVENT',
        `UID:${String(event.id || `event-${start.getTime()}`)}@${calendarUidDomain}`,
        `DTSTAMP:${nowStamp}`,
        `DTSTART:${formatIcsDateUtc(start)}`,
        `DTEND:${formatIcsDateUtc(end)}`,
        `SUMMARY:${escapeIcsText(event.title || 'Event')}`,
        `DESCRIPTION:${escapeIcsText(event.description || 'Sangat event')}`,
        `LOCATION:${escapeIcsText(event.location || defaultOrganizationName)}`,
        ...(eventUrl ? [`URL:${escapeIcsText(eventUrl)}`] : []),
        'END:VEVENT'
      ].join('\r\n');
    })
    .filter(Boolean);

  return `${[...header, ...items, ...footer].join('\r\n')}\r\n`;
};

const getRequestActor = (request) => {
  const email = String(request.headers['x-actor-email'] || '').trim().toLowerCase();
  const role = String(request.headers['x-actor-role'] || '').trim();
  const name = String(request.headers['x-actor-name'] || '').trim();
  return { email, role, name };
};
const canManageAdminPage = async (request, pagePath) => {
  const actor = getRequestActor(request);
  const actorEmail = String(actor.email || '').trim().toLowerCase();
  if (!actorEmail) return false;
  const [users, roleDefinitions] = await Promise.all([
    eventsDb.listItems('users'),
    eventsDb.getSingleton('admin_roles', [])
  ]);
  const user = (Array.isArray(users) ? users : []).find((entry) => String(entry.email || '').trim().toLowerCase() === actorEmail);
  if (!user || user.isActive === false || String(user.approvalStatus || 'approved').trim().toLowerCase() !== 'approved') return false;
  const role = String(user.role || '').trim().toLowerCase();
  if (actor.role && String(actor.role).trim().toLowerCase() !== role) return false;
  if (['admin', 'super admin'].includes(role)) return true;
  return (Array.isArray(roleDefinitions) ? roleDefinitions : []).some((entry) => (
    String(entry?.name || '').trim().toLowerCase() === role
    && Array.isArray(entry?.adminPageAccess)
    && entry.adminPageAccess.includes(pagePath)
  ));
};

const getBookingVenueType = (booking = {}) => {
  const explicit = String(booking.bookingVenueType || '').trim().toLowerCase();
  if (['gurdwara', 'residence'].includes(explicit)) return explicit;
  const location = String(booking.bookingLocation || booking.location || '').trim();
  if (!location) return 'gurdwara';
  return /gurdwara|7035\s+sixth\s+line/i.test(location)
    ? 'gurdwara'
    : 'residence';
};

const buildPublicBookingProjection = (booking = {}, categories = []) => {
  const categoryOrder = new Map((Array.isArray(categories) ? categories : []).map((entry, index) => [
    String(entry.id || ''), Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : index + 1
  ]));
  const requestedItems = [...(Array.isArray(booking.itemizedItems) ? booking.itemizedItems : [])]
    .sort((first, second) => (categoryOrder.get(String(first.categoryId || '')) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(String(second.categoryId || '')) ?? Number.MAX_SAFE_INTEGER))
    .map((item) => String(item.name || '').trim())
    .filter(Boolean);
  const categoryName = requestedItems.length
    ? requestedItems.join(', ')
    : String(booking.categoryName || '').trim() || 'Programme Booking';
  const publicVenue = getBookingVenueType(booking) === 'gurdwara' ? 'At Gurdwara' : 'At Residence';
  const hideLocation = booking.hidePublicLocation !== false;
  return {
    id: String(booking.id || ''),
    categoryId: String(booking.categoryId || ''),
    categoryName,
    title: categoryName,
    date: String(booking.date || ''),
    toDate: String(booking.toDate || booking.date || ''),
    startTime: String(booking.startTime || ''),
    endTime: String(booking.endTime || ''),
    status: String(booking.status || 'pending').trim().toLowerCase(),
    color: String(booking.color || ''),
    bookingVenueType: getBookingVenueType(booking),
    bookingLocation: hideLocation ? publicVenue : String(booking.bookingLocation || publicVenue).trim()
  };
};

const projectBookingsForRequest = async (request, bookings = []) => {
  const actor = getRequestActor(request);
  const actorEmail = String(actor.email || '').trim().toLowerCase();
  if (!actorEmail) {
    const storedCategories = await eventsDb.getSingleton('booking_categories', {});
    const categories = Array.isArray(storedCategories) ? storedCategories : storedCategories?.categories || [];
    return bookings.map((booking) => buildPublicBookingProjection(booking, categories));
  }

  const [users, roleDefinitions, storedCategories] = await Promise.all([
    eventsDb.listItems('users'),
    eventsDb.getSingleton('admin_roles', []),
    eventsDb.getSingleton('booking_categories', {})
  ]);
  const user = (Array.isArray(users) ? users : []).find((entry) => String(entry.email || '').trim().toLowerCase() === actorEmail);
  const role = String(user?.role || '').trim().toLowerCase();
  const isActive = Boolean(user) && user.isActive !== false
    && String(user.approvalStatus || 'approved').trim().toLowerCase() === 'approved';
  const dutyPath = '/admin/booking-duties';
  const bookingManagementPath = '/admin/bookings';
  const roles = Array.isArray(roleDefinitions) ? roleDefinitions : [];
  const roleCanAccess = (path) => roles.some((definition) => (
    String(definition?.name || '').trim().toLowerCase() === role
    && Array.isArray(definition?.adminPageAccess)
    && definition.adminPageAccess.includes(path)
  ));
  const isFullAdmin = isActive && (
    ['admin', 'super admin'].includes(role)
    || roleCanAccess(bookingManagementPath)
    || (Array.isArray(user?.adminPageAccess) && user.adminPageAccess.includes(bookingManagementPath))
  );
  const assignedDutyRoles = new Set(roles
    .filter((entry) => Array.isArray(entry?.adminPageAccess) && entry.adminPageAccess.includes(dutyPath))
    .map((entry) => String(entry.name || '').trim().toLowerCase()));
  const hasDutyAccess = isActive && assignedDutyRoles.has(role);
  const categories = Array.isArray(storedCategories) ? storedCategories : storedCategories?.categories || [];
  if (isFullAdmin) return bookings;

  return bookings.map((booking) => {
    const isRequester = String(booking.requesterEmail || '').trim().toLowerCase() === actorEmail
      || String(booking.bookedByEmail || '').trim().toLowerCase() === actorEmail;
    const matchesAssignee = (Array.isArray(booking.dutyAssignees) ? booking.dutyAssignees : []).some((assignee) => (
      String(assignee.userId || '').trim() === String(user?.id || '')
      || String(assignee.email || '').trim().toLowerCase() === actorEmail
    )) || String(booking.dutyAssigneeId || '').trim() === String(user?.id || '')
      || String(booking.dutyAssigneeEmail || '').trim().toLowerCase() === actorEmail;
    return (isActive && (isRequester || (hasDutyAccess && matchesAssignee)))
      ? booking
      : buildPublicBookingProjection(booking, categories);
  });
};


const canManageDonations = (request) => {
  const role = String(getRequestActor(request).role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin';
};

const canManageBookingDuties = (request) => {
  const role = String(getRequestActor(request).role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin';
};

const canManageGranthiQuestions = (request) => {
  const role = String(getRequestActor(request).role || '').trim().toLowerCase();
  return role === 'admin' || role === 'super admin';
};

const resolveCommunityAnnouncementSubmitter = async (request) => {
  const actor = getRequestActor(request);
  const actorEmail = String(actor.email || '').trim().toLowerCase();
  assertInput(Boolean(actorEmail), 'Sign in to submit a community notice.', 401);
  const users = await eventsDb.listItems('users');
  const user = (Array.isArray(users) ? users : []).find((entry) => String(entry.email || '').trim().toLowerCase() === actorEmail);
  const role = String(user?.role || '').trim().toLowerCase();
  assertInput(Boolean(user) && user.isActive !== false
    && String(user.approvalStatus || 'approved').trim().toLowerCase() === 'approved', 'An active approved account is required to submit a community notice.', 403);
  assertInput(!actor.role || String(actor.role).trim().toLowerCase() === role, 'Your session permissions changed. Please sign in again.', 403);
  assertInput(['family', 'member', 'admin', 'super admin'].includes(role), 'A Family or Member account is required to submit a community notice.', 403);
  return { id: user.id, name: user.name, email: actorEmail, role };
};

const getCommunityAnnouncementCategoryCatalog = async () => {
  const stored = await eventsDb.getSingleton('community_announcement_categories', []);
  const custom = (Array.isArray(stored) ? stored : [])
    .filter((entry) => entry && /^[a-z0-9-]{2,40}$/.test(String(entry.value || '')))
    .map((entry) => ({ value: String(entry.value), label: String(entry.label || entry.value).trim().slice(0, 100) }))
    .filter((entry) => entry.label);
  const defaults = COMMUNITY_ANNOUNCEMENT_CATEGORIES.map((value) => ({ value, label: value }));
  const byValue = new Map([...defaults, ...custom].map((entry) => [entry.value, entry]));
  return Array.from(byValue.values());
};

const isSuperAdmin = (request) => String(getRequestActor(request).role || '')
  .trim()
  .toLowerCase()
  .replace(/[\s_-]+/g, '') === 'superadmin';

const appendAuditLog = async (request, details = {}) => {
  try {
    const actor = getRequestActor(request);
    const record = {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      action: String(details.action || '').trim() || 'unknown',
      targetType: String(details.targetType || '').trim() || 'unknown',
      targetId: String(details.targetId || '').trim(),
      description: String(details.description || '').trim(),
      actorEmail: actor.email,
      actorRole: actor.role,
      actorName: actor.name,
      method: String(request.method || ''),
      path: String(details.path || request.url || ''),
      payload: details.payload || null,
      createdAt: new Date().toISOString()
    };

    if (!eventsDb.hasDatabaseConnection) {
      return;
    }

    await eventsDb.createItem('audit_logs', record);
  } catch {
    // Never block request flow on audit log failures.
  }
};

const normalizeVolunteerRegistrationForReminder = (entry = {}) => {
  const id = String(entry.id || '').trim();
  const email = String(entry.email || '').trim().toLowerCase();
  const sevaDate = String(entry.sevaDate || entry.seva_date || entry.date || '').trim();
  const sevaType = String(entry.sevaType || entry.seva_type || entry.area || 'Seva').trim();
  const sevaTime = String(entry.sevaTime || entry.seva_time || entry.time || '').trim();
  const name = String(entry.name || 'Volunteer').trim();
  const status = String(entry.status || '').trim().toLowerCase();
  const contactPreference = String(entry.contactPreference || entry.contact_preference || 'Email').trim().toLowerCase();
  const wantsEventEmails = entry.wantsEventEmails == null
    ? entry.wants_event_emails == null
      ? true
      : Boolean(entry.wants_event_emails)
    : Boolean(entry.wantsEventEmails);

  return {
    id,
    opportunityId: String(entry.opportunityId || entry.opportunity_id || '').trim(),
    email,
    name,
    sevaDate,
    sevaType,
    sevaTime,
    status,
    contactPreference,
    wantsEventEmails
  };
};

const getSevaOpportunitiesMap = async () => {
  const opportunityRows = await eventsDb.listItems('seva_opportunities');

  return new Map(
    (Array.isArray(opportunityRows) ? opportunityRows : []).map((row) => [String(row.id || ''), row || {}])
  );
};

const getVolunteerRegistrationsForReminder = async () => {
  const opportunityMap = await getSevaOpportunitiesMap();

  const rows = await eventsDb.listItems('volunteer_registrations');

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const registration = normalizeVolunteerRegistrationForReminder(row);
    const opportunityId = String(row?.opportunityId || row?.opportunity_id || '').trim();
    const linkedOpportunity = opportunityId ? opportunityMap.get(opportunityId) : null;

    if (!linkedOpportunity) {
      return registration;
    }

    return {
      ...registration,
      sevaDate: String(linkedOpportunity.date || registration.sevaDate || ''),
      sevaTime: String(linkedOpportunity.time || registration.sevaTime || ''),
      sevaType: String(linkedOpportunity.sevaType || registration.sevaType || 'Seva')
    };
  });
};

const formatSevaDateLabel = (value) => {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return 'Date TBD';
  }

  const dateOnlyMatch = rawValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsedDate = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(rawValue);

  if (Number.isNaN(parsedDate.getTime())) {
    return 'Date TBD';
  }

  return parsedDate.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
};

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildContactInquiryEmail = ({ name = '', email = '', phone = '', message = '', subject = '' }) => {
  const logoSrc = emailLogoSrc;
  const siteName = String(volunteerReminderSiteName || defaultOrganizationName).trim();
  const recipientSubject = sanitizeHeaderValue(subject || `Contact Us Inquiry from ${name}`) || 'Contact Us Inquiry';
  const contactMessage = String(message || '').trim();
  const submittedAt = new Date().toLocaleString('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const text = [
    `Contact inquiry received - ${siteName}`,
    '',
    `Name: ${name || '-'}`,
    `Email: ${email || '-'}`,
    `Phone: ${phone || '-'}`,
    `Submitted: ${submittedAt}`,
    `Subject: ${recipientSubject}`,
    '',
    'Message:',
    contactMessage || '-'
  ].join('\n');

  const html = `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoSrc ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(siteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(siteName)}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Contact Us Inquiry</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 22px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #c7dcf7;border-radius:14px;overflow:hidden;background:#f6faff;box-shadow:0 8px 24px -18px rgba(11,103,194,.65);margin-bottom:16px;">
            <tr>
              <td colspan="2" style="padding:11px 14px;background:linear-gradient(90deg,#eaf2ff,#f6f9ff);border-bottom:1px solid #c7dcf7;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0a4d9f;">Submission Details</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Name</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(name || '-')}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Email</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(email || '-')}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Phone</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(phone || '-')}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Submitted</td>
              <td style="padding:11px 12px;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(submittedAt)}</td>
            </tr>
          </table>

          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#0b67c2;margin-bottom:8px;">Message</div>
          <div style="border:1px solid #cfe1fb;border-radius:12px;background:#ffffff;padding:12px 14px;line-height:1.6;white-space:pre-wrap;box-shadow:inset 0 0 0 1px #f5f9ff;">${escapeHtml(contactMessage || '-')}</div>
        </td>
      </tr>
    </table>
  </div>`;

  return {
    subject: recipientSubject,
    text,
    html
  };
};

const buildVolunteerReminderEmail = ({ registration, daysRemaining = null, manual = false }) => {
  const sevaDateLabel = formatSevaDateLabel(registration.sevaDate);
  const timeLabel = registration.sevaTime || 'Time TBD';
  const logoSrc = emailLogoSrc;
  const baseUrl = String(volunteerReminderBaseUrl || publicSiteBaseUrl).trim().replace(/\/+$/, '');
  const sevaUrl = `${baseUrl}/seva`;
  const contactUrl = `${baseUrl}/contact`;
  const eventsUrl = `${baseUrl}/events`;
  const greetingLine = 'ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ';
  const requesterNameBase = String(registration.name || 'Sangat Member').trim().replace(/[.\s]+$/g, '');
  const requesterName = `${requesterNameBase}.`;
  const countdownLabel = Number.isFinite(daysRemaining) && daysRemaining >= 0
    ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
    : 'Upcoming Seva';

  const subject = manual
    ? `${registration.sevaType} Seva Details | ${volunteerReminderSiteName}`
    : Number.isFinite(daysRemaining)
      ? `Seva Reminder (${daysRemaining} day${daysRemaining === 1 ? '' : 's'}): ${registration.sevaType}`
      : `Seva Reminder: ${registration.sevaType}`;

  const text = [
    greetingLine,
    '',
    requesterName,
    '',
    manual ? 'This is a manual seva notification from admin.' : 'This is your seva reminder for an upcoming seva opportunity.',
    '',
    `Seva Type: ${registration.sevaType}`,
    `Seva Date: ${sevaDateLabel}`,
    `Seva Time: ${timeLabel}`,
    `Gurdwara: ${volunteerReminderSiteName}`,
    `Seva Page: ${sevaUrl}`,
    `Events Page: ${eventsUrl}`,
    `Contact: ${contactUrl}`,
    '',
    'Kindly arrive a little early and check in with the seva coordinator.',
    'Thank you for serving the sangat.'
  ].join('\n');

  if (!volunteerReminderHtmlTemplateEnabled) {
    return { subject, text, html: '' };
  }

  const html = `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoSrc ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(volunteerReminderSiteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(volunteerReminderSiteName)}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Seva Opportunity Reminder</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px 12px;text-align:center;">
          <div style="font-size:19px;line-height:1.45;font-weight:800;color:#0f172a;">${escapeHtml(greetingLine)}</div>
          <div style="margin-top:8px;font-size:16px;line-height:1.7;color:#334155;font-weight:600;">${escapeHtml(requesterName)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 28px;">
          <div style="font-size:15px;line-height:1.85;color:#334155;margin-bottom:14px;text-align:center;">
            ${manual
    ? `This is a manual seva update from the admin team for your upcoming seva (${escapeHtml(countdownLabel)}). Please review the details below and plan your seva accordingly.`
    : `A warm reminder that your seva opportunity is coming up (${escapeHtml(countdownLabel)}). Please review the details below and arrive a little early so the seva can begin smoothly.`}
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #d7e3f3;border-radius:12px;overflow:hidden;background:#fbfdff;margin-bottom:16px;">
            <tr>
              <td style="width:34%;padding:12px 14px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-size:14px;font-weight:700;color:#0a4d9f;">Seva Type</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7e3f3;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(registration.sevaType || 'Seva')}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-size:14px;font-weight:700;color:#0a4d9f;">Seva Date</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7e3f3;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(sevaDateLabel)}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-size:14px;font-weight:700;color:#0a4d9f;">Seva Time</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7e3f3;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(timeLabel)}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;background:#eef5ff;font-size:14px;font-weight:700;color:#0a4d9f;">Gurdwara</td>
              <td style="padding:12px 14px;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(volunteerReminderSiteName)}</td>
            </tr>
          </table>
          <div style="font-size:15px;line-height:1.8;color:#334155;">
            Kindly arrive a little early and check in with the seva coordinator.<br/>
            Thank you for serving the sangat.
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
            <tr>
              <td style="border-radius:8px;background:#0b67c2;text-align:center;">
                <a href="${escapeHtml(sevaUrl)}" style="display:inline-block;padding:11px 16px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">View Seva Opportunities</a>
              </td>
              <td style="width:8px;">&nbsp;</td>
              <td style="border-radius:8px;background:#eef5ff;border:1px solid #cfe1fb;text-align:center;">
                <a href="${escapeHtml(eventsUrl)}" style="display:inline-block;padding:11px 16px;color:#0a4d9f;text-decoration:none;font-size:13px;font-weight:700;">Upcoming Events</a>
              </td>
            </tr>
          </table>
          <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;line-height:1.8;color:#64748b;">
            <div style="font-weight:700;color:#334155;">Need help?</div>
            <div>Contact Page: <a href="${escapeHtml(contactUrl)}" style="color:#0b67c2;text-decoration:none;">${escapeHtml(contactUrl)}</a></div>
            <div style="margin-top:6px;">${escapeHtml(volunteerReminderSiteName)}</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, text, html };
};

const sendVolunteerReminderEmail = async (registration, options = {}) => {
  if (!volunteerReminderWebhookUrl) {
    return { sent: false, reason: 'missing_webhook' };
  }

  const daysRemaining = Number.isFinite(Number(options.daysRemaining)) ? Number(options.daysRemaining) : null;
  const manual = options.manual === true;
  const template = buildVolunteerReminderEmail({ registration, daysRemaining, manual });
  const htmlBody = String(template?.html || '').trim();

  const payload = {
    type: manual ? 'volunteer-seva-manual' : 'volunteer-seva-reminder',
    to: registration.email,
    name: registration.name,
    subject: template.subject,
    message: template.text,
    text: template.text,
    html: htmlBody,
    bodyHtml: htmlBody,
    bodyText: template.text,
    templateType: htmlBody ? 'html' : 'text',
    metadata: {
      reminderDays: daysRemaining,
      sevaType: registration.sevaType,
      sevaDate: registration.sevaDate,
      sevaTime: registration.sevaTime,
      registrationId: registration.id,
      opportunityId: registration.opportunityId || '',
      manual
    },
    sentAt: new Date().toISOString()
  };

  try {
    const response = await deliverWorkflowEmail(volunteerReminderWebhookUrl, payload);

    if (!response.ok) {
      return { sent: false, reason: 'webhook_error' };
    }

    return { sent: true };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
};

const buildOpportunityEmailPreview = async (opportunityId) => {
  const normalizedOpportunityId = String(opportunityId || '').trim();
  if (!normalizedOpportunityId) {
    const error = new Error('Opportunity id is required.');
    error.status = 400;
    throw error;
  }

  const opportunityMap = await getSevaOpportunitiesMap();
  const selectedOpportunity = opportunityMap.get(normalizedOpportunityId);
  if (!selectedOpportunity) {
    const error = new Error('Seva opportunity not found.');
    error.status = 404;
    throw error;
  }

  const registrations = await getVolunteerRegistrationsForReminder();
  const matching = registrations.filter((entry) => {
    const linked = String(entry.opportunityId || '') === normalizedOpportunityId;
    const legacyMatch = !entry.opportunityId
      && String(entry.sevaType || '').trim().toLowerCase() === String(selectedOpportunity.sevaType || '').trim().toLowerCase()
      && String(entry.sevaDate || '').trim() === String(selectedOpportunity.date || '').trim();
    return linked || legacyMatch;
  });

  const sample = matching[0] || {
    id: `preview-${normalizedOpportunityId}`,
    opportunityId: normalizedOpportunityId,
    email: 'volunteer@example.com',
    name: 'Sevadar',
    sevaDate: String(selectedOpportunity.date || ''),
    sevaType: String(selectedOpportunity.sevaType || 'Seva'),
    sevaTime: String(selectedOpportunity.time || ''),
    status: 'pending',
    contactPreference: 'email',
    wantsEventEmails: true
  };

  const template = buildVolunteerReminderEmail({ registration: sample, manual: true });
  return template;
};

const sendManualOpportunityReminders = async (opportunityId) => {
  const normalizedOpportunityId = String(opportunityId || '').trim();
  if (!normalizedOpportunityId) {
    const error = new Error('Opportunity id is required.');
    error.status = 400;
    throw error;
  }

  const opportunityMap = await getSevaOpportunitiesMap();
  const selectedOpportunity = opportunityMap.get(normalizedOpportunityId);
  if (!selectedOpportunity) {
    const error = new Error('Seva opportunity not found.');
    error.status = 404;
    throw error;
  }

  const registrations = await getVolunteerRegistrationsForReminder();
  const matching = registrations.filter((entry) => {
    const linked = String(entry.opportunityId || '') === normalizedOpportunityId;
    const legacyMatch = !entry.opportunityId
      && String(entry.sevaType || '').trim().toLowerCase() === String(selectedOpportunity.sevaType || '').trim().toLowerCase()
      && String(entry.sevaDate || '').trim() === String(selectedOpportunity.date || '').trim();
    return linked || legacyMatch;
  });

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  const skippedByReason = {
    ineligible: 0,
    deliveryFailed: 0
  };

  for (const registration of matching) {
    processed += 1;

    if (!registration.email || registration.status === 'rejected' || registration.status === 'cancelled') {
      skipped += 1;
      skippedByReason.ineligible += 1;
      continue;
    }

    const result = await sendVolunteerReminderEmail(registration, { manual: true });
    if (!result.sent) {
      skipped += 1;
      skippedByReason.deliveryFailed += 1;
      continue;
    }

    sent += 1;
  }

  return {
    opportunityId: normalizedOpportunityId,
    sevaType: String(selectedOpportunity.sevaType || ''),
    sevaDate: String(selectedOpportunity.date || ''),
    processed,
    sent,
    skipped,
    skippedByReason,
    webhookConfigured: Boolean(volunteerReminderWebhookUrl)
  };
};

const runVolunteerReminderSweep = async (options = {}) => {
  if (volunteerReminderSweepRunning) {
    return { processed: 0, sent: 0, skipped: 0, reason: 'already_running' };
  }

  volunteerReminderSweepRunning = true;
  const force = options.force === true;

  try {
    const registrations = await getVolunteerRegistrationsForReminder();
    const logStore = readVolunteerReminderLog();
    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const registration of registrations) {
      processed += 1;

      if (!registration.id || !registration.email || !registration.sevaDate) {
        skipped += 1;
        continue;
      }

      if (registration.status === 'rejected' || registration.status === 'cancelled') {
        skipped += 1;
        continue;
      }

      if (!(registration.wantsEventEmails || registration.contactPreference === 'email')) {
        skipped += 1;
        continue;
      }

      const daysRemaining = getDaysUntilDate(registration.sevaDate);
      if (daysRemaining == null || !volunteerReminderDays.includes(daysRemaining)) {
        skipped += 1;
        continue;
      }

      const reminderKey = `${registration.id}:${registration.sevaDate}:${daysRemaining}`;
      if (!force && logStore.sent[reminderKey]) {
        skipped += 1;
        continue;
      }

      const result = await sendVolunteerReminderEmail(registration, { daysRemaining, manual: false });
      if (!result.sent) {
        skipped += 1;
        continue;
      }

      sent += 1;
      logStore.sent[reminderKey] = new Date().toISOString();
    }

    writeVolunteerReminderLog(logStore);
    return { processed, sent, skipped, force, webhookConfigured: Boolean(volunteerReminderWebhookUrl) };
  } finally {
    volunteerReminderSweepRunning = false;
  }
};

const normalizeEventRegistrantForReminder = (entry = {}, event = {}) => {
  return {
    id: String(entry.id || '').trim(),
    email: String(entry.email || '').trim().toLowerCase(),
    name: String(entry.name || 'Registrant').trim(),
    status: String(entry.status || 'confirmed').trim().toLowerCase(),
    eventId: String(event.id || '').trim(),
    eventTitle: String(event.title || 'Event').trim(),
    eventDate: String(event.date || '').trim(),
    eventEndDate: String(event.endDate || event.end || '').trim(),
    eventLocation: String(event.location || '').trim(),
    eventDescription: String(event.description || '').trim()
  };
};

const isValidEmailAddress = (value = '') => {
  const email = String(value || '').trim().toLowerCase();
  if (!email) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const getEventRegistrationsForReminder = async () => {
  const events = await eventsDb.getEvents();
  const rows = [];

  (Array.isArray(events) ? events : []).forEach((event) => {
    const registrants = Array.isArray(event?.registrants) ? event.registrants : [];
    registrants.forEach((entry) => {
      rows.push(normalizeEventRegistrantForReminder(entry, event));
    });
  });

  return rows;
};

const buildEventReminderEmail = ({ registration, daysRemaining = null }) => {
  const eventDateLabel = formatDateTimeLabel(registration.eventDate, 'Date TBD');
  const timeLabel = registration.eventEndDate
    ? `${formatDateTimeLabel(registration.eventDate, eventDateLabel)} - ${formatDateTimeLabel(registration.eventEndDate, 'End TBD')}`
    : eventDateLabel;
  const logoSrc = emailLogoSrc;
  const baseUrl = String(volunteerReminderBaseUrl || publicSiteBaseUrl).trim().replace(/\/+$/, '');
  const eventsUrl = `${baseUrl}/events`;
  const contactUrl = `${baseUrl}/contact`;
  const calendarUrl = registration.eventId ? `${baseUrl}/api/events/${encodeURIComponent(String(registration.eventId))}/calendar.ics` : '';
  const greetingLine = 'ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ';
  const recipientNameBase = String(registration.name || 'Sangat Member').trim().replace(/[.\s]+$/g, '');
  const recipientName = `${recipientNameBase}.`;
  const registrationType = registration.status === 'waitlisted' ? 'waitlist' : 'registration';
  const countdownLabel = Number.isFinite(daysRemaining) && daysRemaining >= 0
    ? `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`
    : 'Upcoming Event';
  const subject = Number.isFinite(daysRemaining)
    ? `Event Reminder (${daysRemaining} day${daysRemaining === 1 ? '' : 's'}): ${registration.eventTitle}`
    : `Event Reminder: ${registration.eventTitle}`;
  const text = [
    greetingLine,
    '',
    recipientName,
    '',
    `This is your ${registrationType} reminder for the upcoming event.`,
    `Event: ${registration.eventTitle}`,
    `Date and Time: ${timeLabel}`,
    `Location: ${registration.eventLocation || defaultOrganizationName}`,
    `Events Page: ${eventsUrl}`,
    calendarUrl ? `Add to Calendar: ${calendarUrl}` : '',
    `Contact: ${contactUrl}`,
    registration.eventDescription ? `Details: ${registration.eventDescription}` : '',
    '',
    registration.status === 'waitlisted'
      ? 'You are currently on the waitlist. If a confirmed spot opens, the team will contact you.'
      : 'Please arrive a few minutes early so the program can begin on time.',
    '',
    'Thank you for your support and participation.'
  ].filter(Boolean).join('\n');

  const html = `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoSrc ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(volunteerReminderSiteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(volunteerReminderSiteName)}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Event Reminder</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px 12px;">
          <div style="font-size:19px;line-height:1.45;font-weight:800;color:#0f172a;">${escapeHtml(greetingLine)}</div>
          <div style="margin-top:8px;font-size:16px;line-height:1.7;color:#334155;font-weight:600;">${escapeHtml(recipientName)}</div>
          <div style="margin-top:10px;display:inline-block;background:#eef5ff;border:1px solid #cfe1fb;color:#0a4d9f;border-radius:9999px;padding:7px 14px;font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">
            ${escapeHtml(countdownLabel)}
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 28px 28px;">
          <div style="font-size:15px;line-height:1.8;color:#334155;margin-bottom:14px;">This is your ${escapeHtml(registrationType)} reminder for the upcoming event.</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #d7e3f3;border-radius:12px;overflow:hidden;background:#fbfdff;margin-bottom:16px;">
            <tr>
              <td style="width:34%;padding:12px 14px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-size:14px;font-weight:700;color:#0a4d9f;">Event</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7e3f3;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(registration.eventTitle || 'Event')}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-size:14px;font-weight:700;color:#0a4d9f;">Date and Time</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7e3f3;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(timeLabel)}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-size:14px;font-weight:700;color:#0a4d9f;">Location</td>
              <td style="padding:12px 14px;border-bottom:1px solid #d7e3f3;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(registration.eventLocation || defaultOrganizationName)}</td>
            </tr>
            <tr>
              <td style="padding:12px 14px;background:#eef5ff;font-size:14px;font-weight:700;color:#0a4d9f;">Gurdwara</td>
              <td style="padding:12px 14px;font-size:17px;font-weight:800;color:#0f172a;">${escapeHtml(volunteerReminderSiteName)}</td>
            </tr>
          </table>
          ${registration.eventDescription ? `<div style="font-size:15px;line-height:1.8;color:#334155;margin-bottom:10px;">${escapeHtml(registration.eventDescription)}</div>` : ''}
          <div style="font-size:15px;line-height:1.8;color:#334155;">
            ${registration.status === 'waitlisted'
              ? 'You are currently on the waitlist. If a confirmed spot opens, the team will contact you.'
              : 'Please arrive a little early and check in at the registration desk.'}
          </div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">
            <tr>
              <td style="border-radius:8px;background:#0b67c2;text-align:center;">
                <a href="${escapeHtml(eventsUrl)}" style="display:inline-block;padding:11px 16px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">View Event Details</a>
              </td>
              ${calendarUrl ? `<td style="width:8px;">&nbsp;</td><td style="border-radius:8px;background:#eef5ff;border:1px solid #cfe1fb;text-align:center;"><a href="${escapeHtml(calendarUrl)}" style="display:inline-block;padding:11px 16px;color:#0a4d9f;text-decoration:none;font-size:13px;font-weight:700;">Add To Calendar</a></td>` : ''}
            </tr>
          </table>
          <div style="margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;line-height:1.8;color:#64748b;">
            <div style="font-weight:700;color:#334155;">Need help?</div>
            <div>Contact Page: <a href="${escapeHtml(contactUrl)}" style="color:#0b67c2;text-decoration:none;">${escapeHtml(contactUrl)}</a></div>
            <div style="margin-top:6px;">${escapeHtml(volunteerReminderSiteName)}</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`;

  return { subject, text, html };
};

const sendEventReminderEmail = async (registration, options = {}) => {
  if (!eventReminderWebhookUrl) {
    return { sent: false, reason: 'missing_webhook' };
  }

  const daysRemaining = Number.isFinite(Number(options.daysRemaining)) ? Number(options.daysRemaining) : null;
  const template = buildEventReminderEmail({ registration, daysRemaining });
  const htmlBody = String(template.html || '').trim();

  const payload = {
    type: 'event-registration-reminder',
    to: registration.email,
    email: registration.email,
    name: registration.name,
    subject: template.subject,
    message: template.text,
    text: template.text,
    html: htmlBody,
    bodyHtml: htmlBody,
    bodyText: template.text,
    templateType: htmlBody ? 'html' : 'text',
    metadata: {
      reminderDays: daysRemaining,
      eventId: registration.eventId,
      eventTitle: registration.eventTitle,
      eventDate: registration.eventDate,
      registrationStatus: registration.status
    },
    sentAt: new Date().toISOString()
  };

  try {
    const response = await deliverWorkflowEmail(eventReminderWebhookUrl, payload);

    if (!response.ok) {
      return { sent: false, reason: 'webhook_error' };
    }

    return { sent: true };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
};

const buildRegistrationStatusEmail = ({ registration = {}, kind = 'event', promoted = false }) => {
  const isSeva = kind === 'seva';
  const status = String(registration.status || 'confirmed').trim().toLowerCase();
  const isWaitlisted = status === 'waitlisted';
  const itemLabel = isSeva
    ? String(registration.sevaType || registration.area || 'Seva Opportunity').trim()
    : String(registration.eventTitle || registration.title || 'Event').trim();
  const dateValue = isSeva ? registration.sevaDate : registration.eventDate;
  const dateLabel = isSeva
    ? formatSevaDateLabel(dateValue)
    : formatDateTimeLabel(dateValue, 'Date TBD');
  const timeLabel = isSeva
    ? String(registration.sevaTime || 'Time TBD').trim()
    : dateLabel;
  const locationLabel = isSeva
    ? volunteerReminderSiteName
    : String(registration.eventLocation || volunteerReminderSiteName).trim();
  const recipientName = String(registration.name || 'Sangat Member').trim();
  const logoSrc = emailLogoSrc;
  const baseUrl = String(volunteerReminderBaseUrl || publicSiteBaseUrl).trim().replace(/\/+$/, '');
  const detailsUrl = `${baseUrl}/${isSeva ? 'seva' : 'events'}`;
  const contactUrl = `${baseUrl}/contact`;
  const typeLabel = isSeva ? 'Seva' : 'Event';
  const statusLabel = isWaitlisted ? 'Waitlisted' : 'Confirmed';
  const heading = promoted ? `${typeLabel} Registration Confirmed` : `${typeLabel} Registration ${statusLabel}`;
  const subject = promoted
    ? `Your spot is confirmed: ${itemLabel}`
    : `${typeLabel} registration ${statusLabel.toLowerCase()}: ${itemLabel}`;
  const explanation = promoted
    ? 'A spot has opened and your registration has been moved from the waitlist to confirmed.'
    : isWaitlisted
      ? 'We received your registration. The confirmed spaces are currently full, so you have been added to the waitlist. We will email you if a spot opens.'
      : 'We received your registration and your spot is confirmed.';
  const preparationNote = isWaitlisted
    ? 'No action is needed while you are on the waitlist.'
    : isSeva
      ? 'Please arrive a little early and check in with the seva coordinator.'
      : 'Please arrive a few minutes early so the program can begin on time.';
  const detailRows = [
    [typeLabel, itemLabel],
    ['Date', dateLabel],
    ...(isSeva ? [['Time', timeLabel]] : []),
    ['Location', locationLabel],
    ['Status', statusLabel]
  ];
  const greetingLine = 'ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਿਹ';
  const text = [
    greetingLine,
    '',
    `${recipientName},`,
    '',
    explanation,
    '',
    ...detailRows.map(([label, value]) => `${label}: ${value}`),
    '',
    preparationNote,
    `Details: ${detailsUrl}`,
    `Contact: ${contactUrl}`,
    '',
    volunteerReminderSiteName,
    defaultOrganizationContactLine
  ].join('\n');
  const rowsHtml = detailRows.map(([label, value], index) => `
            <tr>
              <td style="width:34%;padding:12px 14px;background:#eef5ff;${index < detailRows.length - 1 ? 'border-bottom:1px solid #d7e3f3;' : ''}font-size:14px;font-weight:700;color:#0a4d9f;">${escapeHtml(label)}</td>
              <td style="padding:12px 14px;${index < detailRows.length - 1 ? 'border-bottom:1px solid #d7e3f3;' : ''}font-size:16px;font-weight:800;color:#0f172a;">${escapeHtml(value)}</td>
            </tr>`).join('');
  const html = `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          ${logoSrc ? `<td style="width:44px;padding-right:12px;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(volunteerReminderSiteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
          <td><div style="font-size:13px;font-weight:700;text-transform:uppercase;">${escapeHtml(volunteerReminderSiteName)}</div><div style="font-size:18px;font-weight:800;margin-top:2px;">${escapeHtml(heading)}</div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:22px 28px 28px;">
        <div style="font-size:19px;line-height:1.45;font-weight:800;">${escapeHtml(greetingLine)}</div>
        <div style="margin-top:8px;font-size:16px;font-weight:600;color:#334155;">${escapeHtml(recipientName)},</div>
        <div style="margin-top:14px;font-size:15px;line-height:1.8;color:#334155;">${escapeHtml(explanation)}</div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:16px;border:1px solid #d7e3f3;border-radius:12px;overflow:hidden;background:#fbfdff;">${rowsHtml}</table>
        <div style="margin-top:16px;font-size:15px;line-height:1.8;color:#334155;">${escapeHtml(preparationNote)}</div>
        <div style="margin-top:16px;"><a href="${escapeHtml(detailsUrl)}" style="display:inline-block;border-radius:8px;background:#0b67c2;padding:11px 16px;color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;">View ${escapeHtml(typeLabel)} Details</a></div>
        <div style="margin-top:18px;border-top:1px solid #e2e8f0;padding-top:12px;font-size:12px;line-height:1.8;color:#64748b;">
          <div style="font-weight:700;color:#334155;">${escapeHtml(volunteerReminderSiteName)}</div>
          ${defaultOrganizationAddress ? `<div>${escapeHtml(defaultOrganizationAddress)}</div>` : ''}
          ${defaultOrganizationPhone ? `<div>${escapeHtml(defaultOrganizationPhone)}</div>` : ''}
          ${defaultOrganizationEmail ? `<div><a href="mailto:${escapeHtml(defaultOrganizationEmail)}" style="color:#0b67c2;text-decoration:none;">${escapeHtml(defaultOrganizationEmail)}</a></div>` : ''}
          <div><a href="${escapeHtml(contactUrl)}" style="color:#0b67c2;text-decoration:none;">Contact us</a></div>
        </div>
      </td></tr>
    </table>
  </div>`;

  return { subject, text, html };
};

const sendRegistrationStatusEmail = async ({ registration, kind, promoted = false }) => {
  const email = String(registration?.email || '').trim().toLowerCase();
  if (!isValidEmailAddress(email)) {
    return { sent: false, reason: 'invalid_email' };
  }

  const template = buildRegistrationStatusEmail({ registration, kind, promoted });
  try {
    const response = await deliverWorkflowEmail(kind === 'seva' ? volunteerReminderWebhookUrl : eventReminderWebhookUrl, {
        type: `${kind}-registration-${promoted ? 'promoted' : 'acknowledgement'}`,
        to: email,
        email,
        name: registration.name,
        subject: template.subject,
        message: template.text,
        text: template.text,
        html: template.html,
        bodyHtml: template.html,
        bodyText: template.text,
        templateType: 'html',
        metadata: {
          registrationId: registration.id,
          registrationStatus: registration.status,
          promoted
        },
        sentAt: new Date().toISOString()
    });
    return response.ok ? { sent: true } : { sent: false, reason: 'webhook_error' };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
};

const buildDonationInvoiceEmail = ({ donation = {}, organizationName = '', campaignDescription = '', address = '', phone = '' }) => {
  const donorName = String(donation.donorName || 'Sangat Member').trim();
  const donorEmail = String(donation.donorEmail || '').trim().toLowerCase();
  const receiptId = String(donation.receiptId || donation.id || '').trim();
  const campaignName = String(donation.campaignName || '').trim() || 'Donation Campaign';
  const amountValue = Number(donation.amount);
  const amountText = Number.isFinite(amountValue) ? `$${amountValue.toFixed(2)}` : '-';
  const donationDateLabel = donation.createdAt
    ? new Date(donation.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
    : new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
  const siteName = String(organizationName || volunteerReminderSiteName || defaultOrganizationName).trim();
  const siteAddress = String(address || '').trim();
  const sitePhone = String(phone || '').trim();
  const purposeText = String(campaignDescription || '').trim() || `Support for ${campaignName}`;
  const subject = `Donation Invoice ${receiptId || campaignName} - Thank You`;
  const logoSrc = emailLogoSrc;

  const text = [
    `Sat Sri Akal ${donorName},`,
    '',
    'Thank you for your generous donation. We are grateful for your support.',
    '',
    `Campaign: ${campaignName}`,
    `Purpose: ${purposeText}`,
    `Amount: ${amountText}`,
    `Date: ${donationDateLabel}`,
    receiptId ? `Receipt/Invoice No: ${receiptId}` : '',
    '',
    'Please find your donation invoice PDF attached to this email.',
    siteAddress ? `Address: ${siteAddress}` : '',
    sitePhone ? `Phone: ${sitePhone}` : '',
    '',
    `With gratitude,`,
    siteName
  ].filter(Boolean).join('\n');

  const safeName = escapeHtml(donorName || 'Sangat Member');
  const html = `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoSrc ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(siteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(siteName)}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Donation Invoice &amp; Thank You</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:22px 24px 8px;text-align:left;">
          <div style="margin-top:10px;font-size:15px;line-height:1.8;color:#334155;">Sat Sri Akal ${safeName},</div>
          <div style="margin-top:8px;font-size:15px;line-height:1.8;color:#334155;">Thank you for your generous contribution. Your seva directly supports the sangat and ongoing Gurdwara initiatives. We deeply appreciate your kindness and trust.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 24px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border:1px solid #c7dcf7;border-radius:14px;overflow:hidden;background:#f6faff;box-shadow:0 8px 24px -18px rgba(11,103,194,.65);">
            <tr>
              <td colspan="2" style="padding:11px 14px;background:linear-gradient(90deg,#eaf2ff,#f6f9ff);border-bottom:1px solid #c7dcf7;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#0a4d9f;">Donation Details</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Campaign</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(campaignName)}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Purpose</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(purposeText)}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Amount</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:700;">${escapeHtml(amountText)}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;border-bottom:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Date</td>
              <td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(donationDateLabel)}</td>
            </tr>
            <tr>
              <td style="width:34%;padding:11px 12px;border-right:1px solid #d7e3f3;background:#edf4ff;font-size:12px;font-weight:700;color:#1e3a8a;">Receipt/Invoice</td>
              <td style="padding:11px 12px;background:#ffffff;font-size:14px;color:#0f172a;font-weight:600;">${escapeHtml(receiptId || '-')}</td>
            </tr>
          </table>
          <div style="margin-top:14px;font-size:15px;line-height:1.8;color:#334155;">Please find your donation invoice PDF attached to this email for your records.</div>
          <div style="margin-top:18px;font-size:15px;line-height:1.8;color:#334155;">
            <div style="font-weight:700;color:#0f172a;">With gratitude,</div>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:6px;">
              <tr>
                ${logoSrc ? `<td style="padding-right:8px;vertical-align:middle;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(siteName)} logo" width="18" height="18" style="display:block;border-radius:9999px;object-fit:cover;"/></td>` : ''}
                <td style="vertical-align:middle;font-weight:800;color:#0f172a;">${escapeHtml(siteName)}</td>
              </tr>
            </table>
            ${siteAddress ? `<div><strong style="color:#0f172a;">Address:</strong> ${escapeHtml(siteAddress)}</div>` : ''}
            ${sitePhone ? `<div><strong style="color:#0f172a;">Phone:</strong> ${escapeHtml(sitePhone)}</div>` : ''}
          </div>
        </td>
      </tr>
    </table>
  </div>`;

  return { donorEmail, donorName, subject, text, html, receiptId, campaignName, amountText, donationDateLabel };
};

const sendDonationInvoiceEmail = async ({
  donation = {},
  campaignDescription = '',
  organizationName = '',
  address = '',
  phone = '',
  fileName = '',
  attachmentBase64 = ''
} = {}) => {
  if (!donationInvoiceWebhookUrl) {
    const error = new Error('Donation email webhook is not configured.');
    error.status = 503;
    throw error;
  }

  if (!eventsDb.hasDatabaseConnection) {
    const error = new Error('Database is not configured. Donation invoice emails require PostgreSQL data.');
    error.status = 503;
    throw error;
  }

  const requestedId = String(donation?.id || '').trim();
  const requestedReceiptId = String(donation?.receiptId || '').trim();
  if (!requestedId && !requestedReceiptId) {
    const error = new Error('Donation id or receiptId is required.');
    error.status = 400;
    throw error;
  }

  const persistedDonations = await eventsDb.getDonations();
  const persistedDonation = (Array.isArray(persistedDonations) ? persistedDonations : []).find((entry) => {
    const entryId = String(entry?.id || '').trim();
    const entryReceiptId = String(entry?.receiptId || '').trim();
    return (requestedId && entryId === requestedId) || (requestedReceiptId && entryReceiptId === requestedReceiptId);
  });

  if (!persistedDonation) {
    const error = new Error('Donation record not found in database.');
    error.status = 404;
    throw error;
  }

  const normalizedAttachment = String(attachmentBase64 || '').trim();
  if (!normalizedAttachment) {
    const error = new Error('Invoice attachment is required.');
    error.status = 400;
    throw error;
  }

  let attachmentBuffer = null;
  try {
    attachmentBuffer = Buffer.from(normalizedAttachment, 'base64');
  } catch {
    attachmentBuffer = null;
  }

  if (!attachmentBuffer || !attachmentBuffer.length || String(attachmentBuffer.slice(0, 4)) !== '%PDF') {
    const error = new Error('Invalid PDF attachment payload.');
    error.status = 400;
    throw error;
  }

  const canonicalAttachmentBase64 = attachmentBuffer.toString('base64');

  const template = buildDonationInvoiceEmail({
    donation: persistedDonation,
    organizationName,
    campaignDescription,
    address,
    phone
  });

  if (!isValidEmailAddress(template.donorEmail)) {
    const error = new Error('Valid donor email is required.');
    error.status = 400;
    throw error;
  }

  const normalizedFileName = String(fileName || '').trim() || `invoice-${template.receiptId || Date.now()}.pdf`;
  const attachmentDataUrl = `data:application/pdf;base64,${canonicalAttachmentBase64}`;
  const normalizedAttachmentPayload = {
    filename: normalizedFileName,
    contentType: 'application/pdf',
    content: canonicalAttachmentBase64,
    encoding: 'base64',
    disposition: 'attachment'
  };

  const payload = {
    type: 'donation-invoice',
    to: template.donorEmail,
    email: template.donorEmail,
    name: template.donorName,
    subject: template.subject,
    message: template.text,
    text: template.text,
    html: template.html,
    bodyHtml: template.html,
    bodyText: template.text,
    templateType: 'html',
    attachments: [normalizedAttachmentPayload],
    invoicePdfFileName: normalizedFileName,
    invoicePdfDataUrl: attachmentDataUrl,
    metadata: {
      campaignName: template.campaignName,
      amount: template.amountText,
      donationDate: template.donationDateLabel,
      receiptId: template.receiptId,
      organizationName: String(organizationName || volunteerReminderSiteName || '').trim(),
      address: String(address || '').trim(),
      phone: String(phone || '').trim()
    },
    sentAt: new Date().toISOString()
  };

  try {
    const response = await deliverWorkflowEmail(donationInvoiceWebhookUrl, payload);

    if (!response.ok) {
      const upstreamBody = await response.text().catch(() => '');
      const snippet = String(upstreamBody || '').trim().slice(0, 240);
      const message = snippet
        ? `Donation invoice email service returned ${response.status}: ${snippet}`
        : `Donation invoice email service returned ${response.status}.`;
      const error = new Error(message);
      error.status = 502;
      throw error;
    }

    return {
      sent: true,
      to: template.donorEmail,
      subject: template.subject,
      fileName: normalizedFileName
    };
  } catch (error) {
    if (error?.status) {
      throw error;
    }
    const wrapped = new Error('Unable to send donation invoice email right now.');
    wrapped.status = 502;
    throw wrapped;
  }
};

const buildBulkDonationStatementEmail = ({
  donor = {},
  donations = [],
  campaignName = '',
  dateFrom = '',
  dateTo = '',
  organizationName = '',
  address = '',
  phone = ''
}) => {
  const donorName = String(donor.name || 'Sangat Member').trim();
  const donorEmail = String(donor.email || '').trim().toLowerCase();
  const siteName = String(organizationName || volunteerReminderSiteName || defaultOrganizationName).trim();
  const totalAmount = donations.reduce((sum, donation) => sum + Number(donation?.amount || 0), 0);
  const amountText = `$${totalAmount.toFixed(2)}`;
  const periodText = dateFrom || dateTo
    ? `${dateFrom || 'Beginning'} to ${dateTo || 'Present'}`
    : 'All dates';
  const normalizedCampaignName = String(campaignName || 'All campaigns').trim();
  const subject = `Donation Statement - ${periodText}`;
  const logoSrc = emailLogoSrc;
  const text = [
    `Sat Sri Akal ${donorName},`,
    '',
    'Please find your consolidated donation statement attached.',
    `Campaign: ${normalizedCampaignName}`,
    `Statement period: ${periodText}`,
    `Donations: ${donations.length}`,
    `Total: ${amountText}`,
    '',
    'Thank you for your generous support and seva.',
    String(address || '').trim() ? `Address: ${String(address).trim()}` : '',
    String(phone || '').trim() ? `Phone: ${String(phone).trim()}` : '',
    '',
    siteName
  ].filter(Boolean).join('\n');
  const html = `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr><td style="padding:16px 22px;background:#0a4d9f;color:#ffffff;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          ${logoSrc ? `<td style="padding-right:12px;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(siteName)} logo" width="44" height="44" style="display:block;border-radius:9999px;object-fit:cover;background:#ffffff;"/></td>` : ''}
          <td><div style="font-size:13px;font-weight:700;">${escapeHtml(siteName)}</div><div style="font-size:20px;font-weight:800;margin-top:3px;">Donation Statement</div></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px;">
        <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">Sat Sri Akal ${escapeHtml(donorName)},</p>
        <p style="font-size:15px;line-height:1.7;color:#334155;">Please find your consolidated donation statement attached. Thank you for your generous support and seva.</p>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top:18px;border:1px solid #c7dcf7;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:10px 12px;background:#edf4ff;font-weight:700;color:#1e3a8a;">Campaign</td><td style="padding:10px 12px;">${escapeHtml(normalizedCampaignName)}</td></tr>
          <tr><td style="padding:10px 12px;background:#edf4ff;font-weight:700;color:#1e3a8a;">Period</td><td style="padding:10px 12px;">${escapeHtml(periodText)}</td></tr>
          <tr><td style="padding:10px 12px;background:#edf4ff;font-weight:700;color:#1e3a8a;">Donations</td><td style="padding:10px 12px;">${donations.length}</td></tr>
          <tr><td style="padding:10px 12px;background:#edf4ff;font-weight:700;color:#1e3a8a;">Total</td><td style="padding:10px 12px;font-weight:700;">${escapeHtml(amountText)}</td></tr>
        </table>
        <p style="margin:20px 0 0;font-size:14px;color:#475569;">With gratitude,<br/><strong>${escapeHtml(siteName)}</strong></p>
      </td></tr>
    </table>
  </div>`;

  return { donorName, donorEmail, subject, text, html, amountText, periodText, campaignName: normalizedCampaignName };
};

const sendBulkDonationStatementEmail = async ({
  donor = {},
  donationIds = [],
  campaignName = '',
  dateFrom = '',
  dateTo = '',
  organizationName = '',
  address = '',
  phone = '',
  fileName = '',
  attachmentBase64 = ''
} = {}) => {
  if (!donationInvoiceWebhookUrl) {
    const error = new Error('Donation email webhook is not configured.');
    error.status = 503;
    throw error;
  }
  if (!eventsDb.hasDatabaseConnection) {
    const error = new Error('Database is not configured. Donation statement emails require database records.');
    error.status = 503;
    throw error;
  }

  const requestedIds = Array.from(new Set(donationIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const persistedDonations = await eventsDb.getDonations();
  const donationMap = new Map((Array.isArray(persistedDonations) ? persistedDonations : []).map((entry) => [String(entry?.id || '').trim(), entry]));
  const selectedDonations = requestedIds.map((id) => donationMap.get(id)).filter(Boolean);
  if (selectedDonations.length !== requestedIds.length) {
    const error = new Error('One or more donation records were not found in the database.');
    error.status = 404;
    throw error;
  }

  const donorEmail = String(donor.email || '').trim().toLowerCase();
  if (!isValidEmailAddress(donorEmail)) {
    const error = new Error('Valid donor email is required.');
    error.status = 400;
    throw error;
  }
  const containsAnotherDonor = selectedDonations.some((donation) => String(donation?.donorEmail || '').trim().toLowerCase() !== donorEmail);
  if (containsAnotherDonor) {
    const error = new Error('All selected donations must belong to the same donor email.');
    error.status = 400;
    throw error;
  }

  const normalizedAttachment = String(attachmentBase64 || '').trim();
  const attachmentBuffer = Buffer.from(normalizedAttachment, 'base64');
  if (!attachmentBuffer.length || String(attachmentBuffer.slice(0, 4)) !== '%PDF') {
    const error = new Error('Invalid PDF attachment payload.');
    error.status = 400;
    throw error;
  }

  const template = buildBulkDonationStatementEmail({
    donor,
    donations: selectedDonations,
    campaignName,
    dateFrom,
    dateTo,
    organizationName,
    address,
    phone
  });
  const normalizedFileName = String(fileName || '').trim() || `donation-statement-${Date.now()}.pdf`;
  const canonicalAttachmentBase64 = attachmentBuffer.toString('base64');
  const payload = {
    type: 'donation-statement',
    to: template.donorEmail,
    email: template.donorEmail,
    name: template.donorName,
    subject: template.subject,
    message: template.text,
    text: template.text,
    html: template.html,
    bodyHtml: template.html,
    bodyText: template.text,
    templateType: 'html',
    attachments: [{ filename: normalizedFileName, contentType: 'application/pdf', content: canonicalAttachmentBase64, encoding: 'base64', disposition: 'attachment' }],
    invoicePdfFileName: normalizedFileName,
    invoicePdfDataUrl: `data:application/pdf;base64,${canonicalAttachmentBase64}`,
    metadata: {
      campaignName: template.campaignName,
      donationCount: selectedDonations.length,
      amount: template.amountText,
      statementPeriod: template.periodText,
      organizationName: String(organizationName || volunteerReminderSiteName || '').trim()
    },
    sentAt: new Date().toISOString()
  };
  const response = await deliverWorkflowEmail(donationInvoiceWebhookUrl, payload);

  if (!response.ok) {
    const error = new Error(`Donation statement email service returned ${response.status}.`);
    error.status = 502;
    throw error;
  }
  return { sent: true, to: template.donorEmail, subject: template.subject, fileName: normalizedFileName };
};

const shouldRunEventReminderSweep = (date = new Date()) => {
  const nowParts = getDatePartsInTimeZone(date, eventReminderTimeZone);
  const todayDateKey = toDateKeyFromParts(nowParts);
  const nowMinutes = (nowParts.hour * 60) + nowParts.minute;
  const scheduledMinutes = (eventReminderSendTime.hour * 60) + eventReminderSendTime.minute;

  if (eventReminderLastRunDateKey === todayDateKey) {
    return false;
  }

  return nowMinutes >= scheduledMinutes;
};

const runEventReminderSweep = async (options = {}) => {
  if (eventReminderSweepRunning) {
    return { processed: 0, sent: 0, skipped: 0, reason: 'already_running' };
  }

  eventReminderSweepRunning = true;
  const force = options.force === true;

  try {
    const registrations = await getEventRegistrationsForReminder();
    const logStore = readEventReminderLog();
    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const registration of registrations) {
      processed += 1;

      if (!registration.id || !registration.email || !registration.eventDate || !isValidEmailAddress(registration.email)) {
        skipped += 1;
        continue;
      }

      if (registration.status === 'cancelled') {
        skipped += 1;
        continue;
      }

      const daysRemaining = getDaysUntilDate(registration.eventDate);
      if (daysRemaining == null || !eventReminderDays.includes(daysRemaining)) {
        skipped += 1;
        continue;
      }

      const reminderKey = `${registration.id}:${registration.eventId}:${registration.eventDate}:${daysRemaining}`;
      if (!force && logStore.sent[reminderKey]) {
        skipped += 1;
        continue;
      }

      const result = await sendEventReminderEmail(registration, { daysRemaining });
      if (!result.sent) {
        skipped += 1;
        continue;
      }

      sent += 1;
      logStore.sent[reminderKey] = new Date().toISOString();
    }

    writeEventReminderLog(logStore);
    return { processed, sent, skipped, force, webhookConfigured: Boolean(eventReminderWebhookUrl) };
  } finally {
    eventReminderSweepRunning = false;
  }
};

const runScheduledEventReminderSweep = async () => {
  if (!shouldRunEventReminderSweep()) {
    return null;
  }

  const result = await runEventReminderSweep();
  const nowParts = getDatePartsInTimeZone(new Date(), eventReminderTimeZone);
  eventReminderLastRunDateKey = toDateKeyFromParts(nowParts);
  return result;
};

const normalizeBookingForNotification = (entry = {}) => ({
  ...entry,
  id: String(entry.id || '').trim(),
  requesterName: String(entry.requesterName || 'Sangat Member').trim(),
  requesterEmail: String(entry.requesterEmail || '').trim().toLowerCase(),
  dutyAssigneeId: String(entry.dutyAssigneeId || '').trim(),
  dutyAssigneeName: String(entry.dutyAssigneeName || '').trim(),
  dutyAssigneeEmail: String(entry.dutyAssigneeEmail || '').trim().toLowerCase(),
  dutyAssignees: (Array.isArray(entry.dutyAssignees) ? entry.dutyAssignees : []).map((assignee) => ({
    userId: String(assignee?.userId || '').trim(),
    name: String(assignee?.name || '').trim(),
    email: String(assignee?.email || '').trim().toLowerCase(),
    dutyType: String(assignee?.dutyType || '').trim(),
    bookingItemCategoryId: String(assignee?.bookingItemCategoryId || '').trim(),
    dutyCategoryId: String(assignee?.dutyCategoryId || '').trim()
  })),
  categoryName: [...new Set((Array.isArray(entry.itemizedItems) ? entry.itemizedItems : [])
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean))].join(', ') || String(entry.categoryName || entry.title || 'Booking').trim(),
  occasionType: String(entry.occasionType || '').trim(),
  createdByName: String(entry.createdByName || entry.bookedByName || '').trim(),
  date: String(entry.date || '').trim(),
  toDate: String(entry.toDate || entry.date || '').trim(),
  startTime: String(entry.startTime || '').trim(),
  endTime: String(entry.endTime || '').trim(),
  bookingVenueType: getBookingVenueType(entry),
  hidePublicLocation: entry.hidePublicLocation === true,
  bookingLocation: String(entry.bookingLocation || entry.location || defaultOrganizationName).trim(),
  status: String(entry.status || '').trim().toLowerCase() === 'completed'
    ? 'confirmed'
    : String(entry.status || 'pending').trim().toLowerCase(),
  paymentStatus: String(entry.paymentStatus || 'pending').trim().toLowerCase(),
  paymentMethod: String(entry.paymentMethod || entry.paymentProvider || 'Not selected').trim(),
  amount: Number(entry.amount || 0),
  receiptNumber: String(entry.receiptNumber || '').trim(),
  paymentReference: String(entry.paymentReference || '').trim(),
  refundStatus: String(entry.refundStatus || '').trim().toLowerCase(),
  refundAmount: Math.max(0, Number(entry.refundAmount || 0)),
  refundMethod: String(entry.refundMethod || '').trim(),
  refundReference: String(entry.refundReference || '').trim(),
  refundDate: String(entry.refundDate || '').trim(),
  refundNotes: String(entry.refundNotes || '').trim()
});

const buildBookingDutyBriefingEmail = ({ recipient, bookings, role, daysRemaining = null }) => {
  const rows = bookings.map((booking) => {
    const normalized = normalizeBookingForNotification(booking);
    const assignments = normalized.dutyAssignees.filter((entry) => (
      (String(entry.userId || '').trim() && String(entry.userId).trim() === String(recipient.id || '').trim())
      || (String(entry.email || '').trim() && String(entry.email).trim().toLowerCase() === String(recipient.email || '').trim().toLowerCase())
    ));
    const dutyType = [...new Set(assignments.map((entry) => String(entry.dutyType || '').trim()).filter(Boolean))].join(', ');
    return {
      ...normalized,
      dutyType,
      dateLabel: normalized.toDate && normalized.toDate !== normalized.date ? `${normalized.date} to ${normalized.toDate}` : normalized.date,
      requesterPhone: String(booking.requesterPhone || '').trim(),
      requesterAddress: String(booking.requesterAddress || '').trim(),
      notes: String(booking.notes || '').trim()
    };
  });
  const isReminder = Number.isFinite(Number(daysRemaining));
  const reminderLabel = isReminder ? `${Number(daysRemaining)} day${Number(daysRemaining) === 1 ? '' : 's'}` : '';
  const subject = rows.length === 1
    ? `${isReminder ? `Booking Duty Reminder (${reminderLabel})` : 'Booking Duty Briefing'}: ${rows[0].categoryName} on ${rows[0].date}`
    : `Upcoming Booking Duty Briefing (${rows.length} bookings)`;
  const text = [
    `Dear ${recipient.name || role},`,
    '',
    isReminder ? `This confirmed booking is scheduled in ${reminderLabel}:` : `The following confirmed booking${rows.length === 1 ? '' : 's'} require attention:`,
    '',
    ...rows.flatMap((booking) => [
      booking.dutyType ? `Your responsibilities: ${booking.dutyType}` : '',
      `${booking.categoryName} - ${booking.dateLabel}`,
      `Time: ${booking.startTime || 'TBD'}${booking.endTime ? ` - ${booking.endTime}` : ''}`,
      `Location: ${booking.bookingLocation}`,
      `Contact: ${booking.requesterName} | ${booking.requesterEmail || '-'} | ${booking.requesterPhone || '-'}`,
      booking.requesterAddress ? `Address: ${booking.requesterAddress}` : '',
      booking.notes ? `Notes: ${booking.notes}` : '',
      ''
    ]),
    'Please sign in to the Booking Duties page for full details.',
    volunteerReminderSiteName
  ].filter(Boolean).join('\n');
  const htmlRows = rows.map((booking) => `
    <div style="margin:0 0 14px;border:1px solid #d7e3f3;border-radius:10px;overflow:hidden;">
      <div style="background:#eef5ff;padding:11px 13px;font-weight:800;color:#0a4d9f;">${escapeHtml(booking.categoryName)} · ${escapeHtml(booking.dateLabel)}</div>
      <div style="padding:12px 13px;line-height:1.7;color:#334155;">${booking.dutyType ? `<strong>Your responsibilities:</strong> ${escapeHtml(booking.dutyType)}<br/>` : ''}<strong>Time:</strong> ${escapeHtml(booking.startTime || 'TBD')}${booking.endTime ? ` - ${escapeHtml(booking.endTime)}` : ''}<br/><strong>Location:</strong> ${escapeHtml(booking.bookingLocation)}<br/><strong>Contact:</strong> ${escapeHtml(booking.requesterName)} · ${escapeHtml(booking.requesterEmail || '-')} · ${escapeHtml(booking.requesterPhone || '-')}<br/>${booking.requesterAddress ? `<strong>Address:</strong> ${escapeHtml(booking.requesterAddress)}<br/>` : ''}${booking.notes ? `<strong>Notes:</strong> ${escapeHtml(booking.notes)}` : ''}</div>
    </div>`).join('');
  const html = `<div style="background:#f5f8fc;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;"><div style="max-width:720px;margin:auto;background:white;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;"><div style="padding:18px 22px;background:#0a4d9f;color:white;"><div style="font-size:12px;font-weight:700;text-transform:uppercase;">${escapeHtml(volunteerReminderSiteName)}</div><div style="margin-top:4px;font-size:21px;font-weight:800;">${isReminder ? `Booking Duty Reminder · ${escapeHtml(reminderLabel)}` : 'Booking Duty Briefing'}</div></div><div style="padding:22px;"><p style="font-size:16px;font-weight:700;">Dear ${escapeHtml(recipient.name || role)},</p><p style="color:#475569;line-height:1.7;">${isReminder ? `This confirmed booking is scheduled in ${escapeHtml(reminderLabel)}.` : `The following confirmed booking${rows.length === 1 ? '' : 's'} require attention.`}</p>${htmlRows}<p style="color:#64748b;font-size:12px;">Please sign in to the Booking Duties page for full details.</p></div></div></div>`;
  return { subject, text, html };
};

const resolveBookingDutyRecipients = async () => {
  const [users, roleDefinitions] = await Promise.all([
    eventsDb.listItems('users'),
    eventsDb.getSingleton('admin_roles', [])
  ]);
  const dutyPath = '/admin/booking-duties';
  const dutyRoles = new Set((Array.isArray(roleDefinitions) ? roleDefinitions : [])
    .filter((entry) => Array.isArray(entry?.adminPageAccess) && entry.adminPageAccess.includes(dutyPath))
    .map((entry) => String(entry?.name || '').trim().toLowerCase())
    .filter(Boolean));
  const recipients = (Array.isArray(users) ? users : []).filter((user) => {
    const role = String(user.role || '').trim();
    const normalizedRole = role.toLowerCase();
    const hasDutyAccess = dutyRoles.has(normalizedRole);
    return !['admin', 'super admin'].includes(normalizedRole)
      && hasDutyAccess
      && user.isActive !== false
      && String(user.approvalStatus || 'approved').trim().toLowerCase() === 'approved'
      && isValidEmailAddress(String(user.email || '').trim());
  });
  const roleLabel = [...dutyRoles].join(', ') || 'Booking Duties';
  return { recipients, roleLabel };
};

const isRecipientAssignedToBooking = (recipient, booking) => {
  const assignees = Array.isArray(booking?.dutyAssignees) ? booking.dutyAssignees : [];
  if (assignees.some((assignee) => (
    (String(assignee.userId || '').trim() && String(recipient?.id || '').trim() === String(assignee.userId).trim())
    || (String(assignee.email || '').trim() && String(recipient?.email || '').trim().toLowerCase() === String(assignee.email).trim().toLowerCase())
  ))) return true;
  const assigneeId = String(booking?.dutyAssigneeId || '').trim();
  const assigneeEmail = String(booking?.dutyAssigneeEmail || '').trim().toLowerCase();
  if (assigneeId) return String(recipient?.id || '').trim() === assigneeId;
  return Boolean(assigneeEmail) && String(recipient?.email || '').trim().toLowerCase() === assigneeEmail;
};

const enforceEligibleBookingDutyAssignee = async (booking = {}) => {
  const requestedAssignees = Array.isArray(booking.dutyAssignees) && booking.dutyAssignees.length
    ? booking.dutyAssignees
    : booking.dutyAssigneeId ? [{
      userId: booking.dutyAssigneeId,
      name: booking.dutyAssigneeName,
      email: booking.dutyAssigneeEmail,
      dutyType: ''
    }] : [];
  if (!requestedAssignees.length) return { ...booking, dutyAssignees: [] };
  const { recipients } = await resolveBookingDutyRecipients();
  const dutyAssignees = requestedAssignees.map((requested) => {
    const assigneeId = String(requested?.userId || requested?.id || '').trim();
    const assignee = recipients.find((recipient) => String(recipient.id || '').trim() === assigneeId);
    assertInput(Boolean(assignee), 'Every duty performer must be an active user with access to Booking Duties.');
    return {
      userId: assigneeId,
      name: String(assignee.name || assignee.email || '').trim(),
      email: String(assignee.email || '').trim().toLowerCase(),
      dutyType: String(requested?.dutyType || '').trim().slice(0, 80),
      bookingItemCategoryId: String(requested?.bookingItemCategoryId || '').trim(),
      dutyCategoryId: String(requested?.dutyCategoryId || '').trim()
    };
  });
  const firstAssignee = dutyAssignees[0];
  return {
    ...booking,
    dutyAssignees,
    dutyAssigneeId: firstAssignee.userId,
    dutyAssigneeName: firstAssignee.name,
    dutyAssigneeEmail: firstAssignee.email
  };
};

const sendBookingDutyBriefingEmail = async ({ recipient, bookings, role, scope = 'single', daysRemaining = null }) => {
  const template = buildBookingDutyBriefingEmail({ recipient, bookings, role, daysRemaining });
  return deliverWorkflowEmail(bookingReminderWebhookUrl, {
    type: Number.isFinite(Number(daysRemaining)) ? 'booking-duty-reminder' : 'booking-duty-briefing',
    to: recipient.email,
    name: recipient.name,
    subject: template.subject,
    text: template.text,
    html: template.html,
    metadata: {
      role,
      scope,
      reminderDays: Number.isFinite(Number(daysRemaining)) ? Number(daysRemaining) : null,
      bookingIds: bookings.map((booking) => booking.id)
    }
  });
};

const enforceBookingPaymentStatus = (entry = {}) => {
  const paymentStatus = String(entry.paymentStatus || 'pending').trim().toLowerCase();
  const rawStatus = String(entry.status || 'pending').trim().toLowerCase();
  const allowedStatus = ['pending', 'confirmed', 'cancelled'].includes(rawStatus) ? rawStatus : 'pending';
  const paymentProvider = String(entry.paymentProvider || entry.paymentMethod || '').trim().toUpperCase();
  const isOnlineBooking = String(entry.source || '').trim().toLowerCase() === 'public'
    && (['STRIPE', 'ZEFFY'].includes(paymentProvider) || Boolean(String(entry.donationPendingId || '').trim()));
  return {
    ...entry,
    paymentStatus,
    status: rawStatus === 'cancelled'
      ? 'cancelled'
      : paymentStatus === 'paid' && !isOnlineBooking
        ? 'confirmed'
        : rawStatus === 'completed'
          ? 'confirmed'
          : allowedStatus
  };
};

const parseScheduleDateTime = (dateValue, timeValue = '') => {
  const rawDate = String(dateValue || '').trim();
  const rawTime = String(timeValue || '').trim();
  const combined = rawTime && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? `${rawDate}T${rawTime}:00`
    : rawDate;
  const parsed = new Date(combined);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isAkhandPathBooking = (entry = {}) => (
  /akhand\s*(paath|path)/i.test([
    entry.categoryName,
    entry.title,
    ...(Array.isArray(entry.itemizedItems) ? entry.itemizedItems.map((item) => item?.name) : [])
  ].filter(Boolean).join(' '))
);

const isJathaBooking = (entry = {}) => /kirtan|dhadhi\s*jatha|dhadi\s*jatha/i.test([
  entry.categoryName,
  entry.title,
  ...(Array.isArray(entry.itemizedItems) ? entry.itemizedItems.map((item) => item?.name) : [])
].filter(Boolean).join(' ')) && !isAkhandPathBooking(entry);

const isFinalDayJathaPair = (first = {}, second = {}) => (
  (isAkhandPathBooking(first) && isJathaBooking(second)
    && String(second.date || '').slice(0, 10) === String(first.toDate || first.date || '').slice(0, 10)
    && String(second.toDate || second.endDate || second.date || '').slice(0, 10) === String(first.toDate || first.date || '').slice(0, 10))
  || (isAkhandPathBooking(second) && isJathaBooking(first)
    && String(first.date || '').slice(0, 10) === String(second.toDate || second.date || '').slice(0, 10)
    && String(first.toDate || first.endDate || first.date || '').slice(0, 10) === String(second.toDate || second.date || '').slice(0, 10))
);

const getScheduleIntervals = (entry = {}, kind = 'booking') => {
  if (kind === 'event') {
    const start = parseScheduleDateTime(entry.date);
    const explicitEnd = parseScheduleDateTime(entry.endDate);
    const end = explicitEnd || (start ? new Date(start.getTime() + (60 * 60 * 1000)) : null);
    return start && end && end > start ? [{ start, end }] : [];
  }

  const startDate = String(entry.date || '').trim();
  const endDate = String(entry.toDate || entry.date || '').trim();
  const fullDay = isAkhandPathBooking(entry);
  const startTime = fullDay ? '00:00' : String(entry.startTime || '').trim();
  const endTime = fullDay ? '24:00' : String(entry.endTime || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return [];
  }
  const firstDay = parseScheduleDateTime(startDate, startTime);
  const lastDay = parseScheduleDateTime(endDate, startTime);
  if (!firstDay || !lastDay || lastDay < firstDay) return [];
  const intervals = [];
  const cursor = new Date(firstDay);
  while (cursor <= lastDay && intervals.length < 3660) {
    const dateKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    const start = parseScheduleDateTime(dateKey, startTime);
    const end = fullDay
      ? new Date(start.getTime() + (24 * 60 * 60 * 1000))
      : parseScheduleDateTime(dateKey, endTime);
    if (start && end && end > start) intervals.push({ start, end });
    cursor.setDate(cursor.getDate() + 1);
  }
  return intervals;
};

const schedulesOverlap = (firstIntervals, secondIntervals) => firstIntervals.some((first) => (
  secondIntervals.some((second) => first.start < second.end && second.start < first.end)
));

const isValidScheduleDate = (value) => {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};

const isValidScheduleTime = (value) => {
  const time = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const assertNoScheduleOverlap = async (candidate, { kind = 'booking', excludeId = '' } = {}) => {
  if ((kind === 'booking' && String(candidate.status || '').trim().toLowerCase() === 'cancelled')
    || (kind === 'event' && (candidate.active === false || candidate.isActive === false))) {
    return;
  }
  if (kind === 'booking') {
    const startDate = String(candidate.date || '').trim();
    const endDate = String(candidate.toDate || candidate.date || '').trim();
    const fullDay = isAkhandPathBooking(candidate);
    assertInput(isValidScheduleDate(startDate) && isValidScheduleDate(endDate) && endDate >= startDate,
      'Booking start and end dates must be valid, and the end date cannot be before the start date.');
    assertInput(fullDay || (isValidScheduleTime(candidate.startTime) && isValidScheduleTime(candidate.endTime)
      && candidate.endTime > candidate.startTime),
    'Booking start and end times must be valid, and the end time must be later than the start time.');
  }
  const candidateIntervals = getScheduleIntervals(candidate, kind);
  assertInput(candidateIntervals.length > 0, kind === 'event'
    ? 'Event start and end date/time must form a valid interval.'
    : 'Booking dates and times must form a valid interval.');

  const [bookings, events] = await Promise.all([
    eventsDb.listItems('bookings'),
    eventsDb.getEvents()
  ]);
  const conflicts = [];
  const dutyConflicts = [];
  const candidateAssignees = [
    ...(Array.isArray(candidate.dutyAssignees) ? candidate.dutyAssignees : []),
    ...(candidate.dutyAssigneeId ? [{ userId: candidate.dutyAssigneeId, email: candidate.dutyAssigneeEmail, name: candidate.dutyAssigneeName }] : [])
  ];
  for (const booking of Array.isArray(bookings) ? bookings : []) {
    if (kind === 'booking' && String(booking.id || '') === String(excludeId || '')) continue;
    if (String(booking.status || '').trim().toLowerCase() === 'cancelled') continue;
    if (schedulesOverlap(candidateIntervals, getScheduleIntervals(booking, 'booking'))) {
      const bookingAssignees = [
        ...(Array.isArray(booking.dutyAssignees) ? booking.dutyAssignees : []),
        ...(booking.dutyAssigneeId ? [{ userId: booking.dutyAssigneeId, email: booking.dutyAssigneeEmail, name: booking.dutyAssigneeName }] : [])
      ];
      const sharedAssignee = candidateAssignees.find((candidateAssignee) => bookingAssignees.some((bookingAssignee) => (
        (String(candidateAssignee.userId || '').trim() && String(candidateAssignee.userId).trim() === String(bookingAssignee.userId || '').trim())
        || (String(candidateAssignee.email || '').trim() && String(candidateAssignee.email).trim().toLowerCase() === String(bookingAssignee.email || '').trim().toLowerCase())
      )));
      if (isFinalDayJathaPair(candidate, booking) && !sharedAssignee) continue;
      if (sharedAssignee) {
        dutyConflicts.push(`${String(sharedAssignee.name || 'The selected duty performer').trim()} is already assigned to ${String(booking.categoryName || booking.title || 'another booking').trim()}`);
      } else {
        conflicts.push(isAkhandPathBooking(candidate)
          ? `Akhand Path reserves the selected dates as full days and overlaps ${String(booking.categoryName || booking.title || 'another booking').trim()}. Only Kirtan or Dhadhi Jatha can be scheduled on its final day.`
          : isAkhandPathBooking(booking)
            ? `Akhand Path reserves ${String(booking.date || '').slice(0, 10)}${booking.toDate && booking.toDate !== booking.date ? ` through ${String(booking.toDate).slice(0, 10)}` : ''} as full days. Only Kirtan or Dhadhi Jatha can be scheduled on its final day.`
            : String(booking.categoryName || booking.title || 'booking').trim());
      }
    }
  }
  for (const event of Array.isArray(events) ? events : []) {
    if (kind === 'event' && String(event.id || '') === String(excludeId || '')) continue;
    if (event.active === false || event.isActive === false) continue;
    if (schedulesOverlap(candidateIntervals, getScheduleIntervals(event, 'event'))) {
      if (isFinalDayJathaPair(candidate, event)) continue;
      conflicts.push(String(event.title || 'event').trim());
    }
  }
  const conflictMessage = dutyConflicts[0] || conflicts[0];
  assertInput(!conflictMessage, `This schedule overlaps with ${conflictMessage}. Choose a different date or time.`, 409);
};

const shouldDelayBookingEmailUntilPayment = (booking = {}) => {
  const provider = String(booking.paymentProvider || booking.paymentMethod || '').trim().toUpperCase();
  return String(booking.source || '').trim().toLowerCase() === 'public'
    && ['STRIPE', 'ZEFFY'].includes(provider)
    && String(booking.paymentStatus || 'pending').trim().toLowerCase() !== 'paid'
    && Number(booking.amount || 0) > 0;
};

const toBookingDisplayLabel = (value, fallback = '-') => {
  const normalized = String(value || '').trim();
  return normalized
    ? normalized.toLowerCase().replace(/[-_]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
    : fallback;
};

const buildBookingReceiptPdfAttachment = (booking = {}) => {
  const normalized = normalizeBookingForNotification(booking);
  const isRefundReleased = normalized.status === 'cancelled' && normalized.refundStatus === 'processed';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const receiptNumber = normalized.receiptNumber || normalized.id || 'Pending';
  const logoPath = String(process.env.ORGANIZATION_LOGO_PATH || '').trim();

  doc.setFillColor(0, 64, 129);
  doc.rect(0, 0, pageWidth, 112, 'F');
  if (fs.existsSync(logoPath)) {
    try {
      const extension = path.extname(logoPath).toLowerCase();
      const format = extension === '.png' ? 'PNG' : extension === '.jpg' || extension === '.jpeg' ? 'JPEG' : 'WEBP';
      doc.addImage(fs.readFileSync(logoPath).toString('base64'), format, 34, 24, 62, 62);
    } catch {
      // Keep the branded header when the optional logo cannot be decoded.
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(volunteerReminderSiteName, 112, 42);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  if (defaultOrganizationAddress) doc.text(defaultOrganizationAddress, 112, 60);
  const organizationContacts = [defaultOrganizationPhone, defaultOrganizationEmail].filter(Boolean).join(' | ');
  if (organizationContacts) doc.text(organizationContacts, 112, 77);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isRefundReleased ? 15 : 18);
  doc.text(isRefundReleased ? 'Refund Release Confirmation' : 'Booking Receipt', pageWidth - 34, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Receipt: ${receiptNumber}`, pageWidth - 34, 61, { align: 'right' });
  doc.text(`Prepared: ${new Date().toLocaleDateString('en-CA')}`, pageWidth - 34, 77, { align: 'right' });

  autoTable(doc, {
    startY: 140,
    head: [['Booking Information', 'Details']],
    body: [
      ['Occasion', normalized.occasionType || normalized.categoryName],
      ['Date', normalized.date || '-'],
      ['Time', `${normalized.startTime || '-'} - ${normalized.endTime || '-'}`],
      ['Location', normalized.bookingLocation],
      ['Booking Status', toBookingDisplayLabel(normalized.status)],
      ['Booking ID', normalized.id || '-']
    ],
    styles: { fontSize: 10, cellPadding: 8, valign: 'top' },
    headStyles: { fillColor: [0, 64, 129], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold', fillColor: [238, 245, 255], textColor: [0, 64, 129] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  autoTable(doc, {
    startY: (doc.lastAutoTable?.finalY || 330) + 24,
    head: [['Payment Information', 'Details']],
    body: [
      ['Payment Status', toBookingDisplayLabel(normalized.paymentStatus)],
      ['Payment Method', toBookingDisplayLabel(normalized.paymentMethod)],
      ['Amount', `CAD ${normalized.amount.toFixed(2)}`],
      ['Receipt Number', normalized.receiptNumber || 'Not assigned'],
      ['Payment Reference', normalized.paymentReference || '-'],
      ...(normalized.status === 'cancelled' ? [
        ['Refund Status', isRefundReleased ? 'Released' : toBookingDisplayLabel(normalized.refundStatus, 'Not required')],
        ['Refund Amount', `CAD ${normalized.refundAmount.toFixed(2)}`],
        ['Refund Method', toBookingDisplayLabel(normalized.refundMethod)],
        ['Refund Reference', normalized.refundReference || '-'],
        ['Refund Date', normalized.refundDate || '-']
      ] : [])
    ],
    styles: { fontSize: 10, cellPadding: 8, valign: 'top' },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 140, fontStyle: 'bold', fillColor: [248, 250, 252], textColor: [30, 41, 59] },
      1: { cellWidth: 'auto' }
    },
    theme: 'grid',
    margin: { left: 40, right: 40 }
  });

  const footerY = Math.min((doc.lastAutoTable?.finalY || 540) + 36, pageHeight - 70);
  doc.setDrawColor(203, 213, 225);
  doc.line(40, footerY - 16, pageWidth - 40, footerY - 16);
  doc.setTextColor(71, 85, 105);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(isRefundReleased
    ? 'This confirms that the refund listed above was released. Please retain this confirmation for your records.'
    : 'Please retain this receipt for your records. Contact the Gurdwara office if any details need correction.', 40, footerY, { maxWidth: pageWidth - 80 });

  const reference = String(receiptNumber).replace(/[^A-Za-z0-9_-]+/g, '-');
  return {
    filename: `${isRefundReleased ? 'refund-release' : 'booking-receipt'}-${reference}.pdf`,
    contentType: 'application/pdf',
    content: Buffer.from(doc.output('arraybuffer')).toString('base64'),
    disposition: 'attachment'
  };
};

const buildBookingNotificationEmail = ({ booking, daysRemaining = null, changeType = 'updated' }) => {
  const normalized = normalizeBookingForNotification(booking);
  const isReminder = Number.isFinite(daysRemaining);
  const isPaid = normalized.paymentStatus === 'paid';
  const isCancelled = normalized.status === 'cancelled';
  const refundProcessed = normalized.refundStatus === 'processed';
  const refundPending = normalized.refundStatus === 'pending';
  const isRefundReleased = isCancelled && refundProcessed && changeType === 'refund-released';
  const refundStatusLabel = refundProcessed ? 'Released' : toBookingDisplayLabel(normalized.refundStatus, 'Not required');
  const logoSrc = emailLogoSrc;
  const contactUrl = `${volunteerReminderBaseUrl}/contact`;
  const dateTimeLabel = `${normalized.date || 'Date TBD'}${normalized.startTime ? `, ${normalized.startTime}` : ''}${normalized.endTime ? ` - ${normalized.endTime}` : ''}`;
  const subject = isReminder
    ? `Booking Reminder (${daysRemaining} day${daysRemaining === 1 ? '' : 's'}): ${normalized.categoryName}`
    : isRefundReleased
      ? `Refund Released: ${normalized.categoryName}`
    : isCancelled
      ? `Booking Cancelled: ${normalized.categoryName}`
    : `${isPaid ? 'Payment Receipt' : `Booking ${changeType === 'created' ? 'Received' : 'Updated'}`}: ${normalized.categoryName}`;
  const intro = isReminder
    ? `Your booking is coming up in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}.`
    : isRefundReleased
      ? `Your refund of CAD ${normalized.refundAmount.toFixed(2)} has been released${normalized.refundDate ? ` on ${normalized.refundDate}` : ''}. Please allow your payment provider's standard processing time for the funds to appear in your account.`
    : isCancelled
      ? refundProcessed
        ? `Your booking has been cancelled. A refund of CAD ${normalized.refundAmount.toFixed(2)} was processed${normalized.refundDate ? ` on ${normalized.refundDate}` : ''}. Please allow your payment provider's standard processing time for the funds to appear.`
        : refundPending
          ? `Your booking has been cancelled. A refund of CAD ${normalized.refundAmount.toFixed(2)} is pending and the Gurdwara office will notify you after it has been processed.`
          : 'Your booking has been cancelled. No refund is required for this booking.'
    : isPaid
      ? 'Your payment was received successfully. Your updated booking receipt is attached.'
      : `Your booking record has been ${changeType === 'created' ? 'received' : 'updated'}.`;
  const text = [
    `Dear ${normalized.requesterName},`,
    '',
    intro,
    `Booking: ${normalized.categoryName}`,
    `Date and Time: ${dateTimeLabel}`,
    `Location: ${normalized.bookingLocation}`,
    `Booking Status: ${normalized.status}`,
    `Payment Status: ${normalized.paymentStatus}`,
    `Payment Method: ${normalized.paymentMethod}`,
    `Amount: CAD ${normalized.amount.toFixed(2)}`,
    normalized.receiptNumber ? `Receipt Number: ${normalized.receiptNumber}` : '',
    isCancelled ? `Refund Status: ${refundStatusLabel}` : '',
    isCancelled && normalized.refundAmount > 0 ? `Refund Amount: CAD ${normalized.refundAmount.toFixed(2)}` : '',
    isCancelled && normalized.refundMethod ? `Refund Method: ${normalized.refundMethod}` : '',
    isCancelled && normalized.refundReference ? `Refund Reference: ${normalized.refundReference}` : '',
    isCancelled && normalized.refundDate ? `Refund Date: ${normalized.refundDate}` : '',
    isCancelled && normalized.refundNotes ? `Refund Notes: ${normalized.refundNotes}` : '',
    '',
    'Please contact the Gurdwara office if any details need to be changed.',
    '',
    volunteerReminderSiteName
  ].filter(Boolean).join('\n');
  const rows = [
    ['Booking', normalized.categoryName],
    ['Date and Time', dateTimeLabel],
    ['Location', normalized.bookingLocation],
    ['Booking Status', toBookingDisplayLabel(normalized.status)],
    ['Payment Status', toBookingDisplayLabel(normalized.paymentStatus)],
    ['Payment Method', toBookingDisplayLabel(normalized.paymentMethod)],
    ['Amount', `CAD ${normalized.amount.toFixed(2)}`],
    ...(normalized.receiptNumber ? [['Receipt Number', normalized.receiptNumber]] : []),
    ...(isCancelled ? [
      ['Refund Status', refundStatusLabel],
      ...(normalized.refundAmount > 0 ? [['Refund Amount', `CAD ${normalized.refundAmount.toFixed(2)}`]] : []),
      ...(normalized.refundMethod ? [['Refund Method', toBookingDisplayLabel(normalized.refundMethod)]] : []),
      ...(normalized.refundReference ? [['Refund Reference', normalized.refundReference]] : []),
      ...(normalized.refundDate ? [['Refund Date', normalized.refundDate]] : [])
    ] : [])
  ];
  const html = `
    <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
      <table role="presentation" cellspacing="0" cellpadding="0" width="100%" style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:18px 24px;background:linear-gradient(90deg,#004081,#0b67c2,#e58b16);color:#ffffff;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>${logoSrc ? `<td style="padding-right:12px;"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(volunteerReminderSiteName)} logo" width="46" height="46" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}<td><div style="font-size:13px;font-weight:700;text-transform:uppercase;">${escapeHtml(volunteerReminderSiteName)}</div><div style="margin-top:3px;font-size:21px;font-weight:800;">${isReminder ? 'Booking Reminder' : isRefundReleased ? 'Refund Released' : isCancelled ? 'Booking Cancelled' : isPaid ? 'Payment Receipt' : 'Booking Status Update'}</div></td></tr></table></td></tr>
        <tr><td style="padding:24px;"><p style="font-size:17px;font-weight:700;">Dear ${escapeHtml(normalized.requesterName)},</p><p style="color:#334155;line-height:1.7;">${escapeHtml(intro)}</p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #d7e3f3;border-radius:10px;overflow:hidden;">${rows.map(([label, value]) => `<tr><td style="width:34%;padding:11px 12px;background:#eef5ff;border-bottom:1px solid #d7e3f3;font-weight:700;color:#0a4d9f;">${escapeHtml(label)}</td><td style="padding:11px 12px;border-bottom:1px solid #d7e3f3;font-weight:700;">${escapeHtml(value)}</td></tr>`).join('')}</table>
          <p style="margin-top:18px;color:#475569;line-height:1.7;">A PDF copy of these booking and payment details is attached for your records.</p>
          <div style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:12px;line-height:1.8;color:#64748b;"><strong>Need help?</strong><br/><a href="${escapeHtml(contactUrl)}" style="color:#0b67c2;">Contact the Gurdwara office</a><br/>${escapeHtml(volunteerReminderSiteName)}</div>
        </td></tr>
      </table>
    </div>`;
  return { subject, text, html, booking: normalized };
};

const sendBookingNotificationEmail = async (booking, options = {}) => {
  const normalized = normalizeBookingForNotification(booking);
  if (!isValidEmailAddress(normalized.requesterEmail)) {
    return { sent: false, reason: 'missing_email' };
  }
  const daysRemaining = Number.isFinite(Number(options.daysRemaining)) ? Number(options.daysRemaining) : null;
  const template = buildBookingNotificationEmail({ booking: normalized, daysRemaining, changeType: options.changeType || 'updated' });
  let attachments = [];
  try {
    attachments = [buildBookingReceiptPdfAttachment(normalized)];
  } catch (error) {
    console.error('[booking-email] Unable to generate PDF attachment:', error?.message || error);
  }
  const payload = {
    type: daysRemaining == null
      ? options.changeType === 'refund-released' ? 'booking-refund-released' : 'booking-status-update'
      : 'booking-reminder',
    to: normalized.requesterEmail,
    email: normalized.requesterEmail,
    name: normalized.requesterName,
    subject: template.subject,
    message: template.text,
    text: template.text,
    html: template.html,
    bodyHtml: template.html,
    bodyText: template.text,
    attachments,
    metadata: {
      bookingId: normalized.id,
      bookingType: normalized.categoryName,
      bookingDate: normalized.date,
      bookingStatus: normalized.status,
      paymentStatus: normalized.paymentStatus,
      refundStatus: normalized.refundStatus,
      refundAmount: normalized.refundAmount,
      refundDate: normalized.refundDate,
      reminderDays: daysRemaining
    },
    sentAt: new Date().toISOString()
  };
  try {
    const response = await deliverWorkflowEmail(bookingReminderWebhookUrl, payload);
    return response.ok ? { sent: true } : { sent: false, reason: 'webhook_error' };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
};

  const bookingNotificationFields = ['status', 'paymentStatus', 'paymentMethod', 'date', 'toDate', 'startTime', 'endTime', 'bookingLocation', 'bookingVenueType', 'hidePublicLocation', 'categoryName', 'itemizedItems', 'amount', 'title', 'occasionType', 'requesterName', 'dutyAssigneeId', 'dutyAssigneeEmail', 'dutyAssignees', 'receiptNumber', 'refundStatus', 'refundAmount', 'refundMethod', 'refundReference', 'refundDate', 'refundNotes'];
const hasBookingNotificationChange = (existing = {}, updated = {}) => bookingNotificationFields.some(
  (field) => String(existing?.[field] ?? '') !== String(updated?.[field] ?? '')
);

const shouldRunBookingReminderSweep = (date = new Date()) => {
  const nowParts = getDatePartsInTimeZone(date, bookingReminderTimeZone);
  const todayDateKey = toDateKeyFromParts(nowParts);
  const nowMinutes = (nowParts.hour * 60) + nowParts.minute;
  const scheduledMinutes = (bookingReminderSendTime.hour * 60) + bookingReminderSendTime.minute;
  return bookingReminderLastRunDateKey !== todayDateKey && nowMinutes >= scheduledMinutes;
};

const runBookingReminderSweep = async (options = {}) => {
  if (bookingReminderSweepRunning) {
    return { processed: 0, sent: 0, skipped: 0, reason: 'already_running' };
  }
  bookingReminderSweepRunning = true;
  const force = options.force === true;
  try {
    const [bookings, dutyContext] = await Promise.all([
      eventsDb.listItems('bookings'),
      resolveBookingDutyRecipients()
    ]);
    const logStore = readBookingReminderLog();
    let processed = 0;
    let sent = 0;
    let dutySent = 0;
    let skipped = 0;
    for (const entry of Array.isArray(bookings) ? bookings : []) {
      const booking = normalizeBookingForNotification(entry);
      processed += 1;
      if (!booking.id || !booking.date || booking.status === 'cancelled') {
        skipped += 1;
        continue;
      }
      const daysRemaining = getDaysUntilDate(booking.date);
      if (daysRemaining == null || !bookingReminderDays.includes(daysRemaining)) {
        skipped += 1;
        continue;
      }
      let sentForBooking = 0;
      const requesterReminderKey = `${booking.id}:${booking.date}:${daysRemaining}`;
      if (isValidEmailAddress(booking.requesterEmail) && (force || !logStore.sent[requesterReminderKey])) {
        const result = await sendBookingNotificationEmail(booking, { daysRemaining });
        if (result.sent) {
          sent += 1;
          sentForBooking += 1;
          logStore.sent[requesterReminderKey] = new Date().toISOString();
        }
      }

      if (booking.status === 'confirmed') {
        const assignedRecipients = dutyContext.recipients.filter((recipient) => isRecipientAssignedToBooking(recipient, entry));
        for (const recipient of assignedRecipients) {
          const recipientEmail = String(recipient.email || '').trim().toLowerCase();
          const recipientKey = String(recipient.id || '').trim()
            || crypto.createHash('sha256').update(recipientEmail).digest('hex').slice(0, 16);
          const dutyReminderKey = `duty:${booking.id}:${booking.date}:${daysRemaining}:${recipientKey}`;
          if (!force && logStore.sent[dutyReminderKey]) {
            continue;
          }
          try {
            const delivery = await sendBookingDutyBriefingEmail({
              recipient,
              bookings: [entry],
              role: dutyContext.roleLabel,
              scope: 'scheduled',
              daysRemaining
            });
            if (delivery.ok) {
              sent += 1;
              dutySent += 1;
              sentForBooking += 1;
              logStore.sent[dutyReminderKey] = new Date().toISOString();
            }
          } catch {}
        }
      }
      if (sentForBooking === 0) skipped += 1;
    }
    writeBookingReminderLog(logStore);
    return { processed, sent, dutySent, skipped, force, dutyRecipientCount: dutyContext.recipients.length, reminderDays: bookingReminderDays, webhookConfigured: Boolean(bookingReminderWebhookUrl) };
  } finally {
    bookingReminderSweepRunning = false;
  }
};

const runScheduledBookingReminderSweep = async () => {
  if (!shouldRunBookingReminderSweep()) {
    return null;
  }
  const result = await runBookingReminderSweep();
  const nowParts = getDatePartsInTimeZone(new Date(), bookingReminderTimeZone);
  bookingReminderLastRunDateKey = toDateKeyFromParts(nowParts);
  return result;
};

const sendNewUserWelcomeEmail = async (user = {}) => {
  const email = String(user.email || '').trim().toLowerCase();
  if (!isValidEmailAddress(email)) {
    return { sent: false, reason: 'invalid_email' };
  }

  const name = String(user.name || 'Sangat Member').trim();
  const homeUrl = `${newsletterPublicBaseUrl}/`;
  const subject = `Welcome to ${volunteerReminderSiteName}`;
  const text = `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh ${name},\n\nYour account has been created. You can now sign in and use the services available at ${homeUrl}.\n\n${volunteerReminderSiteName}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1e293b;line-height:1.65;"><h2 style="color:#0a4d9f;">Welcome to ${escapeHtml(volunteerReminderSiteName)}</h2><p>Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh ${escapeHtml(name)},</p><p>Your account has been created. You can now sign in and use the services available through our website.</p><p><a href="${escapeHtml(homeUrl)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#0a4d9f;color:#ffffff;text-decoration:none;font-weight:700;">Visit the website</a></p><p style="margin-top:24px;color:#64748b;">${escapeHtml(volunteerReminderSiteName)}</p></div>`;

  try {
    const response = await deliverWorkflowEmail(membershipReminderWebhookUrl, {
      type: 'new-user-welcome', to: email, name, subject, message: text, text, html,
      bodyHtml: html, bodyText: text, sentAt: new Date().toISOString()
    });
    return response.ok ? { sent: true } : { sent: false, reason: 'webhook_error' };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
};

const sendMembershipRenewalReminderEmail = async (user, renewal) => {
  const email = String(user.email || '').trim().toLowerCase();
  if (!isValidEmailAddress(email)) {
    return { sent: false, reason: 'invalid_email' };
  }

  const name = String(user.name || 'Member').trim();
  const dueDateLabel = new Intl.DateTimeFormat('en-CA', {
    timeZone: bookingReminderTimeZone,
    year: 'numeric', month: 'long', day: 'numeric'
  }).format(renewal.dueDate);
  const dashboardUrl = `${newsletterPublicBaseUrl}/family`;
  const subject = `Membership renewal due in ${renewal.daysUntilDue} days`;
  const text = `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh ${name},\n\nYour ${renewal.schedule} membership renewal is due on ${dueDateLabel}. Please visit your Family Dashboard to renew.\n\n${dashboardUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1e293b;line-height:1.65;"><h2 style="color:#0a4d9f;">Membership renewal reminder</h2><p>Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh ${escapeHtml(name)},</p><p>Your ${escapeHtml(renewal.schedule)} membership renewal is due in <strong>${renewal.daysUntilDue} days</strong>, on ${escapeHtml(dueDateLabel)}.</p><p><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#0a4d9f;color:#ffffff;text-decoration:none;font-weight:700;">Open Family Dashboard</a></p><p style="margin-top:24px;color:#64748b;">${escapeHtml(volunteerReminderSiteName)}</p></div>`;

  try {
    const response = await deliverWorkflowEmail(membershipReminderWebhookUrl, {
      type: 'membership-renewal-reminder', to: email, name, subject, message: text, text, html,
      bodyHtml: html, bodyText: text,
      metadata: { userId: user.id, daysUntilDue: renewal.daysUntilDue, dueDate: renewal.dueDate.toISOString(), schedule: renewal.schedule },
      sentAt: new Date().toISOString()
    });
    return response.ok ? { sent: true } : { sent: false, reason: 'webhook_error' };
  } catch {
    return { sent: false, reason: 'network_error' };
  }
};

const shouldRunMembershipReminderSweep = (date = new Date()) => {
  const nowParts = getDatePartsInTimeZone(date, bookingReminderTimeZone);
  const todayDateKey = toDateKeyFromParts(nowParts);
  const nowMinutes = (nowParts.hour * 60) + nowParts.minute;
  const scheduledMinutes = (bookingReminderSendTime.hour * 60) + bookingReminderSendTime.minute;
  return membershipReminderLastRunDateKey !== todayDateKey && nowMinutes >= scheduledMinutes;
};

const runMembershipReminderSweep = async (options = {}) => {
  if (membershipReminderSweepRunning) {
    return { processed: 0, sent: 0, skipped: 0, reason: 'already_running' };
  }

  membershipReminderSweepRunning = true;
  const force = options.force === true;
  try {
    const [users, reminderLogs] = await Promise.all([
      eventsDb.listItems('users'),
      eventsDb.listItems('membership_reminder_log')
    ]);
    const sentKeys = new Set((Array.isArray(reminderLogs) ? reminderLogs : []).map((entry) => String(entry.reminderKey || '')));
    let processed = 0;
    let sent = 0;
    let skipped = 0;

    for (const user of Array.isArray(users) ? users : []) {
      processed += 1;
      const renewal = resolveMembershipRenewal(user);
      if (!renewal || !membershipReminderDays.includes(renewal.daysUntilDue)) {
        skipped += 1;
        continue;
      }

      const dueDateKey = renewal.dueDate.toISOString().slice(0, 10);
      const reminderKey = `${user.id}:${dueDateKey}:${renewal.daysUntilDue}`;
      if (!force && sentKeys.has(reminderKey)) {
        skipped += 1;
        continue;
      }

      const result = await sendMembershipRenewalReminderEmail(user, renewal);
      if (!result.sent) {
        skipped += 1;
        continue;
      }

      sent += 1;
      sentKeys.add(reminderKey);
      await eventsDb.createItem('membership_reminder_log', {
        reminderKey, userId: user.id, email: user.email,
        dueDate: renewal.dueDate.toISOString(), reminderDays: renewal.daysUntilDue,
        sentAt: new Date().toISOString()
      });
    }

    return { processed, sent, skipped, force, reminderDays: membershipReminderDays };
  } finally {
    membershipReminderSweepRunning = false;
  }
};

const runScheduledMembershipReminderSweep = async () => {
  if (!shouldRunMembershipReminderSweep()) {
    return null;
  }
  const result = await runMembershipReminderSweep();
  const nowParts = getDatePartsInTimeZone(new Date(), bookingReminderTimeZone);
  membershipReminderLastRunDateKey = toDateKeyFromParts(nowParts);
  return result;
};

const getVolunteerRecognitionData = async () => {
  const rows = await eventsDb.listItems('volunteer_registrations');

  const summaryByKey = new Map();

  (Array.isArray(rows) ? rows : []).forEach((entry) => {
    const status = String(entry?.status || '').trim().toLowerCase();
    if (status === 'cancelled' || status === 'rejected') {
      return;
    }

    const email = String(entry?.email || '').trim().toLowerCase();
    const name = String(entry?.name || 'Volunteer').trim() || 'Volunteer';
    const key = email || name.toLowerCase();
    const existing = summaryByKey.get(key) || {
      key,
      email,
      name,
      participations: 0,
      points: 0,
      latestSevaDate: ''
    };

    const participationPoints = status === 'approved' || status === 'completed' ? 2 : 1;
    const sevaDate = String(entry?.sevaDate || entry?.date || '').trim();

    existing.participations += 1;
    existing.points += participationPoints;
    if (sevaDate && (!existing.latestSevaDate || sevaDate > existing.latestSevaDate)) {
      existing.latestSevaDate = sevaDate;
    }

    summaryByKey.set(key, existing);
  });

  const resolveBadge = (points, participations) => {
    if (points >= 20 || participations >= 12) return 'Platinum Sevadar';
    if (points >= 12 || participations >= 8) return 'Gold Sevadar';
    if (points >= 6 || participations >= 4) return 'Silver Sevadar';
    return 'Bronze Sevadar';
  };

  const leaders = [...summaryByKey.values()]
    .map((entry) => ({
      ...entry,
      badge: resolveBadge(entry.points, entry.participations)
    }))
    .sort((left, right) => {
      if (right.points !== left.points) {
        return right.points - left.points;
      }
      if (right.participations !== left.participations) {
        return right.participations - left.participations;
      }
      return String(left.name || '').localeCompare(String(right.name || ''));
    });

  return {
    totalRecognized: leaders.length,
    topLeaders: leaders.slice(0, 12),
    allLeaders: leaders
  };
};

const mimeByExtension = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.txt': 'text/plain'
};

const normalizeUploadService = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    return '';
  }
  return normalized;
};

const sanitizeFileName = (value) => {
  const base = path.basename(String(value || '').trim());
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_');
  if (!cleaned) {
    return 'file';
  }
  return cleaned.slice(0, 120);
};

const getMimeTypeFromName = (fileName) => {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  return mimeByExtension[extension] || 'application/octet-stream';
};

const serveProductionBuild = (request, response, pathname) => {
  if (!['GET', 'HEAD'].includes(request.method) || !fs.existsSync(buildDir)) {
    return false;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const requestedPath = decodedPath === '/' ? '/index.html' : decodedPath;
  const relativePath = requestedPath.replace(/^\/+/, '');
  const candidatePath = path.resolve(buildDir, relativePath);
  const normalizedBuildRoot = `${buildDir}${path.sep}`;
  const isInsideBuild = candidatePath === buildDir || candidatePath.startsWith(normalizedBuildRoot);
  const candidateIsFile = isInsideBuild && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile();
  const hasFileExtension = Boolean(path.extname(relativePath));
  const filePath = candidateIsFile
    ? candidatePath
    : (!hasFileExtension ? path.join(buildDir, 'index.html') : '');

  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }

  const stat = fs.statSync(filePath);
  const isHashedAsset = /[.-][a-f0-9]{8,}\.(?:css|js|map)$/i.test(path.basename(filePath));
  response.writeHead(200, {
    'Content-Type': getMimeTypeFromName(filePath),
    'Content-Length': stat.size,
    'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache'
  });
  if (request.method === 'HEAD') {
    response.end();
    return true;
  }

  const fileStream = fs.createReadStream(filePath);
  fileStream.on('error', (error) => {
    logServerError(error, 'production-static-file');
    if (!response.headersSent) {
      sendJson(response, 500, { ok: false, message: 'Unable to serve the requested file.' });
    } else {
      response.destroy(error);
    }
  });
  fileStream.pipe(response);
  return true;
};

const getExtensionFromMime = (mimeType) => {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized.includes('image/png')) return '.png';
  if (normalized.includes('image/jpeg')) return '.jpg';
  if (normalized.includes('image/gif')) return '.gif';
  if (normalized.includes('image/webp')) return '.webp';
  if (normalized.includes('application/pdf')) return '.pdf';
  if (normalized.includes('video/mp4')) return '.mp4';
  if (normalized.includes('video/webm')) return '.webm';
  if (normalized.includes('video/quicktime')) return '.mov';
  if (normalized.includes('text/plain')) return '.txt';
  return '';
};

const isAllowedUploadMime = (mimeType, allowedMimeTypes = []) => {
  const normalizedMime = String(mimeType || '').toLowerCase();
  if (!normalizedMime) {
    return false;
  }

  if (normalizedMime === 'image/svg+xml' || normalizedMime === 'text/html' || normalizedMime === 'application/xhtml+xml') {
    return false;
  }

  const policies = Array.isArray(allowedMimeTypes) && allowedMimeTypes.length > 0
    ? allowedMimeTypes
    : [];

  if (policies.length === 0) {
    return true;
  }

  return policies.some((policy) => {
    const normalizedPolicy = String(policy || '').trim().toLowerCase();
    if (!normalizedPolicy) {
      return true;
    }
    if (normalizedPolicy.endsWith('/*')) {
      return normalizedMime.startsWith(normalizedPolicy.slice(0, -1));
    }
    return normalizedMime === normalizedPolicy;
  });
};

const detectUploadMimeType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return '';
  }

  if (buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4E
    && buffer[3] === 0x47
    && buffer[4] === 0x0D
    && buffer[5] === 0x0A
    && buffer[6] === 0x1A
    && buffer[7] === 0x0A) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  if (buffer.length >= 6) {
    const header = buffer.toString('ascii', 0, 6);
    if (header === 'GIF87a' || header === 'GIF89a') {
      return 'image/gif';
    }
  }

  if (buffer.length >= 12) {
    const riff = buffer.toString('ascii', 0, 4);
    const webp = buffer.toString('ascii', 8, 12);
    if (riff === 'RIFF' && webp === 'WEBP') {
      return 'image/webp';
    }

    const atomType = buffer.toString('ascii', 4, 8);
    if (atomType === 'ftyp') {
      const brand = buffer.toString('ascii', 8, 12).trim().toLowerCase();
      if (brand === 'qt' || brand.startsWith('qt')) {
        return 'video/quicktime';
      }
      if (brand.startsWith('mp4') || brand.startsWith('isom') || brand.startsWith('iso2') || brand.startsWith('avc1') || brand.startsWith('m4v')) {
        return 'video/mp4';
      }
    }
  }

  if (buffer.length >= 4
    && buffer[0] === 0x1A
    && buffer[1] === 0x45
    && buffer[2] === 0xDF
    && buffer[3] === 0xA3) {
    return 'video/webm';
  }

  if (buffer.length >= 5) {
    const pdfHeader = buffer.toString('ascii', 0, 5);
    if (pdfHeader === '%PDF-') {
      return 'application/pdf';
    }
  }

  const hasBinaryNull = buffer.includes(0x00);
  if (!hasBinaryNull) {
    const text = buffer.toString('utf8');
    const roundTrip = Buffer.from(text, 'utf8');
    if (roundTrip.length === buffer.length && roundTrip.equals(buffer)) {
      return 'text/plain';
    }
  }

  return '';
};

const getSafeUploadFileName = (originalName, mimeType) => {
  const parsed = path.parse(sanitizeFileName(originalName || 'file'));
  const baseName = sanitizeFileName(parsed.name || 'file');
  const safeExtension = getExtensionFromMime(mimeType) || '';
  return `${baseName}${safeExtension}`;
};

const extractBase64Payload = (dataUrlOrBase64 = '') => {
  const source = String(dataUrlOrBase64 || '').trim();
  if (!source) {
    return '';
  }

  if (source.startsWith('data:')) {
    const commaIndex = source.indexOf(',');
    if (commaIndex < 0) {
      return '';
    }
    return source.slice(commaIndex + 1);
  }

  return source;
};

const safeUploadPathSegments = (encodedRelativePath = '') => {
  return String(encodedRelativePath || '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '_'))
    .filter(Boolean);
};

const normalizeQuizFileName = (value = '') => {
  const normalized = String(value || '').trim();
  if (!/^[0-9]{3}_[a-z0-9_]+\.json$/i.test(normalized)) {
    return '';
  }
  return normalized;
};

const getQuizBankFilePath = (fileName) => {
  const normalized = normalizeQuizFileName(fileName);
  if (!normalized) {
    return '';
  }

  const filePath = path.join(quizBankDir, normalized);
  const quizRoot = `${path.resolve(quizBankDir)}${path.sep}`;
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(quizRoot)) {
    return '';
  }

  return resolvedPath;
};

const buildUploadDirectory = (service) => {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const targetDir = path.join(uploadsDir, service, year, month);
  fs.mkdirSync(targetDir, { recursive: true });
  return { targetDir, year, month };
};

const normalizeUser = (user = {}) => {
  const normalizeRole = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'super admin' || raw === 'super_admin' || raw === 'superadmin') {
      return 'Super Admin';
    }
    if (raw === 'admin') {
      return 'Admin';
    }
    if (raw === 'volunteer' || raw === 'volunteer coordinator' || raw === 'volunteer_coordinator') {
      return 'Volunteer';
    }
    if (raw === 'family') {
      return 'Family';
    }
    if (!raw) {
      return 'Member';
    }
    return String(value || '').trim() || 'Member';
  };

  const resolveMemberType = (role, fallback) => {
    if (fallback) {
      return fallback;
    }
    if (role === 'Super Admin' || role === 'Admin') {
      return 'Admin';
    }
    if (role === 'Volunteer') {
      return 'Volunteer';
    }
    if (role === 'Family') {
      return 'Family';
    }
    return 'Member';
  };

  const email = String(user.email || '').trim().toLowerCase();
  const role = normalizeRole(user.role);
  const memberType = resolveMemberType(role, String(user.memberType || '').trim());
  const approvalStatus = String(
    user.approvalStatus || (memberType === 'Admin' ? 'approved' : 'pending')
  ).toLowerCase();
  const hasExplicitAdminPageAccess = Array.isArray(user.adminPageAccess);
  const adminPageAccess = hasExplicitAdminPageAccess
    ? [...new Set(user.adminPageAccess.map((path) => String(path || '').trim()).filter((path) => ADMIN_PAGE_PATHS.includes(path)))]
    : getDefaultAdminPageAccessForRole(role);

  return {
    id: String(user.id || `user-${Date.now()}`),
    name: String(user.name || '').trim(),
    role,
    email,
    phone: String(user.phone || '').trim(),
    address: String(user.address || '').trim(),
    memberType,
    authProvider: String(user.authProvider || 'LOCAL').trim() || 'LOCAL',
    avatarUrl: String(user.avatarUrl || user.picture || '').trim(),
    title: String(user.title || '').trim(),
    description: String(user.description || '').trim(),
    showOnAbout: user.showOnAbout === true,
    adminPageAccess: adminPageAccess.length > 0 ? adminPageAccess : getDefaultAdminPageAccessForRole(role),
    registrationComplete: Boolean(user.registrationComplete),
    isActive: user.isActive !== false,
    approvalStatus,
    approvalUpdatedAt: String(user.approvalUpdatedAt || ''),
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
};

const readUsers = () => {
  ensureStorage();
  try {
    const content = fs.readFileSync(usersPath, 'utf8');
    const parsed = JSON.parse(content);
    const list = Array.isArray(parsed) ? parsed : [];
    return list.map(normalizeUser);
  } catch {
    return seedUsers.map(normalizeUser);
  }
};

const writeUsers = (records) => {
  ensureStorage();
  fs.writeFileSync(usersPath, JSON.stringify(records.map(normalizeUser), null, 2), 'utf8');
};

const hasCurrentPaidMembershipFee = (user = {}) => {
  const role = String(user.role || '').trim().toLowerCase();
  if (role !== 'member') {
    return false;
  }

  const schedule = String(user.membershipProfile?.donationSchedule || 'monthly').trim().toLowerCase();
  const validityDays = schedule === 'yearly' ? 365 : 30;
  const paidDates = (Array.isArray(user.membershipFeeRecords) ? user.membershipFeeRecords : [])
    .filter((entry) => String(entry?.status || '').trim().toLowerCase() === 'paid')
    .map((entry) => new Date(entry?.paymentDate || entry?.updatedAt || '').getTime())
    .filter(Number.isFinite);

  if (paidDates.length === 0) {
    return false;
  }

  const latestPaidAt = Math.max(...paidDates);
  return Date.now() <= latestPaidAt + (validityDays * 24 * 60 * 60 * 1000);
};

const enforceUserMembershipActivity = (user = {}, requestedBody = {}) => {
  const role = String(user.role || '').trim().toLowerCase();
  const approvalStatus = role === 'member' && !hasCurrentPaidMembershipFee(user)
    ? 'pending'
    : 'approved';
  const previousApprovalStatus = String(user.approvalStatus || '').trim().toLowerCase();

  return {
    ...user,
    isActive: Object.prototype.hasOwnProperty.call(requestedBody, 'isActive')
      ? requestedBody.isActive !== false
      : user.isActive !== false,
    approvalStatus,
    approvalUpdatedAt: previousApprovalStatus === approvalStatus
      ? user.approvalUpdatedAt
      : new Date().toISOString()
  };
};

const getUserByEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  return readUsers().find((entry) => entry.email === normalizedEmail) || null;
};

const upsertUserByEmail = (payload = {}) => {
  const normalized = normalizeUser(payload);
  if (!normalized.email) {
    const error = new Error('Email is required.');
    error.status = 400;
    throw error;
  }

  const users = readUsers();
  const index = users.findIndex((entry) => entry.email === normalized.email);
  if (index < 0) {
    const next = [{ ...normalized, id: normalized.id || `user-${Date.now()}` }, ...users];
    writeUsers(next);
    return next[0];
  }

  const existing = users[index];
  const hasAdminPageAccessInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'adminPageAccess');
  const hasApprovalInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'approvalStatus');
  const hasRoleInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'role');
  const roleChanged = hasRoleInPayload && normalizeUser({ role: payload.role }).role !== existing.role;
  const nextAdminPageAccess = hasAdminPageAccessInPayload
    ? normalized.adminPageAccess
    : (roleChanged ? undefined : existing.adminPageAccess);
  const updated = {
    ...existing,
    ...normalized,
    approvalStatus: hasApprovalInPayload ? normalized.approvalStatus : existing.approvalStatus,
    adminPageAccess: hasAdminPageAccessInPayload ? normalized.adminPageAccess : normalizeUser({ ...existing, role: normalized.role, adminPageAccess: nextAdminPageAccess }).adminPageAccess,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString()
  };
  const next = [...users];
  next[index] = updated;
  writeUsers(next);
  return updated;
};

const completeUserRegistration = (payload = {}) => {
  const normalizedEmail = String(payload.email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    const error = new Error('Email is required for registration.');
    error.status = 400;
    throw error;
  }

  const users = readUsers();
  const index = users.findIndex((entry) => entry.email === normalizedEmail);
  const base = index >= 0 ? users[index] : normalizeUser({ email: normalizedEmail, name: payload.name });
  const memberType = String(payload.memberType || base.memberType || 'Member');
  const approvalStatus = memberType === 'Admin' ? 'approved' : 'pending';

  const updated = normalizeUser({
    ...base,
    name: payload.name || base.name,
    phone: payload.phone || base.phone,
    address: payload.address || base.address,
    role: payload.role || base.role,
    memberType,
    avatarUrl: payload.avatarUrl || base.avatarUrl,
    registrationComplete: true,
    isActive: base.isActive !== false,
    approvalStatus,
    approvalUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  const next = [...users];
  if (index >= 0) {
    next[index] = { ...updated, id: base.id, createdAt: base.createdAt };
  } else {
    next.unshift(updated);
  }
  writeUsers(next);
  return index >= 0 ? next[index] : next[0];
};

const readDonations = async () => {
  return eventsDb.getDonations();
};

const upsertDonation = async (record) => {
  return eventsDb.upsertDonation(record);
};

const acknowledgeDonationSms = (record, consent) => {
  void createDonationSms({ db: eventsDb }).send(record, consent).catch(() => {
    console.error('[donation-sms] Unable to record or send acknowledgement.');
  });
};

const removeDonation = async (id) => {
  return eventsDb.removeDonation(id);
};

const getDonationCampaigns = async () => {
  return eventsDb.getDonationCampaigns();
};

const getZeffyDonationCampaigns = async () => {
  return eventsDb.getZeffyDonationCampaigns();
};

const createDonationCampaign = async (payload) => {
  return eventsDb.createDonationCampaign(payload);
};

const updateDonationCampaign = async (id, payload) => {
  return eventsDb.updateDonationCampaign(id, payload);
};

const removeDonationCampaign = async (id) => {
  return eventsDb.removeDonationCampaign(id);
};

const getDonationSummary = async () => {
  return eventsDb.summarizeDonationsByCampaign();
};

const syncCampaignRaisedTotal = async ({ campaignId, campaignName } = {}) => {
  const summary = await getDonationSummary();
  const normalizedName = String(campaignName || '').trim().toLowerCase();
  const numericCampaignId = Number(campaignId);

  const allCampaigns = await getDonationCampaigns();
  const matchedCampaign = Number.isFinite(numericCampaignId) && numericCampaignId > 0
    ? allCampaigns.find((entry) => Number(entry.id) === numericCampaignId)
    : allCampaigns.find((entry) => String(entry.name || '').trim().toLowerCase() === normalizedName);

  if (!matchedCampaign) {
    return null;
  }

  const byId = Number(summary[`id:${Number(matchedCampaign.id)}`] || 0);
  const byName = Number(summary[`name:${String(matchedCampaign.name || '').trim().toLowerCase()}`] || 0);
  const nextRaised = Math.max(0, Number.isFinite(byId) ? byId : 0, Number.isFinite(byName) ? byName : 0);

  return updateDonationCampaign(Number(matchedCampaign.id), { raised: nextRaised });
};

const resolveZeffyCampaign = (donationRecord, campaigns = []) => {
  const eventCampaignName = String(donationRecord?.campaignName || '').trim().toLowerCase();
  const configuredCampaignName = zeffyCampaignName.toLowerCase();
  return Number.isFinite(zeffyCampaignId) && zeffyCampaignId > 0
    ? campaigns.find((entry) => Number(entry.id) === zeffyCampaignId)
    : campaigns.find((entry) => {
      const name = String(entry.name || '').trim().toLowerCase();
      return name === eventCampaignName || name === configuredCampaignName;
    });
};

const normalizeZeffyCampaignSlug = (value = '') => {
  try {
    const url = new URL(String(value || '').trim());
    const hostname = url.hostname.toLowerCase();
    if (hostname !== 'zeffy.com' && !hostname.endsWith('.zeffy.com')) {
      return '';
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const donationFormIndex = segments.indexOf('donation-form');
    return String(segments[donationFormIndex + 1] || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const fetchZeffyCampaigns = async (apiKey) => {
  const response = await fetch('https://api.zeffy.com/api/v1/campaigns?limit=100', {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Unable to load Zeffy campaigns (${response.status}).`);
    error.status = response.status >= 500 || response.status === 429 ? 502 : 400;
    throw error;
  }
  return Array.isArray(body.data) ? body.data : [];
};

const resolveRemoteZeffyCampaign = (campaign, remoteCampaigns = []) => {
  const configuredSlug = normalizeZeffyCampaignSlug(campaign?.paymentLink);
  const configuredName = String(campaign?.name || zeffyCampaignName).trim().toLowerCase();
  return remoteCampaigns.find((entry) => (
    configuredSlug && normalizeZeffyCampaignSlug(entry?.url) === configuredSlug
  )) || remoteCampaigns.find((entry) => {
    const remoteName = String(entry?.title || entry?.description || '').trim().toLowerCase();
    return remoteName && remoteName === configuredName;
  }) || (remoteCampaigns.length === 1 ? remoteCampaigns[0] : null);
};

const validateZeffyCampaignConfiguration = async ({ name, paymentLink, apiKey }) => {
  assertInput(Boolean(normalizeZeffyCampaignSlug(paymentLink)), 'paymentLink must be a valid Zeffy donation form URL.');
  const remoteCampaigns = await fetchZeffyCampaigns(apiKey);
  const remoteCampaign = resolveRemoteZeffyCampaign({ name, paymentLink }, remoteCampaigns);
  assertInput(Boolean(remoteCampaign), 'The Zeffy API key does not provide access to the configured donation form.');
  return remoteCampaign;
};

const getConfiguredZeffyCampaigns = async () => {
  const campaigns = await getDonationCampaigns();
  const storedConfigurations = await getZeffyDonationCampaigns();
  const configurations = storedConfigurations.map((campaign) => ({
    apiKey: campaign.zeffyApiKey,
    campaign
  }));

  if (zeffyApiKey) {
    const localZeffyCampaigns = campaigns.filter((campaign) => (
      String(campaign?.paymentProvider || '').trim().toUpperCase() === 'ZEFFY'
      && Boolean(normalizeZeffyCampaignSlug(campaign?.paymentLink))
    ));
    const environmentCampaigns = localZeffyCampaigns.length > 0
      ? localZeffyCampaigns
      : [resolveZeffyCampaign({ campaignName: zeffyCampaignName }, campaigns) || null];

    for (const campaign of environmentCampaigns) {
      const alreadyConfigured = configurations.some((entry) => (
        Number(entry.campaign?.id || 0) === Number(campaign?.id || 0)
      ));
      if (!alreadyConfigured) {
        configurations.push({ apiKey: zeffyApiKey, campaign });
      }
    }
  }

  const remoteCampaignCache = new Map();
  const hydrated = [];
  for (const configuration of configurations) {
    if (!configuration.apiKey) {
      continue;
    }
    try {
      let remoteCampaigns = remoteCampaignCache.get(configuration.apiKey);
      if (!remoteCampaigns) {
        remoteCampaigns = await fetchZeffyCampaigns(configuration.apiKey);
        remoteCampaignCache.set(configuration.apiKey, remoteCampaigns);
      }
      const remoteCampaign = resolveRemoteZeffyCampaign(configuration.campaign, remoteCampaigns);
      hydrated.push({
        ...configuration,
        remoteCampaignId: String(remoteCampaign?.id || '').trim()
      });
    } catch (error) {
      hydrated.push({
        ...configuration,
        remoteCampaignId: '',
        configurationError: error.message || 'Unable to load Zeffy campaign configuration.'
      });
    }
  }

  return { campaigns, configurations: hydrated };
};

const zeffyPaymentMatchesConfiguration = (payment, configuration, configurationCount) => {
  const paymentCampaignId = String(payment?.campaign_id || '').trim();
  if (configuration.remoteCampaignId) {
    return paymentCampaignId === configuration.remoteCampaignId;
  }

  const paymentCampaignName = String(payment?.description || '').trim().toLowerCase();
  const localCampaignName = String(configuration.campaign?.name || '').trim().toLowerCase();
  return Boolean(localCampaignName && paymentCampaignName === localCampaignName) || configurationCount === 1;
};

const resolvePendingDonationForReceipt = async (donationRecord = {}) => {
  const pendingRows = await eventsDb.getPendingDonations();
  const directPendingId = String(donationRecord.sourcePendingId || '').trim();
  if (directPendingId) {
    return pendingRows.find((entry) => String(entry.id || '').trim() === directPendingId) || { id: directPendingId };
  }

  const provider = String(donationRecord.paymentProvider || '').trim().toUpperCase();
  const donorEmail = String(donationRecord.donorEmail || '').trim().toLowerCase();
  const campaignId = Number(donationRecord.campaignId);
  const amount = Number(donationRecord.amount || 0);
  const paymentTime = new Date(donationRecord.createdAt || Date.now()).getTime();

  return pendingRows
    .filter((entry) => {
      const pendingTime = new Date(entry.createdAt || 0).getTime();
      return String(entry.paymentProvider || '').trim().toUpperCase() === provider
        && String(entry.donorEmail || '').trim().toLowerCase() === donorEmail
        && Number(entry.campaignId) === campaignId
        && Math.abs(Number(entry.amount || 0) - amount) < 0.01
        && Number.isFinite(pendingTime)
        && pendingTime <= paymentTime
        && paymentTime - pendingTime <= 72 * 60 * 60 * 1000;
    })
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())[0] || null;
};

const attachDonationReceiptToBooking = async (donationRecord = {}) => {
  const pending = await resolvePendingDonationForReceipt(donationRecord);
  if (!pending?.id) {
    return null;
  }

  const bookings = await eventsDb.listItems('bookings');
  const booking = bookings.find((entry) => String(entry.donationPendingId || '').trim() === String(pending.id));
  if (!booking?.id) {
    return null;
  }

  const updated = await eventsDb.updateItem('bookings', booking.id, {
    receiptNumber: String(donationRecord.receiptId || booking.receiptNumber || '').trim(),
    paymentReference: String(donationRecord.gatewayTransactionId || pending.id).trim(),
    paymentMethod: String(donationRecord.paymentProvider || booking.paymentMethod || '').trim().toUpperCase(),
    paymentProvider: String(donationRecord.paymentProvider || booking.paymentProvider || '').trim().toUpperCase(),
    paymentStatus: 'paid',
    paymentReceivedAt: booking.paymentReceivedAt || new Date().toISOString(),
    status: String(booking.status || 'pending').trim().toLowerCase() === 'confirmed' ? 'confirmed' : 'pending',
    amount: Number(donationRecord.amount || booking.amount || 0),
    updatedAt: new Date().toISOString()
  });
  await sendBookingNotificationEmail(updated, { changeType: 'updated' });
  await eventsDb.removePendingDonation(pending.id).catch(() => null);
  return updated;
};

const persistVerifiedZeffyPayment = async (payment, campaigns = [], campaignOverride = null, sendSms = false) => {
  const donationRecord = mapZeffyApiPayment(payment);
  const matchedCampaign = campaignOverride || resolveZeffyCampaign(donationRecord, campaigns);
  const correlatedPending = await resolvePendingDonationForReceipt({
    ...donationRecord,
    campaignId: matchedCampaign ? Number(matchedCampaign.id) : null,
    campaignName: matchedCampaign?.name || donationRecord.campaignName || zeffyCampaignName
  });
  const persistedDonation = await upsertDonation({
    ...donationRecord,
    sourcePendingId: correlatedPending?.id || donationRecord.sourcePendingId,
    campaignId: matchedCampaign ? Number(matchedCampaign.id) : null,
    campaignName: matchedCampaign?.name || donationRecord.campaignName || zeffyCampaignName,
    donorPhone: donationRecord.donorPhone || correlatedPending?.donorPhone || ''
  });
  await attachDonationReceiptToBooking(persistedDonation);
  if (sendSms) acknowledgeDonationSms(persistedDonation, zeffySmsConsent(payment));
  return persistedDonation;
};

let zeffyReconciliationPromise = null;
let lastZeffyReconciliationAt = 0;

const reconcileZeffyDonations = async ({ force = false } = {}) => {
  if (!force && Date.now() - lastZeffyReconciliationAt < 30 * 1000) {
    return { imported: 0, checked: 0, skipped: 'throttled' };
  }
  if (zeffyReconciliationPromise) {
    return zeffyReconciliationPromise;
  }

  zeffyReconciliationPromise = (async () => {
    const { campaigns, configurations } = await getConfiguredZeffyCampaigns();
    if (configurations.length === 0) {
      return { imported: 0, checked: 0, skipped: 'not-configured' };
    }
    const existingTransactionIds = new Set(
      (await readDonations()).map((entry) => String(entry.gatewayTransactionId || '').trim()).filter(Boolean)
    );
    const touchedCampaigns = new Map();
    let imported = 0;
    let checked = 0;
    const failures = [];

    for (const configuration of configurations) {
      const campaignId = Number(configuration.campaign?.id || 0) || null;
      if (configuration.configurationError) {
        failures.push({
          campaignId,
          stage: 'campaigns',
          message: configuration.configurationError
        });
        continue;
      }

      let cursor = '';
      for (let page = 0; page < 5; page += 1) {
        const url = new URL('https://api.zeffy.com/api/v1/payments');
        url.searchParams.set('status', 'succeeded');
        url.searchParams.set('limit', '100');
        if (cursor) {
          url.searchParams.set('starting_after', cursor);
        }

        let zeffyResponse;
        try {
          zeffyResponse = await fetch(url, {
            headers: { Authorization: `Bearer ${configuration.apiKey}` }
          });
        } catch (error) {
          failures.push({
            campaignId,
            stage: 'payments',
            message: error.message || 'Unable to connect to Zeffy payments.'
          });
          break;
        }
        const zeffyBody = await zeffyResponse.json().catch(() => ({}));
        if (!zeffyResponse.ok) {
          failures.push({
            campaignId,
            stage: 'payments',
            status: zeffyResponse.status,
            message: `Unable to reconcile Zeffy payments (${zeffyResponse.status}).`
          });
          break;
        }

        const payments = Array.isArray(zeffyBody.data) ? zeffyBody.data : [];
        for (const payment of payments) {
          if (!zeffyPaymentMatchesConfiguration(payment, configuration, configurations.length)) {
            continue;
          }
          checked += 1;
          try {
            const transactionId = String(payment.id || '').trim();
            const isNewPayment = !existingTransactionIds.has(transactionId);
            const sendRecentOptedInSms = shouldSendReconciledZeffySms({
              payment,
              alreadyPersisted: !isNewPayment
            });
            const persistedDonation = await persistVerifiedZeffyPayment(
              payment,
              campaigns,
              configuration.campaign,
              sendRecentOptedInSms
            );
            if (isNewPayment) {
              imported += 1;
            }
            existingTransactionIds.add(transactionId);
            const campaignKey = persistedDonation.campaignId || persistedDonation.campaignName;
            touchedCampaigns.set(campaignKey, persistedDonation);
          } catch (error) {
            failures.push({
              campaignId,
              stage: 'persist',
              paymentId: String(payment.id || '').trim(),
              message: error.message || 'Unable to persist verified Zeffy payment.'
            });
          }
        }

        cursor = String(zeffyBody.next_cursor || '').trim();
        if (!zeffyBody.has_more || !cursor) {
          break;
        }
      }
    }

    for (const donation of touchedCampaigns.values()) {
      await syncCampaignRaisedTotal({
        campaignId: donation.campaignId,
        campaignName: donation.campaignName
      });
    }
    lastZeffyReconciliationAt = Date.now();
    return { imported, checked, failures };
  })();

  try {
    return await zeffyReconciliationPromise;
  } finally {
    zeffyReconciliationPromise = null;
  }
};

const reconcilePaidPendingDonations = async () => {
  if (!stripe) {
    return { reconciled: 0, checked: 0, skipped: 0 };
  }

  const pendingRows = await getPendingDonations();
  if (!Array.isArray(pendingRows) || pendingRows.length === 0) {
    return { reconciled: 0, checked: 0, skipped: 0 };
  }

  const stripeClient = requireStripeClient();
  let reconciled = 0;
  let checked = 0;
  let skipped = 0;

  for (const pending of pendingRows.slice(0, 50)) {
    const sessionId = String(pending?.sessionId || '').trim();
    const provider = String(pending?.paymentProvider || '').trim().toUpperCase();

    if (provider !== 'STRIPE' || !sessionId) {
      skipped += 1;
      continue;
    }

    checked += 1;

    try {
      let donationRecord;
      if (sessionId.startsWith('pi_')) {
        const paymentIntent = await stripeClient.paymentIntents.retrieve(sessionId);
        if (paymentIntent.status !== 'succeeded' || paymentIntent.livemode !== false
          || paymentIntent.currency !== 'cad' || paymentIntent.metadata?.quick_donate !== 'true') continue;
        const stripePendingId = String(paymentIntent.metadata?.pending_id || '').trim();
        if (!stripePendingId || stripePendingId !== String(pending.id ?? '').trim()) continue;
        donationRecord = mapQuickDonatePaymentIntent(paymentIntent, `reconcile-${paymentIntent.id}`);
      } else {
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        const isPaid = String(session?.status || '').toLowerCase() === 'complete'
          && String(session?.payment_status || '').toLowerCase() === 'paid';
        if (!isPaid) continue;
        donationRecord = mapWebhookDonation(session, `reconcile-${session.id}`);
      }

      donationRecord = sessionId.startsWith('pi_')
        ? { ...donationRecord, source: 'stripe-reconcile' }
        : {
          ...donationRecord,
          sourcePendingId: String(pending.id || ''),
          campaignId: Number.isFinite(Number(pending.campaignId)) ? Number(pending.campaignId) : null,
          campaignName: String(pending.campaignName || '').trim() || donationRecord.campaignName,
          donorName: String(pending.donorName || '').trim() || donationRecord.donorName,
          donorEmail: String(pending.donorEmail || '').trim() || donationRecord.donorEmail,
          source: 'stripe-reconcile'
        };

      const persistedDonation = await upsertDonation(donationRecord);
      await syncCampaignRaisedTotal({
        campaignId: persistedDonation?.campaignId,
        campaignName: persistedDonation?.campaignName
      });
      await removePendingDonation(pending.id);
      reconciled += 1;
    } catch (error) {
      // Leave pending record untouched; it can be retried on subsequent requests.
      logServerError(error, '[donations] reconcile failed for pending row');
    }
  }

  return { reconciled, checked, skipped };
};

const clearDonations = async () => {
  return eventsDb.clearDonations();
};

const getPendingDonations = async () => {
  return eventsDb.getPendingDonations();
};

const createPendingDonation = async (payload) => {
  return eventsDb.createPendingDonation(payload);
};

const removePendingDonation = async (id) => {
  return eventsDb.removePendingDonation(id);
};

const clearPendingDonations = async () => {
  return eventsDb.clearPendingDonations();
};

const requireStripeClient = () => {
  if (!stripe) {
    const error = new Error('STRIPE_SECRET_KEY is not configured on the server.');
    error.status = 500;
    throw error;
  }
  return stripe;
};

const mapWebhookDonation = (session, eventId) => {
  const metadata = session.metadata || {};
  const amountCents = Number(session.amount_total || 0);
  const amount = amountCents > 0 ? amountCents / 100 : 0;
  const campaignId = Number(metadata.campaign_id || 0);

  return {
    id: `stripe-${session.id}`,
    receiptId: `STR-${String(session.id).slice(-8).toUpperCase()}`,
    sourcePendingId: metadata.pending_id || '',
    campaignId: Number.isFinite(campaignId) && campaignId > 0 ? campaignId : null,
    campaignName: metadata.campaign_name || 'General Donation',
    donorName: metadata.donor_name || session.customer_details?.name || 'Anonymous',
    donorEmail: metadata.donor_email || session.customer_details?.email || '',
    amount,
    frequency: metadata.frequency || 'one-time',
    paymentProvider: 'STRIPE',
    paymentStatus: session.payment_status === 'paid' ? 'PAID' : String(session.payment_status || 'PENDING').toUpperCase(),
    gatewayTransactionId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '',
    stripeSessionId: session.id,
    stripeEventId: eventId,
    createdAt: new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    emailSent: true,
    source: 'stripe-webhook'
  };
};

const mapQuickDonatePaymentIntent = (paymentIntent, eventId) => {
  const metadata = paymentIntent.metadata || {};
  const amountCents = Number(paymentIntent.amount_received || paymentIntent.amount || 0);
  const campaignId = Number(metadata.campaign_id || 0);
  return {
    id: `stripe-${paymentIntent.id}`,
    receiptId: `STR-${String(paymentIntent.id).slice(-8).toUpperCase()}`,
    sourcePendingId: metadata.pending_id || '',
    campaignId: Number.isFinite(campaignId) && campaignId > 0 ? campaignId : null,
    campaignName: metadata.campaign_name || 'General Donation',
    donorName: 'Anonymous',
    donorEmail: '',
    amount: amountCents > 0 ? amountCents / 100 : 0,
    frequency: 'one-time',
    paymentProvider: 'STRIPE',
    paymentStatus: paymentIntent.status === 'succeeded' ? 'PAID' : 'PENDING',
    gatewayTransactionId: paymentIntent.id,
    stripeSessionId: '',
    stripeEventId: eventId,
    createdAt: new Date((paymentIntent.created || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    emailSent: false,
    source: 'stripe-wallet-webhook'
  };
};

const summarizeByCampaign = (donations) => {
  const map = {};
  donations.forEach((donation) => {
    const byIdKey = donation.campaignId != null ? `id:${donation.campaignId}` : '';
    const byNameKey = donation.campaignName ? `name:${String(donation.campaignName).toLowerCase()}` : '';
    const amount = Number(donation.amount || 0);

    if (byIdKey) {
      map[byIdKey] = (map[byIdKey] || 0) + amount;
    }
    if (byNameKey) {
      map[byNameKey] = (map[byNameKey] || 0) + amount;
    }
  });
  return map;
};

const parseYouTubeChannelSource = (value = '') => {
  const input = String(value || '').trim();
  if (!input) {
    return null;
  }

  const extractVideoId = (rawValue = '') => {
    const raw = String(rawValue || '').trim();
    if (!raw) {
      return '';
    }

    try {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();

      if (host.includes('youtu.be')) {
        const candidate = parsed.pathname.split('/').filter(Boolean)[0] || '';
        if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) {
          return candidate;
        }
      }

      if (host.includes('youtube.com')) {
        const fromQuery = parsed.searchParams.get('v') || '';
        if (/^[A-Za-z0-9_-]{11}$/.test(fromQuery)) {
          return fromQuery;
        }

        const parts = parsed.pathname.split('/').filter(Boolean);
        const liveIndex = parts.findIndex((part) => ['live', 'embed', 'shorts'].includes(part.toLowerCase()));
        if (liveIndex >= 0) {
          const candidate = parts[liveIndex + 1] || '';
          if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) {
            return candidate;
          }
        }
      }
    } catch {
      // Ignore URL parsing errors and fall back to regex matching.
    }

    const fallbackMatch = raw.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/i);
    return fallbackMatch ? fallbackMatch[1] : '';
  };

  const videoId = extractVideoId(input);
  if (videoId) {
    return { type: 'videoId', value: videoId };
  }

  const channelMatch = input.match(/youtube\.com\/channel\/([A-Za-z0-9_-]+)/i) || input.match(/\b(UC[A-Za-z0-9_-]{20,})\b/i);
  if (channelMatch) {
    return { type: 'channelId', value: channelMatch[1] };
  }

  const handleMatch = input.match(/youtube\.com\/@([A-Za-z0-9._-]+)/i) || input.match(/^@([A-Za-z0-9._-]+)$/i);
  if (handleMatch) {
    return { type: 'handle', value: handleMatch[1] };
  }

  if (!/^https?:\/\//i.test(input) && !input.includes('/')) {
    if (/^[A-Za-z0-9._-]+$/.test(input)) {
      return { type: 'handle', value: input.replace(/^@/, '') };
    }
    return { type: 'channelName', value: input };
  }

  return null;
};

const resolveYouTubeLiveVideo = async (source) => {
  const parsedSource = parseYouTubeChannelSource(source);
  if (!parsedSource) {
    const error = new Error('Enter a YouTube channel URL, handle, or channel ID.');
    error.status = 400;
    throw error;
  }

  const fetchVideoDetails = async (videoId) => {
    if (!youtubeApiKey) {
      return {
        isLive: true,
        channelId: '',
        videoId,
        title: '',
        channelTitle: '',
        concurrentViewers: null,
        totalViews: null,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`
      };
    }

    const liveDetailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    liveDetailsUrl.searchParams.set('part', 'snippet,liveStreamingDetails,statistics,status');
    liveDetailsUrl.searchParams.set('id', videoId);
    liveDetailsUrl.searchParams.set('key', youtubeApiKey);

    const liveDetailsResponse = await fetch(liveDetailsUrl);
    const liveDetailsPayload = await liveDetailsResponse.json().catch(() => ({}));
    const liveVideo = liveDetailsPayload?.items?.[0] || null;

    if (!liveDetailsResponse.ok || !liveVideo) {
      return null;
    }

    const liveSnippet = liveVideo?.snippet || {};
    const liveStreamingDetails = liveVideo?.liveStreamingDetails || {};
    const statistics = liveVideo?.statistics || {};
    const rawViewers = Number(liveStreamingDetails?.concurrentViewers);
    const rawTotalViews = Number(statistics?.viewCount);
    const liveBroadcastContent = String(liveSnippet?.liveBroadcastContent || '').toLowerCase();
    const hasConcurrentViewers = Number.isFinite(rawViewers) && rawViewers >= 0;
    const hasLiveWindow = Boolean(liveStreamingDetails?.actualStartTime) && !liveStreamingDetails?.actualEndTime;
    const isLive = liveBroadcastContent === 'live' || hasConcurrentViewers || hasLiveWindow;

    return {
      isLive,
      channelId: String(liveSnippet?.channelId || ''),
      videoId,
      title: String(liveSnippet?.title || ''),
      channelTitle: String(liveSnippet?.channelTitle || ''),
      concurrentViewers: hasConcurrentViewers ? rawViewers : null,
      totalViews: Number.isFinite(rawTotalViews) && rawTotalViews >= 0 ? rawTotalViews : null,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`
    };
  };

  const extractVideoIdFromUrl = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) {
      return '';
    }

    try {
      const parsed = new URL(raw);
      const v = parsed.searchParams.get('v') || '';
      if (/^[A-Za-z0-9_-]{11}$/.test(v)) {
        return v;
      }
    } catch {
      // Ignore URL parsing errors.
    }

    const match = raw.match(/(?:v=|youtu\.be\/|\/embed\/|\/live\/|\/shorts\/)([A-Za-z0-9_-]{11})/i);
    return match ? match[1] : '';
  };

  const resolveLiveVideoIdFromChannelPage = async (sourceType, sourceValue, resolvedChannelId) => {
    const candidates = [];

    if (sourceType === 'handle' && sourceValue) {
      candidates.push(`https://www.youtube.com/@${sourceValue}/live`);
    }
    if (resolvedChannelId) {
      candidates.push(`https://www.youtube.com/channel/${resolvedChannelId}/live`);
    }

    for (const candidate of candidates) {
      try {
        const pageResponse = await fetch(candidate, {
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GurdwaraCommunityPlatform/1.0)'
          }
        });

        if (!pageResponse.ok) {
          continue;
        }

        const redirectedVideoId = extractVideoIdFromUrl(pageResponse.url || '');
        if (redirectedVideoId) {
          return redirectedVideoId;
        }

        const html = await pageResponse.text();
        const htmlVideoIdMatch = html.match(/"videoId":"([A-Za-z0-9_-]{11})"/);
        if (htmlVideoIdMatch?.[1]) {
          return htmlVideoIdMatch[1];
        }
      } catch {
        // Ignore fallback lookup errors and continue to the next candidate.
      }
    }

    return '';
  };

  const resolveChannelIdFromSourcePage = async (sourceType, sourceValue, resolvedChannelId) => {
    const candidates = [];

    if (resolvedChannelId) {
      candidates.push(`https://www.youtube.com/channel/${resolvedChannelId}`);
    }

    if (sourceType === 'handle' && sourceValue) {
      candidates.push(`https://www.youtube.com/@${sourceValue}`);
    }
    if (sourceType === 'channelName' && sourceValue) {
      candidates.push(`https://www.youtube.com/results?search_query=${encodeURIComponent(sourceValue)}`);
    }

    for (const candidate of candidates) {
      try {
        const pageResponse = await fetch(candidate, {
          redirect: 'follow',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; GurdwaraCommunityPlatform/1.0)'
          }
        });

        if (!pageResponse.ok) {
          continue;
        }

        const resolvedFromUrl = String(pageResponse.url || '').match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/i)?.[1] || '';
        if (resolvedFromUrl) {
          return resolvedFromUrl;
        }

        const html = await pageResponse.text();
        const fromJson = html.match(/"channelId":"(UC[A-Za-z0-9_-]{20,})"/i)?.[1] || '';
        if (fromJson) {
          return fromJson;
        }

        const fromPath = html.match(/\/channel\/(UC[A-Za-z0-9_-]{20,})/i)?.[1] || '';
        if (fromPath) {
          return fromPath;
        }
      } catch {
        // Ignore fallback lookup errors and continue to the next candidate.
      }
    }

    return '';
  };

  if (parsedSource.type === 'videoId') {
    const videoDetails = await fetchVideoDetails(parsedSource.value);

    if (videoDetails?.isLive) {
      return {
        available: true,
        reason: '',
        checkedAt: new Date().toISOString(),
        channelId: videoDetails.channelId,
        videoId: videoDetails.videoId,
        title: videoDetails.title,
        channelTitle: videoDetails.channelTitle,
        concurrentViewers: videoDetails.concurrentViewers,
        totalViews: videoDetails.totalViews,
        embedUrl: videoDetails.embedUrl,
        watchUrl: videoDetails.watchUrl
      };
    }

    return {
      available: false,
      reason: 'not_live',
      checkedAt: new Date().toISOString(),
      channelId: videoDetails?.channelId || '',
      videoId: parsedSource.value,
      title: videoDetails?.title || '',
      channelTitle: videoDetails?.channelTitle || '',
      concurrentViewers: null,
      totalViews: videoDetails?.totalViews ?? null,
      embedUrl: videoDetails?.embedUrl || `https://www.youtube.com/embed/${parsedSource.value}`,
      watchUrl: videoDetails?.watchUrl || `https://www.youtube.com/watch?v=${parsedSource.value}`
    };
  }

  let channelId = parsedSource.type === 'channelId' ? parsedSource.value : '';

  if (parsedSource.type === 'handle') {
    if (youtubeApiKey) {
      const channelLookupUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
      channelLookupUrl.searchParams.set('part', 'id');
      channelLookupUrl.searchParams.set('forHandle', parsedSource.value);
      channelLookupUrl.searchParams.set('key', youtubeApiKey);

      const channelResponse = await fetch(channelLookupUrl);
      const channelPayload = await channelResponse.json().catch(() => ({}));
      channelId = channelPayload?.items?.[0]?.id || '';

      if (!channelResponse.ok || !channelId) {
        channelId = await resolveChannelIdFromSourcePage(parsedSource.type, parsedSource.value, channelId);
      }
    } else {
      channelId = await resolveChannelIdFromSourcePage(parsedSource.type, parsedSource.value, channelId);
    }

    if (!channelId) {
      const error = new Error('Unable to resolve the YouTube channel handle.');
      error.status = 404;
      throw error;
    }
  }

  if (parsedSource.type === 'channelName') {
    if (youtubeApiKey) {
      const channelSearchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
      channelSearchUrl.searchParams.set('part', 'snippet');
      channelSearchUrl.searchParams.set('q', parsedSource.value);
      channelSearchUrl.searchParams.set('type', 'channel');
      channelSearchUrl.searchParams.set('maxResults', '1');
      channelSearchUrl.searchParams.set('key', youtubeApiKey);

      const channelSearchResponse = await fetch(channelSearchUrl);
      const channelSearchPayload = await channelSearchResponse.json().catch(() => ({}));
      channelId = channelSearchPayload?.items?.[0]?.id?.channelId || '';
    }

    if (!channelId) {
      channelId = await resolveChannelIdFromSourcePage(parsedSource.type, parsedSource.value, channelId);
    }

    if (!channelId) {
      const error = new Error('Unable to resolve the YouTube channel name. Try its @handle instead.');
      error.status = 404;
      throw error;
    }
  }

  let videoId = '';
  let searchResponseOk = false;

  if (youtubeApiKey && channelId) {
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('channelId', channelId);
    searchUrl.searchParams.set('eventType', 'live');
    searchUrl.searchParams.set('type', 'video');
    searchUrl.searchParams.set('maxResults', '1');
    searchUrl.searchParams.set('key', youtubeApiKey);

    const searchResponse = await fetch(searchUrl);
    searchResponseOk = searchResponse.ok;
    const searchPayload = await searchResponse.json().catch(() => ({}));
    const liveItem = searchPayload?.items?.[0] || null;
    videoId = liveItem?.id?.videoId || '';
  }

  if (!videoId) {
    videoId = await resolveLiveVideoIdFromChannelPage(parsedSource.type, parsedSource.value, channelId);
  }

  if (!videoId) {
    const fallbackWatchUrl = parsedSource.type === 'handle'
      ? `https://www.youtube.com/@${parsedSource.value}/live`
      : channelId
        ? `https://www.youtube.com/channel/${channelId}/live`
        : '';
    const fallbackEmbedUrl = channelId
      ? `https://www.youtube.com/embed/live_stream?channel=${channelId}`
      : '';

    return {
      available: Boolean(fallbackEmbedUrl),
      reason: searchResponseOk ? 'not_live' : 'lookup_fallback',
      checkedAt: new Date().toISOString(),
      channelId,
      videoId: '',
      title: '',
      channelTitle: '',
      concurrentViewers: null,
      totalViews: null,
      embedUrl: fallbackEmbedUrl,
      watchUrl: fallbackWatchUrl
    };
  }

  const liveDetails = await fetchVideoDetails(videoId);

  if (!liveDetails) {
    return {
      available: false,
      reason: 'lookup_failed',
      checkedAt: new Date().toISOString(),
      channelId,
      videoId,
      title: '',
      channelTitle: '',
      concurrentViewers: null,
      totalViews: null,
      embedUrl: '',
      watchUrl: ''
    };
  }

  return {
    available: true,
    reason: '',
    checkedAt: new Date().toISOString(),
    channelId: liveDetails.channelId || channelId,
    videoId: liveDetails.videoId,
    title: liveDetails.title,
    channelTitle: liveDetails.channelTitle,
    concurrentViewers: liveDetails.concurrentViewers,
    totalViews: liveDetails.totalViews,
    embedUrl: liveDetails.embedUrl,
    watchUrl: liveDetails.watchUrl
  };
};

const recitationService = createRecitationService({ eventsDb, sendJson, parseJsonObjectBody, assertInput });
const socialPostingService = createSocialPostingService({
  eventsDb,
  sendJson,
  parseJsonObjectBody,
  assertInput,
  isAdmin: canManageDonations,
  getActorName: (request) => getRequestActor(request).name,
  uploadsDir,
  publicBaseUrl: newsletterPublicBaseUrl,
  timeZone: String(process.env.SOCIAL_CARDS_TIME_ZONE || volunteerReminderTimeZone || 'America/Toronto').trim(),
  organizationName: String(process.env.SOCIAL_ORGANIZATION_NAME || defaultOrganizationName).trim()
});
const ledScreenService = createLedScreenService({
  eventsDb,
  sendJson,
  parseJsonObjectBody,
  assertInput,
  isAdmin: canManageDonations
});
const widgetPlacementsHandler = createWidgetPlacementsHandler({ eventsDb, getRequestActor, parseJsonObjectBody, sendJson });
const welcomeJourneyHandler = createWelcomeJourneyHandler({
  eventsDb,
  getRequestActor,
  parseJsonObjectBody,
  sendJson,
  verifyGoogleAccessToken: async (token) => {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Google token verification failed.');
    return response.json();
  },
  appendAuditLog
});

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (await whatsappWebhookHandler(request, response, requestUrl)) {
    return;
  }

  if (recitationService.handleLive(request, response, requestUrl)) {
    return;
  }

  if (requestUrl.pathname === '/api/live/langar' && request.method === 'GET') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write('retry: 3000\n\n');
    langarBoardEventClients.add(response);
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25000);
    heartbeat.unref?.();
    response.on('close', () => {
      clearInterval(heartbeat);
      langarBoardEventClients.delete(response);
    });
    return;
  }

  const rateLimitAllowed = await enforceRateLimit(request, response, requestUrl);
  if (!rateLimitAllowed) {
    return;
  }

  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  if (requestUrl.pathname === '/api/widget-placements') {
    await widgetPlacementsHandler(request, response);
    return;
  }

  if (requestUrl.pathname.startsWith('/api/welcome-journey/')) {
    await welcomeJourneyHandler(request, response, requestUrl);
    return;
  }

  if (requestUrl.pathname === '/api/gurpurab/holidays' || requestUrl.pathname === '/api/gurpurab/upcoming') {
    const result = await handleGurpurabRequest(requestUrl, {
      method: request.method,
      fetchImpl: fetch,
      baseUrl: process.env.GURPURAB_HOLIDAYS_API_URL || undefined
    });
    sendJson(response, result.status, result.payload);
    return;
  }

  if (await recitationService.handleApi(request, response, requestUrl)) {
    return;
  }

  if (await socialPostingService.handleApi(request, response, requestUrl)) {
    return;
  }

  if (await ledScreenService.handleApi(request, response, requestUrl)) {
    return;
  }

  if (requestUrl.pathname === '/api/instacart/readiness' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, data: instacartConnect.getReadiness() });
    return;
  }

  if (requestUrl.pathname === '/api/instacart/quote' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: 32 * 1024, allowEmpty: false });
      assertInput(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 20, 'Choose between 1 and 20 grocery items.');
      const seenItems = new Set();
      const items = body.items.map((item) => {
        const itemId = readStringField(item, 'itemId', { required: true, max: 80 });
        const name = readStringField(item, 'name', { required: true, max: 120 });
        const quantity = Number(item.quantity);
        assertInput(Number.isInteger(quantity) && quantity > 0 && quantity <= 1000, 'Each grocery quantity must be from 1 to 1000.');
        assertInput(!seenItems.has(itemId), 'Grocery item identifiers must be unique.');
        seenItems.add(itemId);
        return { itemId, name, quantity, unit: readStringField(item, 'unit', { max: 40 }) || 'items' };
      });
      const postalCode = readStringField(body, 'postalCode', { max: 20 });
      const data = await instacartConnect.getQuote({ items, postalCode });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 502, { ok: false, message: error.message || 'Unable to retrieve Instacart options.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/health') {
    sendJson(response, 200, {
      ok: true,
      stripeConfigured: Boolean(stripeSecretKey),
      webhookConfigured: Boolean(stripeWebhookSecret),
      donationSmsConfigured: process.env.SMS_ENABLED === 'true'
        && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
      eventsDatabaseConfigured: eventsDb.hasDatabaseConnection,
      databaseEngine: eventsDb.engine,
      uploadStorageConfigured: Boolean(configuredUploadsDir),
      mailTransport: localMailTransport,
      smtpProvider: localMailTransport === 'smtp' ? smtpProvider : null,
      apiVersion: API_VERSION,
      startupId: API_STARTUP_ID,
      serverPort: port
    });
    return;
  }

  if (requestUrl.pathname === '/api/stream-overlay/settings' && request.method === 'GET') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Stream overlay settings are temporarily unavailable.', 503);
      const data = await eventsDb.getSingleton('stream_overlay_settings', {});
      sendJson(response, 200, { ok: true, data: data && typeof data === 'object' ? data : {} });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load stream overlay settings.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stream-overlay/settings' && request.method === 'PUT') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/recitations'), 'Live Recitation admin access is required to update the stream overlay.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Stream overlay settings are temporarily unavailable.', 503);
      const body = await parseJsonObjectBody(request, { maxBytes: 8192, allowEmpty: false });
      const allowedKeys = [
        'overlayOn', 'overlayLogo', 'overlayLanguages', 'overlayOpacity', 'gurmukhiSize', 'punjabiSize', 'englishSize',
        'overlayAnnouncement', 'overlayHeaderMessage', 'headerSize', 'headerPunjabiSize', 'punjabiAnnouncement', 'headerPunjabi',
        'upperEnglish', 'upperPunjabi', 'upperSpeed', 'lowerSpeed', 'tickerColors', 'upperSize', 'lowerSize', 'overlayThemeId'
      ];
      ensureNoUnknownKeys(body, allowedKeys);
      const booleans = ['overlayOn', 'overlayLogo'];
      booleans.forEach((key) => assertInput(typeof body[key] === 'boolean', `${key} must be a boolean.`));
      const numericRanges = {
        overlayOpacity: [15, 100], gurmukhiSize: [0, 100], punjabiSize: [0, 100], englishSize: [0, 100],
        headerSize: [0, 100], headerPunjabiSize: [0, 100], upperSpeed: [0, 100], lowerSpeed: [0, 100], upperSize: [0, 100], lowerSize: [0, 100]
      };
      Object.entries(numericRanges).forEach(([key, [min, max]]) => {
        assertInput(typeof body[key] === 'number' && Number.isFinite(body[key]) && body[key] >= min && body[key] <= max, `${key} must be between ${min} and ${max}.`);
      });
      assertInput(['gpe', 'ge', 'gp', 'g'].includes(String(body.overlayLanguages)), 'overlayLanguages is invalid.');
      assertInput(typeof body.overlayThemeId === 'string' && body.overlayThemeId.length <= 80, 'overlayThemeId must be text up to 80 characters.');
      const textLimits = {
        overlayAnnouncement: 180, overlayHeaderMessage: 120, punjabiAnnouncement: 180, headerPunjabi: 120,
        upperEnglish: 180, upperPunjabi: 180
      };
      Object.entries(textLimits).forEach(([key, max]) => assertInput(typeof body[key] === 'string' && body[key].length <= max, `${key} must be text up to ${max} characters.`));
      assertInput(body.tickerColors && typeof body.tickerColors === 'object' && !Array.isArray(body.tickerColors), 'tickerColors must be an object.');
      const tickerColorKeys = ['upperbg', 'upperfg', 'lowerbg', 'lowerfg'];
      ensureNoUnknownKeys(body.tickerColors, tickerColorKeys);
      tickerColorKeys.forEach((key) => assertInput(/^#[0-9a-f]{6}$/i.test(String(body.tickerColors[key] || '')), `tickerColors.${key} must be a hex color.`));
      const data = await eventsDb.setSingleton('stream_overlay_settings', body);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save stream overlay settings.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/ask-granthi/board' && request.method === 'GET') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Ask a Granthi is temporarily unavailable.', 503);
      const [questions, branding] = await Promise.all([
        listPublicGranthiQuestions(eventsDb, 12),
        getGurdwaraBranding(eventsDb)
      ]);
      sendJson(response, 200, { ok: true, data: { questions, branding } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load Ask a Granthi.' });
    }
    return;
  }

  if ((requestUrl.pathname === '/api/gurdwara-branding' || requestUrl.pathname === '/api/ask-granthi/branding') && request.method === 'GET') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Gurdwara branding is temporarily unavailable.', 503);
      sendJson(response, 200, { ok: true, data: await getGurdwaraBranding(eventsDb) });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load branding.' });
    }
    return;
  }

  if ((requestUrl.pathname === '/api/gurdwara-branding' || requestUrl.pathname === '/api/ask-granthi/branding') && request.method === 'PUT') {
    try {
      const actor = getRequestActor(request);
      assertInput(actor.email && actor.role.trim().toLowerCase() === 'super admin', 'Only Super Admins can change Gurdwara branding.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Gurdwara branding is temporarily unavailable.', 503);
      const users = await eventsDb.listItems('users');
      const user = users.find((entry) => String(entry.email || '').trim().toLowerCase() === actor.email);
      const role = String(user?.role || '').trim().toLowerCase();
      assertInput(Boolean(user) && user.isActive === true && String(user.approvalStatus || '').trim().toLowerCase() === 'approved' && role === 'super admin', 'Only active, approved Super Admins can change Gurdwara branding.', 403);
      assertInput(actor.role.trim().toLowerCase() === role, 'Your session permissions changed. Please sign in again.', 403);
      const payload = await parseJsonObjectBody(request, { maxBytes: 32 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(payload, ['organizationName', 'shortName', 'logoUrl', 'primaryColor', 'accentColor', 'surfaceColor', 'footerColor', 'textColor', 'savedThemes', 'buttonColor', 'buttonHoverColor', 'linkColor', 'linkHoverColor', 'tagline', 'faviconUrl', 'headingFont', 'bodyFont', 'cornerStyle', 'logoShape', 'address', 'phone', 'email', 'facebookUrl', 'instagramUrl', 'youtubeUrl']);
      const colorPattern = /^#[0-9a-f]{6}$/i;
      const logoUrl = readStringField(payload, 'logoUrl', { max: 1000 });
      assertInput(!logoUrl || /^(https?:\/\/|\/)/i.test(logoUrl), 'logoUrl must be an HTTPS URL or site-relative path.');
      const faviconUrl = readStringField(payload, 'faviconUrl', { max: 1000 });
      assertInput(!faviconUrl || /^(https?:\/\/|\/)/i.test(faviconUrl), 'faviconUrl must be an HTTPS URL or site-relative path.');
      const readOptionalUrl = (key) => {
        const value = readStringField(payload, key, { max: 500 });
        assertInput(!value || /^https?:\/\//i.test(value), `${key} must start with http:// or https://.`);
        return value;
      };
      const headingFont = readStringField(payload, 'headingFont', { max: 60 }) || 'Crimson Text';
      const bodyFont = readStringField(payload, 'bodyFont', { max: 60 }) || 'Manrope';
      const cornerStyle = readStringField(payload, 'cornerStyle', { max: 20 }) || 'soft';
      assertInput(BRANDING_FONTS.includes(headingFont) && BRANDING_FONTS.includes(bodyFont), 'Choose a supported font.');
      assertInput(BRANDING_CORNER_STYLES.includes(cornerStyle), 'Choose a supported corner style.');
      const logoShape = readStringField(payload, 'logoShape', { max: 20 }) || 'circle';
      assertInput(['circle', 'original'].includes(logoShape), 'Choose a supported logo shape.');
      const email = readStringField(payload, 'email', { max: 160 });
      assertInput(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'email has an invalid format.');
      const savedThemesInput = payload.savedThemes == null ? [] : payload.savedThemes;
      assertInput(Array.isArray(savedThemesInput) && savedThemesInput.length <= 12, 'savedThemes must be a list of at most 12 themes.');
      const savedThemes = savedThemesInput.map((theme, index) => {
        assertInput(theme && typeof theme === 'object' && theme.values && typeof theme.values === 'object', `savedThemes[${index}] is invalid.`);
        const name = readStringField(theme, 'name', { required: true, min: 1, max: 60 });
        const id = readStringField(theme, 'id', { required: true, max: 60, pattern: /^[a-z0-9-]+$/i });
        const values = {};
        BRANDING_THEME_KEYS.forEach((key) => {
          const value = readStringField(theme.values, key, { max: 60 });
          if (/Color$/.test(key)) {
            assertInput(!value || colorPattern.test(value), `savedThemes[${index}].${key} must be a six-digit color.`);
          } else if (key === 'cornerStyle') {
            assertInput(!value || BRANDING_CORNER_STYLES.includes(value), `savedThemes[${index}].${key} is not supported.`);
          } else {
            assertInput(!value || BRANDING_FONTS.includes(value), `savedThemes[${index}].${key} is not supported.`);
          }
          values[key] = value;
        });
        return { id, name, values };
      });
      const branding = {
        savedThemes,
        footerColor: readStringField(payload, 'footerColor', { pattern: colorPattern, max: 7 }),
        textColor: readStringField(payload, 'textColor', { pattern: colorPattern, max: 7 }),
        buttonColor: readStringField(payload, 'buttonColor', { pattern: colorPattern, max: 7 }),
        buttonHoverColor: readStringField(payload, 'buttonHoverColor', { pattern: colorPattern, max: 7 }),
        linkColor: readStringField(payload, 'linkColor', { pattern: colorPattern, max: 7 }),
        linkHoverColor: readStringField(payload, 'linkHoverColor', { pattern: colorPattern, max: 7 }),
        tagline: readStringField(payload, 'tagline', { max: 240 }),
        faviconUrl,
        headingFont,
        bodyFont,
        cornerStyle,
        logoShape,
        address: readStringField(payload, 'address', { max: 240 }),
        phone: readStringField(payload, 'phone', { max: 40 }),
        email,
        facebookUrl: readOptionalUrl('facebookUrl'),
        instagramUrl: readOptionalUrl('instagramUrl'),
        youtubeUrl: readOptionalUrl('youtubeUrl'),
        organizationName: readStringField(payload, 'organizationName', { required: true, min: 2, max: 120 }),
        shortName: readStringField(payload, 'shortName', { required: true, min: 2, max: 80 }),
        logoUrl,
        primaryColor: readStringField(payload, 'primaryColor', { required: true, pattern: colorPattern, max: 7 }),
        accentColor: readStringField(payload, 'accentColor', { required: true, pattern: colorPattern, max: 7 }),
        surfaceColor: readStringField(payload, 'surfaceColor', { required: true, pattern: colorPattern, max: 7 })
      };
      const data = await saveGurdwaraBranding(eventsDb, branding);
      await appendAuditLog(request, {
        action: 'gurdwara.branding.update',
        targetType: 'gurdwara_branding',
        targetId: 'default',
        description: 'Updated application-wide Gurdwara branding.',
        payload: branding
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save branding.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/ask-granthi/questions' && request.method === 'GET') {
    try {
      assertInput(canManageGranthiQuestions(request), 'Admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Ask a Granthi is temporarily unavailable.', 503);
      sendJson(response, 200, { ok: true, data: await listGranthiQuestions(eventsDb) });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load questions.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/ask-granthi/questions' && request.method === 'POST') {
    let pendingRecord = null;
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Ask a Granthi is temporarily unavailable.', 503);
      const payload = await parseJsonObjectBody(request, { maxBytes: 8 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(payload, ['question']);
      const question = normalizeGranthiQuestion(readStringField(payload, 'question', { required: true, min: 8, max: 500 }));
      const reusable = await findReusableAnswer(eventsDb, question);
      if (reusable) {
        const data = await reuseGranthiAnswer(eventsDb, reusable);
        sendJson(response, 200, { ok: true, reused: true, data });
        return;
      }

      const aiRateLimit = evaluateFixedWindowLimit(
        fixedWindowRateState,
        `ask-granthi:${resolveClientIp(request) || 'unknown-ip'}`,
        rateLimitConfig.gurmatAiMaxRequests,
        rateLimitConfig.gurmatAiWindowMs,
        Date.now()
      );
      if (aiRateLimit.limited) {
        sendRateLimitExceeded(response, aiRateLimit.retryAfterMs, 'The Ask a Granthi request limit has been reached. Please try again later.', 'ask-granthi');
        return;
      }

      pendingRecord = await createThinkingQuestion(eventsDb, question, { submittedFrom: 'qr' });
      const generatedAnswer = await createGranthiAnswer(question);
      const data = await completeGranthiAnswer(eventsDb, pendingRecord, generatedAnswer);
      sendJson(response, 201, { ok: true, reused: false, data });
    } catch (error) {
      if (pendingRecord) {
        await failGranthiAnswer(eventsDb, pendingRecord, error).catch(() => {});
      }
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to answer the question.' });
    }
    return;
  }

  const granthiQuestionMatch = requestUrl.pathname.match(/^\/api\/ask-granthi\/questions\/([^/]+)$/);
  if (granthiQuestionMatch && request.method === 'PATCH') {
    try {
      assertInput(canManageGranthiQuestions(request), 'Admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Ask a Granthi is temporarily unavailable.', 503);
      const questionId = decodeURIComponent(granthiQuestionMatch[1]);
      const records = await listGranthiQuestions(eventsDb);
      const existing = records.find((record) => record.id === questionId);
      assertInput(existing, 'Question not found.', 404);
      const payload = await parseJsonObjectBody(request, { maxBytes: 32 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(payload, ['question', 'shortAnswer', 'answerPunjabi', 'answerEnglish', 'category', 'featured', 'visible']);
      const nextQuestion = Object.prototype.hasOwnProperty.call(payload, 'question')
        ? normalizeGranthiQuestion(readStringField(payload, 'question', { required: true, min: 8, max: 500 }))
        : existing.question;
      const nextRecord = {
        ...existing,
        question: nextQuestion,
        questionKey: normalizeQuestionKey(nextQuestion),
        shortAnswer: Object.prototype.hasOwnProperty.call(payload, 'shortAnswer') ? readStringField(payload, 'shortAnswer', { required: true, min: 2, max: 120 }) : existing.shortAnswer,
        answerPunjabi: Object.prototype.hasOwnProperty.call(payload, 'answerPunjabi') ? readStringField(payload, 'answerPunjabi', { required: true, min: 2, max: 700 }) : existing.answerPunjabi,
        answerEnglish: Object.prototype.hasOwnProperty.call(payload, 'answerEnglish') ? readStringField(payload, 'answerEnglish', { required: true, min: 2, max: 700 }) : existing.answerEnglish,
        category: Object.prototype.hasOwnProperty.call(payload, 'category') ? readStringField(payload, 'category', { required: true, min: 2, max: 80 }) : existing.category,
        featured: Object.prototype.hasOwnProperty.call(payload, 'featured') ? readBooleanField(payload, 'featured', { required: true }) : Boolean(existing.featured),
        visible: Object.prototype.hasOwnProperty.call(payload, 'visible') ? readBooleanField(payload, 'visible', { required: true }) : existing.visible !== false,
        status: 'answered',
        errorMessage: '',
        updatedAt: new Date().toISOString()
      };
      const data = await eventsDb.updateItem('ask_granthi_questions', questionId, nextRecord);
      await appendAuditLog(request, {
        action: 'ask_granthi.question.update',
        targetType: 'ask_granthi_question',
        targetId: questionId,
        description: 'Updated an Ask a Granthi question and answer.',
        payload: { featured: nextRecord.featured, visible: nextRecord.visible }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to update the question.' });
    }
    return;
  }

  if (granthiQuestionMatch && request.method === 'DELETE') {
    try {
      assertInput(canManageGranthiQuestions(request), 'Admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Ask a Granthi is temporarily unavailable.', 503);
      const questionId = decodeURIComponent(granthiQuestionMatch[1]);
      await eventsDb.removeItem('ask_granthi_questions', questionId);
      await appendAuditLog(request, {
        action: 'ask_granthi.question.delete',
        targetType: 'ask_granthi_question',
        targetId: questionId,
        description: 'Deleted an Ask a Granthi question.'
      });
      sendJson(response, 200, { ok: true, data: { id: questionId } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to delete the question.' });
    }
    return;
  }

  const granthiRetryMatch = requestUrl.pathname.match(/^\/api\/ask-granthi\/questions\/([^/]+)\/retry$/);
  if (granthiRetryMatch && request.method === 'POST') {
    let pendingRecord = null;
    try {
      assertInput(canManageGranthiQuestions(request), 'Admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Ask a Granthi is temporarily unavailable.', 503);
      const questionId = decodeURIComponent(granthiRetryMatch[1]);
      const records = await listGranthiQuestions(eventsDb);
      const existing = records.find((record) => record.id === questionId);
      assertInput(existing, 'Question not found.', 404);
      const now = new Date().toISOString();
      pendingRecord = await eventsDb.updateItem('ask_granthi_questions', questionId, {
        ...existing,
        status: 'thinking',
        visible: true,
        errorMessage: '',
        updatedAt: now,
        lastAskedAt: now
      });
      const generatedAnswer = await createGranthiAnswer(existing.question);
      const data = await completeGranthiAnswer(eventsDb, pendingRecord, generatedAnswer);
      await appendAuditLog(request, {
        action: 'ask_granthi.question.retry',
        targetType: 'ask_granthi_question',
        targetId: questionId,
        description: 'Regenerated an Ask a Granthi answer.'
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      if (pendingRecord) {
        await failGranthiAnswer(eventsDb, pendingRecord, error).catch(() => {});
      }
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to regenerate the answer.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/kids-learning/gurmat-guide/recent' && request.method === 'GET') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'The Word of the Day database is unavailable.', 503);
      const data = await listRecentGurmatGuides(eventsDb, 5);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to load recent words.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/admin/kids-learning/generated-words' && request.method === 'GET') {
    try {
      const actor = getRequestActor(request);
      assertInput(['admin', 'super admin'].includes(String(actor.role || '').trim().toLowerCase()), 'Admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'The Word of the Day database is unavailable.', 503);
      sendJson(response, 200, { ok: true, data: await listStoredGurmatGuides(eventsDb, 200) });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load generated words.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/admin/kids-learning/generated-quizzes' && request.method === 'GET') {
    try {
      const actor = getRequestActor(request);
      assertInput(['admin', 'super admin'].includes(String(actor.role || '').trim().toLowerCase()), 'Admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'The AI quiz database is unavailable.', 503);
      sendJson(response, 200, { ok: true, data: await listStoredAiQuizzes(eventsDb, 200) });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load generated quizzes.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/kids-learning/ai-quiz' && request.method === 'POST') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'The AI quiz database is unavailable.', 503);
      const payload = await parseJsonObjectBody(request, { maxBytes: 4 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(payload, ['topic', 'difficulty']);
      const topic = readStringField(payload, 'topic', { required: true, min: 2, max: 60 });
      const difficulty = readStringField(payload, 'difficulty', { required: true, min: 4, max: 10 });
      const storedQuiz = await findDailyAiQuiz(eventsDb, topic, difficulty);
      if (storedQuiz) {
        sendJson(response, 200, { ok: true, data: storedQuiz });
        return;
      }

      const aiRateLimit = evaluateFixedWindowLimit(
        fixedWindowRateState,
        `kids-ai-quiz:${resolveClientIp(request) || 'unknown-ip'}`,
        rateLimitConfig.gurmatAiMaxRequests,
        rateLimitConfig.gurmatAiWindowMs,
        Date.now()
      );
      if (aiRateLimit.limited) {
        sendRateLimitExceeded(response, aiRateLimit.retryAfterMs, 'The free AI quiz limit has been reached. Please try again later.', 'kids-ai-quiz');
        return;
      }

      const generatedQuiz = await createAiQuiz(topic, difficulty);
      const data = await storeDailyAiQuiz(eventsDb, generatedQuiz);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to create the AI quiz.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/kids-learning/gurmat-guide' && request.method === 'POST') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'The Word of the Day database is unavailable.', 503);
      const payload = await parseJsonObjectBody(request, { maxBytes: 4 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(payload, ['word']);
      const word = readStringField(payload, 'word', { required: true, min: 2, max: 40 });
      const storedGuide = await findStoredGurmatGuide(eventsDb, word);
      if (storedGuide) {
        sendJson(response, 200, { ok: true, data: storedGuide });
        return;
      }

      const aiRateLimit = evaluateFixedWindowLimit(
        fixedWindowRateState,
        `gurmat-ai:${resolveClientIp(request) || 'unknown-ip'}`,
        rateLimitConfig.gurmatAiMaxRequests,
        rateLimitConfig.gurmatAiWindowMs,
        Date.now()
      );
      if (aiRateLimit.limited) {
        sendRateLimitExceeded(response, aiRateLimit.retryAfterMs, 'The free AI lesson limit has been reached. Please try again later.', 'gurmat-ai');
        return;
      }
      const generatedGuide = await createGurmatGuide(word);
      const data = await storeGurmatGuide(eventsDb, generatedGuide);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to create the Gurmat learning guide.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/contact-us/send' && request.method === 'POST') {
    try {
      const payload = await parseJsonObjectBody(request, { maxBytes: 128 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(payload, ['name', 'email', 'phone', 'message', 'subject', 'to']);

      const name = readStringField(payload, 'name', { required: true, min: 2, max: 140 });
      const senderEmail = readEmailField(payload, 'email', { required: true });
      const phone = readPhoneField(payload, 'phone');
      const message = readStringField(payload, 'message', { required: true, min: 8, max: 5000 });
      const subject = readStringField(payload, 'subject', { max: 200 }) || `Contact Us Inquiry from ${name}`;
      const requestedRecipient = readStringField(payload, 'to', { max: 254, toLowerCase: true });

      const recipient = isValidEmailAddress(requestedRecipient)
        ? requestedRecipient
        : (isValidEmailAddress(contactUsInboxAddress) ? contactUsInboxAddress : '');
      assertInput(Boolean(recipient), 'Contact inbox email is not configured. Set CONTACT_US_EMAIL or SMTP_FROM.');

      const template = buildContactInquiryEmail({
        name,
        email: senderEmail,
        phone,
        message,
        subject
      });

      const deliveryResult = await sendViaConfiguredMailTransport({
        from: localMailFromAddress,
        toList: [recipient],
        subject: template.subject,
        textBody: template.text,
        htmlBody: template.html,
        attachments: []
      });

      sendJson(response, 200, {
        ok: true,
        sent: true,
        provider: String(deliveryResult?.provider || localMailTransport || 'sendmail').trim(),
        recipient,
        type: 'contact'
      });
    } catch (error) {
      logServerError(error, 'contact-us-send');
      sendJson(response, error.status || 502, {
        ok: false,
        sent: false,
        message: error?.message || 'Unable to send contact message.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/internal/mail-relay' && request.method === 'POST') {
    const remoteAddress = String(request.socket?.remoteAddress || '').trim();
    if (!isLoopbackAddress(remoteAddress)) {
      sendJson(response, 403, {
        ok: false,
        message: 'Mail relay only accepts local requests.'
      });
      return;
    }

    try {
      const payload = await parseJsonObjectBody(request);
      const relayPayload = isPlainObject(payload.body) ? payload.body : payload;
      const recipients = normalizeRecipientList(relayPayload);
      const bccRecipients = normalizeBccRecipientList(relayPayload);
      if (recipients.length === 0 && bccRecipients.length === 0) {
        sendJson(response, 400, {
          ok: false,
          message: 'Recipient address required.'
        });
        return;
      }

      const subject = sanitizeHeaderValue(relayPayload.subject || relayPayload.title || `${defaultOrganizationShortName} Notification`)
        || `${defaultOrganizationShortName} Notification`;
      const htmlBody = String(relayPayload.html || relayPayload.bodyHtml || relayPayload.content || relayPayload.message || '').trim();
      const textBody = String(relayPayload.text || relayPayload.bodyText || relayPayload.message || '').trim();
      const attachments = normalizeAttachmentList(relayPayload);
      const isNewsletter = String(relayPayload.type || '').trim().toLowerCase() === 'newsletter';
      const newsletterRecipients = [...new Set([...bccRecipients, ...recipients])];
      const deliveryResult = isNewsletter
        ? await sendNewsletterPrivately({ relayPayload, recipients: newsletterRecipients, subject, htmlBody, textBody, attachments })
        : await sendViaConfiguredMailTransport({
          from: localMailFromAddress,
          toList: recipients,
          bccList: bccRecipients,
          subject,
          textBody,
          htmlBody,
          attachments
        });

      sendJson(response, 200, {
        ok: true,
        sent: true,
        provider: String(deliveryResult?.provider || localMailTransport || 'sendmail').trim(),
        envelopeFrom: String(deliveryResult?.envelopeFrom || localMailFromAddress).trim() || localMailFromAddress,
        messageId: String(deliveryResult?.messageId || '').trim() || undefined,
        acceptedRecipients: Array.isArray(deliveryResult?.accepted) ? deliveryResult.accepted : undefined,
        rejectedRecipients: Array.isArray(deliveryResult?.rejected) ? deliveryResult.rejected : undefined,
        recipients: isNewsletter ? 0 : recipients.length,
        bccRecipients: isNewsletter ? Number(deliveryResult?.newsletterRecipients || 0) : bccRecipients.length,
        hasAttachments: attachments.length > 0,
        type: String(relayPayload.type || '').trim() || 'generic'
      });
    } catch (error) {
      logServerError(error, 'mail-relay');
      sendJson(response, 502, {
        ok: false,
        sent: false,
        message: error?.message || 'Unable to send relay email.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/newsletter/unsubscribe' && request.method === 'GET') {
    try {
      const identity = parseNewsletterUnsubscribeToken(requestUrl.searchParams.get('token') || '');
      const subscribers = await eventsDb.listItems('subscribers');
      const subscriber = (Array.isArray(subscribers) ? subscribers : []).find((entry) => (
        String(entry?.id || '').trim() === identity.id
        && String(entry?.email || '').trim().toLowerCase() === identity.email
      ));
      if (subscriber?.active !== false) {
        await eventsDb.updateItem('subscribers', identity.id, {
          ...subscriber,
          active: false,
          unsubscribedAt: new Date().toISOString(),
          unsubscribeSource: 'newsletter-link'
        });
      }
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Newsletter Unsubscribed</title></head><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:10vh auto;padding:32px;border-top:6px solid #f4a300;background:#fff;box-shadow:0 20px 50px rgba(15,23,42,.12)"><h1 style="margin:0;color:#052f63">You have been unsubscribed</h1><p style="line-height:1.7;color:#475569">This email address has been removed from the active ${escapeHtml(defaultOrganizationShortName)} newsletter list. You will no longer receive newsletter campaigns.</p><a href="/" style="color:#0b4ea2;font-weight:700">Return to ${escapeHtml(defaultOrganizationShortName)}</a></main></body></html>`);
    } catch (error) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Invalid Unsubscribe Link</title></head><body style="font-family:Arial,sans-serif;padding:40px;color:#0f172a"><h1>Unable to unsubscribe</h1><p>${escapeHtml(error?.message || 'This unsubscribe link is invalid.')}</p></body></html>`);
    }
    return;
  }

  if (/^\/api\/streaming\/darbar-sahib\/live\/?$/i.test(requestUrl.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
    response.writeHead(302, {
      Location: '/api/streaming/darbar-sahib/audio',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    });
    response.end();
    return;
  }

  if (/^\/api\/streaming\/darbar-sahib\/audio\/?$/i.test(requestUrl.pathname) && (request.method === 'GET' || request.method === 'HEAD')) {
    proxyDarbarSahibAudio(request, response);
    return;
  }

  const darbarHlsMatch = requestUrl.pathname.match(/^\/api\/streaming\/darbar-sahib\/hls\/(stream\.m3u8|init\.mp4|segment-\d+\.m4s)$/i);
  if (darbarHlsMatch && (request.method === 'GET' || request.method === 'HEAD')) {
    sendJson(response, 410, {
      ok: false,
      message: 'The HLS stream has moved to /api/streaming/darbar-sahib/audio.'
    });
    return;
  }

  if (requestUrl.pathname.startsWith('/api/uploads/') && request.method === 'GET') {
    try {
      const relative = requestUrl.pathname.slice('/api/uploads/'.length);
      const segments = safeUploadPathSegments(relative);
      if (segments.length < 2) {
        sendJson(response, 400, { ok: false, message: 'Invalid upload path.' });
        return;
      }

      const normalizedService = normalizeUploadService(segments[0]);
      if (!normalizedService) {
        sendJson(response, 400, { ok: false, message: 'Invalid upload service.' });
        return;
      }

      const filePath = path.join(uploadsDir, normalizedService, ...segments.slice(1));
      const normalizedRoot = `${path.resolve(uploadsDir)}${path.sep}`;
      const normalizedFilePath = path.resolve(filePath);
      if (!normalizedFilePath.startsWith(normalizedRoot) || !fs.existsSync(normalizedFilePath)) {
        sendJson(response, 404, { ok: false, message: 'File not found.' });
        return;
      }

      const stat = fs.statSync(normalizedFilePath);
      if (!stat.isFile()) {
        sendJson(response, 404, { ok: false, message: 'File not found.' });
        return;
      }

      response.writeHead(200, {
        'Content-Type': getMimeTypeFromName(normalizedFilePath),
        'Content-Length': stat.size,
        'Cache-Control': 'public, max-age=604800',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*'
      });

      fs.createReadStream(normalizedFilePath).pipe(response);
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to read uploaded file.' });
    }
    return;
  }

  const uploadResourceMatch = requestUrl.pathname.match(/^\/api\/uploads\/([a-z0-9_-]+)$/i);
  if (uploadResourceMatch && request.method === 'POST') {
    try {
      ensureStorage();
      const service = normalizeUploadService(uploadResourceMatch[1]);
      if (!service) {
        sendJson(response, 400, { ok: false, message: 'Invalid upload service.' });
        return;
      }
      if (service === 'community-notices') await resolveCommunityAnnouncementSubmitter(request);

      const body = await parseJsonObjectBody(request, { maxBytes: maxUploadBytes * 2, allowEmpty: false });
      ensureNoUnknownKeys(body, ['fileName', 'mimeType', 'dataUrl', 'base64Data']);

      const rawNameField = readStringField(body, 'fileName', { max: 180 }) || 'upload-file';
      const mimeType = readStringField(body, 'mimeType', { max: 160 }).toLowerCase();
      if (mimeType) {
        assertInput(mimeTypePattern.test(mimeType), 'mimeType has an invalid format.');
      }
      const allowedMimeTypes = uploadServiceMimePolicies[service] || uploadServiceMimePolicies.default;
      assertInput(isAllowedUploadMime(mimeType, allowedMimeTypes), 'Unsupported file type for this upload service.');
      const dataUrl = readStringField(body, 'dataUrl', { max: maxUploadBytes * 3 });
      const base64Data = readStringField(body, 'base64Data', { max: maxUploadBytes * 3 });
      const base64Payload = extractBase64Payload(dataUrl || base64Data || '');

      if (!base64Payload) {
        sendJson(response, 400, { ok: false, message: 'No file payload found.' });
        return;
      }

      const fileBuffer = Buffer.from(base64Payload, 'base64');
      if (!fileBuffer.length) {
        sendJson(response, 400, { ok: false, message: 'Invalid file payload.' });
        return;
      }

      const detectedMimeType = detectUploadMimeType(fileBuffer);
      if (!detectedMimeType) {
        sendJson(response, 400, { ok: false, message: 'Uploaded file content is not supported.' });
        return;
      }

      assertInput(isAllowedUploadMime(detectedMimeType, allowedMimeTypes), 'Uploaded file content is not allowed for this service.');
      assertInput(detectedMimeType === mimeType, 'File content does not match the declared file type.');

      if (fileBuffer.length > maxUploadBytes) {
        sendJson(response, 413, { ok: false, message: 'File too large. Max size is 15 MB.' });
        return;
      }

      const finalName = getSafeUploadFileName(rawNameField, detectedMimeType);

      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const storedFileName = `${uniqueSuffix}-${finalName}`;
      const { targetDir, year, month } = buildUploadDirectory(service);
      const outputPath = path.join(targetDir, storedFileName);
      fs.writeFileSync(outputPath, fileBuffer);

      const publicUrl = `/api/uploads/${service}/${year}/${month}/${encodeURIComponent(storedFileName)}`;
      sendJson(response, 200, {
        ok: true,
        data: {
          service,
          fileName: storedFileName,
          size: fileBuffer.length,
          mimeType: detectedMimeType,
          url: publicUrl
        }
      });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to upload file.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/analytics/metrics' && request.method === 'GET') {
    try {
      if (!eventsDb.hasDatabaseConnection) {
        sendJson(response, 500, { ok: false, message: 'Database is not configured.' });
        return;
      }

      const data = await eventsDb.getSingleton('analytics_metrics', null);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to fetch analytics metrics.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/analytics/trend' && request.method === 'GET') {
    try {
      if (!eventsDb.hasDatabaseConnection) {
        sendJson(response, 500, { ok: false, message: 'Database is not configured.' });
        return;
      }

      const data = await eventsDb.getSingleton('analytics_trend', []);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to fetch analytics trend.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/quiz-bank' && request.method === 'GET') {
    try {
      if (!fs.existsSync(quizBankDir)) {
        fs.mkdirSync(quizBankDir, { recursive: true });
      }

      const filesystemFiles = fs.readdirSync(quizBankDir)
        .filter((name) => normalizeQuizFileName(name))
        .sort((left, right) => left.localeCompare(right))
        .map((name) => {
          const filePath = path.join(quizBankDir, name);
          let questionCount = 0;
          try {
            const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            questionCount = Array.isArray(payload) ? payload.length : 0;
          } catch {
            questionCount = 0;
          }

          return { fileName: name, questionCount };
        });

      if (eventsDb.hasDatabaseConnection) {
        let data = await eventsDb.listQuizBankFiles();

        if (!Array.isArray(data) || data.length === 0) {
          for (const file of filesystemFiles) {
            const filePath = getQuizBankFilePath(file.fileName);
            if (!filePath || !fs.existsSync(filePath)) {
              continue;
            }
            try {
              const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
              const questions = Array.isArray(payload) ? payload : [];
              await eventsDb.upsertQuizBankFile(file.fileName, questions);
            } catch {
              // Ignore file parse failures during DB backfill.
            }
          }
          data = await eventsDb.listQuizBankFiles();
        }

        sendJson(response, 200, { ok: true, data: Array.isArray(data) && data.length > 0 ? data : filesystemFiles });
        return;
      }

      sendJson(response, 200, { ok: true, data: filesystemFiles });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to list quiz files.' });
    }
    return;
  }

  const quizBankFileMatch = requestUrl.pathname.match(/^\/api\/quiz-bank\/([^/]+)$/i);
  if (quizBankFileMatch && request.method === 'GET') {
    try {
      const fileName = decodeURIComponent(quizBankFileMatch[1]);
      const filePath = getQuizBankFilePath(fileName);
      if (!filePath) {
        sendJson(response, 400, { ok: false, message: 'Invalid quiz file name.' });
        return;
      }

      const normalizedFileName = path.basename(filePath);
      if (eventsDb.hasDatabaseConnection) {
        const dbRecord = await eventsDb.getQuizBankFile(normalizedFileName);
        if (dbRecord) {
          sendJson(response, 200, { ok: true, data: dbRecord });
          return;
        }
      }

      if (!fs.existsSync(filePath)) {
        sendJson(response, 404, { ok: false, message: 'Quiz file not found.' });
        return;
      }

      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const questions = Array.isArray(payload) ? payload : [];

      if (eventsDb.hasDatabaseConnection) {
        await eventsDb.upsertQuizBankFile(normalizedFileName, questions);
      }

      sendJson(response, 200, { ok: true, data: { fileName: normalizedFileName, questions } });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to read quiz file.' });
    }
    return;
  }

  if (quizBankFileMatch && request.method === 'PUT') {
    try {
      const fileName = decodeURIComponent(quizBankFileMatch[1]);
      const filePath = getQuizBankFilePath(fileName);
      if (!filePath) {
        sendJson(response, 400, { ok: false, message: 'Invalid quiz file name.' });
        return;
      }

      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['questions']);
      const questions = readArrayField(body, 'questions', { required: true, max: 2000 });
      questions.forEach((entry, index) => {
        validateGenericJsonValue(entry, `questions[${index}]`, 0);
      });
      fs.mkdirSync(quizBankDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(questions, null, 2), 'utf8');

      const normalizedFileName = path.basename(filePath);
      if (eventsDb.hasDatabaseConnection) {
        await eventsDb.upsertQuizBankFile(normalizedFileName, questions);
      }

      sendJson(response, 200, { ok: true, data: { fileName: normalizedFileName, questions } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to update quiz file.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/volunteer-registrations' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'opportunityId', 'name', 'email', 'phone', 'whatsapp', 'contactPreference',
        'wantsEventEmails', 'notes', 'isAuthenticated'
      ]);
      const opportunityId = readStringField(body, 'opportunityId', { required: true, max: 128, pattern: simpleIdPattern });
      const name = readStringField(body, 'name', { required: true, min: 2, max: 120 });
      const email = readEmailField(body, 'email', { required: false });
      const phone = readPhoneField(body, 'phone');
      const whatsapp = readPhoneField(body, 'whatsapp');
      const contactPreference = readStringField(body, 'contactPreference', { max: 20 }) || 'Email';
      const wantsEventEmails = readBooleanField(body, 'wantsEventEmails');
      const notes = readStringField(body, 'notes', { max: 1000 });
      readBooleanField(body, 'isAuthenticated');
      assertInput(Boolean(email || phone || whatsapp), 'Either email or phone is required.');

      const opportunities = await eventsDb.listItems('seva_opportunities');
      const opportunity = opportunities.find((entry) => String(entry?.id || '') === opportunityId);
      if (!opportunity) {
        const error = new Error('Please select a valid seva opportunity.');
        error.status = 404;
        throw error;
      }

      const todayDateKey = toDateKeyFromParts(getDatePartsInTimeZone(new Date(), volunteerReminderTimeZone));
      const opportunityDate = String(opportunity.date || '').slice(0, 10);
      const expiryDate = String(opportunity.expiryDate || opportunity.date || '').slice(0, 10);
      if (opportunity.active === false || (opportunityDate && opportunityDate < todayDateKey) || (expiryDate && expiryDate < todayDateKey)) {
        const error = new Error('Registration is closed for this seva opportunity.');
        error.status = 409;
        throw error;
      }

      const registrations = await eventsDb.listItems('volunteer_registrations');
      const matching = registrations.filter((entry) => String(entry?.opportunityId || '') === opportunityId);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPhone = String(phone || whatsapp || '').replace(/\D/g, '');
      const duplicate = matching.some((entry) => {
        const entryEmail = String(entry?.email || '').trim().toLowerCase();
        const entryPhone = String(entry?.phone || entry?.whatsapp || '').replace(/\D/g, '');
        return normalizedEmail
          ? Boolean(entryEmail && entryEmail === normalizedEmail)
          : Boolean(normalizedPhone && entryPhone && entryPhone === normalizedPhone);
      });
      if (duplicate) {
        const error = new Error('You have already registered for this seva opportunity.');
        error.status = 409;
        throw error;
      }

      const confirmedCount = matching.filter((entry) => String(entry?.status || 'confirmed').toLowerCase() !== 'waitlisted').length;
      const totalRequired = Math.max(1, Number(opportunity.totalVolunteersRequired) || 1);
      const isAtCapacity = confirmedCount >= totalRequired;
      if (isAtCapacity && opportunity.waitlistEnabled === false) {
        const error = new Error('Volunteer limit reached for this seva opportunity.');
        error.status = 409;
        throw error;
      }

      const status = isAtCapacity ? 'waitlisted' : 'confirmed';
      const record = {
        id: `vol-${Date.now()}`,
        name,
        email: normalizedEmail,
        phone: phone || '',
        whatsapp: whatsapp || '',
        opportunityId,
        area: opportunity.sevaType || '',
        sevaType: opportunity.sevaType || '',
        sevaDate: opportunity.date || '',
        sevaTime: opportunity.time || '',
        contactPreference,
        wantsEventEmails: wantsEventEmails !== false,
        notes: notes || '',
        status,
        date: todayDateKey,
        createdAt: new Date().toISOString()
      };
      const created = await eventsDb.createItem('volunteer_registrations', record);
      notifyAppUpdate({
        title: status === 'waitlisted' ? 'New Seva Waitlist Registration' : 'New Seva Volunteer',
        body: `A volunteer ${status === 'waitlisted' ? 'joined the waitlist' : 'signed up'} for ${opportunity.sevaType || 'a seva opportunity'}.`,
        url: '/seva',
        tag: 'ssm-volunteer-registration'
      });
      const emailResult = await sendRegistrationStatusEmail({ registration: created, kind: 'seva' });
      const waitlistCount = matching.filter((entry) => String(entry?.status || '').toLowerCase() === 'waitlisted').length
        + (status === 'waitlisted' ? 1 : 0);
      await appendAuditLog(request, {
        action: 'volunteer.registration.create',
        targetType: 'seva_opportunity',
        targetId: opportunityId,
        description: `Registered ${email || phone || name} for seva`,
        payload: { opportunityId, registrationId: created?.id, status }
      });
      sendJson(response, 200, {
        ok: true,
        data: {
          success: true,
          payload: created,
          waitlisted: status === 'waitlisted',
          status,
          waitlistCount,
          emailSent: emailResult.sent === true
        }
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to register for seva.'
      });
    }
    return;
  }

  const volunteerRemovalMatch = requestUrl.pathname.match(/^\/api\/volunteer-registrations\/([^/]+)\/remove$/i);
  if (volunteerRemovalMatch && request.method === 'POST') {
    try {
      const registrationId = parseStringPathId(decodeURIComponent(volunteerRemovalMatch[1]), 'registration id');
      const data = await eventsDb.removeVolunteerRegistration(registrationId);
      const promotedRegistration = data?.promotedRegistration || null;
      notifyAppUpdate({
        title: 'Seva Registration Removed',
        body: `A volunteer registration for ${data?.removedRegistration?.sevaType || 'a seva opportunity'} was removed.${promotedRegistration ? ' A waitlisted volunteer was promoted.' : ''}`,
        url: '/seva',
        tag: 'ssm-volunteer-registration-removed'
      });
      const promotionEmailResult = promotedRegistration
        ? await sendRegistrationStatusEmail({ registration: promotedRegistration, kind: 'seva', promoted: true })
        : { sent: false, reason: 'no_promotion' };
      await appendAuditLog(request, {
        action: 'volunteer.registration.remove',
        targetType: 'seva_opportunity',
        targetId: String(data?.removedRegistration?.opportunityId || ''),
        description: `Removed seva registration ${registrationId}`,
        payload: {
          registrationId,
          opportunityId: data?.removedRegistration?.opportunityId || '',
          promotedRegistrationId: promotedRegistration?.id || ''
        }
      });
      sendJson(response, 200, {
        ok: true,
        data: { ...data, promotionEmailSent: promotionEmailResult.sent === true }
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to remove seva registration.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/public/members' && request.method === 'GET') {
    try {
      const users = await eventsDb.listItems('users');
      const data = users
        .filter((user) => user?.isActive !== false && user?.showOnAbout === true)
        .map((user) => {
          const title = String(user.title || user.role || user.memberType || '').trim() || 'Community Members';
          const hierarchyValue = `${title} ${user.role || ''}`.toLowerCase();
          const hierarchyRank = hierarchyValue.includes('president')
            ? 0
            : hierarchyValue.includes('member')
              ? 1
              : hierarchyValue.includes('volunteer')
                ? 3
                : 2;

          return {
            id: String(user.id || ''),
            name: String(user.name || '').trim(),
            title,
            description: String(user.description || '').trim(),
            avatarUrl: String(user.avatarUrl || '').trim(),
            phone: String(user.phone || '').trim(),
            email: String(user.email || '').trim().toLowerCase(),
            memberSince: String(user.createdAt || '').trim(),
            hierarchyRank
          };
        })
        .filter((user) => user.name)
        .sort((left, right) => left.hierarchyRank - right.hierarchyRank || left.title.localeCompare(right.title) || left.name.localeCompare(right.name))
        .map(({ hierarchyRank, ...member }) => member);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to fetch community members.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/langar-contributions/batch' && request.method === 'POST') {
    try {
      const body = await parseAndValidateGenericObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      const actor = getRequestActor(request);
      const actorEmail = String(actor.email || '').trim().toLowerCase();
      const donorEmail = String(body.donorEmail || '').trim().toLowerCase();
      assertInput(Boolean(actorEmail && donorEmail && actorEmail === donorEmail), 'Please sign in before making Langar commitments.', 401);
      assertInput(Array.isArray(body.items) && body.items.length > 0 && body.items.length <= 50, 'Select between 1 and 50 Langar items.');
      assertInput(body.items.every((item) => Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0), 'Each selected quantity must be a positive whole number.');

      const { data, content } = await eventsDb.createLangarContributionBatch({
        items: body.items,
        donorName: String(body.donorName || actor.name || 'Member').trim(),
        donorEmail: actorEmail,
        donorAvatarUrl: String(body.donorAvatarUrl || ''),
        anonymous: Boolean(body.anonymous),
        expectedDeliveryDate: String(body.expectedDeliveryDate || '')
      });

      if (data.length) {
        notifyAppUpdate({
          title: 'New Langar Commitments',
          body: `${body.anonymous ? 'A sangat member' : actor.name || 'A sangat member'} committed to ${data.length} Langar item${data.length === 1 ? '' : 's'}.`,
          url: '/',
          tag: 'ssm-langar-commitment'
        });

        const rows = data.map((entry) => `<tr><td style="padding:9px;border:1px solid #dbe5f0">${escapeHtml(entry.itemName)}</td><td style="padding:9px;border:1px solid #dbe5f0">${escapeHtml(`${entry.quantity} ${entry.unit}`)}</td></tr>`).join('');
        const listText = data.map((entry) => `- ${entry.itemName}: ${entry.quantity} ${entry.unit}`).join('\n');
        try {
          await sendViaConfiguredMailTransport({
            from: localMailFromAddress,
            toList: [actorEmail],
            subject: `Langar seva commitment confirmation (${data.length} items)`,
            textBody: `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh\n\n${body.anonymous ? 'Sangat member' : body.donorName || actor.name || 'Sangat member'}, thank you for your Langar seva. Your commitments have been recorded:\n\n${listText}\n\nThank you for supporting the sangat.`,
            htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17345f"><h2 style="color:#0b4ea2">Langar commitments confirmed</h2><p>Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh</p><p>Thank you for your Langar seva. We recorded these commitments:</p><table style="border-collapse:collapse;width:100%;margin:20px 0"><thead><tr><th style="padding:9px;border:1px solid #dbe5f0;text-align:left">Item</th><th style="padding:9px;border:1px solid #dbe5f0;text-align:left">Quantity</th></tr></thead><tbody>${rows}</tbody></table><p>Thank you for supporting the sangat.</p></div>`
          });
        } catch (emailError) {
          console.warn('Langar batch confirmation email was not sent:', emailError.message || emailError);
        }
      }

      const remainingByItemId = Object.fromEntries((content?.langarItems || []).map((item) => {
        const committed = data.filter((entry) => String(entry.itemId) === String(item.id)).reduce((sum, entry) => sum + entry.quantity, 0);
        return [String(item.id), Math.max(0, Number(item.quantityRequired || 0) - Number(item.quantityReceived || 0) - committed)];
      }));
      sendJson(response, 200, { ok: true, data, remainingByItemId });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save Langar commitments.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/site-navigation' && request.method === 'GET') {
    try {
      const items = await eventsDb.getSingleton('site_navigation', DEFAULT_SITE_NAVIGATION);
      sendJson(response, 200, { ok: true, data: normalizeSiteNavigation(items) });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: 'Unable to load website navigation.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/site-navigation' && request.method === 'PUT') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/cms'), 'CMS admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Navigation settings are temporarily unavailable.', 503);
      const body = await parseJsonObjectBody(request, { maxBytes: 512 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, ['items']);
      const items = normalizeSiteNavigation(body.items);
      const data = await eventsDb.setSingleton('site_navigation', items);
      await appendAuditLog(request, { action: 'site_navigation.updated', targetType: 'site_navigation', targetId: 'default', description: 'Updated website menu labels and submenu links.' });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save website navigation.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/categories' && request.method === 'GET') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcement types are temporarily unavailable.', 503);
      sendJson(response, 200, { ok: true, data: await getCommunityAnnouncementCategoryCatalog() });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load community announcement types.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/categories' && request.method === 'PUT') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/community-announcements'), 'Community notice admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcement types are temporarily unavailable.', 503);
      const body = await parseJsonObjectBody(request, { maxBytes: 8 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, ['categories']);
      assertInput(Array.isArray(body.categories) && body.categories.length <= 40, 'Provide up to 40 custom announcement types.');
      const seen = new Set();
      const categories = body.categories.map((entry) => {
        assertInput(entry && typeof entry === 'object' && !Array.isArray(entry), 'Each notice type must have a value and label.');
        ensureNoUnknownKeys(entry, ['value', 'label']);
        const value = String(entry.value || '').trim().toLowerCase();
        const label = String(entry.label || '').trim();
        assertInput(/^[a-z0-9][a-z0-9-]{1,39}$/.test(value), 'Notice type key must use 2-40 lowercase letters, numbers, or hyphens.');
        assertInput(label.length >= 2 && label.length <= 100, 'Notice type label must be 2-100 characters.');
        assertInput(!COMMUNITY_ANNOUNCEMENT_CATEGORIES.includes(value) && !seen.has(value), 'Notice type keys must be unique and cannot replace built-in types.');
        seen.add(value);
        return { value, label };
      });
      const submissions = await eventsDb.listItems('community_announcement_submissions');
      const savedCategories = await eventsDb.getSingleton('community_announcement_categories', []);
      const removedInUse = (Array.isArray(savedCategories) ? savedCategories : [])
        .filter((entry) => !seen.has(entry.value) && submissions.some((notice) => notice.category === entry.value && notice.status !== 'rejected'));
      assertInput(removedInUse.length === 0, `Cannot remove a type used by active notices: ${removedInUse.map((entry) => entry.label).join(', ')}.`);
      const saved = await eventsDb.setSingleton('community_announcement_categories', categories);
      sendJson(response, 200, { ok: true, data: saved });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save community announcement types.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/settings' && request.method === 'GET') {
    try {
      const settings = await eventsDb.getSingleton('community_announcement_settings', { slideDurationSeconds: 24 });
      const slideDurationSeconds = Number(settings?.slideDurationSeconds);
      sendJson(response, 200, { ok: true, data: { slideDurationSeconds: Number.isInteger(slideDurationSeconds) && slideDurationSeconds >= 5 && slideDurationSeconds <= 120 ? slideDurationSeconds : 24 } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load community notice board settings.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/settings' && request.method === 'PUT') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/community-announcements'), 'Community notice admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Community notice board settings are temporarily unavailable.', 503);
      const body = await parseJsonObjectBody(request, { maxBytes: 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, ['slideDurationSeconds']);
      const slideDurationSeconds = Number(body.slideDurationSeconds);
      assertInput(Number.isInteger(slideDurationSeconds) && slideDurationSeconds >= 5 && slideDurationSeconds <= 120, 'Slide duration must be between 5 and 120 seconds.');
      const settings = await eventsDb.setSingleton('community_announcement_settings', { slideDurationSeconds });
      sendJson(response, 200, { ok: true, data: settings });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save community notice board settings.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements' && request.method === 'GET') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcements are temporarily unavailable.', 503);
      const records = await eventsDb.listItems('community_announcement_submissions');
      const data = (Array.isArray(records) ? records : [])
        .filter((entry) => isCommunityAnnouncementCurrentlyPublished(entry))
        .sort((left, right) => Number(right.featured === true) - Number(left.featured === true)
          || String(left.publishUntil || '').localeCompare(String(right.publishUntil || ''))
          || String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')))
        .slice(0, 60)
        .map(projectPublicCommunityAnnouncement);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load community announcements.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/submissions' && request.method === 'POST') {
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcements are temporarily unavailable.', 503);
      const actor = await resolveCommunityAnnouncementSubmitter(request);
      const body = await parseJsonObjectBody(request, { maxBytes: 16 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'noticeFormat', 'titleEnglish', 'titlePunjabi', 'descriptionEnglish', 'descriptionPunjabi', 'category', 'audience',
        'contactPreference', 'contactValue', 'imageUrl', 'publishFrom', 'publishUntil', 'consent'
      ]);
      const categories = (await getCommunityAnnouncementCategoryCatalog()).map((entry) => entry.value);
      const normalized = normalizeCommunityAnnouncementSubmission(body, actor, new Date(), categories);
      const id = `community-notice-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
      const data = await eventsDb.createItem('community_announcement_submissions', {
        id,
        ...normalized,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await appendAuditLog(request, {
        action: 'community_announcement.submitted',
        targetType: 'community_announcement',
        targetId: id,
        description: `Community announcement submitted for moderation: ${normalized.titleEnglish || normalized.titlePunjabi}`
      });
      sendJson(response, 201, { ok: true, data: { id: data.id, status: 'pending', submittedAt: data.submittedAt } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to submit the community announcement.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/admin' && request.method === 'GET') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/community-announcements'), 'Community notice admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcements are temporarily unavailable.', 503);
      const data = (await eventsDb.listItems('community_announcement_submissions'))
        .sort((left, right) => String(right.submittedAt || '').localeCompare(String(left.submittedAt || '')));
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to load submitted community announcements.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/community-announcements/admin' && request.method === 'POST') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/community-announcements'), 'Community notice admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcements are temporarily unavailable.', 503);
      const actor = await resolveCommunityAnnouncementSubmitter(request);
      const body = await parseJsonObjectBody(request, { maxBytes: 16 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'noticeFormat', 'titleEnglish', 'titlePunjabi', 'descriptionEnglish', 'descriptionPunjabi', 'category', 'audience',
        'contactPreference', 'contactValue', 'imageUrl', 'publishFrom', 'publishUntil', 'publisherName', 'showContact'
      ]);
      if (body.showContact !== undefined) assertInput(typeof body.showContact === 'boolean', 'showContact must be a boolean.');
      const categories = (await getCommunityAnnouncementCategoryCatalog()).map((entry) => entry.value);
      const normalized = normalizeCommunityAnnouncementSubmission({ ...body, consent: true }, actor, new Date(), categories);
      const reviewer = getRequestActor(request);
      const now = new Date().toISOString();
      const id = `community-notice-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`;
      const data = await eventsDb.createItem('community_announcement_submissions', {
        id,
        ...normalized,
        status: 'approved',
        showContact: normalized.contactPreference !== 'none' && body.showContact !== false,
        reviewedAt: now,
        reviewedBy: String(reviewer.email || '').trim().toLowerCase(),
        createdAt: now,
        updatedAt: now
      });
      await appendAuditLog(request, { action: 'community_announcement.created', targetType: 'community_announcement', targetId: id, description: `Admin created community notice: ${normalized.titleEnglish || normalized.titlePunjabi}` });
      sendJson(response, 201, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to create the community announcement.' });
    }
    return;
  }

  const communityAnnouncementReviewMatch = requestUrl.pathname.match(/^\/api\/community-announcements\/admin\/([^/]+)$/);
  if (communityAnnouncementReviewMatch && request.method === 'PATCH') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/community-announcements'), 'Community notice admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcements are temporarily unavailable.', 503);
      const id = decodeURIComponent(communityAnnouncementReviewMatch[1]);
      const records = await eventsDb.listItems('community_announcement_submissions');
      const existing = records.find((entry) => String(entry.id) === id);
      assertInput(Boolean(existing), 'Community announcement not found.', 404);
      const body = await parseJsonObjectBody(request, { maxBytes: 16 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'status', 'publishFrom', 'publishUntil', 'audience', 'featured', 'showContact', 'noticeFormat', 'publisherName', 'titleEnglish', 'titlePunjabi',
        'descriptionEnglish', 'descriptionPunjabi', 'category', 'contactPreference', 'contactValue', 'imageUrl'
      ]);
      ['featured', 'showContact'].forEach((key) => {
        if (body[key] !== undefined) assertInput(typeof body[key] === 'boolean', `${key} must be a boolean.`);
      });
      if (body.status !== undefined) assertInput(['pending', 'approved', 'rejected'].includes(body.status), 'Choose pending, approved, or rejected status.');
      const categories = (await getCommunityAnnouncementCategoryCatalog()).map((entry) => entry.value);
      const reviewed = normalizeCommunityAnnouncementReview(body, existing, getRequestActor(request), new Date(), categories);
      const data = await eventsDb.updateItem('community_announcement_submissions', id, reviewed);
      await appendAuditLog(request, {
        action: `community_announcement.${reviewed.status}`,
        targetType: 'community_announcement',
        targetId: id,
        description: `Community announcement review status changed to ${reviewed.status}: ${existing.titleEnglish || existing.titlePunjabi}`
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to review the community announcement.' });
    }
    return;
  }

  if (communityAnnouncementReviewMatch && request.method === 'DELETE') {
    try {
      assertInput(await canManageAdminPage(request, '/admin/community-announcements'), 'Community notice admin access is required.', 403);
      assertInput(eventsDb.hasDatabaseConnection, 'Community announcements are temporarily unavailable.', 503);
      const id = decodeURIComponent(communityAnnouncementReviewMatch[1]);
      const records = await eventsDb.listItems('community_announcement_submissions');
      const existing = records.find((entry) => String(entry.id) === id);
      assertInput(Boolean(existing), 'Community announcement not found.', 404);
      await eventsDb.removeItem('community_announcement_submissions', id);
      await appendAuditLog(request, { action: 'community_announcement.deleted', targetType: 'community_announcement', targetId: id, description: `Community notice deleted: ${existing.titleEnglish || existing.titlePunjabi}` });
      sendJson(response, 200, { ok: true, data: { id, deleted: true } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to delete the community announcement.' });
    }
    return;
  }

  const contentGuardMatch = requestUrl.pathname.match(/^\/api\/content(?:-single)?\/([a-z0-9_-]+)/i);
  if (contentGuardMatch && (recitationService.isProtectedResource(contentGuardMatch[1])
    || ['stream_overlay_settings', 'community_announcement_submissions', 'site_navigation', 'gurdwara_branding', 'ask_granthi_branding'].includes(contentGuardMatch[1].toLowerCase()))) {
    sendJson(response, 404, { ok: false, message: 'Not found.' });
    return;
  }

  const ledContentMutationMatch = requestUrl.pathname.match(/^\/api\/content(?:-single)?\/(led_board_announcements|led_board_settings)(?:\/|$)/i);
  if (ledContentMutationMatch && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && !ledScreenService.authorize(request)) {
    sendJson(response, 403, { ok: false, message: 'Admin access is required to change LED content.' });
    return;
  }
  if (requestUrl.pathname === '/api/bookings/public' && request.method === 'GET') {
    try {
      const [bookings, storedCategories] = await Promise.all([
        eventsDb.listItems('bookings'),
        eventsDb.getSingleton('booking_categories', {})
      ]);
      const categories = Array.isArray(storedCategories) ? storedCategories : storedCategories?.categories || [];
      const data = (Array.isArray(bookings) ? bookings : [])
        .filter((booking) => String(booking.status || '').trim().toLowerCase() !== 'cancelled')
        .map((booking) => buildPublicBookingProjection(enforceBookingPaymentStatus(booking), categories));
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to fetch public booking calendar.' });
    }
    return;
  }


  const contentResourceMatch = requestUrl.pathname.match(/^\/api\/content\/([a-z0-9_-]+)$/i);
  if (contentResourceMatch && request.method === 'GET') {
    try {
      const resource = String(contentResourceMatch[1]).toLowerCase();
      let data = await eventsDb.listItems(resource);
      if (resource === 'bookings') {
        data = await Promise.all(data.map(async (booking) => {
          const normalized = enforceBookingPaymentStatus(booking);
          if (normalized.status === booking.status && normalized.paymentStatus === booking.paymentStatus) {
            return booking;
          }
          return eventsDb.updateItem('bookings', booking.id, normalized);
        }));
        data = await projectBookingsForRequest(request, data);
      }
      if (resource === 'users') {
        data = await Promise.all(data.map(async (user) => {
          const reconciled = enforceUserMembershipActivity(user, {});
          const approvalChanged = reconciled.approvalStatus !== user.approvalStatus;
          const activeDefaultChanged = reconciled.isActive !== user.isActive;
          if (!approvalChanged && !activeDefaultChanged) {
            return user;
          }
          return eventsDb.updateItem('users', user.id, reconciled);
        }));
      }
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to fetch content list.' });
    }
    return;
  }

  if (contentResourceMatch && request.method === 'POST') {
    try {
      const resource = String(contentResourceMatch[1]).toLowerCase();
      const body = await parseAndValidateGenericObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      if (resource === 'langar_contributions') {
        const actor = getRequestActor(request);
        const actorEmail = String(actor.email || '').trim().toLowerCase();
        const donorEmail = String(body.donorEmail || '').trim().toLowerCase();
        assertInput(Boolean(actorEmail && donorEmail && actorEmail === donorEmail), 'Please sign in before making a Langar contribution.', 401);
        body.donorEmail = actorEmail;
        body.anonymous = Boolean(body.anonymous);
        body.status = 'pending';
        const homeContentForQuantity = await eventsDb.getSingleton('cms_home_content', null);
        const matchedItem = Array.isArray(homeContentForQuantity?.langarItems)
          ? homeContentForQuantity.langarItems.find((item) => String(item?.id || '') === String(body.itemId || ''))
          : null;
        assertInput(Boolean(matchedItem), 'This Langar item is no longer available. Please refresh the list and choose an active item.', 400);
        if (matchedItem) {
          const existingContributions = await eventsDb.listItems(resource);
          const pendingQuantity = existingContributions
            .filter((entry) => String(entry?.itemId || '') === String(matchedItem.id || '') && String(entry?.status || 'pending').trim().toLowerCase() === 'pending')
            .reduce((sum, entry) => sum + Number(entry?.quantity || 0), 0);
          const remaining = Math.max(0, Number(matchedItem.quantityRequired || 0) - Number(matchedItem.quantityReceived || 0) - pendingQuantity);
          assertInput(Number(body.quantity || 0) <= remaining, `Only ${remaining} ${matchedItem.unit || 'items'} remain needed for this item.`, 400);
        }
      }
      let validatedBody = resource === 'users'
        ? enforceUserMembershipActivity(body, body)
        : resource === 'bookings'
          ? enforceBookingPaymentStatus(body)
          : body;
      if (resource === 'bookings') {
        validatedBody = await enforceEligibleBookingDutyAssignee(validatedBody);
        await assertNoScheduleOverlap(validatedBody, { kind: 'booking' });
      }
      const normalizedNewUserEmail = resource === 'users'
        ? String(validatedBody.email || '').trim().toLowerCase()
        : '';
      const userPreviouslyExisted = normalizedNewUserEmail
        ? (await eventsDb.listItems('users')).some((user) => String(user.email || '').trim().toLowerCase() === normalizedNewUserEmail)
        : false;
      const data = await eventsDb.createItem(resource, validatedBody);
      const actorName = String(getRequestActor(request).name || '').trim() || 'A sangat member';
      if (resource === 'bookings' && data?.id) {
        const actor = getRequestActor(request);
        const loggedInAdminName = String(actor.name || actor.email || '').trim();
        if (loggedInAdminName) {
          await eventsDb.updateItem('bookings', data.id, {
            createdByName: loggedInAdminName,
            bookedByName: loggedInAdminName
          });
          data.createdByName = loggedInAdminName;
          data.bookedByName = loggedInAdminName;
        }
      }
      if (resource === 'users' && !userPreviouslyExisted) {
        notifyAppUpdate({
          title: 'New Member Registration',
          body: `${data?.name || 'A new member'} registered to join the sangat.`,
          url: '/admin/users',
          tag: 'ssm-member-created'
        });
      }
      if (resource === 'seva_opportunities') {
        await triggerSocialAutomation({
          type: 'seva.created',
          payload: {
            title: data?.title || data?.sevaType || 'Seva opportunity',
            summary: data?.description || data?.summary || 'A new seva opportunity is now available.',
            featuredImageUrl: data?.imageUrl || data?.coverImageUrl || '',
            link: `${newsletterPublicBaseUrl || volunteerReminderBaseUrl || process.env.APP_URL || 'https://example.com'}/seva`,
            whatsappNumber: process.env.WHATSAPP_GROUP_NUMBER || '',
            hashtags: ['Seva', 'Sangat', 'Community']
          }
        });
        notifyAppUpdate({
          title: 'New Seva Opportunity',
          body: `${actorName} posted a new seva opportunity: ${data?.title || data?.sevaType || 'Seva opportunity'}.`,
          url: '/seva',
          tag: 'ssm-seva'
        });
      }
      if (resource === 'news_articles') {
        notifyAppUpdate({
          title: 'New Community Update',
          body: `${actorName} published a news update: ${data?.heading || data?.title || 'Community news'}.`,
          url: '/news',
          tag: 'ssm-news'
        });
      }
      if (resource === 'langar_contributions') {
        notifyAppUpdate({
          title: 'New Langar Commitment',
          body: `${data?.anonymous ? 'A sangat member' : data?.donorName || actorName} committed ${data?.quantity || 0} ${data?.unit || 'items'} of ${data?.itemName || 'a Langar item'}${data?.expectedDeliveryDate ? `, expected ${data.expectedDeliveryDate}` : ''}.`,
          url: '/',
          tag: 'ssm-langar-commitment'
        });
        const contributorEmail = String(data?.donorEmail || '').trim().toLowerCase();
        if (isValidEmailAddress(contributorEmail)) {
          const itemName = String(data?.itemName || 'Langar item').trim();
          const amount = `${Number(data?.quantity || 0)} ${String(data?.unit || 'items').trim()}`;
          const expectedDate = data?.expectedDeliveryDate
            ? new Date(`${data.expectedDeliveryDate}T12:00:00`).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'To be coordinated with the Langar team';
          const safeItemName = escapeHtml(itemName);
          const safeAmount = escapeHtml(amount);
          const safeExpectedDate = escapeHtml(expectedDate);
          const safeContributorName = escapeHtml(data?.anonymous ? 'Sangat member' : (data?.donorName || 'Sangat member'));
          try {
            await sendViaConfiguredMailTransport({
              from: localMailFromAddress,
              toList: [contributorEmail],
              subject: `Langar commitment confirmation: ${itemName}`,
              textBody: `Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh\n\n${safeContributorName}, thank you for your Langar seva. Your commitment has been recorded:\n\nItem: ${itemName}\nQuantity: ${amount}\nExpected delivery: ${expectedDate}\n\nThank you for supporting the sangat.`,
              htmlBody: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#17345f"><h2 style="color:#0b4ea2">Langar commitment confirmed</h2><p>Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh</p><p>${safeContributorName}, thank you for your Langar seva. We recorded your commitment:</p><table style="border-collapse:collapse;width:100%;margin:20px 0"><tr><td style="padding:10px;border:1px solid #dbe5f0;font-weight:bold">Item</td><td style="padding:10px;border:1px solid #dbe5f0">${safeItemName}</td></tr><tr><td style="padding:10px;border:1px solid #dbe5f0;font-weight:bold">Quantity</td><td style="padding:10px;border:1px solid #dbe5f0">${safeAmount}</td></tr><tr><td style="padding:10px;border:1px solid #dbe5f0;font-weight:bold">Expected delivery</td><td style="padding:10px;border:1px solid #dbe5f0">${safeExpectedDate}</td></tr></table><p>Thank you for supporting the sangat.</p></div>`
            });
          } catch (emailError) {
            console.warn('Langar contribution confirmation email was not sent:', emailError.message || emailError);
          }
        }
      }
      if (resource !== 'audit_logs') {
        await appendAuditLog(request, {
          action: 'content.create',
          targetType: resource,
          targetId: String(data?.id || ''),
          description: `Created ${resource} item`,
          payload: validatedBody
        });
      }
      if (resource === 'bookings') {
        if (!shouldDelayBookingEmailUntilPayment(data)) {
          await sendBookingNotificationEmail(data, { changeType: 'created' });
        }
        notifyAppUpdate({
          title: 'New Booking Received',
          body: `${data?.requesterName || data?.name || 'A sangat member'} requested ${data?.categoryName || data?.title || 'a Gurdwara booking'} for ${data?.date || data?.bookingDate || 'an upcoming date'}${data?.dutyAssigneeName ? `; assigned to ${data.dutyAssigneeName}` : ''}.`,
          url: '/bookings',
          tag: 'ssm-booking-created'
        });
      }
      if (resource === 'users' && !userPreviouslyExisted) {
        const welcomeResult = await sendNewUserWelcomeEmail(data);
        if (!welcomeResult.sent) {
          console.warn(`New-user welcome email was not sent (${welcomeResult.reason || 'unknown'}).`);
        }
      }
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to create content item.' });
    }
    return;
  }

  const contentResourceIdMatch = requestUrl.pathname.match(/^\/api\/content\/([a-z0-9_-]+)\/([^/]+)$/i);
  if (contentResourceIdMatch && request.method === 'PATCH') {
    try {
      const resource = String(contentResourceIdMatch[1]).toLowerCase();
      const id = parseStringPathId(decodeURIComponent(contentResourceIdMatch[2]), 'id');
      const body = await parseAndValidateGenericObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      const existingUsers = resource === 'users' ? await eventsDb.listItems('users') : null;
      const existingUser = Array.isArray(existingUsers) ? existingUsers.find((entry) => String(entry?.id || '') === String(id)) : null;
      const existingBookings = resource === 'bookings' ? await eventsDb.listItems('bookings') : null;
      const existingBooking = Array.isArray(existingBookings) ? existingBookings.find((entry) => String(entry?.id || '') === String(id)) : null;
      const existingNotifiableRows = ['news_articles', 'seva_opportunities', 'volunteer_registrations'].includes(resource)
        ? await eventsDb.listItems(resource)
        : null;
      const existingNotifiableItem = Array.isArray(existingNotifiableRows)
        ? existingNotifiableRows.find((entry) => String(entry?.id || '') === String(id))
        : null;
      const existingLangarContributions = resource === 'langar_contributions' ? await eventsDb.listItems(resource) : null;
      const existingLangarContribution = Array.isArray(existingLangarContributions)
        ? existingLangarContributions.find((entry) => String(entry?.id || '') === String(id))
        : null;
      const previousLangarStatus = String(existingLangarContribution?.status || 'pending').trim().toLowerCase();
      if (resource === 'bookings' && existingBooking) {
        const previousPaymentStatus = String(existingBooking.paymentStatus || 'pending').trim().toLowerCase();
        const nextPaymentStatus = String(body.paymentStatus || previousPaymentStatus).trim().toLowerCase();
        if (['paid', 'partial'].includes(nextPaymentStatus) && previousPaymentStatus !== nextPaymentStatus && !existingBooking.paymentReceivedAt) {
          body.paymentReceivedAt = new Date().toISOString();
        }
      }
      const changedRoleToMember = resource === 'users'
        && String(existingUser?.role || '').trim().toLowerCase() !== 'member'
        && String(body?.role || '').trim().toLowerCase() === 'member';
      let validatedBody = resource === 'users'
        ? enforceUserMembershipActivity({
          ...(existingUser || {}),
          ...body,
          ...(changedRoleToMember ? { membershipFeeRecords: [] } : {}),
          id
        }, body)
        : resource === 'bookings'
          ? enforceBookingPaymentStatus({ ...(existingBooking || {}), ...body, id })
          : body;
      if (resource === 'bookings') {
        validatedBody = await enforceEligibleBookingDutyAssignee(validatedBody);
        await assertNoScheduleOverlap(validatedBody, { kind: 'booking', excludeId: id });
      }
      if (resource === 'langar_contributions') {
        const existingContribution = existingLangarContribution;
        const previousStatus = String(existingContribution?.status || 'pending').trim().toLowerCase();
        const nextStatus = String(validatedBody?.status || previousStatus).trim().toLowerCase();
        if (existingContribution && previousStatus !== nextStatus && ['received', 'pending', 'cancelled'].includes(nextStatus)) {
          const statusChangedAt = new Date().toISOString();
          validatedBody.updatedAt = statusChangedAt;
          if (nextStatus === 'received') validatedBody.receivedAt = statusChangedAt;
          else if (previousStatus === 'received') validatedBody.receivedAt = '';
          const homeContent = await eventsDb.getSingleton('cms_home_content', null);
          if (homeContent && Array.isArray(homeContent.langarItems)) {
            const quantity = Number(existingContribution.quantity || 0);
            const direction = nextStatus === 'received' ? 1 : previousStatus === 'received' ? -1 : 0;
            if (direction !== 0) {
              const nextLangarItems = homeContent.langarItems.map((item) => (
                String(item?.id || '') === String(existingContribution.itemId || '')
                  ? { ...item, quantityReceived: Math.max(0, Number(item.quantityReceived || 0) + (direction * quantity)) }
                  : item
              ));
              await eventsDb.setSingleton('cms_home_content', { ...homeContent, langarItems: nextLangarItems });
            }
          }
        }
      }
      const data = await eventsDb.updateItem(resource, id, validatedBody);

      if (resource === 'langar_contributions' && existingLangarContribution) {
        const nextStatus = String(data?.status || validatedBody?.status || previousLangarStatus).trim().toLowerCase();
        if (previousLangarStatus !== nextStatus && nextStatus === 'received') {
          const receivedByActorName = String(getRequestActor(request).name || '').trim() || 'A Gurdwara team member';
          notifyAppUpdate({
            title: 'Langar Item Received',
            body: `${receivedByActorName} received ${existingLangarContribution.quantity || 0} ${existingLangarContribution.unit || 'items'} of ${existingLangarContribution.itemName || 'a Langar item'}${existingLangarContribution.anonymous ? ' from a sangat member' : ` from ${existingLangarContribution.donorName || 'a sangat member'}`} today. The Langar progress has been updated.`,
            url: '/',
            tag: 'ssm-langar-received'
          });
        } else if (previousLangarStatus !== nextStatus && nextStatus === 'cancelled') {
          notifyAppUpdate({
            title: 'Langar Commitment Cancelled',
            body: `A commitment for ${existingLangarContribution.itemName || 'a Langar item'} was cancelled.`,
            url: '/',
            tag: 'ssm-langar-cancelled'
          });
        }
      }

      if (resource === 'users' && eventsDb.hasDatabaseConnection) {
        const mergedUser = {
          ...(existingUser || {}),
          ...(data || {}),
          ...(validatedBody || {}),
          id: String(id)
        };
        const becameInactive = (existingUser?.isActive !== false) && (mergedUser?.isActive === false);
        if (becameInactive) {
          await eventsDb.markUserRegistrationsDormant({
            userId: mergedUser.id,
            email: mergedUser.email,
            contact: mergedUser.phone
          });
        }
      }
      if (resource === 'users' && existingUser) {
        const mergedUser = { ...existingUser, ...(data || {}), ...(validatedBody || {}), id: String(id) };
        if (existingUser.approvalStatus !== mergedUser.approvalStatus) {
          notifyAppUpdate({
            title: mergedUser.approvalStatus === 'approved' ? 'Member Approved' : `Member ${mergedUser.approvalStatus || 'Status Updated'}`,
            body: `${mergedUser.name || 'A member'}'s membership application is now ${mergedUser.approvalStatus || 'updated'}.`,
            url: '/admin/users',
            tag: 'ssm-member-approval'
          });
        } else if (existingUser.isActive !== mergedUser.isActive) {
          notifyAppUpdate({
            title: mergedUser.isActive === false ? 'Member Deactivated' : 'Member Reactivated',
            body: `${mergedUser.name || 'A member'}'s account was ${mergedUser.isActive === false ? 'deactivated' : 'reactivated'}.`,
            url: '/admin/users',
            tag: 'ssm-member-activity'
          });
        }
      }

      if (resource !== 'audit_logs') {
        await appendAuditLog(request, {
          action: 'content.update',
          targetType: resource,
          targetId: String(id || ''),
          description: `Updated ${resource} item`,
          payload: validatedBody
        });
      }
      if (resource === 'bookings') {
        const mergedBooking = { ...(existingBooking || {}), ...(data || {}), ...(validatedBody || {}), id: String(id) };
        const bookingChanged = hasBookingNotificationChange(existingBooking || {}, mergedBooking);
        const dutyAssigneeChanged = String(existingBooking?.dutyAssigneeId || '') !== String(mergedBooking.dutyAssigneeId || '')
          || String(existingBooking?.dutyAssigneeEmail || '').toLowerCase() !== String(mergedBooking.dutyAssigneeEmail || '').toLowerCase()
          || JSON.stringify(existingBooking?.dutyAssignees || []) !== JSON.stringify(mergedBooking.dutyAssignees || []);
        if (bookingChanged) {
          const refundReleased = String(existingBooking?.refundStatus || '').trim().toLowerCase() !== 'processed'
            && String(mergedBooking.refundStatus || '').trim().toLowerCase() === 'processed';
          await sendBookingNotificationEmail(mergedBooking, { changeType: refundReleased ? 'refund-released' : 'updated' });
        }
        if (bookingChanged || dutyAssigneeChanged) {
          const refundReleased = String(existingBooking?.refundStatus || '').trim().toLowerCase() !== 'processed'
            && String(mergedBooking.refundStatus || '').trim().toLowerCase() === 'processed';
          notifyAppUpdate({
            title: dutyAssigneeChanged ? 'Booking Duty Assignment Changed' : refundReleased ? 'Booking Refund Released' : 'Booking Updated',
            body: dutyAssigneeChanged
              ? `${mergedBooking.categoryName || 'A booking'} on ${mergedBooking.date || 'an upcoming date'} is assigned to ${(Array.isArray(mergedBooking.dutyAssignees) && mergedBooking.dutyAssignees.length ? mergedBooking.dutyAssignees.map((entry) => `${entry.name || entry.email || 'performer'}${entry.dutyType ? ` (${entry.dutyType})` : ''}`).join(', ') : mergedBooking.dutyAssigneeName) || 'a different duty performer'}${bookingChanged ? `; booking status is ${mergedBooking.status || 'pending'}${mergedBooking.paymentStatus ? ` and payment is ${mergedBooking.paymentStatus}` : ''}` : ''}.`
              : `${mergedBooking.categoryName || 'A booking'} for ${mergedBooking.requesterName || 'a sangat member'} on ${mergedBooking.date || 'an upcoming date'} was updated (${mergedBooking.status || 'status pending'}${mergedBooking.paymentStatus ? `, payment ${mergedBooking.paymentStatus}` : ''}).`,
            url: '/admin/booking-duties',
            tag: dutyAssigneeChanged ? 'ssm-booking-duty-assignment' : 'ssm-booking-updated'
          });
        }
      } else if (['news_articles', 'seva_opportunities'].includes(resource)) {
        const isNews = resource === 'news_articles';
        const entityTitle = data?.heading || data?.title || data?.sevaType || (isNews ? 'Community news' : 'Seva opportunity');
        const changedFields = Object.keys(validatedBody || {}).filter((field) => (
          field !== 'updatedAt' && JSON.stringify((existingNotifiableItem || {})[field]) !== JSON.stringify(data?.[field])
        ));
        notifyAppUpdate({
          title: isNews ? 'Community Update Edited' : 'Seva Opportunity Updated',
          body: isNews
            ? `${entityTitle} was edited${changedFields.length ? ` (${changedFields.slice(0, 3).join(', ')} changed)` : ''}. You are receiving this because you subscribed to community updates.`
            : `${entityTitle} was updated${changedFields.length ? ` (${changedFields.slice(0, 3).join(', ')} changed)` : ''}. Check the new seva details.`,
          url: isNews ? '/news' : '/seva',
          tag: isNews ? 'ssm-news-updated' : 'ssm-seva-updated'
        });
      } else if (resource === 'volunteer_registrations') {
        notifyAppUpdate({
          title: 'Volunteer Registration Updated',
          body: `${data?.name || 'A volunteer'}'s registration for ${data?.sevaType || data?.area || 'a seva opportunity'} is now ${data?.status || 'updated'}.`,
          url: '/seva',
          tag: 'ssm-volunteer-registration-updated'
        });
      } else if (resource === 'langar_contributions' && existingLangarContribution) {
        const nextStatus = String(data?.status || validatedBody?.status || previousLangarStatus).trim().toLowerCase();
        if (previousLangarStatus === nextStatus || !['received', 'cancelled'].includes(nextStatus)) {
          notifyAppUpdate({
            title: 'Langar Commitment Updated',
            body: `${existingLangarContribution.anonymous ? 'A sangat member' : existingLangarContribution.donorName || 'A sangat member'} changed the commitment for ${data?.itemName || existingLangarContribution.itemName || 'a Langar item'} (${data?.quantity || existingLangarContribution.quantity || 0} ${data?.unit || existingLangarContribution.unit || 'items'}).`,
            url: '/',
            tag: 'ssm-langar-updated'
          });
        }
      }
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to update content item.' });
    }
    return;
  }

  if (contentResourceIdMatch && request.method === 'DELETE') {
    try {
      const resource = String(contentResourceIdMatch[1]).toLowerCase();
      const id = parseStringPathId(decodeURIComponent(contentResourceIdMatch[2]), 'id');
      const existingResourceItems = ['bookings', 'news_articles', 'seva_opportunities', 'langar_contributions', 'volunteer_registrations'].includes(resource)
        ? await eventsDb.listItems(resource)
        : null;
      const deletedResourceItem = Array.isArray(existingResourceItems)
        ? existingResourceItems.find((entry) => String(entry?.id || '') === String(id))
        : null;
      if (resource === 'bookings') {
        assertInput(canManageBookingDuties(request), 'Only Admin and Super Admin can delete bookings.', 403);
      }

      if (resource === 'langar_contributions') {
        const existingContribution = deletedResourceItem;
        if (existingContribution && String(existingContribution.status || '').trim().toLowerCase() === 'received') {
          const homeContent = await eventsDb.getSingleton('cms_home_content', null);
          if (homeContent && Array.isArray(homeContent.langarItems)) {
            const quantity = Number(existingContribution.quantity || 0);
            const nextLangarItems = homeContent.langarItems.map((item) => (
              String(item?.id || '') === String(existingContribution.itemId || '')
                ? { ...item, quantityReceived: Math.max(0, Number(item.quantityReceived || 0) - quantity) }
                : item
            ));
            await eventsDb.setSingleton('cms_home_content', { ...homeContent, langarItems: nextLangarItems });
          }
        }
      }

      if (resource === 'users' && eventsDb.hasDatabaseConnection) {
        const users = await eventsDb.listItems('users');
        const targetUser = Array.isArray(users) ? users.find((entry) => String(entry?.id || '') === String(id)) : null;
        if (targetUser) {
          await eventsDb.purgeUserRegistrations({
            userId: targetUser.id,
            email: targetUser.email,
            contact: targetUser.phone,
            name: targetUser.name
          });
        }
      }

      let data;
      if (resource === 'volunteer_registrations') {
        data = await eventsDb.removeVolunteerRegistration(id);
        const promotedRegistration = data?.promotedRegistration || null;
        const promotionEmailResult = promotedRegistration
          ? await sendRegistrationStatusEmail({ registration: promotedRegistration, kind: 'seva', promoted: true })
          : { sent: false, reason: 'no_promotion' };
        data = { ...data, promotionEmailSent: promotionEmailResult.sent === true };
      } else {
        data = await eventsDb.removeItem(resource, id);
      }
      if (resource !== 'audit_logs') {
        await appendAuditLog(request, {
          action: 'content.delete',
          targetType: resource,
          targetId: String(id || ''),
          description: `Deleted ${resource} item`,
          payload: resource === 'volunteer_registrations'
            ? { promotedRegistrationId: data?.promotedRegistration?.id || '' }
            : undefined
        });
      }
        if (resource === 'users' && deletedResourceItem) {
          notifyAppUpdate({
            title: 'Member Account Removed',
            body: `${deletedResourceItem.name || 'A member'}'s account and related registrations were removed.`,
            url: '/admin/users',
            tag: 'ssm-member-deleted'
          });
        }
      if (deletedResourceItem && ['bookings', 'news_articles', 'seva_opportunities', 'langar_contributions', 'volunteer_registrations'].includes(resource)) {
        const notificationDetails = {
          bookings: { title: 'Booking Cancelled', body: 'A Gurdwara booking was cancelled.', url: '/bookings', tag: 'ssm-booking-deleted' },
          news_articles: { title: 'Community Update Removed', body: `A community update was removed: ${deletedResourceItem.heading || deletedResourceItem.title || 'Community news'}.`, url: '/news', tag: 'ssm-news-deleted' },
          seva_opportunities: { title: 'Seva Opportunity Removed', body: `A seva opportunity was removed: ${deletedResourceItem.title || deletedResourceItem.sevaType || 'Seva opportunity'}.`, url: '/seva', tag: 'ssm-seva-deleted' },
          langar_contributions: { title: 'Langar Commitment Removed', body: `A commitment for ${deletedResourceItem.itemName || 'a Langar item'} was removed.`, url: '/', tag: 'ssm-langar-deleted' },
          volunteer_registrations: { title: 'Seva Registration Removed', body: `Registration for ${deletedResourceItem.name || 'a volunteer'} in ${deletedResourceItem.sevaType || 'a seva opportunity'} was removed.`, url: '/seva', tag: 'ssm-volunteer-registration-removed' }
        }[resource];
        notifyAppUpdate(notificationDetails);
      }
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to delete content item.',
        details: error.details || null
      });
    }
    return;
  }

  const contentSingleMatch = requestUrl.pathname.match(/^\/api\/content-single\/([a-z0-9_-]+)$/i);
  if (contentSingleMatch && request.method === 'GET') {
    try {
      const resource = String(contentSingleMatch[1]).toLowerCase();
      let data = await eventsDb.getSingleton(resource, null);
      if (resource === 'widget_placements') data = projectPublicWidgetPlacements(data);
      if (resource === 'cms_home_content' && data && !await canManageAdminPage(request, '/admin/langar')) {
        data = {
          ...data,
          langarItems: (Array.isArray(data.langarItems) ? data.langarItems : []).map((item) => {
            const { walkInReceipts, ...publicItem } = item || {};
            return publicItem;
          })
        };
      }
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to fetch singleton content.' });
    }
    return;
  }

  if (contentSingleMatch && request.method === 'PUT') {
    try {
      const resource = String(contentSingleMatch[1]).toLowerCase();
      assertInput(resource !== 'widget_placements' && resource !== 'welcome_journey_settings', 'Use the dedicated validated endpoint to update this resource.', 403);
      if (resource === 'booking_duty_settings') {
        assertInput(canManageBookingDuties(request), 'Only Admin and Super Admin can assign booking duties.', 403);
      }
      if (resource === 'hukamnama_led_template_settings') {
        assertInput(await canManageAdminPage(request, '/admin/hukamnama'), 'Hukamnama admin access is required to change LED display settings.', 403);
      }
      const body = await parseAndValidateGenericStructuredBody(request, { maxBytes: maxJsonBodyBytes });
      const actorName = String(getRequestActor(request).name || '').trim() || 'A Gurdwara team member';
      const previousSingleton = ['cms_home_content', 'hukamnama_ssm_hukamnama_entries'].includes(resource)
        ? await eventsDb.getSingleton(resource, null)
        : null;
      const data = await eventsDb.setSingleton(resource, body);
      if (resource === 'hukamnama_ssm_hukamnama_entries') {
        const savedToday = toDateKeyFromParts(getDatePartsInTimeZone(new Date(), String(process.env.SOCIAL_CARDS_TIME_ZONE || volunteerReminderTimeZone || 'America/Toronto').trim()));
        if (body?.[savedToday] && JSON.stringify(body[savedToday]) !== JSON.stringify(previousSingleton?.[savedToday])) {
          socialPostingService.onHukamnamaSaved(savedToday).catch((error) => logServerError(error, 'Hukamnama social post failed'));
        }
      }
      if (resource === 'hukamnama_ssm_hukamnama_entries') {
        const previousEntries = previousSingleton || {};
        const allDateKeys = new Set([...Object.keys(previousEntries), ...Object.keys(body || {})]);
        const changes = [...allDateKeys].flatMap((dateKey) => {
          const previousDay = previousEntries[dateKey] || {};
          const nextDay = body?.[dateKey] || {};
          return ['morning', 'evening'].flatMap((slot) => {
            const previousEntry = previousDay?.[slot];
            const nextEntry = nextDay?.[slot];
            if (!previousEntry && nextEntry) return [{ kind: 'posted', dateKey }];
            if (previousEntry && !nextEntry) return [{ kind: 'removed', dateKey }];
            if (previousEntry && nextEntry && JSON.stringify(previousEntry) !== JSON.stringify(nextEntry)) return [{ kind: 'updated', dateKey }];
            return [];
          });
        });
        if (changes.length) {
          const changeDetails = changes.slice(0, 3).map((change) => {
            const entry = body?.[change.dateKey]?.[change.slot] || previousEntries?.[change.dateKey]?.[change.slot];
            const heading = entry?.title || entry?.metadata?.source || `Ang ${entry?.ang || ''}`.trim();
            return `${change.dateKey} ${change.slot}: ${change.kind}${heading ? ` ${heading}` : ''}`;
          });
          const remainingChanges = changes.length - changeDetails.length;
          const summary = `${changeDetails.join('; ')}${remainingChanges ? `; and ${remainingChanges} more schedule change${remainingChanges === 1 ? '' : 's'}` : ''}`;
          notifyAppUpdate({
            title: 'Hukamnama Schedule Updated',
            body: `${actorName} changed the Hukamnama schedule: ${summary}. You are receiving this because you enabled Hukamnama updates.`,
            url: '/hukamnama',
            tag: 'ssm-hukamnama'
          });
          if (changes.some((change) => change.kind !== 'removed')) {
            const changedEntry = changes.find((change) => change.kind !== 'removed');
            const entry = changedEntry && body?.[changedEntry.dateKey]?.morning || changedEntry && body?.[changedEntry.dateKey]?.evening;
            if (entry) {
              await triggerSocialAutomation({
                type: 'hukamnama.updated',
                payload: {
                  title: entry.title || 'Daily Hukamnama',
                  summary: entry.summary || entry.metadata?.source || `Hukamnama for ${changedEntry.dateKey}.`,
                  imageUrl: entry.imageUrl || entry.coverImageUrl || '',
                  link: `${newsletterPublicBaseUrl || volunteerReminderBaseUrl || process.env.APP_URL || 'https://example.com'}/hukamnama`,
                  whatsappNumber: process.env.WHATSAPP_GROUP_NUMBER || '',
                  hashtags: ['Hukamnama', 'Gurbani', 'SikhCommunity']
                }
              });
            }
          }
        }
      }
      if (resource === 'cms_home_content') {
        const previousItems = previousSingleton?.langarItems || [];
        const nextItems = body?.langarItems || [];
        const previousById = new Map(previousItems.map((item) => [String(item?.id || ''), item]));
        const nextById = new Map(nextItems.map((item) => [String(item?.id || ''), item]));
        const newlyAddedItems = nextItems.filter((item) => item?.id && !previousById.has(String(item.id)));
        const materialItemFields = ['name', 'category', 'needed', 'quantityRequired', 'unit', 'imageUrl', 'expiryDate', 'description'];
        const updatedItems = nextItems.filter((item) => {
          const previous = previousById.get(String(item?.id || ''));
          return item?.id && previous && materialItemFields.some((field) => item[field] !== previous[field]);
        });
        const removedItems = previousItems.filter((item) => item?.id && !nextById.has(String(item.id)));
        newlyAddedItems.forEach((item) => {
          notifyAppUpdate({
            title: 'New Langar Item Requested',
            body: `${actorName} added ${item.name || 'a new item'} to Langar needs: ${item.quantityRequired || 0} ${item.unit || 'items'} required${item.category ? ` in ${item.category}` : ''}.`,
            url: '/',
            tag: 'ssm-langar-item'
          });
        });
        updatedItems.forEach((item) => notifyAppUpdate({
          title: 'Langar Need Updated',
          body: `${actorName} changed ${item.name || 'a Langar item'}: ${item.quantityRequired || 0} ${item.unit || 'items'} required${item.needed === false ? ', no longer needed' : ''}.`,
          url: '/',
          tag: 'ssm-langar-item-updated'
        }));
        removedItems.forEach((item) => notifyAppUpdate({
          title: 'Langar Need Removed',
          body: `${actorName} removed ${item.name || 'a Langar item'} from the Langar needs list.`,
          url: '/',
          tag: 'ssm-langar-item-removed'
        }));
      }
      await appendAuditLog(request, {
        action: 'content.singleton.update',
        targetType: resource,
        targetId: resource,
        description: `Updated singleton ${resource}`,
        payload: body
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to update singleton content.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/search/fulltext' && request.method === 'GET') {
    try {
      if (!eventsDb.hasDatabaseConnection) {
        sendJson(response, 503, {
          ok: false,
          message: 'Search backend is unavailable because database is not configured.'
        });
        return;
      }

      const rawQuery = String(requestUrl.searchParams.get('q') || '').trim();
      const rawLimit = Number(requestUrl.searchParams.get('limit') || 12);
      const limit = Number.isFinite(rawLimit) ? Math.min(25, Math.max(1, Math.floor(rawLimit))) : 12;
      const rawScope = String(requestUrl.searchParams.get('scope') || 'public').trim().toLowerCase();
      const scope = rawScope === 'admin' ? 'admin' : 'public';

      if (rawQuery.length < 2) {
        sendJson(response, 200, { ok: true, data: [], metadata: { variants: [], minChars: 2 } });
        return;
      }

      const variants = buildPhase2SearchVariants(rawQuery);
      const resultsByKey = new Map();

      const batches = await Promise.all(
        variants.map((variant) => eventsDb.searchPublicContent(variant, { limit: Math.max(20, limit * 2), scope }))
      );

      batches.forEach((rows, variantIndex) => {
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const key = `${row.type}:${row.id}`;
          const existing = resultsByKey.get(key);
          if (!existing || Number(row.score || 0) > Number(existing.score || 0)) {
            resultsByKey.set(key, {
              ...row,
              matchedVariant: variants[variantIndex] || rawQuery
            });
          }
        });
      });

      const data = Array.from(resultsByKey.values())
        .sort((left, right) => {
          const scoreDelta = Number(right.score || 0) - Number(left.score || 0);
          if (scoreDelta !== 0) {
            return scoreDelta;
          }
          return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
        })
        .slice(0, limit);

      sendJson(response, 200, {
        ok: true,
        data,
        metadata: {
          variants,
          source: 'postgres_full_text',
          scope,
          count: data.length
        }
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to run full-text search.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/phase2/channels-config' && request.method === 'GET') {
    try {
      const defaults = {
        whatsAppOptInEnabled: false,
        whatsAppJoinLink: '',
        kioskModeEnabled: false,
        kioskHomeRoute: '/',
        kioskInactivityTimeoutSeconds: 90
      };
      const data = await eventsDb.getSingleton('phase2_channels_config', defaults);
      sendJson(response, 200, { ok: true, data: data || defaults });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to fetch Phase 2 channel config.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/phase2/channels-config' && request.method === 'PUT') {
    try {
      const body = await parseAndValidateGenericObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'whatsAppOptInEnabled',
        'whatsAppJoinLink',
        'kioskModeEnabled',
        'kioskHomeRoute',
        'kioskInactivityTimeoutSeconds'
      ]);

      const whatsAppOptInEnabled = readBooleanField(body, 'whatsAppOptInEnabled');
      const whatsAppJoinLink = readStringField(body, 'whatsAppJoinLink', { max: 300 });
      const kioskModeEnabled = readBooleanField(body, 'kioskModeEnabled');
      const kioskHomeRoute = readStringField(body, 'kioskHomeRoute', { max: 120 }) || '/';
      const kioskInactivityTimeoutSeconds = Number(body.kioskInactivityTimeoutSeconds);
      assertInput(
        Number.isFinite(kioskInactivityTimeoutSeconds) && kioskInactivityTimeoutSeconds >= 15 && kioskInactivityTimeoutSeconds <= 1800,
        'kioskInactivityTimeoutSeconds must be between 15 and 1800 seconds.'
      );

      const payload = {
        whatsAppOptInEnabled: whatsAppOptInEnabled === true,
        whatsAppJoinLink,
        kioskModeEnabled: kioskModeEnabled === true,
        kioskHomeRoute,
        kioskInactivityTimeoutSeconds: Math.floor(kioskInactivityTimeoutSeconds)
      };

      const data = await eventsDb.setSingleton('phase2_channels_config', payload);
      await appendAuditLog(request, {
        action: 'phase2.channels-config.update',
        targetType: 'phase2_channels_config',
        targetId: 'phase2_channels_config',
        description: 'Updated Phase 2 WhatsApp and kiosk configuration',
        payload
      });

      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to update Phase 2 channel config.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/media/image-search' && request.method === 'GET') {
    try {
      const query = String(requestUrl.searchParams.get('q') || '').trim();
      assertInput(query.length > 0 && query.length <= 200, 'A search query is required.');

      let imageUrls = [];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const searchUrl = new URL('https://www.google.com/search');
        searchUrl.searchParams.set('q', query);
        searchUrl.searchParams.set('tbm', 'isch');
        searchUrl.searchParams.set('safe', 'active');

        const searchResponse = await fetch(searchUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        if (searchResponse.ok) {
          const html = await searchResponse.text();
          imageUrls = extractGoogleImageResults(html);
        }
      } catch {
        imageUrls = [];
      } finally {
        clearTimeout(timeoutId);
      }

      if (!imageUrls.length) {
        try {
          imageUrls = await fetchDuckDuckGoImages(query);
        } catch {
          imageUrls = [];
        }
      }
      if (!imageUrls.length) {
        try {
          const commonsUrl = new URL('https://commons.wikimedia.org/w/api.php');
          commonsUrl.searchParams.set('action', 'query');
          commonsUrl.searchParams.set('generator', 'search');
          commonsUrl.searchParams.set('gsrsearch', query);
          commonsUrl.searchParams.set('gsrnamespace', '6');
          commonsUrl.searchParams.set('gsrlimit', '10');
          commonsUrl.searchParams.set('prop', 'imageinfo');
          commonsUrl.searchParams.set('iiprop', 'url');
          commonsUrl.searchParams.set('iiurlwidth', '500');
          commonsUrl.searchParams.set('format', 'json');
          const commonsResponse = await fetch(commonsUrl, {
            headers: { 'User-Agent': 'GurdwaraCommunityPlatform/1.0 langar-image-search' }
          });
          const commonsData = commonsResponse.ok ? await commonsResponse.json() : null;
          imageUrls = Object.values(commonsData?.query?.pages || {})
            .map((page) => page?.imageinfo?.[0]?.thumburl || page?.imageinfo?.[0]?.url || '')
            .filter(Boolean)
            .slice(0, 10);
        } catch {
          imageUrls = [];
        }
      }
      if (!imageUrls.length) {
        imageUrls = [`https://loremflickr.com/300/300/${encodeURIComponent(query)},grocery`];
      }

      sendJson(response, 200, { ok: true, data: { imageUrl: imageUrls[0], imageUrls } });
    } catch (error) {
      sendJson(response, error.status || 200, { ok: true, data: { imageUrl: '', imageUrls: [] } });
    }
    return;
  }

  if (requestUrl.pathname === '/api/push/public-key' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, data: { publicKey: pushNotifications.getPublicKey() } });
    return;
  }

  if (requestUrl.pathname === '/api/push/subscribe' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      assertInput(Boolean(body.endpoint), 'A push subscription endpoint is required.', 400);
      const data = await pushNotifications.saveSubscription(eventsDb, body);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to save push subscription.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/push/unsubscribe' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: true });
      const data = await pushNotifications.removeSubscription(eventsDb, body?.endpoint);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to remove push subscription.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/social/langar-item-update' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['action', 'itemName', 'category', 'status', 'link', 'whatsappNumber']);
      const action = String(body.action || 'updated').trim().toLowerCase();
      const itemName = readStringField(body, 'itemName', { required: true, max: 200 });
      const category = readStringField(body, 'category', { max: 120 }) || 'Grocery';
      const status = readStringField(body, 'status', { max: 80 }) || 'Updated';
      const link = readStringField(body, 'link', { max: 500 }) || `${newsletterPublicBaseUrl || volunteerReminderBaseUrl || process.env.APP_URL || 'https://example.com'}/seva`;
      const whatsappNumber = normalizeSocialNumber(body.whatsappNumber || process.env.WHATSAPP_GROUP_NUMBER || '');

      if (!socialWhatsAppService || !whatsappNumber) {
        sendJson(response, 200, { ok: true, data: { skipped: true, reason: 'WhatsApp not configured' } });
        return;
      }

      const message = {
        created: `${itemName} (${category}) has been added to the langar needs list. Status: ${status}. View: ${link}`,
        updated: `${itemName} (${category}) was updated in the langar needs list. Status: ${status}. View: ${link}`,
        removed: `${itemName} (${category}) was removed from the langar needs list. Status: ${status}. View: ${link}`
      }[action] || `${itemName} (${category}) was updated. Status: ${status}. View: ${link}`;

      const result = await socialWhatsAppService.sendTextMessage({
        to: whatsappNumber,
        message
      });

      sendJson(response, 200, { ok: true, data: { success: true, result } });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to send notification.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/auth/logout' && request.method === 'POST') {
    try {
      await appendAuditLog(request, {
        action: 'auth.logout',
        targetType: 'session',
        targetId: getRequestActor(request).email || 'current-user',
        description: 'User logged out'
      });
      sendJson(response, 200, { ok: true, data: { success: true } });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to log out.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/events/calendar.ics' && request.method === 'GET') {
    try {
      const events = await eventsDb.getEvents();
      const includeInactive = requestUrl.searchParams.get('includeInactive') === 'true';
      const visibleEvents = includeInactive
        ? (Array.isArray(events) ? events : [])
        : (Array.isArray(events) ? events : []).filter((event) => event?.active !== false && event?.isActive !== false);
      const feed = buildEventsCalendarIcsBody(
        visibleEvents,
        volunteerReminderBaseUrl
      );
      response.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="ssm-events.ics"',
        'Access-Control-Allow-Origin': '*'
      });
      response.end(feed);
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to generate calendar feed.'
      });
    }
    return;
  }

  const singleEventCalendarMatch = requestUrl.pathname.match(/^\/api\/events\/([^/]+)\/calendar\.ics$/);
  if (singleEventCalendarMatch && request.method === 'GET') {
    try {
      const id = decodeURIComponent(singleEventCalendarMatch[1]);
      const events = await eventsDb.getEvents();
      const event = (Array.isArray(events) ? events : []).find((entry) => String(entry.id) === String(id));
      if (!event) {
        sendJson(response, 404, { ok: false, message: 'Event not found.' });
        return;
      }

      const feed = buildEventIcsBody(event, volunteerReminderBaseUrl);
      response.writeHead(200, {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="event-${String(event.id)}.ics"`,
        'Access-Control-Allow-Origin': '*'
      });
      response.end(feed);
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to generate event calendar file.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/events' && request.method === 'GET') {
    try {
      const includeInactive = requestUrl.searchParams.get('includeInactive') === 'true';
      const rows = await eventsDb.getEvents();
      const data = includeInactive
        ? rows
        : (Array.isArray(rows) ? rows : []).filter((event) => event?.active !== false && event?.isActive !== false);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to read events from database.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/events' && request.method === 'POST') {
    try {
      const body = await parseAndValidateGenericObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      const title = readStringField(body, 'title', { required: true, min: 2, max: 180 });
      const date = readStringField(body, 'date', { required: true, max: 64 });
      assertInput(!Number.isNaN(new Date(date).getTime()), 'date must be a valid date string.');
      body.title = title;
      body.date = date;
      await assertNoScheduleOverlap(body, { kind: 'event' });
      const data = await eventsDb.createEvent(body);
      if (data?.active !== false && data?.isActive !== false) {
        socialPostingService.onEventCreated(data).catch((error) => logServerError(error, 'Event poster auto-post failed'));
      }
      if (!(await socialPostingService.shouldReplaceLegacyEventPost())) {
        await triggerSocialAutomation({
          type: 'event.created',
          payload: {
            title: data?.title || body?.title,
            summary: data?.description || body?.description || 'New community event has been added.',
            date: data?.date || body?.date,
            location: data?.location || body?.location || '',
            coverImageUrl: data?.coverImageUrl || body?.coverImageUrl || body?.imageUrl || '',
            link: `${newsletterPublicBaseUrl || volunteerReminderBaseUrl || process.env.APP_URL || 'https://example.com'}/events`,
            whatsappNumber: process.env.WHATSAPP_GROUP_NUMBER || '',
            hashtags: ['Gurdwara', 'Community', 'Event']
          }
        });
      }
      notifyAppUpdate({
        title: 'New Event Added',
        body: `${String(getRequestActor(request).name || '').trim() || 'A Gurdwara team member'} added ${data?.title || body?.title}, scheduled for ${data?.date || body?.date}${data?.location || body?.location ? ` at ${data?.location || body?.location}` : ''}.`,
        url: '/events',
        tag: 'ssm-event'
      });
      await appendAuditLog(request, {
        action: 'event.create',
        targetType: 'event',
        targetId: String(data?.id || ''),
        description: `Created event ${String(data?.title || '').trim()}`,
        payload: body
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to create event in database.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/events/register' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['eventId', 'name', 'email', 'contact', 'status', 'notes', 'wantsEventEmails', 'contactPreference']);
      const eventId = readStringField(body, 'eventId', { required: true, max: 12, pattern: /^\d{1,12}$/ });
      const name = readStringField(body, 'name', { required: true, min: 2, max: 120 });
      const email = readEmailField(body, 'email', { required: false });
      const contact = readPhoneField(body, 'contact');
      assertInput(Boolean(email || contact), 'Either email or contact is required.');
      readStringField(body, 'status', { max: 40 });
      readStringField(body, 'notes', { max: 1000 });
      const wantsEventEmails = readBooleanField(body, 'wantsEventEmails');
      readStringField(body, 'contactPreference', { max: 20 });
      body.eventId = eventId;
      body.name = name;
      if (email) {
        body.email = email;
      }
      if (wantsEventEmails != null) {
        body.wantsEventEmails = wantsEventEmails;
      }
      const data = await eventsDb.registerForEvent(body);
      notifyAppUpdate({
        title: data?.registration?.status === 'waitlisted' ? 'New Event Waitlist Registration' : 'New Event Registration',
        body: `${body.name} ${data?.registration?.status === 'waitlisted' ? 'joined the waitlist for' : 'registered for'} ${data?.title || 'a community event'}${data?.date ? ` on ${data.date}` : ''}.`,
        url: '/events',
        tag: 'ssm-event-registration'
      });
      const registration = data?.registration ? normalizeEventRegistrantForReminder(data.registration, data) : null;
      const emailResult = registration
        ? await sendRegistrationStatusEmail({ registration, kind: 'event' })
        : { sent: false, reason: 'missing_registration' };
      await appendAuditLog(request, {
        action: 'event.register',
        targetType: 'event',
        targetId: String(body?.eventId || ''),
        description: `Registered ${String(body?.email || body?.contact || body?.name || 'participant')} for event`,
        payload: {
          eventId: body?.eventId,
          name: body?.name,
          email: body?.email,
          contact: body?.contact
        }
      });
      sendJson(response, 200, { ok: true, data: { ...data, emailSent: emailResult.sent === true } });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to register for event.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/events/registrant/remove' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['eventId', 'registrantId']);
      const eventId = readStringField(body, 'eventId', { required: true, max: 12, pattern: /^\d{1,12}$/ });
      const registrantId = readStringField(body, 'registrantId', { required: true, max: 128, pattern: simpleIdPattern });
      body.eventId = eventId;
      body.registrantId = registrantId;
      const data = await eventsDb.removeEventRegistrant(body);
      const promotedRegistration = data?.promotedRegistration
        ? normalizeEventRegistrantForReminder(data.promotedRegistration, data)
        : null;
      const promotionEmailResult = promotedRegistration
        ? await sendRegistrationStatusEmail({ registration: promotedRegistration, kind: 'event', promoted: true })
        : { sent: false, reason: 'no_promotion' };
      notifyAppUpdate({
        title: 'Event Registration Removed',
        body: `An attendee was removed from ${data?.title || 'a community event'}${promotedRegistration ? `; ${promotedRegistration.name || 'a waitlisted attendee'} was promoted from the waitlist` : ''}.`,
        url: '/events',
        tag: 'ssm-event-registration-removed'
      });
      await appendAuditLog(request, {
        action: 'event.registrant.remove',
        targetType: 'event',
        targetId: String(body?.eventId || ''),
        description: `Removed event registrant ${String(body?.registrantId || '')}`,
        payload: {
          eventId: body?.eventId,
          registrantId: body?.registrantId
        }
      });
      sendJson(response, 200, { ok: true, data: { ...data, promotionEmailSent: promotionEmailResult.sent === true } });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to remove event registrant.'
      });
    }
    return;
  }

  const eventPathMatch = requestUrl.pathname.match(/^\/api\/events\/([^/]+)$/);
  if (eventPathMatch && request.method === 'PATCH') {
    try {
      const id = parseNumericPathId(decodeURIComponent(eventPathMatch[1]), 'event id');
      const body = await parseAndValidateGenericObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      const existingEvents = await eventsDb.getEvents();
      const existingEvent = (Array.isArray(existingEvents) ? existingEvents : []).find((entry) => String(entry?.id || '') === String(id));
      const validatedEvent = { ...(existingEvent || {}), ...body, id };
      await assertNoScheduleOverlap(validatedEvent, { kind: 'event', excludeId: id });
      const data = await eventsDb.updateEvent(id, body);
      const changedEventFields = Object.keys(body).filter((field) => JSON.stringify(existingEvent?.[field]) !== JSON.stringify(data?.[field]));
      if (changedEventFields.length) {
        notifyAppUpdate({
          title: data?.active === false ? 'Event Cancelled' : 'Event Updated',
          body: `${data?.title || existingEvent?.title || 'Community event'} was ${data?.active === false ? 'cancelled' : 'updated'}${changedEventFields.length ? ` (${changedEventFields.slice(0, 3).join(', ')} changed)` : ''}; scheduled for ${data?.date || existingEvent?.date || 'a new date'}${data?.location ? ` at ${data.location}` : ''}.`,
          url: '/events',
          tag: 'ssm-event-updated'
        });
      }
      await appendAuditLog(request, {
        action: 'event.update',
        targetType: 'event',
        targetId: String(id),
        description: `Updated event ${String(id)}`,
        payload: body
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to update event.'
      });
    }
    return;
  }

  if (eventPathMatch && request.method === 'DELETE') {
    try {
      const id = parseNumericPathId(decodeURIComponent(eventPathMatch[1]), 'event id');
      const existingEvents = await eventsDb.getEvents();
      const deletedEvent = (Array.isArray(existingEvents) ? existingEvents : []).find((entry) => String(entry?.id || '') === String(id));
      const data = await eventsDb.removeEvent(id);
      if (deletedEvent) {
        notifyAppUpdate({
          title: 'Event Cancelled',
          body: `${deletedEvent.title || 'Community event'} on ${deletedEvent.date || 'its scheduled date'}${deletedEvent.location ? ` at ${deletedEvent.location}` : ''} was cancelled and removed from the calendar.`,
          url: '/events',
          tag: 'ssm-event-deleted'
        });
      }
      await appendAuditLog(request, {
        action: 'event.delete',
        targetType: 'event',
        targetId: String(id),
        description: `Deleted event ${String(id)}`
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to remove event.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stripe/quick-donate-config' && request.method === 'GET') {
    const configured = stripeSecretKey.startsWith('sk_test_') && stripePublishableKey.startsWith('pk_test_');
    sendJson(response, 200, {
      ok: true,
      data: { configured, publishableKey: configured ? stripePublishableKey : '' }
    });
    return;
  }

  if (requestUrl.pathname === '/api/stripe/quick-donate-status' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: 2048, allowEmpty: false });
      ensureNoUnknownKeys(body, ['paymentIntentId', 'clientSecret']);
      const data = await verifyQuickDonation(body, {
        stripe: requireStripeClient(),
        persist: async (intent) => {
          const donation = await upsertDonation(mapQuickDonatePaymentIntent(intent, `verified-${intent.id}`));
          await syncCampaignRaisedTotal({ campaignId: donation?.campaignId, campaignName: donation?.campaignName });
          if (intent.metadata.pending_id) await removePendingDonation(intent.metadata.pending_id);
        }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: 'Payment could not be verified. Please contact the Gurdwara before paying again.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stripe/create-quick-donate-intent' && request.method === 'POST') {
    try {
      if (!stripeSecretKey.startsWith('sk_test_') || !stripePublishableKey.startsWith('pk_test_')) {
        const error = new Error('Stripe test-mode keys are not fully configured.');
        error.status = 503;
        throw error;
      }
      const stripeClient = requireStripeClient();
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['campaignId', 'amountCents']);
      const campaignId = readNumberField(body, 'campaignId', { required: true, integer: true, min: 1, max: 1000000000 });
      const amountCents = readNumberField(body, 'amountCents', { required: true, integer: true, min: 100, max: 1000000 });
      const amount = amountCents / 100;

      const campaigns = await getDonationCampaigns();
      const campaign = campaigns.find((entry) => Number(entry.id) === campaignId);
      const campaignProvider = String(campaign?.paymentProvider || campaign?.payment_provider || 'STRIPE').toUpperCase();
      if (campaign && campaignProvider !== 'STRIPE') {
        const error = new Error('Quick Donate wallets require a campaign with Stripe selected as its payment provider.');
        error.status = 409;
        throw error;
      }
      if (!campaign || campaign.isActive !== true || campaign.isClosed !== false) {
        const error = new Error('This donation campaign is not available.');
        error.status = 404;
        throw error;
      }
      const raised = Number(campaign.raised || 0);
      const target = Number(campaign.target || 0);
      if (target > 0 && raised >= target) {
        const error = new Error('This donation campaign has reached its goal.');
        error.status = 409;
        throw error;
      }

      const pendingId = `quick-${crypto.randomUUID()}`;
      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: amountCents,
        currency: 'cad',
        payment_method_types: ['card'],
        description: `${String(campaign.name || 'Gurdwara')} donation`,
        metadata: {
          quick_donate: 'true',
          pending_id: pendingId,
          campaign_id: String(campaignId),
          campaign_name: String(campaign.name || 'General Donation')
        }
      });
      await createPendingDonation({
        id: pendingId,
        campaignId,
        campaignName: String(campaign.name || 'General Donation'),
        donorName: 'Anonymous',
        donorEmail: '',
        amount,
        frequency: 'one-time',
        paymentProvider: 'STRIPE',
        sessionId: paymentIntent.id,
        createdAt: new Date().toISOString()
      });

      sendJson(response, 200, {
        ok: true,
        data: { pendingId, paymentIntentId: paymentIntent.id, clientSecret: paymentIntent.client_secret, amount, amountCents }
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to start wallet donation.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stripe/create-checkout-session' && request.method === 'POST') {
    try {
      const stripeClient = requireStripeClient();
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['campaignName', 'pendingId', 'origin', 'amountCents', 'amount', 'donorEmail', 'campaignId', 'donorName', 'frequency', 'donationPurpose']);
      readStringField(body, 'campaignName', { max: 160 });
      readStringField(body, 'pendingId', { max: 120, pattern: simpleIdPattern });
      const originInput = readStringField(body, 'origin', { max: 300 });
      if (originInput) {
        assertInput(/^https?:\/\//i.test(originInput), 'origin must be a valid http/https URL.');
      }
      const amountCents = readNumberField(body, 'amountCents', { integer: true, min: 1, max: 50000000 });
      const amount = readNumberField(body, 'amount', { min: 0.01, max: 500000 });
      assertInput(amountCents != null || amount != null, 'amountCents or amount is required.');
      readEmailField(body, 'donorEmail', { required: false });
      readNumberField(body, 'campaignId', { integer: true, min: 1, max: 1000000000 });
      readStringField(body, 'donorName', { max: 140 });
      readStringField(body, 'frequency', { max: 40 });
      readStringField(body, 'donationPurpose', { max: 240 });

      const campaignName = String(body.campaignName || 'General Donation').trim() || 'General Donation';
      const pendingId = String(body.pendingId || `pending-${Date.now()}`);
      const origin = String(body.origin || request.headers.origin || 'http://localhost:3000').replace(/\/$/, '');
      const successUrl = `${origin}/donationsuccess?session_id={CHECKOUT_SESSION_ID}&pending_id=${encodeURIComponent(pendingId)}`;
      const cancelUrl = `${origin}/donation?cancelled=1`;
      const parsedAmountCents = Number(body.amountCents);
      const parsedAmount = Number(body.amount);
      const derivedAmountCents = Number.isFinite(parsedAmount) && parsedAmount > 0
        ? Math.round(parsedAmount * 100)
        : NaN;
      const effectiveAmountCents = Number.isFinite(parsedAmountCents) && parsedAmountCents > 0
        ? Math.round(parsedAmountCents)
        : derivedAmountCents;

      if (!Number.isFinite(effectiveAmountCents) || effectiveAmountCents <= 0) {
        sendJson(response, 400, {
          ok: false,
          message: 'Donation amount is required.'
        });
        return;
      }

      const unitAmount = effectiveAmountCents;

      const session = await stripeClient.checkout.sessions.create({
        mode: 'payment',
        submit_type: 'donate',
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: body.donorEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: stripeCurrency,
              product_data: {
                name: `${campaignName} Donation`
              },
              unit_amount: unitAmount
            },
            quantity: 1
          }
        ],
        metadata: {
          pending_id: pendingId,
          campaign_id: String(body.campaignId || ''),
          campaign_name: campaignName,
          donor_name: String(body.donorName || ''),
          donor_email: String(body.donorEmail || ''),
          frequency: String(body.frequency || 'one-time'),
          donation_purpose: String(body.donationPurpose || campaignName)
        }
      });

      sendJson(response, 200, {
        ok: true,
        data: {
          pendingId,
          sessionId: session.id,
          checkoutUrl: session.url
        }
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to create Stripe Checkout session.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stripe/resolve') {
    try {
      const stripeClient = requireStripeClient();
      const sessionId = requestUrl.searchParams.get('session_id') || requestUrl.searchParams.get('sessionId') || '';
      const paymentIntentId = requestUrl.searchParams.get('payment_intent') || requestUrl.searchParams.get('paymentIntentId') || '';

      if (!sessionId && !paymentIntentId) {
        sendJson(response, 400, { ok: false, message: 'Provide session_id or payment_intent.' });
        return;
      }

      if (sessionId) {
        assertInput(/^cs_[A-Za-z0-9_]+$/.test(String(sessionId)), 'session_id has an invalid format.');
      }

      if (paymentIntentId) {
        assertInput(/^pi_[A-Za-z0-9_]+$/.test(String(paymentIntentId)), 'payment_intent has an invalid format.');
      }

      if (sessionId) {
        const session = await stripeClient.checkout.sessions.retrieve(sessionId);
        sendJson(response, 200, {
          ok: true,
          data: {
            source: 'checkout_session',
            id: session.id,
            status: session.status,
            paymentStatus: session.payment_status,
            amount: Number(session.amount_total || 0),
            currency: session.currency || stripeCurrency,
            clientReferenceId: session.client_reference_id || '',
            paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || ''
          }
        });
        return;
      }

      const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
      sendJson(response, 200, {
        ok: true,
        data: {
          source: 'payment_intent',
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: Number(paymentIntent.amount_received || paymentIntent.amount || 0),
          currency: paymentIntent.currency || stripeCurrency,
          clientReferenceId: paymentIntent.client_reference_id || '',
          paymentIntentId: paymentIntent.id
        }
      });
    } catch (error) {
      sendJson(response, error.status || error.statusCode || 500, {
        ok: false,
        message: error.message || 'Unable to resolve Stripe payment details.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/streaming/youtube/live' && request.method === 'GET') {
    try {
      const source = requestUrl.searchParams.get('source') || requestUrl.searchParams.get('channelId') || requestUrl.searchParams.get('channelUrl') || '';
      const liveDetails = await resolveYouTubeLiveVideo(source);
      sendJson(response, 200, {
        ok: true,
        data: {
          source,
          ...liveDetails
        }
      });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to resolve the live YouTube stream.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/volunteer-reminders/run' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: true });
      ensureNoUnknownKeys(body, ['force']);
      const force = readBooleanField(body, 'force');
      const data = await runVolunteerReminderSweep({ force: body?.force === true });
      if (force != null) {
        data.force = force;
      }
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to run volunteer reminders.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/events/reminders/run' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: true });
      ensureNoUnknownKeys(body, ['force']);
      const force = readBooleanField(body, 'force');
      const data = await runEventReminderSweep({ force: body?.force === true });
      await appendAuditLog(request, {
        action: 'event.reminders.run',
        targetType: 'event-reminders',
        targetId: 'scheduled',
        description: 'Executed event reminder sweep',
        payload: { force: force === true, result: data }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to run event reminders.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/bookings/reminders/run' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: true });
      ensureNoUnknownKeys(body, ['force']);
      const force = readBooleanField(body, 'force');
      const data = await runBookingReminderSweep({ force: force === true });
      await appendAuditLog(request, {
        action: 'booking.reminders.run',
        targetType: 'booking-reminders',
        targetId: 'scheduled',
        description: 'Executed booking reminder sweep',
        payload: { force: force === true, result: data }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to run booking reminders.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/bookings/duty-notifications/send' && request.method === 'POST') {
    try {
      assertInput(canManageBookingDuties(request), 'Only Admin and Super Admin can send booking duty notifications.', 403);
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, ['bookingId', 'role', 'scope']);
      const requestedRole = readStringField(body, 'role', { max: 100 });
      const bookingId = readStringField(body, 'bookingId', { max: 160 });
      const scope = readStringField(body, 'scope', { max: 20 }) || 'single';
      assertInput(['single', 'upcoming'].includes(scope), 'scope must be single or upcoming.');

      const [dutyContext, storedBookings] = await Promise.all([resolveBookingDutyRecipients(), eventsDb.listItems('bookings')]);
      const role = requestedRole || dutyContext.roleLabel;
      const recipients = dutyContext.recipients;
      assertInput(recipients.length > 0, 'No active approved users with email addresses have access to Booking Duties.');

      const todayKey = toDateKeyFromParts(getDatePartsInTimeZone(new Date(), bookingReminderTimeZone));
      const bookings = (Array.isArray(storedBookings) ? storedBookings : [])
        .filter((booking) => String(booking.status || '').trim().toLowerCase() === 'confirmed')
        .filter((booking) => scope === 'single' ? String(booking.id) === bookingId : String(booking.toDate || booking.date || '') >= todayKey)
        .sort((first, second) => `${first.date || ''}${first.startTime || ''}`.localeCompare(`${second.date || ''}${second.startTime || ''}`))
        .slice(0, scope === 'single' ? 1 : 50);
      assertInput(bookings.length > 0, scope === 'single' ? 'Booking not found or is not confirmed.' : 'No upcoming confirmed bookings found.');

      let sent = 0;
      let recipientCount = 0;
      for (const recipient of recipients) {
        const assignedBookings = bookings.filter((booking) => isRecipientAssignedToBooking(recipient, booking));
        if (assignedBookings.length === 0) continue;
        recipientCount += 1;
        const delivery = await sendBookingDutyBriefingEmail({ recipient, bookings: assignedBookings, role, scope });
        if (delivery.ok) sent += 1;
      }
      assertInput(recipientCount > 0, 'The selected booking does not have an eligible duty performer assigned.');
      notifyAppUpdate({
        title: 'Booking Duty Briefing Sent',
        body: `Admin sent a ${scope === 'single' ? 'duty briefing' : 'schedule briefing'} to ${sent} of ${recipientCount} assigned performer${recipientCount === 1 ? '' : 's'}.`,
        url: '/admin/booking-duties',
        tag: 'ssm-booking-duty-briefing'
      });
      await appendAuditLog(request, { action: 'booking.duty-notifications.send', targetType: 'bookings', targetId: bookingId || 'upcoming', description: `Sent booking duty briefing to ${role}`, payload: { role, scope, bookingCount: bookings.length, recipientCount, sent } });
      sendJson(response, 200, { ok: true, data: { role, scope, bookingCount: bookings.length, recipientCount, sent } });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to send booking duty notifications.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/volunteer-recognition' && request.method === 'GET') {
    try {
      const data = await getVolunteerRecognitionData();
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        message: error.message || 'Unable to generate volunteer recognition data.'
      });
    }
    return;
  }

  const manualReminderMatch = requestUrl.pathname.match(/^\/api\/volunteer-reminders\/opportunity\/([^/]+)\/send$/i);
  if (manualReminderMatch && request.method === 'POST') {
    try {
      const opportunityId = parseStringPathId(decodeURIComponent(manualReminderMatch[1]), 'opportunity id');
      const data = await sendManualOpportunityReminders(opportunityId);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to send manual volunteer reminders.'
      });
    }
    return;
  }

  const reminderPreviewMatch = requestUrl.pathname.match(/^\/api\/volunteer-reminders\/opportunity\/([^/]+)\/preview$/i);
  if (reminderPreviewMatch && request.method === 'GET') {
    try {
      const opportunityId = decodeURIComponent(reminderPreviewMatch[1]);
      const template = await buildOpportunityEmailPreview(opportunityId);
      const responseFormat = String(requestUrl.searchParams.get('format') || '').trim().toLowerCase();
      const htmlBody = String(template?.html || '').trim();

      if (responseFormat === 'json') {
        sendJson(response, 200, {
          ok: true,
          data: {
            subject: template.subject || '',
            text: template.text || '',
            html: htmlBody,
            templateType: htmlBody ? 'html' : 'text'
          }
        });
        return;
      }

      if (!htmlBody) {
        response.writeHead(200, {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        });
        response.end(template.text || 'No preview available.');
        return;
      }

      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      response.end(htmlBody);
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to render reminder preview.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/stripe/webhook' && request.method === 'POST') {
    try {
      if (!stripeWebhookSecret) {
        sendJson(response, 500, {
          ok: false,
          message: 'STRIPE_WEBHOOK_SECRET is not configured on the server.'
        });
        return;
      }

      const stripeClient = requireStripeClient();
      const body = await readBody(request);
      const signature = request.headers['stripe-signature'];
      const event = stripeClient.webhooks.constructEvent(body, signature, stripeWebhookSecret);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const donationRecord = mapWebhookDonation(session, event.id);
        const persistedDonation = await upsertDonation(donationRecord);
        await attachDonationReceiptToBooking(persistedDonation);
        await syncCampaignRaisedTotal({
          campaignId: persistedDonation?.campaignId,
          campaignName: persistedDonation?.campaignName
        });
      } else if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        if (paymentIntent.metadata?.quick_donate === 'true' && paymentIntent.livemode === false
          && paymentIntent.currency === 'cad') {
          const donationRecord = mapQuickDonatePaymentIntent(paymentIntent, event.id);
          const persistedDonation = await upsertDonation(donationRecord);
          await syncCampaignRaisedTotal({
            campaignId: persistedDonation?.campaignId,
            campaignName: persistedDonation?.campaignName
          });
          if (donationRecord.sourcePendingId) await removePendingDonation(donationRecord.sourcePendingId);
        }
      }

      sendJson(response, 200, { received: true });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        message: `Webhook Error: ${error.message || 'Invalid webhook event.'}`
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/zeffy/webhook' && request.method === 'POST') {
    try {
      if (zeffyWebhookToken) {
        const authorization = String(request.headers.authorization || '').trim();
        const bearerToken = authorization.toLowerCase().startsWith('bearer ') ? authorization.slice(7).trim() : '';
        const providedToken = String(
          request.headers['x-zeffy-webhook-token']
          || request.headers['x-api-key']
          || requestUrl.searchParams.get('token')
          || bearerToken
          || ''
        ).trim();
        if (!verifyZeffyWebhookToken(zeffyWebhookToken, providedToken)) {
          sendJson(response, 401, { ok: false, message: 'Invalid Zeffy webhook token.' });
          return;
        }
      }

      const event = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      if (normalizeEventType(event) !== 'payment.completed') {
        sendJson(response, 200, { ok: true, received: true, ignored: true });
        return;
      }

      const paymentId = extractZeffyPaymentId(event);
      assertInput(Boolean(paymentId), 'Zeffy payment.completed event is missing its payment id.');
      const { campaigns, configurations } = await getConfiguredZeffyCampaigns();
      assertInput(configurations.length > 0, 'No Zeffy API key is configured.');

      let verifiedPayment = null;
      let matchedConfiguration = null;
      let verificationStatus = 400;
      for (const configuration of configurations) {
        const zeffyResponse = await fetch(`https://api.zeffy.com/api/v1/payments/${encodeURIComponent(paymentId)}`, {
          headers: { Authorization: `Bearer ${configuration.apiKey}` }
        });
        const zeffyBody = await zeffyResponse.json().catch(() => ({}));
        verificationStatus = zeffyResponse.status;
        if (!zeffyResponse.ok) {
          continue;
        }
        const payment = zeffyBody.data || zeffyBody;
        if (zeffyPaymentMatchesConfiguration(payment, configuration, configurations.length)) {
          verifiedPayment = payment;
          matchedConfiguration = configuration;
          break;
        }
      }
      if (!verifiedPayment) {
        const error = new Error(`Unable to verify Zeffy payment (${verificationStatus}).`);
        error.status = verificationStatus >= 500 || verificationStatus === 429 ? 502 : 400;
        throw error;
      }
      const persistedDonation = await persistVerifiedZeffyPayment(
        verifiedPayment,
        campaigns,
        matchedConfiguration?.campaign || null,
        true
      );
      await syncCampaignRaisedTotal({
        campaignId: persistedDonation.campaignId,
        campaignName: persistedDonation.campaignName
      });

      sendJson(response, 200, {
        ok: true,
        received: true,
        data: {
          id: persistedDonation.id,
          receiptId: persistedDonation.receiptId,
          paymentStatus: persistedDonation.paymentStatus
        }
      });
    } catch (error) {
      sendJson(response, error.status || 400, {
        ok: false,
        message: error.message || 'Unable to process Zeffy webhook event.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donations' && request.method === 'GET') {
    // Keep this user-facing list fast: both reconcilers perform external API calls.
    // Never hold the request open for gateway outages or slow provider responses.
    reconcileZeffyDonations().catch((error) => {
      logServerError(error, '[donations] Background Zeffy reconciliation failed');
    });
    reconcilePaidPendingDonations().catch((error) => {
      logServerError(error, '[donations] Background Stripe reconciliation failed');
    });
    const data = (await readDonations()).sort((left, right) => {
      const l = new Date(left.createdAt || 0).getTime();
      const r = new Date(right.createdAt || 0).getTime();
      return r - l;
    });
    sendJson(response, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/donations/reconcile-zeffy' && request.method === 'POST') {
    if (!canManageDonations(request)) {
      sendJson(response, 403, { ok: false, message: 'Only Admin and Super Admin can reconcile Zeffy donations.' });
      return;
    }
    try {
      const data = await reconcileZeffyDonations({ force: true });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      logServerError(error, '[donations] Forced Zeffy reconciliation failed');
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to reconcile Zeffy donations.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donations' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'id', 'receiptId', 'sourcePendingId', 'campaignId', 'campaignName', 'donorName', 'donorEmail', 'amount',
        'frequency', 'paymentProvider', 'paymentStatus', 'gatewayTransactionId', 'stripeSessionId', 'stripeEventId',
        'createdAt', 'emailSent', 'source', 'phone', 'address', 'donationPurpose', 'notes', 'smsConsent'
      ]);
      readStringField(body, 'id', { max: 160, pattern: simpleIdPattern });
      readStringField(body, 'receiptId', { max: 160, pattern: simpleIdPattern });
      readStringField(body, 'sourcePendingId', { max: 160, pattern: simpleIdPattern });
      readNumberField(body, 'campaignId', { integer: true, min: 1, max: 1000000000 });
      readStringField(body, 'campaignName', { max: 180 });
      readStringField(body, 'donorName', { max: 140 });
      readEmailField(body, 'donorEmail', { required: false });
      readNumberField(body, 'amount', { required: true, min: 0.01, max: 500000 });
      readStringField(body, 'frequency', { max: 40 });
      readStringField(body, 'paymentProvider', { max: 40 });
      readStringField(body, 'paymentStatus', { max: 40 });
      readStringField(body, 'gatewayTransactionId', { max: 180 });
      readStringField(body, 'stripeSessionId', { max: 180 });
      readStringField(body, 'stripeEventId', { max: 180 });
      const createdAt = readStringField(body, 'createdAt', { max: 64 });
      if (createdAt) {
        assertInput(!Number.isNaN(new Date(createdAt).getTime()), 'createdAt must be a valid ISO date string.');
      }
      readBooleanField(body, 'emailSent');
      readBooleanField(body, 'smsConsent');
      if (body.smsConsent === true) {
        assertInput(canManageDonations(request), 'Donation admin access is required to request an SMS acknowledgement.', 403);
      }
      readStringField(body, 'source', { max: 80 });
      readPhoneField(body, 'phone');
      readStringField(body, 'address', { max: 240 });
      readStringField(body, 'donationPurpose', { max: 240 });
      readStringField(body, 'notes', { max: 1000 });
      const data = await upsertDonation(body);
      if (canManageDonations(request)) acknowledgeDonationSms(data, body.smsConsent === true);
      await syncCampaignRaisedTotal({ campaignId: data?.campaignId, campaignName: data?.campaignName });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      const isDuplicateReceipt = error?.code === '23505' && String(error?.constraint || '') === 'uq_donations_receipt_id';
      sendJson(response, isDuplicateReceipt ? 409 : (error.status || 500), {
        ok: false,
        message: isDuplicateReceipt
          ? 'This receipt number already exists. Enter a unique Gurdwara receipt number.'
          : (error.message || 'Unable to upsert donation.')
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donations/email-statement' && request.method === 'POST') {
    if (!canManageDonations(request)) {
      sendJson(response, 403, { ok: false, message: 'Only Admin and Super Admin can email donation statements.' });
      return;
    }
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxUploadBytes * 2, allowEmpty: false });
      ensureNoUnknownKeys(body, ['donor', 'donationIds', 'campaignName', 'dateFrom', 'dateTo', 'organizationName', 'address', 'phone', 'fileName', 'attachmentBase64']);
      const donor = readObjectField(body, 'donor', { required: true });
      ensureNoUnknownKeys(donor, ['name', 'email', 'phone']);
      readStringField(donor, 'name', { required: true, max: 180 });
      readEmailField(donor, 'email', { required: true });
      readPhoneField(donor, 'phone');
      const donationIds = readArrayField(body, 'donationIds', { required: true, max: 500 });
      assertInput(donationIds.length > 0, 'donationIds must contain at least one donation.');
      donationIds.forEach((id) => assertInput(typeof id === 'string' && simpleIdPattern.test(id), 'Each donation id must be valid.'));
      readStringField(body, 'campaignName', { max: 180 });
      const dateFrom = readStringField(body, 'dateFrom', { max: 10 });
      const dateTo = readStringField(body, 'dateTo', { max: 10 });
      if (dateFrom) assertInput(/^\d{4}-\d{2}-\d{2}$/.test(dateFrom), 'dateFrom must use YYYY-MM-DD format.');
      if (dateTo) assertInput(/^\d{4}-\d{2}-\d{2}$/.test(dateTo), 'dateTo must use YYYY-MM-DD format.');
      if (dateFrom && dateTo) assertInput(dateFrom <= dateTo, 'dateFrom must be on or before dateTo.');
      readStringField(body, 'organizationName', { max: 180 });
      readStringField(body, 'address', { max: 300 });
      readPhoneField(body, 'phone');
      readStringField(body, 'fileName', { max: 180, pattern: /^[A-Za-z0-9._-]+$/ });
      readStringField(body, 'attachmentBase64', { required: true, max: maxUploadBytes * 3 });
      const data = await sendBulkDonationStatementEmail(body);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to send donation statement email.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donations/email-invoice' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxUploadBytes * 2, allowEmpty: false });
      ensureNoUnknownKeys(body, ['donation', 'campaignDescription', 'organizationName', 'address', 'phone', 'fileName', 'attachmentBase64']);
      const donation = readObjectField(body, 'donation', { required: true });
      ensureNoUnknownKeys(donation, ['id', 'receiptId']);
      const donationId = readStringField(donation, 'id', { max: 160, pattern: simpleIdPattern });
      const receiptId = readStringField(donation, 'receiptId', { max: 160, pattern: simpleIdPattern });
      assertInput(Boolean(donationId || receiptId), 'donation.id or donation.receiptId is required.');
      readStringField(body, 'campaignDescription', { max: 500 });
      readStringField(body, 'organizationName', { max: 180 });
      readStringField(body, 'address', { max: 300 });
      readPhoneField(body, 'phone');
      readStringField(body, 'fileName', { max: 180, pattern: /^[A-Za-z0-9._-]+$/ });
      readStringField(body, 'attachmentBase64', { required: true, max: maxUploadBytes * 3 });
      const data = await sendDonationInvoiceEmail(body || {});
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to send donation invoice email.'
      });
    }
    return;
  }

  const donationIdMatch = requestUrl.pathname.match(/^\/api\/donations\/([^/]+)$/);
  if (donationIdMatch && request.method === 'DELETE') {
    if (!canManageDonations(request)) {
      sendJson(response, 403, { ok: false, message: 'Only Admin and Super Admin can delete donations.' });
      return;
    }

    try {
      const id = parseStringPathId(decodeURIComponent(donationIdMatch[1]), 'donation id');
      const data = await removeDonation(id);
      if (!data) {
        sendJson(response, 404, { ok: false, message: 'Donation not found.' });
        return;
      }
      await appendAuditLog(request, {
        action: 'donation.delete',
        targetType: 'donation',
        targetId: String(id),
        description: `Deleted donation ${String(data.receiptId || id)}`,
        payload: {
          campaignId: data.campaignId,
          campaignName: data.campaignName,
          amount: data.amount
        }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to delete donation.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donations' && request.method === 'DELETE') {
    try {
      const data = await clearDonations();
      await clearPendingDonations();
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to clear donations.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donations/summary' && request.method === 'GET') {
    await reconcilePaidPendingDonations();
    const summary = await getDonationSummary();
    sendJson(response, 200, { ok: true, data: summary });
    return;
  }

  if (requestUrl.pathname === '/api/donation-campaigns' && request.method === 'GET') {
    await reconcilePaidPendingDonations();
    const data = await getDonationCampaigns();
    sendJson(response, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/donation-campaigns' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'name', 'description', 'target', 'raised', 'startDate', 'endDate', 'active', 'isActive',
        'progressTitle', 'progressDescription', 'progressPhotos', 'progressUpdates', 'progressItems', 'storyBlocks',
        'paymentProvider', 'paymentLink', 'stripeBuyButtonId', 'stripePublishableKey', 'zeffyApiKey'
      ]);
      readStringField(body, 'name', { required: true, min: 2, max: 180 });
      readStringField(body, 'description', { max: 1000 });
      readStringField(body, 'progressTitle', { max: 180 });
      readStringField(body, 'progressDescription', { max: 5000 });
      readNumberField(body, 'target', { min: 0, max: 500000000 });
      readNumberField(body, 'raised', { min: 0, max: 500000000 });
      const startDate = readStringField(body, 'startDate', { max: 64 });
      const endDate = readStringField(body, 'endDate', { max: 64 });
      if (startDate) {
        assertInput(!Number.isNaN(new Date(startDate).getTime()), 'startDate must be a valid date string.');
      }
      if (endDate) {
        assertInput(!Number.isNaN(new Date(endDate).getTime()), 'endDate must be a valid date string.');
      }
      const progressPhotos = readArrayField(body, 'progressPhotos', { max: 200 });
      if (progressPhotos) {
        progressPhotos.forEach((entry, index) => {
          assertInput(typeof entry === 'string', `progressPhotos[${index}] must be a string.`);
          assertInput(String(entry).trim().length <= 1200, `progressPhotos[${index}] must be at most 1200 characters.`);
        });
      }
      const progressUpdates = readArrayField(body, 'progressUpdates', { max: 200 });
      if (progressUpdates) {
        progressUpdates.forEach((entry, index) => {
          validateGenericJsonValue(entry, `progressUpdates[${index}]`, 0);
        });
      }
      const progressItems = readArrayField(body, 'progressItems', { max: 500 });
      if (progressItems) {
        progressItems.forEach((entry, index) => {
          validateGenericJsonValue(entry, `progressItems[${index}]`, 0);
        });
      }
      const storyBlocks = readArrayField(body, 'storyBlocks', { max: 500 });
      if (storyBlocks) {
        storyBlocks.forEach((entry, index) => {
          validateGenericJsonValue(entry, `storyBlocks[${index}]`, 0);
        });
      }
      const paymentProviderRaw = readStringField(body, 'paymentProvider', { max: 20 });
      const paymentProvider = String(paymentProviderRaw || '').trim().toUpperCase();
      if (paymentProvider) {
        assertInput(['STRIPE', 'PAYPAL', 'ZEFFY'].includes(paymentProvider), 'paymentProvider must be STRIPE, PAYPAL, or ZEFFY.');
      }
      const paymentLink = readStringField(body, 'paymentLink', { max: 1200 });
      if (paymentLink) {
        assertInput(/^https?:\/\//i.test(paymentLink), 'paymentLink must be a valid http/https URL.');
      }
      readStringField(body, 'stripeBuyButtonId', { max: 180 });
      readStringField(body, 'stripePublishableKey', { max: 240 });
      const zeffyApiKeyValue = readStringField(body, 'zeffyApiKey', { max: 1200 });
      if (paymentProvider === 'ZEFFY') {
        assertInput(Boolean(paymentLink), 'paymentLink is required for Zeffy campaigns.');
        assertInput(Boolean(zeffyApiKeyValue), 'zeffyApiKey is required for Zeffy campaigns.');
        await validateZeffyCampaignConfiguration({
          name: body.name,
          paymentLink,
          apiKey: zeffyApiKeyValue
        });
      }
      readBooleanField(body, 'active');
      readBooleanField(body, 'isActive');
      const data = await createDonationCampaign(body);
      await appendAuditLog(request, {
        action: 'donation.campaign.create',
        targetType: 'donation-campaign',
        targetId: String(data?.id || ''),
        description: `Created campaign ${String(data?.name || '')}`,
        payload: {
          ...body,
          ...(body.zeffyApiKey ? { zeffyApiKey: '[REDACTED]' } : {})
        }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to create donation campaign.' });
    }
    return;
  }

  const campaignIdMatch = requestUrl.pathname.match(/^\/api\/donation-campaigns\/([^/]+)$/);
  if (campaignIdMatch && request.method === 'PATCH') {
    try {
      const id = parseNumericPathId(decodeURIComponent(campaignIdMatch[1]), 'campaign id');
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'name', 'description', 'target', 'raised', 'startDate', 'endDate', 'active', 'isActive',
        'progressTitle', 'progressDescription', 'progressPhotos', 'progressUpdates', 'progressItems', 'storyBlocks',
        'paymentProvider', 'paymentLink', 'stripeBuyButtonId', 'stripePublishableKey', 'zeffyApiKey'
      ]);
      readStringField(body, 'name', { min: 2, max: 180 });
      readStringField(body, 'description', { max: 1000 });
      readStringField(body, 'progressTitle', { max: 180 });
      readStringField(body, 'progressDescription', { max: 5000 });
      readNumberField(body, 'target', { min: 0, max: 500000000 });
      readNumberField(body, 'raised', { min: 0, max: 500000000 });
      const startDate = readStringField(body, 'startDate', { max: 64 });
      const endDate = readStringField(body, 'endDate', { max: 64 });
      if (startDate) {
        assertInput(!Number.isNaN(new Date(startDate).getTime()), 'startDate must be a valid date string.');
      }
      if (endDate) {
        assertInput(!Number.isNaN(new Date(endDate).getTime()), 'endDate must be a valid date string.');
      }
      const progressPhotos = readArrayField(body, 'progressPhotos', { max: 200 });
      if (progressPhotos) {
        progressPhotos.forEach((entry, index) => {
          assertInput(typeof entry === 'string', `progressPhotos[${index}] must be a string.`);
          assertInput(String(entry).trim().length <= 1200, `progressPhotos[${index}] must be at most 1200 characters.`);
        });
      }
      const progressUpdates = readArrayField(body, 'progressUpdates', { max: 200 });
      if (progressUpdates) {
        progressUpdates.forEach((entry, index) => {
          validateGenericJsonValue(entry, `progressUpdates[${index}]`, 0);
        });
      }
      const progressItems = readArrayField(body, 'progressItems', { max: 500 });
      if (progressItems) {
        progressItems.forEach((entry, index) => {
          validateGenericJsonValue(entry, `progressItems[${index}]`, 0);
        });
      }
      const storyBlocks = readArrayField(body, 'storyBlocks', { max: 500 });
      if (storyBlocks) {
        storyBlocks.forEach((entry, index) => {
          validateGenericJsonValue(entry, `storyBlocks[${index}]`, 0);
        });
      }
      const paymentProviderRaw = readStringField(body, 'paymentProvider', { max: 20 });
      const paymentProvider = String(paymentProviderRaw || '').trim().toUpperCase();
      if (paymentProvider) {
        assertInput(['STRIPE', 'PAYPAL', 'ZEFFY'].includes(paymentProvider), 'paymentProvider must be STRIPE, PAYPAL, or ZEFFY.');
      }
      const paymentLink = readStringField(body, 'paymentLink', { max: 1200 });
      if (paymentLink) {
        assertInput(/^https?:\/\//i.test(paymentLink), 'paymentLink must be a valid http/https URL.');
      }
      readStringField(body, 'stripeBuyButtonId', { max: 180 });
      readStringField(body, 'stripePublishableKey', { max: 240 });
      const zeffyApiKeyValue = readStringField(body, 'zeffyApiKey', { max: 1200 });
      if (paymentProvider === 'ZEFFY') {
        assertInput(Boolean(normalizeZeffyCampaignSlug(paymentLink)), 'paymentLink must be a valid Zeffy donation form URL.');
      }
      if (paymentProvider === 'ZEFFY' && zeffyApiKeyValue) {
        await validateZeffyCampaignConfiguration({
          name: body.name,
          paymentLink,
          apiKey: zeffyApiKeyValue
        });
      }
      readBooleanField(body, 'active');
      readBooleanField(body, 'isActive');
      const data = await updateDonationCampaign(id, body);
      await appendAuditLog(request, {
        action: 'donation.campaign.update',
        targetType: 'donation-campaign',
        targetId: String(id),
        description: `Updated campaign ${String(id)}`,
        payload: {
          ...body,
          ...(body.zeffyApiKey ? { zeffyApiKey: '[REDACTED]' } : {})
        }
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to update donation campaign.' });
    }
    return;
  }

  if (campaignIdMatch && request.method === 'DELETE') {
    try {
      const id = parseNumericPathId(decodeURIComponent(campaignIdMatch[1]), 'campaign id');
      const data = await removeDonationCampaign(id);
      await appendAuditLog(request, {
        action: 'donation.campaign.delete',
        targetType: 'donation-campaign',
        targetId: String(id),
        description: `Deleted campaign ${String(id)}`
      });
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to remove donation campaign.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donation-pending' && request.method === 'GET') {
    await reconcilePaidPendingDonations();
    const data = await getPendingDonations();
    sendJson(response, 200, { ok: true, data });
    return;
  }

  if (requestUrl.pathname === '/api/donation-pending/latest' && request.method === 'GET') {
    await reconcilePaidPendingDonations();
    const list = await getPendingDonations();
    sendJson(response, 200, { ok: true, data: list[0] || null });
    return;
  }

  if (requestUrl.pathname === '/api/donation-pending' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, [
        'id', 'campaignId', 'campaignName', 'donorName', 'donorEmail', 'donorPhone', 'amount', 'amountCents', 'frequency', 'paymentProvider',
        'sessionId', 'paymentIntentId', 'checkoutUrl', 'origin', 'donationPurpose', 'createdAt', 'metadata'
      ]);
      readStringField(body, 'id', { max: 160, pattern: simpleIdPattern });
      readNumberField(body, 'campaignId', { integer: true, min: 1, max: 1000000000 });
      readStringField(body, 'campaignName', { max: 180 });
      readStringField(body, 'donorName', { max: 140 });
      readEmailField(body, 'donorEmail', { required: false });
      readPhoneField(body, 'donorPhone');
      readNumberField(body, 'amount', { min: 0.01, max: 500000 });
      readNumberField(body, 'amountCents', { integer: true, min: 1, max: 50000000 });
      readStringField(body, 'frequency', { max: 40 });
      readStringField(body, 'paymentProvider', { max: 40 });
      readStringField(body, 'sessionId', { max: 180 });
      readStringField(body, 'paymentIntentId', { max: 180 });
      const checkoutUrl = readStringField(body, 'checkoutUrl', { max: 2000 });
      if (checkoutUrl) {
        assertInput(/^https?:\/\//i.test(checkoutUrl), 'checkoutUrl must be a valid http/https URL.');
      }
      const origin = readStringField(body, 'origin', { max: 300 });
      if (origin) {
        assertInput(/^https?:\/\//i.test(origin), 'origin must be a valid http/https URL.');
      }
      readStringField(body, 'donationPurpose', { max: 240 });
      const createdAt = readStringField(body, 'createdAt', { max: 64 });
      if (createdAt) {
        assertInput(!Number.isNaN(new Date(createdAt).getTime()), 'createdAt must be a valid ISO date string.');
      }
      const metadata = readObjectField(body, 'metadata');
      if (metadata) {
        validateGenericJsonValue(metadata, 'metadata', 0);
      }
      const data = await createPendingDonation(body);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to create pending donation.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/donation-pending' && request.method === 'DELETE') {
    try {
      const data = await clearPendingDonations();
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: error.message || 'Unable to clear pending donations.' });
    }
    return;
  }

  const pendingIdMatch = requestUrl.pathname.match(/^\/api\/donation-pending\/([^/]+)$/);
  if (pendingIdMatch && request.method === 'DELETE') {
    try {
      const id = parseStringPathId(decodeURIComponent(pendingIdMatch[1]), 'pending id');
      const data = await removePendingDonation(id);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to remove pending donation.' });
    }
    return;
  }

  if (requestUrl.pathname === '/api/users' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, data: readUsers() });
    return;
  }

  if (requestUrl.pathname === '/api/users/by-email' && request.method === 'GET') {
    const email = String(requestUrl.searchParams.get('email') || '').trim().toLowerCase();
    if (!email || !emailPattern.test(email)) {
      sendJson(response, 400, { ok: false, message: 'email query param must be a valid email.' });
      return;
    }
    sendJson(response, 200, { ok: true, data: getUserByEmail(email) });
    return;
  }

  if (requestUrl.pathname === '/api/users/upsert-by-email' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['id', 'name', 'role', 'email', 'phone', 'address', 'memberType', 'authProvider', 'avatarUrl', 'picture', 'registrationComplete', 'isActive', 'approvalStatus', 'approvalUpdatedAt', 'adminPageAccess']);
      readStringField(body, 'id', { max: 120, pattern: simpleIdPattern });
      readStringField(body, 'name', { max: 140 });
      readStringField(body, 'role', { max: 40 });
      readEmailField(body, 'email', { required: true });
      readPhoneField(body, 'phone');
      readStringField(body, 'address', { max: 240 });
      readStringField(body, 'memberType', { max: 40 });
      readStringField(body, 'authProvider', { max: 40 });
      readStringField(body, 'avatarUrl', { max: 600 });
      readStringField(body, 'picture', { max: 600 });
      readBooleanField(body, 'registrationComplete');
      readBooleanField(body, 'isActive');
      readStringField(body, 'approvalStatus', { max: 20 });
      readStringField(body, 'approvalUpdatedAt', { max: 64 });
      const adminPageAccess = readArrayField(body, 'adminPageAccess', { max: 50 });
      if (adminPageAccess) {
        adminPageAccess.forEach((entry, index) => {
          assertInput(typeof entry === 'string', `adminPageAccess[${index}] must be a string.`);
          assertInput(ADMIN_PAGE_PATHS.includes(String(entry).trim()), `adminPageAccess[${index}] is not an allowed path.`);
        });
      }
      const data = upsertUserByEmail(body);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to upsert user.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/users/complete-registration' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['email', 'name', 'phone', 'address', 'role', 'memberType', 'avatarUrl']);
      readEmailField(body, 'email', { required: true });
      readStringField(body, 'name', { min: 2, max: 140 });
      readPhoneField(body, 'phone');
      readStringField(body, 'address', { max: 240 });
      readStringField(body, 'role', { max: 40 });
      readStringField(body, 'memberType', { max: 40 });
      readStringField(body, 'avatarUrl', { max: 600 });
      const data = completeUserRegistration(body);
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to complete user registration.'
      });
    }
    return;
  }

  if (requestUrl.pathname === '/api/users' && request.method === 'POST') {
    try {
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['id', 'name', 'role', 'email', 'phone', 'address', 'memberType', 'authProvider', 'avatarUrl', 'picture', 'registrationComplete', 'isActive', 'approvalStatus', 'adminPageAccess']);
      readStringField(body, 'id', { max: 120, pattern: simpleIdPattern });
      readStringField(body, 'name', { required: true, min: 2, max: 140 });
      readStringField(body, 'role', { max: 40 });
      readEmailField(body, 'email', { required: true });
      readPhoneField(body, 'phone');
      readStringField(body, 'address', { max: 240 });
      readStringField(body, 'memberType', { max: 40 });
      readStringField(body, 'authProvider', { max: 40 });
      readStringField(body, 'avatarUrl', { max: 600 });
      readStringField(body, 'picture', { max: 600 });
      readBooleanField(body, 'registrationComplete');
      readBooleanField(body, 'isActive');
      readStringField(body, 'approvalStatus', { max: 20 });
      const adminPageAccess = readArrayField(body, 'adminPageAccess', { max: 50 });
      if (adminPageAccess) {
        adminPageAccess.forEach((entry, index) => {
          assertInput(typeof entry === 'string', `adminPageAccess[${index}] must be a string.`);
          assertInput(ADMIN_PAGE_PATHS.includes(String(entry).trim()), `adminPageAccess[${index}] is not an allowed path.`);
        });
      }
      const record = normalizeUser({
        ...body,
        id: body.id || `user-${Date.now()}`,
        isActive: body.isActive !== false,
        approvalStatus: body.approvalStatus || 'pending',
        approvalUpdatedAt: new Date().toISOString()
      });
      const next = [record, ...readUsers()];
      writeUsers(next);
      sendJson(response, 200, { ok: true, data: record });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to create user.'
      });
    }
    return;
  }

  const approvalPathMatch = requestUrl.pathname.match(/^\/api\/users\/([^/]+)\/approval$/);
  if (approvalPathMatch && request.method === 'PATCH') {
    try {
      const id = parseStringPathId(decodeURIComponent(approvalPathMatch[1]), 'user id');
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: false });
      ensureNoUnknownKeys(body, ['approvalStatus']);
      const nextApprovalStatus = readStringField(body, 'approvalStatus', { required: true, max: 20, toLowerCase: true });
      assertInput(['approved', 'pending', 'rejected'].includes(nextApprovalStatus), 'approvalStatus must be approved, pending, or rejected.');
      const approvalStatus = String(body.approvalStatus || 'pending').toLowerCase();

      const currentUsers = readUsers();
      const previousUser = currentUsers.find((user) => String(user.id) === id) || null;
      const next = currentUsers.map((user) => (
        user.id !== id
          ? user
          : normalizeUser({
            ...user,
            approvalStatus,
            approvalUpdatedAt: new Date().toISOString(),
            registrationComplete: approvalStatus === 'approved' ? user.registrationComplete : false
          })
      ));

      writeUsers(next);
      const updatedUser = next.find((user) => user.id === id) || null;
      if (updatedUser && previousUser?.approvalStatus !== updatedUser.approvalStatus) {
        notifyAppUpdate({
          title: updatedUser.approvalStatus === 'approved' ? 'Member Approved' : `Member ${updatedUser.approvalStatus || 'Status Updated'}`,
          body: `${updatedUser.name || 'A member'}'s membership application is now ${updatedUser.approvalStatus}.`,
          url: '/admin/users',
          tag: 'ssm-member-approval'
        });
      }
      sendJson(response, 200, { ok: true, data: updatedUser });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to update approval status.'
      });
    }
    return;
  }

  const userPathMatch = requestUrl.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userPathMatch && request.method === 'PATCH') {
    try {
      const id = parseStringPathId(decodeURIComponent(userPathMatch[1]), 'user id');
      const body = await parseJsonObjectBody(request, { maxBytes: maxJsonBodyBytes, allowEmpty: false });
      ensureNoUnknownKeys(body, ['name', 'role', 'email', 'phone', 'address', 'memberType', 'authProvider', 'avatarUrl', 'picture', 'registrationComplete', 'isActive', 'approvalStatus', 'adminPageAccess']);
      readStringField(body, 'name', { min: 2, max: 140 });
      readStringField(body, 'role', { max: 40 });
      readEmailField(body, 'email', { required: false });
      readPhoneField(body, 'phone');
      readStringField(body, 'address', { max: 240 });
      readStringField(body, 'memberType', { max: 40 });
      readStringField(body, 'authProvider', { max: 40 });
      readStringField(body, 'avatarUrl', { max: 600 });
      readStringField(body, 'picture', { max: 600 });
      readBooleanField(body, 'registrationComplete');
      readBooleanField(body, 'isActive');
      readStringField(body, 'approvalStatus', { max: 20 });
      const adminPageAccess = readArrayField(body, 'adminPageAccess', { max: 50 });
      if (adminPageAccess) {
        adminPageAccess.forEach((entry, index) => {
          assertInput(typeof entry === 'string', `adminPageAccess[${index}] must be a string.`);
          assertInput(ADMIN_PAGE_PATHS.includes(String(entry).trim()), `adminPageAccess[${index}] is not an allowed path.`);
        });
      }
      const users = readUsers();
      const targetUser = users.find((user) => user.id === id) || null;
      assertInput(Boolean(targetUser), 'User not found.');

      const changedRoleToMember = String(targetUser?.role || '').trim().toLowerCase() !== 'member'
        && String(body?.role || '').trim().toLowerCase() === 'member';
      const validatedBody = enforceUserMembershipActivity({
        ...targetUser,
        ...body,
        ...(changedRoleToMember ? { membershipFeeRecords: [] } : {}),
        id
      }, body);

      const next = users.map((user) => (
        user.id === id ? normalizeUser({ ...user, ...validatedBody, id, createdAt: user.createdAt }) : user
      ));
      const updatedUser = next.find((user) => user.id === id) || null;

      if (targetUser?.isActive !== false && updatedUser?.isActive === false && eventsDb.hasDatabaseConnection) {
        await eventsDb.markUserRegistrationsDormant({
          userId: updatedUser.id,
          email: updatedUser.email,
          contact: updatedUser.phone
        });
      }

      writeUsers(next);
      if (targetUser.approvalStatus !== updatedUser.approvalStatus) {
        notifyAppUpdate({
          title: updatedUser.approvalStatus === 'approved' ? 'Member Approved' : `Member ${updatedUser.approvalStatus || 'Status Updated'}`,
          body: `${updatedUser.name || 'A member'}'s membership application is now ${updatedUser.approvalStatus}.`,
          url: '/admin/users',
          tag: 'ssm-member-approval'
        });
      } else if (targetUser.isActive !== updatedUser.isActive) {
        notifyAppUpdate({
          title: updatedUser.isActive === false ? 'Member Deactivated' : 'Member Reactivated',
          body: `${updatedUser.name || 'A member'}'s account was ${updatedUser.isActive === false ? 'deactivated' : 'reactivated'}.`,
          url: '/admin/users',
          tag: 'ssm-member-activity'
        });
      } else {
        notifyAppUpdate({
          title: 'Member Profile Updated',
          body: `${updatedUser.name || 'A member'}'s contact information, role, or account profile was updated.`,
          url: '/admin/users',
          tag: 'ssm-member-updated'
        });
      }
      sendJson(response, 200, { ok: true, data: updatedUser });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to update user.'
      });
    }
    return;
  }

  if (userPathMatch && request.method === 'DELETE') {
    try {
      const id = parseStringPathId(decodeURIComponent(userPathMatch[1]), 'user id');
      const users = readUsers();
      const targetUser = users.find((user) => user.id === id) || null;
      assertInput(Boolean(targetUser), 'User not found.');

      if (eventsDb.hasDatabaseConnection) {
        await eventsDb.purgeUserRegistrations({
          userId: targetUser.id,
          email: targetUser.email,
          contact: targetUser.phone,
          name: targetUser.name
        });
      }

      const next = readUsers().filter((user) => user.id !== id);
      writeUsers(next);
      notifyAppUpdate({
        title: 'Member Account Removed',
        body: `${targetUser.name || 'A member'}'s account and related registrations were removed.`,
        url: '/admin/users',
        tag: 'ssm-member-deleted'
      });
      sendJson(response, 200, { ok: true, data: { success: true } });
    } catch (error) {
      sendJson(response, error.status || 500, {
        ok: false,
        message: error.message || 'Unable to delete user.',
        details: error.details || null
      });
    }
    return;
  }

  const isApiPath = requestUrl.pathname === '/api' || requestUrl.pathname.startsWith('/api/');
  if (!isApiPath && serveProductionBuild(request, response, requestUrl.pathname)) {
    return;
  }

  sendJson(response, 404, { ok: false, message: 'Not found' });
});

const bootstrap = async () => {
  if (eventsDb.hasDatabaseConnection) {
    try {
      await eventsDb.ensureEventsSchema();
      console.log('Events database schema ready.');
    } catch (error) {
      logServerError(error, 'Failed to initialize events database');
    }
  } else {
    console.warn('Runtime database is not configured. Set PostgreSQL or MySQL connection variables for the selected DB_ENGINE.');
  }

  server.listen(port, () => {
    console.log(`${defaultOrganizationName} server listening on http://127.0.0.1:${port}`);
    if (fs.existsSync(path.join(buildDir, 'index.html'))) {
      console.log(`Serving production frontend from ${buildDir}`);
    }
  });

  const configuredTime = `${String(volunteerReminderSendTime.hour).padStart(2, '0')}:${String(volunteerReminderSendTime.minute).padStart(2, '0')}`;
  console.log(`Volunteer reminder scheduler set for ${configuredTime} (${volunteerReminderTimeZone}) daily.`);
  const eventConfiguredTime = `${String(eventReminderSendTime.hour).padStart(2, '0')}:${String(eventReminderSendTime.minute).padStart(2, '0')}`;
  console.log(`Event reminder scheduler set for ${eventConfiguredTime} (${eventReminderTimeZone}) daily.`);
  const bookingConfiguredTime = `${String(bookingReminderSendTime.hour).padStart(2, '0')}:${String(bookingReminderSendTime.minute).padStart(2, '0')}`;
  console.log(`Booking reminder scheduler set for ${bookingConfiguredTime} (${bookingReminderTimeZone}) daily at ${bookingReminderDays.join(', ')} day intervals.`);
  console.log(`Membership renewal scheduler set for ${bookingConfiguredTime} (${bookingReminderTimeZone}) daily at ${membershipReminderDays.join(', ')} day intervals.`);

  if (eventsDb.hasDatabaseConnection) {
    const socialCardsTimer = setInterval(() => {
      socialPostingService.runScheduledSweep().catch((error) => logServerError(error, 'Social card sweep failed'));
    }, 60 * 1000);
    if (typeof socialCardsTimer.unref === 'function') socialCardsTimer.unref();
  }

  // Check every minute, but only send once per day after the configured local send time.
  setInterval(() => {
    runScheduledVolunteerReminderSweep().catch((error) => {
      logServerError(error, 'Volunteer reminder sweep failed');
    });
  }, 60 * 1000);

  // Run one immediate scheduler check on startup in case the server starts after today's send time.
  runScheduledVolunteerReminderSweep().catch((error) => {
    logServerError(error, 'Initial volunteer reminder scheduler check failed');
  });

  // Event reminders use the same minute cadence but maintain their own send window and dedupe log.
  setInterval(() => {
    runScheduledEventReminderSweep().catch((error) => {
      logServerError(error, 'Event reminder sweep failed');
    });
  }, 60 * 1000);

  runScheduledEventReminderSweep().catch((error) => {
    logServerError(error, 'Initial event reminder scheduler check failed');
  });

  setInterval(() => {
    runScheduledBookingReminderSweep().catch((error) => {
      logServerError(error, 'Booking reminder sweep failed');
    });
  }, 60 * 1000);

  runScheduledBookingReminderSweep().catch((error) => {
    logServerError(error, 'Initial booking reminder scheduler check failed');
  });

  setInterval(() => {
    runScheduledMembershipReminderSweep().catch((error) => {
      logServerError(error, 'Membership renewal reminder sweep failed');
    });
  }, 60 * 1000);

  runScheduledMembershipReminderSweep().catch((error) => {
    logServerError(error, 'Initial membership renewal reminder scheduler check failed');
  });

  const zeffyReconciliationTimer = setInterval(() => {
    reconcileZeffyDonations().catch((error) => {
      logServerError(error, 'Zeffy donation reconciliation failed');
    });
  }, 60 * 1000);
  if (typeof zeffyReconciliationTimer.unref === 'function') {
    zeffyReconciliationTimer.unref();
  }

  reconcileZeffyDonations({ force: true }).then((result) => {
    if (result.imported > 0) {
      console.log(`Imported ${result.imported} missing Zeffy donation(s).`);
    }
  }).catch((error) => {
    logServerError(error, 'Initial Zeffy donation reconciliation failed');
  });
};

bootstrap();
