const mysql = require('mysql2/promise');
const { allTableNames, relationalSchemaStatements } = require('./mysql-relational-schema');
const { deleteItemMirror, mirrorItemResource, mirrorSingletonResource } = require('./mysql-relational-mirrors');

const toBoolean = (value) => ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
const mysqlUrl = String(process.env.MYSQL_URL || '').trim();
const mysqlHost = String(process.env.MYSQL_HOST || '').trim();
const mysqlPort = Number(process.env.MYSQL_PORT || 3306);
const mysqlUser = String(process.env.MYSQL_USER || '').trim();
const mysqlPassword = String(process.env.MYSQL_PASSWORD || '');
const mysqlDatabase = String(process.env.MYSQL_DATABASE || '').trim();
const mysqlSsl = toBoolean(process.env.MYSQL_SSL);
const mysqlSslRejectUnauthorized = process.env.MYSQL_SSL_REJECT_UNAUTHORIZED == null
  ? true
  : toBoolean(process.env.MYSQL_SSL_REJECT_UNAUTHORIZED);
const hasConnection = Boolean(mysqlUrl || (mysqlHost && mysqlUser && mysqlDatabase));

const pool = hasConnection
  ? mysql.createPool(mysqlUrl || {
    host: mysqlHost,
    port: mysqlPort,
    user: mysqlUser,
    password: mysqlPassword,
    database: mysqlDatabase,
    waitForConnections: true,
    connectionLimit: Math.max(2, Number(process.env.MYSQL_POOL_SIZE || 10)),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    ...(mysqlSsl ? { ssl: { rejectUnauthorized: mysqlSslRejectUnauthorized } } : {})
  })
  : null;

const requirePool = () => {
  if (!pool) {
    throw new Error('MySQL is not configured. Set MYSQL_URL or MYSQL_HOST, MYSQL_USER, and MYSQL_DATABASE.');
  }
  return pool;
};

