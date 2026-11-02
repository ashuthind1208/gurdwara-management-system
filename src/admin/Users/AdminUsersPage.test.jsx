import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminUsersPage from './AdminUsersPage';
import userService from '../../services/userService';
import contentApiService from '../../services/contentApiService';

const mockSetHeaderAction = jest.fn();
jest.mock('react-router-dom', () => ({ useOutletContext: () => ({ setHeaderAction: mockSetHeaderAction }) }));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: null, persistUser: jest.fn() }) }));
jest.mock('../../services/userService', () => ({ getUsers: jest.fn(), removeUser: jest.fn() }));
jest.mock('../../services/contentApiService', () => ({ getSingleton: jest.fn() }));
jest.mock('../../services/notificationService', () => ({ sendApprovalEmail: jest.fn() }));
jest.mock('../../services/uploadService', () => ({ uploadFile: jest.fn() }));

const makeUsers = (count = 23) => Array.from({ length: count }, (_, index) => ({
  id: `user-${index + 1}`, name: `User ${index + 1}`, email: `user${index + 1}@example.com`,
  role: index < 12 ? 'Volunteer' : 'Member', approvalStatus: index < 12 ? 'approved' : 'pending'
}));
beforeEach(() => { jest.clearAllMocks(); contentApiService.getSingleton.mockResolvedValue([]); });
const setup = async (users = makeUsers()) => {
  userService.getUsers.mockResolvedValue({ data: users });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><AdminUsersPage /></QueryClientProvider>);
  await within(screen.getByRole('table')).findAllByRole('button', { name: 'View user' });
  return client;
};
const controls = () => within(screen.getByRole('navigation', { name: 'Users table pagination' }));
const next = () => fireEvent.click(controls().getByRole('button', { name: 'Next' }));
const count = (number) => expect(within(screen.getByRole('table')).getAllByRole('button', { name: 'View user' })).toHaveLength(number);

test('desktop paginates ten users, handles the partial last page and keeps mobile independent', async () => {
  await setup(); count(10);
  expect(controls().getByRole('button', { name: 'Previous' })).toBeDisabled();
  next(); count(10);
  expect(controls().getByText('Page 2 of 3')).toBeInTheDocument();
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  next(); count(3);
  expect(controls().getByText('Showing 21–23 of 23')).toBeInTheDocument();
  expect(controls().getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.click(controls().getByRole('button', { name: 'Previous' }));
  count(10);
});

test('desktop search and approval filters reset pagination without changing the mobile search', async () => {
  await setup(); next(); next();
  const [mobile, desktop] = screen.getAllByRole('searchbox');
  fireEvent.change(desktop, { target: { value: 'Member' } });
  expect(controls().getByText('Page 1 of 2')).toBeInTheDocument();
  expect(mobile).toHaveValue(''); count(10);
  next();
  fireEvent.click(screen.getByRole('button', { name: 'Filter Approved' }));
  expect(controls().getByText('0 users')).toBeInTheDocument();
  expect(controls().getByRole('button', { name: 'Previous' })).toBeDisabled();
  expect(controls().getByRole('button', { name: 'Next' })).toBeDisabled();
  fireEvent.change(desktop, { target: { value: '' } });
  count(10);
  expect(controls().getByText('Page 1 of 2')).toBeInTheDocument();
});

test('desktop clamps after deleting the only row on the last page', async () => {
  const users = makeUsers(21);
  await setup(users); next(); next(); count(1);
  userService.removeUser.mockImplementation(async (id) => {
    userService.getUsers.mockResolvedValue({ data: users.filter((user) => user.id !== id) });
    return { data: { deleted: true } };
  });
  fireEvent.click(screen.getByRole('button', { name: 'Show delete icons' }));
  fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Delete user' }));
  await waitFor(() => expect(controls().getByText('Page 2 of 2')).toBeInTheDocument());
  expect(userService.removeUser).toHaveBeenCalledWith('user-21'); count(10);
});

test('desktop retains a clamped page when refreshed data grows again', async () => {
  const users = makeUsers();
  const client = await setup(users); next(); next();
  act(() => client.setQueryData(['admin-users'], users.slice(0, 10)));
  await waitFor(() => expect(controls().getByText('Page 1 of 1')).toBeInTheDocument()); count(10);
  act(() => client.setQueryData(['admin-users'], users));
  await waitFor(() => expect(controls().getByText('Page 1 of 3')).toBeInTheDocument());
});