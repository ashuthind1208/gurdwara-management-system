const crypto = require('crypto');
const {
  DEFAULT_WELCOME_JOURNEY_SETTINGS,
  normalizeWelcomeJourneySettings,
  validateWelcomeFollowUp,
  allowWelcomeFollowUpSubmission
} = require('./welcomeJourney');

const createWelcomeJourneyHandler = ({ eventsDb, getRequestActor, parseJsonObjectBody, sendJson, verifyGoogleAccessToken, appendAuditLog }) => async (request, response, requestUrl) => {
  const path = requestUrl.pathname;
  const actor = getRequestActor(request);
  const fail = (status, message) => sendJson(response, status, { ok: false, message });
  const requireGoogleUser = async (allowedRoles) => {
    const authorization = String(request.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token || token.startsWith('session-token-') || token.startsWith('google-session-token-')) return null;
    let profile;
    try { profile = await verifyGoogleAccessToken(token); } catch { return null; }
    const email = String(profile?.email || '').trim().toLowerCase();
    if (!email || email !== String(actor.email || '').trim().toLowerCase() || profile?.email_verified !== true) return null;
    const users = await eventsDb.listItems('users');
    const user = (Array.isArray(users) ? users : []).find((entry) => String(entry?.email || '').trim().toLowerCase() === email);
    const role = String(user?.role || '').trim().toLowerCase();
    if (user?.isActive !== true || String(user?.approvalStatus || '').trim().toLowerCase() !== 'approved' || !allowedRoles.includes(role)) return null;
    if (actor.role && String(actor.role).trim().toLowerCase() !== role) return null;
    return { email, role, user };
  };

  try {
    if (!eventsDb.hasDatabaseConnection) return fail(503, 'Welcome Journey storage is temporarily unavailable.');
    if (path === '/api/welcome-journey/settings' && request.method === 'GET') {
      const saved = await eventsDb.getSingleton('welcome_journey_settings', null);
      const settings = normalizeWelcomeJourneySettings(saved || DEFAULT_WELCOME_JOURNEY_SETTINGS);
      let canSave = false;
      try { canSave = Boolean(await requireGoogleUser(['super admin'])); } catch { canSave = false; }
      return sendJson(response, 200, { ok: true, data: { ...settings, canSave, followUpAvailable: true } });
    }
    if (path === '/api/welcome-journey/settings' && request.method === 'PUT') {
      const authenticated = await requireGoogleUser(['super admin']);
      if (!authenticated) return fail(403, 'Please sign in with an active, approved Super Admin Google account to edit Welcome Journey settings.');
      const body = await parseJsonObjectBody(request, { maxBytes: 64 * 1024, allowEmpty: false });
      const allowedKeys = new Set(Object.keys(DEFAULT_WELCOME_JOURNEY_SETTINGS));
      const submittedSettings = Object.fromEntries(Object.entries(body).filter(([key]) => allowedKeys.has(key)));
      const unknownKeys = Object.keys(body).filter((key) => !allowedKeys.has(key) && !['canSave', 'followUpAvailable'].includes(key));
      if (unknownKeys.length) return fail(400, `Welcome Journey settings contain an unknown field: ${unknownKeys[0]}.`);
      const settings = normalizeWelcomeJourneySettings(submittedSettings);
      await eventsDb.setSingleton('welcome_journey_settings', settings);
      await appendAuditLog(request, { action: 'welcome_journey.settings.update', targetType: 'welcome_journey_settings', targetId: 'default', description: 'Updated Welcome Journey visitor and LED board settings.' });
      return sendJson(response, 200, { ok: true, data: { ...settings, canSave: true, followUpAvailable: true } });
    }
    if (path === '/api/welcome-journey/follow-ups' && request.method === 'POST') {
      const settings = normalizeWelcomeJourneySettings(await eventsDb.getSingleton('welcome_journey_settings', DEFAULT_WELCOME_JOURNEY_SETTINGS) || DEFAULT_WELCOME_JOURNEY_SETTINGS);
      if (!settings.showFollowUp) return fail(403, 'Visitor follow-up requests are not enabled.');
      const key = String(request.socket?.remoteAddress || 'unknown-ip');
      if (!allowWelcomeFollowUpSubmission(key)) return fail(429, 'Too many follow-up requests. Please try again later.');
      const body = await parseJsonObjectBody(request, { maxBytes: 8192, allowEmpty: false });
      const allowedKeys = ['name', 'email', 'phone', 'message', 'consent', 'website'];
      if (Object.keys(body).some((keyName) => !allowedKeys.includes(keyName))) return fail(400, 'Follow-up request contains an unknown field.');
      const entry = validateWelcomeFollowUp(body);
      const saved = await eventsDb.createItem('welcome_journey_follow_ups', { id: crypto.randomUUID(), ...entry });
      return sendJson(response, 201, { ok: true, data: { id: saved.id, status: saved.status, submittedAt: saved.submittedAt } });
    }
    if (path === '/api/welcome-journey/follow-ups' && request.method === 'GET') {
      const authenticated = await requireGoogleUser(['admin', 'super admin']);
      if (!authenticated) return fail(403, 'Please sign in with an active, approved Admin Google account to view visitor requests.');
      const entries = await eventsDb.listItems('welcome_journey_follow_ups');
      const sorted = (Array.isArray(entries) ? entries : []).sort((a, b) => String(b?.submittedAt || '').localeCompare(String(a?.submittedAt || '')));
      return sendJson(response, 200, { ok: true, data: sorted.slice(0, 100) });
    }
    return fail(405, 'Method not allowed.');
  } catch (error) {
    const status = [400, 403, 413, 429].includes(error.status) ? error.status : 503;
    return fail(status, status === 503 ? 'Welcome Journey is temporarily unavailable.' : error.message);
  }
};

module.exports = { createWelcomeJourneyHandler };