const parsePayload = (value, fallback = {}) => {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeResource = (value) => String(value || '').trim().toLowerCase();
const normalizeId = (value) => String(value || '').trim();
const normalizeContact = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
const nowIso = () => new Date().toISOString();

const ensureEventsSchema = async () => {
  const db = requirePool();
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_singletons (
      resource VARCHAR(191) PRIMARY KEY,
      payload JSON NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS app_items (
      resource VARCHAR(191) NOT NULL,
      id VARCHAR(191) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (resource, id),
      INDEX idx_app_items_resource_updated (resource, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS quiz_bank_files (
      file_name VARCHAR(255) PRIMARY KEY,
      questions JSON NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      payload JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS event_registrants (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      event_id BIGINT UNSIGNED NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_event_registrants_event (event_id, created_at),
      CONSTRAINT fk_mysql_event_registrants_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS donation_campaigns (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      payload JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS donations (
      id VARCHAR(191) PRIMARY KEY,
      payload JSON NOT NULL,
      deleted_at TIMESTAMP(3) NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_donations_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS donation_pending (
      id VARCHAR(191) PRIMARY KEY,
      payload JSON NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_donation_pending_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    ...relationalSchemaStatements
  ];
  for (const statement of statements) {
    try {
      await db.query(statement);
    } catch (error) {
      const isIdempotentColumnMigration = error?.code === 'ER_DUP_FIELDNAME'
        && /^ALTER TABLE\s+\w+\s+ADD COLUMN\s+/i.test(statement.trim());
      if (!isIdempotentColumnMigration) {
        throw error;
      }
    }
  }
  return true;
};

const getSingleton = async (resource, fallback = null) => {
  const normalized = normalizeResource(resource);
  const [rows] = await requirePool().execute('SELECT payload FROM app_singletons WHERE resource = ? LIMIT 1', [normalized]);
  return rows.length > 0 ? parsePayload(rows[0].payload, fallback) : fallback;
};

const setSingleton = async (resource, payload) => {
  const normalized = normalizeResource(resource);
  await requirePool().execute(
    `INSERT INTO app_singletons(resource, payload) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP(3)`,
    [normalized, JSON.stringify(payload ?? {})]
  );
  try {
    await mirrorSingletonResource(requirePool(), normalized, payload ?? {});
  } catch (error) {
    console.error('MySQL singleton mirror sync failed:', error.message || error);
  }
  return payload;
};

// Dedicated bulk operation: callers cannot choose a resource or supply a cutoff.
const cleanupAuditLogs = async (daysToKeep) => {
  if (![30, 60, 90, null].includes(daysToKeep)) {
    throw Object.assign(new Error('Invalid audit retention period.'), { status: 400 });
  }
  const cutoff = daysToKeep === null ? null : new Date(Date.now() - daysToKeep * 86400000).toISOString();
  // Compare ISO text to ISO text, not an ISO JSON string to a SQL date string.
  // created_at is the insertion timestamp, never updated_at (which changes on edits).
  // Rebuild UTC from its epoch: the driver's timezone option does not set the SQL session timezone.
  const predicate = cutoff === null ? '' : ` AND COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.createdAt')), 'null'), ''),
    CONCAT(LEFT(DATE_FORMAT(TIMESTAMPADD(MICROSECOND, UNIX_TIMESTAMP(created_at) * 1000000, '1970-01-01 00:00:00'), '%Y-%m-%dT%H:%i:%s.%f'), 23), 'Z')
  ) < ?`;
  const [result] = await requirePool().execute(
    `DELETE FROM app_items WHERE resource = 'audit_logs'${predicate}`,
    cutoff === null ? [] : [cutoff]
  );
  return { deletedCount: Number(result.affectedRows), cutoff, daysToKeep };
};

const listItems = async (resource) => {
  const normalized = normalizeResource(resource);
  // Audit tables show metadata only; saved content snapshots can contain large media data.
  const payloadProjection = normalized === 'audit_logs' ? "JSON_REMOVE(payload, '$.payload') AS payload" : 'payload';
  const [rows] = await requirePool().execute(
    `SELECT id, ${payloadProjection} FROM app_items WHERE resource = ? ORDER BY updated_at DESC`,
    [normalized]
  );
  return rows.map((row) => ({ id: row.id, ...parsePayload(row.payload) }));
};

const createItem = async (resource, payload = {}) => {
  const normalized = normalizeResource(resource);
  const id = normalizeId(payload.id || `${normalized}-${Date.now()}`);
  const record = { ...payload, id };
  await requirePool().execute(
    'INSERT INTO app_items(resource, id, payload) VALUES (?, ?, ?)',
    [normalized, id, JSON.stringify(record)]
  );
  try {
    await mirrorItemResource(requirePool(), normalized, record);
  } catch (error) {
    console.error('MySQL item mirror sync failed:', error.message || error);
  }
  return record;
};

const createLangarContributionBatch = async ({ items, donorName, donorEmail, donorAvatarUrl, anonymous, expectedDeliveryDate }) => {
  const db = requirePool();
  const connection = await db.getConnection();
  const created = [];
  let content = null;
  try {
    await connection.beginTransaction();
    await connection.execute(
      `INSERT INTO app_singletons(resource, payload) VALUES ('cms_home_content', JSON_OBJECT()) ON DUPLICATE KEY UPDATE resource = VALUES(resource)`
    );
    const [singletonRows] = await connection.execute(
      `SELECT payload FROM app_singletons WHERE resource = 'cms_home_content' FOR UPDATE`
    );
    content = parsePayload(singletonRows[0]?.payload, {});
    const currentItems = Array.isArray(content.langarItems) ? content.langarItems : [];
    const [contributionRows] = await connection.execute(
      `SELECT payload FROM app_items WHERE resource = 'langar_contributions'`
    );
    const previousContributions = contributionRows.map((row) => parsePayload(row.payload));
    const selectedIds = new Set();
    const normalized = items.map((selection) => {
      const id = String(selection.itemId || '').trim();
      const quantity = Number(selection.quantity);
      if (!id || selectedIds.has(id) || !Number.isSafeInteger(quantity) || quantity <= 0) {
        throw Object.assign(new Error('Each selected Langar item must be unique and have a positive whole quantity.'), { status: 400 });
      }
      selectedIds.add(id);
      const item = currentItems.find((entry) => String(entry?.id || '') === id);
      if (!item) throw Object.assign(new Error('A selected Langar item is no longer available.'), { status: 409 });
      const pending = previousContributions
        .filter((entry) => String(entry.itemId || '') === id && String(entry.status || 'pending').toLowerCase() === 'pending')
        .reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity || 0)), 0);
      const remaining = Math.max(0, Number(item.quantityRequired || 0) - Number(item.quantityReceived || 0) - pending);
      if (remaining < 1 || quantity > remaining) {
        throw Object.assign(new Error(`${item.name || 'A selected item'} has only ${remaining} ${item.unit || 'items'} remaining.`), { status: 409 });
      }
      return { item, id, quantity, unit: String(item.unit || 'items') };
    });

    for (const selection of normalized) {
      const id = `langar-contribution-${require('crypto').randomUUID()}`;
      const record = {
        id,
        itemId: selection.id,
        itemName: String(selection.item.name || 'Langar item'),
        quantity: selection.quantity,
        unit: selection.unit,
        donorName: String(donorName || 'Member'),
        donorEmail: String(donorEmail || '').toLowerCase(),
        donorAvatarUrl: String(donorAvatarUrl || ''),
        anonymous: Boolean(anonymous),
        expectedDeliveryDate: String(expectedDeliveryDate || ''),
        status: 'pending',
        createdAt: nowIso()
      };
      await connection.execute(
        `INSERT INTO app_items(resource, id, payload, created_at, updated_at) VALUES ('langar_contributions', ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
        [id, JSON.stringify(record)]
      );
      created.push(record);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  for (const record of created) {
    try {
      await mirrorItemResource(db, 'langar_contributions', record);
    } catch (error) {
      console.error('MySQL Langar batch contribution mirror sync failed:', error.message || error);
    }
  }
  return { data: created, content };
};

const updateItem = async (resource, id, payload = {}) => {
  const normalized = normalizeResource(resource);
  const normalizedItemId = normalizeId(id);
  const [existingRows] = await requirePool().execute(
    'SELECT payload FROM app_items WHERE resource = ? AND id = ? LIMIT 1',
    [normalized, normalizedItemId]
  );
  const record = {
    ...(existingRows.length > 0 ? parsePayload(existingRows[0].payload) : {}),
    ...payload,
    id: normalizedItemId
  };
  await requirePool().execute(
    `INSERT INTO app_items(resource, id, payload) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP(3)`,
    [normalized, normalizedItemId, JSON.stringify(record)]
  );
  try {
    await mirrorItemResource(requirePool(), normalized, record);
  } catch (error) {
    console.error('MySQL item mirror sync failed:', error.message || error);
  }
  return record;
};

const removeItem = async (resource, id) => {
  const normalized = normalizeResource(resource);
  const normalizedItemId = normalizeId(id);
  await requirePool().execute('DELETE FROM app_items WHERE resource = ? AND id = ?', [normalized, normalizedItemId]);
  try {
    await deleteItemMirror(requirePool(), normalized, normalizedItemId);
  } catch (error) {
    console.error('MySQL delete mirror sync failed:', error.message || error);
  }
  return { success: true };
};

const searchPublicContent = async (queryText, options = {}) => {
  const query = String(queryText || '').trim().toLowerCase();
  if (!query) return [];
  const limit = Math.min(50, Math.max(1, Number(options.limit || 12)));
  const scope = String(options.scope || 'public').trim().toLowerCase();
  const publicResourceConfig = {
    news_articles: { type: 'news', title: 'heading', subtitle: 'publishedAt', body: 'content', route: '/news' },
    seva_opportunities: { type: 'seva', title: 'sevaType', subtitle: 'date', body: 'notes', route: '/seva' },
    cms_pages: { type: 'cms', title: 'heroTitle', subtitle: 'heroDescription', body: 'intro', route: '' }
  };
  const adminRoutes = {
    users: ['/admin/users', 'Users'], cms_pages: ['/admin/cms', 'CMS'], cms_page_sections: ['/admin/cms', 'CMS'],
    cms_hero_slides: ['/admin/cms', 'CMS'], news_articles: ['/admin/news', 'News and Updates'], schedule_days: ['/admin/schedule', 'Daily Schedule'],
    schedule_entries: ['/admin/schedule', 'Daily Schedule'], hukamnama_entries: ['/admin/hukamnama', 'Hukamnama'], hukamnama_lines: ['/admin/hukamnama', 'Hukamnama'],
    langar_items: ['/admin/langar', 'Seva Items'], seva_opportunities: ['/admin/seva-opportunities', 'Seva Opportunities'],
    volunteer_registrations: ['/admin/seva-opportunities', 'Seva Opportunities'], gallery_albums: ['/admin/gallery', 'Gallery Folders'],
    videos: ['/admin/videos', 'Videos'], streaming_configs: ['/admin/streaming', 'Streaming'], advertisements: ['/admin/advertisements', 'Advertisements'],
    sponsors: ['/admin/sponsors', 'Sponsors'],
    subscribers: ['/admin/newsletter', 'Newsletter'], newsletter_campaigns: ['/admin/newsletter', 'Newsletter'], newsletter_topics: ['/admin/newsletter', 'Newsletter'],
    library_physical_books: ['/admin/library', 'Library'], library_digital_resources: ['/admin/library', 'Library'],
    library_program_updates: ['/admin/library', 'Library'], library_media_resources: ['/admin/library', 'Library'], roles_access: ['/admin/roles-access', 'Roles and Access'],
    roles: ['/admin/roles-access', 'Roles and Access']
  };
  const results = [];
  const events = await getEvents();
  events.forEach((event) => results.push({
    id: scope === 'admin' ? `admin-event-${event.id}` : `event-${event.id}`,
    type: scope === 'admin' ? 'admin' : 'event',
    title: event.title || '',
    subtitle: scope === 'admin' ? 'Events' : [event.date, event.location].filter(Boolean).join(' - '),
    body: event.description || '',
    route: scope === 'admin' ? '/admin/events' : '/events',
    updatedAt: event.updatedAt || event.date || ''
  }));
  const resources = scope === 'admin' ? Object.keys(adminRoutes) : Object.keys(publicResourceConfig);
  for (const resource of resources) {
    const config = publicResourceConfig[resource];
    const adminConfig = adminRoutes[resource];
    const rows = await listItems(resource);
    rows.filter((row) => scope === 'admin' || row.active !== false).forEach((row) => {
      const slug = String(row.slug || '').replace(/^\/+/, '');
      results.push({
        id: scope === 'admin' ? `admin-item-${resource}-${row.id}` : `${config.type}-${row.id}`,
        type: scope === 'admin' ? 'admin' : config.type,
        title: String(scope === 'admin'
          ? row.title || row.name || row.heading || row.heroTitle || row.subject || row.sevaType || row.email || row.id
          : row[config.title] || ''),
        subtitle: String(scope === 'admin' ? adminConfig[1] : row[config.subtitle] || ''),
        body: scope === 'admin' ? JSON.stringify(row) : String(row[config.body] || ''),
        route: scope === 'admin' ? adminConfig[0] : (config.route || `/${slug}`),
        updatedAt: row.updatedAt || row.createdAt || ''
      });
    });
  }
  if (scope === 'admin') {
    (await getDonationCampaigns()).forEach((campaign) => results.push({
      id: `admin-campaign-${campaign.id}`, type: 'admin', title: campaign.name || '', subtitle: 'Donations',
      body: `${campaign.description || ''} ${campaign.progressTitle || ''} ${campaign.progressDescription || ''}`,
      route: '/admin/donations', updatedAt: campaign.updatedAt || ''
    }));
  }
  return results
    .map((row) => {
      const haystack = `${row.title} ${row.subtitle} ${row.body}`.toLowerCase();
      const position = haystack.indexOf(query);
      return position < 0 ? null : { ...row, score: row.title.toLowerCase().includes(query) ? 2 : 1 };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || new Date(right.updatedAt || 0) - new Date(left.updatedAt || 0))
    .slice(0, limit);
};

const listQuizBankFiles = async () => {
  const [rows] = await requirePool().query('SELECT file_name, questions, updated_at FROM quiz_bank_files ORDER BY file_name');
  return rows.map((row) => ({ fileName: row.file_name, questionCount: parsePayload(row.questions, []).length, updatedAt: row.updated_at }));
};

const getQuizBankFile = async (fileName) => {
  const [rows] = await requirePool().execute('SELECT questions, updated_at FROM quiz_bank_files WHERE file_name = ? LIMIT 1', [String(fileName || '')]);
  return rows.length > 0 ? { fileName, questions: parsePayload(rows[0].questions, []), updatedAt: rows[0].updated_at } : null;
};

const upsertQuizBankFile = async (fileName, questions) => {
  await requirePool().execute(
    `INSERT INTO quiz_bank_files(file_name, questions) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE questions = VALUES(questions), updated_at = CURRENT_TIMESTAMP(3)`,
    [String(fileName || ''), JSON.stringify(Array.isArray(questions) ? questions : [])]
  );
  return getQuizBankFile(fileName);
};

const normalizeCampaign = (row = {}, { includeSecret = false } = {}) => {
  const payload = row.payload ? parsePayload(row.payload) : row;
  const { zeffyApiKey, ...publicPayload } = payload;
  const target = Number(payload.target || 0);
  const raised = Number(payload.raised || 0);
  return {
    ...publicPayload,
    id: Number(row.id ?? payload.id),
    raised,
    target,
    isActive: payload.isActive !== false,
    isClosed: target > 0 && raised >= target,
    paymentProvider: ['STRIPE', 'PAYPAL', 'ZEFFY'].includes(String(payload.paymentProvider || '').toUpperCase()) ? String(payload.paymentProvider).toUpperCase() : 'STRIPE',
    hasZeffyApiKey: Boolean(String(zeffyApiKey || '').trim()),
    ...(includeSecret ? { zeffyApiKey: String(zeffyApiKey || '').trim() } : {})
  };
};

const getDonationCampaigns = async () => {
  const [rows] = await requirePool().query('SELECT id, payload FROM donation_campaigns ORDER BY created_at DESC');
  return rows.map(normalizeCampaign);
};

const getZeffyDonationCampaigns = async () => {
  const [rows] = await requirePool().query('SELECT id, payload FROM donation_campaigns ORDER BY created_at DESC');
  return rows.map((row) => normalizeCampaign(row, { includeSecret: true }))
  .filter((entry) => entry.paymentProvider === 'ZEFFY' && entry.hasZeffyApiKey)
  .map((entry) => ({ ...entry, zeffyApiKey: String(entry.zeffyApiKey || '') }));
};

const createDonationCampaign = async (payload = {}) => {
  const record = { ...payload };
  const [result] = await requirePool().execute('INSERT INTO donation_campaigns(payload) VALUES (?)', [JSON.stringify(record)]);
  return normalizeCampaign({ id: result.insertId, ...record });
};

const updateDonationCampaign = async (id, payload = {}) => {
  const [rows] = await requirePool().execute('SELECT payload FROM donation_campaigns WHERE id = ? LIMIT 1', [Number(id)]);
  if (rows.length === 0) return null;
  const record = { ...parsePayload(rows[0].payload), ...payload, id: Number(id) };
  await requirePool().execute('UPDATE donation_campaigns SET payload = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [JSON.stringify(record), Number(id)]);
  return normalizeCampaign(record);
};

const removeDonationCampaign = async (id) => {
  await requirePool().execute('DELETE FROM donation_campaigns WHERE id = ?', [Number(id)]);
  return { success: true };
};

const normalizeDonation = (row = {}) => {
  const payload = row.payload ? parsePayload(row.payload) : row;
  return { ...payload, id: String(row.id ?? payload.id), amount: Number(payload.amount || 0) };
};

const getDonations = async () => {
  const [rows] = await requirePool().query('SELECT id, payload FROM donations WHERE deleted_at IS NULL ORDER BY created_at DESC');
  return rows.map(normalizeDonation);
};

const upsertDonation = async (record = {}) => {
  const db = requirePool();
  const id = normalizeId(record.id || `don-${Date.now()}`);
  const stripeSessionId = String(record.stripeSessionId || '').trim();
  const gatewayTransactionId = String(record.gatewayTransactionId || '').trim();
  const stripeSessionLookup = stripeSessionId || null;
  const gatewayTransactionLookup = gatewayTransactionId || null;
  const [matches] = await db.execute(
    `SELECT id FROM donations WHERE id = ?
      OR (? IS NOT NULL AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.stripeSessionId')) AS BINARY) = CAST(? AS BINARY))
      OR (? IS NOT NULL AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.gatewayTransactionId')) AS BINARY) = CAST(? AS BINARY))
     LIMIT 1`,
    [id, stripeSessionLookup, stripeSessionLookup, gatewayTransactionLookup, gatewayTransactionLookup]
  );
  const finalId = matches[0]?.id || id;
  const payload = { ...record, id: finalId, updatedAt: nowIso(), createdAt: record.createdAt || nowIso() };
  await db.execute(
    `INSERT INTO donations(id, payload, created_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), deleted_at = NULL, updated_at = CURRENT_TIMESTAMP(3)`,
    [finalId, JSON.stringify(payload), new Date(payload.createdAt)]
  );
  return normalizeDonation(payload);
};

const recalculateCampaignRaised = async (campaignId, campaignName) => {
  const campaigns = await getDonationCampaigns();
  const donations = await getDonations();
  const campaign = campaigns.find((entry) => (
    (campaignId != null && Number(entry.id) === Number(campaignId))
    || (campaignId == null && String(entry.name || '').toLowerCase() === String(campaignName || '').toLowerCase())
  ));
  if (!campaign) return;
  const raised = donations.filter((entry) => (
    (entry.campaignId != null && Number(entry.campaignId) === Number(campaign.id))
    || (entry.campaignId == null && String(entry.campaignName || '').toLowerCase() === String(campaign.name || '').toLowerCase())
  )).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  await updateDonationCampaign(campaign.id, { raised });
};

const removeDonation = async (id) => {
  const db = requirePool();
  const [rows] = await db.execute('SELECT id, payload FROM donations WHERE id = ? AND deleted_at IS NULL LIMIT 1', [normalizeId(id)]);
  if (rows.length === 0) return null;
  const removed = normalizeDonation(rows[0]);
  await db.execute('UPDATE donations SET deleted_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [normalizeId(id)]);
  await recalculateCampaignRaised(removed.campaignId, removed.campaignName);
  return removed;
};

const summarizeDonationsByCampaign = async () => {
  const summary = {};
  (await getDonations()).forEach((entry) => {
    const amount = Number(entry.amount || 0);
    if (entry.campaignId != null) summary[`id:${Number(entry.campaignId)}`] = (summary[`id:${Number(entry.campaignId)}`] || 0) + amount;
    const name = String(entry.campaignName || '').trim().toLowerCase();
    if (name) summary[`name:${name}`] = (summary[`name:${name}`] || 0) + amount;
  });
  return summary;
};

const getPendingDonations = async () => {
  const [rows] = await requirePool().query('SELECT id, payload FROM donation_pending ORDER BY created_at DESC');
  return rows.map((row) => ({ ...parsePayload(row.payload), id: row.id }));
};

const createPendingDonation = async (payload = {}) => {
  const id = normalizeId(payload.id || `pending-${Date.now()}`);
  const record = { ...payload, id, createdAt: payload.createdAt || nowIso() };
  await requirePool().execute('INSERT INTO donation_pending(id, payload, created_at) VALUES (?, ?, ?)', [id, JSON.stringify(record), new Date(record.createdAt)]);
  return record;
};

const removePendingDonation = async (id) => {
  await requirePool().execute('DELETE FROM donation_pending WHERE id = ?', [normalizeId(id)]);
  return { success: true };
};
const clearPendingDonations = async () => { await requirePool().query('DELETE FROM donation_pending'); return { success: true }; };
const clearDonations = async () => { await requirePool().query('DELETE FROM donations'); return { success: true }; };

const normalizeEvent = (row = {}, registrants = []) => {
  const payload = row.payload ? parsePayload(row.payload) : row;
  const confirmed = registrants.filter((entry) => entry.status === 'confirmed').length;
  return {
    ...payload,
    id: Number(row.id ?? payload.id),
    capacity: Math.max(0, Number(payload.capacity || 0)),
    waitlistEnabled: payload.waitlistEnabled !== false,
    registrations: confirmed,
    waitlistCount: registrants.filter((entry) => entry.status === 'waitlisted').length,
    active: payload.active !== false,
    registrants
  };
};

const getEvents = async () => {
  const db = requirePool();
  const [eventRows] = await db.query('SELECT id, payload FROM events ORDER BY JSON_UNQUOTE(JSON_EXTRACT(payload, "$.date")) ASC');
  const [registrationRows] = await db.query('SELECT id, event_id, payload, created_at FROM event_registrants ORDER BY created_at DESC');
  const byEvent = new Map();
  registrationRows.forEach((row) => {
    const payload = parsePayload(row.payload);
    const record = { ...payload, id: `evt-reg-${row.id}`, status: String(payload.status || 'confirmed').toLowerCase(), createdAt: payload.createdAt || row.created_at };
    const list = byEvent.get(Number(row.event_id)) || [];
    list.push(record);
    byEvent.set(Number(row.event_id), list);
  });
  return eventRows.map((row) => normalizeEvent(row, byEvent.get(Number(row.id)) || []));
};

const createEvent = async (payload = {}) => {
  const record = { ...payload, createdAt: payload.createdAt || nowIso(), updatedAt: nowIso() };
  const [result] = await requirePool().execute('INSERT INTO events(payload, created_at) VALUES (?, ?)', [JSON.stringify(record), new Date(record.createdAt)]);
  return normalizeEvent({ id: result.insertId, ...record }, []);
};

const updateEvent = async (id, payload = {}) => {
  const [rows] = await requirePool().execute('SELECT payload FROM events WHERE id = ? LIMIT 1', [Number(id)]);
  if (rows.length === 0) return null;
  const record = { ...parsePayload(rows[0].payload), ...payload, id: Number(id), updatedAt: nowIso() };
  await requirePool().execute('UPDATE events SET payload = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?', [JSON.stringify(record), Number(id)]);
  return (await getEvents()).find((entry) => entry.id === Number(id)) || null;
};

const removeEvent = async (id) => { await requirePool().execute('DELETE FROM events WHERE id = ?', [Number(id)]); return { success: true }; };

const registerForEvent = async ({ eventId, name, contact, email }) => {
  const db = requirePool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [eventRows] = await connection.execute('SELECT payload FROM events WHERE id = ? FOR UPDATE', [Number(eventId)]);
    if (eventRows.length === 0) { const error = new Error('Event not found.'); error.status = 404; throw error; }
    const event = parsePayload(eventRows[0].payload);
    if (event.active === false) { const error = new Error('This event is no longer open for RSVP.'); error.status = 409; throw error; }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedContactValue = String(contact || '').trim();
    const duplicateKey = normalizedEmail || normalizedContactValue.toLowerCase();
    if (!duplicateKey) { const error = new Error('Please provide an email or contact value.'); error.status = 400; throw error; }
    const [registrationRows] = await connection.execute('SELECT id, payload FROM event_registrants WHERE event_id = ? FOR UPDATE', [Number(eventId)]);
    const registrations = registrationRows.map((row) => ({ id: row.id, ...parsePayload(row.payload) }));
    if (registrations.some((entry) => String(entry.email || entry.contact || '').trim().toLowerCase() === duplicateKey)) {
      const error = new Error('You have already registered for this event.'); error.status = 409; throw error;
    }
    const capacity = Math.max(0, Number(event.capacity || 0));
    const confirmed = registrations.filter((entry) => String(entry.status || 'confirmed').toLowerCase() === 'confirmed').length;
    const status = capacity > 0 && confirmed >= capacity ? (event.waitlistEnabled !== false ? 'waitlisted' : '') : 'confirmed';
    if (!status) { const error = new Error('Event capacity has been reached.'); error.status = 409; throw error; }
    const registration = { name: name || 'Anonymous', email: normalizedEmail, contact: normalizedContactValue, status, createdAt: nowIso() };
    const [insert] = await connection.execute('INSERT INTO event_registrants(event_id, payload, created_at) VALUES (?, ?, ?)', [Number(eventId), JSON.stringify(registration), new Date(registration.createdAt)]);
    await connection.commit();
    const updated = (await getEvents()).find((entry) => entry.id === Number(eventId)) || null;
    return updated ? { ...updated, registration: { ...registration, id: `evt-reg-${insert.insertId}` } } : null;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const removeEventRegistrant = async ({ eventId, registrantId }) => {
  const connection = await requirePool().getConnection();
  let promotedRegistration = null;
  try {
    await connection.beginTransaction();
    await connection.execute('SELECT id FROM events WHERE id = ? FOR UPDATE', [Number(eventId)]);
    const numericId = Number(String(registrantId || '').replace('evt-reg-', ''));
    const [rows] = await connection.execute('SELECT payload FROM event_registrants WHERE id = ? AND event_id = ? FOR UPDATE', [numericId, Number(eventId)]);
    if (rows.length > 0) {
      const removed = parsePayload(rows[0].payload);
      await connection.execute('DELETE FROM event_registrants WHERE id = ? AND event_id = ?', [numericId, Number(eventId)]);
      if (String(removed.status || '').toLowerCase() === 'confirmed') {
        const [waiting] = await connection.execute(`SELECT id, payload FROM event_registrants WHERE event_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status')) = 'waitlisted' ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE`, [Number(eventId)]);
        if (waiting.length > 0) {
          const payload = { ...parsePayload(waiting[0].payload), status: 'confirmed' };
          await connection.execute('UPDATE event_registrants SET payload = ? WHERE id = ?', [JSON.stringify(payload), waiting[0].id]);
          promotedRegistration = { ...payload, id: `evt-reg-${waiting[0].id}` };
        }
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const updated = (await getEvents()).find((entry) => entry.id === Number(eventId)) || null;
  return updated ? { ...updated, promotedRegistration } : null;
};

const removeVolunteerRegistration = async (registrationId) => {
  const connection = await requirePool().getConnection();
  let removedRegistration = null;
  let promotedRegistration = null;
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(`SELECT id, payload FROM app_items WHERE resource = 'volunteer_registrations' AND id = ? FOR UPDATE`, [normalizeId(registrationId)]);
    if (rows.length === 0) { const error = new Error('Seva registration not found.'); error.status = 404; throw error; }
    const existing = { id: rows[0].id, ...parsePayload(rows[0].payload) };
    removedRegistration = { id: existing.id, opportunityId: String(existing.opportunityId || ''), status: String(existing.status || 'confirmed').toLowerCase() };
    await connection.execute(`DELETE FROM app_items WHERE resource = 'volunteer_registrations' AND id = ?`, [existing.id]);
    if (removedRegistration.status !== 'waitlisted' && removedRegistration.opportunityId) {
      const [waiting] = await connection.execute(`SELECT id, payload FROM app_items WHERE resource = 'volunteer_registrations' AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.opportunityId')) = ? AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(payload, '$.status'))) = 'waitlisted' ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE`, [removedRegistration.opportunityId]);
      if (waiting.length > 0) {
        const payload = { ...parsePayload(waiting[0].payload), id: waiting[0].id, status: 'confirmed' };
        await connection.execute(`UPDATE app_items SET payload = ?, updated_at = CURRENT_TIMESTAMP(3) WHERE resource = 'volunteer_registrations' AND id = ?`, [JSON.stringify(payload), waiting[0].id]);
        promotedRegistration = payload;
      }
    }
    await connection.commit();
    return { success: true, removedRegistration, promotedRegistration };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getUserRegistrationDependencies = async ({ userId, email, contact, name }) => {
  const normalizedUserId = normalizeId(userId);
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedContactValue = normalizeContact(contact);
  const normalizedName = String(name || '').trim().toLowerCase();
  const events = await getEvents();
  const eventRegistrations = events.flatMap((event) => event.registrants.filter((entry) => (
    (normalizedEmail && (String(entry.email || '').toLowerCase() === normalizedEmail || String(entry.contact || '').toLowerCase() === normalizedEmail))
    || (normalizedContactValue && normalizeContact(entry.contact) === normalizedContactValue)
    || (normalizedName && String(entry.name || '').toLowerCase() === normalizedName)
  )).map((entry) => ({ ...entry, eventId: event.id, eventTitle: event.title || '', eventDate: event.date || '' })));
  const sevaRegistrations = (await listItems('volunteer_registrations')).filter((entry) => (
    (normalizedUserId && String(entry.userId || '') === normalizedUserId)
    || (normalizedEmail && String(entry.email || '').toLowerCase() === normalizedEmail)
    || (normalizedContactValue && normalizeContact(entry.phone) === normalizedContactValue)
    || (normalizedName && String(entry.name || '').toLowerCase() === normalizedName)
  ));
  return { eventRegistrations, sevaRegistrations };
};

const markUserRegistrationsDormant = async (identity = {}) => {
  const dependencies = await getUserRegistrationDependencies(identity);
  for (const registration of dependencies.eventRegistrations) {
    const numericId = Number(String(registration.id || '').replace('evt-reg-', ''));
    await requirePool().execute(`UPDATE event_registrants SET payload = JSON_SET(payload, '$.status', 'dormant') WHERE id = ?`, [numericId]);
  }
  for (const registration of dependencies.sevaRegistrations) {
    await updateItem('volunteer_registrations', registration.id, { ...registration, status: 'dormant' });
  }
  return { eventDormantCount: dependencies.eventRegistrations.length, sevaDormantCount: dependencies.sevaRegistrations.length };
};

const purgeUserRegistrations = async (identity = {}) => {
  const dependencies = await getUserRegistrationDependencies(identity);
  const touched = new Set();
  for (const registration of dependencies.eventRegistrations) {
    touched.add(Number(registration.eventId));
    await requirePool().execute('DELETE FROM event_registrants WHERE id = ?', [Number(String(registration.id || '').replace('evt-reg-', ''))]);
  }
  for (const registration of dependencies.sevaRegistrations) {
    await removeItem('volunteer_registrations', registration.id);
  }
  return { removedEventRegistrations: dependencies.eventRegistrations.length, removedSevaRegistrations: dependencies.sevaRegistrations.length, touchedEvents: touched.size };
};

const syncRelationalMirrorsFromContentStore = async () => {
  const db = requirePool();
  const itemResourceOrder = [
    'users', 'advertisements', 'news_articles', 'gallery_albums', 'videos', 'streaming_configs',
    'subscribers', 'seva_opportunities', 'volunteer_registrations', 'donation_records', 'donations',
    'analytics_daily_metrics', 'analytics'
  ];
  for (const resource of itemResourceOrder) {
    const [rows] = await db.execute('SELECT payload FROM app_items WHERE resource = ? ORDER BY created_at, id', [resource]);
    for (const row of rows) await mirrorItemResource(db, resource, parsePayload(row.payload));
  }
  for (const resource of ['cms_home_content', 'cms_page_content', 'library_content', 'hukamnama_ssm_hukamnama_entries']) {
    const [rows] = await db.execute('SELECT payload FROM app_singletons WHERE resource = ? LIMIT 1', [resource]);
    if (rows[0]) await mirrorSingletonResource(db, resource, parsePayload(rows[0].payload));
  }
  return true;
};

const importSnapshot = async (snapshot = {}) => {
  const connection = await requirePool().getConnection();
  try {
    await connection.beginTransaction();
    for (const table of ['event_registrants', 'events', 'donations', 'donation_pending', 'donation_campaigns', 'quiz_bank_files', 'app_items', 'app_singletons']) {
      await connection.query(`DELETE FROM ${table}`);
    }
    for (const row of snapshot.singletons || []) {
      await connection.execute('INSERT INTO app_singletons(resource, payload) VALUES (?, ?)', [row.resource, JSON.stringify(row.payload ?? {})]);
    }
    for (const row of snapshot.items || []) {
      await connection.execute('INSERT INTO app_items(resource, id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)', [row.resource, row.id, JSON.stringify(row.payload ?? {}), new Date(row.createdAt || Date.now()), new Date(row.updatedAt || row.createdAt || Date.now())]);
    }
    for (const row of snapshot.quizFiles || []) {
      await connection.execute('INSERT INTO quiz_bank_files(file_name, questions) VALUES (?, ?)', [row.fileName, JSON.stringify(row.questions || [])]);
    }
    for (const campaign of snapshot.campaigns || []) {
      const { id, ...payload } = campaign;
      await connection.execute('INSERT INTO donation_campaigns(id, payload) VALUES (?, ?)', [Number(id), JSON.stringify(payload)]);
    }
    for (const donation of snapshot.donations || []) {
      await connection.execute('INSERT INTO donations(id, payload, created_at) VALUES (?, ?, ?)', [donation.id, JSON.stringify(donation), new Date(donation.createdAt || Date.now())]);
    }
    for (const pending of snapshot.pendingDonations || []) {
      await connection.execute('INSERT INTO donation_pending(id, payload, created_at) VALUES (?, ?, ?)', [pending.id, JSON.stringify(pending), new Date(pending.createdAt || Date.now())]);
    }
    for (const event of snapshot.events || []) {
      const { id, registrants = [], ...payload } = event;
      await connection.execute('INSERT INTO events(id, payload) VALUES (?, ?)', [Number(id), JSON.stringify(payload)]);
      for (const registrant of registrants) {
        const numericId = Number(String(registrant.id || '').replace('evt-reg-', ''));
        const registrationPayload = { ...registrant };
        delete registrationPayload.id;
        await connection.execute('INSERT INTO event_registrants(id, event_id, payload, created_at) VALUES (?, ?, ?, ?)', [numericId, Number(id), JSON.stringify(registrationPayload), new Date(registrant.createdAt || Date.now())]);
      }
    }
    await connection.commit();
    return getDataCounts();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const exportSnapshot = async () => {
  const db = requirePool();
  const [singletonRows] = await db.query('SELECT resource, payload, updated_at FROM app_singletons ORDER BY resource');
  const [itemRows] = await db.query('SELECT resource, id, payload, created_at, updated_at FROM app_items ORDER BY resource, id');
  const [quizRows] = await db.query('SELECT file_name, questions, updated_at FROM quiz_bank_files ORDER BY file_name');
  return {
    singletons: singletonRows.map((row) => ({ resource: row.resource, payload: parsePayload(row.payload), updatedAt: row.updated_at })),
    items: itemRows.map((row) => ({ resource: row.resource, id: row.id, payload: parsePayload(row.payload), createdAt: row.created_at, updatedAt: row.updated_at })),
    quizFiles: quizRows.map((row) => ({ fileName: row.file_name, questions: parsePayload(row.questions, []), updatedAt: row.updated_at })),
    events: await getEvents(),
    campaigns: (await db.query('SELECT id, payload FROM donation_campaigns ORDER BY created_at DESC'))[0]
      .map((row) => normalizeCampaign(row, { includeSecret: true })),
    donations: await getDonations(),
    pendingDonations: await getPendingDonations()
  };
};

const getDataCounts = async () => {
  const db = requirePool();
  const counts = {};
  for (const table of allTableNames) {
    const [rows] = await db.query(`SELECT COUNT(*) AS count FROM ${table}`);
    counts[table] = Number(rows[0]?.count || 0);
  }
  return counts;
};

module.exports = {
  hasDatabaseConnection: Boolean(pool),
  ensureEventsSchema,
  getSingleton,
  setSingleton,
  cleanupAuditLogs,
  listItems,
  searchPublicContent,
  createItem,
  createLangarContributionBatch,
  updateItem,
  removeItem,
  listQuizBankFiles,
  getQuizBankFile,
  upsertQuizBankFile,
  getDonationCampaigns,
  getZeffyDonationCampaigns,
  createDonationCampaign,
  updateDonationCampaign,
  removeDonationCampaign,
  getDonations,
  upsertDonation,
  removeDonation,
  summarizeDonationsByCampaign,
  getPendingDonations,
  createPendingDonation,
  removePendingDonation,
  clearPendingDonations,
  clearDonations,
  getEvents,
  createEvent,
  updateEvent,
  removeEvent,
  registerForEvent,
  removeEventRegistrant,
  removeVolunteerRegistration,
  getUserRegistrationDependencies,
  markUserRegistrationsDormant,
  purgeUserRegistrations,
  syncRelationalMirrorsFromContentStore,
  exportSnapshot,
  importSnapshot,
  getDataCounts,
  pool
};
