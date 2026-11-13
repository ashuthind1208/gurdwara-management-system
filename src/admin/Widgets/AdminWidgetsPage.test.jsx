import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminWidgetsPage from './AdminWidgetsPage';
import { widgetRegistry } from '../../constants/widgetRegistry';
import widgetPlacementService from '../../services/widgetPlacementService';
import uploadService from '../../services/uploadService';

jest.mock('../../services/uploadService', () => ({ __esModule: true, default: { uploadFile: jest.fn() } }));

jest.mock('../../services/widgetPlacementService', () => ({ __esModule: true, default: { get: jest.fn(), save: jest.fn() } }));
jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getAllPageContent: jest.fn().mockResolvedValue({ data: { 'community-info': { heroTitle: 'Community Info' } } }) } }));
jest.mock('../../services/communityAnnouncementService', () => ({ __esModule: true, default: { listPublic: jest.fn().mockResolvedValue([]) } }));
jest.mock('../../components/widgets/PageWidgets', () => ({ WidgetVisualization: ({ widgetId, config, headerAction }) => <section aria-label={`${config.title || widgetId} widget preview`}><h2>{config.title || widgetId}</h2>{headerAction}</section> }));

const existing = { id: 'notice-1', widgetId: 'announcements', pagePath: '/community-info', slot: 'main', order: 0, config: { title: 'About announcements', limit: 4, filter: '' } };
const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminWidgetsPage /></QueryClientProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  widgetPlacementService.get.mockResolvedValue({ placements: [existing], layouts: [{ pagePath: '/community-info', layoutId: 'single-column' }] });
  widgetPlacementService.save.mockImplementation(async (nextState) => nextState);
  require('../../services/cmsService').default.getAllPageContent.mockResolvedValue({ data: { 'community-info': { heroTitle: 'Community Info' } } });
});

test('loads at least 25 widgets and visualizes saved connections for a chosen page', async () => {
  expect(widgetRegistry.length).toBeGreaterThanOrEqual(25);
  setup();
  const pageSelector = await screen.findByRole('combobox', { name: 'Page connections page' });
  await within(pageSelector).findByRole('option', { name: /Community Info/ });
  await userEvent.selectOptions(pageSelector, '/community-info');
  await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const preview = screen.getByRole('region', { name: 'Selected page layout preview' });
  expect(within(preview).getByRole('heading', { name: 'About announcements' })).toBeInTheDocument();
  expect(within(preview).getByRole('link', { name: 'Open actual page ↗' })).toHaveAttribute('href', '/community-info');
});

