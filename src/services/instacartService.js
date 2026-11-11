import apiClient from './apiClient';

const instacartService = {
  getReadiness: async () => {
    const response = await apiClient.get('/instacart/readiness');
    return response.data?.data || { available: false, stores: [] };
  },
  getStoreOptions: async ({ items, postalCode }) => {
    const response = await apiClient.post('/instacart/quote', { items, postalCode });
    return response.data?.data || { available: false, stores: [] };
  }
};

export default instacartService;
