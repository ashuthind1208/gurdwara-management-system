import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StreamOverlayManager from './StreamOverlayManager';
import AdminRecitationsPage from './AdminRecitationsPage';
import service from '../../services/streamOverlayProfileService';
import { DEFAULT_STREAM_OVERLAY_SETTINGS } from '../../services/streamOverlaySettings';
import uploadService from '../../services/uploadService';
import recitationService from '../../services/recitationService';
import { useRecitationLive, useRecitationText } from '../../hooks/useRecitation';

jest.mock('../../services/streamOverlayProfileService', () => {
  const actual = jest.requireActual('../../services/streamOverlayProfileService');
  return { ...actual, default: { list: jest.fn(), create: jest.fn(), update: jest.fn(), remove: jest.fn(), setActive: jest.fn(), getDefault: jest.fn(), updateDefault: jest.fn() }, __esModule: true };
});
jest.mock('../../services/uploadService', () => ({ uploadFile: jest.fn() }));
jest.mock('../../services/recitationService', () => ({ listSessions: jest.fn(), step: jest.fn(), end: jest.fn(), remove: jest.fn() }));
jest.mock('../../hooks/useRecitation', () => ({ ...jest.requireActual('../../hooks/useRecitation'), useRecitationLive: jest.fn(), useRecitationText: jest.fn() }));

