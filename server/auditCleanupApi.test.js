const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createAuditCleanupHandler } = require('./auditCleanupApi');

const harness = ({ allowed = true, connected = true, supported = true, failure, parseFailure } = {}) => {
  const calls = [];
  const result = { deletedCount: 7, cutoff: null, daysToKeep: null };
  const eventsDb = {
    hasDatabaseConnection: connected,
    ...(supported ? { cleanupAuditLogs: async (days) => {
      calls.push(['cleanup', days]);
      if (failure) throw failure;
      return result;
    } } : {}),
    createItem: () => assert.fail('Cleanup must never append an audit row'),
    removeItem: () => assert.fail('Cleanup must not use generic item deletion')
  };
  let reply;
  const handler = createAuditCleanupHandler({
    eventsDb,
    canManageAdminPage: async (request, page) => { calls.push(['auth', request, page]); return allowed; },
    parseJsonObjectBody: async (request, options) => {
      calls.push(['parse', options]);
      if (parseFailure) throw parseFailure;
      return request.body;
    },
    sendJson: (response, status, body) => { reply = { status, body }; }
  });
  const invoke = async (body = { daysToKeep: null, confirm: true }, method = 'POST', pathname = '/api/admin/audit-logs/cleanup') => {
    const request = { method, body, headers: { 'x-actor-role': 'Super Admin' } };
    const headers = {};
    const handled = await handler(request, { setHeader: (name, value) => { headers[name] = value; } }, { pathname });
    return { handled, reply, headers, request };
  };
  return { invoke, calls, result };
};

test('only matches the dedicated endpoint; existing content routes are untouched', async () => {
  const { invoke, calls } = harness();
  for (const pathname of ['/api/content/audit_logs', '/api/admin/audit-logs/cleanup/extra', '/api/stream-overlay/settings']) assert.equal((await invoke({}, 'POST', pathname)).handled, false);
  assert.deepEqual(calls, []);
});

test('requires injected, verified Audit Trail permission before reading any body', async () => {
  const { invoke, calls } = harness({ allowed: false });
  const { reply, request } = await invoke();
  assert.equal(reply.status, 403);
  assert.equal(reply.body.ok, false);
  assert.deepEqual(calls, [['auth', request, '/admin/audit-trail']]);
});

test('accepts only POST with a working database and cleanup-capable adapter', async () => {
  for (const method of ['GET', 'DELETE', 'PUT', 'PATCH']) {
    const { invoke, calls } = harness();
    assert.equal((await invoke(undefined, method)).reply.status, 405);
    assert.equal(calls.length, 1);
  }
  for (const options of [{ connected: false }, { supported: false }]) {
    const { invoke, calls } = harness(options);
    assert.equal((await invoke()).reply.status, 503);
    assert.equal(calls.length, 1);
  }
});

test('rejects missing/invalid days, extra keys, and anything except boolean true confirmation', async () => {
  const invalid = [null, [], '30', {}, { confirm: true }, { daysToKeep: 30 },
    ...[undefined, 0, -30, 31, 365, '30', 'all', {}, false].map((daysToKeep) => ({ daysToKeep, confirm: true })),
    ...[false, 'true', 1, null].map((confirm) => ({ daysToKeep: 30, confirm })),
    { daysToKeep: 30, confirm: true, cutoff: '1900-01-01' }, { daysToKeep: null, confirm: true, resource: 'users' }];
  for (const body of invalid) {
    const { invoke, calls } = harness();
    assert.equal((await invoke(body)).reply.status, 400, JSON.stringify(body));
    assert.equal(calls.some(([kind]) => kind === 'cleanup'), false);
  }
});

test('all supported scopes delegate once, return adapter count/cutoff, and never append audit rows', async () => {
  for (const daysToKeep of [30, 60, 90, null]) {
    const { invoke, calls, result } = harness();
    result.daysToKeep = daysToKeep;
    result.cutoff = daysToKeep === null ? null : '2026-10-13T12:00:00.000Z';
    const { handled, reply, headers } = await invoke({ daysToKeep, confirm: true });
    assert.equal(handled, true);
    assert.deepEqual(reply, { status: 200, body: { ok: true, data: result } });
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.deepEqual(calls.filter(([kind]) => kind === 'cleanup'), [['cleanup', daysToKeep]]);
    assert.deepEqual(calls.find(([kind]) => kind === 'parse')[1], { maxBytes: 1024, allowEmpty: false });
  }
});

