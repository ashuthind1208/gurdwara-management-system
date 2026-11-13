import { act, render as baseRender, screen, waitFor } from '@testing-library/react';
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
  ...jest.requireActual('../../services/streamOverlaySettings'),
  getPublishedStreamOverlaySettings: jest.fn()
}));

jest.mock('../../hooks/useRecitation', () => ({
  useRecitationLive: jest.fn(),
  useRecitationText: jest.fn()
}));

jest.mock('../../context/BrandingContext', () => ({
  BRANDING_PRESETS: [
    { id: 'heritage', primaryColor: '#14532d', accentColor: '#c89b3c' },
    { id: 'other', primaryColor: '#123456', accentColor: '#abcdef' }
  ],
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

  test('loads a channel-specific header and uploaded logo from its slug', async () => {
    window.history.replaceState({}, '', '/stream-overlay/channel-one');
    getPublishedStreamOverlaySettings.mockResolvedValue({ id: 'one', isActive: true, overlayOn: true, logoUrl: '/api/uploads/cms/channel.png', overlayHeaderMessage: 'Channel one diwan' });
    render(<StreamOverlayPage />);
    expect(await screen.findByText('Channel one diwan')).toBeInTheDocument();
    expect(getPublishedStreamOverlaySettings).toHaveBeenCalledWith('channel-one');
    expect(screen.getByAltText('')).toHaveAttribute('src', '/api/uploads/cms/channel.png');
  });

  test.each(['/stream-overlay', '/stream-overlay/channel-one'])('published header colors apply only to the header at %s', async (path) => {
    window.history.replaceState({}, '', `${path}?headerBackgroundColor=%23000000&headerBorderColor=%23ffffff`);
    getPublishedStreamOverlaySettings.mockResolvedValue({ id: 'one', isActive: true, overlayOn: true, overlayThemeId: 'brand-colors', overlayHeaderMessage: 'Custom header colors', headerBackgroundColor: '#123456', headerBorderColor: '#abcdef', upperEnglish: 'Upper message', overlayAnnouncement: 'Lower message' });
    render(<StreamOverlayPage />); await screen.findByText('Custom header colors');
    expect(screen.getByRole('banner')).toHaveStyle({ backgroundColor: '#123456' });
    const css = screen.getByRole('main').textContent;
    expect(css.match(/\.stream-overlay-header\{[^}]+\}/)[0]).toContain('solid #abcdef');
    expect(screen.getByRole('region', { name: 'Live Gurbani broadcast footer' })).toHaveStyle({ backgroundColor: '#004080' });
    expect(css.match(/\.stream-overlay-footer\{[^}]+\}/)[0]).toContain('solid #F89820');
    expect(css.match(/\.stream-overlay-logo\{[^}]+\}/)[0]).toContain('border:2px solid #F89820');
    expect(screen.getByText(/\d{1,2}:\d{2}/)).toHaveStyle({ color: '#F89820' });
    expect(screen.getByText('ਗੁਰਬਾਣੀ ਦੀ ਪੰਕਤੀ')).toHaveStyle({ color: '#F89820' });
    expect(screen.getByLabelText('Upper footer announcement ticker')).toHaveStyle({ backgroundColor: '#004080', color: '#ffffff' });
    expect(screen.getByLabelText('Footer announcement ticker')).toHaveStyle({ backgroundColor: '#F89820', color: '#004080' });
    expect(css).toContain('--overlay-header-height:clamp(80px,12vh,140px);--overlay-header-padding:clamp(12px,1.6vh,24px)');
    expect(css).toContain('padding:var(--overlay-header-padding) 4vw');
    expect(css).toContain('--overlay-header-height:clamp(72px,12vh,112px)'); expect(css).toContain('padding-block:var(--overlay-header-padding)');
  });

  test.each([
    [{ headerBackgroundColor: '#123456' }, '#123456', '#F89820'],
    [{ headerBorderColor: '#abcdef' }, '#004080', '#abcdef'],
    [{ headerBackgroundColor: '', headerBorderColor: '' }, '#004080', '#F89820'],
    [{}, '#004080', '#F89820'],
    [{ headerBackgroundColor: '#fff', headerBorderColor: 'red' }, '#004080', '#F89820'],
    [{ headerBackgroundColor: '#123456\n', headerBorderColor: 123456 }, '#004080', '#F89820']
  ])('header colors independently use explicit valid colors or the selected theme: %j', async (colors, background, border) => {
    getPublishedStreamOverlaySettings.mockResolvedValue({ overlayOn: true, overlayThemeId: 'brand-colors', overlayHeaderMessage: 'Color fallback', ...colors });
    render(<StreamOverlayPage />); await screen.findByText('Color fallback');
    expect(screen.getByRole('banner')).toHaveStyle({ backgroundColor: background });
    expect(screen.getByRole('main').textContent.match(/\.stream-overlay-header\{[^}]+\}/)[0]).toContain(`solid ${border}`);
  });

  test.each(['/stream-overlay', '/stream-overlay/channel-one'])('footer inheritance follows theme changes while custom colors survive at %s', async (path) => {
    window.history.replaceState({}, '', path);
    const client = new QueryClient(); const key = ['published-stream-overlay-settings', path === '/stream-overlay' ? '' : 'channel-one'];
    const initial = { id: 'one', isActive: true, overlayOn: true, overlayThemeId: 'heritage', upperEnglish: 'Theme upper', overlayAnnouncement: 'Theme lower', tickerColors: { upperbg: '#004080', upperfg: '#ffffff', lowerbg: '#F89820', lowerfg: '#004080' } };
    getPublishedStreamOverlaySettings.mockResolvedValue(initial);
    render(<StreamOverlayPage />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(screen.getByLabelText('Upper footer announcement ticker')).toHaveStyle({ backgroundColor: '#14532d', color: '#ffffff' }));
    const upper = screen.getByLabelText('Upper footer announcement ticker'); const lower = screen.getByLabelText('Footer announcement ticker');
    expect(lower).toHaveStyle({ backgroundColor: '#c89b3c', color: '#14532d' });
    const custom = { ...initial, overlayThemeId: 'other', headerBackgroundColor: '#654321', tickerColors: { upperbg: '', upperfg: '#112233', lowerbg: '#004080', lowerfg: '' } };
    await act(async () => { client.setQueryData(key, custom); });
    await waitFor(() => expect(upper).toHaveStyle({ backgroundColor: '#123456', color: '#112233' })); expect(lower).toHaveStyle({ backgroundColor: '#004080', color: '#123456' });
    await act(async () => { client.setQueryData(key, { ...custom, overlayThemeId: 'heritage' }); });
    await waitFor(() => expect(upper).toHaveStyle({ backgroundColor: '#14532d', color: '#112233' })); expect(lower).toHaveStyle({ backgroundColor: '#004080', color: '#14532d' }); expect(screen.getByRole('banner')).toHaveStyle({ backgroundColor: '#654321' });
  });

  test('explicit ticker query colors override normalized published colors, not stray top-level settings', async () => {
    window.history.replaceState({}, '', '/stream-overlay?upperbg=%23010203&lowerfg=%23abcdef');
    getPublishedStreamOverlaySettings.mockResolvedValue({ overlayOn: true, overlayThemeId: 'heritage', upperEnglish: 'Query upper', overlayAnnouncement: 'Query lower', upperfg: '#000000', tickerColors: { upperbg: '', upperfg: '', lowerbg: '', lowerfg: '' } }); render(<StreamOverlayPage />);
    await waitFor(() => expect(screen.getByLabelText('Upper footer announcement ticker')).toHaveStyle({ backgroundColor: '#010203', color: '#ffffff' })); expect(screen.getByLabelText('Footer announcement ticker')).toHaveStyle({ backgroundColor: '#c89b3c', color: '#abcdef' });
  });

  test('inactive named channels stay transparent even with on=1', async () => {
    window.history.replaceState({}, '', '/stream-overlay/channel-one?on=1');
    getPublishedStreamOverlaySettings.mockResolvedValue({ id: 'one', isActive: false, overlayOn: false }); render(<StreamOverlayPage />);
    await waitFor(() => expect(getPublishedStreamOverlaySettings).toHaveBeenCalledWith('channel-one')); expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  test.each([
    [{ displayName: 'Community Milton', displayAddress: '12 Community Road' }, 'Community Milton', '12 Community Road'],
    [{ displayName: 'Community Milton' }, 'Community Milton', '123 Example Road'],
    [{ displayAddress: '12 Community Road' }, 'Example Gurdwara', '12 Community Road'],
    [{ displayName: '', displayAddress: '' }, 'Example Gurdwara', '123 Example Road'],
    [{ displayName: '   ', displayAddress: '  ' }, 'Example Gurdwara', '123 Example Road'],
    [{}, 'Example Gurdwara', '123 Example Road']
  ])('named identity uses independent custom fields or branding fallback: %j', async (identity, name, address) => {
    window.history.replaceState({}, '', '/stream-overlay/channel-one');
    getPublishedStreamOverlaySettings.mockResolvedValue({ id: 'one', isActive: true, overlayOn: true, ...identity }); render(<StreamOverlayPage />);
    await screen.findByRole('banner'); expect(screen.getByText(name, { exact: true })).toBeInTheDocument(); expect(screen.getByText(address, { exact: true })).toBeInTheDocument(); expect(screen.getByAltText('')).toHaveAttribute('src', '/logo.png');
  });

  test('default overlay ignores named identity metadata and retains existing branding behavior', async () => {
    getPublishedStreamOverlaySettings.mockResolvedValue({ overlayOn: true, displayName: 'Unwanted Milton', displayAddress: 'Unwanted address', overlayHeaderMessage: 'Loaded default' }); render(<StreamOverlayPage />);
    await screen.findByText('Loaded default'); expect(screen.getByText('Example Gurdwara', { exact: true })).toBeInTheDocument(); expect(screen.getByText('123 Example Road', { exact: true })).toBeInTheDocument();
    expect(screen.queryByText('Unwanted Milton')).not.toBeInTheDocument(); expect(screen.queryByText('Unwanted address')).not.toBeInTheDocument();
  });

  test('does not display default branding content for an unknown channel', async () => {
    window.history.replaceState({}, '', '/stream-overlay/missing?on=1'); getPublishedStreamOverlaySettings.mockResolvedValue({}); render(<StreamOverlayPage />);
    await waitFor(() => expect(getPublishedStreamOverlaySettings).toHaveBeenCalledWith('missing')); expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  test('fits the transparent video area to actual rendered header and ticker footer heights', async () => {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.classList?.contains('stream-overlay-header')) return { height: 126 };
      if (this.classList?.contains('stream-overlay-footer')) return { height: 318 };
      return original.call(this);
    };
    try { render(<StreamOverlayPage />); await waitFor(() => expect(screen.getByRole('main')).toHaveStyle({ '--overlay-center-top': '126px', '--overlay-center-bottom': '318px' })); }
    finally { HTMLElement.prototype.getBoundingClientRect = original; }
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
    expect(screen.getByRole('main')).toHaveStyle({ '--overlay-center-color': 'transparent' });
    expect(screen.getByRole('region', { name: 'Live Gurbani broadcast footer' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: 'Live Gurbani broadcast overlay' })).toHaveStyle({ background: 'transparent' });
  });

  test('keeps the recitation footer content-sized without an automatic ticker spacer', () => {
    window.history.replaceState({}, '', '/stream-overlay?announcement=1&message=Welcome');
    render(<StreamOverlayPage />);
    expect(getComputedStyle(screen.getByRole('region', { name: 'Live Gurbani broadcast footer' })).minHeight).toBe('0');
    expect(screen.getByRole('main').textContent).toMatch(/\.stream-overlay-ticker-stack\{margin-top:0;/);
    expect(screen.getByRole('main').textContent).toMatch(/\.stream-overlay-lines\{[^}]*flex-shrink:0/);
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
