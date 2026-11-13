import apiClient from './apiClient';
import service, { overlaySettingsPayload } from './streamOverlayProfileService';
import { DEFAULT_STREAM_OVERLAY_SETTINGS } from './streamOverlaySettings';

jest.mock('./apiClient', () => ({ get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() }));

const profile = { id: 'one/id', title: ' Diwan ', description: ' Broadcast ', slug: 'diwan', logoUrl: '/api/uploads/cms/logo.png', displayName: ' Community Milton ', displayAddress: ' 12 Community Road ', isActive: false, overlayOn: true, englishSize: 45, tickerColors: { upperbg: '#123456' }, createdAt: 'ignored' };
beforeEach(() => jest.clearAllMocks());

test('lists and unwraps named profiles, including direct array responses', async () => {
  apiClient.get.mockResolvedValueOnce({ data: { ok: true, data: [profile] } }).mockResolvedValueOnce({ data: [] });
  expect(await service.list()).toEqual([{ ...profile, tickerColors: overlaySettingsPayload(profile).tickerColors }]);
  expect(await service.list()).toEqual([]);
  expect(apiClient.get).toHaveBeenCalledWith('/stream-overlay/overlays');
});

test('does not silently hide malformed lists or API failures', async () => {
  apiClient.get.mockResolvedValueOnce({ data: { ok: true, data: {} } }).mockRejectedValueOnce(new Error('Forbidden'));
  await expect(service.list()).rejects.toThrow('Unable to read');
  await expect(service.list()).rejects.toThrow('Forbidden');
});

test('creates flattened named records with known settings and no server metadata', async () => {
  apiClient.post.mockResolvedValue({ data: { data: { ...profile, id: 'created' } } });
  expect(await service.create(profile)).toHaveProperty('id', 'created');
  const [path, body] = apiClient.post.mock.calls[0];
  expect(path).toBe('/stream-overlay/overlays');
  expect(body).toEqual({ title: 'Diwan', description: 'Broadcast', slug: 'diwan', logoUrl: profile.logoUrl, displayName: 'Community Milton', displayAddress: '12 Community Road', isActive: false, ...overlaySettingsPayload(profile) });
  expect(body).not.toHaveProperty('id');
  expect(body).not.toHaveProperty('createdAt');
  expect(body).not.toHaveProperty('settings');
});

test('updates and deletes using safely encoded IDs and unwraps responses', async () => {
  apiClient.put.mockResolvedValue({ data: { data: profile } });
  apiClient.delete.mockResolvedValue({ data: { data: { deleted: true } } });
  expect(await service.update(profile.id, profile)).toEqual(profile);
  expect(apiClient.put).toHaveBeenCalledWith('/stream-overlay/overlays/one%2Fid', expect.objectContaining({ title: 'Diwan', displayName: 'Community Milton', displayAddress: '12 Community Road' }));
  expect(await service.remove(profile.id)).toEqual({ deleted: true });
  expect(apiClient.delete).toHaveBeenCalledWith('/stream-overlay/overlays/one%2Fid');
});

test('active toggle sends only isActive, independently of visibility and settings', async () => {
  apiClient.patch.mockResolvedValue({ data: { data: { isActive: true } } });
  expect(await service.setActive(profile.id, true)).toEqual({ isActive: true });
  expect(apiClient.patch).toHaveBeenCalledWith('/stream-overlay/overlays/one%2Fid', { isActive: true });
});

test('older named records serialize optional identity as blank and trim each field independently', async () => {
  apiClient.post.mockResolvedValue({ data: { data: {} } });
  apiClient.put.mockResolvedValue({ data: { data: {} } });
  await service.create({ title: 'Old channel', slug: 'old-channel' });
  expect(apiClient.post.mock.calls[0][1]).toEqual(expect.objectContaining({ displayName: '', displayAddress: '' }));
  await service.update('one', { ...profile, displayName: '   ', displayAddress: ' New address ' });
  expect(apiClient.put.mock.calls[0][1]).toEqual(expect.objectContaining({ displayName: '', displayAddress: 'New address' }));
  await service.update('one', { ...profile, displayName: ' New name Milton ', displayAddress: '   ' });
  expect(apiClient.put.mock.calls[1][1]).toEqual(expect.objectContaining({ displayName: 'New name Milton', displayAddress: '' }));
});

