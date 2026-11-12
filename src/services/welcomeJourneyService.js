import apiClient from './apiClient';

const welcomeJourneyService = {
  getSettings: async () => (await apiClient.get('/welcome-journey/settings')).data?.data || {},
  saveSettings: async (settings) => {
    const persistedSettings = Object.fromEntries(Object.entries(settings || {}).filter(([key]) => !['canSave', 'canSaveReason', 'followUpAvailable'].includes(key)));
    return (await apiClient.put('/welcome-journey/settings', persistedSettings)).data?.data;
  },
  submitFollowUp: async (payload) => (await apiClient.post('/welcome-journey/follow-ups', payload)).data?.data,
  listFollowUps: async () => (await apiClient.get('/welcome-journey/follow-ups')).data?.data || []
};

export default welcomeJourneyService;
