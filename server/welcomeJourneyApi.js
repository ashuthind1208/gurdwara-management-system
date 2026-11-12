const crypto = require('crypto');
const {
  DEFAULT_WELCOME_JOURNEY_SETTINGS,
  normalizeWelcomeJourneySettings,
  validateWelcomeFollowUp,
  allowWelcomeFollowUpSubmission
} = require('./welcomeJourney');

const createWelcomeJourneyHandler = ({ eventsDb, getGurdwaraBranding = async () => ({}), getRequestActor, parseJsonObjectBody, sendJson, verifyGoogleAccessToken, appendAuditLog }) => async (request, response, requestUrl) => {
  const path = requestUrl.pathname;
  const actor = getRequestActor(request);
  const fail = (status, message) => sendJson(response, status, { ok: false, message });
  const authorizationMessage = (reason) => ({
    google_sign_in_required: 'Sign in to the admin portal with an active, approved account to edit Welcome Journey settings.',
    google_session_expired: 'Your admin portal session has expired. Sign out and sign back in to the admin portal.',
    google_account_mismatch: 'The signed-in admin account could not be verified. Sign out and sign back in to the admin portal.',
    account_not_active_approved: 'This account is not active and approved for the Gurdwara admin portal. Ask an administrator to review your account.',
    super_admin_required: 'Only an active, approved Super Admin can edit Welcome Journey settings.',
    admin_required: 'An active, approved administrator account is required to view visitor requests.'
  }[reason] || 'Unable to verify your admin account for this action. Sign in again or contact an administrator.');
  const authenticateAdminUser = async (allowedRoles) => {
    const authorization = String(request.headers.authorization || '');
    const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!token || token.startsWith('session-token-') || token.startsWith('google-session-token-')) return { user: null, reason: 'google_sign_in_required' };
    let profile;
    try { profile = await verifyGoogleAccessToken(token); } catch { return { user: null, reason: 'google_session_expired' }; }
    const email = String(profile?.email || '').trim().toLowerCase();
    if (!email || email !== String(actor.email || '').trim().toLowerCase() || profile?.email_verified !== true) return { user: null, reason: 'google_account_mismatch' };
    const users = await eventsDb.listItems('users');
    const user = (Array.isArray(users) ? users : []).find((entry) => String(entry?.email || '').trim().toLowerCase() === email);
    const role = String(user?.role || '').trim().toLowerCase();
    if (!user || user.isActive !== true || String(user.approvalStatus || '').trim().toLowerCase() !== 'approved') return { user: null, reason: 'account_not_active_approved' };
    if (!allowedRoles.includes(role)) return { user: null, reason: allowedRoles.length === 1 && allowedRoles[0] === 'super admin' ? 'super_admin_required' : 'admin_required' };
    if (actor.role && String(actor.role).trim().toLowerCase() !== role) return { user: null, reason: 'google_account_mismatch' };
    return { user: { email, role, user }, reason: null };
  };

  try {
    if (!eventsDb.hasDatabaseConnection) return fail(503, 'Welcome Journey storage is temporarily unavailable.');
    if (path === '/api/welcome-journey/settings' && request.method === 'GET') {
      const saved = await eventsDb.getSingleton('welcome_journey_settings', null);
      const settings = normalizeWelcomeJourneySettings(saved || DEFAULT_WELCOME_JOURNEY_SETTINGS);
      const branding = await getGurdwaraBranding(eventsDb);
      const address = String(branding?.address || settings.address || '').trim();
      const directionsUrl = String(branding?.address || '').trim()
        ? `https://maps.google.com/?q=${encodeURIComponent(String(branding.address).trim())}`
        : settings.directionsUrl;
      let access = { user: null, reason: 'google_sign_in_required' };
      try { access = await authenticateAdminUser(['super admin']); } catch { access = { user: null, reason: 'account_not_active_approved' }; }
      return sendJson(response, 200, { ok: true, data: { ...settings, address, directionsUrl, canSave: Boolean(access.user), canSaveReason: access.reason, followUpAvailable: true } });
    }
    if (path === '/api/welcome-journey/settings' && request.method === 'PUT') {
      const access = await authenticateAdminUser(['super admin']);
      if (!access.user) return fail(403, authorizationMessage(access.reason));
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
      const access = await authenticateAdminUser(['admin', 'super admin']);
      if (!access.user) return fail(403, authorizationMessage(access.reason));
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
