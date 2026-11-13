import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminAuditTrailPage from './AdminAuditTrailPage';
import DeleteConfirmationGuard from '../../components/common/DeleteConfirmationGuard';
import auditService from '../../services/auditService';

jest.mock('../../services/auditService', () => ({ getLogs: jest.fn(), cleanupLogs: jest.fn() }));
const rows = [{ id: 'one', action: 'content.update', description: 'Saved a page', actorName: 'Test Admin', createdAt: '2026-11-01T10:00:00Z' }];
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><AdminAuditTrailPage /></QueryClientProvider>);
};
const ready = async () => { await waitFor(() => expect(screen.queryByText('Loading audit trail…')).not.toBeInTheDocument()); };
const open = (scope = '30') => {
  fireEvent.change(screen.getByRole('combobox', { name: 'Entries to delete' }), { target: { value: scope } });
  const trigger = screen.getByRole('button', { name: 'Delete audit trail' });
  trigger.focus(); fireEvent.click(trigger);
  return screen.getByRole('alertdialog', { name: 'Confirm audit trail deletion' });
};
beforeEach(() => {
  jest.resetAllMocks();
  auditService.getLogs.mockResolvedValue({ data: rows });
  auditService.cleanupLogs.mockResolvedValue({ data: { deletedCount: 1, daysToKeep: 30, cutoff: '2026-10-13T00:00:00Z' } });
});
test('preserves metadata display, search and pagination alongside explicit cleanup options', async () => {
  auditService.getLogs.mockResolvedValue({ data: Array.from({ length: 21 }, (_, index) => ({ ...rows[0], id: String(index), description: `Entry ${index}` })) });
  setup(); await ready();
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText('Search by action, target, or actor'), { target: { value: 'Entry 20' } });
  expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  expect(screen.getAllByText('Entry 20')).toHaveLength(2);
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Older than 30 days', 'Older than 60 days', 'Older than 90 days', 'Entire audit trail']);
  expect(auditService.cleanupLogs).not.toHaveBeenCalled();
});
test.each(['30', '60', '90', 'all'])('confirmation states exact irreversible scope %s and Cancel never deletes', async (scope) => {
  setup(); await ready();
  const dialog = open(scope);
  expect(dialog).toHaveTextContent('This cannot be undone.');
  expect(dialog).toHaveTextContent('not just the current search or page');
  expect(dialog).toHaveTextContent('No other records will be deleted.');
  const expectedScope = scope === 'all' ? ['entire audit trail, including all recent entries', 'No audit entries will be retained.'] : [`older than ${scope} days`, `Entries from the last ${scope} days will be retained`, 'cutoff is calculated by the server'];
  expectedScope.forEach((text) => expect(dialog).toHaveTextContent(text));
  expect(auditService.cleanupLogs).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Delete audit trail' })).toHaveFocus();
  expect(auditService.cleanupLogs).not.toHaveBeenCalled();
});
test('portal escapes transformed cards, traps focus, supports Escape, and restores focus and scroll', async () => {
  document.body.style.overflow = 'auto';
  const { container, unmount } = setup(); await ready();
  const dialog = open();
  expect(container).not.toContainElement(dialog);
  expect(document.body).toContainElement(dialog);
  expect(document.body.style.overflow).toBe('hidden');
  const cancel = within(dialog).getByRole('button', { name: 'Cancel' });
  const confirm = within(dialog).getByRole('button', { name: 'Permanently delete' });
  expect(cancel).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true }); expect(confirm).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Tab' }); expect(cancel).toHaveFocus();
  screen.getByRole('button', { name: 'Delete audit trail' }).focus(); expect(cancel).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(document.body.style.overflow).toBe('auto');
  expect(screen.getByRole('button', { name: 'Delete audit trail' })).toHaveFocus();
  open(); unmount(); expect(document.body.style.overflow).toBe('auto'); document.body.style.overflow = '';
  expect(auditService.cleanupLogs).not.toHaveBeenCalled();
});
test('global delete guard does not insert a second, ambiguous confirmation before the scoped dialog', async () => {
  render(<DeleteConfirmationGuard />); setup(); await ready();
  const dialog = open('all');
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  expect(screen.queryByRole('heading', { name: 'Confirm deletion' })).not.toBeInTheDocument();
  expect(auditService.cleanupLogs).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(auditService.cleanupLogs).not.toHaveBeenCalled();
});
test.each([['30', 30], ['60', 60], ['90', 90], ['all', null]])('confirmed scope %s sends retention %s, reports count and refetches', async (scope, days) => {
  setup(); await ready(); auditService.getLogs.mockResolvedValue({ data: [] });
  const dialog = open(scope);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Permanently delete' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(auditService.cleanupLogs).toHaveBeenCalledTimes(1);
  expect(auditService.cleanupLogs).toHaveBeenCalledWith(days);
  expect(auditService.getLogs).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('status')).toHaveTextContent('Deleted 1 audit entry.');
  expect(screen.getAllByText('No audit entries found.')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Delete audit trail' })).toHaveFocus();
});
test('pending deletion disables controls, blocks duplicates and Escape, then accepts a true zero count', async () => {
  const request = deferred(); auditService.cleanupLogs.mockReturnValue(request.promise);
  setup(); await ready();
  const dialog = open('all');
  const confirm = within(dialog).getByRole('button', { name: 'Permanently delete' });
  fireEvent.click(confirm); expect(confirm).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(screen.getByRole('combobox')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete audit trail' })).toBeDisabled();
  fireEvent.click(confirm); fireEvent.keyDown(document, { key: 'Escape' }); fireEvent.keyDown(document, { key: 'Tab' });
  expect(dialog).toHaveFocus(); expect(auditService.cleanupLogs).toHaveBeenCalledTimes(1);
  await act(async () => request.resolve({ data: { deletedCount: 0, daysToKeep: null, cutoff: null } }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByRole('status')).toHaveTextContent('Deleted 0 audit entries.');
  expect(screen.getByRole('button', { name: 'Delete audit trail' })).toBeEnabled();
});
test('failed cleanup keeps confirmation open, preserves rows and shows no false success', async () => {
  auditService.cleanupLogs.mockRejectedValue(new Error('Audit cleanup is temporarily unavailable.'));
  setup(); await ready(); const dialog = open();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Permanently delete' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('temporarily unavailable');
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Permanently delete' })).toBeEnabled();
  expect(screen.queryByText(/Deleted \d+ audit/)).not.toBeInTheDocument();
  expect(screen.getAllByText('Saved a page')).toHaveLength(2);
  expect(auditService.getLogs).toHaveBeenCalledTimes(1);
});
test('initial list errors are not displayed as a successful empty audit trail', async () => {
  auditService.getLogs.mockRejectedValue(new Error('List unavailable')); setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the audit trail');
  expect(screen.queryByText('No audit entries found.')).not.toBeInTheDocument();
});
test('successful deletion followed by failed refetch reports both facts without retrying deletion', async () => {
  setup(); await ready(); auditService.getLogs.mockRejectedValue(new Error('Refresh failed'));
  const dialog = open(); fireEvent.click(within(dialog).getByRole('button', { name: 'Permanently delete' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByRole('status')).toHaveTextContent('Deleted 1 audit entry.');
  expect(screen.getByText(/Deletion completed, but the audit trail could not be refreshed/)).toBeInTheDocument();
  expect(screen.queryByText('No audit entries found.')).not.toBeInTheDocument();
  expect(auditService.cleanupLogs).toHaveBeenCalledTimes(1);
});