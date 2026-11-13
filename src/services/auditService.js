import contentApiService from './contentApiService';
import apiClient from './apiClient';

const sortLogs = (rows = []) => {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left?.createdAt || 0).getTime();
    const rightTime = new Date(right?.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
};

const auditService = {
  getLogs: async () => {
    const rows = await contentApiService.list('audit_logs');
    if (!Array.isArray(rows)) throw new Error('Unable to read the audit trail.');
    return { data: sortLogs(rows) };
  },
  cleanupLogs: async (daysToKeep) => {
    if (![30, 60, 90, null].includes(daysToKeep)) throw new Error('Invalid audit retention period.');
    const response = await apiClient.post('/admin/audit-logs/cleanup', { daysToKeep, confirm: true });
    const body = response.data;
    const data = body?.data;
    if (body?.ok !== true || !Number.isSafeInteger(data?.deletedCount) || data.deletedCount < 0
      || data.daysToKeep !== daysToKeep || (daysToKeep === null ? data.cutoff !== null : typeof data.cutoff !== 'string' || !Number.isFinite(Date.parse(data.cutoff)))) {
      throw new Error(body?.message || 'Unable to confirm audit cleanup. Reload the audit trail before trying again.');
    }
    return { data };
  }
};

export default auditService;
