import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WelcomeJourneyAdminCard from './WelcomeJourneyAdminCard';
import welcomeJourneyService from '../../services/welcomeJourneyService';

jest.mock('../../services/welcomeJourneyService', () => ({ __esModule: true, default: { getSettings: jest.fn(), saveSettings: jest.fn(), listFollowUps: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ logout: jest.fn().mockResolvedValue(undefined) }) }));

beforeEach(() => {
  jest.clearAllMocks();
  welcomeJourneyService.getSettings.mockResolvedValue({ dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }], selectedDishIds: ['dal'] });
  welcomeJourneyService.listFollowUps.mockResolvedValue([]);
  welcomeJourneyService.saveSettings.mockImplementation(async (values) => values);
});

const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WelcomeJourneyAdminCard /></QueryClientProvider>);

test('reuses saved dishes without removing unchecked dishes from the library', async () => {
  setup();
  const checkbox = await screen.findByRole('checkbox', { name: 'Serve Dal today' });
  await waitFor(() => expect(checkbox).toBeEnabled());
  await userEvent.click(checkbox);
  await userEvent.click(screen.getByRole('button', { name: 'Save Welcome Journey' }));
  expect(await screen.findByText('Welcome Journey settings saved.')).toBeInTheDocument();
  expect(welcomeJourneyService.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ selectedDishIds: [], dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }] }));
});

test('adds a bilingual dish and selects it for today', async () => {
  setup();
  await screen.findByRole('checkbox', { name: 'Serve Dal today' });
  await userEvent.click(screen.getByRole('button', { name: 'Add dish' }));
  await userEvent.type(screen.getByLabelText('Dish 2 name'), 'Roti');
  await userEvent.type(screen.getByLabelText('Dish 2 Punjabi name'), 'ਰੋਟੀ');
  await userEvent.click(screen.getByRole('checkbox', { name: 'Serve Roti today' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save Welcome Journey' }));
  await screen.findByText('Welcome Journey settings saved.');
  const saved = welcomeJourneyService.saveSettings.mock.calls[0][0];
  expect(saved.dishes[1]).toEqual(expect.objectContaining({ nameEnglish: 'Roti', namePunjabi: 'ਰੋਟੀ' }));
  expect(saved.selectedDishIds).toContain(saved.dishes[1].id);
});

test('removing a saved dish also removes it from today’s menu', async () => {
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Remove Dal from library' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save Welcome Journey' }));
  await screen.findByText('Welcome Journey settings saved.');
  expect(welcomeJourneyService.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ dishes: [], selectedDishIds: [] }));
});

test('shows saved settings read-only without verified Super Admin Google access', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ canSave: false, followUpAvailable: false, dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: '' }], selectedDishIds: ['dal'] });
  welcomeJourneyService.listFollowUps.mockRejectedValue(new Error('Unavailable'));
  setup();
  expect(await screen.findByText(/could not be verified as an active, approved Super Admin Google account/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign out and sign in with Google' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Serve Dal today' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save Welcome Journey' })).toBeDisabled();
  expect(await screen.findByText('Visitor follow-up requests are unavailable.')).toBeInTheDocument();
  expect(screen.queryByText('No visitor requests yet.')).not.toBeInTheDocument();
});