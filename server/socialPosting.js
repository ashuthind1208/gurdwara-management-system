const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cards = require('./socialCards');

const SETTINGS_RESOURCE = 'social_card_settings';
const LOG_RESOURCE = 'social_post_log';
const HUKAMNAMA_RESOURCE = 'hukamnama_ssm_hukamnama_entries';
const GRAPH_BASE = 'https://graph.facebook.com/v20.0';
const MAX_LOG_ITEMS = 200;
const RENDER_CACHE_LIMIT = 16;
const NAMING_HEADING_TYPES = new Set([1, 2]);
const HUKAMNAMA_MODES = new Set(['off', 'onSave', 'scheduled']);

const DEFAULT_SETTINGS = {
  hukamnamaMode: 'off',
  hukamnamaTime: '07:00',
  eventAuto: false,
  instagram: true,
  facebook: true,
  whatsapp: false,
  whatsappGroup: false,
  dryRun: true
};

const readText = (value) => (typeof value === 'string' ? value.trim() : '');
const pad = (value) => String(value).padStart(2, '0');
const isDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const isTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));

const normalizeSettings = (input = {}) => {
  const merged = { ...DEFAULT_SETTINGS, ...(input || {}) };
  return {
    hukamnamaMode: HUKAMNAMA_MODES.has(input?.hukamnamaMode) ? input.hukamnamaMode : (input?.hukamnamaAuto === true ? 'onSave' : 'off'),
    hukamnamaTime: isTime(merged.hukamnamaTime) ? merged.hukamnamaTime : DEFAULT_SETTINGS.hukamnamaTime,
    eventAuto: merged.eventAuto === true,
    instagram: merged.instagram !== false,
    facebook: merged.facebook !== false,
    whatsapp: merged.whatsapp === true,
    whatsappGroup: merged.whatsappGroup === true,
    dryRun: merged.dryRun !== false
  };
};

// Reads a stored "2026-10-12T18:00" style value as-is, or converts an absolute instant into the target time zone.
const toWallClock = (value, timeZone) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const naive = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?(?::\d{2}(?:\.\d+)?)?$/);
  if (naive) {
    return { year: +naive[1], month: +naive[2], day: +naive[3], hour: naive[4] === undefined ? null : +naive[4], minute: naive[5] === undefined ? null : +naive[5] };
  }
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(instant);
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day'), hour: pick('hour') % 24, minute: pick('minute') };
};

const wallToUtcDate = (wall) => new Date(Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour ?? 0, wall.minute ?? 0));

// Date and time are kept apart so the poster can put the time on its own line.
const formatEventParts = (startValue, endValue, timeZone) => {
  const start = toWallClock(startValue, timeZone);
  if (!start) return { date: '', time: '' };
  const end = toWallClock(endValue, timeZone);
  const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' });
  const startDay = dayFormat.format(wallToUtcDate(start));
  const hasStartTime = start.hour !== null && !(start.hour === 0 && start.minute === 0);
  if (!hasStartTime) return { date: startDay, time: '' };
  const sameDay = end && end.year === start.year && end.month === start.month && end.day === start.day;
  const startTime = timeFormat.format(wallToUtcDate(start));
  if (!end || end.hour === null) return { date: startDay, time: startTime };
  if (sameDay) return { date: startDay, time: `${startTime} – ${timeFormat.format(wallToUtcDate(end))}` };
  return { date: `${startDay} – ${dayFormat.format(wallToUtcDate(end))}`, time: `${startTime} – ${timeFormat.format(wallToUtcDate(end))}` };
};

const formatEventWhen = (startValue, endValue, timeZone) => {
  const { date, time } = formatEventParts(startValue, endValue, timeZone);
  return [date, time].filter(Boolean).join(' • ');
};

const formatDateLabel = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
};

const isPrivateHost = (hostname = '') => {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host === '::1') return true;
  const ipv4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
};

const pickCoverUrls = (...sources) => sources
  .flatMap((source) => String(source || '').split(/[\n,;|]+/))
  .map((entry) => entry.trim())
  .filter((entry, index, all) => entry && all.indexOf(entry) === index && !/\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(entry) && !/youtu\.?be/i.test(entry));

