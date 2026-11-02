const { Pool } = require('pg');
const { allTableNames } = require('./mysql-relational-schema');

const toBoolean = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
const dbHost = String(process.env.DB_HOST || '').trim();
const dbPort = Number(process.env.DB_PORT || 5432);
const dbUser = String(process.env.DB_USER || '').trim();
const dbPassword = String(process.env.DB_PASSWORD || '').trim();
const dbName = String(process.env.DB_NAME || '').trim();
const dbSsl = toBoolean(process.env.DB_SSL);

const hasDiscreteConfig = Boolean(dbHost && dbUser && dbName);
const hasConnection = Boolean(databaseUrl || hasDiscreteConfig);

let pool = null;

if (hasConnection) {
  const sslConfig = dbSsl ? { rejectUnauthorized: false } : undefined;

  pool = databaseUrl
    ? new Pool({ connectionString: databaseUrl, ssl: sslConfig })
    : new Pool({
        host: dbHost,
        port: dbPort,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        ssl: sslConfig
      });
}

const ensureEventsSchema = async () => {
  if (!pool) {
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      date TIMESTAMPTZ NOT NULL,
      end_date TIMESTAMPTZ NOT NULL,
      location TEXT NOT NULL,
      category TEXT NOT NULL,
      media_url TEXT NOT NULL DEFAULT '',
      capacity INTEGER NOT NULL DEFAULT 0,
      waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      registrations INTEGER NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS media_url TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS capacity INTEGER NOT NULL DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE events
    ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS event_registrants (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      contact TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE event_registrants
    ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE event_registrants
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_event_registrants_event_id ON event_registrants(event_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_singletons (
      resource TEXT PRIMARY KEY,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_items (
      resource TEXT NOT NULL,
      id TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (resource, id)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_app_items_resource ON app_items(resource);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quiz_bank_files (
      file_name TEXT PRIMARY KEY,
      questions JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'Member',
      member_type TEXT NOT NULL DEFAULT 'Member',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      auth_provider TEXT NOT NULL DEFAULT 'LOCAL',
      avatar_url TEXT NOT NULL DEFAULT '',
      profile_title TEXT NOT NULL DEFAULT '',
      profile_description TEXT NOT NULL DEFAULT '',
      show_on_about BOOLEAN NOT NULL DEFAULT FALSE,
      registration_complete BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      approval_status TEXT NOT NULL DEFAULT 'pending',
      approval_updated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS profile_title TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS profile_description TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS show_on_about BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_pages (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      hero_title TEXT NOT NULL DEFAULT '',
      hero_description TEXT NOT NULL DEFAULT '',
      intro TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      map_embed_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_page_sections (
      id TEXT PRIMARY KEY,
      page_id TEXT NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      media_url TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cms_page_sections_page ON cms_page_sections(page_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cms_hero_slides (
      id TEXT PRIMARY KEY,
      slide_order INTEGER NOT NULL DEFAULT 1,
      image TEXT NOT NULL DEFAULT '',
      eyebrow TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      primary_cta_label TEXT NOT NULL DEFAULT '',
      primary_cta_path TEXT NOT NULL DEFAULT '',
      secondary_cta_label TEXT NOT NULL DEFAULT '',
      secondary_cta_path TEXT NOT NULL DEFAULT '',
      content_link_label TEXT NOT NULL DEFAULT '',
      content_link_path TEXT NOT NULL DEFAULT '',
      content_link_two_label TEXT NOT NULL DEFAULT '',
      content_link_two_path TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_days (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL UNIQUE,
      date_label TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      is_special BOOLEAN NOT NULL DEFAULT FALSE,
      highlight_title TEXT NOT NULL DEFAULT '',
      highlight_note_en TEXT NOT NULL DEFAULT '',
      highlight_note_pa TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedule_entries (
      id TEXT PRIMARY KEY,
      day_id TEXT NOT NULL REFERENCES schedule_days(id) ON DELETE CASCADE,
      segment TEXT NOT NULL DEFAULT 'morning',
      time_en TEXT NOT NULL DEFAULT '',
      time_pa TEXT NOT NULL DEFAULT '',
      title_en TEXT NOT NULL DEFAULT '',
      title_pa TEXT NOT NULL DEFAULT '',
      note_en TEXT NOT NULL DEFAULT '',
      note_pa TEXT NOT NULL DEFAULT '',
      is_highlighted BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_schedule_entries_day ON schedule_entries(day_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS langar_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Grocery',
      added_on DATE,
      expiry_date DATE,
      needed BOOLEAN NOT NULL DEFAULT TRUE,
      quantity_required NUMERIC(12,2) NOT NULL DEFAULT 0,
      quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'items',
      image_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query("ALTER TABLE langar_items ADD COLUMN IF NOT EXISTS quantity_required NUMERIC(12,2) NOT NULL DEFAULT 0;");
  await pool.query("ALTER TABLE langar_items ADD COLUMN IF NOT EXISTS quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0;");
  await pool.query("ALTER TABLE langar_items ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'items';");
  await pool.query("ALTER TABLE langar_items ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS advertisements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      website TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      banner_url TEXT NOT NULL DEFAULT '',
      target_link TEXT NOT NULL DEFAULT '',
      placement TEXT NOT NULL DEFAULT 'Homepage Sidebar',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS news_articles (
      id TEXT PRIMARY KEY,
      heading TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      image_links TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      published_at DATE,
      expiry_date DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gallery_albums (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      event_date DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id TEXT PRIMARY KEY,
      album_id TEXT NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gallery_images_album ON gallery_images(album_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      video_url TEXT NOT NULL DEFAULT '',
      platform TEXT NOT NULL DEFAULT 'other',
      category TEXT NOT NULL DEFAULT 'General',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      featured_date DATE,
      featured BOOLEAN NOT NULL DEFAULT FALSE,
      tags TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS streaming_configs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL DEFAULT '',
      stream_url TEXT NOT NULL DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT FALSE,
      checked_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL UNIQUE,
      interests TEXT NOT NULL DEFAULT 'Events and updates',
      source TEXT NOT NULL DEFAULT 'Website',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS seva_opportunities (
      id TEXT PRIMARY KEY,
      seva_type TEXT NOT NULL,
      seva_date DATE NOT NULL,
      seva_time TEXT NOT NULL DEFAULT '',
      total_volunteers_required INTEGER NOT NULL DEFAULT 1,
      waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      expiry_date DATE,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE seva_opportunities
    ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS volunteer_registrations (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
      opportunity_id TEXT REFERENCES seva_opportunities(id) ON DELETE SET NULL,
      name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      whatsapp TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      seva_type TEXT NOT NULL DEFAULT '',
      seva_date DATE,
      seva_time TEXT NOT NULL DEFAULT '',
      contact_preference TEXT NOT NULL DEFAULT 'Email',
      wants_event_emails BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_volunteer_registrations_opportunity ON volunteer_registrations(opportunity_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_physical_books (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'General',
      isbn TEXT NOT NULL DEFAULT '',
      total_copies INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_issue_records (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL REFERENCES library_physical_books(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
      copy_number INTEGER NOT NULL DEFAULT 1,
      issuer_name TEXT NOT NULL DEFAULT '',
      issuer_phone TEXT NOT NULL DEFAULT '',
      issue_date DATE,
      return_date DATE,
      returned_at DATE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_library_issue_records_book ON library_issue_records(book_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_digital_resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      file_type TEXT NOT NULL DEFAULT 'PDF',
      description TEXT NOT NULL DEFAULT '',
      download_url TEXT NOT NULL DEFAULT '',
      cover_image_url TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_program_updates (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      speaker TEXT NOT NULL DEFAULT '',
      audience TEXT NOT NULL DEFAULT '',
      schedule_date DATE,
      schedule_time TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      registration_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS library_media_resources (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'youtube',
      url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      thumbnail_url TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hukamnama_entries (
      id TEXT PRIMARY KEY,
      ang INTEGER NOT NULL,
      entry_date DATE NOT NULL,
      slot TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      audio_url TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(entry_date, slot)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hukamnama_lines (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES hukamnama_entries(id) ON DELETE CASCADE,
      line_no INTEGER NOT NULL DEFAULT 1,
      gurmukhi TEXT NOT NULL DEFAULT '',
      translation_english TEXT NOT NULL DEFAULT '',
      translation_punjabi TEXT NOT NULL DEFAULT '',
      transliteration TEXT NOT NULL DEFAULT ''
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_hukamnama_lines_entry ON hukamnama_lines(entry_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS donation_records (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES admin_users(id) ON DELETE SET NULL,
      donor_name TEXT NOT NULL DEFAULT '',
      donor_email TEXT NOT NULL DEFAULT '',
      amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'cad',
      purpose TEXT NOT NULL DEFAULT '',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      payment_provider TEXT NOT NULL DEFAULT 'stripe',
      payment_reference TEXT NOT NULL DEFAULT '',
      donated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS langar_contributions (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL DEFAULT '',
      quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'items',
      donor_name TEXT NOT NULL DEFAULT '',
      donor_email TEXT NOT NULL DEFAULT '',
      anonymous BOOLEAN NOT NULL DEFAULT FALSE,
      expected_delivery_date DATE,
      status TEXT NOT NULL DEFAULT 'pending',
      received_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query('ALTER TABLE langar_contributions ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_langar_contributions_item ON langar_contributions(item_id);');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_langar_contributions_email ON langar_contributions(donor_email);');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS analytics_daily_metrics (
      metric_date DATE PRIMARY KEY,
      total_visits INTEGER NOT NULL DEFAULT 0,
      unique_visitors INTEGER NOT NULL DEFAULT 0,
      event_registrations INTEGER NOT NULL DEFAULT 0,
      seva_registrations INTEGER NOT NULL DEFAULT 0,
      donations_count INTEGER NOT NULL DEFAULT 0,
      donations_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS donation_campaigns (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      progress_title TEXT NOT NULL DEFAULT '',
      progress_description TEXT NOT NULL DEFAULT '',
      progress_photos JSONB NOT NULL DEFAULT '[]'::jsonb,
      progress_updates JSONB NOT NULL DEFAULT '[]'::jsonb,
      progress_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      story_blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
      raised NUMERIC(12, 2) NOT NULL DEFAULT 0,
      target NUMERIC(12, 2) NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      payment_provider TEXT NOT NULL DEFAULT 'STRIPE',
      payment_link TEXT NOT NULL DEFAULT '',
      stripe_buy_button_id TEXT NOT NULL DEFAULT '',
      stripe_publishable_key TEXT NOT NULL DEFAULT '',
      zeffy_api_key TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS progress_title TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS progress_description TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS progress_photos JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS progress_updates JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS progress_items JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS story_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await pool.query(`
    ALTER TABLE donation_campaigns
    ADD COLUMN IF NOT EXISTS zeffy_api_key TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_donation_campaigns_active ON donation_campaigns(is_active);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS donation_pending (
      id TEXT PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES donation_campaigns(id) ON DELETE CASCADE,
      campaign_name TEXT NOT NULL,
      donor_name TEXT NOT NULL DEFAULT 'Anonymous',
      donor_email TEXT NOT NULL DEFAULT '',
      donor_phone TEXT NOT NULL DEFAULT '',
      amount NUMERIC(12, 2),
      frequency TEXT NOT NULL DEFAULT 'one-time',
      payment_provider TEXT NOT NULL DEFAULT 'STRIPE',
      checkout_url TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE donations
    ADD COLUMN IF NOT EXISTS donor_phone TEXT NOT NULL DEFAULT '';
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_donation_pending_campaign ON donation_pending(campaign_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_donation_pending_created ON donation_pending(created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      source_pending_id TEXT,
      campaign_id BIGINT REFERENCES donation_campaigns(id) ON DELETE SET NULL,
      campaign_name TEXT NOT NULL,
      donor_name TEXT NOT NULL DEFAULT 'Anonymous',
      donor_email TEXT NOT NULL DEFAULT '',
      amount NUMERIC(12, 2) NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'one-time',
      payment_provider TEXT NOT NULL DEFAULT 'STRIPE',
      payment_status TEXT NOT NULL DEFAULT 'PAID',
      gateway_transaction_id TEXT NOT NULL DEFAULT '',
      stripe_session_id TEXT NOT NULL DEFAULT '',
      stripe_event_id TEXT NOT NULL DEFAULT '',
      email_sent BOOLEAN NOT NULL DEFAULT FALSE,
      source TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_donations_receipt_id UNIQUE (receipt_id)
    );
  `);

  await pool.query(`
    ALTER TABLE donations
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_donations_campaign_id ON donations(campaign_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_donations_created ON donations(created_at DESC);
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_donations_stripe_session
    ON donations(stripe_session_id)
    WHERE stripe_session_id <> '';
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_donations_gateway_txn
    ON donations(gateway_transaction_id)
    WHERE gateway_transaction_id <> '';
  `);

  return true;
};

const toDateValue = (value) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const iso = parsed.toISOString();
  return iso.slice(0, 10);
};

const mirrorItemResource = async (resource, payload) => {
  if (!pool) {
    return;
  }

  const item = payload || {};

  if (resource === 'users') {
    await pool.query(
      `
      INSERT INTO admin_users(
        id, name, email, role, member_type, phone, address, auth_provider, avatar_url,
        profile_title, profile_description, show_on_about, registration_complete,
        is_active, approval_status, approval_updated_at, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16,
        COALESCE($17::timestamptz, NOW()), COALESCE($18::timestamptz, NOW())
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        member_type = EXCLUDED.member_type,
        phone = EXCLUDED.phone,
        address = EXCLUDED.address,
        auth_provider = EXCLUDED.auth_provider,
        avatar_url = EXCLUDED.avatar_url,
        profile_title = EXCLUDED.profile_title,
        profile_description = EXCLUDED.profile_description,
        show_on_about = EXCLUDED.show_on_about,
        registration_complete = EXCLUDED.registration_complete,
        is_active = EXCLUDED.is_active,
        approval_status = EXCLUDED.approval_status,
        approval_updated_at = EXCLUDED.approval_updated_at,
        updated_at = NOW();
      `,
      [
        item.id,
        item.name || '',
        String(item.email || '').toLowerCase(),
        item.role || 'Member',
        item.memberType || 'Member',
        item.phone || '',
        item.address || '',
        item.authProvider || 'LOCAL',
        item.avatarUrl || '',
        item.title || '',
        item.description || '',
        item.showOnAbout === true,
        Boolean(item.registrationComplete),
        item.isActive !== false,
        item.approvalStatus || 'pending',
        item.approvalUpdatedAt || null,
        item.createdAt || null,
        item.updatedAt || null
      ]
    );
    return;
  }

  if (resource === 'advertisements') {
    await pool.query(
      `
      INSERT INTO advertisements(id, title, content, website, image_url, banner_url, target_link, placement, active, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        content=EXCLUDED.content,
        website=EXCLUDED.website,
        image_url=EXCLUDED.image_url,
        banner_url=EXCLUDED.banner_url,
        target_link=EXCLUDED.target_link,
        placement=EXCLUDED.placement,
        active=EXCLUDED.active,
        updated_at=NOW();
      `,
      [item.id, item.title || '', item.content || '', item.website || '', item.imageUrl || '', item.bannerUrl || '', item.targetLink || '', item.placement || 'Homepage Sidebar', item.active !== false, item.updatedAt || null]
    );
    return;
  }

  if (resource === 'news_articles') {
    await pool.query(
      `
      INSERT INTO news_articles(id, heading, content, links, image_links, published_at, expiry_date, active, updated_at)
      VALUES ($1,$2,$3,$4::text[],$5::text[],$6::date,$7::date,$8,COALESCE($9::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        heading=EXCLUDED.heading,
        content=EXCLUDED.content,
        links=EXCLUDED.links,
        image_links=EXCLUDED.image_links,
        published_at=EXCLUDED.published_at,
        expiry_date=EXCLUDED.expiry_date,
        active=EXCLUDED.active,
        updated_at=NOW();
      `,
      [
        item.id,
        item.heading || item.title || '',
        item.content || '',
        Array.isArray(item.links) ? item.links : [],
        Array.isArray(item.imageLinks) ? item.imageLinks : [],
        toDateValue(item.publishedAt),
        toDateValue(item.expiryDate),
        item.active !== false,
        item.updatedAt || null
      ]
    );
    return;
  }

  if (resource === 'gallery_albums') {
    await pool.query(
      `
      INSERT INTO gallery_albums(id, title, description, cover_url, event_date, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5::date,COALESCE($6::timestamptz,NOW()),COALESCE($7::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        description=EXCLUDED.description,
        cover_url=EXCLUDED.cover_url,
        event_date=EXCLUDED.event_date,
        updated_at=NOW();
      `,
      [item.id, item.title || '', item.description || '', item.coverUrl || '', toDateValue(item.eventDate), item.createdAt || null, item.updatedAt || null]
    );

    await pool.query('DELETE FROM gallery_images WHERE album_id = $1;', [item.id]);
    const images = Array.isArray(item.images) ? item.images : [];
    for (const image of images) {
      await pool.query(
        `
        INSERT INTO gallery_images(id, album_id, title, caption, url, created_at)
        VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz,NOW()))
        ON CONFLICT (id) DO UPDATE SET
          album_id=EXCLUDED.album_id,
          title=EXCLUDED.title,
          caption=EXCLUDED.caption,
          url=EXCLUDED.url,
          created_at=EXCLUDED.created_at;
        `,
        [image.id, item.id, image.title || '', image.caption || '', image.url || '', image.createdAt || null]
      );
    }
    return;
  }

  if (resource === 'videos') {
    await pool.query(
      `
      INSERT INTO videos(id, title, description, video_url, platform, category, thumbnail_url, featured_date, featured, tags, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,COALESCE($11::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        description=EXCLUDED.description,
        video_url=EXCLUDED.video_url,
        platform=EXCLUDED.platform,
        category=EXCLUDED.category,
        thumbnail_url=EXCLUDED.thumbnail_url,
        featured_date=EXCLUDED.featured_date,
        featured=EXCLUDED.featured,
        tags=EXCLUDED.tags,
        updated_at=NOW();
      `,
      [item.id, item.title || '', item.description || '', item.videoUrl || '', item.platform || 'other', item.category || 'General', item.thumbnailUrl || '', toDateValue(item.featuredDate), Boolean(item.featured), item.tags || '', item.updatedAt || null]
    );
    return;
  }

  if (resource === 'streaming_configs') {
    await pool.query(
      `
      INSERT INTO streaming_configs(id, title, text, stream_url, active, checked_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6::timestamptz,COALESCE($7::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        title=EXCLUDED.title,
        text=EXCLUDED.text,
        stream_url=EXCLUDED.stream_url,
        active=EXCLUDED.active,
        checked_at=EXCLUDED.checked_at,
        updated_at=NOW();
      `,
      [item.id, item.title || '', item.text || '', item.streamUrl || '', Boolean(item.active), item.checkedAt || null, item.updatedAt || null]
    );
    return;
  }

  if (resource === 'subscribers') {
    await pool.query(
      `
      INSERT INTO subscribers(id, name, email, interests, source, active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        name=EXCLUDED.name,
        email=EXCLUDED.email,
        interests=EXCLUDED.interests,
        source=EXCLUDED.source,
        active=EXCLUDED.active;
      `,
      [item.id, item.name || '', String(item.email || '').toLowerCase(), item.interests || 'Events and updates', item.source || 'Website', item.active !== false, item.createdAt || null]
    );
    return;
  }

  if (resource === 'seva_opportunities') {
    await pool.query(
      `
      INSERT INTO seva_opportunities(id, seva_type, seva_date, seva_time, total_volunteers_required, waitlist_enabled, expiry_date, active, updated_at)
      VALUES ($1,$2,$3::date,$4,$5,$6,$7::date,$8,COALESCE($9::timestamptz,NOW()))
      ON CONFLICT (id) DO UPDATE SET
        seva_type=EXCLUDED.seva_type,
        seva_date=EXCLUDED.seva_date,
        seva_time=EXCLUDED.seva_time,
        total_volunteers_required=EXCLUDED.total_volunteers_required,
        waitlist_enabled=EXCLUDED.waitlist_enabled,
        expiry_date=EXCLUDED.expiry_date,
        active=EXCLUDED.active,
        updated_at=NOW();
      `,
      [item.id, item.sevaType || '', toDateValue(item.date), item.time || '', Math.max(1, Number(item.totalVolunteersRequired) || 1), item.waitlistEnabled !== false, toDateValue(item.expiryDate), item.active !== false, item.updatedAt || null]
    );
    return;
  }

  if (resource === 'volunteer_registrations') {
    await pool.query(
      `
      INSERT INTO volunteer_registrations(
        id, user_id, opportunity_id, name, email, phone, whatsapp, area, seva_type, seva_date, seva_time,
        contact_preference, wants_event_emails, notes, status, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11,$12,$13,$14,$15,COALESCE($16::timestamptz,NOW())
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id=EXCLUDED.user_id,
        opportunity_id=EXCLUDED.opportunity_id,
        name=EXCLUDED.name,
        email=EXCLUDED.email,
        phone=EXCLUDED.phone,
        whatsapp=EXCLUDED.whatsapp,
        area=EXCLUDED.area,
        seva_type=EXCLUDED.seva_type,
        seva_date=EXCLUDED.seva_date,
        seva_time=EXCLUDED.seva_time,
        contact_preference=EXCLUDED.contact_preference,
        wants_event_emails=EXCLUDED.wants_event_emails,
        notes=EXCLUDED.notes,
        status=EXCLUDED.status;
      `,
      [
        item.id,
        item.userId || null,
        item.opportunityId || null,
        item.name || '',
        item.email || '',
        item.phone || '',
        item.whatsapp || '',
        item.area || '',
        item.sevaType || '',
        toDateValue(item.sevaDate || item.date),
        item.sevaTime || '',
        item.contactPreference || 'Email',
        Boolean(item.wantsEventEmails),
        item.notes || '',
        item.status || 'Pending',
        item.createdAt || null
      ]
    );
    return;
  }

  if (resource === 'donation_records' || resource === 'donations') {
    await pool.query(
      `
      INSERT INTO donation_records(
        id, user_id, donor_name, donor_email, amount, currency, purpose,
        payment_status, payment_provider, payment_reference, donated_at, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11::timestamptz,COALESCE($12::timestamptz,NOW()),COALESCE($13::timestamptz,NOW())
      )
      ON CONFLICT (id) DO UPDATE SET
        user_id=EXCLUDED.user_id,
        donor_name=EXCLUDED.donor_name,
        donor_email=EXCLUDED.donor_email,
        amount=EXCLUDED.amount,
        currency=EXCLUDED.currency,
        purpose=EXCLUDED.purpose,
        payment_status=EXCLUDED.payment_status,
        payment_provider=EXCLUDED.payment_provider,
        payment_reference=EXCLUDED.payment_reference,
        donated_at=EXCLUDED.donated_at,
        updated_at=NOW();
      `,
      [
        item.id,
        item.userId || null,
        item.donorName || item.name || '',
        String(item.donorEmail || item.email || '').toLowerCase(),
        Number(item.amount || 0),
        item.currency || 'cad',
        item.purpose || '',
        item.paymentStatus || item.status || 'pending',
        item.paymentProvider || 'stripe',
        item.paymentReference || item.reference || '',
        item.donatedAt || null,
        item.createdAt || null,
        item.updatedAt || null
      ]
    );
    return;
  }

  if (resource === 'analytics_daily_metrics' || resource === 'analytics') {
    await pool.query(
      `
      INSERT INTO analytics_daily_metrics(
        metric_date, total_visits, unique_visitors, event_registrations, seva_registrations,
        donations_count, donations_amount, created_at, updated_at
      ) VALUES (
        $1::date,$2,$3,$4,$5,
        $6,$7,COALESCE($8::timestamptz,NOW()),COALESCE($9::timestamptz,NOW())
      )
      ON CONFLICT (metric_date) DO UPDATE SET
        total_visits=EXCLUDED.total_visits,
        unique_visitors=EXCLUDED.unique_visitors,
        event_registrations=EXCLUDED.event_registrations,
        seva_registrations=EXCLUDED.seva_registrations,
        donations_count=EXCLUDED.donations_count,
        donations_amount=EXCLUDED.donations_amount,
        updated_at=NOW();
      `,
      [
        toDateValue(item.metricDate || item.date || new Date()),
        Number(item.totalVisits || 0),
        Number(item.uniqueVisitors || 0),
        Number(item.eventRegistrations || 0),
        Number(item.sevaRegistrations || 0),
        Number(item.donationsCount || 0),
        Number(item.donationsAmount || 0),
        item.createdAt || null,
        item.updatedAt || null
      ]
    );
    return;
  }
};

const mirrorDeleteResource = async (resource, id) => {
  if (!pool) {
    return;
  }

  const tableMap = {
    users: 'admin_users',
    advertisements: 'advertisements',
    news_articles: 'news_articles',
    gallery_albums: 'gallery_albums',
    videos: 'videos',
    streaming_configs: 'streaming_configs',
    subscribers: 'subscribers',
    seva_opportunities: 'seva_opportunities',
    volunteer_registrations: 'volunteer_registrations',
    donations: 'donation_records',
    donation_records: 'donation_records'
  };

  const tableName = tableMap[resource];
  if (!tableName) {
    return;
  }

  await pool.query(`DELETE FROM ${tableName} WHERE id = $1;`, [String(id || '').trim()]);
};

const mirrorSingletonResource = async (resource, payload) => {
  if (!pool) {
    return;
  }

  const value = payload || {};

  if (resource === 'cms_home_content') {
    const heroSlides = Array.isArray(value?.hero?.slides) ? value.hero.slides : [];
    const scheduleDays = Array.isArray(value?.scheduleDays) ? value.scheduleDays : [];
    const langarItems = Array.isArray(value?.langarItems) ? value.langarItems : [];

    await pool.query('DELETE FROM cms_hero_slides;');
    for (const slide of heroSlides) {
      await pool.query(
        `
        INSERT INTO cms_hero_slides(
          id, slide_order, image, eyebrow, title, description,
          primary_cta_label, primary_cta_path, secondary_cta_label, secondary_cta_path,
          content_link_label, content_link_path, content_link_two_label, content_link_two_path, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,
          $7,$8,$9,$10,
          $11,$12,$13,$14,COALESCE($15::timestamptz,NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
          slide_order=EXCLUDED.slide_order,
          image=EXCLUDED.image,
          eyebrow=EXCLUDED.eyebrow,
          title=EXCLUDED.title,
          description=EXCLUDED.description,
          primary_cta_label=EXCLUDED.primary_cta_label,
          primary_cta_path=EXCLUDED.primary_cta_path,
          secondary_cta_label=EXCLUDED.secondary_cta_label,
          secondary_cta_path=EXCLUDED.secondary_cta_path,
          content_link_label=EXCLUDED.content_link_label,
          content_link_path=EXCLUDED.content_link_path,
          content_link_two_label=EXCLUDED.content_link_two_label,
          content_link_two_path=EXCLUDED.content_link_two_path,
          updated_at=NOW();
        `,
        [
          slide.id,
          Number(slide.order || 1),
          slide.image || '',
          slide.eyebrow || '',
          slide.title || '',
          slide.description || '',
          slide.primaryCtaLabel || '',
          slide.primaryCtaPath || '',
          slide.secondaryCtaLabel || '',
          slide.secondaryCtaPath || '',
          slide.contentLinkLabel || '',
          slide.contentLinkPath || '',
          slide.contentLinkTwoLabel || '',
          slide.contentLinkTwoPath || '',
          slide.updatedAt || null
        ]
      );
    }

    await pool.query('DELETE FROM schedule_entries;');
    await pool.query('DELETE FROM schedule_days;');
    for (const day of scheduleDays) {
      await pool.query(
        `
        INSERT INTO schedule_days(id, date_key, date_label, title, is_special, highlight_title, highlight_note_en, highlight_note_pa, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (id) DO UPDATE SET
          date_key=EXCLUDED.date_key,
          date_label=EXCLUDED.date_label,
          title=EXCLUDED.title,
          is_special=EXCLUDED.is_special,
          highlight_title=EXCLUDED.highlight_title,
          highlight_note_en=EXCLUDED.highlight_note_en,
          highlight_note_pa=EXCLUDED.highlight_note_pa,
          updated_at=NOW();
        `,
        [day.id, day.dateKey || 'default', day.dateLabel || '', day.title || '', Boolean(day.isSpecial), day.highlightTitle || '', day.highlightNoteEn || '', day.highlightNotePa || '']
      );

      const entries = Array.isArray(day.entries) ? day.entries : [];
      for (const entry of entries) {
        await pool.query(
          `
          INSERT INTO schedule_entries(
            id, day_id, segment, time_en, time_pa, title_en, title_pa,
            note_en, note_pa, is_highlighted, is_active, sort_order, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,
            $8,$9,$10,$11,$12,NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            day_id=EXCLUDED.day_id,
            segment=EXCLUDED.segment,
            time_en=EXCLUDED.time_en,
            time_pa=EXCLUDED.time_pa,
            title_en=EXCLUDED.title_en,
            title_pa=EXCLUDED.title_pa,
            note_en=EXCLUDED.note_en,
            note_pa=EXCLUDED.note_pa,
            is_highlighted=EXCLUDED.is_highlighted,
            is_active=EXCLUDED.is_active,
            sort_order=EXCLUDED.sort_order,
            updated_at=NOW();
          `,
          [
            entry.id,
            day.id,
            entry.segment || 'morning',
            entry.timeEn || '',
            entry.timePa || '',
            entry.titleEn || '',
            entry.titlePa || '',
            entry.noteEn || '',
            entry.notePa || '',
            Boolean(entry.isHighlighted),
            entry.isActive !== false,
            Number(entry.sortOrder || 1)
          ]
        );
      }
    }

    await pool.query('DELETE FROM langar_items;');
    for (const item of langarItems) {
      await pool.query(
        `
        INSERT INTO langar_items(id, name, category, added_on, expiry_date, needed, updated_at)
        VALUES ($1,$2,$3,$4::date,$5::date,$6,NOW())
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name,
          category=EXCLUDED.category,
          added_on=EXCLUDED.added_on,
          expiry_date=EXCLUDED.expiry_date,
          needed=EXCLUDED.needed,
          updated_at=NOW();
        `,
        [item.id, item.name || '', item.category || 'Grocery', toDateValue(item.addedOn), toDateValue(item.expiryDate), item.needed !== false]
      );
    }
    return;
  }

  if (resource === 'cms_page_content') {
    const pages = value || {};
    await pool.query('DELETE FROM cms_page_sections;');
    await pool.query('DELETE FROM cms_pages;');

    for (const [slug, page] of Object.entries(pages)) {
      // Keep tombstones in the singleton, not in the searchable relational mirror.
      if (!page || page.deleted === true) continue;
      const pageId = page.id || `page-${slug}`;
      await pool.query(
        `
        INSERT INTO cms_pages(id, slug, hero_title, hero_description, intro, media_url, phone, email, address, map_embed_url, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (id) DO UPDATE SET
          slug=EXCLUDED.slug,
          hero_title=EXCLUDED.hero_title,
          hero_description=EXCLUDED.hero_description,
          intro=EXCLUDED.intro,
          media_url=EXCLUDED.media_url,
          phone=EXCLUDED.phone,
          email=EXCLUDED.email,
          address=EXCLUDED.address,
          map_embed_url=EXCLUDED.map_embed_url,
          updated_at=NOW();
        `,
        [
          pageId,
          slug,
          page.heroTitle || '',
          page.heroDescription || '',
          page.intro || '',
          page.mediaUrl || '',
          page.phone || '',
          page.email || '',
          page.address || '',
          page.mapEmbedUrl || ''
        ]
      );

      const sections = Array.isArray(page.sections) ? page.sections : [];
      for (const section of sections) {
        await pool.query(
          `
          INSERT INTO cms_page_sections(id, page_id, title, body, media_url, sort_order, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,NOW())
          ON CONFLICT (id) DO UPDATE SET
            page_id=EXCLUDED.page_id,
            title=EXCLUDED.title,
            body=EXCLUDED.body,
            media_url=EXCLUDED.media_url,
            sort_order=EXCLUDED.sort_order,
            updated_at=NOW();
          `,
          [section.id, pageId, section.title || '', section.body || '', section.mediaUrl || '', Number(section.sortOrder || 1)]
        );
      }
    }
    return;
  }

  if (resource === 'library_content') {
    const books = Array.isArray(value.physicalBooks) ? value.physicalBooks : [];
    const digital = Array.isArray(value.digitalResources) ? value.digitalResources : [];
    const updates = Array.isArray(value.programUpdates) ? value.programUpdates : [];
    const media = Array.isArray(value.mediaResources) ? value.mediaResources : [];

    await pool.query('DELETE FROM library_issue_records;');
    await pool.query('DELETE FROM library_physical_books;');
    for (const book of books) {
      await pool.query(
        `
        INSERT INTO library_physical_books(id, title, author, category, isbn, total_copies, notes, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,NOW()))
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          author=EXCLUDED.author,
          category=EXCLUDED.category,
          isbn=EXCLUDED.isbn,
          total_copies=EXCLUDED.total_copies,
          notes=EXCLUDED.notes,
          updated_at=NOW();
        `,
        [book.id, book.title || '', book.author || '', book.category || 'General', book.isbn || '', Number(book.totalCopies || 0), book.notes || '', book.updatedAt || null]
      );

      const issues = Array.isArray(book.issueRecords) ? book.issueRecords : [];
      for (const issue of issues) {
        await pool.query(
          `
          INSERT INTO library_issue_records(
            id, book_id, user_id, copy_number, issuer_name, issuer_phone, issue_date, return_date, returned_at, updated_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7::date,$8::date,$9::date,NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            book_id=EXCLUDED.book_id,
            user_id=EXCLUDED.user_id,
            copy_number=EXCLUDED.copy_number,
            issuer_name=EXCLUDED.issuer_name,
            issuer_phone=EXCLUDED.issuer_phone,
            issue_date=EXCLUDED.issue_date,
            return_date=EXCLUDED.return_date,
            returned_at=EXCLUDED.returned_at,
            updated_at=NOW();
          `,
          [
            issue.id,
            book.id,
            issue.userId || null,
            Number(issue.copyNumber || 1),
            issue.issuerName || '',
            issue.issuerPhone || '',
            toDateValue(issue.issueDate),
            toDateValue(issue.returnDate),
            toDateValue(issue.returnedAt)
          ]
        );
      }
    }

    await pool.query('DELETE FROM library_digital_resources;');
    for (const item of digital) {
      await pool.query(
        `
        INSERT INTO library_digital_resources(id, title, file_type, description, download_url, cover_image_url, tags, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,NOW()))
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          file_type=EXCLUDED.file_type,
          description=EXCLUDED.description,
          download_url=EXCLUDED.download_url,
          cover_image_url=EXCLUDED.cover_image_url,
          tags=EXCLUDED.tags,
          updated_at=NOW();
        `,
        [item.id, item.title || '', item.fileType || 'PDF', item.description || '', item.downloadUrl || '', item.coverImageUrl || '', item.tags || '', item.updatedAt || null]
      );
    }

    await pool.query('DELETE FROM library_program_updates;');
    for (const item of updates) {
      await pool.query(
        `
        INSERT INTO library_program_updates(id, title, speaker, audience, schedule_date, schedule_time, location, summary, image_url, registration_url, updated_at)
        VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,COALESCE($11::timestamptz,NOW()))
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          speaker=EXCLUDED.speaker,
          audience=EXCLUDED.audience,
          schedule_date=EXCLUDED.schedule_date,
          schedule_time=EXCLUDED.schedule_time,
          location=EXCLUDED.location,
          summary=EXCLUDED.summary,
          image_url=EXCLUDED.image_url,
          registration_url=EXCLUDED.registration_url,
          updated_at=NOW();
        `,
        [item.id, item.title || '', item.speaker || '', item.audience || '', toDateValue(item.scheduleDate), item.scheduleTime || '', item.location || '', item.summary || '', item.imageUrl || '', item.registrationUrl || '', item.updatedAt || null]
      );
    }

    await pool.query('DELETE FROM library_media_resources;');
    for (const item of media) {
      await pool.query(
        `
        INSERT INTO library_media_resources(id, title, media_type, url, description, thumbnail_url, tags, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,NOW()))
        ON CONFLICT (id) DO UPDATE SET
          title=EXCLUDED.title,
          media_type=EXCLUDED.media_type,
          url=EXCLUDED.url,
          description=EXCLUDED.description,
          thumbnail_url=EXCLUDED.thumbnail_url,
          tags=EXCLUDED.tags,
          updated_at=NOW();
        `,
        [item.id, item.title || '', item.mediaType || 'youtube', item.url || '', item.description || '', item.thumbnailUrl || '', item.tags || '', item.updatedAt || null]
      );
    }

    return;
  }

  if (resource === 'hukamnama_ssm_hukamnama_entries') {
    const byDate = value || {};
    await pool.query('DELETE FROM hukamnama_lines;');
    await pool.query('DELETE FROM hukamnama_entries;');

    for (const [dateKey, slots] of Object.entries(byDate)) {
      for (const slotName of ['morning', 'evening']) {
        const entry = slots?.[slotName];
        if (!entry) {
          continue;
        }

        const entryId = entry.id || `hukamnama-${dateKey}-${slotName}`;
        await pool.query(
          `
          INSERT INTO hukamnama_entries(id, ang, entry_date, slot, source, metadata, audio_url, updated_at)
          VALUES ($1,$2,$3::date,$4,$5,$6::jsonb,$7,COALESCE($8::timestamptz,NOW()))
          ON CONFLICT (id) DO UPDATE SET
            ang=EXCLUDED.ang,
            entry_date=EXCLUDED.entry_date,
            slot=EXCLUDED.slot,
            source=EXCLUDED.source,
            metadata=EXCLUDED.metadata,
            audio_url=EXCLUDED.audio_url,
            updated_at=NOW();
          `,
          [
            entryId,
            Math.max(1, Number(entry.ang || 1)),
            toDateValue(entry.date || dateKey),
            entry.slot || slotName,
            entry.source || '',
            JSON.stringify(entry.metadata || {}),
            entry.audioUrl || '',
            entry.updatedAt || null
          ]
        );

        const lines = Array.isArray(entry.lines) ? entry.lines : [];
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i] || {};
          await pool.query(
            `
            INSERT INTO hukamnama_lines(id, entry_id, line_no, gurmukhi, translation_english, translation_punjabi, transliteration)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (id) DO UPDATE SET
              entry_id=EXCLUDED.entry_id,
              line_no=EXCLUDED.line_no,
              gurmukhi=EXCLUDED.gurmukhi,
              translation_english=EXCLUDED.translation_english,
              translation_punjabi=EXCLUDED.translation_punjabi,
              transliteration=EXCLUDED.transliteration;
            `,
            [
              line.id || `${entryId}-line-${i + 1}`,
              entryId,
              Number(line.lineNo || i + 1),
              line.gurmukhi || '',
              line.translationEnglish || '',
              line.translationPunjabi || '',
              line.transliteration || ''
            ]
          );
        }
      }
    }
  }
};

const getSingleton = async (resource, fallback = null) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT payload
    FROM app_singletons
    WHERE resource = $1
    LIMIT 1;
    `,
    [String(resource || '').trim()]
  );

  if (!result.rows?.[0]) {
    return fallback;
  }

  return result.rows[0].payload;
};

const setSingleton = async (resource, payload) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    INSERT INTO app_singletons(resource, payload, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (resource)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    RETURNING payload;
    `,
    [String(resource || '').trim(), JSON.stringify(payload || {})]
  );

  try {
    await mirrorSingletonResource(String(resource || '').trim(), payload || {});
  } catch (error) {
    console.error('Singleton mirror sync failed:', error.message || error);
  }

  return result.rows?.[0]?.payload || payload;
};

const listItems = async (resource) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const normalizedResource = String(resource || '').trim();

  if (normalizedResource === 'seva_opportunities') {
    const result = await pool.query(
      `
      SELECT
        id,
        seva_type,
        seva_date,
        seva_time,
        total_volunteers_required,
        waitlist_enabled,
        expiry_date,
        active,
        updated_at
      FROM seva_opportunities
      ORDER BY updated_at DESC, seva_date DESC, id ASC;
      `
    );

    return result.rows.map((row) => ({
      id: String(row.id || ''),
      sevaType: row.seva_type || '',
      date: row.seva_date || '',
      time: row.seva_time || '',
      totalVolunteersRequired: Number(row.total_volunteers_required || 0),
      waitlistEnabled: row.waitlist_enabled !== false,
      expiryDate: row.expiry_date || '',
      active: row.active !== false,
      updatedAt: row.updated_at || ''
    }));
  }

  if (normalizedResource === 'volunteer_registrations') {
    const result = await pool.query(
      `
      SELECT
        id,
        user_id,
        opportunity_id,
        name,
        email,
        phone,
        whatsapp,
        area,
        seva_type,
        seva_date,
        seva_time,
        contact_preference,
        wants_event_emails,
        notes,
        status,
        created_at
      FROM volunteer_registrations
      ORDER BY created_at DESC, id DESC;
      `
    );

    return result.rows.map((row) => ({
      id: String(row.id || ''),
      userId: row.user_id || null,
      opportunityId: row.opportunity_id || null,
      name: row.name || '',
      email: row.email || '',
      phone: row.phone || '',
      whatsapp: row.whatsapp || '',
      area: row.area || '',
      sevaType: row.seva_type || '',
      sevaDate: row.seva_date || '',
      sevaTime: row.seva_time || '',
      contactPreference: row.contact_preference || 'Email',
      wantsEventEmails: row.wants_event_emails === true,
      notes: row.notes || '',
      status: row.status || 'Pending',
      createdAt: row.created_at || ''
    }));
  }

  const result = await pool.query(
    `
    SELECT id, payload
    FROM app_items
    WHERE resource = $1
    ORDER BY updated_at DESC;
    `,
    [normalizedResource]
  );

  if (normalizedResource === 'streaming_configs') {
    const streamingFallback = await pool.query(
      `
      SELECT id, title, text, stream_url, active, checked_at, updated_at
      FROM streaming_configs
      ORDER BY updated_at DESC;
      `
    );

    const payloadRows = result.rows.map((row) => ({
      id: row.id,
      ...(row.payload || {})
    }));

    const relationalRows = streamingFallback.rows.map((row) => ({
      id: row.id,
      title: row.title || '',
      text: row.text || '',
      streamUrl: row.stream_url || '',
      active: row.active !== false,
      checkedAt: row.checked_at || '',
      updatedAt: row.updated_at || ''
    }));

    const mergedById = new Map();
    relationalRows.forEach((row) => mergedById.set(String(row.id), row));
    payloadRows.forEach((row) => mergedById.set(String(row.id), { ...mergedById.get(String(row.id)), ...row }));

    if (mergedById.size > 0) {
      return Array.from(mergedById.values()).sort((left, right) => {
        const l = new Date(left.updatedAt || 0).getTime();
        const r = new Date(right.updatedAt || 0).getTime();
        return r - l;
      }).map((row) => ({
        id: row.id,
        title: row.title || '',
        text: row.text || '',
        streamUrl: row.streamUrl || '',
        active: row.active !== false,
        checkedAt: row.checkedAt || '',
        updatedAt: row.updatedAt || ''
      }));
    }
  }

  return result.rows.map((row) => ({
    id: row.id,
    ...(row.payload || {})
  }));
};

const searchPublicContent = async (queryText, options = {}) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const query = String(queryText || '').trim();
  if (!query) {
    return [];
  }

  const requestedLimit = Number(options?.limit);
  const limit = Number.isFinite(requestedLimit) ? Math.min(50, Math.max(1, Math.floor(requestedLimit))) : 12;

  const scope = String(options?.scope || 'public').trim().toLowerCase();

  const publicSearchSql = `
    WITH searchable_rows AS (
      SELECT
        CONCAT('event-', e.id::text) AS id,
        'event'::text AS type,
        COALESCE(e.title, '') AS title,
        TRIM(CONCAT(COALESCE(TO_CHAR(e.date, 'Mon DD, YYYY'), ''), CASE WHEN COALESCE(e.location, '') <> '' THEN CONCAT(' - ', e.location) ELSE '' END)) AS subtitle,
        COALESCE(e.description, '') AS body,
        '/events'::text AS route,
        e.updated_at AS updated_at
      FROM events e
      WHERE e.active = TRUE
        AND COALESCE(e.end_date, e.date) >= NOW()

      UNION ALL

      SELECT
        CONCAT('news-', n.id) AS id,
        'news'::text AS type,
        COALESCE(n.heading, '') AS title,
        TRIM(COALESCE(TO_CHAR(n.published_at, 'Mon DD, YYYY'), '')) AS subtitle,
        COALESCE(n.content, '') AS body,
        '/news'::text AS route,
        n.updated_at AS updated_at
      FROM news_articles n
      WHERE n.active = TRUE

      UNION ALL

      SELECT
        CONCAT('seva-', s.id) AS id,
        'seva'::text AS type,
        COALESCE(s.seva_type, '') AS title,
        TRIM(CONCAT(COALESCE(TO_CHAR(s.seva_date, 'Mon DD, YYYY'), ''), CASE WHEN COALESCE(s.seva_time, '') <> '' THEN CONCAT(' - ', s.seva_time) ELSE '' END)) AS subtitle,
        CONCAT('Need ', COALESCE(s.total_volunteers_required, 0)::text, ' volunteers') AS body,
        '/seva'::text AS route,
        s.updated_at AS updated_at
      FROM seva_opportunities s
      WHERE s.active = TRUE

      UNION ALL

      SELECT
        CONCAT('cms-', p.slug) AS id,
        'cms'::text AS type,
        COALESCE(p.hero_title, '') AS title,
        COALESCE(p.hero_description, '') AS subtitle,
        CONCAT(COALESCE(p.intro, ''), ' ', COALESCE(string_agg(COALESCE(sec.title, '') || ' ' || COALESCE(sec.body, ''), ' '), '')) AS body,
        CONCAT('/', COALESCE(p.slug, '')) AS route,
        p.updated_at AS updated_at
      FROM cms_pages p
      LEFT JOIN cms_page_sections sec ON sec.page_id = p.id
      GROUP BY p.id, p.slug, p.hero_title, p.hero_description, p.intro, p.updated_at
    ),
    scored_rows AS (
      SELECT
        id,
        type,
        title,
        subtitle,
        body,
        route,
        updated_at,
        GREATEST(
          ts_rank_cd(
            to_tsvector('simple', CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))),
            websearch_to_tsquery('simple', $1)
          ),
          CASE
            WHEN LOWER(CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))) LIKE CONCAT('%', LOWER($2), '%')
            THEN 0.05
            ELSE 0
          END
        ) AS score
      FROM searchable_rows
      WHERE
        to_tsvector('simple', CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))) @@ websearch_to_tsquery('simple', $1)
        OR LOWER(CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))) LIKE CONCAT('%', LOWER($2), '%')
    )
    SELECT
      id,
      type,
      title,
      subtitle,
      body,
      route,
      updated_at,
      score
    FROM scored_rows
    ORDER BY score DESC, updated_at DESC NULLS LAST
    LIMIT $3;
  `;

  const adminSearchSql = `
    WITH resource_routes AS (
      SELECT * FROM (VALUES
        ('users', '/admin/users', 'Users'),
        ('cms_pages', '/admin/cms', 'CMS'),
        ('cms_page_sections', '/admin/cms', 'CMS'),
        ('cms_hero_slides', '/admin/cms', 'CMS'),
        ('news_articles', '/admin/news', 'News and Updates'),
        ('schedule_days', '/admin/schedule', 'Daily Schedule'),
        ('schedule_entries', '/admin/schedule', 'Daily Schedule'),
        ('hukamnama_entries', '/admin/hukamnama', 'Hukamnama'),
        ('hukamnama_lines', '/admin/hukamnama', 'Hukamnama'),
        ('langar_items', '/admin/langar', 'Seva Items'),
        ('seva_opportunities', '/admin/seva-opportunities', 'Seva Opportunities'),
        ('volunteer_registrations', '/admin/seva-opportunities', 'Seva Opportunities'),
        ('gallery_albums', '/admin/gallery', 'Gallery Folders'),
        ('videos', '/admin/videos', 'Videos'),
        ('streaming_configs', '/admin/streaming', 'Streaming'),
        ('advertisements', '/admin/advertisements', 'Advertisements'),
        ('sponsors', '/admin/sponsors', 'Sponsors'),
        ('events', '/admin/events', 'Events'),
        ('subscribers', '/admin/newsletter', 'Newsletter'),
        ('newsletter_campaigns', '/admin/newsletter', 'Newsletter'),
        ('newsletter_topics', '/admin/newsletter', 'Newsletter'),
        ('library_physical_books', '/admin/library', 'Library'),
        ('library_digital_resources', '/admin/library', 'Library'),
        ('library_program_updates', '/admin/library', 'Library'),
        ('library_media_resources', '/admin/library', 'Library'),
        ('donations', '/admin/donations', 'Donations'),
        ('donation_campaigns', '/admin/donations', 'Donations'),
        ('roles_access', '/admin/roles-access', 'Roles and Access'),
        ('roles', '/admin/roles-access', 'Roles and Access')
      ) AS t(resource, route, page_label)
    ),
    searchable_rows AS (
      SELECT
        CONCAT('admin-item-', ai.resource, '-', ai.id) AS id,
        'admin'::text AS type,
        COALESCE(
          ai.payload->>'title',
          ai.payload->>'name',
          ai.payload->>'heading',
          ai.payload->>'heroTitle',
          ai.payload->>'subject',
          ai.payload->>'sevaType',
          ai.payload->>'email',
          ai.payload->>'id',
          ai.id
        ) AS title,
        COALESCE(
          rr.page_label,
          ai.payload->>'subtitle',
          ai.payload->>'category',
          ai.resource
        ) AS subtitle,
        ai.payload::text AS body,
        rr.route AS route,
        ai.updated_at AS updated_at
      FROM app_items ai
      LEFT JOIN resource_routes rr ON rr.resource = ai.resource
      WHERE ai.resource <> 'audit_logs'
        AND ai.resource NOT LIKE 'admin_notification_reads%'
        AND rr.route IS NOT NULL

      UNION ALL

      SELECT
        CONCAT('admin-user-', u.id) AS id,
        'admin'::text AS type,
        COALESCE(u.name, u.email, u.id) AS title,
        'Users'::text AS subtitle,
        CONCAT(COALESCE(u.email, ''), ' ', COALESCE(u.role, ''), ' ', COALESCE(u.member_type, ''), ' ', COALESCE(u.phone, ''), ' ', COALESCE(u.address, '')) AS body,
        '/admin/users'::text AS route,
        u.updated_at AS updated_at
      FROM admin_users u

      UNION ALL

      SELECT
        CONCAT('admin-event-', e.id::text) AS id,
        'admin'::text AS type,
        COALESCE(e.title, '') AS title,
        'Events'::text AS subtitle,
        CONCAT(COALESCE(e.description, ''), ' ', COALESCE(e.location, ''), ' ', COALESCE(e.category, '')) AS body,
        '/admin/events'::text AS route,
        e.updated_at AS updated_at
      FROM events e

      UNION ALL

      SELECT
        CONCAT('admin-campaign-', d.id::text) AS id,
        'admin'::text AS type,
        COALESCE(d.name, '') AS title,
        'Donations'::text AS subtitle,
        CONCAT(COALESCE(d.description, ''), ' ', COALESCE(d.progress_title, ''), ' ', COALESCE(d.progress_description, '')) AS body,
        '/admin/donations'::text AS route,
        d.updated_at AS updated_at
      FROM donation_campaigns d
    ),
    scored_rows AS (
      SELECT
        id,
        type,
        title,
        subtitle,
        body,
        route,
        updated_at,
        GREATEST(
          ts_rank_cd(
            to_tsvector('simple', CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))),
            websearch_to_tsquery('simple', $1)
          ),
          CASE
            WHEN LOWER(CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))) LIKE CONCAT('%', LOWER($2), '%')
            THEN 0.05
            ELSE 0
          END
        ) AS score
      FROM searchable_rows
      WHERE
        to_tsvector('simple', CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))) @@ websearch_to_tsquery('simple', $1)
        OR LOWER(CONCAT(COALESCE(title, ''), ' ', COALESCE(subtitle, ''), ' ', COALESCE(body, ''))) LIKE CONCAT('%', LOWER($2), '%')
    )
    SELECT
      id,
      type,
      title,
      subtitle,
      body,
      route,
      updated_at,
      score
    FROM scored_rows
    ORDER BY score DESC, updated_at DESC NULLS LAST
    LIMIT $3;
  `;

  const result = await pool.query(
    scope === 'admin' ? adminSearchSql : publicSearchSql,
    [query, query, limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id || ''),
    type: String(row.type || ''),
    title: String(row.title || '').trim(),
    subtitle: String(row.subtitle || '').trim(),
    body: String(row.body || '').replace(/\s+/g, ' ').trim(),
    route: String(row.route || '/').trim() || '/',
    updatedAt: row.updated_at || '',
    score: Number(row.score || 0)
  }));
};

const createItem = async (resource, payload) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const normalizedResource = String(resource || '').trim();
  const id = String(payload?.id || `${normalizedResource}-${Date.now()}`);
  const nextPayload = {
    ...(payload || {}),
    id
  };

  const result = await pool.query(
    `
    INSERT INTO app_items(resource, id, payload, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW(), NOW())
    RETURNING payload;
    `,
    [normalizedResource, id, JSON.stringify(nextPayload)]
  );

  try {
    await mirrorItemResource(normalizedResource, nextPayload);
  } catch (error) {
    console.error('Item mirror sync failed:', error.message || error);
  }

  return result.rows?.[0]?.payload || nextPayload;
};

const createLangarContributionBatch = async ({ items, donorName, donorEmail, donorAvatarUrl, anonymous, expectedDeliveryDate }) => {
  if (!pool) throw new Error('Database is not configured.');
  const client = await pool.connect();
  const created = [];
  let content = null;
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO app_singletons(resource, payload) VALUES ('cms_home_content', '{}'::jsonb) ON CONFLICT (resource) DO NOTHING`
    );
    const singletonResult = await client.query(
      `SELECT payload FROM app_singletons WHERE resource = 'cms_home_content' FOR UPDATE`
    );
    content = singletonResult.rows[0]?.payload || {};
    const currentItems = Array.isArray(content.langarItems) ? content.langarItems : [];
    const contributionResult = await client.query(
      `SELECT payload FROM app_items WHERE resource = 'langar_contributions'`
    );
    const previousContributions = contributionResult.rows.map((row) => row.payload || {});
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
        createdAt: new Date().toISOString()
      };
      await client.query(
        `INSERT INTO app_items(resource, id, payload, created_at, updated_at) VALUES ('langar_contributions', $1, $2::jsonb, NOW(), NOW())`,
        [id, JSON.stringify(record)]
      );
      created.push(record);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const record of created) {
    try {
      await mirrorItemResource('langar_contributions', record);
    } catch (error) {
      console.error('Langar batch contribution mirror sync failed:', error.message || error);
    }
  }
  return { data: created, content };
};

const updateItem = async (resource, id, payload) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const normalizedResource = String(resource || '').trim();
  const normalizedId = String(id || '').trim();
  const existing = await pool.query(
    `
    SELECT payload
    FROM app_items
    WHERE resource = $1 AND id = $2
    LIMIT 1;
    `,
    [normalizedResource, normalizedId]
  );

  const base = existing.rows?.[0]?.payload || { id: normalizedId };
  const nextPayload = {
    ...base,
    ...(payload || {}),
    id: normalizedId
  };

  const result = await pool.query(
    `
    INSERT INTO app_items(resource, id, payload, created_at, updated_at)
    VALUES ($1, $2, $3::jsonb, NOW(), NOW())
    ON CONFLICT (resource, id)
    DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
    RETURNING payload;
    `,
    [normalizedResource, normalizedId, JSON.stringify(nextPayload)]
  );

  try {
    await mirrorItemResource(normalizedResource, nextPayload);
  } catch (error) {
    console.error('Item mirror sync failed:', error.message || error);
  }

  return result.rows?.[0]?.payload || nextPayload;
};

const removeItem = async (resource, id) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  await pool.query(
    `
    DELETE FROM app_items
    WHERE resource = $1 AND id = $2;
    `,
    [String(resource || '').trim(), String(id || '').trim()]
  );

  try {
    await mirrorDeleteResource(String(resource || '').trim(), String(id || '').trim());
  } catch (error) {
    console.error('Delete mirror sync failed:', error.message || error);
  }

  return { success: true };
};

const listQuizBankFiles = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT
      file_name,
      COALESCE(jsonb_array_length(questions), 0) AS question_count
    FROM quiz_bank_files
    ORDER BY file_name ASC;
    `
  );

  return (result.rows || []).map((row) => ({
    fileName: String(row.file_name || ''),
    questionCount: Number(row.question_count || 0)
  }));
};

const getQuizBankFile = async (fileName) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT file_name, questions
    FROM quiz_bank_files
    WHERE file_name = $1
    LIMIT 1;
    `,
    [String(fileName || '').trim()]
  );

  if (!result.rows?.[0]) {
    return null;
  }

  return {
    fileName: String(result.rows[0].file_name || ''),
    questions: Array.isArray(result.rows[0].questions) ? result.rows[0].questions : []
  };
};

const upsertQuizBankFile = async (fileName, questions = []) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const safeFileName = String(fileName || '').trim();
  const safeQuestions = Array.isArray(questions) ? questions : [];

  const result = await pool.query(
    `
    INSERT INTO quiz_bank_files(file_name, questions, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (file_name)
    DO UPDATE SET questions = EXCLUDED.questions, updated_at = NOW()
    RETURNING file_name, questions;
    `,
    [safeFileName, JSON.stringify(safeQuestions)]
  );

  return {
    fileName: String(result.rows?.[0]?.file_name || safeFileName),
    questions: Array.isArray(result.rows?.[0]?.questions) ? result.rows[0].questions : safeQuestions
  };
};

const syncRelationalMirrorsFromContentStore = async () => {
  if (!pool) {
    return;
  }

  const itemResources = [
    'users',
    'advertisements',
    'news_articles',
    'gallery_albums',
    'videos',
    'streaming_configs',
    'subscribers',
    'seva_opportunities',
    'volunteer_registrations',
    'donations',
    'donation_records',
    'analytics',
    'analytics_daily_metrics'
  ];

  for (const resource of itemResources) {
    const rows = await pool.query(
      `
      SELECT payload
      FROM app_items
      WHERE resource = $1;
      `,
      [resource]
    );

    for (const row of rows.rows || []) {
      try {
        await mirrorItemResource(resource, row.payload || {});
      } catch (error) {
        console.error('Mirror backfill failed for resource item:', resource, error.message || error);
      }
    }
  }

  const singletonResources = [
    'cms_home_content',
    'cms_page_content',
    'library_content',
    'hukamnama_ssm_hukamnama_entries'
  ];

  for (const resource of singletonResources) {
    const row = await pool.query(
      `
      SELECT payload
      FROM app_singletons
      WHERE resource = $1
      LIMIT 1;
      `,
      [resource]
    );

    if (!row.rows?.[0]) {
      continue;
    }

    try {
      await mirrorSingletonResource(resource, row.rows[0].payload || {});
    } catch (error) {
      console.error('Mirror backfill failed for singleton:', resource, error.message || error);
    }
  }
};

const parseJsonArrayField = (value) => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const CAMPAIGN_PROGRESS_STATUSES = new Set([
  'draft',
  'planned',
  'started',
  'in-progress',
  'under-development',
  'awaiting-materials',
  'awaiting-approval',
  'on-hold',
  'delayed',
  'completed',
  'cancelled',
  'archived'
]);

const normalizeCampaignProgressStatus = (value, isActive = true) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');

  if (CAMPAIGN_PROGRESS_STATUSES.has(normalized)) {
    return normalized;
  }

  return isActive === false ? 'archived' : 'started';
};

const normalizeCampaignProgressItems = (value = []) => {
  return parseJsonArrayField(value)
    .map((item, index) => {
      const status = normalizeCampaignProgressStatus(item?.status, item?.isActive);

      return {
        id: String(item?.id || `progress-${Date.now()}-${index}`),
        title: String(item?.title || '').trim(),
        description: String(item?.description || '').trim(),
        details: String(item?.details || '').trim(),
        date: String(item?.date || '').trim(),
        status,
        isActive: status !== 'draft' && status !== 'archived',
        photos: parseJsonArrayField(item?.photos)
          .map((photo) => String(photo || '').trim())
          .filter(Boolean)
      };
    })
    .filter((item) => item.title);
};

const normalizeCampaignStoryBlocks = (value = []) => {
  return parseJsonArrayField(value)
    .map((item, index) => ({
      id: String(item?.id || `story-${Date.now()}-${index}`),
      title: String(item?.title || '').trim(),
      summary: String(item?.summary || '').trim(),
      quote: String(item?.quote || '').trim(),
      beneficiary: String(item?.beneficiary || '').trim(),
      impactMetric: String(item?.impactMetric || '').trim(),
      imageUrl: String(item?.imageUrl || item?.image_url || '').trim(),
      isActive: item?.isActive !== false
    }))
    .filter((item) => item.title || item.summary || item.quote);
};

const mapCampaignRow = (row) => {
  const raised = Number(row.raised || 0);
  const target = Number(row.target || 0);
  const progressPhotos = parseJsonArrayField(row.progress_photos);
  const progressUpdates = parseJsonArrayField(row.progress_updates);
  const progressItems = normalizeCampaignProgressItems(row.progress_items);
  const storyBlocks = normalizeCampaignStoryBlocks(row.story_blocks);

  return {
    id: Number(row.id),
    name: row.name,
    description: row.description || '',
    progressTitle: row.progress_title || '',
    progressDescription: row.progress_description || '',
    progressPhotos: Array.isArray(progressPhotos) ? progressPhotos : [],
    progressUpdates: Array.isArray(progressUpdates) ? progressUpdates : [],
    progressItems,
    storyBlocks,
    raised,
    target,
    isActive: row.is_active !== false,
    isClosed: target > 0 && raised >= target,
    paymentProvider: ['STRIPE', 'PAYPAL', 'ZEFFY'].includes(String(row.payment_provider || '').toUpperCase())
      ? String(row.payment_provider).toUpperCase()
      : 'STRIPE',
    paymentLink: row.payment_link || '',
    stripeBuyButtonId: row.stripe_buy_button_id || '',
    stripePublishableKey: row.stripe_publishable_key || '',
    hasZeffyApiKey: Boolean(String(row.zeffy_api_key || '').trim())
  };
};

const getDonationCampaigns = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT id, name, description, progress_title, progress_description, progress_photos, progress_updates, progress_items, story_blocks, raised, target, is_active, payment_provider, payment_link, stripe_buy_button_id, stripe_publishable_key, zeffy_api_key
    FROM donation_campaigns
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map(mapCampaignRow);
};

const getZeffyDonationCampaigns = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT id, name, description, progress_title, progress_description, progress_photos, progress_updates, progress_items, story_blocks, raised, target, is_active, payment_provider, payment_link, stripe_buy_button_id, stripe_publishable_key, zeffy_api_key
    FROM donation_campaigns
    WHERE payment_provider = 'ZEFFY' AND zeffy_api_key <> ''
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map((row) => ({
    ...mapCampaignRow(row),
    zeffyApiKey: String(row.zeffy_api_key || '').trim()
  }));
};

const createDonationCampaign = async (payload = {}) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    INSERT INTO donation_campaigns
    (name, description, progress_title, progress_description, progress_photos, progress_updates, progress_items, story_blocks, raised, target, is_active, payment_provider, payment_link, stripe_buy_button_id, stripe_publishable_key, zeffy_api_key)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING id, name, description, progress_title, progress_description, progress_photos, progress_updates, progress_items, story_blocks, raised, target, is_active, payment_provider, payment_link, stripe_buy_button_id, stripe_publishable_key, zeffy_api_key;
    `,
    [
      String(payload.name || '').trim(),
      String(payload.description || '').trim(),
      String(payload.progressTitle || '').trim(),
      String(payload.progressDescription || '').trim(),
      JSON.stringify(Array.isArray(payload.progressPhotos) ? payload.progressPhotos : []),
      JSON.stringify(Array.isArray(payload.progressUpdates) ? payload.progressUpdates : []),
      JSON.stringify(normalizeCampaignProgressItems(payload.progressItems)),
      JSON.stringify(normalizeCampaignStoryBlocks(payload.storyBlocks)),
      Number(payload.raised || 0),
      Number(payload.target || 0),
      payload.isActive !== false,
      ['STRIPE', 'PAYPAL', 'ZEFFY'].includes(String(payload.paymentProvider || '').toUpperCase())
        ? String(payload.paymentProvider).toUpperCase()
        : 'STRIPE',
      String(payload.paymentLink || '').trim(),
      String(payload.stripeBuyButtonId || '').trim(),
      String(payload.stripePublishableKey || '').trim(),
      String(payload.zeffyApiKey || '').trim()
    ]
  );

  return mapCampaignRow(result.rows[0]);
};

const updateDonationCampaign = async (id, payload = {}) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const currentResult = await pool.query('SELECT * FROM donation_campaigns WHERE id = $1 LIMIT 1;', [id]);
  const current = currentResult.rows?.[0];
  if (!current) {
    return null;
  }

  const next = {
    name: payload.name ?? current.name,
    description: payload.description ?? current.description,
    progressTitle: payload.progressTitle ?? current.progress_title,
    progressDescription: payload.progressDescription ?? current.progress_description,
    progressPhotos: Array.isArray(payload.progressPhotos) ? payload.progressPhotos : current.progress_photos,
    progressUpdates: Array.isArray(payload.progressUpdates) ? payload.progressUpdates : current.progress_updates,
    progressItems: Array.isArray(payload.progressItems)
      ? normalizeCampaignProgressItems(payload.progressItems)
      : normalizeCampaignProgressItems(current.progress_items),
    storyBlocks: Array.isArray(payload.storyBlocks)
      ? normalizeCampaignStoryBlocks(payload.storyBlocks)
      : normalizeCampaignStoryBlocks(current.story_blocks),
    raised: Number(payload.raised ?? current.raised ?? 0),
    target: Number(payload.target ?? current.target ?? 0),
    isActive: typeof payload.isActive === 'boolean' ? payload.isActive : current.is_active,
    paymentProvider: payload.paymentProvider ?? current.payment_provider,
    paymentLink: payload.paymentLink ?? current.payment_link,
    stripeBuyButtonId: payload.stripeBuyButtonId ?? current.stripe_buy_button_id,
    stripePublishableKey: payload.stripePublishableKey ?? current.stripe_publishable_key,
    zeffyApiKey: String(payload.zeffyApiKey || '').trim() || current.zeffy_api_key
  };

  const result = await pool.query(
    `
    UPDATE donation_campaigns
    SET name = $2,
        description = $3,
        progress_title = $4,
        progress_description = $5,
        progress_photos = $6::jsonb,
        progress_updates = $7::jsonb,
        progress_items = $8::jsonb,
        story_blocks = $9::jsonb,
        raised = $10,
        target = $11,
        is_active = $12,
        payment_provider = $13,
        payment_link = $14,
        stripe_buy_button_id = $15,
        stripe_publishable_key = $16,
        zeffy_api_key = $17,
        updated_at = NOW()
    WHERE id = $1
      RETURNING id, name, description, progress_title, progress_description, progress_photos, progress_updates, progress_items, story_blocks, raised, target, is_active, payment_provider, payment_link, stripe_buy_button_id, stripe_publishable_key, zeffy_api_key;
    `,
    [
      id,
      String(next.name || '').trim(),
      String(next.description || '').trim(),
      String(next.progressTitle || '').trim(),
      String(next.progressDescription || '').trim(),
      JSON.stringify(Array.isArray(next.progressPhotos) ? next.progressPhotos : []),
      JSON.stringify(Array.isArray(next.progressUpdates) ? next.progressUpdates : []),
      JSON.stringify(normalizeCampaignProgressItems(next.progressItems)),
      JSON.stringify(normalizeCampaignStoryBlocks(next.storyBlocks)),
      Number(next.raised || 0),
      Number(next.target || 0),
      next.isActive !== false,
      ['STRIPE', 'PAYPAL', 'ZEFFY'].includes(String(next.paymentProvider || '').toUpperCase())
        ? String(next.paymentProvider).toUpperCase()
        : 'STRIPE',
      String(next.paymentLink || '').trim(),
      String(next.stripeBuyButtonId || '').trim(),
      String(next.stripePublishableKey || '').trim(),
      String(next.zeffyApiKey || '').trim()
    ]
  );

  return mapCampaignRow(result.rows[0]);
};

const removeDonationCampaign = async (id) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  await pool.query('DELETE FROM donation_campaigns WHERE id = $1;', [id]);
  return { success: true };
};

const mapDonationRow = (row) => ({
  id: row.id,
  receiptId: row.receipt_id,
  sourcePendingId: row.source_pending_id || '',
  campaignId: row.campaign_id != null ? Number(row.campaign_id) : null,
  campaignName: row.campaign_name || '',
  donorName: row.donor_name || 'Anonymous',
  donorEmail: row.donor_email || '',
  donorPhone: row.donor_phone || '',
  amount: Number(row.amount || 0),
  frequency: row.frequency || 'one-time',
  paymentProvider: row.payment_provider || 'STRIPE',
  paymentStatus: row.payment_status || 'PAID',
  gatewayTransactionId: row.gateway_transaction_id || '',
  stripeSessionId: row.stripe_session_id || '',
  stripeEventId: row.stripe_event_id || '',
  emailSent: row.email_sent === true,
  source: row.source || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getDonations = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT id, receipt_id, source_pending_id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount,
           frequency, payment_provider, payment_status, gateway_transaction_id, stripe_session_id, stripe_event_id,
           email_sent, source, created_at, updated_at
    FROM donations
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map(mapDonationRow);
};

const upsertDonation = async (record = {}) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const normalizedId = String(record.id || `don-${Date.now()}`);
  const receiptId = String(record.receiptId || `R-${Date.now()}`);
  const sourcePendingId = String(record.sourcePendingId || '').trim();
  const gatewayTransactionId = String(record.gatewayTransactionId || '').trim();
  const stripeSessionId = String(record.stripeSessionId || '').trim();

  const existingResult = await pool.query(
    `
    SELECT id
    FROM donations
    WHERE (stripe_session_id <> '' AND stripe_session_id = $1)
       OR (gateway_transaction_id <> '' AND gateway_transaction_id = $2)
       OR id = $3
    LIMIT 1;
    `,
    [stripeSessionId, gatewayTransactionId, normalizedId]
  );

  const finalId = existingResult.rows?.[0]?.id || normalizedId;

  const result = await pool.query(
    `
    INSERT INTO donations
        (id, receipt_id, source_pending_id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount, frequency,
     payment_provider, payment_status, gateway_transaction_id, stripe_session_id, stripe_event_id, email_sent, source, created_at, updated_at)
        VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, COALESCE($18, NOW()), NOW())
    ON CONFLICT (id)
    DO UPDATE SET
      receipt_id = EXCLUDED.receipt_id,
      source_pending_id = EXCLUDED.source_pending_id,
      campaign_id = EXCLUDED.campaign_id,
      campaign_name = EXCLUDED.campaign_name,
      donor_name = EXCLUDED.donor_name,
      donor_email = EXCLUDED.donor_email,
      donor_phone = EXCLUDED.donor_phone,
      amount = EXCLUDED.amount,
      frequency = EXCLUDED.frequency,
      payment_provider = EXCLUDED.payment_provider,
      payment_status = EXCLUDED.payment_status,
      gateway_transaction_id = EXCLUDED.gateway_transaction_id,
      stripe_session_id = EXCLUDED.stripe_session_id,
      stripe_event_id = EXCLUDED.stripe_event_id,
      email_sent = EXCLUDED.email_sent,
      source = EXCLUDED.source,
      updated_at = NOW()
    RETURNING id, receipt_id, source_pending_id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount,
              frequency, payment_provider, payment_status, gateway_transaction_id, stripe_session_id, stripe_event_id,
              email_sent, source, created_at, updated_at;
    `,
    [
      finalId,
      receiptId,
      sourcePendingId,
      record.campaignId != null ? Number(record.campaignId) : null,
      String(record.campaignName || ''),
      String(record.donorName || 'Anonymous'),
      String(record.donorEmail || ''),
      String(record.donorPhone || record.phone || ''),
      Number(record.amount || 0),
      String(record.frequency || 'one-time'),
      ['STRIPE', 'PAYPAL', 'CASH', 'ZEFFY'].includes(String(record.paymentProvider || '').toUpperCase())
        ? String(record.paymentProvider).toUpperCase()
        : 'STRIPE',
      String(record.paymentStatus || 'PAID').toUpperCase(),
      gatewayTransactionId,
      stripeSessionId,
      String(record.stripeEventId || ''),
      Boolean(record.emailSent),
      String(record.source || ''),
      record.createdAt || null
    ]
  );

  return mapDonationRow(result.rows[0]);
};

const removeDonation = async (id) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const removedResult = await client.query(
      `
      UPDATE donations
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING id, receipt_id, source_pending_id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount,
                frequency, payment_provider, payment_status, gateway_transaction_id, stripe_session_id, stripe_event_id,
                email_sent, source, created_at, updated_at;
      `,
      [String(id || '')]
    );

    if (removedResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const removed = mapDonationRow(removedResult.rows[0]);
    await client.query(
      `
      UPDATE donation_campaigns AS campaign
      SET raised = GREATEST(0, COALESCE((
        SELECT SUM(donation.amount)
        FROM donations AS donation
        WHERE donation.deleted_at IS NULL
          AND (
            donation.campaign_id = campaign.id
            OR (donation.campaign_id IS NULL AND LOWER(donation.campaign_name) = LOWER(campaign.name))
          )
      ), 0)),
      updated_at = NOW()
      WHERE campaign.id = $1
         OR ($1 IS NULL AND LOWER(campaign.name) = LOWER($2));
      `,
      [removed.campaignId, removed.campaignName]
    );

    await client.query('COMMIT');
    return removed;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const summarizeDonationsByCampaign = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT campaign_id, LOWER(campaign_name) AS campaign_name_key, SUM(amount)::numeric AS total_amount
    FROM donations
    WHERE deleted_at IS NULL
    GROUP BY campaign_id, LOWER(campaign_name);
    `
  );

  const summary = {};
  result.rows.forEach((row) => {
    const amount = Number(row.total_amount || 0);
    if (row.campaign_id != null) {
      summary[`id:${Number(row.campaign_id)}`] = (summary[`id:${Number(row.campaign_id)}`] || 0) + amount;
    }
    if (row.campaign_name_key) {
      summary[`name:${row.campaign_name_key}`] = (summary[`name:${row.campaign_name_key}`] || 0) + amount;
    }
  });

  return summary;
};

const mapPendingRow = (row) => ({
  id: row.id,
  campaignId: Number(row.campaign_id),
  campaignName: row.campaign_name || '',
  donorName: row.donor_name || 'Anonymous',
  donorEmail: row.donor_email || '',
  donorPhone: row.donor_phone || '',
  amount: row.amount == null ? null : Number(row.amount),
  frequency: row.frequency || 'one-time',
  paymentProvider: row.payment_provider || 'STRIPE',
  checkoutUrl: row.checkout_url || '',
  sessionId: row.session_id || '',
  createdAt: row.created_at
});

const getPendingDonations = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    SELECT id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount,
           frequency, payment_provider, checkout_url, session_id, created_at
    FROM donation_pending
    ORDER BY created_at DESC;
    `
  );

  return result.rows.map(mapPendingRow);
};

const createPendingDonation = async (payload = {}) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    INSERT INTO donation_pending
    (id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount, frequency, payment_provider, checkout_url, session_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
    RETURNING id, campaign_id, campaign_name, donor_name, donor_email, donor_phone, amount,
              frequency, payment_provider, checkout_url, session_id, created_at;
    `,
    [
      String(payload.id || `pending-${Date.now()}`),
      Number(payload.campaignId),
      String(payload.campaignName || ''),
      String(payload.donorName || 'Anonymous'),
      String(payload.donorEmail || ''),
      String(payload.donorPhone || ''),
      payload.amount == null ? null : Number(payload.amount),
      String(payload.frequency || 'one-time'),
      ['STRIPE', 'PAYPAL', 'ZEFFY'].includes(String(payload.paymentProvider || '').toUpperCase())
        ? String(payload.paymentProvider).toUpperCase()
        : 'STRIPE',
      String(payload.checkoutUrl || ''),
      String(payload.sessionId || ''),
      payload.createdAt || null
    ]
  );

  return mapPendingRow(result.rows[0]);
};

const removePendingDonation = async (id) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  await pool.query('DELETE FROM donation_pending WHERE id = $1;', [String(id || '')]);
  return { success: true };
};

const clearPendingDonations = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  await pool.query('DELETE FROM donation_pending;');
  return { success: true };
};

const clearDonations = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  await pool.query('DELETE FROM donations;');
  return { success: true };
};

const isEventPast = (row = {}) => {
  const reference = row.end_date || row.date;
  const parsed = new Date(reference);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.getTime() < Date.now();
};

const mapEventRow = (row, registrants = []) => {
  const storedActive = row.active !== false;
  const confirmedCount = registrants.filter((entry) => entry.status !== 'waitlisted').length;
  const waitlistCount = registrants.filter((entry) => entry.status === 'waitlisted').length;
  return {
    id: Number(row.id),
    title: row.title,
    description: row.description || '',
    date: row.date,
    endDate: row.end_date,
    location: row.location,
    category: row.category,
    mediaUrl: row.media_url || '',
    capacity: Math.max(0, Number(row.capacity || 0)),
    waitlistEnabled: row.waitlist_enabled !== false,
    registrations: Number(row.registrations || confirmedCount || 0),
    waitlistCount,
    active: storedActive,
    registrants
  };
};

const getEvents = async () => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const eventsResult = await pool.query(
    `
    SELECT id, title, description, date, end_date, location, category, media_url, capacity, waitlist_enabled, registrations, active
    FROM events
    ORDER BY date ASC;
    `
  );

  const registrantsResult = await pool.query(
    `
    SELECT id, event_id, name, email, contact, status, created_at
    FROM event_registrants
    ORDER BY created_at DESC;
    `
  );

  const registrantsByEvent = registrantsResult.rows.reduce((acc, row) => {
    const key = Number(row.event_id);
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push({
      id: `evt-reg-${row.id}`,
      name: row.name,
      email: row.email || '',
      contact: row.contact || '',
      status: String(row.status || 'confirmed').toLowerCase(),
      createdAt: row.created_at
    });
    return acc;
  }, {});

  return eventsResult.rows.map((row) => mapEventRow(row, registrantsByEvent[Number(row.id)] || []));
};

const createEvent = async (payload) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query(
    `
    INSERT INTO events (title, description, date, end_date, location, category, media_url, capacity, waitlist_enabled, registrations, active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING id, title, description, date, end_date, location, category, media_url, capacity, waitlist_enabled, registrations, active;
    `,
    [
      payload.title,
      payload.description || '',
      payload.date,
      payload.endDate || payload.date,
      payload.location,
      payload.category,
      payload.mediaUrl || '',
      Math.max(0, Number(payload.capacity || 0)),
      payload.waitlistEnabled !== false,
      Number(payload.registrations || 0),
      payload.active !== false
    ]
  );

  return mapEventRow(result.rows[0], []);
};

const updateEvent = async (id, payload) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const currentResult = await pool.query('SELECT * FROM events WHERE id = $1 LIMIT 1;', [id]);
  const current = currentResult.rows?.[0];
  if (!current) {
    return null;
  }

  const next = {
    title: payload.title ?? current.title,
    description: payload.description ?? current.description ?? '',
    date: payload.date ?? current.date,
    endDate: payload.endDate ?? current.end_date,
    location: payload.location ?? current.location,
    category: payload.category ?? current.category,
    mediaUrl: payload.mediaUrl ?? current.media_url ?? '',
    capacity: Math.max(0, Number(payload.capacity ?? current.capacity ?? 0)),
    waitlistEnabled: typeof payload.waitlistEnabled === 'boolean' ? payload.waitlistEnabled : (current.waitlist_enabled !== false),
    registrations: Number(payload.registrations ?? current.registrations ?? 0),
    active: typeof payload.active === 'boolean' ? payload.active : current.active
  };

  const result = await pool.query(
    `
    UPDATE events
    SET title = $2,
        description = $3,
        date = $4,
        end_date = $5,
        location = $6,
        category = $7,
      media_url = $8,
      capacity = $9,
      waitlist_enabled = $10,
      registrations = $11,
      active = $12,
        updated_at = NOW()
    WHERE id = $1
    RETURNING id, title, description, date, end_date, location, category, media_url, capacity, waitlist_enabled, registrations, active;
    `,
    [id, next.title, next.description, next.date, next.endDate, next.location, next.category, next.mediaUrl, next.capacity, next.waitlistEnabled, next.registrations, next.active]
  );

  const registrantsResult = await pool.query(
    `
    SELECT id, event_id, name, email, contact, status, created_at
    FROM event_registrants
    WHERE event_id = $1
    ORDER BY created_at DESC;
    `,
    [id]
  );

  const registrants = registrantsResult.rows.map((row) => ({
    id: `evt-reg-${row.id}`,
    name: row.name,
    email: row.email || '',
    contact: row.contact || '',
    status: String(row.status || 'confirmed').toLowerCase(),
    createdAt: row.created_at
  }));

  return mapEventRow(result.rows[0], registrants);
};

const removeEvent = async (id) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  await pool.query('DELETE FROM events WHERE id = $1;', [id]);
  return { success: true };
};

const registerForEvent = async ({ eventId, name, contact, email }) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const eventResult = await pool.query(
    `
    SELECT id, date, end_date, active, capacity, waitlist_enabled
    FROM events
    WHERE id = $1
    LIMIT 1;
    `,
    [eventId]
  );

  const event = eventResult.rows?.[0];
  if (!event) {
    const error = new Error('Event not found.');
    error.status = 404;
    throw error;
  }

  if (event.active === false) {
    const error = new Error('This event is no longer open for RSVP.');
    error.status = 409;
    throw error;
  }

  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedContact = String(contact || '').trim().toLowerCase();
  const duplicateKey = normalizedEmail || normalizedContact;

  if (!duplicateKey) {
    const error = new Error('Please provide an email or contact value.');
    error.status = 400;
    throw error;
  }

  const duplicateResult = await pool.query(
    `
    SELECT id
    FROM event_registrants
    WHERE event_id = $1
      AND LOWER(COALESCE(NULLIF(email, ''), contact, '')) = $2
    LIMIT 1;
    `,
    [eventId, duplicateKey]
  );

  if (duplicateResult.rowCount > 0) {
    const error = new Error('You have already registered for this event.');
    error.status = 409;
    throw error;
  }

  const capacity = Math.max(0, Number(event.capacity || 0));
  const waitlistEnabled = event.waitlist_enabled !== false;
  const confirmedCountResult = await pool.query(
    `
    SELECT COUNT(*)::int AS count
    FROM event_registrants
    WHERE event_id = $1
      AND status = 'confirmed';
    `,
    [eventId]
  );
  const confirmedCount = Number(confirmedCountResult.rows?.[0]?.count || 0);
  const status = capacity > 0 && confirmedCount >= capacity
    ? (waitlistEnabled ? 'waitlisted' : '')
    : 'confirmed';

  if (!status) {
    const error = new Error('Event capacity has been reached.');
    error.status = 409;
    throw error;
  }

  const registrationResult = await pool.query(
    `
    INSERT INTO event_registrants (event_id, name, email, contact, status)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, event_id, name, email, contact, status, created_at;
    `,
    [eventId, name || 'Anonymous', normalizedEmail, String(contact || '').trim(), status]
  );

  if (status === 'confirmed') {
    await pool.query(
      `
      UPDATE events
      SET registrations = registrations + 1,
          updated_at = NOW()
      WHERE id = $1;
      `,
      [eventId]
    );
  }

  const rows = await getEvents();
  const updatedEvent = rows.find((entry) => entry.id === Number(eventId)) || null;
  const registration = registrationResult.rows?.[0];
  return updatedEvent ? {
    ...updatedEvent,
    registration: registration ? {
      id: `evt-reg-${registration.id}`,
      name: registration.name || '',
      email: registration.email || '',
      contact: registration.contact || '',
      status: String(registration.status || 'confirmed').toLowerCase(),
      createdAt: registration.created_at || ''
    } : null
  } : null;
};

const removeEventRegistrant = async ({ eventId, registrantId }) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const numericRegistrantId = Number(String(registrantId).replace('evt-reg-', ''));
  const client = await pool.connect();
  let promotedRegistration = null;

  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM events WHERE id = $1 FOR UPDATE;', [eventId]);
    const deleteResult = await client.query(
      `
      DELETE FROM event_registrants
      WHERE id = $1 AND event_id = $2
      RETURNING id, status;
      `,
      [numericRegistrantId, eventId]
    );

    if (deleteResult.rowCount > 0 && String(deleteResult.rows[0]?.status || '').toLowerCase() === 'confirmed') {
      await client.query(
        `
        UPDATE events
        SET registrations = GREATEST(0, registrations - 1),
            updated_at = NOW()
        WHERE id = $1;
        `,
        [eventId]
      );

      const promoteResult = await client.query(
        `
        SELECT id, event_id, name, email, contact, status, created_at
        FROM event_registrants
        WHERE event_id = $1 AND status = 'waitlisted'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `,
        [eventId]
      );

      if (promoteResult.rowCount > 0) {
        const promoted = promoteResult.rows[0];
        await client.query(
          `UPDATE event_registrants SET status = 'confirmed' WHERE id = $1;`,
          [promoted.id]
        );
        await client.query(
          `
          UPDATE events
          SET registrations = registrations + 1,
              updated_at = NOW()
          WHERE id = $1;
          `,
          [eventId]
        );
        promotedRegistration = {
          id: `evt-reg-${promoted.id}`,
          name: promoted.name || '',
          email: promoted.email || '',
          contact: promoted.contact || '',
          status: 'confirmed',
          createdAt: promoted.created_at || ''
        };
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const rows = await getEvents({ includeInactive: true });
  const updatedEvent = rows.find((entry) => entry.id === Number(eventId)) || null;
  return updatedEvent ? {
    ...updatedEvent,
    promotedRegistration
  } : null;
};

const removeVolunteerRegistration = async (registrationId) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const normalizedId = String(registrationId || '').trim();
  const client = await pool.connect();
  let removedRegistration = null;
  let promotedRegistration = null;

  try {
    await client.query('BEGIN');
    const existingResult = await client.query(
      `
      SELECT
        id, opportunity_id, name, email, phone, whatsapp, area, seva_type,
        seva_date, seva_time, contact_preference, wants_event_emails, notes,
        status, created_at
      FROM volunteer_registrations
      WHERE id = $1
      FOR UPDATE;
      `,
      [normalizedId]
    );
    const existing = existingResult.rows?.[0];
    if (!existing) {
      const error = new Error('Seva registration not found.');
      error.status = 404;
      throw error;
    }

    removedRegistration = {
      id: String(existing.id || ''),
      opportunityId: String(existing.opportunity_id || ''),
      status: String(existing.status || 'confirmed').toLowerCase()
    };

    await client.query('DELETE FROM volunteer_registrations WHERE id = $1;', [normalizedId]);
    await client.query(
      `DELETE FROM app_items WHERE resource = 'volunteer_registrations' AND id = $1;`,
      [normalizedId]
    );

    if (removedRegistration.status !== 'waitlisted' && removedRegistration.opportunityId) {
      const promoteResult = await client.query(
        `
        SELECT
          id, opportunity_id, name, email, phone, whatsapp, area, seva_type,
          seva_date, seva_time, contact_preference, wants_event_emails, notes,
          status, created_at
        FROM volunteer_registrations
        WHERE opportunity_id = $1 AND LOWER(status) = 'waitlisted'
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1;
        `,
        [removedRegistration.opportunityId]
      );
      const promoted = promoteResult.rows?.[0];
      if (promoted) {
        await client.query(
          `UPDATE volunteer_registrations SET status = 'confirmed' WHERE id = $1;`,
          [promoted.id]
        );
        await client.query(
          `
          UPDATE app_items
          SET payload = jsonb_set(payload, '{status}', '"confirmed"'::jsonb),
              updated_at = NOW()
          WHERE resource = 'volunteer_registrations' AND id = $1;
          `,
          [promoted.id]
        );
        promotedRegistration = {
          id: String(promoted.id || ''),
          opportunityId: String(promoted.opportunity_id || ''),
          name: promoted.name || '',
          email: promoted.email || '',
          phone: promoted.phone || '',
          whatsapp: promoted.whatsapp || '',
          area: promoted.area || '',
          sevaType: promoted.seva_type || promoted.area || '',
          sevaDate: promoted.seva_date || '',
          sevaTime: promoted.seva_time || '',
          contactPreference: promoted.contact_preference || 'Email',
          wantsEventEmails: promoted.wants_event_emails === true,
          notes: promoted.notes || '',
          status: 'confirmed',
          createdAt: promoted.created_at || ''
        };
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return {
    success: true,
    removedRegistration,
    promotedRegistration
  };
};

const normalizeComparableContact = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

const getUserRegistrationDependencies = async ({ userId, email, contact, name }) => {
  if (!pool) {
    return {
      eventRegistrations: [],
      sevaRegistrations: []
    };
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedContact = normalizeComparableContact(contact);
  const normalizedName = String(name || '').trim().toLowerCase();
  if (!normalizedUserId && !normalizedEmail && !normalizedContact && !normalizedName) {
    return {
      eventRegistrations: [],
      sevaRegistrations: []
    };
  }

  const eventResult = await pool.query(
    `
    SELECT
      er.id,
      er.event_id,
      er.name,
      er.email,
      er.status,
      e.title,
      e.date
    FROM event_registrants er
    LEFT JOIN events e ON e.id = er.event_id
    WHERE ($1 <> '' AND LOWER(COALESCE(er.email, '')) = $1)
       OR ($1 <> '' AND LOWER(COALESCE(er.contact, '')) = $1)
       OR ($2 <> '' AND REGEXP_REPLACE(LOWER(COALESCE(er.contact, '')), '[^a-z0-9]', '', 'g') = $2)
       OR ($3 <> '' AND LOWER(COALESCE(er.name, '')) = $3)
    ORDER BY e.date DESC NULLS LAST, er.id DESC;
    `,
     [normalizedEmail, normalizedContact, normalizedName]
  );

  const sevaResult = await pool.query(
    `
    SELECT
      vr.id,
      vr.user_id,
      vr.opportunity_id,
      vr.name,
      vr.email,
      vr.seva_type,
      vr.seva_date,
      vr.status
    FROM volunteer_registrations vr
    WHERE ($1 <> '' AND COALESCE(vr.user_id, '') = $1)
       OR ($2 <> '' AND LOWER(COALESCE(vr.email, '')) = $2)
       OR ($3 <> '' AND REGEXP_REPLACE(LOWER(COALESCE(vr.phone, '')), '[^a-z0-9]', '', 'g') = $3)
       OR ($4 <> '' AND LOWER(COALESCE(vr.name, '')) = $4)
    ORDER BY vr.seva_date DESC NULLS LAST, vr.id DESC;
    `,
     [normalizedUserId, normalizedEmail, normalizedContact, normalizedName]
  );

  return {
    eventRegistrations: eventResult.rows.map((row) => ({
      id: `evt-reg-${row.id}`,
      eventId: row.event_id == null ? null : Number(row.event_id),
      eventTitle: row.title || '',
      eventDate: row.date || '',
      name: row.name || '',
      email: row.email || '',
      status: String(row.status || 'confirmed').toLowerCase()
    })),
    sevaRegistrations: sevaResult.rows.map((row) => ({
      id: String(row.id || ''),
      userId: row.user_id || null,
      opportunityId: row.opportunity_id || null,
      name: row.name || '',
      email: row.email || '',
      sevaType: row.seva_type || '',
      sevaDate: row.seva_date || '',
      status: String(row.status || 'pending').toLowerCase()
    }))
  };
};

const markUserRegistrationsDormant = async ({ userId, email, contact }) => {
  if (!pool) {
    return {
      eventDormantCount: 0,
      sevaDormantCount: 0
    };
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedContact = normalizeComparableContact(contact);
  if (!normalizedUserId && !normalizedEmail && !normalizedContact) {
    return {
      eventDormantCount: 0,
      sevaDormantCount: 0
    };
  }

  const eventDormantResult = await pool.query(
    `
    WITH touched AS (
      UPDATE event_registrants
      SET status = 'dormant'
      WHERE (
        ($1 <> '' AND LOWER(COALESCE(email, '')) = $1)
        OR ($2 <> '' AND REGEXP_REPLACE(LOWER(COALESCE(contact, '')), '[^a-z0-9]', '', 'g') = $2)
      )
        AND LOWER(COALESCE(status, '')) NOT IN ('dormant', 'cancelled')
      RETURNING event_id
    ),
    recalc AS (
      SELECT
        e.id AS event_id,
        COALESCE(SUM(CASE WHEN LOWER(COALESCE(r.status, '')) = 'confirmed' THEN 1 ELSE 0 END), 0)::int AS confirmed_count
      FROM events e
      LEFT JOIN event_registrants r ON r.event_id = e.id
      WHERE e.id IN (SELECT DISTINCT event_id FROM touched)
      GROUP BY e.id
    )
    UPDATE events e
    SET registrations = recalc.confirmed_count,
        updated_at = NOW()
    FROM recalc
    WHERE e.id = recalc.event_id;
    `,
    [normalizedEmail, normalizedContact]
  );

  const sevaDormantResult = await pool.query(
    `
    UPDATE volunteer_registrations
    SET status = 'dormant'
    WHERE (($1 <> '' AND COALESCE(user_id, '') = $1)
        OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
        OR ($3 <> '' AND REGEXP_REPLACE(LOWER(COALESCE(phone, '')), '[^a-z0-9]', '', 'g') = $3))
      AND LOWER(COALESCE(status, '')) NOT IN ('dormant', 'cancelled', 'rejected');
    `,
    [normalizedUserId, normalizedEmail, normalizedContact]
  );

  return {
    eventDormantCount: Number(eventDormantResult.rowCount || 0),
    sevaDormantCount: Number(sevaDormantResult.rowCount || 0)
  };
};

const purgeUserRegistrations = async ({ userId, email, contact, name }) => {
  if (!pool) {
    return {
      removedEventRegistrations: 0,
      removedSevaRegistrations: 0,
      touchedEvents: 0
    };
  }

  const normalizedUserId = String(userId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedContact = normalizeComparableContact(contact);
  const normalizedName = String(name || '').trim().toLowerCase();

  if (!normalizedUserId && !normalizedEmail && !normalizedContact && !normalizedName) {
    return {
      removedEventRegistrations: 0,
      removedSevaRegistrations: 0,
      touchedEvents: 0
    };
  }

  const removedEventResult = await pool.query(
    `
    DELETE FROM event_registrants
    WHERE ($1 <> '' AND LOWER(COALESCE(email, '')) = $1)
       OR ($1 <> '' AND LOWER(COALESCE(contact, '')) = $1)
       OR ($2 <> '' AND REGEXP_REPLACE(LOWER(COALESCE(contact, '')), '[^a-z0-9]', '', 'g') = $2)
       OR ($3 <> '' AND LOWER(COALESCE(name, '')) = $3)
    RETURNING event_id;
    `,
    [normalizedEmail, normalizedContact, normalizedName]
  );

  const touchedEventIds = [...new Set((removedEventResult.rows || [])
    .map((row) => Number(row.event_id))
    .filter((id) => Number.isFinite(id) && id > 0))];

  if (touchedEventIds.length > 0) {
    await pool.query(
      `
      UPDATE events e
      SET registrations = COALESCE(stats.confirmed_count, 0),
          updated_at = NOW()
      FROM (
        SELECT
          event_id,
          COUNT(*)::int AS confirmed_count
        FROM event_registrants
        WHERE event_id = ANY($1::bigint[])
          AND LOWER(COALESCE(status, 'confirmed')) = 'confirmed'
        GROUP BY event_id
      ) stats
      WHERE e.id = stats.event_id;
      `,
      [touchedEventIds]
    );

    await pool.query(
      `
      UPDATE events
      SET registrations = 0,
          updated_at = NOW()
      WHERE id = ANY($1::bigint[])
        AND id NOT IN (
          SELECT DISTINCT event_id
          FROM event_registrants
          WHERE event_id = ANY($1::bigint[])
            AND LOWER(COALESCE(status, 'confirmed')) = 'confirmed'
        );
      `,
      [touchedEventIds]
    );
  }

  const removedSevaResult = await pool.query(
    `
    DELETE FROM volunteer_registrations
    WHERE ($1 <> '' AND COALESCE(user_id, '') = $1)
       OR ($2 <> '' AND LOWER(COALESCE(email, '')) = $2)
       OR ($3 <> '' AND REGEXP_REPLACE(LOWER(COALESCE(phone, '')), '[^a-z0-9]', '', 'g') = $3)
       OR ($4 <> '' AND LOWER(COALESCE(name, '')) = $4)
    RETURNING id;
    `,
    [normalizedUserId, normalizedEmail, normalizedContact, normalizedName]
  );

  return {
    removedEventRegistrations: Number(removedEventResult.rowCount || 0),
    removedSevaRegistrations: Number(removedSevaResult.rowCount || 0),
    touchedEvents: touchedEventIds.length
  };
};

const exportSnapshot = async () => {
  if (!pool) {
    throw new Error('PostgreSQL is not configured.');
  }

  const [singletonsResult, itemsResult, quizResult, zeffyCampaigns] = await Promise.all([
    pool.query('SELECT resource, payload, updated_at FROM app_singletons ORDER BY resource;'),
    pool.query('SELECT resource, id, payload, created_at, updated_at FROM app_items ORDER BY resource, id;'),
    pool.query('SELECT file_name, questions, updated_at FROM quiz_bank_files ORDER BY file_name;'),
    getZeffyDonationCampaigns()
  ]);
  const zeffyKeys = new Map(zeffyCampaigns.map((campaign) => [Number(campaign.id), campaign.zeffyApiKey]));
  const campaigns = (await getDonationCampaigns()).map((campaign) => ({
    ...campaign,
    zeffyApiKey: zeffyKeys.get(Number(campaign.id)) || ''
  }));

  return {
    singletons: singletonsResult.rows.map((row) => ({
      resource: row.resource,
      payload: row.payload,
      updatedAt: row.updated_at
    })),
    items: itemsResult.rows.map((row) => ({
      resource: row.resource,
      id: row.id,
      payload: row.payload,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    quizFiles: quizResult.rows.map((row) => ({
      fileName: row.file_name,
      questions: row.questions,
      updatedAt: row.updated_at
    })),
    events: await getEvents(),
    campaigns,
    donations: await getDonations(),
    pendingDonations: await getPendingDonations()
  };
};

const getDataCounts = async () => {
  if (!pool) {
    throw new Error('PostgreSQL is not configured.');
  }

  const entries = await Promise.all(allTableNames.map(async (table) => {
    const whereClause = table === 'donations' ? ' WHERE deleted_at IS NULL' : '';
    const query = `SELECT COUNT(*)::int AS count FROM ${table}${whereClause};`;
    const result = await pool.query(query);
    return [table, Number(result.rows[0]?.count || 0)];
  }));
  return Object.fromEntries(entries);
};
module.exports = {
  pool,
  syncRelationalMirrorsFromContentStore,
  hasDatabaseConnection: Boolean(pool),
  ensureEventsSchema,
  getSingleton,
  setSingleton,
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
  exportSnapshot,
  getDataCounts
};
