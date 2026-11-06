const crypto = require('crypto');
const zlib = require('zlib');

const BANIDB_BASE = 'https://api.banidb.com/v2';
const SESSION_RESOURCE = 'recitation_sessions';
const TEXT_CACHE_PREFIX = 'recitation_text_';
const RESOURCE_PREFIX = 'recitation_';
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25000;
const MAX_ANG = 1430;

const KNOWN_ENGLISH_NAMES = {
  1: 'Gur Mantar', 2: 'Japji Sahib', 3: 'Shabad Hazare', 4: 'Jaap Sahib', 5: 'Shabad Hazare Patshahi 10',
  6: 'Tav-Prasad Savaiye (Sravag Sudh)', 7: 'Tav-Prasad Savaiye (Deenan Ki)', 8: 'Akal Ustat Chaupai',
  9: 'Benti Chaupai (Chaupai Sahib)', 10: 'Anand Sahib', 11: 'Laavan', 21: 'Rehras Sahib', 22: 'Aarti',
  23: 'Kirtan Sohila', 24: 'Ardas', 27: 'Barah Maha Majh', 29: 'Akal Ustat', 30: 'Salok Mahalla 9',
  31: 'Sukhmani Sahib', 33: 'Bavan Akhri', 34: 'Sidh Gosht', 35: 'Dakhni Oankar', 36: 'Dukh Bhanjani Sahib',
  38: 'Raag Mala'
};

const FALLBACK_CATALOG = [
  { id: 2, gurmukhi: 'ਜਪੁਜੀ ਸਾਹਿਬ', english: 'Japji Sahib' },
  { id: 4, gurmukhi: 'ਜਾਪੁ ਸਾਹਿਬ', english: 'Jaap Sahib' },
  { id: 9, gurmukhi: 'ਬੇਨਤੀ ਚੌਪਈ ਸਾਹਿਬ', english: 'Benti Chaupai (Chaupai Sahib)' },
  { id: 10, gurmukhi: 'ਅਨੰਦੁ ਸਾਹਿਬ', english: 'Anand Sahib' },
  { id: 21, gurmukhi: 'ਰਹਰਾਸਿ ਸਾਹਿਬ', english: 'Rehras Sahib' },
  { id: 23, gurmukhi: 'ਸੋਹਿਲਾ ਸਾਹਿਬ', english: 'Kirtan Sohila' },
  { id: 31, gurmukhi: 'ਸੁਖਮਨੀ ਸਾਹਿਬ', english: 'Sukhmani Sahib' },
  { id: 36, gurmukhi: 'ਦੁਖ ਭੰਜਨੀ ਸਾਹਿਬ', english: 'Dukh Bhanjani Sahib' }
];

const titleCase = (value = '') => String(value || '').replace(/\b[a-z]/g, (letter) => letter.toUpperCase()).trim();

const readText = (value) => (typeof value === 'string' ? value.trim() : '');

const isProtectedResource = (resource = '') => String(resource || '').toLowerCase().startsWith(RESOURCE_PREFIX);

// Compact line for the wire: Gurmukhi plus the best available English and Punjabi translation.
const slimVerse = (item = {}) => {
  const verse = item?.verse?.verseId !== undefined ? item.verse : item;
  const translation = verse?.translation || {};
  const punjabi = translation.pu || {};
  return {
    g: readText(verse?.verse?.unicode),
    r: readText(verse?.transliteration?.english) || readText(verse?.transliteration?.en),
    e: readText(translation.en?.bdb) || readText(translation.en?.ssk) || readText(translation.en?.ms),
    p: readText(punjabi.ss?.unicode) || readText(punjabi.bdb?.unicode) || readText(punjabi.ft?.unicode) || readText(punjabi.ms?.unicode),
    a: Number(verse?.pageNo) || 0
  };
};