test('loads legacy settings with defaults and merged ticker colors, ignoring metadata', async () => {
  apiClient.get.mockResolvedValue({ data: { data: profile } });
  expect(await service.getDefault()).toEqual(overlaySettingsPayload(profile));
  expect(apiClient.get).toHaveBeenCalledWith('/stream-overlay/settings');
  expect(overlaySettingsPayload(null)).toEqual(DEFAULT_STREAM_OVERLAY_SETTINGS);
  expect(overlaySettingsPayload(profile).tickerColors).toEqual({ ...DEFAULT_STREAM_OVERLAY_SETTINGS.tickerColors, upperbg: '#123456' });
});

test('saves the default only to the legacy endpoint with a strict settings whitelist', async () => {
  apiClient.put.mockResolvedValue({ data: { data: { overlayOn: false } } });
  const saved = await service.updateDefault(profile);
  expect(apiClient.put).toHaveBeenCalledWith('/stream-overlay/settings', overlaySettingsPayload(profile));
  expect(Object.keys(apiClient.put.mock.calls[0][1])).toEqual(Object.keys(DEFAULT_STREAM_OVERLAY_SETTINGS));
  expect(saved).toEqual({ ...overlaySettingsPayload(profile), overlayOn: false });
  expect(saved).not.toHaveProperty('title');
});

test('migrates complete legacy palettes on named/default reads but never strips edited matching picks in writes', async () => {
  const tickerColors = { upperbg: '#004080', upperfg: '#ffffff', lowerbg: '#F89820', lowerfg: '#004080' };
  const legacy = { ...profile, tickerColors };
  apiClient.get.mockResolvedValueOnce({ data: { data: [legacy] } }).mockResolvedValueOnce({ data: { data: legacy } });
  expect((await service.list())[0].tickerColors).toEqual(DEFAULT_STREAM_OVERLAY_SETTINGS.tickerColors);
  expect((await service.getDefault()).tickerColors).toEqual(DEFAULT_STREAM_OVERLAY_SETTINGS.tickerColors);
  expect(overlaySettingsPayload(legacy).tickerColors).toEqual(tickerColors);
  apiClient.post.mockResolvedValue({ data: { data: legacy } });
  apiClient.put.mockResolvedValue({ data: { data: legacy } });
  await service.create(legacy);
  await service.update(profile.id, legacy);
  await service.updateDefault(legacy);
  expect(apiClient.post.mock.calls[0][1].tickerColors).toEqual(tickerColors);
  apiClient.put.mock.calls.forEach(([, body]) => expect(body.tickerColors).toEqual(tickerColors));
});

test('named and default payloads include independent header colors while old records inherit the theme', async () => {
  expect(overlaySettingsPayload(profile)).toEqual(expect.objectContaining({ headerBackgroundColor: '', headerBorderColor: '' }));
  const colored = { ...profile, headerBackgroundColor: '#123456', headerBorderColor: '#abcdef' };
  apiClient.post.mockResolvedValue({ data: { data: colored } });
  apiClient.put.mockResolvedValue({ data: { data: colored } });
  await service.create(colored);
  await service.update(profile.id, { ...colored, headerBackgroundColor: '' });
  await service.updateDefault(colored);
  expect(apiClient.post.mock.calls[0][1]).toEqual(expect.objectContaining({ headerBackgroundColor: '#123456', headerBorderColor: '#abcdef' }));
  expect(apiClient.put.mock.calls[0][1]).toEqual(expect.objectContaining({ headerBackgroundColor: '', headerBorderColor: '#abcdef' }));
  expect(apiClient.put.mock.calls[1][1]).toEqual(expect.objectContaining({ headerBackgroundColor: '#123456', headerBorderColor: '#abcdef' }));
  apiClient.get.mockResolvedValue({ data: { data: profile } });
  expect(await service.getDefault()).toEqual(expect.objectContaining({ headerBackgroundColor: '', headerBorderColor: '' }));
});