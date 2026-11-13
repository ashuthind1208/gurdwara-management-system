import auditService from './auditService';
import contentApiService from './contentApiService';
import apiClient from './apiClient';

jest.mock('./contentApiService', () => ({ list: jest.fn() }));
jest.mock('./apiClient', () => ({ post: jest.fn() }));
beforeEach(() => jest.clearAllMocks());

test('loads audit metadata sorted newest first without mutating the response', async () => {
  const rows = [{ id: 'old', createdAt: '2026-01-01T00:00:00Z' }, { id: 'new', createdAt: '2026-11-01T00:00:00Z' }];
  contentApiService.list.mockResolvedValue(rows);
  expect((await auditService.getLogs()).data.map(({ id }) => id)).toEqual(['new', 'old']);
  expect(rows[0].id).toBe('old');
  expect(contentApiService.list).toHaveBeenCalledWith('audit_logs');
});
test('list errors and malformed data reject rather than presenting a successful empty list', async () => {
  contentApiService.list.mockRejectedValue(new Error('Unavailable'));
  await expect(auditService.getLogs()).rejects.toThrow('Unavailable');
  contentApiService.list.mockResolvedValue({});
  await expect(auditService.getLogs()).rejects.toThrow('Unable to read');
});
test.each([30, 60, 90, null])('cleanup sends only explicit confirmation and retention %s', async (daysToKeep) => {
  const data = { deletedCount: 0, cutoff: daysToKeep === null ? null : '2026-10-13T12:00:00.000Z', daysToKeep };
  apiClient.post.mockResolvedValue({ data: { ok: true, data } });
  await expect(auditService.cleanupLogs(daysToKeep)).resolves.toEqual({ data });
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(apiClient.post).toHaveBeenCalledWith('/admin/audit-logs/cleanup', { daysToKeep, confirm: true });
});
test.each([undefined, 0, '30', 'all', 31, { daysToKeep: 30 }, 'users'])('rejects invalid client retention %s before calling API', async (value) => {
  await expect(auditService.cleanupLogs(value)).rejects.toThrow('Invalid audit retention');
  expect(apiClient.post).not.toHaveBeenCalled();
});
test('cleanup propagates HTTP failures and rejects false or malformed success responses', async () => {
  apiClient.post.mockRejectedValue(new Error('Forbidden'));
  await expect(auditService.cleanupLogs(null)).rejects.toThrow('Forbidden');
  for (const body of [{}, { ok: false, message: 'Storage unavailable' }, { ok: true, data: {} },
    { ok: true, data: { daysToKeep: null, cutoff: null, deletedCount: -1 } },
    { ok: true, data: { daysToKeep: null, cutoff: null, deletedCount: '0' } },
    { ok: true, data: { daysToKeep: 30, cutoff: 'invalid', deletedCount: 0 } }]) {
    apiClient.post.mockResolvedValue({ data: body });
    await expect(auditService.cleanupLogs(null)).rejects.toThrow();
  }
});