const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');

// Exercise the real persistence module with an isolated, in-memory SQL adapter.
// No credentials or live database connection are used.
const setup = () => {
  const singletons = new Map();
  const pages = new Map();
  const sections = new Map();
  const pool = { query: async (sql, params = []) => {
    if (/INSERT INTO app_singletons/.test(sql)) {
      const payload = JSON.parse(params[1]);
      singletons.set(params[0], payload);
      return { rows: [{ payload }] };
    }
    if (/SELECT payload\s+FROM app_singletons/.test(sql)) {
      return { rows: singletons.has(params[0]) ? [{ payload: singletons.get(params[0]) }] : [] };
    }
    if (/DELETE FROM cms_page_sections/.test(sql)) sections.clear();
    else if (/DELETE FROM cms_pages/.test(sql)) pages.clear();
    else if (/INSERT INTO cms_pages/.test(sql)) pages.set(params[1], Array.from(params));
    else if (/INSERT INTO cms_page_sections/.test(sql)) sections.set(params[0], Array.from(params));
    else throw new Error(`Unexpected SQL: ${sql}`);
    return { rows: [] };
  } };
  const filename = path.join(__dirname, 'postgres.js');
  const actualRequire = createRequire(filename);
  const context = {
    module: { exports: {} }, console,
    process: { env: { DATABASE_URL: 'postgres://test.invalid/cms-test' } },
    require: (id) => id === 'pg' ? { Pool: function Pool() { return pool; } } : actualRequire(id)
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  return { db: context.module.exports, pages, sections };
};

test('CMS singleton preserves tombstones but excludes them from relational page and section mirrors', async () => {
  const { db, pages, sections } = setup();
  await db.setSingleton('cms_page_content', {
    about: { deleted: true, heroTitle: 'Stale content', sections: [{ id: 'hidden', body: 'Hidden' }] },
    classes: { heroTitle: 'Classes', sections: [{ id: 'schedule', title: 'Schedule', body: 'Weekly' }] }
  });
  assert.equal((await db.getSingleton('cms_page_content')).about.deleted, true);
  assert.deepEqual([...pages.keys()], ['classes']);
  assert.deepEqual([...sections.keys()], ['schedule']);
  assert.equal(sections.get('schedule')[3], 'Weekly');
});

test('removing a custom page or section persists through singleton reads and clears the old mirror rows', async () => {
  const { db, pages, sections } = setup();
  await db.setSingleton('cms_page_content', {
    about: { heroTitle: 'About', sections: [{ id: 'history', body: 'History' }] },
    custom: { heroTitle: 'Custom', sections: [{ id: 'custom-section', body: 'Custom' }] }
  });
  assert.equal(pages.size, 2);
  assert.equal(sections.size, 2);
  await db.setSingleton('cms_page_content', { about: { heroTitle: 'About', sections: [] } });
  const reloaded = await db.getSingleton('cms_page_content');
  assert.equal(reloaded.custom, undefined);
  assert.deepEqual(reloaded.about.sections, []);
  assert.deepEqual([...pages.keys()], ['about']);
  assert.equal(sections.size, 0);
});