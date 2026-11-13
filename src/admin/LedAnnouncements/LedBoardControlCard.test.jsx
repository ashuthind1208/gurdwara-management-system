import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LED_BOARDS } from '../../constants/ledBoards';
import LedBoardControlCard from './LedBoardControlCard';
import ledAnnouncementService from '../../services/ledAnnouncementService';
import ledBoardSettingsService, { normalizeSettings } from '../../services/ledBoardSettingsService';

jest.mock('../../services/ledAnnouncementService', () => ({ __esModule: true, default: { getAnnouncements: jest.fn() }, isAnnouncementForScreen: jest.fn(() => true), isAnnouncementLive: jest.fn(() => true) }));
jest.mock('../../services/ledBoardSettingsService', () => {
  const actual = jest.requireActual('../../services/ledBoardSettingsService');
  return { ...actual, __esModule: true, default: { ...actual.default, getSettings: jest.fn(), saveSettings: jest.fn() } };
});
jest.mock('../../hooks/useDailyHukamnama', () => ({ __esModule: true, default: () => ({ hasHukamnama: true }) }));
beforeEach(() => {
  jest.clearAllMocks(); ledAnnouncementService.getAnnouncements.mockResolvedValue({ data: [] });
  ledBoardSettingsService.getSettings.mockResolvedValue({ data: normalizeSettings({ intervalSeconds: 20 }) });
  ledBoardSettingsService.saveSettings.mockImplementation(async (settings) => ({ data: settings }));
});
test('shows one row per board with its own time control, board link, and active switch', async () => {
  render(<QueryClientProvider client={new QueryClient()}><LedBoardControlCard /></QueryClientProvider>);
  expect(await screen.findAllByRole('listitem')).toHaveLength(LED_BOARDS.length);
  expect(screen.queryByText('Choose which boards the LED screen plays and how long each stays on screen. Changes apply automatically; nothing needs to be restarted.')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'LED Board Slideshow' })).toBeInTheDocument();
  for (const board of LED_BOARDS) {
    const row = screen.getAllByRole('listitem').find((item) => within(item).queryByRole('spinbutton', { name: `${board.title} slide duration in seconds` }));
    expect(row).toBeDefined(); expect(within(row).getByRole('spinbutton', { name: `${board.title} slide duration in seconds` })).toHaveValue(board.key === 'hukamnama' ? 60 : 20);
    expect(within(row).getByRole('link', { name: `Open ${board.title}` })).toHaveAttribute('href', board.path); expect(within(row).getByRole('switch', { name: `${board.title} active` })).toBeChecked();
  }
});
test('saves a custom duration for just the selected slide', async () => {
  render(<QueryClientProvider client={new QueryClient()}><LedBoardControlCard /></QueryClientProvider>);
  const rows = await screen.findAllByRole('listitem'); const row = rows.find((item) => within(item).queryByRole('spinbutton', { name: 'Donation Board slide duration in seconds' }));
  await userEvent.click(within(row).getByRole('button', { name: '30s' }));
  await waitFor(() => expect(ledBoardSettingsService.saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ intervalSeconds: 20, slideDurations: expect.objectContaining({ donation: 30 }) })));
});