const normalizeSource = (input = {}) => {
  const type = String(input.sourceType || input.type || '').trim().toLowerCase();
  const id = Number.parseInt(String(input.sourceId ?? input.id ?? '').trim(), 10);
  if (!['bani', 'ang', 'shabad'].includes(type) || !Number.isInteger(id) || id < 1) {
    return null;
  }
  if (type === 'ang' && id > MAX_ANG) return null;
  if (type === 'bani' && id > 500) return null;
  return { type, id, key: `${type}-${id}` };
};

const clampLineIndex = (index, totalLines) => {
  const last = Math.max(0, Number(totalLines || 0) - 1);
  const numeric = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
  return Math.min(last, Math.max(0, numeric));
};

const toPublicSession = (session) => (session ? {
  id: session.id,
  status: session.status,
  sourceType: session.sourceType,
  sourceId: session.sourceId,
  title: session.title,
  titleEnglish: session.titleEnglish,
  totalLines: session.totalLines,
  currentIndex: session.currentIndex,
  reciter: session.reciter || '',
  notes: session.notes || '',
  startedAt: session.startedAt,
  endedAt: session.endedAt || '',
  updatedAt: session.updatedAt
} : null);

const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error(`Gurbani source responded with ${response.status}.`);
    error.status = 502;
    throw error;
  }
  return response.json();
};