const named = { ...DEFAULT_STREAM_OVERLAY_SETTINGS, id: 'one', title: 'Sunday Diwan', description: 'Weekly broadcast', slug: 'sunday-diwan', logoUrl: '', isActive: true, overlayOn: false, englishSize: 65 };
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const setup = async () => {
  render(<StreamOverlayManager />);
  await screen.findByRole('button', { name: 'Edit Default overlay' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add overlay' })).toBeEnabled());
};
const openAdd = async () => {
  await setup();
  const trigger = screen.getByRole('button', { name: 'Add overlay' });
  trigger.focus(); fireEvent.click(trigger);
  return screen.getByRole('dialog', { name: 'Add overlay' });
};
const expectNoWrites = () => { ['create', 'update', 'updateDefault', 'remove', 'setActive'].forEach((method) => expect(service[method]).not.toHaveBeenCalled()); };
beforeEach(() => {
  jest.clearAllMocks();
  service.getDefault.mockResolvedValue({ ...DEFAULT_STREAM_OVERLAY_SETTINGS, overlayHeaderMessage: 'Existing default' });
  service.list.mockResolvedValue([{ ...named }]);
  service.create.mockImplementation(async (draft) => ({ ...draft, id: 'created' }));
  service.update.mockImplementation(async (id, draft) => ({ ...draft, id }));
  service.updateDefault.mockImplementation(async (draft) => draft);
  service.setActive.mockResolvedValue({}); service.remove.mockResolvedValue({});
  uploadService.uploadFile.mockResolvedValue({ url: '/api/uploads/cms/new-logo.png' });
  recitationService.listSessions.mockResolvedValue([]);
  useRecitationLive.mockReturnValue({ session: null, setSession: jest.fn(), connectionStatus: 'connected' });
  useRecitationText.mockReturnValue({ lines: [] });
});

test('renders a minimal table, protected default row and correct new-tab URLs without publishing', async () => {
  await setup();
  expect(screen.getByRole('table', { name: 'Saved stream overlays' })).toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete Default overlay' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View Default overlay (opens in new tab)' })).toHaveAttribute('href', '/stream-overlay');
  const link = screen.getByRole('link', { name: 'View Sunday Diwan (opens in new tab)' });
  expect(link).toHaveAttribute('href', '/stream-overlay/sunday-diwan');
  expect(link).toHaveAttribute('target', '_blank'); expect(link).toHaveAttribute('rel', 'noreferrer');
  expectNoWrites();
});
test('URL-encodes a saved slug defensively', async () => {
  service.list.mockResolvedValue([{ ...named, slug: 'a/b ?' }]); await setup();
  expect(screen.getByRole('link', { name: /View Sunday/ })).toHaveAttribute('href', '/stream-overlay/a%2Fb%20%3F');
});
test('Add retains all existing controls and draft changes and Cancel never publish', async () => {
  const dialog = within(await openAdd());
  expect(dialog.getByRole('textbox', { name: 'Title' })).toHaveFocus();
  expect(dialog.getAllByRole('slider')).toHaveLength(10);
  expect(dialog.getByRole('group', { name: 'Brand color presets' })).toBeInTheDocument();
  ['Show overlay content', 'Active', 'Description', 'Logo URL', 'Show Gurdwara logo'].forEach((name) => expect(dialog.queryByLabelText(name)).not.toBeInTheDocument());
  expect(dialog.getByRole('heading', { name: 'Add overlay' })).toHaveClass('text-2xl');
  expect(dialog.getByRole('region', { name: 'Overlay identity' })).toHaveClass('border-t-4', 'bg-indigo-50/70');
  expect(dialog.getByLabelText('Display name')).toHaveValue('');
  expect(dialog.getByLabelText('Display name')).toHaveAttribute('maxlength', '120');
  expect(dialog.getByLabelText('Display address')).toHaveValue('');
  expect(dialog.getByLabelText('Display address')).toHaveAttribute('maxlength', '300');
  expect(dialog.getByLabelText('Display name')).toHaveAccessibleDescription('Leave either field blank to use the Gurdwara branding for that field.');
  expect(dialog.getByRole('region', { name: 'Overlay themes' })).toHaveClass('border-t-4', 'border-t-rose-500', 'bg-rose-50');
  expect(dialog.getByRole('combobox', { name: 'Text shown' })).toHaveValue('gpe');
  ['Header controls', 'Upper footer ticker controls', 'Bottom footer ticker controls'].forEach((name) => expect(dialog.getByRole('region', { name })).toBeInTheDocument());
  fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'New Diwan' } });
  fireEvent.change(dialog.getByLabelText(/Gurbani font size/), { target: { value: '30' } });
  expectNoWrites(); fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add overlay' })).toHaveFocus(); expectNoWrites();
});
test('Add and Edit dialogs render outside the hover-transformed card and restore scrolling', async () => {
  const { container } = render(<StreamOverlayManager />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add overlay' })).toBeEnabled());
  const previousOverflow = document.body.style.overflow;
  for (const [triggerName, dialogName] of [['Add overlay', 'Add overlay'], ['Edit Sunday Diwan', 'Edit overlay']]) {
    const trigger = screen.getByRole('button', { name: triggerName }); trigger.focus(); fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: dialogName });
    expect(container).not.toContainElement(dialog); expect(document.body).toContainElement(dialog);
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(document.body.style.overflow).toBe(previousOverflow); expect(trigger).toHaveFocus();
  }
});
test('pairs text and header cards with a dedicated color selector row', async () => {
  const dialog = within(await openAdd()); const pair = dialog.getByRole('group', { name: 'Text and header settings' });
  expect(pair).toHaveClass('grid', 'sm:grid-cols-2');
  expect(within(pair).getByRole('region', { name: 'Overlay text and fonts' })).toBeInTheDocument();
  const header = within(within(pair).getByRole('region', { name: 'Header controls' }));
  const colors = within(header.getByRole('group', { name: 'Header colors' }));
  expect(colors.getByLabelText('Background color')).toBeInTheDocument();
  expect(colors.getByLabelText('Bottom border color')).toBeInTheDocument();
  expect(colors.queryByRole('slider')).not.toBeInTheDocument();
  expect(header.getByRole('button', { name: 'Use theme colors' })).toBeInTheDocument();
});
test('each ticker resets its colors independently without changing header colors', async () => {
  const dialog = within(await openAdd());
  const upper = within(dialog.getByRole('region', { name: 'Upper footer ticker controls' }));
  const lower = within(dialog.getByRole('region', { name: 'Bottom footer ticker controls' }));
  const header = within(dialog.getByRole('region', { name: 'Header controls' }));
  fireEvent.change(header.getByLabelText('Background color'), { target: { value: '#123456' } });
  fireEvent.change(upper.getByLabelText('Background color'), { target: { value: '#112233' } });
  fireEvent.change(upper.getByLabelText('Text color'), { target: { value: '#445566' } });
  fireEvent.change(lower.getByLabelText('Background color'), { target: { value: '#112233' } });
  fireEvent.change(lower.getByLabelText('Text color'), { target: { value: '#445566' } });
  fireEvent.click(upper.getByRole('button', { name: 'Use theme colors' }));
  expect(upper.getByLabelText('Background color')).toHaveValue('#004080'); expect(upper.getByLabelText('Text color')).toHaveValue('#ffffff');
  expect(lower.getByLabelText('Background color')).toHaveValue('#112233');
  fireEvent.click(lower.getByRole('button', { name: 'Use theme colors' }));
  expect(lower.getByLabelText('Background color')).toHaveValue('#f89820'); expect(lower.getByLabelText('Text color')).toHaveValue('#004080');
  expect(header.getByLabelText('Background color')).toHaveValue('#123456'); expectNoWrites();
});
test('top-right close button dismisses Add and Edit without publishing', async () => {
  await setup();
  for (const name of ['Add overlay', 'Edit Sunday Diwan']) {
    fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close overlay dialog' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  }
  expectNoWrites();
});
test('suggests a slug until manually changed, then creates only on explicit Save', async () => {
  const dialog = within(await openAdd());
  fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'Sunday Diwan & Kirtan!' } });
  expect(dialog.getByLabelText(/^Slug/)).toHaveValue('sunday-diwan-kirtan');
  fireEvent.change(dialog.getByLabelText(/^Slug/), { target: { value: 'my-channel' } });
  fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'Final Title' } });
  fireEvent.change(dialog.getByLabelText('Display name'), { target: { value: 'Community Milton' } });
  fireEvent.change(dialog.getByLabelText('Display address'), { target: { value: '12 Community Road' } });
  expect(dialog.getByLabelText(/^Slug/)).toHaveValue('my-channel');
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await screen.findByRole('button', { name: 'Edit Final Title' });
  expect(service.create).toHaveBeenCalledTimes(1);
  expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ ...DEFAULT_STREAM_OVERLAY_SETTINGS, title: 'Final Title', description: '', slug: 'my-channel', logoUrl: '', displayName: 'Community Milton', displayAddress: '12 Community Road', isActive: true }));
  expect(service.updateDefault).not.toHaveBeenCalled();
});
test('enforces metadata lengths and kebab-case validation without writing', async () => {
  const dialog = within(await openAdd());
  expect(dialog.getByLabelText('Title')).toHaveAttribute('maxlength', '100'); expect(dialog.getByLabelText(/^Slug/)).toHaveAttribute('maxlength', '60');
  for (const [title, slug] of [['  ', 'valid'], ['Valid', 'Invalid slug'], ['Valid', 'a'.repeat(61)], ['x'.repeat(101), 'valid']]) {
    fireEvent.change(dialog.getByLabelText('Title'), { target: { value: title } });
    fireEvent.change(dialog.getByLabelText(/^Slug/), { target: { value: slug } });
    fireEvent.submit(dialog.getByRole('form', { name: 'Overlay settings' })); expect(dialog.getByRole('alert')).toHaveTextContent('Enter a title');
  }
  expectNoWrites();
});
test('edits named settings with all fields intact without changing an existing slug on title edit', async () => {
  await setup(); fireEvent.click(screen.getByRole('button', { name: 'Edit Sunday Diwan' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Edit overlay' }));
  expect(dialog.getByLabelText(/English translation size/)).toHaveValue('65');
  fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'Renamed' } });
  fireEvent.change(dialog.getByLabelText('Header occasion — Punjabi'), { target: { value: 'ਕੀਰਤਨ' } });
  const upper = within(dialog.getByRole('region', { name: 'Upper footer ticker controls' }));
  fireEvent.change(upper.getByLabelText('Background color'), { target: { value: '#123456' } });
  fireEvent.change(upper.getByLabelText(/Scroll speed/), { target: { value: '0' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await screen.findByRole('button', { name: 'Edit Renamed' });
  expect(service.update).toHaveBeenCalledWith('one', expect.objectContaining({ title: 'Renamed', slug: 'sunday-diwan', headerPunjabi: 'ਕੀਰਤਨ', upperSpeed: 0, tickerColors: { ...named.tickerColors, upperbg: '#123456' }, isActive: true, overlayOn: false }));
  expect(service.updateDefault).not.toHaveBeenCalled();
});
test('default edit has no named metadata and saves only known legacy settings', async () => {
  await setup(); fireEvent.click(screen.getByRole('button', { name: 'Edit Default overlay' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Edit Default overlay' }));
  ['Title', 'Upload logo', 'Display name', 'Display address'].forEach((name) => expect(dialog.queryByLabelText(name)).not.toBeInTheDocument());
  expect(dialog.getByText(/existing \/stream-overlay URL/)).toBeInTheDocument();
  expect(dialog.getByLabelText('Header occasion — English')).toHaveValue('Existing default');
  fireEvent.change(dialog.getByLabelText('Header occasion — English'), { target: { value: 'Saved legacy header' } }); expectNoWrites();
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(service.updateDefault.mock.calls[0][0]).toEqual({ ...DEFAULT_STREAM_OVERLAY_SETTINGS, overlayHeaderMessage: 'Saved legacy header' });
  expect(service.updateDefault.mock.calls[0][0]).not.toHaveProperty('id'); expect(service.update).not.toHaveBeenCalled(); expect(service.create).not.toHaveBeenCalled();
});
test('edits existing identity independently and clearing a field saves its branding fallback', async () => {
  service.list.mockResolvedValue([{ ...named, displayName: 'Custom Milton', displayAddress: 'Custom address' }]);
  await setup(); fireEvent.click(screen.getByRole('button', { name: 'Edit Sunday Diwan' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Edit overlay' }));
  expect(dialog.getByLabelText('Display name')).toHaveValue('Custom Milton'); expect(dialog.getByLabelText('Display address')).toHaveValue('Custom address');
  fireEvent.change(dialog.getByLabelText('Display name'), { target: { value: '' } }); expectNoWrites();
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(service.update).toHaveBeenCalledWith('one', expect.objectContaining({ displayName: '', displayAddress: 'Custom address' })); expect(service.updateDefault).not.toHaveBeenCalled();
});
test.each(['named', 'default'])('%s header colors are independent draft controls and save only on explicit submit', async (kind) => {
  await setup(); fireEvent.click(screen.getByRole('button', { name: kind === 'named' ? 'Edit Sunday Diwan' : 'Edit Default overlay' }));
  const dialog = within(screen.getByRole('dialog')); const header = within(dialog.getByRole('region', { name: 'Header controls' }));
  expect(header.getByLabelText('Background color')).toHaveValue('#004080'); expect(header.getByLabelText('Bottom border color')).toHaveValue('#f89820');
  fireEvent.change(header.getByLabelText('Background color'), { target: { value: '#123456' } }); expect(header.getByLabelText('Bottom border color')).toHaveValue('#f89820');
  fireEvent.change(header.getByLabelText('Bottom border color'), { target: { value: '#abcdef' } }); expect(header.getByLabelText('Background color')).toHaveValue('#123456'); expectNoWrites();
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const sent = kind === 'named' ? service.update.mock.calls[0][1] : service.updateDefault.mock.calls[0][0];
  expect(sent).toEqual(expect.objectContaining({ headerBackgroundColor: '#123456', headerBorderColor: '#abcdef', tickerColors: DEFAULT_STREAM_OVERLAY_SETTINGS.tickerColors, overlayThemeId: 'brand-colors' }));
});
test.each(['named', 'default'])('%s existing header colors survive theme selection and reset to selected theme without touching tickers', async (kind) => {
  const colors = { headerBackgroundColor: '#123456', headerBorderColor: '#abcdef' };
  service.list.mockResolvedValue([{ ...named, ...colors }]); service.getDefault.mockResolvedValue({ ...DEFAULT_STREAM_OVERLAY_SETTINGS, ...colors });
  await setup(); fireEvent.click(screen.getByRole('button', { name: kind === 'named' ? 'Edit Sunday Diwan' : 'Edit Default overlay' }));
  const dialog = within(screen.getByRole('dialog')); const header = within(dialog.getByRole('region', { name: 'Header controls' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Heritage Green' }));
  expect(header.getByLabelText('Background color')).toHaveValue('#123456'); expect(header.getByLabelText('Bottom border color')).toHaveValue('#abcdef');
  fireEvent.click(header.getByRole('button', { name: 'Use theme colors' }));
  expect(header.getByLabelText('Background color')).toHaveValue('#14532d'); expect(header.getByLabelText('Bottom border color')).toHaveValue('#c89b3c'); expectNoWrites();
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const sent = kind === 'named' ? service.update.mock.calls[0][1] : service.updateDefault.mock.calls[0][0];
  expect(sent).toEqual(expect.objectContaining({ headerBackgroundColor: '', headerBorderColor: '', overlayThemeId: 'heritage', tickerColors: DEFAULT_STREAM_OVERLAY_SETTINGS.tickerColors }));
});
test.each(['named', 'default'])('%s footer colors inherit dynamically, preserve explicit picks and reset each ticker independently', async (kind) => {
  const legacy = { upperbg: '#004080', upperfg: '#ffffff', lowerbg: '#F89820', lowerfg: '#004080' };
  service.list.mockResolvedValue([{ ...named, tickerColors: legacy }]); service.getDefault.mockResolvedValue({ ...DEFAULT_STREAM_OVERLAY_SETTINGS, tickerColors: legacy });
  await setup(); fireEvent.click(screen.getByRole('button', { name: kind === 'named' ? 'Edit Sunday Diwan' : 'Edit Default overlay' }));
  const dialog = within(screen.getByRole('dialog'));
  const upper = within(dialog.getByRole('region', { name: 'Upper footer ticker controls' }));
  const lower = within(dialog.getByRole('region', { name: 'Bottom footer ticker controls' }));
  const header = within(dialog.getByRole('region', { name: 'Header controls' }));
  fireEvent.change(header.getByLabelText('Background color'), { target: { value: '#654321' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Heritage Green' }));
  expect(upper.getByLabelText('Background color')).toHaveValue('#14532d'); expect(lower.getByLabelText('Background color')).toHaveValue('#c89b3c'); expect(lower.getByLabelText('Text color')).toHaveValue('#14532d');
  fireEvent.change(upper.getByLabelText('Background color'), { target: { value: '#004080' } }); fireEvent.change(lower.getByLabelText('Text color'), { target: { value: '#112233' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Logo Brand Colors' }));
  expect(upper.getByLabelText('Background color')).toHaveValue('#004080'); expect(lower.getByLabelText('Text color')).toHaveValue('#112233');
  fireEvent.click(upper.getByRole('button', { name: 'Use theme colors' })); fireEvent.click(dialog.getByRole('button', { name: 'Heritage Green' }));
  expect(upper.getByLabelText('Background color')).toHaveValue('#14532d'); expect(lower.getByLabelText('Text color')).toHaveValue('#112233');
  fireEvent.change(upper.getByLabelText('Text color'), { target: { value: '#112233' } }); fireEvent.change(upper.getByLabelText('Text color'), { target: { value: '#ffffff' } });
  fireEvent.click(lower.getByRole('button', { name: 'Use theme colors' })); fireEvent.click(dialog.getByRole('button', { name: 'Logo Brand Colors' }));
  expect(lower.getByLabelText('Background color')).toHaveValue('#f89820'); expect(lower.getByLabelText('Text color')).toHaveValue('#004080'); expect(header.getByLabelText('Background color')).toHaveValue('#654321'); expectNoWrites();
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const sent = kind === 'named' ? service.update.mock.calls[0][1] : service.updateDefault.mock.calls[0][0];
  expect(sent).toEqual(expect.objectContaining({ headerBackgroundColor: '#654321', tickerColors: { upperbg: '', upperfg: '#ffffff', lowerbg: '', lowerfg: '' } }));
});
test('named toggle persists independently of overlay visibility and the default', async () => {
  await setup(); const toggle = screen.getByRole('button', { name: 'Toggle Sunday Diwan active status' });
  expect(toggle).toHaveAttribute('aria-pressed', 'true'); fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
  expect(service.setActive).toHaveBeenCalledWith('one', false); expect(service.update).not.toHaveBeenCalled(); expect(service.updateDefault).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Toggle Default overlay active status' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(toggle); await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true')); expect(service.setActive).toHaveBeenLastCalledWith('one', true);
});
test('default toggle persists overlayOn via the legacy endpoint, preserving settings', async () => {
  await setup(); const toggle = screen.getByRole('button', { name: 'Toggle Default overlay active status' }); fireEvent.click(toggle);
  await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'false'));
  expect(service.updateDefault).toHaveBeenCalledWith({ ...DEFAULT_STREAM_OVERLAY_SETTINGS, overlayOn: false, overlayHeaderMessage: 'Existing default' }); expect(service.setActive).not.toHaveBeenCalled();
});
test('failed toggle keeps the saved state and reports the server error inline', async () => {
  service.setActive.mockRejectedValue(new Error('Status permission denied')); await setup();
  const toggle = screen.getByRole('button', { name: 'Toggle Sunday Diwan active status' }); fireEvent.click(toggle);
  expect(await screen.findByRole('alert')).toHaveTextContent('Status permission denied'); expect(toggle).toHaveAttribute('aria-pressed', 'true'); expect(toggle).toBeEnabled();
});
test('delete requires confirmation, Cancel is inert, failures retain the row and retry succeeds', async () => {
  await setup(); const trigger = screen.getByRole('button', { name: 'Delete Sunday Diwan' }); trigger.focus(); fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' })); expect(service.remove).not.toHaveBeenCalled(); expect(trigger).toHaveFocus();
  service.remove.mockRejectedValueOnce(new Error('Delete failed')).mockResolvedValueOnce({}); fireEvent.click(trigger);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Delete failed'); expect(screen.getByRole('button', { name: 'Edit Sunday Diwan' })).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm delete' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(service.remove).toHaveBeenCalledWith('one'); expect(screen.queryByRole('button', { name: 'Edit Sunday Diwan' })).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Edit Default overlay' })).toBeInTheDocument();
});
test('logo upload uses cms semantics and progress; it updates only the draft until Save', async () => {
  const pending = deferred(); uploadService.uploadFile.mockImplementation((options) => { options.onProgress(42); return pending.promise; });
  const dialog = within(await openAdd()); const file = new File(['image'], 'logo.png', { type: 'image/png' });
  fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'With Logo' } }); fireEvent.change(dialog.getByLabelText(/^Upload logo/), { target: { files: [file] } });
  expect(uploadService.uploadFile).toHaveBeenCalledWith({ service: 'cms', file, allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], maxSizeMB: 5, onProgress: expect.any(Function) });
  expect(dialog.getByRole('status')).toHaveTextContent('42%'); expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled(); expect(dialog.getByRole('button', { name: 'Save overlay' })).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => pending.resolve({ url: '/api/uploads/cms/new-logo.png' }));
  expect(dialog.getByAltText('Overlay logo preview')).toHaveAttribute('src', '/api/uploads/cms/new-logo.png'); expectNoWrites();
  fireEvent.click(dialog.getByRole('button', { name: 'Save overlay' })); await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ logoUrl: '/api/uploads/cms/new-logo.png' }));
});
test.each(['Unsupported file type.', 'File is too large. Maximum allowed size is 5 MB.'])('upload error stays inline: %s', async (message) => {
  uploadService.uploadFile.mockRejectedValue(new Error(message)); const dialog = within(await openAdd());
  fireEvent.change(dialog.getByLabelText(/^Upload logo/), { target: { files: [new File(['bad'], 'bad.svg', { type: 'image/svg+xml' })] } });
  expect(await dialog.findByRole('alert')).toHaveTextContent(message); expect(dialog.getByRole('button', { name: 'Save overlay' })).toBeEnabled(); expectNoWrites();
});
test('missing upload URL is reported and an uploaded draft can be canceled without publishing', async () => {
  uploadService.uploadFile.mockResolvedValueOnce({}).mockResolvedValueOnce({ url: '/logo.png' });
  const dialog = within(await openAdd()); const input = dialog.getByLabelText(/^Upload logo/); const file = new File(['png'], 'logo.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } }); expect(await dialog.findByRole('alert')).toHaveTextContent('Upload did not return an image URL');
  fireEvent.change(input, { target: { files: [file] } }); await waitFor(() => expect(dialog.getByAltText('Overlay logo preview')).toHaveAttribute('src', '/logo.png'));
  fireEvent.click(dialog.getByRole('button', { name: 'Cancel' })); expectNoWrites();
});
test('failed saves retain draft values; busy disables edits, Cancel and Escape and prevents double submit', async () => {
  const pending = deferred(); service.create.mockReturnValueOnce(pending.promise); const dialog = within(await openAdd());
  fireEvent.change(dialog.getByLabelText('Title'), { target: { value: 'My draft' } }); const form = dialog.getByRole('form', { name: 'Overlay settings' });
  fireEvent.submit(form); fireEvent.submit(form); expect(service.create).toHaveBeenCalledTimes(1);
  expect(dialog.getByLabelText('Title')).toBeDisabled(); expect(dialog.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => pending.reject({ response: { data: { message: 'Slug already exists' } } }));
  expect(dialog.getByRole('alert')).toHaveTextContent('Slug already exists'); expect(dialog.getByLabelText('Title')).toHaveValue('My draft'); expect(dialog.getByRole('button', { name: 'Save overlay' })).toBeEnabled();
});
test('traps forward/backward Tab, Escape closes and focus returns to the opener', async () => {
  const dialog = within(await openAdd()); const first = dialog.getByRole('button', { name: 'Close overlay dialog' }); const last = dialog.getByRole('button', { name: 'Save overlay' });
  last.focus(); fireEvent.keyDown(document, { key: 'Tab' }); expect(first).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(last).toHaveFocus(); fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Add overlay' })).toHaveFocus(); expectNoWrites();
});
test('load failures are explicit, do not fabricate writable defaults, and Retry recovers', async () => {
  service.getDefault.mockRejectedValueOnce(new Error('Settings unavailable')); service.list.mockRejectedValueOnce(new Error('List unavailable')); render(<StreamOverlayManager />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Settings unavailable'); expect(screen.getByRole('alert')).toHaveTextContent('List unavailable');
  expect(screen.getByRole('button', { name: 'Add overlay' })).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Edit Default overlay' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading overlays' })); await screen.findByRole('button', { name: 'Edit Default overlay' });
  expect(screen.getByRole('button', { name: 'Add overlay' })).toBeEnabled(); expectNoWrites();
});
test('default remains usable when named list fails, and named overlays work if legacy read fails', async () => {
  service.list.mockRejectedValueOnce(new Error('Named profiles unavailable')); render(<StreamOverlayManager />); await screen.findByRole('button', { name: 'Edit Default overlay' });
  expect(screen.getByRole('button', { name: 'Add overlay' })).toBeDisabled(); service.getDefault.mockRejectedValueOnce(new Error('Legacy unavailable'));
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading overlays' })); await screen.findByRole('button', { name: 'Edit Sunday Diwan' });
  expect(screen.getByRole('button', { name: 'Add overlay' })).toBeEnabled(); expect(screen.queryByRole('button', { name: 'Edit Default overlay' })).not.toBeInTheDocument();
});
test('Gurbani Studio preserves live recitation controls, table and screen links around the manager', async () => {
  const live = { id: 'live', status: 'live', title: 'Live Bani', titleEnglish: 'Live prayer', currentIndex: 1, totalLines: 5, startedAt: '2026-11-12T10:00:00Z' }; const setSession = jest.fn();
  useRecitationLive.mockReturnValue({ session: live, setSession, connectionStatus: 'connected' });
  useRecitationText.mockReturnValue({ lines: [{ g: 'First' }, { g: 'Current line', p: 'Punjabi line', e: 'English line' }] });
  recitationService.listSessions.mockResolvedValue([live]); recitationService.step.mockResolvedValue({ ...live, currentIndex: 2 });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><AdminRecitationsPage /></QueryClientProvider>);
  await screen.findByRole('button', { name: 'Add overlay' }); expect(screen.getByRole('heading', { name: 'Screens and links' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to LED board (Darbar Hall screen) page' })).toHaveAttribute('href', '/recitation-board');
  expect(screen.getByRole('link', { name: "Go to Granthi's Recitation Controls (phone) page" })).toHaveAttribute('href', '/granthi-remote');
  expect(screen.getByText('Current line')).toBeInTheDocument(); await screen.findByRole('button', { name: 'Delete recitation' });
  userEvent.click(screen.getByRole('button', { name: 'Next line' }));
  await waitFor(() => expect(recitationService.step).toHaveBeenCalledWith('live', { delta: 1 }));
  await waitFor(() => expect(setSession.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ currentIndex: 2 }))); expectNoWrites(); view.unmount(); client.clear();
});