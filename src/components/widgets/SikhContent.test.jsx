import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SikhContent from './SikhContent';
import sikhWidgetService, { SIKH_WIDGET_SOURCES, sikhWidgetDateKey } from '../../services/sikhWidgetService';

jest.mock('../../services/sikhWidgetService', () => ({
  ...jest.requireActual('../../services/sikhWidgetService'),
  __esModule: true, default: { getContent: jest.fn() }
}));

const widget = (id = 'gurdwara-hukamnama') => ({ id, source: SIKH_WIDGET_SOURCES[id] });
const payload = (extra = {}) => ({
  title: 'Sourced hukamnama', provenance: 'Darbar Sahib · BaniDB', sourceDate: sikhWidgetDateKey(),
  checkedAt: '2026-11-10T12:00:00Z', resources: [],
  lines: [{ gurmukhi: 'ਸਤਿ ਨਾਮੁ', english: 'True Name', transliteration: 'sat naam', ang: 1 }],
  credits: [{ label: 'BaniDB source', url: 'https://api.banidb.com/v2/hukamnamas' }], ...extra
});
let clients = [];
const mount = (props = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const tree = (next) => <QueryClientProvider client={client}><SikhContent widget={widget()} {...next} /></QueryClientProvider>;
  const view = render(tree(props));
  return { ...view, client, update: (next) => view.rerender(tree(next)) };
};
beforeEach(() => { jest.clearAllMocks(); sikhWidgetService.getContent.mockResolvedValue(payload()); });
afterEach(() => { clients.forEach((client) => client.clear()); clients = []; });

test('renders loading, bilingual excerpt, Ang, provenance, source date and safe external credit', async () => {
  mount();
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(await screen.findByText('ਸਤਿ ਨਾਮੁ')).toHaveAttribute('lang', 'pa-Guru');
  expect(screen.getByText('True Name')).toBeInTheDocument();
  expect(screen.getByText('Ang 1')).toBeInTheDocument();
  expect(screen.getByText('Darbar Sahib · BaniDB')).toBeInTheDocument();
  expect(screen.getByText(sikhWidgetDateKey(), { selector: 'time[datetime="' + sikhWidgetDateKey() + '"]' })).toBeInTheDocument();
  const link = screen.getByRole('link', { name: 'BaniDB source' });
  expect(link).toHaveAttribute('href', 'https://api.banidb.com/v2/hukamnamas');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});

test('renders older source date with explicit not-today notice', async () => {
  sikhWidgetService.getContent.mockResolvedValue(payload({ sourceDate: '2000-01-01' }));
  mount();
  expect(await screen.findByRole('note')).toHaveTextContent('not today’s hukamnama');
  expect(screen.getByText('2000-01-01')).toBeInTheDocument();
});

test('shows empty state without inventing text', async () => {
  sikhWidgetService.getContent.mockResolvedValue(payload({ lines: [] }));
  mount();
  expect(await screen.findByText('No content is available for this selection.')).toBeInTheDocument();
  expect(screen.queryByText('True Name')).not.toBeInTheDocument();
});

test('error hides cached content and retry recovers without exposing internal errors', async () => {
  const { client } = mount();
  await screen.findByText('True Name');
  sikhWidgetService.getContent.mockRejectedValueOnce(new Error('secret database error'));
  await client.invalidateQueries({ queryKey: ['sikh-widget'] });
  expect(await screen.findByRole('alert')).toHaveTextContent('Previously loaded content is not being shown');
  expect(screen.queryByText('True Name')).not.toBeInTheDocument();
  expect(screen.queryByText(/secret database/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('True Name')).toBeInTheDocument();
});

test('all source and configuration changes have distinct query keys and no previous-source placeholder', async () => {
  const { update, client } = mount({ config: { gurdwara: 'Sri Harmandir Sahib (BaniDB)', limit: 1 } });
  await screen.findByText('True Name');
  for (const props of [
    { widget: widget(), config: { gurdwara: 'Example Gurdwara', limit: 1 } },
    { widget: widget('gurbani-ang'), config: { ang: 1, limit: 1 } },
    { widget: widget('gurbani-ang'), config: { ang: 2, limit: 1 } },
    { widget: widget('nitnem-reader'), config: { bani: 'Japji Sahib', limit: 1 } },
    { widget: widget('nitnem-reader'), config: { bani: 'Rehras Sahib', limit: 1 } },
    { widget: widget('nitnem-reader'), config: { bani: 'Kirtan Sohila', limit: 2 } },
    { widget: widget('sikh-learning-resources'), config: { limit: 4 } }
  ]) {
    update(props);
    expect(screen.queryByText('True Name')).not.toBeInTheDocument();
    await screen.findByText('True Name');
    expect(sikhWidgetService.getContent).toHaveBeenLastCalledWith(props.widget.source, props.config);
  }
  expect(client.getQueryCache().getAll()).toHaveLength(8);
});

test('curated cards are labelled not live and their direct links are safe', async () => {
  sikhWidgetService.getContent.mockResolvedValue(payload({
    title: 'Learning', provenance: 'Curated resources — not a live feed', sourceDate: null, lines: [], credits: [],
    resources: [
      { title: 'Sikh Research Institute', description: 'Sikhi learning resources.', url: 'https://sikhri.org' },
      { title: 'The Sikh Coalition', description: 'Learn about Sikhs.', url: 'https://www.sikhcoalition.org/about-sikhs/' },
      { title: 'SikhiToTheMax', description: 'Search Gurbani.', url: 'https://www.sikhitothemax.org' },
      { title: 'SGPC', description: 'Official information.', url: 'https://sgpc.net' }
    ]
  }));
  mount({ widget: widget('sikh-learning-resources') });
  expect(await screen.findByText('Curated resources — not a live feed')).toBeInTheDocument();
  expect(screen.getAllByRole('link')).toHaveLength(4);
  screen.getAllByRole('link').forEach((link) => {
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

test('source text is escaped and unsafe external links are omitted', async () => {
  const hostile = '<img src=x onerror=alert(1)>';
  sikhWidgetService.getContent.mockResolvedValue(payload({
    lines: [{ gurmukhi: hostile, english: '<script>alert(1)</script>' }],
    credits: [{ label: 'Bad scheme', url: 'data:text/html,test' }, { label: 'Bad host', url: 'https://sikhri.org.evil.example' }, { label: 'Local source', url: '/hukamnama' }]
  }));
  mount();
  expect(await screen.findByText(hostile)).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Bad/ })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Local source' })).toHaveAttribute('href', '/hukamnama');
});

test('invalid widget/source pair is rejected without querying', async () => {
  mount({ widget: { id: 'gurdwara-hukamnama', source: 'nitnem' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Unsupported');
  await waitFor(() => expect(sikhWidgetService.getContent).not.toHaveBeenCalled());
});