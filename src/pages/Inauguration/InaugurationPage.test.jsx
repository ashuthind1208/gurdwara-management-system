import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import InaugurationPage from './InaugurationPage';
import inaugurationService, { normalizeInaugurationSettings } from '../../services/inaugurationService';
import { useBranding } from '../../context/BrandingContext';
import inaugurationVisitorService from '../../services/inaugurationVisitorService';
import AudioPillPlayer from '../../components/common/AudioPillPlayer';

jest.mock('../../components/common/AudioPillPlayer', () => ({ __esModule: true, default: jest.fn(() => <div>Darbar Sahib audio</div>) }));
jest.mock('../../services/inaugurationVisitorService', () => ({ __esModule: true, default: { load: jest.fn() } }));

jest.mock('../../context/BrandingContext', () => ({ useBranding: jest.fn() }));
jest.mock('../../services/inaugurationService', () => ({
  __esModule: true, ...jest.requireActual('../../services/inaugurationService'),
  default: { getSettings: jest.fn(), saveSettings: jest.fn() }
}));

const makeSettings = (extra = {}) => normalizeInaugurationSettings({
  enabled: true, headingEnglish: 'A new beginning', headingPunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ',
  messageEnglish: 'First line\nSecond line', messagePunjabi: 'ਪਹਿਲੀ ਲਾਈਨ\nਦੂਜੀ ਲਾਈਨ', ...extra
});
const renderSaved = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><InaugurationPage /></QueryClientProvider>);
  return { ...view, client };
};

beforeEach(() => {
  inaugurationVisitorService.load.mockResolvedValue(42);
  useBranding.mockReturnValue({ branding: { organizationName: 'Our Gurdwara' }, logoSrc: '/branding-logo.png' });
  inaugurationService.getSettings.mockResolvedValue(makeSettings());
});
afterEach(() => jest.useRealTimers());

