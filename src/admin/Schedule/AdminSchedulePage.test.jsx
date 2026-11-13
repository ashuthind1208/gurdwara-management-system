import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminSchedulePage from './AdminSchedulePage';
import cmsService from '../../services/cmsService';

jest.mock('../../services/cmsService', () => ({ __esModule: true, default: { getHomeContent: jest.fn(), updateSchedule: jest.fn() }, resolveScheduleForDate: () => ({ entries: [] }) }));
beforeEach(() => { cmsService.getHomeContent.mockResolvedValue({ data: { scheduleDays: [] } }); });
const setup = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AdminSchedulePage /></QueryClientProvider>);

test('omits the redundant schedule heading and dividers while preserving all filters', async () => {
  setup();
  expect(screen.queryByRole('heading', { name: '365-Day Schedule Table' })).not.toBeInTheDocument();
  const toolbar = screen.getByRole('group', { name: 'Schedule date and filters' });
  expect(toolbar).toHaveClass('w-full'); expect(toolbar).not.toHaveClass('border-b');
  for (const name of ['View Day', 'Edit Day', 'Reset Filters']) expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument();
  for (const name of ['Pick Date', 'Year', 'Filter Days']) expect(within(toolbar).getByLabelText(name)).toBeInTheDocument();
  expect(screen.queryByText(/Each day starts from default schedule/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Schedule editing opens in a popup/)).not.toBeInTheDocument();
  await screen.findByText('Showing 1-10 of 365');
});
test('keeps schedule actions light on dark buttons with working pagination and day popup modes', async () => {
  setup();
  for (const name of ['View Day', 'Edit Day', 'Previous', 'Next']) {
    const button = screen.getByRole('button', { name, exact: true });
    expect(button).toHaveAttribute('type', 'button'); expect(button).toHaveClass('bg-brand-blue', 'text-white', 'hover:bg-blue-800');
    expect(button).not.toHaveClass('bg-sky-100', 'text-slate-900', 'hover:text-slate-900');
  }
  expect(screen.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Next', exact: true })); expect(screen.getByText('Showing 11-20 of 365')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Previous', exact: true })); expect(screen.getByText('Showing 1-10 of 365')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'View Day', exact: true }));
  expect(screen.getByRole('button', { name: 'Close day modal' })).toBeInTheDocument(); expect(screen.queryByLabelText('Special Day Message (English)')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Close day modal' })); await userEvent.click(screen.getByRole('button', { name: 'Edit Day', exact: true }));
  expect(screen.getByLabelText('Special Day Message (English)')).toBeInTheDocument(); expect(cmsService.updateSchedule).not.toHaveBeenCalled();
});