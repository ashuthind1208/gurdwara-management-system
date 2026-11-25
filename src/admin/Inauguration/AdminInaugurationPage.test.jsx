import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminInaugurationPage from './AdminInaugurationPage';
import inaugurationService, { INAUGURATION_QUERY_KEY, normalizeInaugurationSettings, toInaugurationLocalDateTime } from '../../services/inaugurationService';
import uploadService from '../../services/uploadService';
import { adminNav } from '../../constants/navigation';
import DeleteConfirmationGuard from '../../components/common/DeleteConfirmationGuard';

jest.mock('../../context/BrandingContext', () => ({ useBranding: () => ({ branding: { organizationName: 'Gurdwara' }, logoSrc: '/branding.png' }) }));
jest.mock('../../services/inaugurationService', () => ({
  __esModule: true, ...jest.requireActual('../../services/inaugurationService'),
  default: { getSettings: jest.fn(), saveSettings: jest.fn() }
}));
jest.mock('../../services/uploadService', () => ({ __esModule: true, default: { uploadFile: jest.fn() } }));

const setup = async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><AdminInaugurationPage /></QueryClientProvider>);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save landing page settings' })).toBeEnabled());
  return { ...view, client };
};
const addButton = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add button' }));
  fireEvent.change(screen.getByLabelText('Label (English)'), { target: { value: 'Enter website' } });
  fireEvent.change(screen.getByLabelText('Label (Punjabi)'), { target: { value: 'ਅੱਗੇ' } });
  fireEvent.change(within(screen.getByRole('dialog')).getByLabelText('URL'), { target: { value: '/home' } });
};

