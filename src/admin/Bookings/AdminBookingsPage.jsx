import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  ArrowsRightLeftIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CreditCardIcon,
  DocumentArrowDownIcon,
  EnvelopeIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import RichTextEditor from '../../components/forms/RichTextEditor';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import bookingService from '../../services/bookingService';
import { siteConfig } from '../../constants/siteConfig';
import donationService from '../../services/donationService';
import eventService from '../../services/eventService';
import contentApiService from '../../services/contentApiService';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { downloadBookingRevenueCsv, downloadBookingRevenuePdf } from '../../utils/csvExport';

const BOOKINGS_PAGE_SIZE = 10;
const DUTY_PAGE_PATH = '/admin/booking-duties';
const FULL_ACCESS_ROLES = new Set(['admin', 'super admin']);
const CATEGORY_COLORS = ['#1d4ed8', '#0f766e', '#b45309', '#b91c1c', '#7c3aed', '#334155'];
const BOOKING_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return { value, label: new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) };
});
const isJathaCategory = (category = {}) => /kirtan|dhadhi\s*jatha|dhadi\s*jatha/i.test(String(category.name || ''));
const getBookingItemsLabel = (booking = {}) => {
  const names = (Array.isArray(booking.itemizedItems) ? booking.itemizedItems : [])
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
  return [...new Set(names)].join(', ') || String(booking.categoryName || booking.title || '').trim();
};
const isAkhandPathBooking = (booking = {}) => /akhand\s*(paath|path)/i.test([
  booking.categoryName,
  booking.title,
  ...(Array.isArray(booking.itemizedItems) ? booking.itemizedItems.map((item) => item?.name) : [])
].filter(Boolean).join(' '));
const isJathaBooking = (booking = {}) => /kirtan|dhadhi\s*jatha|dhadi\s*jatha/i.test([
  booking.categoryName,
  booking.title,
  ...(Array.isArray(booking.itemizedItems) ? booking.itemizedItems.map((item) => item?.name) : [])
].filter(Boolean).join(' ')) && !isAkhandPathBooking(booking);
const isFinalDayJathaPair = (first = {}, second = {}) => [[first, second], [second, first]].some(([akhand, jatha]) => (
  isAkhandPathBooking(akhand)
  && isJathaBooking(jatha)
  && String(jatha.date || '').slice(0, 10) === String(akhand.toDate || akhand.date || '').slice(0, 10)
  && String(jatha.toDate || jatha.endDate || jatha.date || '').slice(0, 10) === String(akhand.toDate || akhand.date || '').slice(0, 10)
));
const isGurdwaraLocation = (location = '') => /gurdwara|7035\s+sixth\s+line/i.test(String(location || ''));
const getBookingVenueLabel = (booking = {}) => {
  const type = String(booking.bookingVenueType || '').toLowerCase();
  return type === 'gurdwara' || (!type && isGurdwaraLocation(booking.bookingLocation)) ? 'At Gurdwara' : 'At Residence';
};
const sortBookingCategories = (rows = []) => [...rows].sort((first, second) => (
  Number(first.sortOrder || 0) - Number(second.sortOrder || 0)
  || Number(isJathaCategory(first)) - Number(isJathaCategory(second))
  || String(first.name || '').localeCompare(String(second.name || ''))
));

const emptyCategory = {
  id: '',
  sortOrder: 0,
  name: '',
  color: '',
  feeAmount: 0,
  paymentRequired: false,
  active: true
};

const emptyPayment = {
  paymentProvider: 'STRIPE',
  paymentLink: '',
  stripeBuyButtonId: '',
  stripePublishableKey: '',
  zeffyApiKey: ''
};

const iconButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

const toDateKey = (value) => {
  const dateOnly = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly) {
    return dateOnly[1];
  }
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const toCalendarDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12) : new Date();
};

const isValidBookingDate = (value) => {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && toDateKey(parsed) === date;
};

const isValidBookingTime = (value) => {
  const time = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const eachDateKey = (startValue, endValue = startValue) => {
  const start = toCalendarDate(startValue);
  const end = toCalendarDate(endValue || startValue);
  if (!toDateKey(startValue) || !toDateKey(endValue || startValue) || end < start) {
    return [];
  }
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end && keys.length < 3660) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

const getBookingIntervals = (booking = {}) => {
  const fullDay = isAkhandPathBooking(booking);
  return eachDateKey(booking.date, booking.toDate || booking.date)
  .map((dateKey) => ({
    start: new Date(`${dateKey}T${fullDay ? '00:00' : booking.startTime || '00:00'}:00`),
    end: fullDay
      ? new Date(new Date(`${dateKey}T00:00:00`).getTime() + (24 * 60 * 60 * 1000))
      : new Date(`${dateKey}T${booking.endTime || '00:00'}:00`)
  }))
  .filter((interval) => !Number.isNaN(interval.start.getTime()) && !Number.isNaN(interval.end.getTime()) && interval.end > interval.start);
};

const getEventIntervals = (event = {}) => {
  const start = new Date(event.date || '');
  const parsedEnd = new Date(event.endDate || '');
  const end = Number.isNaN(parsedEnd.getTime()) ? new Date(start.getTime() + (60 * 60 * 1000)) : parsedEnd;
  return Number.isNaN(start.getTime()) || end <= start ? [] : [{ start, end }];
};

const intervalsOverlap = (first, second) => first.some((left) => second.some((right) => left.start < right.end && right.start < left.end));

const getBookingDutyAssignments = (booking = {}) => {
  if (Array.isArray(booking.dutyAssignees) && booking.dutyAssignees.length) return booking.dutyAssignees;
  return booking.dutyAssigneeId ? [{ userId: booking.dutyAssigneeId, name: booking.dutyAssigneeName || '', email: booking.dutyAssigneeEmail || '', dutyType: '' }] : [];
};

const findScheduleConflict = (candidate, bookings, events) => {
  const candidateIntervals = getBookingIntervals(candidate);
  const candidateAssignments = getBookingDutyAssignments(candidate);
  const sharesPerformer = (entry) => getBookingDutyAssignments(entry).some((existingAssignment) => (
    candidateAssignments.some((candidateAssignment) => (
      (String(candidateAssignment.userId || '').trim() && String(candidateAssignment.userId).trim() === String(existingAssignment.userId || '').trim())
      || (String(candidateAssignment.email || '').trim() && String(candidateAssignment.email).trim().toLowerCase() === String(existingAssignment.email || '').trim().toLowerCase())
    ))
  ));
  const overlappingBookings = bookings.filter((entry) => (
    String(entry.id || '') !== String(candidate.id || '')
    && String(entry.status || '').toLowerCase() !== 'cancelled'
    && intervalsOverlap(candidateIntervals, getBookingIntervals(entry))
    && !(isFinalDayJathaPair(candidate, entry) && !sharesPerformer(entry))
  ));
  const samePerformerConflict = overlappingBookings.flatMap((entry) => getBookingDutyAssignments(entry).flatMap((existingAssignment) => (
    candidateAssignments
      .filter((candidateAssignment) => (
        (String(candidateAssignment.userId || '').trim() && String(candidateAssignment.userId).trim() === String(existingAssignment.userId || '').trim())
        || (String(candidateAssignment.email || '').trim() && String(candidateAssignment.email).trim().toLowerCase() === String(existingAssignment.email || '').trim().toLowerCase())
      ))
      .map((candidateAssignment) => ({ entry, assignment: candidateAssignment }))
  )))[0];
  if (samePerformerConflict) {
    const performerName = samePerformerConflict.assignment.name || samePerformerConflict.assignment.email || 'The selected duty performer';
    return `${performerName} is already assigned to ${samePerformerConflict.entry.categoryName || samePerformerConflict.entry.title || 'another booking'}`;
  }
  const bookingConflict = overlappingBookings[0];
  if (bookingConflict && isAkhandPathBooking(candidate)) {
    return `Akhand Path reserves the selected dates as full days and overlaps ${bookingConflict.categoryName || bookingConflict.title || 'another booking'}. Kirtan or Dhadhi Jatha can be scheduled on its final day.`;
  }
  if (bookingConflict && isAkhandPathBooking(bookingConflict)) {
    return `Akhand Path reserves ${bookingConflict.date}${bookingConflict.toDate && bookingConflict.toDate !== bookingConflict.date ? ` through ${bookingConflict.toDate}` : ''} as full days. Only Kirtan or Dhadhi Jatha can be scheduled on its final day.`;
  }
  if (bookingConflict) return bookingConflict.categoryName || bookingConflict.title || 'another booking';
  const eventConflict = events.find((entry) => (
    entry.active !== false
    && intervalsOverlap(candidateIntervals, getEventIntervals(entry))
    && !isFinalDayJathaPair(candidate, entry)
  ));
  return eventConflict ? eventConflict.title || 'an event' : '';
};

const monthKeyFromDate = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const statusBadgeClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'confirmed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'cancelled') {
    return 'border-rose-200 bg-rose-50 text-rose-700';
  }
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const paymentBadgeClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'partial') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  if (normalized === 'refunded') {
    return 'border-indigo-200 bg-indigo-50 text-indigo-700';
  }
  return 'border-slate-200 bg-slate-100 text-slate-600';
};

const refundBadgeClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'processed') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }
  if (normalized === 'pending') {
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }
  return 'border-slate-200 bg-slate-100 text-slate-600';
};

