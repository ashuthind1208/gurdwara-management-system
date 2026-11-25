import apiClient from './apiClient';
import inaugurationVisitorService from './inaugurationVisitorService';

jest.mock('./apiClient', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

test('simultaneous registration requests share one POST until the anonymous cookie arrives', async () => {
  apiClient.post.mockResolvedValue({ data: { data: { count: 8 } } });
  const first = inaugurationVisitorService.load(true);
  const second = inaugurationVisitorService.load(true);
  expect(first).toBe(second);
  expect(await first).toBe(8);
  expect(apiClient.post).toHaveBeenCalledTimes(1);
  expect(apiClient.post).toHaveBeenCalledWith('/inauguration/visitors', {});
});

test('read-only preview uses GET and invalid counts fail', async () => {
  apiClient.get.mockResolvedValueOnce({ data: { data: { count: 9 } } });
  expect(await inaugurationVisitorService.load(false)).toBe(9);
  apiClient.get.mockResolvedValueOnce({ data: { data: { count: -1 } } });
  await expect(inaugurationVisitorService.load(false)).rejects.toThrow('unavailable');
});