const pickCoverUrl = (mediaUrl = '') => pickCoverUrls(mediaUrl)[0] || '';

const createSocialPostingService = ({
  eventsDb,
  sendJson,
  parseJsonObjectBody,
  assertInput,
  isAdmin,
  getActorName = () => '',
  uploadsDir,
  publicBaseUrl = '',
  timeZone = 'America/Toronto',
  organizationName = process.env.ORGANIZATION_NAME || 'Your Gurdwara',
  env = process.env,
  http = axios,
  logger = console,
  now = () => new Date()
}) => {
  const baseUrl = String(publicBaseUrl || '').trim().replace(/\/$/, '');
  const websiteLabel = baseUrl.replace(/^https?:\/\//, '');
  const pageToken = readText(env.META_PAGE_ACCESS_TOKEN);
  const metaAppId = readText(env.META_APP_ID);
  const metaAppSecret = readText(env.META_APP_SECRET);
  const instagramAccountId = readText(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const facebookPageId = readText(env.FACEBOOK_PAGE_ID);
  const whatsappToken = readText(env.META_WA_ACCESS_TOKEN);
  const whatsappPhoneNumberId = readText(env.META_WA_PHONE_NUMBER_ID);
  const whatsappRecipientType = readText(env.SOCIAL_WHATSAPP_RECIPIENT_TYPE).toLowerCase() === 'group' ? 'group' : 'individual';
  const configuredGroupId = readText(env.SOCIAL_WHATSAPP_GROUP_ID);
  const isRegularGroupJid = /@g\.us$/i.test(configuredGroupId);
  const whatsappRecipient = whatsappRecipientType === 'group'
    ? (isRegularGroupJid ? '' : configuredGroupId)
    : (readText(env.SOCIAL_WHATSAPP_TO) || readText(env.WHATSAPP_GROUP_NUMBER));
  const groupGatewayUrl = readText(env.OPENWA_URL).replace(/\/+$/, '').replace(/\/api$/i, '');
  const groupGatewayKey = readText(env.OPENWA_API_KEY);
  const groupGatewaySession = readText(env.OPENWA_SESSION_ID);
  const groupChatId = isRegularGroupJid ? configuredGroupId : readText(env.WA_GROUP_ID);
  const configuredWhatsAppVersion = readText(env.WHATSAPP_GRAPH_API_VERSION);
  const whatsappGraphVersion = /^v\d+\.\d+$/.test(configuredWhatsAppVersion) ? configuredWhatsAppVersion : 'v25.0';
  const whatsappGraphBase = `https://graph.facebook.com/${whatsappGraphVersion}`;
  const postingEnabled = String(env.ENABLE_SOCIAL_CARDS || 'false').trim().toLowerCase() === 'true';
  const renderCache = new Map();
  let sweepRunning = false;

  const status = () => ({
    postingEnabled,
    instagramConfigured: Boolean(pageToken && instagramAccountId),
    facebookConfigured: Boolean(pageToken && facebookPageId),
    whatsappConfigured: Boolean(whatsappToken && whatsappPhoneNumberId && whatsappRecipient),
    whatsappGroupConfigured: Boolean(groupGatewayUrl && groupGatewayKey && groupGatewaySession && /@g\.us$/i.test(groupChatId)),
    publicBaseUrl: baseUrl,
    publicUrlIsHttps: /^https:\/\//i.test(baseUrl),
    timeZone
  });

  const inspectMetaToken = async (token) => {
    if (!token) return { configured: false, valid: false, reason: 'Token is not configured.' };
    if (!metaAppId || !metaAppSecret) return { configured: true, valid: null, reason: 'Set META_APP_ID and META_APP_SECRET to inspect token validity.' };
    try {
      const response = await http.get('https://graph.facebook.com/v25.0/debug_token', {
        params: { input_token: token, access_token: `${metaAppId}|${metaAppSecret}` },
        timeout: 15000
      });
      const details = response?.data?.data || {};
      return {
        configured: true,
        valid: details.is_valid === true,
        type: readText(details.type),
        expiresAt: Number(details.expires_at) > 0 ? new Date(Number(details.expires_at) * 1000).toISOString() : null,
        neverExpires: Number(details.expires_at) === 0,
        dataAccessExpiresAt: Number(details.data_access_expires_at) > 0 ? new Date(Number(details.data_access_expires_at) * 1000).toISOString() : null,
        scopes: Array.isArray(details.scopes) ? details.scopes : [],
        reason: details.is_valid === true ? '' : 'Meta reports this token is invalid or expired.'
      };
    } catch (error) {
      const apiError = error?.response?.data?.error || {};
      return { configured: true, valid: false, reason: String(apiError.message || 'Meta token check failed. Check app ID, app secret, and network access.').slice(0, 220) };
    }
  };

  const getMetaTokenStatus = async () => {
    const [page, whatsapp] = await Promise.all([
      inspectMetaToken(pageToken),
      inspectMetaToken(whatsappToken)
    ]);
    return { page, whatsapp };
  };

  const getSettings = async () => normalizeSettings(await eventsDb.getSingleton(SETTINGS_RESOURCE, null));

  const todayKey = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now());
    const pick = (type) => parts.find((part) => part.type === type)?.value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
  };

  const minutesNow = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now());
    return (Number(parts.find((part) => part.type === 'hour')?.value) % 24) * 60 + Number(parts.find((part) => part.type === 'minute')?.value);
  };

  const withCache = async (key, render) => {
    if (renderCache.has(key)) return renderCache.get(key);
    const result = await render();
    renderCache.set(key, result);
    while (renderCache.size > RENDER_CACHE_LIMIT) renderCache.delete(renderCache.keys().next().value);
    return result;
  };

  const hash = (value) => crypto.createHash('sha1').update(JSON.stringify(value)).digest('hex');

  // ---- Hukamnama ----------------------------------------------------------------------------------------------
  // Entries are stored per date; older records may sit under a morning or evening key, so take whichever exists.
  const findHukamnama = async (dateKey) => {
    const entries = (await eventsDb.getSingleton(HUKAMNAMA_RESOURCE, null)) || {};
    const day = entries[dateKey] || {};
    const entry = day.morning || day.evening;
    return entry ? { entry } : null;
  };

  const buildHukamnamaInput = (entry, dateKey) => {
    const selectedId = readText(String(entry.selectedShabadId || ''));
    const source = selectedId && entry.selectedShabadLines?.length ? entry.selectedShabadLines : (entry.lines || []);
    const lines = source
      .filter((line) => !NAMING_HEADING_TYPES.has(Number(line.lineType || line.type)))
      .map((line) => ({
        gurmukhi: readText(line.gurmukhi) || readText(line.gurmukhiUnicode),
        translationEnglish: readText(line.translationEnglish) || readText(line.translation)
      }))
      .filter((line) => line.gurmukhi);
    const metadata = entry.metadata || {};
    return {
      lines,
      ang: String(entry.ang || metadata.ang || '').trim(),
      raag: readText(metadata.raag),
      writer: readText(metadata.writer),
      dateLabel: formatDateLabel(dateKey),
      organizationName,
      websiteLabel: websiteLabel ? `${websiteLabel}/hukamnama` : ''
    };
  };

  const buildHukamnamaCaption = (input, dateKey) => {
    const gurmukhi = input.lines.slice(0, 4).map((line) => line.gurmukhi).join('\n');
    const english = input.lines.slice(0, 4).map((line) => line.translationEnglish).filter(Boolean).join(' ');
    const meta = [input.ang ? `Ang ${input.ang}` : '', input.raag, input.writer].filter(Boolean).join(' • ');
    return [
      `Daily Hukamnama • ${formatDateLabel(dateKey)}`,
      gurmukhi,
      english ? `Meaning: ${english}` : '',
      meta,
      baseUrl ? `Read the full Hukamnama: ${baseUrl}/hukamnama` : '',
      '#Hukamnama #Gurbani #Waheguru #SinghSabha #Milton #Sikh'
    ].filter(Boolean).join('\n\n').slice(0, 2100);
  };

  const prepareHukamnama = async ({ date } = {}) => {
    const dateKey = isDateKey(date) ? date : todayKey();
    const found = await findHukamnama(dateKey);
    assertInput(found, `No Hukamnama has been posted for ${dateKey}.`, 404);
    const input = buildHukamnamaInput(found.entry, dateKey);
    assertInput(input.lines.length > 0, 'That Hukamnama has no Gurbani lines to put on a card.', 422);
    const rendered = await withCache(`hukamnama:${hash(input)}`, () => cards.renderHukamnamaCard(input));
    return {
      kind: 'hukamnama',
      refKey: `hukamnama:${dateKey}`,
      title: `Hukamnama ${dateKey}`,
      buffer: rendered.buffer,
      caption: buildHukamnamaCaption(input, dateKey)
    };
  };

  // ---- Events -------------------------------------------------------------------------------------------------
  const buildEventCaption = (event, when) => [
    readText(event.title),
    [when, readText(event.location)].filter(Boolean).join('\n'),
    cards.cleanText(event.description).slice(0, 500),
    baseUrl ? `Details: ${baseUrl}/events` : '',
    '#SinghSabha #Gurdwara #Milton #Sikh #CommunityEvent'
  ].filter(Boolean).join('\n\n').slice(0, 2100);

  const prepareEvent = async (eventId) => {
    const events = await eventsDb.getEvents();
    const event = (Array.isArray(events) ? events : []).find((entry) => String(entry.id) === String(eventId));
    assertInput(event, 'Event not found.', 404);
    return prepareEventFromRecord(event);
  };

  const prepareEventFromRecord = async (event) => {
    const when = formatEventWhen(event.date, event.endDate, timeZone);
    const parts = formatEventParts(event.date, event.endDate, timeZone);
    const input = {
      title: readText(event.title),
      whenDate: parts.date,
      whenTime: parts.time,
      where: readText(event.location),
      description: readText(event.description),
      organizationName,
      websiteLabel: websiteLabel ? `${websiteLabel}/events` : ''
    };
    const rendered = await cards.renderEventPoster(input);
    return {
      kind: 'event',
      refKey: `event:${event.id}`,
      title: input.title,
      buffer: rendered.buffer,
      caption: buildEventCaption(event, when)
    };
  };

  // ---- Posting ------------------------------------------------------------------------------------------------
  const saveImage = (buffer) => {
    const stamp = now();
    const year = String(stamp.getUTCFullYear());
    const month = pad(stamp.getUTCMonth() + 1);
    const name = `card-${stamp.getTime()}-${crypto.randomBytes(4).toString('hex')}.jpg`;
    const directory = path.join(uploadsDir, 'social', year, month);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, name), buffer);
    return `/api/uploads/social/${year}/${month}/${name}`;
  };

  const postToInstagram = async (imageUrl, caption) => {
    const created = await http.post(`${GRAPH_BASE}/${instagramAccountId}/media`, { image_url: imageUrl, caption, access_token: pageToken });
    const creationId = created?.data?.id;
    if (!creationId) throw new Error('Instagram did not accept the image.');
    const published = await http.post(`${GRAPH_BASE}/${instagramAccountId}/media_publish`, { creation_id: creationId, access_token: pageToken });
    return published?.data?.id || creationId;
  };

  // Page posts need a Page token. If the configured token is a user token, the Page endpoint hands back the matching Page token.
  let facebookPageToken = '';
  const resolveFacebookToken = async () => {
    if (facebookPageToken) return facebookPageToken;
    try {
      const found = await http.get(`${GRAPH_BASE}/${facebookPageId}`, { params: { fields: 'access_token', access_token: pageToken } });
      facebookPageToken = found?.data?.access_token || pageToken;
    } catch {
      facebookPageToken = pageToken;
    }
    return facebookPageToken;
  };

  // Uploading the file itself means Facebook posts work without a public image address (only Instagram needs one).
  const postToFacebook = async (buffer, caption) => {
    const form = new FormData();
    form.append('source', new Blob([buffer], { type: 'image/jpeg' }), 'card.jpg');
    form.append('caption', caption);
    form.append('access_token', await resolveFacebookToken());
    const posted = await http.post(`${GRAPH_BASE}/${facebookPageId}/photos`, form);
    return posted?.data?.post_id || posted?.data?.id || '';
  };

  // Meta Cloud API first uploads the JPEG, then sends it as an image message.
  const postToWhatsApp = async (buffer, caption) => {
    const media = new FormData();
    media.append('messaging_product', 'whatsapp');
    media.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'card.jpg');
    const uploaded = await http.post(`${whatsappGraphBase}/${whatsappPhoneNumberId}/media`, media, {
      headers: { Authorization: `Bearer ${whatsappToken}` }, timeout: 30000, maxBodyLength: Infinity
    });
    const mediaId = uploaded?.data?.id;
    if (!mediaId) throw new Error('Meta WhatsApp API did not return an uploaded media ID.');
    const sent = await http.post(`${whatsappGraphBase}/${whatsappPhoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: whatsappRecipientType,
      to: whatsappRecipient,
      type: 'image',
      image: { id: mediaId, caption: String(caption || '').slice(0, 1024) }
    }, { headers: { Authorization: `Bearer ${whatsappToken}`, 'Content-Type': 'application/json' }, timeout: 30000 });
    return sent?.data?.messages?.[0]?.id || sent?.data?.id || '';
  };

  // Unofficial path: the OpenWA gateway posts into an existing WhatsApp group, which Meta's Cloud API cannot do.
  const postToWhatsAppGroup = async (buffer, caption) => {
    const sent = await http.post(`${groupGatewayUrl}/api/sessions/${encodeURIComponent(groupGatewaySession)}/messages/send-image`, {
      chatId: groupChatId,
      base64: buffer.toString('base64'),
      mimetype: 'image/jpeg',
      caption: String(caption || '').slice(0, 1000)
    }, { headers: { 'X-API-Key': groupGatewayKey, 'Content-Type': 'application/json' }, timeout: 30000, maxBodyLength: Infinity });
    return sent?.data?.id || sent?.data?.messageId || sent?.data?.data?.id || '';
  };

  const describeError = (error) => {
    const meta = error?.response?.data?.error;
    return String(meta?.message || error?.message || 'Unknown error').slice(0, 300);
  };

  const appendLog = async (record) => {
    const saved = await eventsDb.createItem(LOG_RESOURCE, record);
    const items = await eventsDb.listItems(LOG_RESOURCE);
    if (items.length > MAX_LOG_ITEMS) {
      const oldest = [...items].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).slice(0, items.length - MAX_LOG_ITEMS);
      await Promise.all(oldest.map((item) => eventsDb.removeItem(LOG_RESOURCE, item.id)));
    }
    return saved;
  };

  const publishPrepared = async (prepared, { mode, settings, dryRun, platforms, actor = '' }) => {
    const wanted = {
      instagram: platforms?.instagram ?? settings.instagram,
      facebook: platforms?.facebook ?? settings.facebook,
      whatsapp: platforms?.whatsapp ?? settings.whatsapp,
      whatsappGroup: platforms?.whatsappGroup ?? settings.whatsappGroup
    };
    const live = dryRun === undefined ? !settings.dryRun : !dryRun;
    const imageUrlPath = saveImage(prepared.buffer);
    const imageUrl = `${baseUrl}${imageUrlPath}`;
    const results = [];
    if (live && !postingEnabled) {
      results.push({ platform: 'all', status: 'failed', message: 'Set ENABLE_SOCIAL_CARDS=true on the server before enabling live posting.' });
    } else {
      for (const platform of ['instagram', 'facebook', 'whatsapp', 'whatsappGroup']) {
        if (!wanted[platform]) continue;
        const configured = status()[`${platform}Configured`];
        if (!live) { results.push({ platform, status: 'dry-run', message: configured ? 'Ready to post.' : 'Not configured yet.' }); continue; }
        if (!configured) { results.push({ platform, status: 'skipped', message: 'Not configured on the server.' }); continue; }
        if (platform === 'instagram' && !status().publicUrlIsHttps) { results.push({ platform, status: 'failed', message: 'PUBLIC_SITE_URL must be a public https address so Instagram can download the image.' }); continue; }
        try {
          const id = platform === 'instagram' ? await postToInstagram(imageUrl, prepared.caption)
            : platform === 'facebook' ? await postToFacebook(prepared.buffer, prepared.caption)
              : platform === 'whatsapp' ? await postToWhatsApp(prepared.buffer, prepared.caption)
                : await postToWhatsAppGroup(prepared.buffer, prepared.caption);
          results.push({ platform, status: 'posted', externalId: String(id || '') });
        } catch (error) {
          logger.error?.(`Social ${platform} post failed`, error?.response?.data || error?.message || error);
          results.push({ platform, status: 'failed', message: describeError(error) });
        }
      }
    }
    const posted = results.filter((item) => item.status === 'posted').length;
    const failed = results.filter((item) => item.status === 'failed').length;
    const overall = !live ? 'dry-run' : (failed && posted ? 'partial' : failed ? 'failed' : posted ? 'posted' : 'skipped');
    return appendLog({
      id: `social-${now().getTime()}-${crypto.randomBytes(3).toString('hex')}`,
      kind: prepared.kind,
      refKey: prepared.refKey,
      title: prepared.title,
      mode,
      actor,
      status: overall,
      results,
      imageUrl: imageUrlPath,
      caption: prepared.caption,
      createdAt: now().toISOString()
    });
  };

  const alreadyAutoPosted = async (refKey) => (await eventsDb.listItems(LOG_RESOURCE)).some((item) => item.refKey === refKey && item.mode === 'auto' && item.status !== 'dry-run');

  const runScheduledSweep = async () => {
    if (sweepRunning || !eventsDb.hasDatabaseConnection) return null;
    sweepRunning = true;
    try {
      const settings = await getSettings();
      if (settings.hukamnamaMode !== 'scheduled') return null;
      const [hour, minute] = settings.hukamnamaTime.split(':').map(Number);
      if (minutesNow() < hour * 60 + minute) return null;
      const dateKey = todayKey();
      const found = await findHukamnama(dateKey);
      if (!found || await alreadyAutoPosted(`hukamnama:${dateKey}`)) return null;
      const prepared = await prepareHukamnama({ date: dateKey });
      return await publishPrepared(prepared, { mode: 'auto', settings });
    } catch (error) {
      logger.error?.('Scheduled Hukamnama social post failed', error?.message || error);
      return null;
    } finally {
      sweepRunning = false;
    }
  };

  const onEventCreated = async (event) => {
    try {
      const settings = await getSettings();
      if (!settings.eventAuto || event?.active === false || event?.isActive === false) return null;
      const start = toWallClock(event.date, timeZone);
      if (start && wallToUtcDate(start).getTime() < now().getTime() - 24 * 60 * 60 * 1000) return null;
      if (await alreadyAutoPosted(`event:${event.id}`)) return null;
      return await publishPrepared(await prepareEventFromRecord(event), { mode: 'auto', settings });
    } catch (error) {
      logger.error?.('Automatic event poster post failed', error?.message || error);
      return null;
    }
  };

  // Called when the Granthi saves a Hukamnama; only today's is posted now, an earlier-saved one waits for the scheduled time.
  const onHukamnamaSaved = async (dateKey) => {
    try {
      const settings = await getSettings();
      if (settings.hukamnamaMode !== 'onSave' || dateKey !== todayKey()) return null;
      if (!(await findHukamnama(dateKey)) || await alreadyAutoPosted(`hukamnama:${dateKey}`)) return null;
      return await publishPrepared(await prepareHukamnama({ date: dateKey }), { mode: 'auto', settings });
    } catch (error) {
      logger.error?.('Hukamnama post on save failed', error?.message || error);
      return null;
    }
  };

  // Re-sends only the platforms that did not succeed the first time.
  const retryPost = async (logId, actor) => {
    const original = (await eventsDb.listItems(LOG_RESOURCE)).find((item) => item.id === logId);
    assertInput(original, 'That post record was not found.', 404);
    const failedPlatforms = (original.results || []).filter((item) => ['failed', 'skipped'].includes(item.status) && item.platform !== 'all').map((item) => item.platform);
    assertInput(['failed', 'partial', 'skipped'].includes(original.status), 'Only unsuccessful posts can be retried.');
    const [kind, id] = String(original.refKey || '').split(/:(.+)/);
    const prepared = kind === 'event' ? await prepareEvent(id) : await prepareHukamnama({ date: id });
    const settings = await getSettings();
    const platforms = failedPlatforms.length ? { instagram: failedPlatforms.includes('instagram'), facebook: failedPlatforms.includes('facebook'), whatsapp: failedPlatforms.includes('whatsapp'), whatsappGroup: failedPlatforms.includes('whatsappGroup') } : undefined;
    return publishPrepared(prepared, { mode: 'retry', settings, dryRun: false, platforms, actor });
  };

  const shouldReplaceLegacyEventPost = async () => {
    try {
      return (await getSettings()).eventAuto === true;
    } catch {
      return false;
    }
  };

  // ---- HTTP ---------------------------------------------------------------------------------------------------
  const sendImage = (response, buffer) => {
    response.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(buffer);
  };

  const handleApi = async (request, response, requestUrl) => {
    const route = requestUrl.pathname;
    if (!route.startsWith('/api/social/')) return false;
    const method = request.method;
    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Social posting is temporarily unavailable.', 503);

      if (method === 'GET' && route === '/api/social/cards/hukamnama.jpg') {
        const prepared = await prepareHukamnama({ date: requestUrl.searchParams.get('date') });
        sendImage(response, prepared.buffer);
        return true;
      }
      const eventCard = route.match(/^\/api\/social\/cards\/event\/([A-Za-z0-9_-]+)\.jpg$/);
      if (method === 'GET' && eventCard) {
        sendImage(response, (await prepareEvent(eventCard[1])).buffer);
        return true;
      }

      assertInput(isAdmin(request), 'Admin access is required.', 403);

      if (method === 'GET' && route === '/api/social/settings') {
        sendJson(response, 200, { ok: true, data: { settings: await getSettings(), status: status() } });
        return true;
      }
      if (method === 'POST' && route === '/api/social/meta-token-status') {
        sendJson(response, 200, { ok: true, data: await getMetaTokenStatus() });
        return true;
      }
      if (method === 'PUT' && route === '/api/social/settings') {
        const body = await parseJsonObjectBody(request, { maxBytes: 2048, allowEmpty: false });
        const settings = normalizeSettings(body);
        await eventsDb.setSingleton(SETTINGS_RESOURCE, settings);
        sendJson(response, 200, { ok: true, data: { settings, status: status() } });
        return true;
      }
      if (method === 'GET' && route === '/api/social/log') {
        const items = (await eventsDb.listItems(LOG_RESOURCE)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 50);
        sendJson(response, 200, { ok: true, data: items });
        return true;
      }
      if (method === 'POST' && route === '/api/social/retry') {
        const body = await parseJsonObjectBody(request, { maxBytes: 1024, allowEmpty: false });
        sendJson(response, 200, { ok: true, data: await retryPost(String(body.id || ''), getActorName(request)) });
        return true;
      }
      if (method === 'POST' && route === '/api/social/post') {
        const body = await parseJsonObjectBody(request, { maxBytes: 2048, allowEmpty: false });
        assertInput(['hukamnama', 'event'].includes(body.kind), 'kind must be hukamnama or event.');
        const settings = await getSettings();
        const prepared = body.kind === 'event'
          ? await prepareEvent(body.eventId)
          : await prepareHukamnama({ date: body.date });
        const record = await publishPrepared(prepared, {
          mode: 'manual',
          settings,
          dryRun: typeof body.dryRun === 'boolean' ? body.dryRun : undefined,
          actor: getActorName(request)
        });
        sendJson(response, 200, { ok: true, data: record });
        return true;
      }
      sendJson(response, 404, { ok: false, message: 'Not found.' });
      return true;
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Social posting failed.' });
      return true;
    }
  };

  return { handleApi, runScheduledSweep, onEventCreated, onHukamnamaSaved, shouldReplaceLegacyEventPost, status };
};

module.exports = {
  DEFAULT_SETTINGS,
  LOG_RESOURCE,
  SETTINGS_RESOURCE,
  createSocialPostingService,
  formatEventParts,
  formatEventWhen,
  isPrivateHost,
  normalizeSettings,
  pickCoverUrl,
  pickCoverUrls
};
