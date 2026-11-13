import { act, render, screen, within } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WelcomeJourneyBoardPage from './WelcomeJourneyBoardPage';
import brandingService from '../../services/brandingService';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';

jest.mock('../../services/welcomeJourneyService', () => ({ __esModule: true, default: { getSettings: jest.fn() } }));
jest.mock('../../services/brandingService', () => ({ __esModule: true, default: { getBranding: jest.fn() } }));
jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getHomeContent: jest.fn() }, resolveScheduleForDate: jest.fn() }));
jest.mock('../../context/BrandingContext', () => ({ ...jest.requireActual('../../context/BrandingContext'), useBranding: () => ({ branding: { organizationName: 'Example Gurdwara', address: '123 Example Road' }, logoSrc: '/logo.png' }) }));
jest.mock('../../components/common/Seo', () => () => null);
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({ value, fgColor, bgColor }) => <svg data-testid="welcome-qr" data-value={value} data-fg-color={fgColor} data-bg-color={bgColor} /> }));

beforeEach(() => {
  jest.clearAllMocks();
  brandingService.getBranding.mockResolvedValue({ data: { primaryColor: '#123456', accentColor: '#ABCDEF', surfaceColor: '#F0E1D2', textColor: '#102030' } });
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, titleEnglish: 'Welcome home', address: '123 Example Road', directionsUrl: 'https://maps.google.com/?q=test', showProgram: true, showLangar: true, showFollowUp: true, dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }, { id: 'rice', nameEnglish: 'Rice', namePunjabi: 'ਚੌਲ' }], selectedDishIds: ['dal'] });
  resolveScheduleForDate.mockReturnValue({ entries: [{ id: 'morning', timeEn: '10 AM', titleEn: 'Kirtan', isActive: true }] });
  cmsService.getHomeContent.mockResolvedValue({ data: { scheduleDays: [], langarItems: [{ id: 'langar-1', name: 'Milk', needed: true }] } });
});

test('shows the configured welcome, current program, langar and scan QR without a visitor address card', async () => {
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'Welcome home' })).toBeInTheDocument();
  expect(screen.getByText('Kirtan')).toBeInTheDocument();
  expect(screen.getByText('Dal')).toBeInTheDocument();
  expect(screen.getByText('ਦਾਲ')).toHaveAttribute('lang', 'pa');
  expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  expect(screen.queryByText('123 Example Road')).not.toBeInTheDocument();
  expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-value', `${window.location.origin}/welcome`);
  await waitFor(() => expect(screen.getByRole('complementary')).toHaveStyle({ backgroundColor: '#F0E1D2', color: '#102030' }));
  expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-fg-color', '#123456');
  expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-bg-color', '#F0E1D2');
});

test('polls branding every 15 seconds and updates board and card colors without reload', async () => {
  jest.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  try {
    await waitFor(() => expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-fg-color', '#123456'));
    brandingService.getBranding.mockResolvedValue({ data: { primaryColor: '#654321', accentColor: '#FEDCBA', surfaceColor: '#D2E1F0', textColor: '#302010' } });
    const callsBeforePolling = brandingService.getBranding.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(brandingService.getBranding.mock.calls.length).toBeGreaterThan(callsBeforePolling);
    await waitFor(() => expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-fg-color', '#654321'));
    expect(screen.getByRole('complementary')).toHaveStyle({ backgroundColor: '#D2E1F0', color: '#302010' });
    expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-bg-color', '#D2E1F0');
  } finally {
    view.unmount();
    client.clear();
    jest.useRealTimers();
  }
});

test('program and langar use translucent blue glass with white text while the QR retains its own surface', async () => {
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  await screen.findByRole('heading', { name: 'Welcome home' });
  await waitFor(() => expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-fg-color', '#123456'));
  for (const name of ['Today’s program', 'Langar today']) {
    // eslint-disable-next-line testing-library/no-node-access
    const section = screen.getByRole('heading', { name }).closest('section');
    expect(section).toHaveStyle({ backgroundColor: '#12345699', borderColor: '#ffffff40', color: '#ffffff' });
    // jsdom does not expose backdrop-filter through getComputedStyle.
    expect(section.style.backdropFilter).toBe('blur(18px)');
    expect(within(section).getByRole('heading')).toHaveStyle({ color: '#ffffff' });
  }
  expect(screen.getByRole('complementary')).toHaveStyle({ backgroundColor: '#F0E1D2', color: '#102030' });
});

test('hides directions and dish names but keeps service time, langar note and QR when menu is hidden', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, showDirections: false, showLangarMenu: false, langarServiceTimeEnglish: 'From noon', langarServiceTimePunjabi: 'ਦੁਪਹਿਰ ਤੋਂ', dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }], selectedDishIds: ['dal'], theme: 'warm' });
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByText('From noon')).toBeInTheDocument();
  expect(screen.getByText('ਦੁਪਹਿਰ ਤੋਂ')).toHaveAttribute('lang', 'pa');
  expect(screen.getByText('Langar is served to everyone. Please join us.')).toBeInTheDocument();
  expect(screen.queryByText('Dal')).not.toBeInTheDocument();
  expect(screen.queryByText('123 Example Road')).not.toBeInTheDocument();
  expect(screen.queryByText('Directions · Program · Langar')).not.toBeInTheDocument();
  expect(screen.getByText('Program · Langar')).toBeInTheDocument();
  expect(screen.getByText('Scan for today’s guide and community information')).toBeInTheDocument();
  expect(screen.getByTestId('welcome-qr')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'saffron');
});

test('no selected dishes shows only a langar note and never CMS groceries', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: '' }], selectedDishIds: [] });
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByText('Kirtan')).toBeInTheDocument();
  expect(screen.getByText('Langar is served to everyone. Please join us.')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Today’s langar menu' })).not.toBeInTheDocument();
  expect(screen.queryByText('Milk')).not.toBeInTheDocument();
});

test('direct access to a disabled LED journey shows unavailable without QR or content', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: false });
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByRole('status')).toHaveTextContent('The welcome guide is temporarily unavailable.');
  expect(screen.queryByTestId('welcome-qr')).not.toBeInTheDocument();
  expect(screen.queryByText('Kirtan')).not.toBeInTheDocument();
  expect(screen.queryByText('Langar today')).not.toBeInTheDocument();
});

test('shows configured Punjabi intro and program/langar headings on the lobby screen', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, titlePunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ', introPunjabi: 'ਸਾਡੀ ਸੰਗਤ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ', programHeadingPunjabi: 'ਅੱਜ ਦਾ ਪ੍ਰੋਗਰਾਮ', langarHeadingPunjabi: 'ਅੱਜ ਦਾ ਲੰਗਰ', showProgram: true, showLangar: true });
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByText('ਸਾਡੀ ਸੰਗਤ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ')).toBeInTheDocument();
  expect(screen.getByText('ਅੱਜ ਦਾ ਪ੍ਰੋਗਰਾਮ')).toBeInTheDocument();
  expect(screen.getByText('ਅੱਜ ਦਾ ਲੰਗਰ')).toBeInTheDocument();
});

test('respects disabled program and langar sections', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, showProgram: false, showLangar: false, showFollowUp: false });
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'Welcome to Example Gurdwara' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Today’s program' })).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: 'Langar today' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Optional follow-up/)).not.toBeInTheDocument();
});
