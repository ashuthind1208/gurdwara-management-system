const check = (condition, message, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), { status });
};

const createAuditCleanupHandler = ({ eventsDb, canManageAdminPage, parseJsonObjectBody, sendJson }) => {
  return async (request, response, requestUrl) => {
    if (requestUrl.pathname !== '/api/admin/audit-logs/cleanup') return false;
    response.setHeader?.('Cache-Control', 'no-store');
    try {
      check(await canManageAdminPage(request, '/admin/audit-trail'), 'Audit Trail admin access is required.', 403);
      check(request.method === 'POST', 'Method not allowed.', 405);
      check(eventsDb.hasDatabaseConnection && typeof eventsDb.cleanupAuditLogs === 'function', 'Audit cleanup is temporarily unavailable.', 503);
      const body = await parseJsonObjectBody(request, { maxBytes: 1024, allowEmpty: false });
      check(body && typeof body === 'object' && !Array.isArray(body), 'Body must be a JSON object.');
      check(Object.keys(body).every((key) => ['daysToKeep', 'confirm'].includes(key)), 'Only daysToKeep and confirm are allowed.');
      check(Object.hasOwn(body, 'daysToKeep') && [30, 60, 90, null].includes(body.daysToKeep), 'daysToKeep must be 30, 60, 90, or null (entire audit trail).');
      check(body.confirm === true, 'Explicit confirmation is required (confirm: true).');
      const data = await eventsDb.cleanupAuditLogs(body.daysToKeep);
      // Do not append an audit row: deleting the entire trail must leave it empty.
      sendJson(response, 200, { ok: true, data });
    } catch (error) {
      const status = [400, 403, 405, 413, 503].includes(error.status) ? error.status : 503;
      sendJson(response, status, { ok: false, message: status === 503 ? 'Audit cleanup is temporarily unavailable.' : error.message });
    }
    return true;
  };
};

module.exports = { createAuditCleanupHandler };