import {
  bookingBelongsToProfile,
  isBookingArchived,
  isBookingPaymentDonation,
  sortBookingsBySchedule
} from './profileBookings';

describe('profile bookings', () => {
  describe('archive schedule semantics', () => {
    const now = new Date('2026-11-04T12:00:00');

    test.each(['pending', 'confirmed', 'completed', 'cancelled'])('archives past %s bookings', (status) => {
      expect(isBookingArchived({ date: '2026-11-03', status }, now)).toBe(true);
    });

    test('archives cancellations even when scheduled in the future', () => {
      expect(isBookingArchived({ date: '2026-11-05', status: ' Cancelled ' }, now)).toBe(true);
    });

    test('keeps ongoing and future bookings, including legacy completed status, current', () => {
      expect(isBookingArchived({ date: '2026-11-03', toDate: '2026-11-05', status: 'confirmed' }, now)).toBe(false);
      expect(isBookingArchived({ date: '2026-11-05', status: 'completed' }, now)).toBe(false);
      expect(isBookingArchived({ date: '2026-11-04', endTime: '12:00' }, now)).toBe(false);
      expect(isBookingArchived({ date: '2026-11-04', endTime: '12:01' }, now)).toBe(false);
    });

    test('uses the final day and time, retaining date-only bookings throughout that day', () => {
      expect(isBookingArchived({ date: '2026-11-04', endTime: '11:59' }, now)).toBe(true);
      expect(isBookingArchived({ date: '2026-11-02', toDate: '2026-11-04', endTime: '11:59' }, now)).toBe(true);
      expect(isBookingArchived({ date: '2026-11-04' }, now)).toBe(false);
      expect(isBookingArchived({ date: '2026-11-04', endTime: 'invalid' }, now)).toBe(false);
    });

    test('does not hide bookings with missing or invalid schedules', () => {
      expect(isBookingArchived({}, now)).toBe(false);
      expect(isBookingArchived({ date: 'invalid' }, now)).toBe(false);
      expect(isBookingArchived({ date: '2026-13-01' }, now)).toBe(false);
    });
  });

  test('matches bookings by email or normalized phone', () => {
    expect(bookingBelongsToProfile(
      { requesterEmail: 'member@example.com' },
      { email: 'MEMBER@example.com' }
    )).toBe(true);
    expect(bookingBelongsToProfile(
      { requesterPhone: '905-555-0123' },
      { phone: '(905) 555 0123' }
    )).toBe(true);
  });

  test('does not use a name match when stronger profile identifiers are present', () => {
    expect(bookingBelongsToProfile(
      { requesterName: 'Same Name', requesterEmail: 'other@example.com' },
      { name: 'Same Name', email: 'member@example.com' }
    )).toBe(false);
  });

  test('identifies linked booking payments without excluding genuine donations', () => {
    const bookings = [{
      donationPendingId: 'pending-1786407728206',
      donationCampaignId: '7'
    }];

    expect(isBookingPaymentDonation(
      { sourcePendingId: 'pending-1786407728206', campaignName: 'General Fund' },
      bookings
    )).toBe(true);
    expect(isBookingPaymentDonation(
      { campaignName: 'Booking Payments' },
      []
    )).toBe(true);
    expect(isBookingPaymentDonation(
      { sourcePendingId: 'pending-genuine', campaignName: 'General Fund' },
      bookings
    )).toBe(false);
  });

  test('sorts booking dates and times in either direction', () => {
    const bookings = [
      { id: 'later', date: '2026-08-12', startTime: '10:00' },
      { id: 'earlier', date: '2026-08-11', startTime: '18:00' }
    ];

    expect(sortBookingsBySchedule(bookings).map((booking) => booking.id)).toEqual(['earlier', 'later']);
    expect(sortBookingsBySchedule(bookings, 'desc').map((booking) => booking.id)).toEqual(['later', 'earlier']);
  });
});
