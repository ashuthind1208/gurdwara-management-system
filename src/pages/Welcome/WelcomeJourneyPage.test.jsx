import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WelcomeJourneyPage from './WelcomeJourneyPage';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';

jest.mock('../../services/welcomeJourneyService', () => ({ __esModule: true, default: { getSettings: jest.fn(), submitFollowUp: jest.fn() } }));
jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getHomeContent: jest.fn() }, resolveScheduleForDate: jest.fn() }));
jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Singh Sabha Milton', address: '7035 Sixth Line' }, logoSrc: '/logo.png' }) }));
jest.mock('../../components/common/Seo', () => () => null);

const defaultSettings = { enabled: true, showProgram: true, showLangar: true, showFollowUp: true, dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }, { id: 'rice', nameEnglish: 'Rice', namePunjabi: 'ਚੌਲ' }], selectedDishIds: ['dal'] };
const setup = (overrides = {}) => {
  const settings = { ...defaultSettings, ...overrides };
  welcomeJourneyService.getSettings.mockResolvedValue(settings);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['welcome-journey-settings'], settings);
  queryClient.setQueryData(['welcome-journey-home-content'], { scheduleDays: [], langarItems: [{ id: 'milk', name: 'Milk', needed: true }] });
  return render(<MemoryRouter initialEntries={['/welcome']}><QueryClientProvider client={queryClient}><WelcomeJourneyPage /></QueryClientProvider></MemoryRouter>);
};

beforeEach(() => {
  jest.clearAllMocks();
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, showProgram: true, showLangar: true, showFollowUp: true });
  welcomeJourneyService.submitFollowUp.mockResolvedValue({ id: 'follow-up-1' });
  cmsService.getHomeContent.mockResolvedValue({ data: { scheduleDays: [], langarItems: [{ id: 'milk', name: 'Milk', needed: true }] } });
  resolveScheduleForDate.mockReturnValue({ entries: [{ id: 'kirtan', timeEn: '10:00 AM', titleEn: 'Kirtan', isActive: true }] });
});

test('provides directions, current program and langar without requiring an account', async () => {
  setup({ directionsUrl: 'https://maps.google.com/?q=test', address: '7035 Sixth Line', showFollowUp: false });
  expect(await screen.findByText('Kirtan')).toBeInTheDocument();
  expect(screen.getByText('Dal')).toBeInTheDocument();
  expect(screen.getByText('ਦਾਲ')).toHaveAttribute('lang', 'pa');
  expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', 'https://maps.google.com/?q=test');
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
  expect(screen.queryByText(/sign in|create an account/i)).not.toBeInTheDocument();
});

test('only sends an optional follow-up after the visitor checks explicit consent', async () => {
  setup();
  expect(await screen.findByRole('heading', { name: 'Would you like us to follow up?' })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Your name'), 'Visitor');
  await userEvent.type(screen.getByLabelText('Email address'), 'visitor@example.com');
  await userEvent.click(screen.getByRole('button', { name: 'Request a follow-up' }));
  expect(welcomeJourneyService.submitFollowUp).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Request a follow-up' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Thank you. A member of our team will be in touch.');
  expect(welcomeJourneyService.submitFollowUp).toHaveBeenCalledWith(expect.objectContaining({ name: 'Visitor', email: 'visitor@example.com', consent: true }));
});

test('hides the visitor form when disabled in admin settings', async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['welcome-journey-settings'], { enabled: true, showFollowUp: false });
  queryClient.setQueryData(['welcome-journey-home-content'], { scheduleDays: [], langarItems: [] });
  render(<MemoryRouter initialEntries={['/welcome']}><QueryClientProvider client={queryClient}><WelcomeJourneyPage /></QueryClientProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Welcome to Singh Sabha Milton' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Would you like us to follow up?' })).not.toBeInTheDocument();
});

test('honors directions and menu switches while retaining bilingual service time and the langar note', async () => {
  setup({ showDirections: false, showLangarMenu: false, langarServiceTimeEnglish: 'Noon to 2 PM', langarServiceTimePunjabi: 'ਦੁਪਹਿਰ ਤੋਂ', theme: 'warm' });
  expect(await screen.findByText('Noon to 2 PM')).toBeInTheDocument();
  expect(screen.getByText('ਦੁਪਹਿਰ ਤੋਂ')).toHaveAttribute('lang', 'pa');
  expect(screen.getByText('Langar is served to everyone. Please join us.')).toBeInTheDocument();
  expect(screen.queryByText('Dal')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Get directions' })).not.toBeInTheDocument();
  expect(screen.queryByText('7035 Sixth Line')).not.toBeInTheDocument();
  expect(screen.getByRole('banner')).toHaveClass('from-[#7c2d12]');
});

test.each([{}, { dishes: [], selectedDishIds: [] }, { selectedDishIds: [] }])('empty or legacy menus show only a welcoming note, never grocery inventory (%j)', async (menu) => {
  setup({ ...menu, ...(Object.keys(menu).length ? {} : { dishes: undefined, selectedDishIds: undefined }) });
  expect(await screen.findByText('Langar is served to everyone. Please join us.')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Today’s langar menu' })).not.toBeInTheDocument();
  expect(screen.queryByText('Milk')).not.toBeInTheDocument();
});

test('disabling langar hides the menu and service time, without removing program or follow-up', async () => {
  setup({ showLangar: false, langarServiceTimeEnglish: 'Noon to 2 PM' });
  expect(await screen.findByText('Kirtan')).toBeInTheDocument();
  expect(screen.queryByText('Langar today')).not.toBeInTheDocument();
  expect(screen.queryByText('Noon to 2 PM')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Email address')).toBeInTheDocument();
});

test('disabled visitor journey shows an unavailable notice instead of its contents', async () => {
  setup({ enabled: false });
  expect(await screen.findByText('The welcome guide is temporarily unavailable.')).toBeInTheDocument();
  expect(screen.queryByText('Dal')).not.toBeInTheDocument();
  expect(screen.queryByText('Kirtan')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
});
