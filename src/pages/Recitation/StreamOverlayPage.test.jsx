import { render as baseRender, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StreamOverlayPage from './StreamOverlayPage';
import { useRecitationLive, useRecitationText } from '../../hooks/useRecitation';
import { useBranding } from '../../context/BrandingContext';
import { getPublishedStreamOverlaySettings } from '../../services/streamOverlaySettings';

const render = (ui, options = {}) => baseRender(ui, {
  wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
  ...options
});

jest.mock('../../services/streamOverlaySettings', () => ({
  getPublishedStreamOverlaySettings: jest.fn()
}));

jest.mock('../../hooks/useRecitation', () => ({
  useRecitationLive: jest.fn(),
  useRecitationText: jest.fn()
}));

jest.mock('../../context/BrandingContext', () => ({
  BRANDING_PRESETS: [],
  useBranding: jest.fn()
}));

describe('StreamOverlayPage', () => {
  beforeEach(() => {
    getPublishedStreamOverlaySettings.mockResolvedValue({});
    window.localStorage.removeItem('ssm-stream-overlay-visible');
    window.history.replaceState({}, '', '/stream-overlay?embed=1&lang=gpe');
    useRecitationLive.mockReturnValue({ session: { currentIndex: 0, status: 'live' }, connectionStatus: 'connected' });
    useRecitationText.mockReturnValue({ lines: [{ g: 'ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ', p: 'ਪੰਜਾਬੀ ਅਰਥ', e: 'English meaning' }] });
    useBranding.mockReturnValue({ branding: { organizationName: 'Example Gurdwara', shortName: 'Example', primaryColor: '#0B4EA2', accentColor: '#F4A300', address: '123 Example Road' }, logoSrc: '/logo.png' });
  });

  test('loads published header, ticker and theme from the stable URL', async () => {
    window.history.replaceState({}, '', '/stream-overlay');
    getPublishedStreamOverlaySettings.mockResolvedValue({
      overlayOn: true,
      overlayHeaderMessage: 'Published Diwan',
      upperEnglish: 'Published announcement',
      overlayThemeId: 'brand-colors'
    });
    render(<StreamOverlayPage />);
    expect(await screen.findByText('Published Diwan')).toBeInTheDocument();
    expect(screen.getAllByText('Published announcement').length).toBeGreaterThan(0);
    expect(screen.getByRole('banner')).toHaveStyle({ backgroundColor: '#004080' });
    expect(window.location.search).toBe('');
  });

  test('published visibility overrides a stale local hidden flag', async () => {
    window.localStorage.setItem('ssm-stream-overlay-visible', '0');
    getPublishedStreamOverlaySettings.mockResolvedValue({ overlayOn: true });
    render(<StreamOverlayPage />);
    expect(await screen.findByRole('banner')).toBeInTheDocument();
  });

  test('published visibility hides an external browser source', async () => {
    getPublishedStreamOverlaySettings.mockResolvedValue({ overlayOn: false });
    render(<StreamOverlayPage />);
    await waitFor(() => expect(screen.queryByRole('banner')).not.toBeInTheDocument());
  });

  test('renders the current Gurbani line in a full-width branded footer with date and time', () => {
    render(<StreamOverlayPage />);
    expect(screen.getByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).toBeInTheDocument();
    expect(screen.getByText('ਪੰਜਾਬੀ ਅਰਥ')).toBeInTheDocument();
    expect(screen.getByText('English meaning')).toBeInTheDocument();
    expect(screen.getByText('Example Gurdwara')).toBeInTheDocument();
    expect(screen.getByText('123 Example Road')).toBeInTheDocument();
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toBeInTheDocument();
    expect(screen.queryByText('LIVE · SYNCED')).not.toBeInTheDocument();
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveStyle({ '--overlay-middle-background': 'transparent' });
    expect(screen.getByRole('region', { name: 'Live Gurbani broadcast footer' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Live Gurbani broadcast overlay' })).toHaveStyle({ background: 'transparent' });
  });

  test('keeps the recitation footer content-sized without an automatic ticker spacer', () => {
    window.history.replaceState({}, '', '/stream-overlay?announcement=1&message=Welcome');
    const { container } = render(<StreamOverlayPage />);
    expect(getComputedStyle(container.querySelector('.stream-overlay-footer')).minHeight).toBe('0');
    expect(getComputedStyle(container.querySelector('.stream-overlay-ticker-stack')).marginTop).toBe('0px');
    expect(getComputedStyle(container.querySelector('.stream-overlay-lines')).flexShrink).toBe('0');
  });

  test('never renders connection status in the broadcast header', () => {
    window.history.replaceState({}, '', '/stream-overlay?lang=gpe');
    expect(screen.queryByText('LIVE · SYNCED')).not.toBeInTheDocument();
    window.history.replaceState({}, '', '/stream-overlay?lang=gpe&status=1');
    render(<StreamOverlayPage />);
    expect(screen.queryByText('LIVE · SYNCED')).not.toBeInTheDocument();
  });

  test('ignores legacy custom themes and split layout while filtering languages', () => {
    window.history.replaceState({}, '', '/stream-overlay?layout=split&theme=black&lang=ge&logo=0');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('region', { name: 'Live Gurbani broadcast footer' })).toBeInTheDocument();
    expect(screen.getByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).toBeInTheDocument();
    expect(screen.getByText('English meaning')).toBeInTheDocument();
    expect(screen.queryByText('ਪੰਜਾਬੀ ਅਰਥ')).not.toBeInTheDocument();
  });

  test('uses exact configured brand blue and independently scales each translation', () => {
    window.history.replaceState({}, '', '/stream-overlay?lang=gpe&sizeg=120&sizep=80&sizee=60');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toHaveStyle({ backgroundColor: '#0B4EA2' });
    expect(screen.getByRole('main', { name: 'Live Gurbani broadcast overlay' })).toHaveStyle({
      '--gurbani-size': '1',
      '--punjabi-size': '0.8',
      '--english-size': '0.6'
    });
  });

  test('uses selected preset colors and shows a custom occasion in the header', () => {
    window.history.replaceState({}, '', '/stream-overlay?lang=gpe&brandBlue=%23145D32&brandOrange=%23C89B3C&header=Gurpurab%20Diwan');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toHaveStyle({ backgroundColor: '#145D32' });
    expect(screen.getByText('Gurpurab Diwan')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Live Gurbani broadcast footer' })).toBeInTheDocument();
    expect(screen.getByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).toBeInTheDocument();
  });

  test('supports the sampled Gurdwara-logo navy and saffron palette', () => {
    window.history.replaceState({}, '', '/stream-overlay?lang=gpe&brandBlue=%23004080&brandOrange=%23F89820');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toHaveStyle({ backgroundColor: '#004080' });
    expect(screen.getByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).toHaveStyle({ color: '#F89820' });
  });

  test('supports custom occasion size and a bilingual announcement ticker', () => {
    window.history.replaceState({}, '', '/stream-overlay?header=Diwan&sizeh=150&announcement=1&message=Welcome&messagepa=ਜੀ%20ਆਇਆਂ%20ਨੂੰ');
    render(<StreamOverlayPage />);
    expect(screen.getByText('Diwan')).toHaveStyle({ fontSize: 'clamp(14px, 2vw, 34px)' });
    expect(screen.getByLabelText('Footer announcement ticker')).toBeInTheDocument();
    expect(screen.getAllByText('Welcome').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('ਜੀ ਆਇਆਂ ਨੂੰ').length).toBe(screen.getAllByText('Welcome').length);
    expect(screen.getByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).toBeInTheDocument();
  });

  test('keeps the header when idle and hides the footer when no ticker is set', () => {
    useRecitationLive.mockReturnValue({ session: null });
    useRecitationText.mockReturnValue({ lines: [] });
    window.history.replaceState({}, '', '/stream-overlay?embed=1');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Live Gurbani broadcast footer' })).not.toBeInTheDocument();
  });

  test('shows only a compact ticker with the header when idle and ticker text is provided', () => {
    useRecitationLive.mockReturnValue({ session: null });
    useRecitationText.mockReturnValue({ lines: [] });
    window.history.replaceState({}, '', '/stream-overlay?embed=1&announcement=1&message=Welcome&messagepa=ਜੀ%20ਆਇਆਂ%20ਨੂੰ');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Announcement ticker' })).toHaveClass('stream-overlay-footer-ticker-only');
    expect(screen.getByLabelText('Footer announcement ticker')).toBeInTheDocument();
    expect(screen.queryByText('Gurbani preview')).not.toBeInTheDocument();
  });

  test('stacks independently configured tickers and supports Punjabi header text when idle', () => {
    useRecitationLive.mockReturnValue({ session: null });
    useRecitationText.mockReturnValue({ lines: [] });
    window.history.replaceState({}, '', '/stream-overlay?headerpa=ਸਮਾਗਮ&uppermessage=Upper&upperspeed=200&announcement=1&message=Bottom&tickerspeed=50');
    render(<StreamOverlayPage />);
    expect(screen.getByText('ਸਮਾਗਮ')).toBeInTheDocument();
    expect(screen.getByLabelText('Upper footer announcement ticker')).toBeInTheDocument();
    expect(screen.getByLabelText('Footer announcement ticker')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Announcement ticker' })).toHaveClass('stream-overlay-footer-ticker-only');
  });

  test('sizes Punjabi and English header text independently, including zero', () => {
    window.history.replaceState({}, '', '/stream-overlay?header=Diwan&headerpa=ਸਮਾਗਮ&sizehen=50&sizehpa=0');
    render(<StreamOverlayPage />);
    expect(screen.getByText('Diwan')).toHaveStyle({ fontSize: 'clamp(7px, 1vw, 17px)' });
    expect(screen.getByText('ਸਮਾਗਮ')).toHaveStyle({ fontSize: 'clamp(0px, 0vw, 0px)' });
  });

  test('turns off the overlay when the URL switch is off', () => {
    window.history.replaceState({}, '', '/stream-overlay?on=0');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('main', { hidden: true })).toBeInTheDocument();
    expect(screen.queryByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).not.toBeInTheDocument();
  });

  test('keeps the header and shows only the supplied ticker when no recitation is active', () => {
    useRecitationLive.mockReturnValue({ session: null });
    useRecitationText.mockReturnValue({ lines: [] });
    window.history.replaceState({}, '', '/stream-overlay?announcement=1&message=Welcome&messagepa=ਜੀ%20ਆਇਆਂ%20ਨੂੰ');
    render(<StreamOverlayPage />);
    expect(screen.getByRole('region', { name: 'Announcement ticker' })).toHaveClass('stream-overlay-footer-ticker-only');
    expect(screen.getByLabelText('Footer announcement ticker')).toBeInTheDocument();
    expect(screen.getByRole('banner', { name: 'Gurdwara broadcast header' })).toBeInTheDocument();
    expect(screen.getAllByText('Welcome').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ਜੀ ਆਇਆਂ ਨੂੰ').length).toBe(screen.getAllByText('Welcome').length);
    expect(screen.queryByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).not.toBeInTheDocument();
  });
});
