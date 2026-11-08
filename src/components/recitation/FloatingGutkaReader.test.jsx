import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FloatingGutkaReader from './FloatingGutkaReader';
import recitationService from '../../services/recitationService';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../services/recitationService', () => ({ __esModule: true, default: { getCatalog: jest.fn(), getText: jest.fn() } }));
const { useAuth } = jest.requireMock('../../context/AuthContext');

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
  useAuth.mockReturnValue({ isAuthenticated: true, user: { id: 'member-7', name: 'Sangat Member' } });
  recitationService.getCatalog.mockResolvedValue([{ id: 2, english: 'Japji Sahib', gurmukhi: 'ਜਪੁਜੀ ਸਾਹਿਬ' }, { id: 31, english: 'Sukhmani Sahib', gurmukhi: 'ਸੁਖਮਨੀ ਸਾਹਿਬ' }]);
  recitationService.getText.mockResolvedValue({ title: 'ਜਪੁਜੀ ਸਾਹਿਬ', titleEnglish: 'Japji Sahib', totalLines: 7, lines: Array.from({ length: 7 }, (_, index) => ({ g: `ਗੁਰਬਾਣੀ ਲਾਈਨ ${index + 1}`, r: `Gurbani line ${index + 1} phonetic`, e: `Meaning ${index + 1}`, p: `ਅਰਥ ${index + 1}`, a: 1 })) });
});

const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><FloatingGutkaReader /></QueryClientProvider>);