test('draft renders disabled settings without a query provider or API call, preserves bilingual newlines and colors', () => {
  render(<InaugurationPage settings={makeSettings({ enabled: false, backgroundColor: '#123456', textColor: '#FEDCBA', accentColor: '#AA7700', logoSize: 200 })} />);
  expect(screen.getByRole('region', { name: 'Landing page draft preview' })).toHaveStyle({ backgroundColor: '#123456', color: '#FEDCBA' });
  expect(screen.getByRole('heading', { level: 1 })).toHaveClass('text-center');
  expect(screen.getByRole('heading', { level: 2 })).toHaveAttribute('lang', 'pa');
  const english = screen.getByText(/First line/);
  expect(english.textContent).toBe('First line\nSecond line');
  expect(english).toHaveClass('whitespace-pre-wrap');
  expect(screen.getByText(/ਪਹਿਲੀ ਲਾਈਨ/).textContent).toBe('ਪਹਿਲੀ ਲਾਈਨ\nਦੂਜੀ ਲਾਈਨ');
  expect(screen.getByRole('img')).toHaveStyle({ width: '400px', height: '400px' });
  expect(screen.getByRole('img')).toHaveClass('mb-8');
  expect(screen.getByText('Visitors · Preview')).toHaveClass('justify-self-center', 'text-xl');
  expect(inaugurationService.getSettings).not.toHaveBeenCalled();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

test('logo uses safe custom URL, then branding fallback; two broken logos stop retrying', () => {
  const { rerender } = render(<InaugurationPage settings={makeSettings({ logoUrl: '/launch.png' })} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', '/launch.png');
  fireEvent.error(screen.getByRole('img'));
  expect(screen.getByRole('img')).toHaveAttribute('src', '/branding-logo.png');
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  rerender(<InaugurationPage settings={makeSettings({ logoUrl: '/updated.png' })} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', '/updated.png');
});

test('unsafe logo and link URLs never reach DOM navigation', () => {
  const unsafeUrl = ['javascript', 'alert(1)'].join(':');
  render(<InaugurationPage settings={makeSettings({ logoUrl: unsafeUrl, buttons: [{ id: 'unsafe', enabled: true, labelEnglish: 'Unsafe', labelPunjabi: '', url: unsafeUrl, availableAt: '' }] })} />);
  expect(screen.getByRole('img')).toHaveAttribute('src', '/branding-logo.png');
  expect(screen.getByRole('button', { name: 'Unsafe' })).toBeDisabled();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  expect(screen.getByText('Link unavailable')).toBeInTheDocument();
});

test('checks every second, shows Toronto schedule and accessible countdown, unlocks without fetching, and cleans timer', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-20T17:00:00Z'));
  const { unmount } = render(<InaugurationPage settings={makeSettings({ buttons: [
    { id: 'scheduled', enabled: true, labelEnglish: 'Enter', labelPunjabi: 'ਅੱਗੇ', url: '/home', availableAt: '2026-11-20T17:00:02Z' },
    { id: 'off', enabled: false, labelEnglish: 'Off', labelPunjabi: '', url: '/off', availableAt: '' }
  ] })} />);
  const disabled = screen.getByRole('button', { name: /Enter/ });
  expect(disabled).toBeDisabled();
  expect(disabled).toHaveAccessibleDescription(/Opens in 0h 0m 2s/);
  expect(screen.getByText(/Nov 20, 2026, 12:00:02 p.m. EST/)).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByText('Opens in 0h 0m 1s')).toBeInTheDocument();
  act(() => jest.advanceTimersByTime(1000));
  expect(screen.getByRole('link', { name: /Enter/ })).toHaveAttribute('href', '/home');
  expect(screen.getByRole('link', { name: /Enter/ })).not.toHaveAttribute('aria-describedby');
  expect(screen.queryByText('Available now')).not.toBeInTheDocument();
  expect(screen.queryByText(/^Opens /)).not.toBeInTheDocument();
  expect(screen.getByText('Not available')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
  expect(inaugurationService.getSettings).not.toHaveBeenCalled();
  unmount();
  expect(jest.getTimerCount()).toBe(0);
});

test('live draft changes reflect immediately; invalid schedule stays disabled', () => {
  const { rerender } = render(<InaugurationPage settings={makeSettings()} />);
  rerender(<InaugurationPage settings={makeSettings({ headingEnglish: 'Updated draft', buttons: [{ id: 'bad', enabled: true, labelEnglish: 'Scheduled', labelPunjabi: '', url: '/home', availableAt: 'invalid' }] })} />);
  expect(screen.getByRole('heading', { name: 'Updated draft' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Scheduled' })).toBeDisabled();
});

test('saved page loads using GET, renders standalone and blocks a disabled homepage', async () => {
  inaugurationService.getSettings.mockResolvedValue(makeSettings({ enabled: false }));
  const { client } = renderSaved();
  expect(await screen.findByText('The landing page is not currently enabled.')).toBeInTheDocument();
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  client.clear();
});

test('saved page reports errors and supports retry', async () => {
  inaugurationService.getSettings.mockRejectedValueOnce(new Error('Offline'));
  const { client } = renderSaved();
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('heading', { name: 'A new beginning' })).toBeInTheDocument();
  await waitFor(() => expect(inaugurationService.getSettings).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('main')).toHaveAccessibleName('Landing page');
  client.clear();
});

test('immediate and elapsed links show bilingual labels without redundant availability text', () => {
  render(<InaugurationPage settings={makeSettings({ buttons: [
    { id: 'now', enabled: true, labelEnglish: 'Visit', labelPunjabi: 'ਅੱਗੇ', url: '/home', availableAt: '' },
    { id: 'elapsed', enabled: true, labelEnglish: 'Donate', labelPunjabi: '', url: '/donation', availableAt: '2020-01-01T00:00:00Z' }
  ] })} />);
  expect(screen.getByRole('link', { name: /Visit ਅੱਗੇ/ })).toHaveAttribute('href', '/home');
  expect(screen.getByRole('link', { name: 'Donate' })).toHaveAttribute('href', '/donation');
  expect(screen.queryByText('Available now')).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('button group stays centered and wraps as draft buttons are added', () => {
  const button = (index) => ({ id: `button-${index}`, enabled: true, labelEnglish: `Button ${index}`, labelPunjabi: '', url: '/home', availableAt: '' });
  const { rerender } = render(<InaugurationPage settings={makeSettings({ buttons: [button(1)] })} />);
  expect(screen.getByRole('group', { name: 'Landing page buttons' })).toHaveClass('flex', 'flex-wrap', 'justify-center');
  expect(screen.getByRole('link', { name: 'Button 1' })).toHaveClass('w-full', 'text-center');
  rerender(<InaugurationPage settings={makeSettings({ buttons: Array.from({ length: 5 }, (_, index) => button(index + 1)) })} />);
  expect(screen.getAllByRole('link')).toHaveLength(5);
  expect(screen.getByRole('group', { name: 'Landing page buttons' })).toHaveClass('justify-center', 'flex-wrap');
});

test('calendar dates appear above a content-only ticker without legacy image or links', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-11-24T17:00:00Z'));
  render(<InaugurationPage settings={makeSettings({ occasion: {
    enabled: true, date: '2026-11-24', titleEnglish: 'Guru Nanak Gurpurab', titlePunjabi: 'ਗੁਰਪੁਰਬ',
    descriptionEnglish: 'Join the sangat.', descriptionPunjabi: 'ਜੀ ਆਇਆਂ ਨੂੰ', imageUrl: '/uploads/occasion.jpg',
    links: [{ labelEnglish: 'Learn more', url: 'https://example.com/occasion' }]
  } })} />);
  expect(screen.getByRole('region', { name: 'Special occasion ticker' })).toHaveClass('occasion-ticker-draft');
  expect(screen.getAllByText('November 24, 2026').length).toBeGreaterThan(0);
  expect(screen.getAllByText(/9 Maghar 558 Nanakshahi/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('img', { name: 'Guru Nanak Gurpurab' })).not.toBeInTheDocument();
  const ticker = screen.getByRole('region', { name: 'Special occasion ticker' });
  expect(within(ticker).queryByText('November 24, 2026')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Learn more' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Toronto local time/)).not.toBeInTheDocument();
  expect(inaugurationVisitorService.load).not.toHaveBeenCalled();
});

test('public ticker sticks to bottom with custom colors and reserves its height', () => {
  render(<InaugurationPage draft={false} settings={makeSettings({ occasion: { enabled: true, titleEnglish: 'Today', backgroundColor: '#123456', textColor: '#FEDCBA', fontSize: 24, height: 100 } })} />);
  const ticker = screen.getByRole('region', { name: 'Special occasion ticker' });
  expect(ticker).toHaveClass('occasion-ticker-fixed');
  expect(ticker).toHaveStyle({ backgroundColor: '#123456', color: '#FEDCBA', fontSize: '24px' });
  fireEvent.click(screen.getByRole('button', { name: 'Pause occasion ticker' }));
  expect(screen.getByRole('button', { name: 'Resume occasion ticker' })).toHaveAttribute('aria-pressed', 'true');
});

test('saved preview reads counter without registering a visit', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><InaugurationPage preview /></QueryClientProvider>);
  expect(await screen.findByText('Visitors · 42')).toBeInTheDocument();
  expect(inaugurationVisitorService.load).toHaveBeenCalledWith(false);
  expect(inaugurationVisitorService.load).not.toHaveBeenCalledWith(true);
  expect(AudioPillPlayer).toHaveBeenLastCalledWith(expect.objectContaining({ autoPlay: false, initialVolume: 0.5 }), undefined);
  client.clear();
});

test('actual landing page registers an anonymous visit and displays the count', async () => {
  render(<InaugurationPage settings={makeSettings()} draft={false} />);
  expect(await screen.findByText('Visitors · 42')).toBeInTheDocument();
  expect(inaugurationVisitorService.load).toHaveBeenCalledWith(true);
  expect(AudioPillPlayer).toHaveBeenLastCalledWith(expect.objectContaining({ autoPlay: true, initialVolume: 0.5, stream: true }), undefined);
});

test('saved settings poll every 15 seconds', async () => {
  jest.useFakeTimers();
  const { client } = renderSaved();
  await act(async () => { await Promise.resolve(); });
  await act(async () => { jest.advanceTimersByTime(10); });
  expect(inaugurationService.getSettings).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(15000); });
  expect(inaugurationService.getSettings).toHaveBeenCalledTimes(2);
  client.clear();
});