const createRecitationService = ({ eventsDb, sendJson, parseJsonObjectBody, assertInput, now = () => Date.now() }) => {
  const liveClients = new Set();
  const textMemory = new Map();
  const gzipMemory = new Map();
  let catalogMemory = { at: 0, banis: [] };
  let stateCache = null;
  let queue = Promise.resolve();

  // Taps arrive from a phone in quick succession; run state changes one at a time so none are lost.
  const serialize = (task) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  const sortSessions = (sessions) => [...sessions].sort((left, right) => new Date(right.startedAt || 0).getTime() - new Date(left.startedAt || 0).getTime());

  const loadState = async () => {
    if (stateCache) return stateCache;
    const sessions = sortSessions(await eventsDb.listItems(SESSION_RESOURCE));
    stateCache = {
      live: sessions.find((session) => session.status === 'live') || null,
      last: sessions.find((session) => session.status === 'ended') || null
    };
    return stateCache;
  };

  const buildStatePayload = async () => {
    const state = await loadState();
    return { session: toPublicSession(state.live), last: toPublicSession(state.last), serverTime: new Date(now()).toISOString() };
  };

  const broadcast = async () => {
    const payload = JSON.stringify(await buildStatePayload());
    liveClients.forEach((client) => {
      try {
        client.write(`event: state\ndata: ${payload}\n\n`);
      } catch {
        liveClients.delete(client);
      }
    });
  };

  const loadCatalog = async () => {
    if (catalogMemory.banis.length && now() - catalogMemory.at < CATALOG_TTL_MS) return catalogMemory.banis;
    try {
      const data = await fetchJson(`${BANIDB_BASE}/banis`);
      const banis = (Array.isArray(data) ? data : data?.banis || [])
        .map((bani) => ({
          id: Number(bani.ID),
          gurmukhi: readText(bani.gurmukhiUni) || readText(bani.gurmukhi),
          english: KNOWN_ENGLISH_NAMES[bani.ID] || titleCase(readText(bani.transliteration))
        }))
        .filter((bani) => bani.id && bani.gurmukhi);
      if (banis.length) {
        catalogMemory = { at: now(), banis };
        return banis;
      }
    } catch {
      // Fall through to the last good copy or the built-in list.
    }
    return catalogMemory.banis.length ? catalogMemory.banis : FALLBACK_CATALOG;
  };

  const downloadText = async (source) => {
    if (source.type === 'bani') {
      const data = await fetchJson(`${BANIDB_BASE}/banis/${source.id}`);
      const catalog = await loadCatalog();
      const entry = catalog.find((bani) => bani.id === source.id);
      return {
        title: entry?.gurmukhi || readText(data?.baniInfo?.unicode) || `Bani ${source.id}`,
        titleEnglish: entry?.english || KNOWN_ENGLISH_NAMES[source.id] || `Bani ${source.id}`,
        lines: (data?.verses || []).map(slimVerse)
      };
    }
    if (source.type === 'ang') {
      const data = await fetchJson(`${BANIDB_BASE}/angs/${source.id}/G`);
      return { title: `ਅੰਗ ${source.id}`, titleEnglish: `Ang ${source.id}`, lines: (data?.page || []).map(slimVerse) };
    }
    const data = await fetchJson(`${BANIDB_BASE}/shabads/${source.id}`);
    const lines = (data?.verses || []).map(slimVerse);
    const raag = readText(data?.shabadInfo?.raag?.english);
    return {
      title: lines[0]?.g || `Shabad ${source.id}`,
      titleEnglish: `Shabad ${source.id}${raag ? ` · ${raag}` : ''}${data?.shabadInfo?.pageNo ? ` · Ang ${data.shabadInfo.pageNo}` : ''}`,
      lines
    };
  };

  // Text rarely changes, so it is kept in memory and in the database; a live recitation must not depend on the external API being up.
  const loadText = async (source) => {
    if (textMemory.has(source.key)) return textMemory.get(source.key);
    const stored = await eventsDb.getSingleton(`${TEXT_CACHE_PREFIX}${source.type}_${source.id}`, null);
    if (stored?.lines?.length && Number(stored.version) >= 2) {
      textMemory.set(source.key, stored);
      return stored;
    }
    let downloaded;
    let lines;
    try {
      downloaded = await downloadText(source);
      lines = downloaded.lines.filter((line) => line.g);
      assertInput(lines.length > 0, 'No Gurbani text was found for that selection.', 404);
    } catch (error) {
      // Upgrade legacy text when possible, but never interrupt recitation during an API outage.
      if (!stored?.lines?.length) throw error;
      textMemory.set(source.key, stored);
      return stored;
    }
    const record = { key: source.key, type: source.type, id: source.id, title: downloaded.title, titleEnglish: downloaded.titleEnglish, totalLines: lines.length, lines, version: 2, fetchedAt: new Date(now()).toISOString() };
    textMemory.set(source.key, record);
    await eventsDb.setSingleton(`${TEXT_CACHE_PREFIX}${source.type}_${source.id}`, record);
    return record;
  };

  const sendText = (request, response, record, view) => {
    const cacheKey = `${record.key}:${view}`;
    if (!gzipMemory.has(cacheKey)) {
      const body = view === 'text'
        ? { key: record.key, title: record.title, titleEnglish: record.titleEnglish, totalLines: record.totalLines, lines: record.lines.map((line) => line.g) }
        : { key: record.key, title: record.title, titleEnglish: record.titleEnglish, totalLines: record.totalLines, lines: record.lines };
      gzipMemory.set(cacheKey, { raw: Buffer.from(JSON.stringify({ ok: true, data: body })), gzip: null });
    }
    const entry = gzipMemory.get(cacheKey);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Access-Control-Allow-Origin': '*', Vary: 'Accept-Encoding' };
    if (String(request.headers['accept-encoding'] || '').includes('gzip')) {
      entry.gzip ||= zlib.gzipSync(entry.raw);
      response.writeHead(200, { ...headers, 'Content-Encoding': 'gzip' });
      response.end(entry.gzip);
      return;
    }
    response.writeHead(200, headers);
    response.end(entry.raw);
  };

  const updateSession = async (session, patch) => {
    const next = { ...session, ...patch, updatedAt: new Date(now()).toISOString() };
    const saved = await eventsDb.updateItem(SESSION_RESOURCE, session.id, next);
    stateCache = null;
    await broadcast();
    return saved || next;
  };

  const findSession = async (id) => {
    const sessions = await eventsDb.listItems(SESSION_RESOURCE);
    return sessions.find((session) => session.id === id) || null;
  };

  const startSession = async (body) => {
    const source = normalizeSource(body);
    assertInput(source, 'Choose a bani, Ang, or shabad to start.');
    const text = await loadText(source);
    const startedAt = new Date(now()).toISOString();
    const state = await loadState();
    if (state.live) {
      await eventsDb.updateItem(SESSION_RESOURCE, state.live.id, { ...state.live, status: 'ended', endedAt: startedAt, endedReason: 'replaced', updatedAt: startedAt });
    }
    const session = await eventsDb.createItem(SESSION_RESOURCE, {
      id: `rec-${now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`,
      status: 'live',
      sourceType: source.type,
      sourceId: source.id,
      title: text.title,
      titleEnglish: text.titleEnglish,
      totalLines: text.totalLines,
      currentIndex: clampLineIndex(body.startIndex, text.totalLines),
      reciter: readText(body.reciter).slice(0, 120),
      notes: readText(body.notes).slice(0, 400),
      startedAt,
      endedAt: '',
      createdAt: startedAt,
      updatedAt: startedAt
    });
    stateCache = null;
    await broadcast();
    return toPublicSession(session);
  };

  const stepSession = async (id, body) => {
    const session = await findSession(id);
    assertInput(session, 'Recitation not found.', 404);
    assertInput(session.status === 'live', 'This recitation has already ended.', 409);
    const hasIndex = body.index !== undefined && body.index !== null;
    const delta = Number.parseInt(String(body.delta ?? 0), 10);
    assertInput(hasIndex || [1, -1].includes(delta), 'Send a step of +1 or -1.');
    const nextIndex = clampLineIndex(hasIndex ? body.index : session.currentIndex + delta, session.totalLines);
    if (nextIndex === session.currentIndex) return toPublicSession(session);
    return toPublicSession(await updateSession(session, { currentIndex: nextIndex }));
  };

  const endSession = async (id) => {
    const session = await findSession(id);
    assertInput(session, 'Recitation not found.', 404);
    if (session.status === 'ended') return toPublicSession(session);
    return toPublicSession(await updateSession(session, { status: 'ended', endedAt: new Date(now()).toISOString(), endedReason: 'ended' }));
  };

  const handleLive = (request, response, requestUrl) => {
    if (requestUrl.pathname !== '/api/live/recitation' || request.method !== 'GET') return false;
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'Access-Control-Allow-Origin': '*' });
    response.write('retry: 3000\n\n');
    liveClients.add(response);
    buildStatePayload().then((payload) => response.write(`event: state\ndata: ${JSON.stringify(payload)}\n\n`)).catch(() => {});
    const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25000);
    heartbeat.unref?.();
    response.on('close', () => {
      clearInterval(heartbeat);
      liveClients.delete(response);
    });
    return true;
  };

  const handleApi = async (request, response, requestUrl) => {
    const path = requestUrl.pathname;
    if (!path.startsWith('/api/recitation')) return false;
    const method = request.method;
    const sessionMatch = path.match(/^\/api\/recitation\/sessions\/([a-z0-9-]+)(?:\/(step|end))?$/i);

    try {
      assertInput(eventsDb.hasDatabaseConnection, 'Live recitation is temporarily unavailable.', 503);

      if (path === '/api/recitation/state' && method === 'GET') {
        sendJson(response, 200, { ok: true, data: await buildStatePayload() });
        return true;
      }

      if (path === '/api/recitation/catalog' && method === 'GET') {
        sendJson(response, 200, { ok: true, data: await loadCatalog() });
        return true;
      }

      if (path === '/api/recitation/search' && method === 'GET') {
        const query = readText(requestUrl.searchParams.get('q')).slice(0, 80);
        const mode = requestUrl.searchParams.get('mode') === 'english' ? 3 : (requestUrl.searchParams.get('mode') === 'anywhere' ? 1 : 0);
        assertInput(query.length >= 2, 'Type at least two characters to search.');
        const data = await fetchJson(`${BANIDB_BASE}/search/${encodeURIComponent(query)}?searchtype=${mode}&source=all&results=25`);
        const results = (data?.verses || []).map((item) => ({
          shabadId: Number(item.shabadId),
          gurmukhi: readText(item.verse?.unicode),
          english: readText(item.translation?.en?.bdb),
          ang: Number(item.pageNo) || 0,
          raag: readText(item.raag?.english),
          writer: readText(item.writer?.english)
        })).filter((item) => item.shabadId && item.gurmukhi);
        sendJson(response, 200, { ok: true, data: results });
        return true;
      }

      if (path === '/api/recitation/text' && method === 'GET') {
        const source = normalizeSource({ type: requestUrl.searchParams.get('type'), id: requestUrl.searchParams.get('id') });
        assertInput(source, 'Choose a valid bani, Ang, or shabad.');
        sendText(request, response, await loadText(source), requestUrl.searchParams.get('view') === 'full' ? 'full' : 'text');
        return true;
      }

      if (path === '/api/recitation/sessions' && method === 'GET') {
        const limit = Math.min(500, Math.max(1, Number.parseInt(requestUrl.searchParams.get('limit') || '200', 10) || 200));
        const sessions = sortSessions(await eventsDb.listItems(SESSION_RESOURCE)).slice(0, limit).map(toPublicSession);
        sendJson(response, 200, { ok: true, data: sessions });
        return true;
      }

      if (sessionMatch && !sessionMatch[2] && method === 'GET') {
        const session = await findSession(sessionMatch[1]);
        assertInput(session, 'Recitation not found.', 404);
        sendJson(response, 200, { ok: true, data: toPublicSession(session) });
        return true;
      }

      if (path === '/api/recitation/sessions' && method === 'POST') {
        const body = await parseJsonObjectBody(request, { maxBytes: 8192, allowEmpty: false });
        const session = await serialize(() => startSession(body));
        sendJson(response, 201, { ok: true, data: session });
        return true;
      }

      if (sessionMatch && sessionMatch[2] === 'step' && method === 'POST') {
        const body = await parseJsonObjectBody(request, { maxBytes: 1024, allowEmpty: false });
        const session = await serialize(() => stepSession(sessionMatch[1], body));
        sendJson(response, 200, { ok: true, data: session });
        return true;
      }

      if (sessionMatch && sessionMatch[2] === 'end' && method === 'POST') {
        sendJson(response, 200, { ok: true, data: await serialize(() => endSession(sessionMatch[1])) });
        return true;
      }

      if (sessionMatch && !sessionMatch[2] && method === 'PATCH') {
        const body = await parseJsonObjectBody(request, { maxBytes: 4096, allowEmpty: false });
        const updated = await serialize(async () => {
          const session = await findSession(sessionMatch[1]);
          assertInput(session, 'Recitation not found.', 404);
          return toPublicSession(await updateSession(session, { reciter: readText(body.reciter).slice(0, 120), notes: readText(body.notes).slice(0, 400) }));
        });
        sendJson(response, 200, { ok: true, data: updated });
        return true;
      }

      if (sessionMatch && !sessionMatch[2] && method === 'DELETE') {
        await serialize(async () => {
          assertInput(await findSession(sessionMatch[1]), 'Recitation not found.', 404);
          await eventsDb.removeItem(SESSION_RESOURCE, sessionMatch[1]);
          stateCache = null;
          await broadcast();
        });
        sendJson(response, 200, { ok: true, data: { success: true } });
        return true;
      }

      sendJson(response, 404, { ok: false, message: 'Not found.' });
      return true;
    } catch (error) {
      sendJson(response, error.status || 500, { ok: false, message: error.message || 'Unable to complete the recitation request.' });
      return true;
    }
  };

  return { handleLive, handleApi, isProtectedResource, broadcast };
};

module.exports = {
  KNOWN_ENGLISH_NAMES,
  clampLineIndex,
  createRecitationService,
  isProtectedResource,
  normalizeSource,
  slimVerse,
  toPublicSession
};