test('parsing/storage failures produce errors, not false empty-success counts or SQL details', async () => {
  for (const code of [400, 413]) {
    const { invoke, calls } = harness({ parseFailure: Object.assign(new Error('Invalid body'), { status: code }) });
    assert.equal((await invoke()).reply.status, code);
    assert.equal(calls.some(([kind]) => kind === 'cleanup'), false);
  }
  const { invoke, calls } = harness({ failure: new Error('private SQL connection details') });
  const { reply } = await invoke();
  assert.deepEqual(reply, { status: 503, body: { ok: false, message: 'Audit cleanup is temporarily unavailable.' } });
  assert.equal(calls.filter(([kind]) => kind === 'cleanup').length, 1, 'No automatic retry');
});

// Extract only the real function; no driver imports, connections or actual SQL execution.
const adapterHarness = (file, { count = 4, failure, connected = true } = {}) => {
  const source = fs.readFileSync(path.join(__dirname, 'db', file), 'utf8');
  assert.match(source, /module\.exports\s*=\s*\{[^}]*\bcleanupAuditLogs\b/s);
  const start = source.indexOf('const cleanupAuditLogs =');
  const end = source.indexOf('const listItems =', start);
  assert.ok(start >= 0 && end > start);
  const calls = [];
  const capture = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: Array.from(params) });
    if (failure) throw failure;
  };
  const pool = connected ? {
    execute: async (sql, params) => { await capture(sql, params); return [{ affectedRows: count }]; },
    query: async (sql, params) => { await capture(sql, params); return { rowCount: count }; }
  } : null;
  class FixedDate extends Date {
    static now() { return Date.parse('2026-11-12T12:34:56.789Z'); }
  }
  const cleanup = new vm.Script(`${source.slice(start, end)}\ncleanupAuditLogs;`).runInNewContext({
    pool, Date: FixedDate, requirePool: () => { if (!pool) throw new Error('No database'); return pool; }
  });
  return { cleanup, calls };
};

for (const file of ['mysql.js', 'postgres.js']) {
  test(`${file}: bulk delete has hard-coded resource, bound server cutoff and ISO insertion fallback`, async () => {
    for (const days of [30, 60, 90]) {
      const { cleanup, calls } = adapterHarness(file);
      const result = await cleanup(days);
      const cutoff = new Date(Date.parse('2026-11-12T12:34:56.789Z') - days * 86400000).toISOString();
      assert.equal(result.deletedCount, 4);
      assert.equal(result.daysToKeep, days);
      assert.equal(result.cutoff, cutoff);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].params, [cutoff]);
      const sql = calls[0].sql;
      assert.match(sql, /^DELETE FROM app_items WHERE resource = 'audit_logs' AND COALESCE\(/);
      assert.doesNotMatch(sql, /SELECT|RETURNING|updated_at|\bTRUNCATE\b|\bOR\b/i);
      assert.equal(sql.includes(cutoff), false);
      if (file === 'mysql.js') {
        assert.match(sql, /NULLIF\(NULLIF\(JSON_UNQUOTE\(JSON_EXTRACT\(payload, '\$\.createdAt'\)\), 'null'\), ''\)/);
        assert.match(sql, /CONCAT\(LEFT\(DATE_FORMAT\(TIMESTAMPADD\(MICROSECOND, UNIX_TIMESTAMP\(created_at\) \* 1000000, '1970-01-01 00:00:00'\), '%Y-%m-%dT%H:%i:%s\.%f'\), 23\), 'Z'\) \) < \?$/);
      } else {
        assert.match(sql, /NULLIF\(payload->>'createdAt', ''\)/);
        assert.match(sql, /to_char\(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'\) \) < \$1$/);
      }
    }
  });
  test(`${file}: entire trail deletes only audit_logs without a date filter and reports zero honestly`, async () => {
    for (const count of [0, 100000]) {
      const { cleanup, calls } = adapterHarness(file, { count });
      const result = await cleanup(null);
      assert.equal(result.deletedCount, count);
      assert.equal(result.cutoff, null);
      assert.equal(result.daysToKeep, null);
      assert.deepEqual(calls, [{ sql: "DELETE FROM app_items WHERE resource = 'audit_logs'", params: [] }]);
    }
  });
  test(`${file}: adapter rejects arbitrary retention/resources/cutoffs before querying`, async () => {
    const { cleanup, calls } = adapterHarness(file);
    for (const value of [undefined, 'all', '30', 0, -1, 31, NaN, {}, { daysToKeep: 30 }, 'users', "audit_logs' OR 1=1 --"]) await assert.rejects(() => cleanup(value), { message: 'Invalid audit retention period.', status: 400 });
    assert.deepEqual(calls, []);
  });
  test(`${file}: unavailable database or SQL failure is not converted into success`, async () => {
    const missing = adapterHarness(file, { connected: false });
    await assert.rejects(() => missing.cleanup(30));
    assert.deepEqual(missing.calls, []);
    const failing = adapterHarness(file, { failure: new Error('SQL failed') });
    await assert.rejects(() => failing.cleanup(null), /SQL failed/);
    assert.equal(failing.calls.length, 1);
  });
}