test('occasion edits remain a draft, require either language content and save multiline content explicitly', async () => {
  await setup();
  expect(screen.getByLabelText('Enable occasion ticker')).not.toBeChecked();
  expect(screen.getByLabelText('Occasion date')).toHaveValue('');
  fireEvent.click(screen.getByLabelText('Enable occasion ticker'));
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  expect(screen.getByRole('alert')).toHaveTextContent('English or Punjabi content');
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  for (const language of ['English', 'Punjabi']) {
    expect(screen.getByLabelText(`${language} content`)).toHaveAttribute('maxlength', '4000');
    expect(screen.getByLabelText(`${language} content`).tagName).toBe('TEXTAREA');
    expect(screen.queryByLabelText(`Occasion title (${language})`)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`Occasion description (${language})`)).not.toBeInTheDocument();
  }
  for (const [label, value] of [['English content', 'Celebration\nWelcome\neveryone'], ['Punjabi content', 'ਸਮਾਗਮ\nਜੀ ਆਇਆਂ ਨੂੰ'], ['Occasion date', '2026-11-24']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  await screen.findByText('Landing page settings saved.');
  expect(inaugurationService.saveSettings.mock.calls[0][0]).toMatchObject({ enabled: false, occasion: {
    enabled: true, date: '2026-11-24', titleEnglish: '', titlePunjabi: '',
    descriptionEnglish: '', descriptionPunjabi: '', imageUrl: '',
    contentEnglish: 'Celebration\nWelcome\neveryone', contentPunjabi: 'ਸਮਾਗਮ\nਜੀ ਆਇਆਂ ਨੂੰ',
    backgroundColor: '#071B36', textColor: '#FFFFFF', fontSize: 20, height: 80, speed: 60, links: []
  } });
});

test('legacy text migrates to content, links stay hidden and refresh cannot overwrite draft', async () => {
  const links = [{ labelEnglish: 'More', labelPunjabi: 'ਹੋਰ', url: 'https://example.com/more' }];
  inaugurationService.getSettings.mockResolvedValue(normalizeInaugurationSettings({ occasion: {
    enabled: true, titleEnglish: 'Legacy', descriptionEnglish: 'Welcome\neveryone', titlePunjabi: 'ਸਮਾਗਮ', links
  } }));
  const { client } = await setup();
  expect(screen.getByLabelText('English content')).toHaveValue('Legacy\nWelcome\neveryone');
  expect(screen.getByLabelText('Punjabi content')).toHaveValue('ਸਮਾਗਮ');
  expect(screen.queryByRole('button', { name: 'Add occasion link' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Occasion link 1 URL')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('English content'), { target: { value: '' } });
  act(() => client.setQueryData(INAUGURATION_QUERY_KEY, normalizeInaugurationSettings({ occasion: { titleEnglish: 'Other save' } })));
  expect(screen.getByLabelText('English content')).toHaveValue('');
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  await screen.findByText('Landing page settings saved.');
  expect(inaugurationService.saveSettings.mock.calls[0][0].occasion).toMatchObject({
    titleEnglish: 'Legacy', descriptionEnglish: 'Welcome\neveryone', titlePunjabi: 'ਸਮਾਗਮ',
    contentEnglish: '', contentPunjabi: 'ਸਮਾਗਮ', links
  });
});

test('ticker defaults and style edits remain a draft, save explicitly and preserve hidden legacy images', async () => {
  inaugurationService.getSettings.mockResolvedValue(normalizeInaugurationSettings({ occasion: { imageUrl: '/api/uploads/legacy.webp' } }));
  await setup();
  expect(screen.getByRole('heading', { name: 'Special occasion ticker' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Occasion photo URL')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Upload occasion photo')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Occasion background color')).toHaveValue('#071b36');
  expect(screen.getByLabelText('Occasion text color')).toHaveValue('#ffffff');
  const fontSize = screen.getByRole('slider', { name: 'Occasion font size: 20 px' });
  const height = screen.getByRole('slider', { name: 'Occasion height: 80 px' });
  const speed = screen.getByRole('slider', { name: 'Occasion speed: 60 px/s' });
  expect(speed).toHaveValue('60');
  expect(speed).toHaveAttribute('min', '10');
  expect(speed).toHaveAttribute('max', '200');
  expect(speed).toHaveAttribute('step', '1');
  expect(fontSize).toHaveAttribute('min', '12');
  expect(fontSize).toHaveAttribute('max', '40');
  expect(fontSize).toHaveAttribute('step', '1');
  expect(height).toHaveAttribute('min', '48');
  expect(height).toHaveAttribute('max', '160');
  expect(height).toHaveAttribute('step', '1');
  fireEvent.change(screen.getByLabelText('Occasion background color'), { target: { value: '#123456' } });
  fireEvent.change(screen.getByLabelText('Occasion text color hex'), { target: { value: '#ABCDEF' } });
  expect(screen.getByLabelText('Occasion text color')).toHaveValue('#abcdef');
  fireEvent.change(fontSize, { target: { value: '40' } });
  fireEvent.change(height, { target: { value: '160' } });
  fireEvent.change(speed, { target: { value: '10' } });
  expect(screen.getByRole('slider', { name: 'Occasion speed: 10 px/s' })).toHaveValue('10');
  fireEvent.change(speed, { target: { value: '200' } });
  expect(screen.getByRole('slider', { name: 'Occasion speed: 200 px/s' })).toHaveValue('200');
  expect(screen.getByRole('slider', { name: 'Occasion font size: 40 px' })).toHaveValue('40');
  expect(screen.getByRole('slider', { name: 'Occasion height: 160 px' })).toHaveValue('160');
  expect(uploadService.uploadFile).not.toHaveBeenCalled();
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  await screen.findByText('Landing page settings saved.');
  expect(inaugurationService.saveSettings.mock.calls[0][0].occasion).toMatchObject({ backgroundColor: '#123456', textColor: '#ABCDEF', fontSize: 40, height: 160, speed: 200, imageUrl: '/api/uploads/legacy.webp' });
});

test('ticker color validation keeps draft and saving locks occasion controls', async () => {
  await setup();
  fireEvent.change(screen.getByLabelText('English content'), { target: { value: 'Keep occasion' } });
  for (const label of ['Occasion background color hex', 'Occasion text color hex']) {
    fireEvent.change(screen.getByLabelText(label), { target: { value: '#abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
    expect(screen.getByRole('alert')).toHaveTextContent('six-digit hex');
    expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(label), { target: { value: '#123456' } });
  }
  expect(screen.getByLabelText('English content')).toHaveValue('Keep occasion');
  let finish;
  inaugurationService.saveSettings.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  await waitFor(() => expect(screen.getByLabelText('Occasion background color')).toBeDisabled());
  expect(screen.getByLabelText('Enable occasion ticker')).toBeDisabled();
  expect(screen.getByRole('slider', { name: 'Occasion font size: 20 px' })).toBeDisabled();
  expect(screen.getByRole('slider', { name: 'Occasion height: 80 px' })).toBeDisabled();
  expect(screen.getByRole('slider', { name: 'Occasion speed: 60 px/s' })).toBeDisabled();
  expect(screen.getByLabelText('English content')).toBeDisabled();
  expect(screen.getByLabelText('Punjabi content')).toBeDisabled();
  await act(async () => finish(normalizeInaugurationSettings({ occasion: { contentEnglish: 'Keep occasion' } })));
  await screen.findByText('Landing page settings saved.');
});

beforeEach(() => {
  inaugurationService.getSettings.mockResolvedValue(normalizeInaugurationSettings());
  inaugurationService.saveSettings.mockImplementation(async (settings) => settings);
  uploadService.uploadFile.mockResolvedValue({ url: '/uploaded-logo.png' });
});

test('loads defaults, previews while disabled, edits live without publishing and saves explicitly', async () => {
  await setup();
  expect(screen.getByRole('switch', { name: 'Use landing page as homepage' })).toHaveAttribute('aria-checked', 'false');
  const draft = screen.getByRole('region', { name: 'Landing page draft preview' });
  expect(within(draft).getByRole('heading', { level: 1 })).toHaveTextContent('Welcome to our inauguration');
  fireEvent.change(screen.getByLabelText('Heading (English)'), { target: { value: 'Our launch' } });
  fireEvent.change(screen.getByLabelText('Message (Punjabi)'), { target: { value: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ\nਜੀ ਆਇਆਂ ਨੂੰ' } });
  fireEvent.change(screen.getByLabelText('Background color'), { target: { value: '#123456' } });
  fireEvent.change(screen.getByRole('slider', { name: 'Logo size: 180 px' }), { target: { value: '240' } });
  fireEvent.click(screen.getByLabelText('Use landing page as homepage'));
  expect(within(draft).getByRole('heading', { name: 'Our launch' })).toBeInTheDocument();
  expect(draft).toHaveStyle({ backgroundColor: '#123456' });
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  expect(await screen.findByText('Landing page settings saved.')).toBeInTheDocument();
  expect(inaugurationService.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, headingEnglish: 'Our launch', logoSize: 240 }), expect.anything());
  expect(screen.getByRole('link', { name: 'Open saved landing page preview' })).toHaveAttribute('href', '/inauguration-preview');
  expect(screen.getByRole('link', { name: 'Open saved landing page preview' })).toHaveAttribute('target', '_blank');
  expect(screen.getByRole('link', { name: 'Open saved landing page preview' })).toHaveAttribute('rel', 'noopener noreferrer');
});

test('turning off the homepage toggle saves without removing landing page content', async () => {
  inaugurationService.getSettings.mockResolvedValue(normalizeInaugurationSettings({ enabled: true, headingEnglish: 'Our launch' }));
  await setup();
  const toggle = screen.getByLabelText('Use landing page as homepage');
  expect(toggle).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(toggle);
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  await screen.findByText('Landing page settings saved.');
  expect(inaugurationService.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ enabled: false, headingEnglish: 'Our launch' }), expect.anything());
});

test('edits bilingual buttons, converts user-local schedule to ISO, toggles enabled and removes', async () => {
  await setup();
  addButton();
  const local = '2026-11-20T12:34:56';
  fireEvent.change(screen.getByLabelText('Available at (local time)'), { target: { value: local } });
  fireEvent.click(within(screen.getByRole('dialog')).getByLabelText('Enabled'));
  fireEvent.click(screen.getByRole('button', { name: 'Save button' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
  const table = screen.getByRole('table', { name: 'Button links' });
  expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Button labels', 'URL', 'Enabled status', 'Available at (local time)', 'Actions']);
  expect(within(table).getByText('Disabled')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  await screen.findByText('Landing page settings saved.');
  expect(inaugurationService.saveSettings.mock.calls[0][0].buttons[0]).toMatchObject({ labelEnglish: 'Enter website', labelPunjabi: 'ਅੱਗੇ', url: '/home', enabled: false, availableAt: new Date(local).toISOString() });
  fireEvent.click(screen.getByRole('button', { name: 'Edit button 1' }));
  expect(screen.getByLabelText('Available at (local time)')).toHaveValue(`${toInaugurationLocalDateTime(new Date(local).toISOString())}.000`);
  fireEvent.change(screen.getByLabelText('Label (English)'), { target: { value: 'Edited link' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save button' }));
  expect(within(table).getByText('Edited link')).toBeInTheDocument();
  expect(screen.getByText(/Schedules use your device timezone/)).toHaveTextContent(Intl.DateTimeFormat().resolvedOptions().timeZone);
  render(<DeleteConfirmationGuard />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete button 1' }));
  expect(within(table).queryByText('/home')).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(inaugurationService.saveSettings).toHaveBeenCalledTimes(1);
});

test('limits buttons to 12 and validates labels, URLs, and logo without saving', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Add button' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save button' }));
  expect(screen.getByRole('alert')).toHaveTextContent('needs a label');
  fireEvent.change(screen.getByLabelText('Label (English)'), { target: { value: 'Enter' } });
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: '//evil.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save button' }));
  expect(screen.getByRole('alert')).toHaveTextContent('safe root-relative');
  fireEvent.change(screen.getByLabelText('URL'), { target: { value: '/home' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save button' }));
  fireEvent.change(screen.getByLabelText('Logo URL'), { target: { value: ['javascript', 'alert(1)'].join(':') } });
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Logo URL');
  for (let index = 1; index < 12; index += 1) { addButton(); fireEvent.click(screen.getByRole('button', { name: 'Save button' })); }
  expect(screen.getByRole('button', { name: 'Add button' })).toBeDisabled();
  expect(screen.getByRole('heading', { name: 'Button links (12/12)' })).toBeInTheDocument();
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
});

test('upload uses cms image service with 5 MB limit and only updates the draft', async () => {
  await setup();
  const file = new File(['fake image'], 'logo.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByLabelText('Logo URL')).toHaveValue('/uploaded-logo.png'));
  expect(uploadService.uploadFile).toHaveBeenCalledWith({ service: 'cms', file, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], maxSizeMB: 5, onProgress: expect.any(Function) });
  expect(screen.getByRole('img')).toHaveAttribute('src', '/uploaded-logo.png');
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
});

test('shows upload/save failures without losing the draft', async () => {
  await setup();
  uploadService.uploadFile.mockRejectedValueOnce(new Error('File is too large. Maximum allowed size is 5 MB.'));
  fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('5 MB');
  inaugurationService.saveSettings.mockRejectedValueOnce({ response: { data: { message: 'Not authorized' } } });
  fireEvent.change(screen.getByLabelText('Heading (English)'), { target: { value: 'Keep my draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Not authorized');
  expect(screen.getByLabelText('Heading (English)')).toHaveValue('Keep my draft');
});

test('query refresh cannot overwrite an edited draft', async () => {
  const { client } = await setup();
  fireEvent.change(screen.getByLabelText('Heading (English)'), { target: { value: 'Unsaved work' } });
  act(() => client.setQueryData(INAUGURATION_QUERY_KEY, normalizeInaugurationSettings({ headingEnglish: 'Other saved copy' })));
  expect(screen.getByLabelText('Heading (English)')).toHaveValue('Unsaved work');
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
});

test('loading failure disables editing and save, retry restores the form', async () => {
  inaugurationService.getSettings.mockRejectedValueOnce(new Error('Offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AdminInaugurationPage /></QueryClientProvider>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load saved settings');
  expect(screen.getByLabelText('Enable occasion ticker')).toBeDisabled();
  expect(screen.getByLabelText('Occasion background color')).toBeDisabled();
  expect(screen.getByLabelText('Use landing page as homepage')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save landing page settings' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save landing page settings' })).toBeEnabled());
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
});

test('dialog is portaled, traps focus, and Cancel or Escape discards changes without altering the draft', async () => {
  const { container } = await setup();
  const add = screen.getByRole('button', { name: 'Add button' });
  add.focus();
  addButton();
  const dialog = screen.getByRole('dialog', { name: 'Add button' });
  expect(container).not.toContainElement(dialog);
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  const first = within(dialog).getByLabelText('Label (English)');
  expect(first).toHaveFocus();
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Save button' })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Save button' }), { key: 'Tab' });
  expect(first).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(add).toHaveFocus();
  expect(screen.getByRole('heading', { name: 'Button links (0/12)' })).toBeInTheDocument();
  addButton();
  fireEvent.click(screen.getByRole('button', { name: 'Save button' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit button 1' }));
  fireEvent.change(screen.getByLabelText('Label (English)'), { target: { value: 'Discard this' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(within(screen.getByRole('table')).getByText('Enter website')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Edit button 1' }));
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
});

test('generic navigation follows branding, headers use full-width dividers, and hex colors stay strict', async () => {
  await setup();
  const brandingIndex = adminNav.findIndex((entry) => entry.path === '/admin/gurdwara-branding');
  expect(adminNav[brandingIndex + 1]).toEqual({ label: 'Landing Page', path: '/admin/inauguration' });
  expect(screen.queryByRole('heading', { name: 'Landing Page' })).not.toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'Use landing page as homepage' })).toBeInTheDocument();
  const heading = screen.getByRole('heading', { name: 'Button links (0/12)' });
  // eslint-disable-next-line testing-library/no-node-access -- Verify the header wrapper owns the full-width divider.
  expect(heading.closest('.admin-card-header-row')).toHaveClass('border-b');
  expect(heading).toHaveStyle({ borderBottom: '0', padding: '0', margin: '0' });
  expect(screen.getByLabelText('Background color')).toHaveAttribute('type', 'color');
  fireEvent.change(screen.getByLabelText('Background color hex'), { target: { value: '#ABCDEF' } });
  expect(screen.getByLabelText('Background color')).toHaveValue('#abcdef');
  fireEvent.change(screen.getByLabelText('Background color hex'), { target: { value: '#abc' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save landing page settings' }));
  expect(screen.getByRole('alert')).toHaveTextContent('six-digit hex');
  expect(inaugurationService.saveSettings).not.toHaveBeenCalled();
});
