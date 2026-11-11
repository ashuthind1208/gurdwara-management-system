const sanitizeStreamUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return '';
  }

  return trimmed.replace(/[;\s]+$/, '');
};

const darbarSahibStreamProxyUrl = '/api/streaming/darbar-sahib/audio';

const normalizeDarbarSahibStreamUrl = (value = '') => {
  const sanitized = sanitizeStreamUrl(value);
  if (!sanitized) {
    return darbarSahibStreamProxyUrl;
  }

  if (sanitized.startsWith('/api/streaming/darbar-sahib/')) {
    return darbarSahibStreamProxyUrl;
  }

  if (/live\.sgpc\.net|sgpc\.net/i.test(sanitized)) {
    return darbarSahibStreamProxyUrl;
  }

  return sanitized;
};

export const siteConfig = {
  name: String(process.env.REACT_APP_ORGANIZATION_NAME || 'Your Gurdwara').trim(),
  shortName: String(process.env.REACT_APP_ORGANIZATION_SHORT_NAME || process.env.REACT_APP_ORGANIZATION_NAME || 'Your Gurdwara').trim(),
  baseUrl: String(process.env.REACT_APP_PUBLIC_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).trim().replace(/\/+$/, ''),
  description: String(process.env.REACT_APP_SITE_DESCRIPTION || 'A digital platform for Gurdwara services, community programs, education, and donations.').trim(),
  contact: {
    phone: String(process.env.REACT_APP_CONTACT_PHONE || '').trim(),
    email: String(process.env.REACT_APP_CONTACT_EMAIL || '').trim(),
    address: String(process.env.REACT_APP_CONTACT_ADDRESS || '').trim()
  },
  social: {
    youtube: String(process.env.REACT_APP_YOUTUBE_URL || '').trim(),
    facebook: String(process.env.REACT_APP_FACEBOOK_URL || '').trim(),
    instagram: String(process.env.REACT_APP_INSTAGRAM_URL || '').trim()
  },
  liveKirtanStreamUrl: normalizeDarbarSahibStreamUrl(
    process.env.REACT_APP_DARBAR_SAHIB_STREAM_URL ||
    darbarSahibStreamProxyUrl
  ),
  calendarSourceUrl: String(
    process.env.REACT_APP_SIKHNET_GURPURAB_CALENDAR_URL ||
    'https://sikhnet.com/pages/sikh-gurpurab-calendar'
  ).trim()
};

export const userRoles = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  FAMILY: 'Family',
  MEMBER: 'Member',
  VOLUNTEER: 'Volunteer'
};
