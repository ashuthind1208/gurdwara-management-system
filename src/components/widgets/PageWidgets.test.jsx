import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PageWidgets, { WidgetVisualization } from './PageWidgets';
import widgetPlacementService from '../../services/widgetPlacementService';
import communityAnnouncementService from '../../services/communityAnnouncementService';

jest.mock('../../services/widgetPlacementService', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../services/communityAnnouncementService', () => ({ __esModule: true, default: { listPublic: jest.fn().mockResolvedValue([]) } }));
jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getHomeContent: async () => ({ data: { langarItems: [] } }) } }));

beforeEach(() => {
  communityAnnouncementService.listPublic.mockResolvedValue([]);
});

test('renders only the placements connected to the public page', async () => {
  widgetPlacementService.get.mockResolvedValue({
    layouts: [{ pagePath: '/about', layoutId: 'single-column' }],
    placements: [
      { id: 'one', widgetId: 'announcements', pagePath: '/about', slot: 'main', order: 0, config: { title: 'About update' } },
      { id: 'two', widgetId: 'announcements', pagePath: '/', slot: 'main', order: 0, config: { title: 'Home update' } }
    ]
  });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PageWidgets pagePath="/about" /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'About update' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Home update' })).not.toBeInTheDocument();
});

test('renders configured strings as text instead of executable HTML', () => {
  render(<QueryClientProvider client={new QueryClient()}><WidgetVisualization widgetId="announcements" config={{ title: '<script>unsafe()</script>' }} /></QueryClientProvider>);
  expect(screen.getByRole('heading', { name: '<script>unsafe()</script>' })).toBeInTheDocument();
});

test('shows one non-wrapping title and a header removal action without a source badge', () => {
  render(<QueryClientProvider client={new QueryClient()}><WidgetVisualization widgetId="urgent-langar-needs" config={{ title: 'Langar Required Soon' }} headerAction={<button>Remove from page</button>} /></QueryClientProvider>);
  expect(screen.getAllByText('Langar Required Soon')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: 'Langar Required Soon' })).toHaveClass('truncate');
  expect(screen.getByRole('region', { name: 'Langar Required Soon widget' })).toContainElement(screen.getByRole('button', { name: 'Remove from page' }));
  expect(screen.queryByText(/Langar inventory ·/)).not.toBeInTheDocument();
});

test('allows widgets to set background and text colors', () => {
  render(<QueryClientProvider client={new QueryClient()}><WidgetVisualization widgetId="announcements" config={{ title: 'Color test', backgroundColor: '#fef3c7', textColor: '#713f12' }} /></QueryClientProvider>);
  expect(screen.getByRole('region', { name: 'Community Announcements widget' })).toHaveStyle({ backgroundColor: '#fef3c7', color: '#713f12' });
});

test('renders photo-only at configured dimensions and does not add widget text', () => {
  render(<QueryClientProvider client={new QueryClient()}><WidgetVisualization widgetId="photo-only" config={{ imageUrl: 'https://example.org/sangat.jpg', imageAlt: 'Sangat gathering', imageWidth: 620, imageHeight: 340, imageFit: 'contain' }} /></QueryClientProvider>);
  const image = screen.getByRole('img', { name: 'Sangat gathering' });
  expect(image).toHaveStyle({ width: '620px', height: '340px', objectFit: 'contain', maxWidth: '100%' });
  expect(screen.queryByRole('heading', { name: 'Photo Only' })).not.toBeInTheDocument();
});

test('renders editable rich-content HTML through the widget sanitizer', () => {
  render(<QueryClientProvider client={new QueryClient()}><WidgetVisualization widgetId="rich-content" config={{ contentHtml: '<h2>Community note</h2><p>Useful <strong>formatted</strong> content.</p><script>window.pwned=true</script>' }} /></QueryClientProvider>);
  const content = screen.getByLabelText('Custom rich content');
  expect(within(content).getByRole('heading', { name: 'Community note' })).toBeVisible();
  expect(within(content).getByText('formatted').tagName).toBe('STRONG');
  expect(within(content).queryByText('window.pwned=true')).not.toBeInTheDocument();
});

test('filters redundant legacy widgets from the catalog while retaining supported IDs for existing placements', () => {
  const { availableWidgetRegistry, widgetRegistry } = require('../../constants/widgetRegistry');
  expect(availableWidgetRegistry.length).toBeGreaterThanOrEqual(24);
  expect(availableWidgetRegistry.some((widget) => widget.id === 'morning-schedule')).toBe(false);
  expect(widgetRegistry.some((widget) => widget.id === 'morning-schedule')).toBe(true);
});

test('stacks Home widgets inside their existing card columns without a second grid', async () => {
  widgetPlacementService.get.mockResolvedValue({
    layouts: [{ pagePath: '/', layoutId: 'two-column-header-footer' }],
    placements: [
      { id: 'left', widgetId: 'announcements', pagePath: '/', slot: 'left', order: 0, config: { title: 'Primary widget' } },
      { id: 'right', widgetId: 'announcements', pagePath: '/', slot: 'right', order: 1, config: { title: 'Sidebar widget' } },
      { id: 'header', widgetId: 'announcements', pagePath: '/', slot: 'header', order: 2, config: { title: 'Header widget' } }
    ]
  });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <PageWidgets pagePath="/" homeColumn="primary" />
    <PageWidgets pagePath="/" homeColumn="sidebar" />
  </QueryClientProvider>);
  const primary = await screen.findByLabelText('primary Home page widgets');
  const sidebar = await screen.findByLabelText('sidebar Home page widgets');
  expect(primary).toContainElement(screen.getByRole('heading', { name: 'Primary widget' }));
  expect(sidebar).toContainElement(screen.getByRole('heading', { name: 'Sidebar widget' }));
  expect(primary).not.toContainElement(screen.getByRole('heading', { name: 'Sidebar widget' }));
  expect(primary).not.toHaveClass('grid', 'py-2');
  expect(screen.queryByRole('heading', { name: 'Header widget' })).not.toBeInTheDocument();
});

test('keeps legacy main-slot Home widgets in the primary card stack', async () => {
  widgetPlacementService.get.mockResolvedValue({ layouts: [], placements: [
    { id: 'legacy', widgetId: 'announcements', pagePath: '/', slot: 'main', order: 0, config: { title: 'Existing Home widget' } }
  ] });
  render(<QueryClientProvider client={new QueryClient()}><PageWidgets pagePath="/" homeColumn="primary" /></QueryClientProvider>);
  expect(await screen.findByRole('heading', { name: 'Existing Home widget' })).toBeInTheDocument();
});
