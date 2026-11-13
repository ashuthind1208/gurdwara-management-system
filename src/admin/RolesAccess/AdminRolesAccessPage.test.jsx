import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminRolesAccessPage from './AdminRolesAccessPage';
import contentApiService from '../../services/contentApiService';

const mockSetHeaderAction = jest.fn();
jest.mock('react-router-dom', () => ({ useOutletContext: () => ({ setHeaderAction: mockSetHeaderAction }) }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { role: 'Super Admin' } }) }));
jest.mock('../../services/contentApiService', () => ({ __esModule: true, default: { getSingleton: jest.fn(), list: jest.fn(), setSingleton: jest.fn() } }));
beforeEach(() => {
  contentApiService.getSingleton.mockImplementation(async (resource, fallback) => fallback);
  contentApiService.list.mockResolvedValue([]);
});
test('places Public Titles and Add Title in a wrapping full-divider row and preserves the editor popup', async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminRolesAccessPage /></QueryClientProvider>);
  const heading = screen.getByRole('heading', { name: 'Public Titles' });
  // eslint-disable-next-line testing-library/no-node-access
  const header = heading.closest('.admin-card-header-row');
  expect(header).toHaveClass('flex-wrap');
  expect(within(header).queryByText('Titles shown on public member profiles.')).not.toBeInTheDocument();
  await userEvent.click(within(header).getByRole('button', { name: 'Add Title' }));
  expect(screen.getByRole('heading', { name: 'Add Public Title' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Close public title editor' }));
  expect(screen.queryByRole('heading', { name: 'Add Public Title' })).not.toBeInTheDocument(); expect(contentApiService.setSingleton).not.toHaveBeenCalled();
});