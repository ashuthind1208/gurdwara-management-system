import apiClient from './apiClient';
import { DEFAULT_STREAM_OVERLAY_SETTINGS, normalizeTickerColors } from './streamOverlaySettings';

const basePath = '/stream-overlay/overlays';
const recordPath = (id) => `${basePath}/${encodeURIComponent(id)}`;
const unwrap = (response) => response.data?.data ?? response.data;

// Whitelist the legacy settings: metadata must never reach the singleton endpoint.
export const overlaySettingsPayload = (record = {}, { migrateLegacy = false } = {}) => Object.fromEntries(
  Object.entries(DEFAULT_STREAM_OVERLAY_SETTINGS).map(([key, fallback]) => [
    key,
    key === 'tickerColors' ? normalizeTickerColors(record?.[key], { migrateLegacy }) : (record?.[key] ?? fallback)
  ])
);

const profilePayload = (record) => ({
  title: record.title.trim(),
  description: (record.description || '').trim(),
  slug: record.slug.trim(),
  logoUrl: (record.logoUrl || '').trim(),
  displayName: (record.displayName || '').trim(),
  displayAddress: (record.displayAddress || '').trim(),
  isActive: record.isActive !== false,
  ...overlaySettingsPayload(record)
});

const streamOverlayProfileService = {
  list: async () => {
    const records = unwrap(await apiClient.get(basePath));
    if (!Array.isArray(records)) throw new Error('Unable to read the overlay list.');
    return records.map((record) => ({ ...record, tickerColors: normalizeTickerColors(record.tickerColors, { migrateLegacy: true }) }));
  },
  create: async (record) => unwrap(await apiClient.post(basePath, profilePayload(record))),
  update: async (id, record) => unwrap(await apiClient.put(recordPath(id), profilePayload(record))),
  remove: async (id) => unwrap(await apiClient.delete(recordPath(id))),
  setActive: async (id, isActive) => unwrap(await apiClient.patch(recordPath(id), { isActive })),
  getDefault: async () => overlaySettingsPayload(unwrap(await apiClient.get('/stream-overlay/settings')), { migrateLegacy: true }),
  updateDefault: async (record) => {
    const settings = overlaySettingsPayload(record);
    const saved = unwrap(await apiClient.put('/stream-overlay/settings', settings));
    return overlaySettingsPayload({ ...settings, ...saved });
  }
};

export default streamOverlayProfileService;