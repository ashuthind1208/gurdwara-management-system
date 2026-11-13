import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminBookingDutiesPage from './AdminBookingDutiesPage';
import bookingService from '../../services/bookingService';
import contentApiService from '../../services/contentApiService';

jest.mock('react-calendar', () => ({ __esModule: true, default: () => <div aria-label="Calendar grid" /> }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'admin', role: 'Super Admin' } }) }));
jest.mock('../../services/bookingService', () => ({ __esModule: true, default: { getBookings: jest.fn() } }));
jest.mock('../../services/contentApiService', () => ({ __esModule: true, default: { getSingleton: jest.fn(), list: jest.fn() } }));
beforeEach(() => {
  bookingService.getBookings.mockResolvedValue({ data: [
    { id: '1', status: 'confirmed', occasionType: 'Morning programme', date: '2026-11-12' },
    { id: '2', status: 'confirmed', occasionType: 'Evening programme', date: '2026-11-13' }
  ] });
  contentApiService.getSingleton.mockResolvedValue([]); contentApiService.list.mockResolvedValue([]);
});
const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminBookingDutiesPage /></QueryClientProvider>);
test('view toggles and both responsive filter sections share the globally tinted admin card', async () => {
  setup(); await screen.findByRole('heading', { name: 'Morning programme' });
  const controls = screen.getByRole('region', { name: 'Booking duty controls' });
  expect(controls).toHaveAttribute('data-ui-card'); expect(controls).toHaveClass('rounded-xl', 'border', 'p-3', 'space-y-3');
  expect(within(controls).getByRole('group', { name: 'Booking duty view' })).toBeInTheDocument();
  expect(within(controls).getByRole('region', { name: 'Filter booking duties' })).toBeInTheDocument();
  expect(within(controls).getByRole('region', { name: 'Mobile booking duty filters' })).toBeInTheDocument();
  // eslint-disable-next-line testing-library/no-node-access
  expect(controls.parentElement).toHaveClass('-mt-3', 'space-y-3');
  expect(within(controls).queryByRole('heading', { name: 'Morning programme' })).not.toBeInTheDocument();
});
test('desktop filters persist when switching between list and calendar', async () => {
  setup(); await screen.findByRole('heading', { name: 'Morning programme' });
  const filters = screen.getByRole('region', { name: 'Filter booking duties' });
  await userEvent.type(within(filters).getByRole('searchbox', { name: 'Search duties' }), 'Evening');
  expect(screen.queryByRole('heading', { name: 'Morning programme' })).not.toBeInTheDocument(); expect(screen.getByRole('heading', { name: 'Evening programme' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Calendar', exact: true }));
  expect(screen.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute('aria-pressed', 'true'); expect(screen.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByRole('heading', { name: 'Duty Calendar' })).toBeInTheDocument(); expect(within(filters).getByRole('searchbox')).toHaveValue('Evening');
  await userEvent.click(screen.getByRole('button', { name: 'List', exact: true }));
  expect(screen.getByRole('heading', { name: 'Evening programme' })).toBeInTheDocument(); expect(screen.queryByRole('heading', { name: 'Morning programme' })).not.toBeInTheDocument();
  await userEvent.click(within(filters).getByRole('button', { name: 'Reset' })); expect(screen.getByRole('heading', { name: 'Morning programme' })).toBeInTheDocument();
});
test('mobile filters still expand, filter, reset and collapse inside the shared card', async () => {
  setup(); await screen.findByRole('heading', { name: 'Morning programme' });
  const filters = screen.getByRole('region', { name: 'Mobile booking duty filters' }); const toggle = within(filters).getByRole('button', { name: 'Filters Open' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false'); await userEvent.click(toggle); expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await userEvent.type(within(filters).getByRole('searchbox'), 'Evening'); expect(screen.queryByRole('heading', { name: 'Morning programme' })).not.toBeInTheDocument();
  await userEvent.click(within(filters).getByRole('button', { name: 'Reset' })); expect(screen.getByRole('heading', { name: 'Morning programme' })).toBeInTheDocument();
  await userEvent.click(within(filters).getByRole('button', { name: 'Done' })); expect(toggle).toHaveAttribute('aria-expanded', 'false'); expect(within(filters).queryByRole('searchbox')).not.toBeInTheDocument();
});