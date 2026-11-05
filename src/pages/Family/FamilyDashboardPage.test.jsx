/* eslint-disable testing-library/no-node-access -- These tests verify body portal placement, backdrop structure, and restored background attributes. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FamilyDashboardPage from './FamilyDashboardPage';

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@tanstack/react-query', () => ({ useQuery: jest.fn(), useMutation: () => ({}), useQueryClient: () => ({}) }));
jest.mock('../../hooks/useSeoMeta', () => () => ({}));
jest.mock('../../components/common/Seo', () => () => null);
jest.mock('../../components/common/PageHero', () => ({ title }) => <h1>{title}</h1>);
jest.mock('../../components/communityAnnouncements/CommunityAnnouncementRequestCard', () => () => null);
jest.mock('../../utils/csvExport', () => ({}));
const { useAuth } = jest.requireMock('../../context/AuthContext');
const { useQuery } = jest.requireMock('@tanstack/react-query');

beforeEach(() => {
  localStorage.clear();
  useQuery.mockReturnValue({ data: [] });
});

test('family dashboard contains the signed-in profile reading progress card', () => {
  useAuth.mockReturnValue({ isAuthenticated: true, user: { id: 'family-1', name: 'Family Member' } });
  localStorage.setItem('ssm-gutka-reading-v1:family-1', JSON.stringify({ sessions: 7 }));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><FamilyDashboardPage /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Family Dashboard' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'My reading progress' })).toBeInTheDocument();
  expect(screen.getByText('Readings').parentElement.querySelector('dd')).toHaveTextContent('7');
});

test('anonymous dashboard does not expose saved reading history', () => {
  useAuth.mockReturnValue({ isAuthenticated: false, user: null });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><FamilyDashboardPage /></MemoryRouter>);
  expect(screen.getByText(/You need to sign in/)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'My reading progress' })).not.toBeInTheDocument();
});

describe('booking history archive', () => {
  const booking = (id, fields = {}) => ({ id, title: id, requesterEmail: 'member@example.com', status: 'confirmed', ...fields });
  const renderBookings = (bookings, donations = []) => {
    useAuth.mockReturnValue({ isAuthenticated: true, user: { id: 'family-1', name: 'Member', email: 'member@example.com' } });
    useQuery.mockImplementation(({ queryKey }) => ({
      data: queryKey[0] === 'bookings' ? bookings : queryKey[0] === 'family-dashboard-donations' ? donations : []
    }));
    return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><FamilyDashboardPage /></MemoryRouter>);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-04T12:00:00'));
  });
  afterEach(() => jest.useRealTimers());

  test('only shows current/upcoming profile bookings on the card and past/cancelled bookings in the archive', () => {
    renderBookings([
      booking('Past confirmed', { date: '2026-11-03' }),
      booking('Past pending', { date: '2026-11-03', status: 'pending' }),
      booking('Legacy completed', { date: '2026-11-02', status: 'completed' }),
      booking('Cancelled future', { date: '2026-11-06', status: 'cancelled' }),
      booking('Upcoming', { date: '2026-11-05' }),
      booking('Today', { date: '2026-11-04' }),
      booking('Ended today', { date: '2026-11-04', endTime: '11:00' }),
      booking('Ongoing multi-day', { date: '2026-11-02', toDate: '2026-11-05' }),
      booking('Unscheduled'),
      booking('Someone else', { date: '2026-11-02', requesterEmail: 'other@example.com' })
    ]);
    const card = screen.getByRole('heading', { name: 'Booking History' }).closest('article');
    expect(within(card).getByText('Current / upcoming bookings: 4')).toBeInTheDocument();
    ['Upcoming', 'Today', 'Ongoing multi-day', 'Unscheduled'].forEach((title) => expect(within(card).getByText(title)).toBeInTheDocument());
    ['Past confirmed', 'Past pending', 'Legacy completed', 'Cancelled future', 'Ended today', 'Someone else'].forEach((title) => expect(screen.queryByText(title)).not.toBeInTheDocument());
    expect(within(card).getAllByRole('button', { name: /View booking details/ }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'View booking details for Unscheduled', 'View booking details for Upcoming', 'View booking details for Today', 'View booking details for Ongoing multi-day'
    ]);
    fireEvent.click(within(card).getByRole('button', { name: 'Archived' }));
    const archive = screen.getByRole('dialog', { name: 'Archived Bookings' });
    ['Past confirmed', 'Past pending', 'Legacy completed', 'Cancelled future', 'Ended today'].forEach((title) => expect(within(archive).getByText(title)).toBeInTheDocument());
    ['Upcoming', 'Today', 'Ongoing multi-day', 'Unscheduled', 'Someone else'].forEach((title) => expect(within(archive).queryByText(title)).not.toBeInTheDocument());
  });

  test('archive is a blurred body portal with focus containment, Escape, close, and background restoration', () => {
    const previousOverflow = document.body.style.overflow;
    const { container, unmount } = renderBookings([booking('Past', { date: '2026-11-03' })]);
    const trigger = screen.getByRole('button', { name: 'Archived' });
    trigger.focus();
    fireEvent.click(trigger);
    const archive = screen.getByRole('dialog', { name: 'Archived Bookings' });
    const overlay = archive.parentElement.parentElement;
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay).toHaveClass('backdrop-blur-sm');
    expect(archive).toHaveAttribute('aria-modal', 'true');
    expect(container).toHaveAttribute('aria-hidden', 'true');
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    const closeIcon = within(archive).getByRole('button', { name: 'Close archived bookings' });
    const close = within(archive).getByRole('button', { name: 'Close', exact: true });
    expect(closeIcon).toHaveFocus();
    fireEvent.keyDown(closeIcon, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(closeIcon).toHaveFocus();
    fireEvent.click(archive);
    expect(archive).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(container).not.toHaveAttribute('aria-hidden');
    expect(container.inert).not.toBe(true);
    expect(document.body.style.overflow).toBe(previousOverflow);
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('button', { name: 'Close archived bookings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('dialog').parentElement.parentElement);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    unmount();
    expect(document.body.style.overflow).toBe(previousOverflow);
    expect(document.querySelector('[aria-labelledby="booking-archive-title"]')).toBeNull();
  });

  test('archived and current bookings retain details, and closing archived details returns to the archive', () => {
    renderBookings([
      booking('Past', { date: '2026-11-03', notes: 'Archived programme notes', receiptNumber: 'receipt-123', refundStatus: 'processed', refundAmount: 25 }),
      booking('Upcoming', { date: '2026-11-05', notes: 'Upcoming programme notes' })
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'View booking details for Upcoming' }));
    expect(within(screen.getByRole('dialog', { name: 'Upcoming' })).getByText('Upcoming programme notes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close booking details' }));
    const trigger = screen.getByRole('button', { name: 'Archived' });
    trigger.focus();
    fireEvent.click(trigger);
    const viewPast = screen.getByRole('button', { name: 'View booking details for Past' });
    viewPast.focus();
    fireEvent.click(viewPast);
    const details = screen.getByRole('dialog', { name: 'Past' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(within(details).getByText('Archived programme notes')).toBeInTheDocument();
    expect(within(details).getByText('receipt-123')).toBeInTheDocument();
    expect(within(details).getByText(/released · CAD \$25.00/)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Archived Bookings' })).toBeInTheDocument();
    expect(viewPast).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
    expect(trigger).toHaveFocus();
  });

  test('preserves original empty history and provides current-only and archive empty states', () => {
    const { unmount } = renderBookings([]);
    expect(screen.getByText('No bookings found for your profile yet.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
    expect(screen.getByText('No archived bookings found for your profile yet.')).toBeInTheDocument();
    unmount();
    renderBookings([booking('Past', { date: '2026-11-03' })]);
    expect(screen.getByText('No current or upcoming bookings for your profile.')).toBeInTheDocument();
    expect(screen.queryByText('Past')).not.toBeInTheDocument();
  });

  test('still excludes archived booking payments from donations and preserves donation pagination', () => {
    const donations = Array.from({ length: 7 }, (_, index) => ({ id: `donation-${index}`, donorEmail: 'member@example.com', campaignName: `Donation ${index}`, amount: 10 }));
    donations.push({ id: 'booking-payment', donorEmail: 'member@example.com', campaignName: 'Linked payment', sourcePendingId: 'past-payment', amount: 50 });
    renderBookings([booking('Past', { date: '2026-11-03', donationPendingId: 'past-payment' })], donations);
    expect(screen.queryByText('Linked payment')).not.toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Donation 6')).toBeInTheDocument();
  });
});