test('places a fixed Gutka icon launcher and opens its selection modal', async () => {
  setup();
  const launcher = screen.getByRole('button', { name: 'Open Gutka Sahib reader' });
  expect(launcher).toHaveClass('fixed', 'right-4', 'h-14', 'w-14', 'sm:h-16', 'sm:w-16', 'bg-[#072553]');
  expect(launcher.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  expect(within(launcher).getByText('ੴ')).toBeInTheDocument();
  expect(launcher.className).not.toMatch(/animate-|transition|scale/);
  expect(launcher.className).toContain('bottom-[calc');
  await userEvent.click(launcher);
  expect(screen.getByRole('dialog', { name: 'Gutka Sahib' })).toHaveClass('h-auto', 'gutka-dialog', 'rounded-2xl', 'overflow-hidden');
  expect(screen.getByTestId('gutka-home-content')).toHaveClass('gutka-scroll', 'overflow-y-auto');
  expect(screen.getByTestId('gutka-home-content')).not.toHaveClass('flex-1', 'overflow-hidden');
  expect(screen.queryByRole('button', { name: 'My progress' })).not.toBeInTheDocument();
  expect(screen.queryByText('Lines read')).not.toBeInTheDocument();
  expect(screen.getByText('Morning Nitnem')).toBeInTheDocument();
  expect(screen.getByText('Evening Nitnem')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Japji Sahib/ }).parentElement).toHaveClass('grid-cols-2');
  expect(screen.queryByText('Read a bani')).not.toBeInTheDocument();
  expect(screen.getByText('All Banis')).toBeInTheDocument();
  await userEvent.click(screen.getByText('All Banis'));
  const allBanis = screen.getByText('All Banis').closest('details');
  expect(await within(allBanis).findByRole('button', { name: /Sukhmani Sahib/ })).toBeInTheDocument();
  await userEvent.click(within(allBanis).getByRole('button', { name: /Sukhmani Sahib/ }));
  expect(await screen.findByText('ਗੁਰਬਾਣੀ ਲਾਈਨ 1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Back to Gutka selection' }));
  const sggs = screen.getByRole('region', { name: 'Sri Guru Granth Sahib Ji' });
  expect(sggs).toHaveClass('w-full');
  const angForm = within(sggs).getByRole('form', { name: 'Ang selection' });
  expect(angForm).toHaveClass('flex', 'w-full');
  expect(within(angForm).getByRole('textbox', { name: 'Go to Ang' })).toHaveClass('w-full');
  expect(screen.queryByRole('textbox', { name: /shabad|search/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /search/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Shabad search results' })).not.toBeInTheDocument();
  expect(screen.queryByText(/shabad|first letters|searching/i)).not.toBeInTheDocument();
});

test('reads fixed multi-line pages with connected Gurbani, phonetics and page-level progress', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ }));
  expect(await screen.findByText('ਗੁਰਬਾਣੀ ਲਾਈਨ 1')).toBeInTheDocument();
  expect(screen.getByText('ਗੁਰਬਾਣੀ ਲਾਈਨ 7')).toBeInTheDocument();
  expect(screen.queryByText(/Gurbani line 1 phonetic/)).not.toBeInTheDocument();
  expect(screen.queryByText('Meaning 1')).not.toBeInTheDocument();
  expect(screen.queryByText('ਅਰਥ 1')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'English', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Punjabi', exact: true })).not.toBeInTheDocument();
  expect(screen.getByTestId('gutka-reader-content')).toHaveClass('gutka-reader-viewport', 'min-h-0', 'flex-1', 'overflow-hidden');
  const readingDialog = screen.getByRole('dialog', { name: 'Japji Sahib' });
  expect(readingDialog).toHaveClass('gutka-dialog-reading');
  expect(within(readingDialog).queryByRole('combobox', { name: 'Lines per page' })).not.toBeInTheDocument();
  const flowingText = screen.getByText((_, element) => element?.classList.contains('gutka-gurbani-flow'));
  expect(flowingText).toHaveTextContent('ਗੁਰਬਾਣੀ ਲਾਈਨ 1 ਗੁਰਬਾਣੀ ਲਾਈਨ 2 ਗੁਰਬਾਣੀ ਲਾਈਨ 3');
  expect(flowingText.querySelectorAll('.gutka-verse-line')).toHaveLength(7);
  await userEvent.click(screen.getByRole('button', { name: 'Roman English', exact: true }));
  expect(screen.getByRole('button', { name: 'Roman English', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Roman English Gurbani')).toHaveClass('font-bold', 'gutka-gurbani-flow');
  expect(screen.getByLabelText('Roman English Gurbani')).toHaveStyle({ fontSize: '18px' });
  expect(screen.getByLabelText('Roman English Gurbani')).toHaveClass('gutka-roman-flow');
  expect(screen.getByLabelText('Roman English Gurbani').querySelectorAll('br')).toHaveLength(6);
  expect(screen.queryByText('ਗੁਰਬਾਣੀ ਲਾਈਨ 1')).not.toBeInTheDocument();
  expect(screen.getByText(/Gurbani line 1 phonetic/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Gurmukhi', exact: true }));
  expect(screen.getByLabelText('Gurmukhi Gurbani')).toBeInTheDocument();
  expect(screen.queryByLabelText('Roman English Gurbani')).not.toBeInTheDocument();
  expect(screen.queryByText('Meaning 1')).not.toBeInTheDocument();
  expect(screen.queryByText('ਅਰਥ 1')).not.toBeInTheDocument();
  expect(screen.getByText('Lines 1–7 of 7 · Page 1')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
  const activity = JSON.parse(window.localStorage.getItem('ssm-gutka-reading-v1:member-7'));
  expect(activity.sessions).toBe(1);
  expect(activity.lines).toBe(0);
  expect(activity.angs).toContain(1);
  await userEvent.click(screen.getByRole('button', { name: 'Back to Gutka selection' }));
  expect(screen.queryByRole('button', { name: 'My progress' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'My reading progress' })).not.toBeInTheDocument();
});

test('swiping horizontally turns the page forward', async () => {
  recitationService.getText.mockResolvedValue({ titleEnglish: 'Japji Sahib', totalLines: 24, lines: Array.from({ length: 24 }, (_, index) => ({ g: `Verse ${index + 1}`, r: `Roman ${index + 1}`, a: 1 })) });
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ }));
  const content = await screen.findByTestId('gutka-reader-content');
  expect(await screen.findByText('Verse 12')).toBeInTheDocument();
  expect(screen.getByText('Lines 1–12 of 24 · Page 1')).toBeInTheDocument();
  fireEvent.touchStart(content, { changedTouches: [{ clientX: 280, clientY: 260 }] });
  fireEvent.touchEnd(content, { changedTouches: [{ clientX: 120, clientY: 268 }] });
  expect(await screen.findByText('Verse 13')).toBeInTheDocument();
  expect(screen.getByText('Lines 13–24 of 24 · Page 2')).toBeInTheDocument();
  expect(screen.getByLabelText('Gurbani page 2')).toHaveAttribute('data-direction', 'next');
  expect(JSON.parse(window.localStorage.getItem('ssm-gutka-reading-v1:member-7')).lines).toBe(12);
});

test('keeps controls anchored and prevents outside dismissal while reciting', async () => {
  recitationService.getText.mockResolvedValue({ titleEnglish: 'Japji Sahib', lines: [{ g: 'ਆਦਿ ਸਚੁ ॥ ਜੁਗਾਦਿ ਸਚੁ ॥', a: 1 }] });
  const { container } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ }));
  await screen.findByLabelText('Gurbani page 1');
  expect(screen.getByTestId('gutka-page-controls')).toHaveClass('mt-auto', 'shrink-0');
  expect(document.querySelectorAll('.gutka-desktop-verse-break')).toHaveLength(1);
  fireEvent.mouseDown(screen.getByTestId('gutka-backdrop'));
  expect(screen.getByRole('dialog', { name: 'Japji Sahib' })).toBeInTheDocument();
  expect(container).not.toContainElement(screen.getByRole('dialog', { name: 'Japji Sahib' }));
  await userEvent.click(screen.getByRole('button', { name: 'Close Gutka reader' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('catalog includes additional Banis such as Sukhmani Sahib', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  const allBanis = screen.getByText('All Banis').closest('details');
  await userEvent.click(screen.getByText('All Banis'));
  expect(await within(allBanis).findByRole('button', { name: /Sukhmani Sahib/ })).toBeInTheDocument();
});

test('does not save reading activity for anonymous visitors', async () => {
  useAuth.mockReturnValue({ isAuthenticated: false, user: null });
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ }));
  await screen.findByText('ਗੁਰਬਾਣੀ ਲਾਈਨ 1');
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(window.localStorage.getItem('ssm-gutka-reading-v1:member-7')).toBeNull();
  expect(screen.queryByRole('button', { name: 'My progress' })).not.toBeInTheDocument();
});

test('supports Ang selection without touching live recitation state', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Go to Ang' }), { target: { value: '662' } });
  await userEvent.click(screen.getByRole('button', { name: 'Read', exact: true }));
  await screen.findByText('ਗੁਰਬਾਣੀ ਲਾਈਨ 1');
  expect(recitationService.getText).toHaveBeenLastCalledWith('ang', 662, 'full');
  await userEvent.click(screen.getByRole('button', { name: 'Back to Gutka selection' }));
  expect(screen.getByRole('textbox', { name: 'Go to Ang' })).toHaveValue('662');
  expect(screen.queryByRole('textbox', { name: 'Find a shabad' })).not.toBeInTheDocument();
});
