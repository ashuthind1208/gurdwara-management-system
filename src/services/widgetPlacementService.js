import apiClient from './apiClient';

const widgetPlacementService = {
  get: async () => {
    const response = await apiClient.get('/widget-placements');
    if (!Array.isArray(response.data?.data?.placements)) throw new Error('Invalid widget placements response.');
    return response.data.data;
  },
  save: async ({ placements, layouts }) => {
    const response = await apiClient.put('/widget-placements', { placements, layouts });
    if (!Array.isArray(response.data?.data?.placements) || !Array.isArray(response.data?.data?.layouts)) throw new Error('Unable to verify saved widget placements.');
    return response.data.data;
  }
};

export default widgetPlacementService;