const AdminBookingsPage = () => {
  const { setHeaderAction } = useOutletContext();
  const { user } = useAuth();
  const { branding } = useBranding();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [guidelinesDraft, setGuidelinesDraft] = useState({ guidelines: '', donationCampaignId: '', showCreateBookingButton: true });
  const [guidelinesConfirmationOpen, setGuidelinesConfirmationOpen] = useState(false);
  const [categoryModal, setCategoryModal] = useState({ open: false, mode: 'add', category: emptyCategory });
  const [bookingModal, setBookingModal] = useState({ open: false, mode: 'view', booking: null });
  const [dutyAssignmentsModal, setDutyAssignmentsModal] = useState({ open: false, assignments: [] });
  const [statusModal, setStatusModal] = useState({ open: false, booking: null, status: 'pending' });
  const [refundModal, setRefundModal] = useState({ open: false, booking: null, refundStatus: 'pending', refundAmount: 0, refundMethod: 'original-payment-method', refundReference: '', refundDate: '', refundNotes: '' });
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState(emptyPayment);
  const [paymentError, setPaymentError] = useState('');
  const [bookingFormError, setBookingFormError] = useState('');
  const [bookingCalendarOpen, setBookingCalendarOpen] = useState(false);
  const [bookingFilters, setBookingFilters] = useState({ search: '', status: '', paymentStatus: '', categoryId: '', sort: 'newest' });
  const [revenuePeriod, setRevenuePeriod] = useState('30');
  const [revenueFromDate, setRevenueFromDate] = useState('');
  const [revenueToDate, setRevenueToDate] = useState('');
  const [revenueCategoryId, setRevenueCategoryId] = useState('');
  const [revenueExportError, setRevenueExportError] = useState('');

  const { data: bookings = [], isLoading: bookingsLoading, error: bookingsError } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => bookingService.getBookings().then((res) => res.data)
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['booking-categories'],
    queryFn: () => bookingService.getBookingCategories().then((res) => res.data)
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => eventService.getEvents().then((res) => res.data)
  });

  const { data: roleDefinitions = [] } = useQuery({
    queryKey: ['admin-role-definitions'],
    queryFn: () => contentApiService.getSingleton('admin_roles', [])
  });

  const { data: adminUsers = [] } = useQuery({
    queryKey: ['admin-users', 'booking-assignees'],
    queryFn: () => contentApiService.list('users')
  });

  const dutyAssignees = useMemo(() => {
    const dutyRoles = new Set((Array.isArray(roleDefinitions) ? roleDefinitions : [])
      .filter((entry) => Array.isArray(entry?.adminPageAccess) && entry.adminPageAccess.includes(DUTY_PAGE_PATH))
      .map((entry) => String(entry?.name || '').trim().toLowerCase())
      .filter(Boolean));
    return adminUsers.filter((entry) => {
      const role = String(entry.role || '').trim().toLowerCase();
      return !FULL_ACCESS_ROLES.has(role)
        && dutyRoles.has(role)
        && entry.isActive !== false
        && String(entry.approvalStatus || 'approved').toLowerCase() === 'approved';
    }).sort((first, second) => String(first.name || first.email || '').localeCompare(String(second.name || second.email || '')));
  }, [adminUsers, roleDefinitions]);

  const { data: bookingPageSettings } = useQuery({
    queryKey: ['booking-page-settings'],
    queryFn: () => bookingService.getBookingPageSettings().then((res) => res.data)
  });

  const { data: donationCampaigns = [] } = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: () => donationService.getAllCampaigns().then((res) => res.data)
  });

  useEffect(() => {
    if (bookingPageSettings) {
      setGuidelinesDraft(bookingPageSettings);
    }
  }, [bookingPageSettings]);

  const selectedCampaign = useMemo(
    () => donationCampaigns.find((campaign) => String(campaign.id) === String(guidelinesDraft.donationCampaignId)),
    [donationCampaigns, guidelinesDraft.donationCampaignId]
  );

  const filteredBookings = useMemo(() => {
    const search = bookingFilters.search.trim().toLowerCase();
    return bookings.filter((booking) => {
      if (bookingFilters.status && booking.status !== bookingFilters.status) {
        return false;
      }
      if (bookingFilters.paymentStatus && booking.paymentStatus !== bookingFilters.paymentStatus) {
        return false;
      }
      if (bookingFilters.categoryId && booking.categoryId !== bookingFilters.categoryId
        && !(Array.isArray(booking.itemizedItems) && booking.itemizedItems.some((item) => String(item.categoryId) === String(bookingFilters.categoryId)))) {
        return false;
      }
      if (!search) {
        return true;
      }
      return [
        booking.id,
        booking.requesterName,
        booking.requesterEmail,
        booking.requesterPhone,
        booking.categoryName,
        booking.date,
        booking.receiptNumber,
        booking.paymentReference,
        ...(Array.isArray(booking.itemizedItems) ? booking.itemizedItems.map((item) => item.name) : [])
      ].some((value) => String(value || '').toLowerCase().includes(search));
    });
  }, [bookingFilters, bookings]);

  const sortedBookings = useMemo(
    () => [...filteredBookings].sort((first, second) => {
      const sort = bookingFilters.sort;
      if (sort === 'name-asc' || sort === 'name-desc') {
        const comparison = String(first.requesterName || '').localeCompare(String(second.requesterName || ''), 'en', { sensitivity: 'base' });
        return sort === 'name-desc' ? -comparison : comparison;
      }
      if (sort === 'booking-latest' || sort === 'booking-earliest') {
        const firstValue = `${first.date || ''}T${first.startTime || '00:00'}`;
        const secondValue = `${second.date || ''}T${second.startTime || '00:00'}`;
        return sort === 'booking-earliest' ? firstValue.localeCompare(secondValue) : secondValue.localeCompare(firstValue);
      }
      const firstCreated = new Date(first.createdAt || 0).getTime();
      const secondCreated = new Date(second.createdAt || 0).getTime();
      return sort === 'oldest' ? firstCreated - secondCreated : secondCreated - firstCreated;
    }),
    [bookingFilters.sort, filteredBookings]
  );

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / BOOKINGS_PAGE_SIZE));
  const pagedBookings = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * BOOKINGS_PAGE_SIZE;
    return sortedBookings.slice(start, start + BOOKINGS_PAGE_SIZE);
  }, [currentPage, sortedBookings, totalPages]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [bookingFilters]);

  const kpis = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((entry) => entry.status === 'pending').length;
    const confirmed = bookings.filter((entry) => entry.status === 'confirmed').length;
    const cancelled = bookings.filter((entry) => entry.status === 'cancelled').length;
    const refunded = bookings.filter((entry) => (
      entry.paymentStatus === 'refunded'
      || String(entry.refundStatus || '').toLowerCase() === 'processed'
    )).length;
    const revenue = bookings
      .filter((entry) => entry.status === 'confirmed' && entry.paymentStatus === 'paid')
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return { total, pending, confirmed, cancelled, refunded, revenue };
  }, [bookings]);

  const trendRows = useMemo(() => {
    const byMonth = new Map();
    bookings.forEach((entry) => {
      const key = monthKeyFromDate(entry.date || entry.createdAt);
      const existing = byMonth.get(key) || { month: key, bookings: 0, revenue: 0 };
      existing.bookings += 1;
      if (entry.status === 'confirmed' && entry.paymentStatus === 'paid') {
        existing.revenue += Number(entry.amount || 0);
      }
      byMonth.set(key, existing);
    });
    return [...byMonth.values()].sort((first, second) => first.month.localeCompare(second.month)).slice(-12);
  }, [bookings]);

  const revenueReport = useMemo(() => {
    const today = new Date();
    const customDatesValid = revenuePeriod !== 'custom'
      || Boolean(revenueFromDate && revenueToDate && revenueFromDate <= revenueToDate);
    const endDate = revenuePeriod === 'custom' ? revenueToDate : toDateKey(today);
    const startDate = revenuePeriod === 'custom' ? revenueFromDate : (() => {
        const start = new Date(today);
        start.setDate(start.getDate() - Number(revenuePeriod || 30) + 1);
        return toDateKey(start);
      })();
    const rows = bookings.filter((booking) => {
      const receivedDate = toDateKey(booking.paymentReceivedAt || booking.createdAt);
      const dateInRange = customDatesValid && receivedDate && receivedDate >= startDate && receivedDate <= endDate;
      const categoryMatches = !revenueCategoryId || String(booking.categoryId) === String(revenueCategoryId);
      const isRevenue = String(booking.status).toLowerCase() === 'confirmed'
        && ['paid', 'partial'].includes(String(booking.paymentStatus).toLowerCase())
        && (Number(booking.amount) > 0);
      return dateInRange && categoryMatches && isRevenue;
    }).sort((first, second) => String(first.paymentReceivedAt || first.createdAt || '').localeCompare(String(second.paymentReceivedAt || second.createdAt || '')));
    const total = rows.reduce((sum, booking) => {
      const gross = Number(booking.amount || 0);
      const refunded = String(booking.refundStatus || '').toLowerCase() === 'processed'
        || String(booking.paymentStatus || '').toLowerCase() === 'refunded'
        ? Number(booking.refundAmount || 0)
        : 0;
      return sum + Math.max(0, gross - refunded);
    }, 0);
    return { startDate, endDate, rows, total, customDatesValid };
  }, [bookings, revenueCategoryId, revenueFromDate, revenuePeriod, revenueToDate]);

  const exportBookingRevenue = async (format) => {
    setRevenueExportError('');
    if (revenuePeriod === 'custom' && (!revenueFromDate || !revenueToDate || revenueFromDate > revenueToDate)) {
      setRevenueExportError('Choose a valid custom date range before exporting.');
      return;
    }
    const common = {
      fileName: `booking-revenue-${revenueReport.startDate}-to-${revenueReport.endDate}.${format}`,
      organizationName: siteConfig.name,
      bookings: revenueReport.rows,
      startDate: revenueReport.startDate,
      endDate: revenueReport.endDate,
      categoryName: categories.find((category) => String(category.id) === String(revenueCategoryId))?.name || 'All booking types',
      totalRevenue: revenueReport.total
    };
    try {
      if (format === 'pdf') await downloadBookingRevenuePdf(common);
      else downloadBookingRevenueCsv(common);
    } catch (error) {
      setRevenueExportError(error?.message || 'Unable to create the booking report.');
    }
  };

  const occupiedDates = useMemo(() => {
    const dates = new Map();
    const addRange = (start, end, kind) => {
      eachDateKey(start, end).forEach((dateKey) => {
        const kinds = dates.get(dateKey) || new Set();
        kinds.add(kind);
        dates.set(dateKey, kinds);
      });
    };
    bookings
      .filter((booking) => String(booking.status || '').toLowerCase() !== 'cancelled')
      .forEach((booking) => addRange(booking.date, booking.toDate || booking.date, 'booking'));
    events
      .filter((event) => event.active !== false)
      .forEach((event) => addRange(event.date, event.endDate || event.date, 'event'));
    return dates;
  }, [bookings, events]);

  const occupiedEntriesByDate = useMemo(() => {
    const entriesByDate = new Map();
    const addEntry = (entry, kind) => {
      eachDateKey(entry.date, entry.toDate || entry.endDate || entry.date).forEach((dateKey) => {
        const entries = entriesByDate.get(dateKey) || [];
        const requestedItems = kind === 'booking' && Array.isArray(entry.itemizedItems)
          ? [...entry.itemizedItems].sort((first, second) => (
            sortBookingCategories(categories).findIndex((category) => String(category.id) === String(first.categoryId))
            - sortBookingCategories(categories).findIndex((category) => String(category.id) === String(second.categoryId))
          )).map((item) => item.name).filter(Boolean).join(', ')
          : '';
        entries.push({
          id: `${kind}-${entry.id}-${dateKey}`,
          kind,
          title: requestedItems || entry.categoryName || entry.title || (kind === 'booking' ? 'Booking' : 'Event'),
          location: kind === 'booking' ? getBookingVenueLabel(entry) : String(entry.location || '').trim(),
          startTime: entry.startTime || (entry.date?.includes('T') ? new Date(entry.date).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : ''),
          endTime: entry.endTime || (entry.endDate?.includes('T') ? new Date(entry.endDate).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '')
        });
        entriesByDate.set(dateKey, entries);
      });
    };
    bookings.filter((booking) => String(booking.status || '').toLowerCase() !== 'cancelled').forEach((booking) => addEntry(booking, 'booking'));
    events.filter((event) => event.active !== false).forEach((event) => addEntry(event, 'event'));
    return entriesByDate;
  }, [bookings, categories, events]);

  const settingsMutation = useMutation({
    mutationFn: (settings) => bookingService.setBookingPageSettings(settings).then((res) => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['booking-page-settings'] });
      setGuidelinesConfirmationOpen(true);
    }
  });

  const categoriesMutation = useMutation({
    mutationFn: (rows) => bookingService.setBookingCategories(rows).then((res) => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['booking-categories'] });
      setCategoryModal({ open: false, mode: 'add', category: emptyCategory });
    }
  });

  const bookingMutation = useMutation({
    mutationFn: ({ id, payload }) => bookingService.updateBooking(id, payload).then((res) => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setBookingModal({ open: false, mode: 'view', booking: null });
      setStatusModal({ open: false, booking: null, status: 'pending' });
      setRefundModal({ open: false, booking: null, refundStatus: 'pending', refundAmount: 0, refundMethod: 'original-payment-method', refundReference: '', refundDate: '', refundNotes: '' });
    },
    onError: (error) => setBookingFormError(error?.message || 'Unable to update this booking.')
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => bookingService.removeBooking(id).then((res) => res.data),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['bookings'] })
  });

  const emailMutation = useMutation({
    mutationFn: (booking) => bookingService.sendBookingConfirmationEmail(booking, branding.address).then((res) => res.data),
    onSuccess: (_, booking) => {
      window.alert(`Booking receipt emailed to ${booking?.requesterEmail || booking?.requesterName || 'the requester'}.`);
    },
    onError: (error) => {
      window.alert(error?.message || 'Unable to email the booking receipt right now.');
    }
  });

  const paymentMutation = useMutation({
    mutationFn: async (values) => {
      const provider = String(values.paymentProvider || '').toUpperCase();
      if (provider === 'ZEFFY' && !String(values.paymentLink || '').trim()) {
        throw new Error('A Zeffy form link is required.');
      }

      const payload = {
        name: selectedCampaign?.name || 'Booking Payments',
        description: 'Online payment configuration for all booking types.',
        target: 0,
        raised: Number(selectedCampaign?.raised || 0),
        isActive: true,
        paymentProvider: provider,
        paymentLink: String(values.paymentLink || '').trim(),
        stripeBuyButtonId: String(values.stripeBuyButtonId || '').trim(),
        stripePublishableKey: String(values.stripePublishableKey || '').trim(),
        ...(String(values.zeffyApiKey || '').trim() ? { zeffyApiKey: String(values.zeffyApiKey).trim() } : {})
      };

      const campaign = selectedCampaign
        ? await donationService.updateCampaign(selectedCampaign.id, payload).then((res) => res.data)
        : await donationService.createCampaign(payload).then((res) => res.data);
      const settings = await bookingService.setBookingPageSettings({
        ...guidelinesDraft,
        donationCampaignId: String(campaign.id)
      }).then((res) => res.data);
      return { campaign, settings };
    },
    onSuccess: async ({ settings }) => {
      setGuidelinesDraft(settings);
      setPaymentError('');
      setPaymentModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] }),
        queryClient.invalidateQueries({ queryKey: ['booking-page-settings'] })
      ]);
    },
    onError: (error) => setPaymentError(error?.message || 'Unable to save booking payment settings.')
  });

  const createBookingMutation = useMutation({
    mutationFn: (payload) => bookingService.createBooking(payload).then((res) => res.data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setBookingFormError('');
      setBookingModal({ open: false, mode: 'view', booking: null });
    },
    onError: (error) => setBookingFormError(error?.message || 'Unable to create this booking.')
  });

  const openCategoryModal = (mode, category = emptyCategory) => {
    setCategoryModal({ open: true, mode, category: { ...emptyCategory, ...category } });
  };

  const saveCategory = () => {
    const draft = categoryModal.category;
    const name = String(draft.name || '').trim();
    if (!name) {
      return;
    }
    const normalized = {
      ...draft,
      id: draft.id || `booking-category-${Date.now()}`,
      sortOrder: Number(draft.sortOrder) || (categories.length + 1),
      color: draft.color || CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
      name,
      feeAmount: Number(draft.feeAmount || 0)
    };
    const nextCategories = categoryModal.mode === 'add'
      ? [...categories, normalized]
      : categories.map((entry) => entry.id === normalized.id ? normalized : entry);
    categoriesMutation.mutate(nextCategories);
  };

  const changeCategoryOrder = (categoryId, position) => {
    const ordered = sortBookingCategories(categories);
    const moving = ordered.find((entry) => String(entry.id) === String(categoryId));
    if (!moving) return;
    const next = ordered.filter((entry) => String(entry.id) !== String(categoryId));
    next.splice(Math.max(0, Math.min(next.length, Number(position) - 1)), 0, moving);
    categoriesMutation.mutate(next.map((entry, index) => ({ ...entry, sortOrder: index + 1 })));
  };

  const removeCategory = (category) => {
    if (window.confirm(`Delete booking type “${category.name}”?`)) {
      categoriesMutation.mutate(categories.filter((entry) => entry.id !== category.id));
    }
  };

  const openPaymentModal = () => {
    setPaymentError('');
    setPaymentDraft({
      paymentProvider: selectedCampaign?.paymentProvider === 'ZEFFY' ? 'ZEFFY' : 'STRIPE',
      paymentLink: selectedCampaign?.paymentLink || '',
      stripeBuyButtonId: selectedCampaign?.stripeBuyButtonId || '',
      stripePublishableKey: selectedCampaign?.stripePublishableKey || '',
      zeffyApiKey: ''
    });
    setPaymentModalOpen(true);
  };

  const updateBookingDraft = (field, value) => {
    setBookingModal((current) => ({
      ...current,
      booking: {
        ...current.booking,
        [field]: value,
        ...(field === 'paymentStatus' && value === 'paid' && current.booking.source === 'admin-manual' ? { status: 'confirmed' } : {})
      }
    }));
  };

  const updateRequesterAddress = (value) => {
    const address = String(value || '');
    const hasAddress = Boolean(address.trim());
    setBookingModal((current) => ({
      ...current,
      booking: {
        ...current.booking,
        requesterAddress: address,
        bookingVenueType: hasAddress ? 'residence' : 'gurdwara',
        bookingLocation: hasAddress ? address : `${branding.organizationName || 'Gurdwara'}${branding.address ? `, ${branding.address}` : ''}`
      }
    }));
  };

  const getBookingItems = (booking = {}) => {
    if (Array.isArray(booking.itemizedItems) && booking.itemizedItems.length) return booking.itemizedItems;
    if (bookingModal.mode === 'create' && Array.isArray(booking.itemizedItems)) return [];
    if (!booking.categoryId) return [];
    const category = categories.find((entry) => String(entry.id) === String(booking.categoryId));
    return category ? [{ categoryId: category.id, name: category.name, description: category.description || '', amount: Number(booking.amount || category.feeAmount || 0) }] : [];
  };

  const getDutyAssignmentsForBooking = (booking = {}) => {
    const items = getBookingItems(booking);
    const savedAssignments = getBookingDutyAssignments(booking);
    return items.map((item, index) => {
      const assignment = savedAssignments.find((entry) => String(entry.bookingItemCategoryId || '') === String(item.categoryId || ''))
        || (!savedAssignments.some((entry) => entry.bookingItemCategoryId) ? savedAssignments[index] : null)
        || {};
      const dutyItem = items.find((entry) => String(entry.categoryId || '') === String(assignment.dutyCategoryId || '')) || item;
      return {
        ...assignment,
        bookingItemCategoryId: String(item.categoryId || ''),
        dutyCategoryId: String(dutyItem.categoryId || ''),
        dutyType: String(assignment.dutyType || dutyItem.name || item.name || '').trim()
      };
    });
  };

  const openDutyAssignmentsModal = (booking = bookingModal.booking) => {
    setDutyAssignmentsModal({ open: true, assignments: getDutyAssignmentsForBooking(booking).map((assignment) => ({ ...assignment })) });
  };

  const updateDutyAssignmentSelection = (index, userId) => {
    const selected = dutyAssignees.find((entry) => String(entry.id) === String(userId));
    setDutyAssignmentsModal((current) => ({
      ...current,
      assignments: current.assignments.map((assignment, assignmentIndex) => assignmentIndex === index ? {
        ...assignment,
        userId: String(selected?.id || ''),
        name: String(selected?.name || selected?.email || ''),
        email: String(selected?.email || '').toLowerCase()
      } : assignment)
    }));
  };

  const saveDutyAssignments = () => {
    const first = dutyAssignmentsModal.assignments[0] || {};
    setBookingModal((current) => ({
      ...current,
      booking: {
        ...current.booking,
        dutyAssignees: dutyAssignmentsModal.assignments,
        dutyAssigneeId: String(first.userId || ''),
        dutyAssigneeName: String(first.name || ''),
        dutyAssigneeEmail: String(first.email || '').toLowerCase()
      }
    }));
    setDutyAssignmentsModal({ open: false, assignments: [] });
  };

  const getReceiptDisplayItems = (booking = {}) => {
    const items = getBookingItems(booking);
    const categoryOrder = new Map(sortBookingCategories(categories).map((category, index) => [String(category.id), index]));
    return [...items].sort((first, second) => (categoryOrder.get(String(first.categoryId)) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(String(second.categoryId)) ?? Number.MAX_SAFE_INTEGER));
  };


  const updateBookingItems = (nextItems) => {
    const categoryOrder = new Map(sortBookingCategories(categories).map((category, index) => [String(category.id), index]));
    nextItems = [...nextItems].sort((first, second) => (categoryOrder.get(String(first.categoryId)) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(String(second.categoryId)) ?? Number.MAX_SAFE_INTEGER));
    const firstItem = nextItems[0];
    const total = nextItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const currentBooking = bookingModal.booking || {};
    const oldAssignments = getBookingDutyAssignments(currentBooking);
    const dutyAssignees = nextItems.map((item, index) => {
      const assignment = oldAssignments.find((entry) => String(entry.bookingItemCategoryId || '') === String(item.categoryId || ''))
        || (!oldAssignments.some((entry) => entry.bookingItemCategoryId) ? oldAssignments[index] : null)
        || {};
      const dutyItem = nextItems.find((entry) => String(entry.categoryId || '') === String(assignment.dutyCategoryId || '')) || item;
      return {
        ...assignment,
        bookingItemCategoryId: String(item.categoryId || ''),
        dutyCategoryId: String(dutyItem.categoryId || ''),
        dutyType: String(assignment.dutyType || dutyItem.name || item.name || '').trim()
      };
    });
    const firstAssignee = dutyAssignees[0] || {};
    const fullDay = isAkhandPathBooking({ ...currentBooking, itemizedItems: nextItems });
    setBookingModal((current) => ({
      ...current,
      booking: {
        ...current.booking,
        itemizedItems: nextItems,
        dutyAssignees,
        dutyAssigneeId: String(firstAssignee.userId || ''),
        dutyAssigneeName: String(firstAssignee.name || ''),
        dutyAssigneeEmail: String(firstAssignee.email || '').toLowerCase(),
        startTime: fullDay ? '' : current.booking.startTime || '',
        endTime: fullDay ? '' : current.booking.endTime || '',
        categoryId: firstItem?.categoryId || '',
        categoryName: firstItem?.name || '',
        title: nextItems.map((item) => item.name).join(', ') || 'Booking Request',
        color: categories.find((entry) => String(entry.id) === String(firstItem?.categoryId))?.color || '',
        amount: total,
        paymentStatus: total > 0 ? (current.booking.paymentStatus || 'pending') : 'pending',
        paymentMethod: total > 0 ? (current.booking.paymentMethod || '') : ''
      }
    }));
  };

  const openStatusModal = (booking) => {
    setStatusModal({ open: true, booking: { ...booking }, status: booking.status || 'pending' });
  };

  const openRefundModal = (booking) => {
    setRefundModal({
      open: true,
      booking: { ...booking },
      refundStatus: booking.refundStatus || 'pending',
      refundAmount: Number(booking.refundAmount || booking.amount || 0),
      refundMethod: booking.refundMethod || 'original-payment-method',
      refundReference: booking.refundReference || '',
      refundDate: booking.refundDate || '',
      refundNotes: booking.refundNotes || ''
    });
  };

  const saveStatus = (event) => {
    event.preventDefault();
    const booking = statusModal.booking;
    if (!booking?.id) {
      return;
    }
    const needsRefundDetails = statusModal.status === 'cancelled'
      && ['paid', 'partial'].includes(String(booking.paymentStatus || '').toLowerCase())
      && String(booking.refundStatus || '').toLowerCase() !== 'processed';
    if (needsRefundDetails) {
      setStatusModal({ open: false, booking: null, status: 'pending' });
      openRefundModal(booking);
      return;
    }
    const cancellationDetails = statusModal.status === 'cancelled'
      ? { refundStatus: booking.refundStatus || 'not-required', refundAmount: Number(booking.refundAmount || 0) }
      : { refundStatus: '', refundAmount: 0, refundMethod: '', refundReference: '', refundDate: '', refundNotes: '' };
    bookingMutation.mutate({ id: booking.id, payload: { ...booking, ...cancellationDetails, status: statusModal.status } });
  };

  const saveCancellationRefund = (event) => {
    event.preventDefault();
    const booking = refundModal.booking;
    if (!booking?.id) {
      return;
    }
    const refundAmount = Number(refundModal.refundAmount || 0);
    if (refundAmount <= 0 || (refundModal.refundStatus === 'processed' && !String(refundModal.refundReference || '').trim())) {
      return;
    }
    bookingMutation.mutate({
      id: booking.id,
      payload: {
        ...booking,
        status: 'cancelled',
        paymentStatus: refundModal.refundStatus === 'processed' ? 'refunded' : booking.paymentStatus,
        refundStatus: refundModal.refundStatus,
        refundAmount,
        refundMethod: refundModal.refundMethod,
        refundReference: String(refundModal.refundReference || '').trim(),
        refundDate: refundModal.refundStatus === 'processed'
          ? refundModal.refundDate || new Date().toISOString().slice(0, 10)
          : refundModal.refundDate,
        refundNotes: String(refundModal.refundNotes || '').trim()
      }
    });
  };

  const saveBooking = (event) => {
    event.preventDefault();
    const booking = bookingModal.booking;
    if (!booking) {
      return;
    }
    const requiredFields = [
      ['date', 'From date'],
      ['toDate', 'To date'],
      ['bookingLocation', 'Booking location'],
      ['requesterName', 'Name'],
      ['paymentStatus', 'Payment status']
    ];
    const missingField = requiredFields.find(([field]) => !String(booking[field] || '').trim());
    if (missingField) {
      setBookingFormError(`${missingField[1]} is required.`);
      return;
    }
    const requiredDutyAssignments = getDutyAssignmentsForBooking(booking);
    if (!requiredDutyAssignments.length || requiredDutyAssignments.some((assignment) => !String(assignment.userId || '').trim())) {
      setBookingFormError('Assign one eligible duty performer for every selected booking item.');
      return;
    }
    if (!isValidBookingDate(booking.date) || !isValidBookingDate(booking.toDate)) {
      setBookingFormError('Enter valid start and end dates.');
      return;
    }
    const fullDayBooking = isAkhandPathBooking({ ...booking, itemizedItems: getBookingItems(booking) });
    if (!fullDayBooking && (!String(booking.startTime || '').trim() || !String(booking.endTime || '').trim())) {
      setBookingFormError('Start time and end time are required for this booking type.');
      return;
    }
    if (!fullDayBooking && (!isValidBookingTime(booking.startTime) || !isValidBookingTime(booking.endTime))) {
      setBookingFormError('Enter valid start and end times.');
      return;
    }
    if (bookingModal.mode === 'create' && !getBookingItems(booking).length) {
      setBookingFormError('Select at least one booking item for the receipt.');
      return;
    }
    if (Number(booking.amount) > 0 && ['paid', 'partial'].includes(String(booking.paymentStatus).toLowerCase()) && !String(booking.paymentMethod || '').trim()) {
      setBookingFormError('Choose a payment method when recording a payment.');
      return;
    }
    if (booking.toDate < booking.date) {
      setBookingFormError('To date cannot be earlier than the from date.');
      return;
    }
    if (!fullDayBooking && booking.endTime <= booking.startTime) {
      setBookingFormError('End time must be later than start time.');
      return;
    }
    const conflictTitle = findScheduleConflict(booking, bookings, events);
    if (conflictTitle) {
      setBookingFormError(`This date and time overlaps with ${conflictTitle}. Choose a different time.`);
      return;
    }
    if (Number(booking.amount) < 0) {
      setBookingFormError('Amount cannot be negative.');
      return;
    }
    if (booking.paymentStatus === 'partial' && !(Number(booking.amountPaid) > 0 && Number(booking.amountPaid) < Number(booking.amount))) {
      setBookingFormError('Enter an amount received that is greater than zero and less than the receipt total.');
      return;
    }
    setBookingFormError('');
    if (bookingModal.mode === 'create') {
      createBookingMutation.mutate({
        ...booking,
        id: '',
        itemizedItems: getBookingItems(booking),
        amount: Number(booking.amount || 0),
        createdByName: String(user?.name || user?.email || 'Admin').trim(),
        bookedByName: String(user?.name || user?.email || 'Admin').trim(),
        source: 'admin-manual'
      });
      return;
    }
    if (!booking.id) {
      return;
    }
    bookingMutation.mutate({ id: booking.id, payload: { ...booking, itemizedItems: getBookingItems(booking), amount: Number(booking.amount || 0) } });
  };

  const openManualBooking = useCallback(() => {
    setBookingModal({
      open: true,
      mode: 'create',
      booking: {
        categoryId: '',
        categoryName: '',
        title: 'Booking Request',
        color: '',
        itemizedItems: [],
        date: toDateKey(new Date()),
        toDate: toDateKey(new Date()),
        startTime: '10:00',
        endTime: '11:00',
        occasionType: '',
        bookingLocation: `${branding.organizationName || 'Gurdwara'}${branding.address ? `, ${branding.address}` : ''}`,
        bookingVenueType: 'gurdwara',
        hidePublicLocation: true,
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        requesterAddress: '',
        dutyAssigneeId: '',
        dutyAssigneeName: '',
        dutyAssigneeEmail: '',
        dutyAssignees: [],
        status: 'confirmed',
        paymentStatus: 'pending',
        paymentMethod: '',
        paymentProvider: '',
        amount: 0,
        receiptNumber: '',
        notes: '',
        source: 'admin-manual'
      }
    });
    setBookingFormError('');
    setBookingCalendarOpen(false);
  }, [branding.address, branding.organizationName]);

  useEffect(() => {
    setHeaderAction(<AdminHeaderActionButton label="Add Bookings" onClick={openManualBooking} />);
    return () => setHeaderAction(null);
  }, [openManualBooking, setHeaderAction]);

  const bookingUsesFullDaySchedule = bookingModal.booking ? isAkhandPathBooking({
    ...bookingModal.booking,
    itemizedItems: getBookingItems(bookingModal.booking)
  }) : false;

  return (
    <div className="flex flex-col gap-6">
      {emailMutation.isPending ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl border border-brand-blue/20 bg-white p-5 text-center shadow-2xl">
            <div className="donation-email-send-loader" aria-hidden="true">
              <span className="donation-email-send-orb donation-email-send-orb-saffron" />
              <span className="donation-email-send-orb donation-email-send-orb-blue" />
              <span className="donation-email-send-orb donation-email-send-orb-gold" />
              <div className="donation-email-send-envelope-wrap">
                <EnvelopeIcon className="h-7 w-7" />
              </div>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">Please wait, sending email...</p>
            <p className="mt-1 text-xs text-slate-600">Generating the booking receipt and delivering it to {emailMutation.variables?.requesterName || 'the requester'}.</p>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-3xl font-semibold text-slate-900">Bookings Management</h2>
          <p className="mt-1 text-sm text-slate-600">Track requests, payment status, schedules, and booking types.</p>
        </div>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['Total bookings', kpis.total, 'text-slate-900'],
            ['Pending', kpis.pending, 'text-amber-700'],
            ['Confirmed', kpis.confirmed, 'text-emerald-700'],
            ['Cancelled', kpis.cancelled, 'text-rose-700'],
            ['Refunded', kpis.refunded, 'text-cyan-700'],
            ['Revenue (CAD)', kpis.revenue.toFixed(2), 'text-slate-900']
          ].map(([label, value, valueClass]) => (
            <article key={label} className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
              <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value}</p>
            </article>
          ))}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold text-slate-700">Bookings Trend (last 12 months)</p>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="bookings" stroke="#1d4ed8" strokeWidth={2} dot={{ r: 3 }} name="Bookings" />
                <Line type="monotone" dataKey="revenue" stroke="#0f766e" strokeWidth={2} dot={{ r: 3 }} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-sm sm:p-5" data-testid="booking-revenue-report">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Booking revenue report</p>
            <h2 className="mt-1 font-heading text-xl font-bold text-slate-900">Export paid bookings</h2>
            <p className="mt-1 text-xs text-slate-600">Revenue uses confirmed bookings with payment received in the selected period. Processed refunds are deducted.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void exportBookingRevenue('pdf')} disabled={!revenueReport.rows.length} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-brand-blue px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"><DocumentArrowDownIcon className="h-4 w-4" /> Download PDF</button>
            <button type="button" onClick={() => void exportBookingRevenue('csv')} disabled={!revenueReport.rows.length} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-emerald-700 bg-white px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"><ArrowDownTrayIcon className="h-4 w-4" /> Download CSV</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(180px,0.7fr)_minmax(190px,0.8fr)_repeat(2,minmax(150px,0.65fr))]">
          <label className="text-xs font-bold text-slate-700">Period<select value={revenuePeriod} onChange={(event) => setRevenuePeriod(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="60">Last 60 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option></select></label>
          <label className="text-xs font-bold text-slate-700">Booking type<select value={revenueCategoryId} onChange={(event) => setRevenueCategoryId(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">All booking types</option>{categories.filter((category) => category.active !== false).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          {revenuePeriod === 'custom' ? <>
            <label className="text-xs font-bold text-slate-700">From date<input type="date" value={revenueFromDate} onChange={(event) => setRevenueFromDate(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-700">To date<input type="date" value={revenueToDate} onChange={(event) => setRevenueToDate(event.target.value)} className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" /></label>
          </> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-white/90 p-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Included bookings</p><p className="mt-0.5 text-sm font-bold text-slate-800">{revenueReport.customDatesValid ? `${revenueReport.rows.length} paid/partial booking${revenueReport.rows.length === 1 ? '' : 's'} · ${revenueReport.startDate} to ${revenueReport.endDate}` : 'Select a valid start and end date to preview the report.'}</p></div>
          <div className="text-right"><p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Net revenue · CAD</p><p className="text-2xl font-black text-emerald-800">${revenueReport.total.toFixed(2)}</p></div>
        </div>
        {revenueExportError ? <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{revenueExportError}</p> : null}
      </section>


      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-heading text-lg font-semibold text-slate-900">Bookings</h2>
          <p className="mt-0.5 text-xs text-slate-500">Live records from the bookings backend resource.</p>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(240px,1fr)_repeat(4,minmax(140px,auto))]">
            <label className="relative">
              <span className="sr-only">Search bookings</span>
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input type="search" value={bookingFilters.search} onChange={(event) => setBookingFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search name, email, phone, ID, receipt..." className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
            </label>
            <select aria-label="Filter by booking status" value={bookingFilters.status} onChange={(event) => setBookingFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select>
            <select aria-label="Filter by payment status" value={bookingFilters.paymentStatus} onChange={(event) => setBookingFilters((current) => ({ ...current, paymentStatus: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All payments</option><option value="pending">Pending</option><option value="paid">Paid</option><option value="partial">Partial</option><option value="refunded">Refunded</option></select>
            <select aria-label="Filter by booking type" value={bookingFilters.categoryId} onChange={(event) => setBookingFilters((current) => ({ ...current, categoryId: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">All booking types</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select aria-label="Sort bookings" value={bookingFilters.sort} onChange={(event) => setBookingFilters((current) => ({ ...current, sort: event.target.value }))} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="newest">Newest requests first</option><option value="oldest">Oldest requests first</option><option value="name-asc">Name A to Z</option><option value="name-desc">Name Z to A</option><option value="booking-latest">Latest booking date</option><option value="booking-earliest">Earliest booking date</option></select>
          </div>
        </div>
        {bookingsError ? <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">Unable to load bookings: {bookingsError.message}</p> : null}
        <div className="overflow-x-hidden">
          <table className="admin-bookings-table min-w-[1020px] w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Payment</th>
                <th className="px-3 py-2">Refund</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookingsLoading ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={9}>Loading bookings…</td></tr> : null}
              {pagedBookings.map((row) => (
                <tr key={row.id} className={`border-t border-slate-200 transition-colors ${bookingModal.booking?.id === row.id ? 'bg-blue-100 ring-1 ring-inset ring-blue-300' : 'hover:bg-slate-50/70'}`} aria-selected={bookingModal.booking?.id === row.id}>
                  <td className="whitespace-nowrap px-3 py-2">{row.date || '-'}{row.toDate && row.toDate !== row.date ? ` to ${row.toDate}` : ''}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{row.requesterName || '-'}</td>
                  <td className="px-3 py-2" title={row.occasionType || getBookingItemsLabel(row)}>{row.occasionType || getBookingItemsLabel(row) || '-'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.startTime || '-'} - {row.endTime || '-'}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => openStatusModal(row)} className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold transition hover:brightness-95 ${statusBadgeClass(row.status)}`} title="Update booking status">{row.status || 'pending'}</button></td>
                  <td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${paymentBadgeClass(row.paymentStatus)}`}>{row.paymentStatus || 'pending'}</span></td>
                  <td className="px-3 py-2">{row.status === 'cancelled' && row.refundStatus ? <button type="button" onClick={() => openRefundModal(row)} className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold transition hover:brightness-95 ${refundBadgeClass(row.refundStatus)}`} title="Update refund status">{row.refundStatus === 'processed' ? 'released' : row.refundStatus}</button> : <span className="text-slate-400">-</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">${Number(row.amount || 0).toFixed(2)}</td>
                  <td className="px-3 py-2"><div className="flex justify-end gap-1.5">
                    <button type="button" onClick={() => { setBookingFormError(''); setBookingModal({ open: true, mode: 'view', booking: { ...row, toDate: row.toDate || row.date } }); }} className={iconButtonClass} title="View booking" aria-label="View booking"><EyeIcon className="h-4 w-4" /></button>
                    <button type="button" onClick={() => { setBookingFormError(''); setBookingModal({ open: true, mode: 'edit', booking: { ...row, toDate: row.toDate || row.date } }); }} className={iconButtonClass} title="Edit booking" aria-label="Edit booking"><PencilSquareIcon className="h-4 w-4" /></button>
                    <button type="button" onClick={() => openStatusModal(row)} className={iconButtonClass} title="Update status" aria-label="Update booking status"><ArrowsRightLeftIcon className="h-4 w-4" /></button>
                    {row.status === 'cancelled' && (row.refundStatus || ['paid', 'partial', 'refunded'].includes(String(row.paymentStatus || '').toLowerCase())) ? <button type="button" onClick={() => openRefundModal(row)} className={`${iconButtonClass} text-emerald-700`} title="Update refund status" aria-label="Update refund status"><ArrowUturnLeftIcon className="h-4 w-4" /></button> : null}
                    <button type="button" onClick={() => bookingService.downloadInvoice(row, branding.address)} className={iconButtonClass} title="Download invoice" aria-label="Download invoice"><ArrowDownTrayIcon className="h-4 w-4" /></button>
                    <button type="button" onClick={() => emailMutation.mutate(row)} disabled={emailMutation.isPending} className={iconButtonClass} title="Email receipt" aria-label="Email receipt"><EnvelopeIcon className="h-4 w-4" /></button>
                    <button type="button" onClick={() => window.confirm('Delete this booking?') && deleteMutation.mutate(row.id)} className={`${iconButtonClass} text-rose-600`} title="Delete booking" aria-label="Delete booking"><TrashIcon className="h-4 w-4" /></button>
                  </div></td>
                </tr>
              ))}
              {!bookingsLoading && !bookingsError && pagedBookings.length === 0 ? <tr><td className="px-3 py-8 text-center text-slate-500" colSpan={9}>No bookings found yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
          <p className="text-xs text-slate-500">Page {Math.min(currentPage, totalPages)} of {totalPages} · {filteredBookings.length} of {bookings.length} bookings</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1} className={iconButtonClass} aria-label="Previous page" title="Previous page"><ChevronLeftIcon className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} className={iconButtonClass} aria-label="Next page" title="Next page"><ChevronRightIcon className="h-4 w-4" /></button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Booking Page Settings</h2>
            <p className="mt-1 text-sm text-slate-600">Edit public guidelines and configure the payment provider used by every paid booking type.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={openPaymentModal} className="inline-flex items-center gap-2 rounded-lg border border-brand-blue px-4 py-2 text-sm font-semibold text-brand-blue hover:bg-blue-50"><CreditCardIcon className="h-4 w-4" /> Payment Setup</button>
            <button type="button" onClick={() => settingsMutation.mutate(guidelinesDraft)} disabled={settingsMutation.isPending} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{settingsMutation.isPending ? 'Saving...' : 'Save Guidelines'}</button>
          </div>
        </div>
        <div className="mt-4">
          <RichTextEditor value={guidelinesDraft.guidelines || ''} onChange={(guidelines) => setGuidelinesDraft((current) => ({ ...current, guidelines }))} minHeight={150} />
        </div>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <span><span className="block text-sm font-semibold text-slate-800">Website booking requests</span><span className="block text-xs text-slate-500">Show the Create Booking Request button on the public bookings page.</span></span>
          <input type="checkbox" checked={guidelinesDraft.showCreateBookingButton !== false} onChange={(event) => setGuidelinesDraft((current) => ({ ...current, showCreateBookingButton: event.target.checked }))} className="h-5 w-5 shrink-0 accent-brand-blue" />
        </label>
        <p className="mt-3 text-sm text-slate-600">Payment provider: <strong>{selectedCampaign?.paymentProvider || 'Not configured'}</strong></p>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Booking Types and Payments</h2>
            <p className="mt-0.5 text-xs text-slate-500">All paid types use the booking provider configured in Payment Setup.</p>
          </div>
          <button type="button" onClick={() => openCategoryModal('add')} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white"><PlusIcon className="h-4 w-4" /> Add Type</button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead><tr className="bg-slate-50 text-xs uppercase text-slate-500"><th className="px-3 py-2">Type</th><th className="px-3 py-2">Fee</th><th className="px-3 py-2">Payment</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th></tr></thead>
            <tbody>{sortBookingCategories(categories).map((category, index) => (
              <tr key={category.id} className="border-t border-slate-200">
                <td className="px-3 py-2 font-semibold text-slate-900"><span className="mr-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-50 px-1.5 text-xs font-bold text-brand-blue">{index + 1}</span>{category.name}</td>
                <td className="px-3 py-2">${Number(category.feeAmount || 0).toFixed(2)}</td>
                <td className="px-3 py-2">{category.paymentRequired ? 'Required' : 'Not required'}</td>
                <td className="px-3 py-2">{category.active ? 'Active' : 'Inactive'}</td>
                <td className="px-3 py-2"><div className="flex justify-end gap-1.5"><label className="sr-only" htmlFor={`booking-type-order-${category.id}`}>Display order for {category.name}</label><select id={`booking-type-order-${category.id}`} aria-label={`Display order for ${category.name}`} value={index + 1} onChange={(event) => changeCategoryOrder(category.id, event.target.value)} disabled={categoriesMutation.isPending} className="h-8 w-14 rounded-md border border-slate-300 bg-white px-1 text-xs font-semibold text-slate-700"><option value={index + 1}>{index + 1}</option>{categories.map((_, orderIndex) => <option key={orderIndex + 1} value={orderIndex + 1}>{orderIndex + 1}</option>)}</select><button type="button" onClick={() => openCategoryModal('view', category)} className={iconButtonClass} title="View type" aria-label="View type"><EyeIcon className="h-4 w-4" /></button><button type="button" onClick={() => openCategoryModal('edit', category)} className={iconButtonClass} title="Edit type" aria-label="Edit type"><PencilSquareIcon className="h-4 w-4" /></button><button type="button" onClick={() => removeCategory(category)} className={`${iconButtonClass} text-rose-600`} title="Delete type" aria-label="Delete type"><TrashIcon className="h-4 w-4" /></button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {bookingModal.open && bookingModal.booking ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-x-hidden bg-slate-950/65 p-3 sm:p-4" onClick={() => setBookingModal({ open: false, mode: 'view', booking: null })}>
          <form className="max-h-[calc(100vh-1.5rem)] w-full max-w-5xl overflow-x-hidden overflow-y-auto rounded-lg bg-slate-50 shadow-2xl sm:max-h-[calc(100vh-2rem)]" onSubmit={saveBooking} onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-blue-200 bg-gradient-to-r from-blue-50 via-white to-amber-50 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3"><span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white"><CalendarDaysIcon className="h-5 w-5" /></span><div><p className="text-xs font-semibold uppercase text-brand-blue">Booking Record</p><h3 className="font-heading text-xl font-semibold text-slate-900">{bookingModal.mode === 'create' ? 'Manual' : bookingModal.mode === 'edit' ? 'Edit' : 'View'} Booking</h3></div></div>
              <button type="button" onClick={() => setBookingModal({ open: false, mode: 'view', booking: null })} className={iconButtonClass} aria-label="Close booking"><XMarkIcon className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
              {bookingFormError ? <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{bookingFormError}</div> : null}
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div className="flex items-center gap-2"><CalendarDaysIcon className="h-5 w-5 text-brand-blue" /><h4 className="font-heading text-lg font-bold text-slate-900">Programme Details</h4></div>
                  <div className="relative ml-auto">
                    <button type="button" onClick={() => setBookingCalendarOpen((open) => !open)} className="inline-flex items-center gap-2 rounded-full border border-brand-blue bg-brand-blue px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-800" aria-expanded={bookingCalendarOpen}>
                      <CalendarDaysIcon className="h-4 w-4" /> Booking Calendar
                    </button>
                    {bookingCalendarOpen ? (
                      <div className="fixed inset-x-3 top-24 z-30 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-xl border border-blue-200 bg-white p-3 shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[390px]">
                        <div className="mb-2 flex items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-900">Availability</p><p className="text-xs text-slate-600">Highlighted dates contain bookings or events. Select a date or range.</p></div><button type="button" onClick={() => setBookingCalendarOpen(false)} className={iconButtonClass} aria-label="Close booking calendar"><XMarkIcon className="h-4 w-4" /></button></div>
                        <Calendar className="booking-admin-calendar" selectRange value={[toCalendarDate(bookingModal.booking.date), toCalendarDate(bookingModal.booking.toDate || bookingModal.booking.date)]} onChange={(value) => { if (bookingModal.mode === 'view' || !Array.isArray(value)) return; updateBookingDraft('date', toDateKey(value[0])); updateBookingDraft('toDate', toDateKey(value[1] || value[0])); }} tileClassName={({ date, view }) => { if (view !== 'month') return ''; const kinds = occupiedDates.get(toDateKey(date)); return kinds ? `booking-admin-calendar-occupied ${kinds.has('booking') ? 'booking-admin-calendar-booked' : ''} ${kinds.has('event') ? 'booking-admin-calendar-event' : ''}` : ''; }} tileContent={({ date, view }) => { const kinds = view === 'month' ? occupiedDates.get(toDateKey(date)) : null; return kinds ? <span className="booking-admin-calendar-markers" aria-hidden="true">{kinds.has('booking') ? <span className="bg-brand-blue" /> : null}{kinds.has('event') ? <span className="bg-brand-saffron" /> : null}</span> : null; }} />
                        <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700">Selected: {bookingModal.booking.date || 'Choose a date'}{bookingModal.booking.toDate && bookingModal.booking.toDate !== bookingModal.booking.date ? ` to ${bookingModal.booking.toDate}` : ' (single day)'}</p>
                        <div className="mt-2 space-y-1.5">{(occupiedEntriesByDate.get(bookingModal.booking.date) || []).map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-2.5 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-semibold text-slate-800">{entry.title}</span>{entry.location ? <span className="block text-[10px] font-medium text-slate-500">{entry.location}</span> : null}</span><span className="shrink-0 text-slate-600">{entry.startTime || 'Time TBD'}{entry.endTime ? ` - ${entry.endTime}` : ''}</span></div>)}{(occupiedEntriesByDate.get(bookingModal.booking.date) || []).length === 0 ? <p className="rounded-md bg-emerald-50 px-2.5 py-2 text-xs font-semibold text-emerald-700">No booking or event occupies this date.</p> : <p className="text-xs text-slate-500">Other non-overlapping times on this date can still be booked.</p>}</div>
                        <div className="flex flex-wrap gap-3 pt-2 text-xs font-semibold text-slate-600"><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-blue" />Booking</span><span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-saffron" />Event</span></div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid min-w-0 grid-cols-2 content-start gap-3 sm:grid-cols-4">
                    <label className="text-sm font-semibold text-slate-700 col-span-2 min-w-0 sm:col-span-4">Booking occasion<input disabled={bookingModal.mode === 'view'} value={bookingModal.booking.occasionType || ''} onChange={(event) => updateBookingDraft('occasionType', event.target.value)} placeholder="For example: Wedding, memorial" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
                    {[
                      ['date', 'From Date', 'date'],
                      ['toDate', 'To Date', 'date'],
                      ['startTime', 'Start Time', 'time'],
                      ['endTime', 'End Time', 'time']
                    ].filter(([field]) => !(bookingUsesFullDaySchedule && ['startTime', 'endTime'].includes(field))).map(([field, label, type]) => (
                      <label key={field} className="min-w-0 text-sm font-semibold text-slate-700">{label} <span className="text-rose-600">*</span>{type === 'time' ? <select required disabled={bookingModal.mode === 'view'} value={bookingModal.booking[field] || ''} onChange={(event) => updateBookingDraft(field, event.target.value)} className="mt-1 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100"><option value="">Select time</option>{BOOKING_TIME_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}</select> : <input required type={type} disabled={bookingModal.mode === 'view'} value={bookingModal.booking[field] || ''} min={field === 'toDate' ? bookingModal.booking.date || undefined : undefined} onChange={(event) => updateBookingDraft(field, event.target.value)} className="mt-1 block w-full min-w-0 max-w-full appearance-none rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />}</label>
                    ))}
                    {bookingUsesFullDaySchedule ? <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800 col-span-2 sm:col-span-4">Akhand Path is scheduled for the full selected date range; time fields are not applicable.</p> : null}
                </div>
              </section>
              <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.25fr_0.75fr]">
              <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-3"><h4 className="font-heading text-lg font-bold text-slate-900">Booking items</h4><p className="mt-0.5 text-xs text-slate-500">Choose services and assign a performer to each.</p></div>
                {bookingModal.mode !== 'view' ? <div className="divide-y divide-slate-100 px-3">{sortBookingCategories(categories.filter((category) => category.active !== false)).map((category) => {
                  const selected = getBookingItems(bookingModal.booking).some((item) => String(item.categoryId) === String(category.id));
                  const selectedItem = getBookingItems(bookingModal.booking).find((item) => String(item.categoryId) === String(category.id));
                  const dutyAssignment = getDutyAssignmentsForBooking(bookingModal.booking).find((assignment) => String(assignment.bookingItemCategoryId) === String(category.id));
                  return <div key={category.id} className={`-mx-3 flex min-h-14 items-start gap-2 border-l-4 px-3 py-2 transition-colors ${selected ? 'border-brand-blue bg-blue-50 text-slate-950' : 'border-transparent text-slate-600 hover:bg-slate-50'}`}>
                    <input type="checkbox" aria-label={`Select ${category.name}`} checked={selected} onChange={(event) => {
                      const currentItems = getBookingItems(bookingModal.booking);
                      updateBookingItems(event.target.checked
                        ? [...currentItems, { categoryId: category.id, name: category.name, description: category.description || '', amount: Number(category.feeAmount || 0) }]
                        : currentItems.filter((item) => String(item.categoryId) !== String(category.id)));
                    }} className="mt-1 h-4 w-4 shrink-0 accent-brand-blue" />
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold leading-tight">{selectedItem?.name || category.name}</span>{selected ? <span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs leading-tight"><span className={`italic ${dutyAssignment?.name ? 'font-normal text-violet-700' : 'font-medium text-amber-700'}`}>{dutyAssignment?.name ? `by ${dutyAssignment.name}` : 'Performer not assigned'}</span><button type="button" onClick={() => openDutyAssignmentsModal(bookingModal.booking)} className="ml-1 rounded px-1 font-semibold text-brand-blue underline decoration-dotted underline-offset-2 hover:bg-blue-100">Change</button></span> : category.description ? <span className="block truncate text-xs text-slate-500">{category.description}</span> : null}</span>
                    <span className="shrink-0 text-sm font-semibold">${Number(selectedItem?.amount ?? category.feeAmount ?? 0).toFixed(2)}</span>
                  </div>;
                })}</div> : <div className="divide-y divide-slate-100 px-4">{getReceiptDisplayItems(bookingModal.booking).map((item, index) => {
                  const assignment = getDutyAssignmentsForBooking(bookingModal.booking).find((entry) => String(entry.bookingItemCategoryId) === String(item.categoryId));
                  return <div key={`${item.categoryId}-${index}`} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{item.name}</span>{assignment?.name ? <span className="mt-0.5 block text-xs italic text-violet-700">by {assignment.name}</span> : null}</span><span className="shrink-0 text-xs font-semibold text-slate-700">${Number(item.amount || 0).toFixed(2)}</span></div>;
                })}{!getBookingItems(bookingModal.booking).length ? <p className="py-3 text-xs text-slate-500">No booking items were recorded.</p> : null}</div>}
                {bookingModal.mode !== 'view' && !getBookingItems(bookingModal.booking).length ? <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">Select at least one service.</p> : null}
              </section>
              <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-brand-blue">Booker information</p><h4 className="mt-1 font-heading text-base font-bold text-slate-900">Contact details</h4><p className="mt-1 text-[11px] sm:whitespace-nowrap leading-tight text-slate-500">Who should we contact about this booking?</p></div><span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">Required</span></div>
                <div className="mt-4 grid gap-3">
                  {[
                    ['requesterName', 'Name', 'text'],
                    ['requesterEmail', 'Email (optional)', 'email'],
                    ['requesterPhone', 'Phone (optional)', 'text']
                  ].map(([field, label, type]) => (
                    <label key={field} className="text-sm font-semibold text-slate-700">{label}<input type={type} disabled={bookingModal.mode === 'view'} value={bookingModal.booking[field] || ''} onChange={(event) => updateBookingDraft(field, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
                  ))}
                  <label className="text-sm font-semibold text-slate-700">Address (leave blank if at the Gurdwara)<input type="text" disabled={bookingModal.mode === 'view'} value={bookingModal.booking.requesterAddress || ''} onChange={(event) => updateRequesterAddress(event.target.value)} placeholder="Residence address" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"><input type="checkbox" disabled={bookingModal.mode === 'view'} checked={bookingModal.booking.hidePublicLocation !== false} onChange={(event) => updateBookingDraft('hidePublicLocation', event.target.checked)} className="h-4 w-4 accent-brand-blue" />Keep exact venue details private on public calendars</label>
                </div>
              </section>

              <section className="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-4 shadow-sm sm:p-5 lg:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-emerald-100 pb-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Receipt summary</p><h4 className="mt-1 font-heading text-lg font-bold text-slate-900">Payment</h4><p className="mt-1 text-xs text-slate-500">Payment fields are based on the selected receipt items.</p></div><div className="ml-auto flex items-start gap-2"><label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Receipt number<input aria-label="Receipt number" disabled={bookingModal.mode === 'view'} value={bookingModal.booking.receiptNumber || ''} onChange={(event) => updateBookingDraft('receiptNumber', event.target.value)} className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700 disabled:bg-slate-100" /></label>{Number(bookingModal.booking.amount || 0) > 0 ? <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Payment status<select aria-label="Payment status" disabled={bookingModal.mode === 'view'} value={bookingModal.booking.paymentStatus || 'pending'} onChange={(event) => updateBookingDraft('paymentStatus', event.target.value)} className="mt-1 block w-36 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-slate-700 disabled:bg-slate-100"><option value="pending">Unpaid</option><option value="paid">Paid in full</option><option value="partial">Partially paid</option><option value="refunded">Refunded</option></select></label> : null}</div></div>
                <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-3"><div className="space-y-2.5">{getReceiptDisplayItems(bookingModal.booking).map((item, index) => { const assignment = getDutyAssignmentsForBooking(bookingModal.booking).find((entry) => String(entry.bookingItemCategoryId) === String(item.categoryId)); return <div key={`${item.categoryId}-${index}`}><div className="flex items-start justify-between gap-3"><span className="min-w-0 text-sm font-semibold text-slate-800">{item.name}{assignment?.name ? <span className="mt-0.5 block text-xs font-normal italic text-violet-700">by {assignment.name}</span> : null}</span><span className="shrink-0 text-sm font-bold text-slate-800">${Number(item.amount || 0).toFixed(2)}</span></div><div className="mt-1.5 w-full border-b border-dotted border-slate-300" /></div>; })}{!getBookingItems(bookingModal.booking).length ? <p className="text-xs text-slate-500">Select booking items to calculate payment.</p> : null}</div><div className="mt-3 flex items-center justify-between pt-1"><span className="text-sm font-bold text-slate-800">Amount due · CAD</span><strong className="text-xl font-black text-emerald-800">${Number(bookingModal.booking.amount || 0).toFixed(2)}</strong></div></div>
                {Number(bookingModal.booking.amount || 0) > 0 ? <div className="mt-3 grid gap-3">
                  {bookingModal.booking.paymentStatus === 'partial' ? <label className="text-sm font-semibold text-slate-700">Amount received (CAD)<input type="number" min="0.01" max={Number(bookingModal.booking.amount || 0)} step="0.01" disabled={bookingModal.mode === 'view'} value={bookingModal.booking.amountPaid ?? ''} onChange={(event) => updateBookingDraft('amountPaid', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label> : null}
                </div> : null}
              </section>
              </div>
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <h4 className="border-b border-slate-200 pb-3 font-heading text-base font-semibold text-slate-900">Additional Notes</h4>
                <label className="mt-3 block text-sm font-semibold text-slate-700">Notes<textarea disabled={bookingModal.mode === 'view'} value={bookingModal.booking.notes || ''} onChange={(event) => updateBookingDraft('notes', event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
              </section>
            </div>
            {bookingModal.mode !== 'view' ? <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white px-4 py-4 sm:px-6"><button type="button" onClick={() => setBookingModal({ open: false, mode: 'view', booking: null })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={bookingMutation.isPending || createBookingMutation.isPending} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{bookingMutation.isPending || createBookingMutation.isPending ? 'Saving…' : bookingModal.mode === 'create' ? 'Create Booking' : 'Save Booking'}</button></div> : null}
          </form>
        </div>
      ) : null}

      {dutyAssignmentsModal.open ? (
        <div className="fixed inset-0 z-[165] flex items-center justify-center bg-slate-950/60 p-3" onClick={() => setDutyAssignmentsModal({ open: false, assignments: [] })}>
          <section role="dialog" aria-modal="true" aria-labelledby="booking-duty-assignments-title" className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-wider text-brand-blue">Booking team</p><h3 id="booking-duty-assignments-title" className="font-heading text-lg font-semibold text-slate-900">Assign performers</h3></div><button type="button" onClick={() => setDutyAssignmentsModal({ open: false, assignments: [] })} className={iconButtonClass} aria-label="Close performer assignment"><XMarkIcon className="h-4 w-4" /></button></div>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto p-4">
              {dutyAssignmentsModal.assignments.map((assignment, index) => <label key={`${assignment.bookingItemCategoryId}-${index}`} className="block rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-600">
                {assignment.dutyType || `Booking item ${index + 1}`}
                <select value={assignment.userId || ''} onChange={(event) => updateDutyAssignmentSelection(index, event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"><option value="">Choose performer</option>{assignment.userId && !dutyAssignees.some((entry) => String(entry.id) === String(assignment.userId)) ? <option value={assignment.userId}>{assignment.name || 'Previously assigned user'}</option> : null}{dutyAssignees.map((entry) => <option key={entry.id} value={entry.id}>{entry.name || entry.email}{entry.role ? ` (${entry.role})` : ''}</option>)}</select>
              </label>)}
              {!dutyAssignmentsModal.assignments.length ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Select booking items first; each item gets one performer.</p> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3"><button type="button" onClick={() => setDutyAssignmentsModal({ open: false, assignments: [] })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">Cancel</button><button type="button" onClick={saveDutyAssignments} disabled={dutyAssignmentsModal.assignments.some((entry) => !String(entry.userId || '').trim())} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Save performers</button></div>
          </section>
        </div>
      ) : null}

      {statusModal.open && statusModal.booking ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/65 p-4" onClick={() => setStatusModal({ open: false, booking: null, status: 'pending' })}>
          <form className="w-full max-w-sm rounded-lg bg-white shadow-2xl" onSubmit={saveStatus} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold uppercase text-brand-blue">Status Action</p><h3 className="font-heading text-xl font-semibold text-slate-900">Update Booking Status</h3></div><button type="button" onClick={() => setStatusModal({ open: false, booking: null, status: 'pending' })} className={iconButtonClass} aria-label="Close status action"><XMarkIcon className="h-4 w-4" /></button></div>
            <div className="p-5"><label className="text-sm font-semibold text-slate-700">Status<select autoFocus value={statusModal.status} onChange={(event) => setStatusModal((current) => ({ ...current, status: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="cancelled">Cancelled</option></select></label></div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setStatusModal({ open: false, booking: null, status: 'pending' })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Close</button><button type="submit" disabled={bookingMutation.isPending} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{bookingMutation.isPending ? 'Saving…' : 'Update Status'}</button></div>
          </form>
        </div>
      ) : null}

      {refundModal.open && refundModal.booking ? (
        <div className="fixed inset-0 z-[155] flex items-center justify-center bg-slate-950/65 p-4" onClick={() => setRefundModal((current) => ({ ...current, open: false }))}>
          <form className="max-h-[calc(100vh-2rem)] w-full max-w-xl overflow-y-auto rounded-lg bg-white shadow-2xl" onSubmit={saveCancellationRefund} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold uppercase text-rose-700">{refundModal.booking.status === 'cancelled' ? 'Cancelled Booking' : 'Cancellation'}</p><h3 className="font-heading text-xl font-semibold text-slate-900">{refundModal.booking.status === 'cancelled' ? 'Update Refund Status' : 'Record Refund Details'}</h3></div><button type="button" onClick={() => setRefundModal((current) => ({ ...current, open: false }))} className={iconButtonClass} aria-label="Close refund details"><XMarkIcon className="h-4 w-4" /></button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:col-span-2">Complete the refund with the payment provider, then mark it Released. The member will receive a separate refund-release email with an updated PDF attachment.</p>
              <label className="text-sm font-semibold text-slate-700">Refund Status<select value={refundModal.refundStatus} onChange={(event) => setRefundModal((current) => ({ ...current, refundStatus: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="pending">Pending</option><option value="processed">Refunded / Released</option></select></label>
              <label className="text-sm font-semibold text-slate-700">Refund Amount (CAD)<input required type="number" min="0.01" max={Number(refundModal.booking.amount || 0) || undefined} step="0.01" value={refundModal.refundAmount} onChange={(event) => setRefundModal((current) => ({ ...current, refundAmount: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold text-slate-700">Refund Method<select value={refundModal.refundMethod} onChange={(event) => setRefundModal((current) => ({ ...current, refundMethod: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="original-payment-method">Original payment method</option><option value="cash">Cash</option><option value="credit-card">Credit Card</option><option value="interac">Interac</option><option value="cheque">Cheque</option><option value="other">Other</option></select></label>
              <label className="text-sm font-semibold text-slate-700">Refund Date<input type="date" required={refundModal.refundStatus === 'processed'} value={refundModal.refundDate} onChange={(event) => setRefundModal((current) => ({ ...current, refundDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Refund Reference{refundModal.refundStatus === 'processed' ? ' (required)' : ''}<input required={refundModal.refundStatus === 'processed'} value={refundModal.refundReference} onChange={(event) => setRefundModal((current) => ({ ...current, refundReference: event.target.value }))} placeholder="Provider refund ID or transaction reference" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Refund Notes<textarea rows={3} value={refundModal.refundNotes} onChange={(event) => setRefundModal((current) => ({ ...current, refundNotes: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setRefundModal((current) => ({ ...current, open: false }))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Back</button><button type="submit" disabled={bookingMutation.isPending} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{bookingMutation.isPending ? 'Saving…' : refundModal.booking.status === 'cancelled' ? 'Save Refund Status' : 'Cancel & Save Refund'}</button></div>
          </form>
        </div>
      ) : null}

      {guidelinesConfirmationOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 p-4" onClick={() => setGuidelinesConfirmationOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="guidelines-saved-title" className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-600" />
            <h3 id="guidelines-saved-title" className="mt-3 font-heading text-xl font-semibold text-slate-900">Guidelines Updated</h3>
            <p className="mt-2 text-sm text-slate-600">The booking guidelines have been updated successfully.</p>
            <button type="button" autoFocus onClick={() => setGuidelinesConfirmationOpen(false)} className="mt-5 rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white">Done</button>
          </div>
        </div>
      ) : null}

      {categoryModal.open ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/65 p-4" onClick={() => setCategoryModal((current) => ({ ...current, open: false }))}>
          <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h3 className="font-heading text-lg font-semibold text-slate-900">{categoryModal.mode === 'add' ? 'Add' : categoryModal.mode === 'edit' ? 'Edit' : 'View'} Booking Type</h3><button type="button" onClick={() => setCategoryModal((current) => ({ ...current, open: false }))} className={iconButtonClass} aria-label="Close booking type"><XMarkIcon className="h-4 w-4" /></button></div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Name<input disabled={categoryModal.mode === 'view'} value={categoryModal.category.name || ''} onChange={(event) => setCategoryModal((current) => ({ ...current, category: { ...current.category, name: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
              <label className="text-sm font-semibold text-slate-700">Fee (CAD)<input disabled={categoryModal.mode === 'view'} type="number" min="0" step="0.01" value={categoryModal.category.feeAmount || 0} onChange={(event) => setCategoryModal((current) => ({ ...current, category: { ...current.category, feeAmount: event.target.value } }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" /></label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input disabled={categoryModal.mode === 'view'} type="checkbox" checked={categoryModal.category.paymentRequired === true} onChange={(event) => setCategoryModal((current) => ({ ...current, category: { ...current.category, paymentRequired: event.target.checked } }))} /> Payment required</label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700"><input disabled={categoryModal.mode === 'view'} type="checkbox" checked={categoryModal.category.active !== false} onChange={(event) => setCategoryModal((current) => ({ ...current, category: { ...current.category, active: event.target.checked } }))} /> Active</label>
            </div>
            {categoryModal.mode !== 'view' ? <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3"><button type="button" onClick={() => setCategoryModal((current) => ({ ...current, open: false }))} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button type="button" onClick={saveCategory} disabled={categoriesMutation.isPending || !String(categoryModal.category.name || '').trim()} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{categoriesMutation.isPending ? 'Saving…' : 'Save Type'}</button></div> : null}
          </div>
        </div>
      ) : null}

      {paymentModalOpen ? (
        <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/65 p-4" onClick={() => setPaymentModalOpen(false)}>
          <form className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl" onSubmit={(event) => { event.preventDefault(); paymentMutation.mutate(paymentDraft); }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h3 className="font-heading text-xl font-semibold text-slate-900">Booking Payment Setup</h3><p className="mt-1 text-sm text-slate-600">One provider is used for every paid booking type.</p></div><button type="button" onClick={() => setPaymentModalOpen(false)} className={iconButtonClass} aria-label="Close payment setup"><XMarkIcon className="h-4 w-4" /></button></div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              {paymentError ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2">{paymentError}</p> : null}
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Payment Provider<select value={paymentDraft.paymentProvider} onChange={(event) => setPaymentDraft((current) => ({ ...current, paymentProvider: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="STRIPE">Stripe</option><option value="ZEFFY">Zeffy</option></select></label>
              <label className="text-sm font-semibold text-slate-700 sm:col-span-2">{paymentDraft.paymentProvider === 'ZEFFY' ? 'Zeffy Form Link' : 'Stripe Checkout Link (optional)'}<input type="url" required={paymentDraft.paymentProvider === 'ZEFFY'} value={paymentDraft.paymentLink} onChange={(event) => setPaymentDraft((current) => ({ ...current, paymentLink: event.target.value }))} placeholder={paymentDraft.paymentProvider === 'ZEFFY' ? 'https://www.zeffy.com/en-CA/donation-form/...' : 'https://...'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              {paymentDraft.paymentProvider === 'STRIPE' ? <><label className="text-sm font-semibold text-slate-700">Stripe Buy Button ID (optional)<input value={paymentDraft.stripeBuyButtonId} onChange={(event) => setPaymentDraft((current) => ({ ...current, stripeBuyButtonId: event.target.value }))} placeholder="buy_btn_..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label><label className="text-sm font-semibold text-slate-700">Stripe Publishable Key (optional)<input value={paymentDraft.stripePublishableKey} onChange={(event) => setPaymentDraft((current) => ({ ...current, stripePublishableKey: event.target.value }))} placeholder="pk_test_... or pk_live_..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label></> : null}
              {paymentDraft.paymentProvider === 'ZEFFY' ? <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Zeffy API Key {selectedCampaign?.hasZeffyApiKey ? <span className="ml-2 text-xs text-emerald-700">Configured</span> : null}<input type="password" autoComplete="new-password" required={!selectedCampaign?.hasZeffyApiKey} value={paymentDraft.zeffyApiKey} onChange={(event) => setPaymentDraft((current) => ({ ...current, zeffyApiKey: event.target.value }))} placeholder={selectedCampaign?.hasZeffyApiKey ? 'Leave blank to keep the saved key' : ''} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" onClick={() => setPaymentModalOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Cancel</button><button type="submit" disabled={paymentMutation.isPending} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{paymentMutation.isPending ? 'Saving…' : 'Save Payment Setup'}</button></div>
          </form>
        </div>
      ) : null}
    </div>
  );
};

export default AdminBookingsPage;