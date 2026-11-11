import { serviceResponse } from './serviceResponse';
import contentApiService from './contentApiService';
import { siteConfig } from '../constants/siteConfig';

const RESOURCE = 'subscribers';
const NEWSLETTER_RESOURCE = 'newsletter_campaigns';
const NEWSLETTER_TOPICS_RESOURCE = 'newsletter_topics';

const DEFAULT_NEWSLETTER_TOPICS = [
  'Events and updates',
  'Seva opportunities',
  'Youth and kids programs',
  'Langar and community services',
  'Volunteer and donation campaigns',
  'All announcements'
];

const normalizeTopicName = (value = '') => String(value || '').trim().replace(/\s+/g, ' ');

const normalizeEmailAddress = (value = '') => {
  const email = String(value || '').trim().toLowerCase();
  if (!email || email === 'null' || email === 'undefined') {
    return '';
  }

  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return valid ? email : '';
};

const uniqueTopics = (topics = []) => {
  const seen = new Set();
  return (Array.isArray(topics) ? topics : [])
    .map((topic) => normalizeTopicName(topic))
    .filter((topic) => {
      if (!topic) {
        return false;
      }
      const key = topic.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
};

const normalizeInterestTopics = (value) => {
  if (Array.isArray(value)) {
    return uniqueTopics(value);
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return [];
  }

  return uniqueTopics(raw.split(/[\n;,|]/g).map((entry) => entry.trim()));
};

const interestsToCsv = (topics = []) => uniqueTopics(topics).join(', ');

const subscriberHasTopic = (subscriber = {}, topicName = '') => {
  const normalizedTopic = normalizeTopicName(topicName).toLowerCase();
  if (!normalizedTopic) {
    return true;
  }

  const subscriberTopics = normalizeInterestTopics(subscriber?.interestsList?.length
    ? subscriber.interestsList
    : subscriber?.interests);
  const topicSet = new Set(subscriberTopics.map((entry) => entry.toLowerCase()));
  if (normalizedTopic === 'all announcements') {
    return true;
  }

  if (topicSet.has(normalizedTopic)) {
    return true;
  }
  return false;
};

const normalizeWeekIso = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
};

const isWithinCampaignWeekWindow = (record = {}) => {
  const weekStart = normalizeWeekIso(record?.weekStart || '');
  const weekEnd = normalizeWeekIso(record?.weekEnd || '');
  if (!weekStart || !weekEnd) {
    return false;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  return todayIso >= weekStart && todayIso <= weekEnd;
};

const isLifecycleInactive = (record = {}) => {
  const explicit = String(record?.lifecycleStatus || '').trim().toLowerCase();
  if (explicit === 'inactive') {
    return true;
  }

  const weekEnd = normalizeWeekIso(record?.weekEnd || '');
  if (!weekEnd) {
    return false;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  return weekEnd < todayIso;
};

const normalizeSubscriber = (item = {}, index = 0) => ({
  interestsList: normalizeInterestTopics(item.interestsList?.length ? item.interestsList : item.interests),
  id: item.id || `sub-${Date.now()}-${index}`,
  name: item.name || '',
  email: normalizeEmailAddress(item.email),
  interests: interestsToCsv(normalizeInterestTopics(item.interestsList?.length ? item.interestsList : item.interests)) || 'Events and updates',
  source: item.source || 'Website',
  createdAt: item.createdAt || new Date().toISOString(),
  active: item.active !== false,
  userId: item.userId || ''
});

const normalizeCampaign = (item = {}, index = 0) => ({
  id: item.id || `newsletter-${Date.now()}-${index}`,
  title: String(item.title || '').trim(),
  subject: String(item.subject || item.title || '').trim(),
  body: String(item.body || '').trim(),
  bodyHtml: String(item.bodyHtml || item.body || '').trim(),
  status: String(item.status || 'draft').trim().toLowerCase(),
  lifecycleStatus: isLifecycleInactive(item) ? 'inactive' : 'active',
  topic: normalizeTopicName(item.topic || ''),
  weekStart: normalizeWeekIso(item.weekStart || ''),
  weekEnd: normalizeWeekIso(item.weekEnd || ''),
  recipientsCount: Number(item.recipientsCount || 0),
  sentAt: String(item.sentAt || '').trim(),
  createdAt: String(item.createdAt || new Date().toISOString()),
  updatedAt: String(item.updatedAt || new Date().toISOString()),
  errorReason: String(item.errorReason || '').trim()
});

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const toNewsletterLogoUrl = () => {
  const configured = String(process.env.REACT_APP_NEWSLETTER_LOGO_URL || '').trim();
  if (configured) {
    return configured;
  }

  if (typeof window !== 'undefined' && window?.location?.origin) {
    return `${window.location.origin}/default-gurdwara.svg`;
  }

  return '';
};

const toNewsletterAssetBaseUrl = () => {
  const configured = String(
    process.env.REACT_APP_NEWSLETTER_ASSET_BASE_URL
    || process.env.REACT_APP_PUBLIC_SITE_URL
    || process.env.REACT_APP_SITE_URL
    || siteConfig.baseUrl
    || ''
  ).trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window?.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }

  return '';
};

const toAbsoluteNewsletterAssetUrl = (value = '', baseUrl = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (/^(data:|cid:|mailto:|tel:|#)/i.test(raw)) {
    return raw;
  }

  if (/^https?:\/\//i.test(raw)) {
    const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;
    if (!localhostPattern.test(raw)) {
      return raw;
    }

    if (!baseUrl) {
      return raw;
    }

    try {
      const parsed = new URL(raw);
      return `${baseUrl}${parsed.pathname || ''}${parsed.search || ''}${parsed.hash || ''}`;
    } catch {
      return raw;
    }
  }

  if (!baseUrl) {
    return raw;
  }

  if (raw.startsWith('/')) {
    return `${baseUrl}${raw}`;
  }

  return `${baseUrl}/${raw.replace(/^\.\//, '')}`;
};

const escapeRegExp = (value = '') => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, Math.min(index + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const resolveImageExtensionFromMime = (mime = '') => {
  const normalized = String(mime || '').trim().toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('svg')) return 'svg';
  return 'img';
};

const extractImageSourcesFromHtml = (html = '') => {
  const sources = [];
  const matches = String(html || '').matchAll(/<img\b[^>]*\bsrc\s*=\s*(['"])(.*?)\1/gi);
  for (const match of matches) {
    const src = String(match?.[2] || '').trim();
    if (src) {
      sources.push(src);
    }
  }
  return Array.from(new Set(sources));
};

const shouldInlineNewsletterImageSource = (src = '') => {
  const value = String(src || '').trim();
  if (!value) {
    return false;
  }
  if (/^(cid:|mailto:|tel:|#)/i.test(value)) {
    return false;
  }
  if (/^data:image\//i.test(value)) {
    return false;
  }
  if (value.startsWith('/')) {
    return true;
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(value)) {
    return true;
  }
  return false;
};

const inlineNewsletterImagesForEmail = async (html = '') => {
  let nextHtml = String(html || '').trim();
  if (!nextHtml) {
    return { html: '', attachments: [] };
  }

  const sources = extractImageSourcesFromHtml(nextHtml).filter((src) => shouldInlineNewsletterImageSource(src));
  if (sources.length === 0) {
    return { html: nextHtml, attachments: [] };
  }

  const baseUrl = toNewsletterAssetBaseUrl();
  const attachments = [];

  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const fetchUrl = toAbsoluteNewsletterAssetUrl(source, baseUrl);
    if (!/^https?:\/\//i.test(fetchUrl)) {
      continue;
    }

    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        continue;
      }

      const contentType = String(response.headers.get('content-type') || '').trim().toLowerCase();
      if (!contentType.startsWith('image/')) {
        continue;
      }

      const contentBase64 = arrayBufferToBase64(await response.arrayBuffer());
      const extension = resolveImageExtensionFromMime(contentType);
      const contentId = `newsletter-image-${Date.now()}-${index}@singhsabha`;
      attachments.push({
        filename: `newsletter-image-${index + 1}.${extension}`,
        contentType,
        content: contentBase64,
        contentId,
        disposition: 'inline'
      });

      const sourcePattern = escapeRegExp(source);
      const replaceRegex = new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*['"])${sourcePattern}(['"][^>]*>)`, 'gi');
      nextHtml = nextHtml.replace(replaceRegex, `$1cid:${contentId}$2`);
    } catch {
      // Best-effort inline conversion; keep original URL when fetch fails.
    }
  }

  return {
    html: nextHtml,
    attachments
  };
};

const normalizeNewsletterBodyHtmlForEmail = (html = '') => {
  const assetBaseUrl = toNewsletterAssetBaseUrl();
  const rawHtml = String(html || '').trim();
  if (!rawHtml) {
    return '';
  }

  return rawHtml.replace(/<img\b[^>]*>/gi, (tag) => {
    let nextTag = tag;

    nextTag = nextTag.replace(/src\s*=\s*(['"])(.*?)\1/i, (match, quote, srcValue) => {
      const normalizedSrc = toAbsoluteNewsletterAssetUrl(srcValue, assetBaseUrl);
      return `src=${quote}${escapeHtml(normalizedSrc)}${quote}`;
    });

    if (/style\s*=\s*['"]/i.test(nextTag)) {
      nextTag = nextTag.replace(/style\s*=\s*(['"])(.*?)\1/i, (match, quote, styleValue) => {
        const mergedStyle = `${String(styleValue || '').trim().replace(/;?\s*$/, ';')}max-width:100%;height:auto;display:block;margin:12px auto;`;
        return `style=${quote}${mergedStyle}${quote}`;
      });
    } else {
      nextTag = nextTag.replace('<img', '<img style="max-width:100%;height:auto;display:block;margin:12px auto;"');
    }

    return nextTag;
  });
};

const buildNewsletterEmailHtml = (campaign = {}) => {
  const logoUrl = toNewsletterLogoUrl();
  const topic = normalizeTopicName(campaign.topic || '') || 'Newsletter Update';
  const title = String(campaign.title || `${siteConfig.shortName || 'Your Gurdwara'} Newsletter`).trim();
  const contentHtml = normalizeNewsletterBodyHtmlForEmail(String(campaign.bodyHtml || '').trim())
    || `<p>${escapeHtml(String(campaign.body || '').trim())}</p>`;

  return `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoUrl ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(siteConfig.shortName || 'Gurdwara')} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(siteConfig.shortName || 'Your Gurdwara')}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Newsletter Bulletin</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 8px;text-align:center;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;background:#f8fafc;border:1px solid #dbe7f6;border-radius:10px;">
            <tr>
              <td style="padding:6px 8px 6px 10px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;white-space:nowrap;vertical-align:middle;">Topic</td>
              <td style="padding:6px 10px 6px 0;font-size:14px;font-weight:700;line-height:1.4;color:#0a4d9f;white-space:normal;vertical-align:middle;">${escapeHtml(topic)}</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:8px 24px 0;">
          <div style="font-size:21px;line-height:1.35;font-weight:800;color:#0f172a;text-align:center;">${escapeHtml(title)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:18px 24px 26px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:16px;font-size:15px;line-height:1.8;color:#334155;">
            ${contentHtml}
          </div>
        </td>
      </tr>
    </table>
  </div>`;
};

const toPublicBaseUrl = () => {
  const configured = String(
    process.env.REACT_APP_PUBLIC_SITE_URL ||
    process.env.REACT_APP_SITE_URL ||
    siteConfig.baseUrl ||
    ''
  ).trim();

  if (configured) {
    return configured.replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined' && window?.location?.origin) {
    return String(window.location.origin).replace(/\/+$/, '');
  }

  return 'https://example.org';
};

const buildApprovalEmailHtml = (user = {}) => {
  const logoUrl = toNewsletterLogoUrl();
  const baseUrl = toPublicBaseUrl();
  const loginUrl = `${baseUrl}/login`;
  const homeUrl = `${baseUrl}/`;
  const contactUrl = `${baseUrl}/contact`;
  const memberName = String(user?.name || 'Member').trim();
  const safeMemberName = escapeHtml(memberName);
  const safeBaseUrl = escapeHtml(baseUrl);
  const safeLoginUrl = escapeHtml(loginUrl);
  const safeHomeUrl = escapeHtml(homeUrl);
  const safeContactUrl = escapeHtml(contactUrl);
  const supportEmail = escapeHtml(String(siteConfig?.contact?.email || '').trim());
  const supportPhone = escapeHtml(String(siteConfig?.contact?.phone || '').trim());
  const supportAddress = escapeHtml(String(siteConfig?.contact?.address || '').trim());

  return `
  <div style="background:#f5f8fc;padding:28px 14px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #dbe7f6;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="padding:16px 22px;background:linear-gradient(90deg,#0a4d9f,#0b67c2,#e58b16);color:#ffffff;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    ${logoUrl ? `<td style="width:44px;padding-right:12px;vertical-align:middle;"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(siteConfig.shortName || 'Gurdwara')} logo" width="44" height="44" style="display:block;border-radius:9999px;background:#ffffff;object-fit:cover;"/></td>` : ''}
                    <td style="vertical-align:middle;">
                      <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">${escapeHtml(siteConfig.shortName || 'Your Gurdwara')}</div>
                      <div style="font-size:18px;font-weight:800;line-height:1.3;margin-top:2px;">Registration Approved</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:24px 24px 14px;">
          <div style="font-size:22px;line-height:1.35;font-weight:800;color:#0f172a;">Welcome, ${safeMemberName}.</div>
          <div style="margin-top:12px;font-size:15px;line-height:1.8;color:#334155;">
            Your registration has been approved. Your Member account becomes active when a current membership fee is recorded as paid. You can sign in to review your profile and stay connected with the sangat.
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:0 24px 12px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:8px;background:#0b67c2;text-align:center;">
                <a href="${safeLoginUrl}" style="display:inline-block;padding:12px 20px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">Sign In To Your Account</a>
              </td>
              <td style="width:10px;">&nbsp;</td>
              <td style="border-radius:8px;background:#eef5ff;border:1px solid #cfe1fb;text-align:center;">
                <a href="${safeHomeUrl}" style="display:inline-block;padding:12px 20px;color:#0a4d9f;text-decoration:none;font-size:14px;font-weight:700;">Visit Website</a>
              </td>
            </tr>
          </table>
          <div style="margin-top:14px;font-size:13px;line-height:1.7;color:#475569;">
            If the button does not open, copy and paste this link into your browser:<br/>
            <a href="${safeLoginUrl}" style="color:#0b67c2;text-decoration:underline;word-break:break-all;">${safeLoginUrl}</a>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px 24px;">
          <div style="border-top:1px solid #e2e8f0;padding-top:14px;font-size:12px;line-height:1.8;color:#64748b;">
            <div style="font-weight:700;color:#334155;">Need help?</div>
            ${supportEmail ? `<div>Email: <a href="mailto:${supportEmail}" style="color:#0b67c2;text-decoration:none;">${supportEmail}</a></div>` : ''}
            ${supportPhone ? `<div>Phone: <a href="tel:${supportPhone.replace(/\s+/g, '')}" style="color:#0b67c2;text-decoration:none;">${supportPhone}</a></div>` : ''}
            ${supportAddress ? `<div>Address: ${supportAddress}</div>` : ''}
            <div>Contact Page: <a href="${safeContactUrl}" style="color:#0b67c2;text-decoration:none;">${safeContactUrl}</a></div>
            <div style="margin-top:8px;">${escapeHtml(siteConfig.shortName || 'Your Gurdwara')} | ${safeBaseUrl}</div>
          </div>
        </td>
      </tr>
    </table>
  </div>`;
};

const notificationService = {
  getNewsletterTopics: async () => {
    const stored = await contentApiService.getSingleton(NEWSLETTER_TOPICS_RESOURCE, null);
    const storedTopics = Array.isArray(stored)
      ? stored
      : (Array.isArray(stored?.topics) ? stored.topics : []);
    const topics = uniqueTopics([...DEFAULT_NEWSLETTER_TOPICS, ...storedTopics]);

    if (topics.length !== storedTopics.length) {
      await contentApiService.setSingleton(NEWSLETTER_TOPICS_RESOURCE, {
        topics,
        updatedAt: new Date().toISOString()
      });
    }

    return serviceResponse(topics);
  },

  addNewsletterTopic: async (topicName) => {
    const topic = normalizeTopicName(topicName);
    if (!topic) {
      return serviceResponse([]);
    }

    const current = await notificationService.getNewsletterTopics().then((res) => res.data || []);
    const topics = uniqueTopics([...current, topic]);
    await contentApiService.setSingleton(NEWSLETTER_TOPICS_RESOURCE, {
      topics,
      updatedAt: new Date().toISOString()
    });
    return serviceResponse(topics);
  },

  subscribe: async (payload) => {
    const existing = await contentApiService.list(RESOURCE);
    const normalizedEmail = String(payload?.email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      throw new Error('Valid email address is required.');
    }

    const duplicate = existing.find((entry) => String(entry?.email || '').trim().toLowerCase() === normalizedEmail);

    const selectedTopics = uniqueTopics([
      ...normalizeInterestTopics(payload?.interests),
      ...normalizeInterestTopics(payload?.customTopic)
    ]);

    if (selectedTopics.length === 0) {
      throw new Error('Please select at least one topic.');
    }

    if (selectedTopics.length > 0) {
      await Promise.all(selectedTopics.map((topic) => notificationService.addNewsletterTopic(topic)));
    }

    if (duplicate?.id) {
      const existingRecord = normalizeSubscriber(duplicate);
      const mergedTopics = uniqueTopics([
        ...normalizeInterestTopics(existingRecord.interestsList?.length ? existingRecord.interestsList : existingRecord.interests),
        ...selectedTopics
      ]);

      if (mergedTopics.length > 0) {
        await Promise.all(mergedTopics.map((topic) => notificationService.addNewsletterTopic(topic)));
      }

      const updatedRecord = normalizeSubscriber({
        ...duplicate,
        id: duplicate.id,
        name: String(payload?.name || existingRecord.name || '').trim(),
        email: normalizedEmail,
        interestsList: mergedTopics,
        interests: interestsToCsv(mergedTopics),
        source: payload?.source || existingRecord.source,
        createdAt: duplicate.createdAt || existingRecord.createdAt,
        updatedAt: new Date().toISOString(),
        active: true
      });
      const updated = await contentApiService.update(RESOURCE, duplicate.id, updatedRecord);
      return serviceResponse(normalizeSubscriber(updated || updatedRecord));
    }

    const record = normalizeSubscriber({
      id: `sub-${Date.now()}`,
      name: payload?.name,
      email: normalizedEmail,
      interestsList: selectedTopics,
      interests: interestsToCsv(selectedTopics),
      source: payload?.source,
      createdAt: new Date().toISOString(),
      active: true
    });

    const created = await contentApiService.create(RESOURCE, record);
    return serviceResponse(normalizeSubscriber(created || record));
  },

  getSubscribers: async () => {
    const rows = await contentApiService.list(RESOURCE);
    return serviceResponse(rows.map((item, index) => normalizeSubscriber(item, index)));
  },

  updateSubscriber: async (subscriberId, payload = {}) => {
    const id = String(subscriberId || '').trim();
    if (!id) {
      throw new Error('Subscriber id is required.');
    }

    const existingRows = await contentApiService.list(RESOURCE);
    const existing = existingRows.find((entry) => String(entry?.id || '').trim() === id);
    if (!existing) {
      throw new Error('Subscriber not found.');
    }

    const merged = normalizeSubscriber({
      ...existing,
      ...payload,
      interestsList: normalizeInterestTopics(payload?.interestsList?.length ? payload.interestsList : payload?.interests),
      interests: interestsToCsv(normalizeInterestTopics(payload?.interestsList?.length ? payload.interestsList : payload?.interests)) || payload?.interests,
      id,
      updatedAt: new Date().toISOString()
    });

    if (!merged.email) {
      throw new Error('Subscriber must have a valid email address.');
    }

    const updated = await contentApiService.update(RESOURCE, id, merged);
    return serviceResponse(normalizeSubscriber(updated || merged));
  },

  getNewsletterCampaigns: async () => {
    const rows = await contentApiService.list(NEWSLETTER_RESOURCE);
    const normalized = rows.map((item, index) => normalizeCampaign(item, index));

    const updates = normalized
      .filter((entry) => entry.lifecycleStatus === 'inactive' && String(entry.status || '') !== 'inactive')
      .map((entry) => contentApiService.update(NEWSLETTER_RESOURCE, entry.id, {
        ...entry,
        status: 'inactive',
        updatedAt: new Date().toISOString()
      }));

    if (updates.length > 0) {
      await Promise.all(updates);
      const refreshed = await contentApiService.list(NEWSLETTER_RESOURCE);
      const nextRows = refreshed.map((item, index) => normalizeCampaign(item, index));
      nextRows.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
      return serviceResponse(nextRows);
    }

    normalized.sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
    return serviceResponse(normalized);
  },

  createNewsletterCampaign: async (payload) => {
    const record = normalizeCampaign({
      id: `newsletter-${Date.now()}`,
      title: payload?.title,
      subject: payload?.subject,
      body: payload?.body,
      bodyHtml: payload?.bodyHtml || payload?.body,
      topic: payload?.topic,
      weekStart: payload?.weekStart,
      weekEnd: payload?.weekEnd,
      lifecycleStatus: String(payload?.lifecycleStatus || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active',
      status: String(payload?.status || 'draft').trim().toLowerCase() || 'draft',
      recipientsCount: 0,
      sentAt: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      errorReason: ''
    });

    const created = await contentApiService.create(NEWSLETTER_RESOURCE, record);

    if (record.topic) {
      await notificationService.addNewsletterTopic(record.topic);
    }

    return serviceResponse(normalizeCampaign(created || record));
  },

  updateNewsletterCampaign: async (campaignId, payload = {}) => {
    const id = String(campaignId || '').trim();
    if (!id) {
      throw new Error('Newsletter campaign id is required.');
    }

    const existingRows = await contentApiService.list(NEWSLETTER_RESOURCE);
    const existing = existingRows.find((entry) => String(entry?.id || '').trim() === id);
    if (!existing) {
      throw new Error('Newsletter campaign not found.');
    }

    const merged = normalizeCampaign({
      ...existing,
      ...payload,
      id,
      updatedAt: new Date().toISOString()
    });

    const updated = await contentApiService.update(NEWSLETTER_RESOURCE, id, merged);

    if (merged.topic) {
      await notificationService.addNewsletterTopic(merged.topic);
    }

    return serviceResponse(normalizeCampaign(updated || merged));
  },

  deleteNewsletterCampaign: async (campaignId) => {
    const id = String(campaignId || '').trim();
    if (!id) {
      throw new Error('Newsletter campaign id is required.');
    }

    await contentApiService.remove(NEWSLETTER_RESOURCE, id);
    const rows = await contentApiService.list(NEWSLETTER_RESOURCE);
    return serviceResponse(rows.map((item, index) => normalizeCampaign(item, index)));
  },

  sendNewsletterCampaign: async (campaignId) => {
    const campaigns = await contentApiService.list(NEWSLETTER_RESOURCE);
    const campaign = campaigns.find((entry) => String(entry?.id || '') === String(campaignId || ''));
    if (!campaign) {
      throw new Error('Newsletter campaign not found.');
    }

    const subscribers = await contentApiService.list(RESOURCE);
    const activeSubscribers = subscribers
      .map((entry, index) => normalizeSubscriber(entry, index))
      .filter((entry) => entry.active !== false && entry.email && subscriberHasTopic(entry, campaign?.topic));

    if (activeSubscribers.length === 0) {
      throw new Error('No active subscribers found for this topic.');
    }

    if (isLifecycleInactive(campaign) || String(campaign?.status || '').trim().toLowerCase() === 'inactive') {
      throw new Error('Campaign is inactive and cannot be sent.');
    }

    if (!isWithinCampaignWeekWindow(campaign)) {
      throw new Error('Campaign can be sent only during its selected week.');
    }

    const recipients = [...new Set(activeSubscribers
      .map((entry) => normalizeEmailAddress(entry.email))
      .filter(Boolean))];

    if (recipients.length === 0) {
      throw new Error('No valid recipient email addresses found.');
    }
    const deliveryUrl = String(
      process.env.REACT_APP_WEBHOOK_URL ||
      process.env.REACT_APP_NEWSLETTER_WEBHOOK_URL ||
      process.env.REACT_APP_APPROVAL_EMAIL_WEBHOOK_URL ||
      '/api/internal/mail-relay'
    ).trim();

    let status = 'sent';
    let errorReason = '';
    let sentAt = new Date().toISOString();
    const wrappedBodyHtml = buildNewsletterEmailHtml(campaign);
    const preparedEmail = await inlineNewsletterImagesForEmail(wrappedBodyHtml);

    try {
      const response = await fetch(deliveryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'newsletter',
          campaignId: campaign.id,
          bcc: recipients.join(','),
          bccList: recipients,
          bccRecipients: recipients,
          title: campaign.title,
          subject: campaign.subject || campaign.title || `${siteConfig.shortName || 'Your Gurdwara'} Newsletter`,
          body: preparedEmail.html,
          html: preparedEmail.html,
          message: preparedEmail.html,
          content: preparedEmail.html,
          bodyText: campaign.body || '',
          text: campaign.body || '',
          bodyHtml: preparedEmail.html,
          rawBodyHtml: campaign.bodyHtml || campaign.body,
          attachments: preparedEmail.attachments,
          topic: campaign.topic || '',
          weekStart: campaign.weekStart || '',
          weekEnd: campaign.weekEnd || '',
          recipients
        })
      });

      if (!response.ok) {
        status = 'failed';
        errorReason = 'webhook_error';
        sentAt = '';
      }
    } catch {
      status = 'failed';
      errorReason = 'network_error';
      sentAt = '';
    }

    const updatedRecord = normalizeCampaign({
      ...campaign,
      status,
      recipientsCount: recipients.length,
      sentAt,
      updatedAt: new Date().toISOString(),
      errorReason
    });

    const updated = await contentApiService.update(NEWSLETTER_RESOURCE, campaign.id, updatedRecord);
    return serviceResponse(normalizeCampaign(updated || updatedRecord));
  },

  sendApprovalEmail: async (user) => {
    const targetEmail = String(user?.email || '').trim().toLowerCase();
    if (!targetEmail) {
      return serviceResponse({ sent: false, reason: 'missing_email' });
    }

    const deliveryUrl = String(
      process.env.REACT_APP_WEBHOOK_URL ||
      process.env.REACT_APP_APPROVAL_EMAIL_WEBHOOK_URL ||
      '/api/internal/mail-relay'
    ).trim();

    const approvalBodyHtml = buildApprovalEmailHtml(user);
    const plainMessage = 'Your registration has been approved. Your Member account becomes active when a current membership fee is recorded as paid.';

    const payload = {
      type: 'approval',
      to: targetEmail,
      name: user?.name || 'Member',
      subject: 'Registration approved - membership payment status',
      message: plainMessage,
      text: plainMessage,
      bodyText: plainMessage,
      html: approvalBodyHtml,
      bodyHtml: approvalBodyHtml,
      body: approvalBodyHtml,
      content: approvalBodyHtml,
      attachments: [],
      approvedAt: new Date().toISOString()
    };

    try {
      const response = await fetch(deliveryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        return serviceResponse({ sent: false, reason: 'webhook_error' });
      }

      return serviceResponse({ sent: true });
    } catch {
      return serviceResponse({ sent: false, reason: 'network_error' });
    }
  },

  removeSubscriber: async (id) => {
    await contentApiService.remove(RESOURCE, id);
    const rows = await contentApiService.list(RESOURCE);
    return serviceResponse(rows.map((item, index) => normalizeSubscriber(item, index)));
  }
};

export default notificationService;