test('opens a body portal without saving, traps focus, and restores focus and scrolling on close', async () => {
  const { container } = setup(); await screen.findByRole('button', { name: 'Edit About announcements' });
  const previewButton = screen.getByRole('button', { name: 'Preview', exact: true });
  // eslint-disable-next-line testing-library/no-node-access
  expect(screen.getByRole('button', { name: 'Save page layout' }).nextElementSibling).toBe(previewButton);
  expect(screen.queryByRole('region', { name: 'Selected page layout preview' })).not.toBeInTheDocument();
  const originalOverflow = document.body.style.overflow, originalPadding = document.body.style.paddingRight;
  const width = jest.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 20);
  document.body.style.overflow = 'auto'; document.body.style.paddingRight = '7px';
  try {
    await userEvent.click(previewButton); const dialog = screen.getByRole('dialog', { name: 'Page preview' });
    expect(dialog).toHaveAttribute('aria-modal', 'true'); expect(document.body).toContainElement(dialog); expect(container).not.toContainElement(dialog);
    // eslint-disable-next-line testing-library/no-node-access
    expect(dialog.parentElement.parentElement).toBe(document.body);
    expect(within(dialog).getByRole('heading', { name: 'Home · /' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open actual page ↗' })).toHaveAttribute('href', '/');
    expect(document.body.style.overflow).toBe('hidden'); expect(document.body.style.paddingRight).toBe('27px');
    const close = within(dialog).getByRole('button', { name: 'Close page preview' }); const actualPage = within(dialog).getByRole('link', { name: 'Open actual page ↗' });
    expect(close).toHaveFocus(); await userEvent.tab({ shift: true }); expect(actualPage).toHaveFocus(); await userEvent.tab(); expect(close).toHaveFocus();
    previewButton.focus(); expect(close).toHaveFocus(); await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(screen.queryByRole('region', { name: 'Selected page layout preview' })).not.toBeInTheDocument();
    expect(previewButton).toHaveFocus(); expect(document.body.style.overflow).toBe('auto'); expect(document.body.style.paddingRight).toBe('7px');
    await userEvent.click(previewButton); await userEvent.click(screen.getByRole('button', { name: 'Close page preview' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(previewButton).toHaveFocus(); expect(widgetPlacementService.save).not.toHaveBeenCalled();
  } finally { width.mockRestore(); document.body.style.overflow = originalOverflow; document.body.style.paddingRight = originalPadding; }
});

test('preserves CMS content and unsaved layout selection across previews and only saves explicitly', async () => {
  require('../../services/cmsService').default.getAllPageContent.mockResolvedValue({ data: { 'community-info': { heroTitle: 'Community Info', heroDescription: 'Welcome to our community', intro: 'Intro', sections: [{ id: 'welcome', title: 'Welcome section' }] } } });
  setup(); const pageSelector = await screen.findByRole('combobox', { name: 'Page connections page' });
  await within(pageSelector).findByRole('option', { name: /Community Info/ }); await userEvent.selectOptions(pageSelector, '/community-info');
  const layoutSelector = screen.getByRole('combobox', { name: 'Page layout' }); const nextLayout = within(layoutSelector).getAllByRole('option').find((option) => option.value !== 'single-column').value;
  await userEvent.selectOptions(layoutSelector, nextLayout); await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const dialog = screen.getByRole('dialog', { name: 'Page preview' });
  for (const text of ['Existing CMS page content', 'Welcome to our community', 'Page intro content', 'Welcome section', 'Existing section content']) expect(within(dialog).getByText(text)).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close page preview' }));
  expect(pageSelector).toHaveValue('/community-info'); expect(layoutSelector).toHaveValue(nextLayout); expect(widgetPlacementService.save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Save page layout' })); await waitFor(() => expect(widgetPlacementService.save).toHaveBeenCalledTimes(1));
  expect(widgetPlacementService.save).toHaveBeenCalledWith(expect.objectContaining({ layouts: [{ pagePath: '/community-info', layoutId: nextLayout }] }));
});

test('cleans up the portal and scroll lock when unmounted while open', async () => {
  const { unmount } = setup(); await screen.findByRole('button', { name: 'Edit About announcements' });
  const overflow = document.body.style.overflow, padding = document.body.style.paddingRight;
  await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true })); unmount();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(document.body.style.overflow).toBe(overflow); expect(document.body.style.paddingRight).toBe(padding); expect(widgetPlacementService.save).not.toHaveBeenCalled();
});

test('saves a widget with the selected page path and displays the saved visual', async () => {
  setup();
  const pageSelector = await screen.findByRole('combobox', { name: 'Page connections page' });
  await within(pageSelector).findByRole('option', { name: /Community Info/ });
  await userEvent.selectOptions(pageSelector, '/community-info');
  await userEvent.click(screen.getByRole('button', { name: 'Content', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: /^Community Announcements/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Add to page' }));
  expect(await screen.findByText('Page connections saved.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const preview = screen.getByRole('region', { name: 'Selected page layout preview' });
  expect(within(preview).getAllByRole('heading', { name: 'Community Announcements' }).length).toBeGreaterThan(0);
  expect(widgetPlacementService.save).toHaveBeenCalledWith(expect.objectContaining({ placements: expect.arrayContaining([expect.objectContaining({ pagePath: '/community-info', widgetId: 'announcements', slot: 'main' })]) }));
});

test('removes a placement persistently from its page preview', async () => {
  setup();
  const pageSelector = await screen.findByRole('combobox', { name: 'Page connections page' });
  await within(pageSelector).findByRole('option', { name: /Community Info/ });
  await userEvent.selectOptions(pageSelector, '/community-info');
  await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Remove Community Announcements from page' }));
  expect(await screen.findByText('Page connections saved.')).toBeInTheDocument();
  expect(widgetPlacementService.save).toHaveBeenCalledWith({ placements: [], layouts: [{ pagePath: '/community-info', layoutId: 'single-column' }] });
});

test.each(['#000000', '#ffffff', '#9f1239'])('keeps removal outside the widget on a fixed light surface for background %s', async (backgroundColor) => {
  widgetPlacementService.get.mockResolvedValue({ placements: [{ ...existing, config: { ...existing.config, backgroundColor } }], layouts: [{ pagePath: '/community-info', layoutId: 'single-column' }] });
  setup();
  const pageSelector = await screen.findByRole('combobox', { name: 'Page connections page' });
  await within(pageSelector).findByRole('option', { name: /Community Info/ });
  await userEvent.selectOptions(pageSelector, '/community-info');
  await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  const preview = screen.getByRole('region', { name: 'Selected page layout preview' });
  const remove = within(preview).getByRole('button', { name: 'Remove Community Announcements from page' });
  expect(remove).toBeVisible();
  expect(remove).toHaveClass('bg-rose-50', 'text-rose-800');
  expect(within(preview).getByRole('region', { name: 'About announcements widget preview' })).not.toContainElement(remove);
  await userEvent.click(remove);
  await waitFor(() => expect(widgetPlacementService.save).toHaveBeenCalledWith({ placements: [], layouts: [{ pagePath: '/community-info', layoutId: 'single-column' }] }));
});

test('allows removing an image widget even when it has no image', async () => {
  widgetPlacementService.get.mockResolvedValue({ placements: [{ ...existing, widgetId: 'photo-only', config: { imageUrl: '', backgroundColor: '#000000' } }], layouts: [{ pagePath: '/community-info', layoutId: 'single-column' }] });
  setup();
  const pageSelector = await screen.findByRole('combobox', { name: 'Page connections page' });
  await within(pageSelector).findByRole('option', { name: /Community Info/ });
  await userEvent.selectOptions(pageSelector, '/community-info');
  await userEvent.click(screen.getByRole('button', { name: 'Preview', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Remove Photo Only from page' }));
  await waitFor(() => expect(widgetPlacementService.save).toHaveBeenCalledWith({ placements: [], layouts: [{ pagePath: '/community-info', layoutId: 'single-column' }] }));
});

test('offers verified Gurdwara and Nitnem sources as configurable dropdowns', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Gurbani', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: /^Gurdwara Hukamnama/ }));
  const gurdwaraSelect = screen.getByRole('combobox', { name: 'Gurdwara Hukamnama source' });
  expect(within(gurdwaraSelect).getAllByRole('option').map((option) => option.value)).toEqual(['Sri Harmandir Sahib (BaniDB)', 'This Gurdwara']);
  await userEvent.selectOptions(gurdwaraSelect, 'This Gurdwara');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add to page' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Add to page' }));
  expect(await screen.findByText('Page connections saved.')).toBeInTheDocument();
  expect(widgetPlacementService.save).toHaveBeenCalledWith(expect.objectContaining({ placements: expect.arrayContaining([expect.objectContaining({ widgetId: 'gurdwara-hukamnama', config: expect.objectContaining({ gurdwara: 'This Gurdwara' }) })]) }));
  await userEvent.click(screen.getByRole('button', { name: /^Nitnem Bani Reader/ }));
  expect(screen.getByRole('combobox', { name: 'Nitnem bani' })).toHaveValue('Japji Sahib');
});

test('configures photo dimensions and widget colors, and exposes the standalone rich editor', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Custom', exact: true }));
  await userEvent.click(await screen.findByRole('button', { name: /^Photo Only/ }));
  expect(screen.getByLabelText('Widget background color')).toHaveValue('#ffffff');
  const imageField = screen.getByLabelText(/Image URL or uploaded image/);
  await userEvent.type(imageField, 'https://example.test/sangat.jpg');
  await userEvent.clear(screen.getByLabelText('Image width (px)'));
  await userEvent.type(screen.getByLabelText('Image width (px)'), '640');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Add to page' })).toBeEnabled());
  await userEvent.click(screen.getByRole('button', { name: 'Add to page' }));
  await waitFor(() => expect(widgetPlacementService.save).toHaveBeenCalledWith(expect.objectContaining({ placements: expect.arrayContaining([expect.objectContaining({ widgetId: 'photo-only', config: expect.objectContaining({ imageUrl: 'https://example.test/sangat.jpg', imageWidth: 640 }) })]) })));
  await userEvent.click(await screen.findByRole('button', { name: /^Rich Content/ }));
  expect(screen.getByLabelText('Widget text color')).toHaveValue('#0f172a');
  expect(screen.getByRole('textbox', { name: 'Rich text content' })).toHaveAttribute('contenteditable', 'true');
});

test('paginates all category selections by five and resets to the first page on category changes', async () => {
  setup();
  const catalog = screen.getByLabelText('Widget catalog');
  const pagination = screen.getByRole('navigation', { name: 'Widget catalog pagination' });
  expect(within(catalog).getAllByRole('button')).toHaveLength(5);
  await userEvent.click(within(pagination).getByRole('button', { name: 'Next' }));
  expect(within(catalog).getAllByRole('button')).toHaveLength(5);
  expect(within(pagination).getByRole('status')).toHaveTextContent('Page 2');
  await userEvent.click(screen.getByRole('button', { name: 'Custom', exact: true }));
  expect(within(pagination).getByRole('status')).toHaveTextContent('Page 1 of 1');
  expect(within(catalog).getAllByRole('button')).toHaveLength(2);
  expect(within(catalog).getByRole('button', { name: /^Photo Only/ })).toBeInTheDocument();
  expect(within(catalog).getByRole('button', { name: /^Rich Content/ })).toBeInTheDocument();
});

test('uploads a custom photo and retains editable dimensions', async () => {
  uploadService.uploadFile.mockResolvedValue({ url: '/api/uploads/cms/photo.png' });
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Custom', exact: true }));
  await userEvent.click(screen.getByRole('button', { name: /^Photo Only/ }));
  const file = new File(['photo'], 'photo.png', { type: 'image/png' });
  await userEvent.upload(screen.getByLabelText('Upload image'), file);
  await waitFor(() => expect(screen.getByLabelText('Image URL or uploaded image')).toHaveValue('/api/uploads/cms/photo.png'));
  expect(uploadService.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ file, service: 'cms' }));
  expect(screen.getByLabelText('Image width (px)')).toHaveValue(800);
  expect(screen.getByLabelText('Image height (px)')).toHaveValue(450);
  expect(screen.getByLabelText('Widget background color')).toHaveClass('w-10');
});

test('updates an existing placement without adding a duplicate widget', async () => {
  setup();
  await userEvent.click(await screen.findByRole('button', { name: 'Edit About announcements' }));
  await userEvent.clear(screen.getByLabelText('Title'));
  await userEvent.type(screen.getByLabelText('Title'), 'Updated announcement');
  await userEvent.click(screen.getByRole('button', { name: 'Save widget changes' }));
  await waitFor(() => expect(widgetPlacementService.save).toHaveBeenCalledWith(expect.objectContaining({ placements: [expect.objectContaining({ id: existing.id, config: expect.objectContaining({ title: 'Updated announcement' }) })] })));
});
