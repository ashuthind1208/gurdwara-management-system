const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Execute real adapter functions without importing drivers or opening connections.
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `Missing adapter section: ${start}`);
  return source.slice(from, to);
};

const adapters = [
  { name: 'MySQL', file: 'mysql.js', projection: "JSON_REMOVE(payload, '$.payload') AS payload", placeholder: '?', terminator: '', encodings: ['object', 'string'] },
  { name: 'PostgreSQL', file: 'postgres.js', projection: "payload - 'payload' AS payload", placeholder: '$1', terminator: ';', encodings: ['object'] }
];

const harness = (adapter, rows) => {
  const source = fs.readFileSync(path.join(__dirname, 'db', adapter.file), 'utf8');
  const calls = [];
  const pool = {
    execute: async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: Array.from(params) });
      return [rows];
    },
    query: async (sql, params) => {
      calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params: Array.from(params || []) });
      return { rows };
    }
  };
  const helpers = adapter.name === 'MySQL' ? section(source, 'const parsePayload =', 'const normalizeId =') : '';
  const script = new vm.Script([helpers, section(source, 'const listItems =', 'const createItem ='), 'listItems;'].join('\n'), { filename: adapter.file });
  const listItems = script.runInNewContext({ pool, requirePool: () => pool, JSON });
  return { calls, listItems };
};

const expectedSql = (adapter, projection) =>
  `SELECT id, ${projection} FROM app_items WHERE resource = ${adapter.placeholder} ORDER BY updated_at DESC${adapter.terminator}`;
const plain = (value) => JSON.parse(JSON.stringify(value));
const metadata = {
  action: 'update', resource: 'cms_pages', resourceId: 'page-1',
  actorEmail: 'admin@example.test', actorRole: 'Admin', actorName: 'Test Admin',
  createdAt: '2026-11-11T12:00:00.000Z', updatedAt: '2026-11-11T12:01:00.000Z',
  details: { payload: 'Nested metadata must remain', changedFields: ['title'] },
  success: false, count: 0, note: null
};

for (const adapter of adapters) {
  test(`${adapter.name}: audit list projects only the snapshot and preserves metadata`, async () => {
    for (const encoding of adapter.encodings) {
      const stored = { ...metadata, payload: { title: 'Saved content', media: 'large-media-data' } };
      const original = plain(stored);
      // Model the projected row; the SQL assertion verifies the actual projection.
      const { payload: snapshot, ...projected } = stored;
      assert.deepEqual(snapshot, original.payload);
      const rows = [{ id: 'audit-1', payload: encoding === 'string' ? JSON.stringify(projected) : projected }];
      const { listItems, calls } = harness(adapter, rows);
      const result = plain(await listItems('  audit_logs  '));
      assert.deepEqual(calls, [{ sql: expectedSql(adapter, adapter.projection), params: ['audit_logs'] }]);
      assert.deepEqual(result, [{ id: 'audit-1', ...metadata }]);
      assert.equal(Object.hasOwn(result[0], 'payload'), false);
      assert.equal(result[0].details.payload, metadata.details.payload);
      assert.deepEqual(stored, original, 'Listing must not modify the stored snapshot');
    }
  });

  test(`${adapter.name}: audit entries without snapshots and empty audit lists remain valid`, async () => {
    for (const rows of [[{ id: 'audit-2', payload: { action: 'login', note: null } }], []]) {
      const { listItems, calls } = harness(adapter, rows);
      assert.deepEqual(plain(await listItems('audit_logs')), rows.map((row) => ({ id: row.id, ...row.payload })));
      assert.deepEqual(calls, [{ sql: expectedSql(adapter, adapter.projection), params: ['audit_logs'] }]);
    }
  });

  test(`${adapter.name}: other resources retain the original query and full payload`, async () => {
    for (const resource of ['cms_pages', 'audit_logs_archive', "cms_pages' OR 1=1 --"]) {
      const content = { title: 'Page title', payload: { media: 'Keep this snapshot' }, details: metadata.details };
      const rows = [{ id: 'page-1', payload: content }, { id: 'page-2', payload: { title: 'Older page' } }];
      const { listItems, calls } = harness(adapter, rows);
      assert.deepEqual(plain(await listItems(`  ${resource}  `)), rows.map((row) => ({ id: row.id, ...row.payload })));
      const normalizedResource = adapter.name === 'MySQL' ? resource.toLowerCase() : resource;
      assert.deepEqual(calls, [{ sql: expectedSql(adapter, 'payload'), params: [normalizedResource] }]);
    }
  });
}