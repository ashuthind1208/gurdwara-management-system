const crypto = require('crypto');
const axios = require('axios');

const STATE_KEY = 'openwa_notification_queue_v1';
const MAX_ATTEMPTS = 5;
const MAX_HISTORY = 500;
const MAX_MESSAGES_PER_MINUTE = 3;
const DEFAULT_BURST_WINDOW_MS = 45000;
const RETRY_DELAYS_MS = [5000, 15000, 60000, 180000];

const readConfig = (env = process.env) => {
  const burstWindow = Number(env.WA_BURST_WINDOW_MS || DEFAULT_BURST_WINDOW_MS);
  return {
    baseUrl: String(env.OPENWA_URL || '').trim().replace(/\/+$/, '').replace(/\/api$/i, ''),
    apiKey: String(env.OPENWA_API_KEY || '').trim(),
    sessionId: String(env.OPENWA_SESSION_ID || '').trim(),
    groupId: String(env.WA_GROUP_ID || '').trim(),
    enabled: String(env.WA_NOTIFICATIONS_ENABLED || 'false').trim().toLowerCase() === 'true',
    dryRun: String(env.WA_DRY_RUN || 'false').trim().toLowerCase() === 'true',
    burstWindowMs: Number.isFinite(burstWindow) ? Math.max(1000, burstWindow) : DEFAULT_BURST_WINDOW_MS,
    siteBaseUrl: String(env.SITE_BASE_URL || env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  };
};

const emptyState = () => ({ jobs: [], sent: [], rateWindow: [] });
const makeId = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const isReady = (config) => Boolean(config.baseUrl && config.apiKey && config.sessionId && config.groupId);
const sanitizeText = (value) => String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
const makeBilingualText = ({ titleEn, titlePa, bodyEn, bodyPa, url }) => [
  'Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh',
  'Dear Sangat Ji,',
  sanitizeText(titleEn),
  sanitizeText(bodyEn),
  '',
  'ਵਾਹਿਗੁਰੂ ਜੀ ਕਾ ਖਾਲਸਾ, ਵਾਹਿਗੁਰੂ ਜੀ ਕੀ ਫਤਹਿ',
  'ਪਿਆਰੀ ਸੰਗਤ ਜੀ,',
  sanitizeText(titlePa),
  sanitizeText(bodyPa),
  url ? `Website: ${sanitizeText(url)}` : ''
].filter(Boolean).join('\n');

const createOpenWaNotifications = ({ db, env = process.env, client = axios, now = () => Date.now(), logger = console } = {}) => {
  let stateMutation = Promise.resolve();
  let workerBusy = false;

  const config = () => readConfig(env);
  const withState = (callback) => {
    const operation = stateMutation.then(async () => {
      const current = await db.getSingleton(STATE_KEY, emptyState());
      const state = {
        ...emptyState(),
        ...(current && typeof current === 'object' ? current : {}),
        jobs: Array.isArray(current?.jobs) ? current.jobs : [],
        sent: Array.isArray(current?.sent) ? current.sent : [],
        rateWindow: Array.isArray(current?.rateWindow) ? current.rateWindow : []
      };
      state.jobs.forEach((job) => {
        if (job.status === 'sending') {
          job.status = 'pending';
          job.runAt = Math.min(Number(job.runAt || now()), now());
          job.updatedAt = now();
        }
      });
      const result = await callback(state);
      await db.setSingleton(STATE_KEY, state);
      return result;
    });
    stateMutation = operation.catch(() => {});
    return operation;
  };

  const enqueue = async ({ type, idempotencyKey, text, coalesceKey = '', coalesceWindowMs, newsId } = {}) => {
    const settings = config();
    if (!settings.enabled || !isReady(settings)) return { queued: false, reason: settings.enabled ? 'not_configured' : 'disabled' };
    const message = sanitizeText(text);
    if (!message) return { queued: false, reason: 'empty_message' };
    const stableKey = String(idempotencyKey || `${type}:${message}`).trim();
    const jobId = makeId(stableKey);
    const at = now();

    return withState((state) => {
      state.sent = state.sent.filter((item) => at - item.sentAt < 7 * 24 * 60 * 60 * 1000).slice(-MAX_HISTORY);
      if (state.sent.some((item) => item.outcome !== 'dry_run' && (item.id === jobId || (item.sourceKeys || []).includes(jobId)))
        || state.jobs.some((job) => job.id === jobId || (job.sourceKeys || []).includes(jobId))) {
        return { queued: false, reason: 'duplicate', id: jobId };
      }
      if (coalesceKey) {
        const pending = state.jobs.find((job) => job.status === 'pending' && job.coalesceKey === coalesceKey);
        if (pending) {
          pending.text = `${pending.text}\n\n${message}`.slice(0, 3500);
          pending.sourceKeys = [...new Set([...(pending.sourceKeys || []), jobId])];
          pending.updatedAt = at;
          pending.runAt = at + Math.max(1000, Number(coalesceWindowMs || settings.burstWindowMs));
          pending.attempts = 0;
          pending.lastError = '';
          return { queued: true, coalesced: true, id: pending.id };
        }
      }
      state.jobs.push({
        id: jobId,
        type: String(type || 'content-update'),
        text: message.slice(0, 3500),
        coalesceKey: String(coalesceKey || ''),
        newsId: newsId ? String(newsId) : '',
        sourceKeys: [jobId],
        status: 'pending',
        attempts: 0,
        createdAt: at,
        updatedAt: at,
        runAt: at + (coalesceKey ? Math.max(1000, Number(coalesceWindowMs || settings.burstWindowMs)) : 0),
        lastError: ''
      });
      return { queued: true, id: jobId };
    });
  };

  const sendText = async (text, settings) => {
    const endpoint = `${settings.baseUrl}/api/sessions/${encodeURIComponent(settings.sessionId)}/messages/send-text`;
    return client.post(endpoint, { chatId: settings.groupId, text }, {
      headers: { 'X-API-Key': settings.apiKey, 'Content-Type': 'application/json' },
      timeout: 15000
    });
  };

  const isStillPublic = async (job) => {
    if (job.type !== 'news' || !job.newsId) return true;
    const articles = await db.listItems('news_articles');
    const article = (Array.isArray(articles) ? articles : []).find((entry) => String(entry?.id || '') === String(job.newsId));
    if (!article || article.active === false || article.active === 0 || String(article.active).toLowerCase() === 'false') return false;
    const publishedAt = new Date(article.publishedAt || '').getTime();
    if (!Number.isFinite(publishedAt) || publishedAt > now()) return false;
    if (!article.expiryDate) return true;
    const expiry = new Date(article.expiryDate).getTime();
    if (!Number.isFinite(expiry)) return true;
    return /^\d{4}-\d{2}-\d{2}$/.test(String(article.expiryDate))
      ? new Date(`${article.expiryDate}T23:59:59.999`).getTime() >= now()
      : expiry >= now();
  };

  const processQueue = async () => {
    if (workerBusy) return { skipped: true, reason: 'worker_busy' };
    workerBusy = true;
    try {
      const settings = config();
      if (!settings.enabled || !isReady(settings)) return { skipped: true, reason: settings.enabled ? 'not_configured' : 'disabled' };
      const at = now();
      const candidate = await withState((state) => {
        state.rateWindow = state.rateWindow.filter((sentAt) => at - sentAt < 60 * 1000);
        if (!state.jobs.some((job) => job.status === 'pending' && job.runAt <= at)) return null;
        if (state.rateWindow.length >= MAX_MESSAGES_PER_MINUTE) return null;
        const job = state.jobs.find((entry) => entry.status === 'pending' && entry.runAt <= at);
        if (!job) return null;
        job.status = 'sending';
        job.updatedAt = at;
        return { ...job };
      });
      if (!candidate) return { sent: false, reason: 'nothing_due_or_rate_limited' };

      if (!(await isStillPublic(candidate))) {
        await withState((state) => {
          state.jobs = state.jobs.filter((job) => job.id !== candidate.id);
        });
        return { sent: false, reason: 'news_no_longer_public' };
      }

      if (settings.dryRun) {
        logger.info(`[OpenWA dry-run] ${candidate.text}`);
      } else {
        try {
          await sendText(candidate.text, settings);
        } catch (error) {
          await withState((state) => {
            const job = state.jobs.find((entry) => entry.id === candidate.id);
            if (!job) return;
            job.attempts += 1;
            job.updatedAt = now();
            job.lastError = String(error?.response?.data?.message || error?.message || error).slice(0, 500);
            if (job.attempts >= MAX_ATTEMPTS) {
              job.status = 'failed';
              state.sent.push({ id: job.id, sourceKeys: job.sourceKeys || [job.id], sentAt: now(), outcome: 'failed' });
              logger.error(`OpenWA notification permanently failed (${job.type}): ${job.lastError}`);
            } else {
              job.status = 'pending';
              job.runAt = now() + RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)];
            }
          });
          return { sent: false, reason: 'send_failed' };
        }
      }

      await withState((state) => {
        const job = state.jobs.find((entry) => entry.id === candidate.id);
        if (job) {
          job.status = settings.dryRun ? 'dry_run' : 'sent';
          job.updatedAt = now();
          state.sent.push({ id: job.id, sourceKeys: job.sourceKeys || [job.id], sentAt: now(), outcome: job.status });
        }
        if (!settings.dryRun) state.rateWindow.push(now());
        state.jobs = state.jobs.filter((entry) => !['sent', 'dry_run', 'failed'].includes(entry.status));
        state.sent = state.sent.slice(-MAX_HISTORY);
      });
      return { sent: !settings.dryRun, dryRun: settings.dryRun, id: candidate.id };
    } catch (error) {
      logger.error('OpenWA notification queue processing failed:', error.message || error);
      return { sent: false, reason: 'queue_error' };
    } finally {
      workerBusy = false;
    }
  };

  const getStatus = async () => {
    const settings = config();
    const state = await db.getSingleton(STATE_KEY, emptyState());
    return {
      enabled: settings.enabled,
      dryRun: settings.dryRun,
      configured: isReady(settings),
      pending: Array.isArray(state?.jobs) ? state.jobs.filter((job) => job.status === 'pending').length : 0
    };
  };

  return { enqueue, processQueue, getStatus, makeBilingualText, config };
};

module.exports = {
  createOpenWaNotifications,
  makeBilingualText,
  readConfig,
  DEFAULT_BURST_WINDOW_MS,
  MAX_MESSAGES_PER_MINUTE,
  MAX_ATTEMPTS
};
