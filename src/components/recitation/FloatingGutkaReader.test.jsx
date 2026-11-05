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
  recitationService.getText.mockResolvedValue({ title: 'ਜਪੁਜੀ ਸਾਹਿਬ', titleEnglish: 'Japji Sahib', totalLines: 2, lines: [{ g: 'ੴ ਸਤਿ ਨਾਮੁ', e: 'One Universal Creator', p: 'ਇੱਕ ਅਕਾਲ ਪੁਰਖ', a: 1 }, { g: 'ਕਰਤਾ ਪੁਰਖੁ', e: 'Creator Being', p: 'ਕਰਤਾ ਪੁਰਖ', a: 2 }] });
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
  expect(screen.queryByRole('heading', { name: 'Explore all Banis' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Search the Gurbani library' })).not.toBeInTheDocument();
  expect(recitationService.getCatalog).not.toHaveBeenCalled();
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

test('reads Gurbani one line at a time and records progress only for the signed-in profile', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ }));
  expect(await screen.findByText('ੴ ਸਤਿ ਨਾਮੁ')).toBeInTheDocument();
  expect(screen.queryByText('One Universal Creator')).not.toBeInTheDocument();
  expect(screen.queryByText('ਇੱਕ ਅਕਾਲ ਪੁਰਖ')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'English', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('button', { name: 'Punjabi', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('gutka-reader-content')).toHaveClass('gutka-scroll', 'min-h-0', 'overflow-y-auto', 'py-4');
  expect(screen.getByTestId('gutka-reader-content')).not.toHaveClass('flex-1', 'overflow-hidden');
  await userEvent.click(screen.getByRole('button', { name: 'English', exact: true }));
  expect(screen.getByText('One Universal Creator')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Punjabi', exact: true }));
  expect(screen.getByText('ਇੱਕ ਅਕਾਲ ਪੁਰਖ')).toBeInTheDocument();
  expect(screen.getByText('Line 1 of 2')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Next line' }));
  expect(await screen.findByText('ਕਰਤਾ ਪੁਰਖੁ')).toBeInTheDocument();
  const activity = JSON.parse(window.localStorage.getItem('ssm-gutka-reading-v1:member-7'));
  expect(activity.sessions).toBe(1);
  expect(activity.lines).toBe(1);
  expect(activity.angs).toContain(2);
  await userEvent.click(screen.getByRole('button', { name: 'Back to Gutka selection' }));
  expect(screen.queryByRole('button', { name: 'My progress' })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'My reading progress' })).not.toBeInTheDocument();
});

test('does not save reading activity for anonymous visitors', async () => {
  useAuth.mockReturnValue({ isAuthenticated: false, user: null });
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  await userEvent.click(within(screen.getByRole('region', { name: 'Nitnem prayers' })).getByRole('button', { name: /Japji Sahib/ }));
  await screen.findByText('ੴ ਸਤਿ ਨਾਮੁ');
  await userEvent.click(screen.getByRole('button', { name: 'Next line' }));
  expect(window.localStorage.getItem('ssm-gutka-reading-v1:member-7')).toBeNull();
  expect(screen.queryByRole('button', { name: 'My progress' })).not.toBeInTheDocument();
});

test('supports Ang selection without touching live recitation state', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Open Gutka Sahib reader' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Go to Ang' }), { target: { value: '662' } });
  await userEvent.click(screen.getByRole('button', { name: 'Read', exact: true }));
  await screen.findByText('ੴ ਸਤਿ ਨਾਮੁ');
  expect(recitationService.getText).toHaveBeenLastCalledWith('ang', 662, 'full');
  await userEvent.click(screen.getByRole('button', { name: 'Back to Gutka selection' }));
  expect(screen.getByRole('textbox', { name: 'Go to Ang' })).toHaveValue('662');
  expect(screen.queryByRole('textbox', { name: 'Find a shabad' })).not.toBeInTheDocument();
});
