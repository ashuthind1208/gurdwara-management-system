import { render, screen } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WelcomeJourneyBoardPage from './WelcomeJourneyBoardPage';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';

jest.mock('../../services/welcomeJourneyService', () => ({ __esModule: true, default: { getSettings: jest.fn() } }));
jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getHomeContent: jest.fn() }, resolveScheduleForDate: jest.fn() }));
jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Singh Sabha Milton', address: '7035 Sixth Line' }, logoSrc: '/logo.png' }) }));
jest.mock('../../components/common/Seo', () => () => null);
jest.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }) => <svg data-testid="welcome-qr" data-value={value} /> }));

beforeEach(() => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, titleEnglish: 'Welcome home', address: '7035 Sixth Line', directionsUrl: 'https://maps.google.com/?q=test', showProgram: true, showLangar: true, showFollowUp: true, dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }, { id: 'rice', nameEnglish: 'Rice', namePunjabi: 'ਚੌਲ' }], selectedDishIds: ['dal'] });
  resolveScheduleForDate.mockReturnValue({ entries: [{ id: 'morning', timeEn: '10 AM', titleEn: 'Kirtan', isActive: true }] });
  cmsService.getHomeContent.mockResolvedValue({ data: { scheduleDays: [], langarItems: [{ id: 'langar-1', name: 'Milk', needed: true }] } });
});

test('shows the configured welcome, current program, langar, directions and scan QR', async () => {
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'Welcome home' })).toBeInTheDocument();
  expect(screen.getByText('Kirtan')).toBeInTheDocument();
  expect(screen.getByText('Dal')).toBeInTheDocument();
  expect(screen.getByText('ਦਾਲ')).toHaveAttribute('lang', 'pa');
  expect(screen.queryByText('Rice')).not.toBeInTheDocument();
  expect(screen.queryByText('Milk')).not.toBeInTheDocument();
  expect(screen.getByText('7035 Sixth Line')).toBeInTheDocument();
  expect(screen.getByTestId('welcome-qr')).toHaveAttribute('data-value', `${window.location.origin}/welcome`);
});

test('hides directions and dish names but keeps service time, langar note and QR when menu is hidden', async () => {
  welcomeJourneyService.getSettings.mockResolvedValue({ enabled: true, showDirections: false, showLangarMenu: false, langarServiceTimeEnglish: 'From noon', langarServiceTimePunjabi: 'ਦੁਪਹਿਰ ਤੋਂ', dishes: [{ id: 'dal', nameEnglish: 'Dal', namePunjabi: 'ਦਾਲ' }], selectedDishIds: ['dal'], theme: 'warm' });
  render(<QueryClientProvider client={new QueryClient()}><WelcomeJourneyBoardPage /></QueryClientProvider>);
  expect(await screen.findByText('From noon')).toBeInTheDocument();
  expect(screen.getByText('ਦੁਪਹਿਰ ਤੋਂ')).toHaveAttribute('lang', 'pa');
  expect(screen.getByText('Langar is served to everyone. Please join us.')).toBeInTheDocument();
  expect(screen.queryByText('Dal')).not.toBeInTheDocument();
  expect(screen.queryByText('7035 Sixth Line')).not.toBeInTheDocument();
  expect(screen.queryByText('Directions · Program · Langar')).not.toBeInTheDocument();
  expect(screen.getByText('Program · Langar')).toBeInTheDocument();
  expect(screen.getByText('Scan for visitor information')).toBeInTheDocument();
  expect(screen.getByTestId('welcome-qr')).toBeInTheDocument();
  expect(screen.getByRole('main')).toHaveClass('from-[#7c2d12]');
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
  expect(await screen.findByRole('heading', { name: 'Welcome to Singh Sabha Milton' })).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Today’s program' })).not.toBeInTheDocument());
  expect(screen.queryByRole('heading', { name: 'Langar today' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Optional follow-up/)).not.toBeInTheDocument();
});
