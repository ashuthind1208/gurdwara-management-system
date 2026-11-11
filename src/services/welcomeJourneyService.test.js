import apiClient from './apiClient';
import welcomeJourneyService from './welcomeJourneyService';

jest.mock('./apiClient', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn() }
}));

afterEach(() => jest.clearAllMocks());

test('removes server-only capability flags before saving settings', async () => {
  const settings = { enabled: true, titleEnglish: 'Welcome', dishes: [], selectedDishIds: [], canSave: true, followUpAvailable: true };
  apiClient.put.mockResolvedValue({ data: { data: { enabled: true, titleEnglish: 'Welcome' } } });
  await expect(welcomeJourneyService.saveSettings(settings)).resolves.toEqual({ enabled: true, titleEnglish: 'Welcome' });
  expect(apiClient.put).toHaveBeenCalledWith('/welcome-journey/settings', {
    enabled: true, titleEnglish: 'Welcome', dishes: [], selectedDishIds: []
  });
});
