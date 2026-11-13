import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  EnvelopeIcon,
  EyeIcon,
  FunnelIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MapPinIcon,
  PhoneIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import Card from '../../components/ui/Card';
import { useAuth } from '../../context/AuthContext';
import bookingService from '../../services/bookingService';
import contentApiService from '../../services/contentApiService';

const ROLE_RESOURCE = 'admin_roles';
const DUTY_PAGE_PATH = '/admin/booking-duties';
const FULL_ACCESS_ROLES = new Set(['admin', 'super admin']);
const DUTIES_PAGE_SIZE = 10;

const toDateKey = (value) => {
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const date = value instanceof Date ? value : new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const eachDateKey = (startValue, endValue = startValue) => {
  const start = new Date(`${toDateKey(startValue)}T12:00:00`);
  const end = new Date(`${toDateKey(endValue || startValue)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const keys = [];
  const cursor = new Date(start);
  while (cursor <= end && keys.length < 3660) {
    keys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys;
};

const dateLabel = (booking) => booking.toDate && booking.toDate !== booking.date
  ? `${booking.date} to ${booking.toDate}`
  : booking.date;
const getDutyAssignments = (booking = {}) => Array.isArray(booking.dutyAssignees) && booking.dutyAssignees.length
  ? booking.dutyAssignees
  : booking.dutyAssigneeId ? [{ userId: booking.dutyAssigneeId, name: booking.dutyAssigneeName, email: booking.dutyAssigneeEmail, dutyType: '' }] : [];
const getDutyAssignmentLabels = (booking = {}) => getDutyAssignments(booking).map((entry) => (
  `${entry.name || entry.email || 'Assigned'}${entry.dutyType ? ` — ${entry.dutyType}` : ''}`
));
const getDutyBookingLabel = (booking = {}) => {
  const itemNames = (Array.isArray(booking.itemizedItems) ? booking.itemizedItems : [])
    .map((item) => String(item?.name || '').trim())
    .filter(Boolean);
  return [...new Set(itemNames)].join(', ') || String(booking.categoryName || booking.title || 'Booking').trim();
};

const AdminBookingDutiesPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = FULL_ACCESS_ROLES.has(String(user?.role || '').trim().toLowerCase());
  const [view, setView] = useState('list');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date()));
  const [emailSuccessModal, setEmailSuccessModal] = useState(null);
  const [emailError, setEmailError] = useState('');
  const [filters, setFilters] = useState({ search: '', assigneeId: '', fromDate: '', toDate: '', programme: '', sort: 'date-asc' });
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings', 'duties'],
    queryFn: () => bookingService.getBookings().then((response) => response.data)
  });
  const { data: roleDefinitions = [] } = useQuery({
    queryKey: ['admin-role-definitions'],
    queryFn: () => contentApiService.getSingleton(ROLE_RESOURCE, []),
    enabled: canManage
  });
  const { data: users = [] } = useQuery({
    queryKey: ['admin-users', 'booking-duties'],
    queryFn: () => contentApiService.list('users'),
    enabled: canManage
  });

  const dutyRoles = useMemo(() => new Set((Array.isArray(roleDefinitions) ? roleDefinitions : [])
    .filter((entry) => Array.isArray(entry?.adminPageAccess) && entry.adminPageAccess.includes(DUTY_PAGE_PATH))
    .map((entry) => String(entry?.name || '').trim().toLowerCase())
    .filter(Boolean)), [roleDefinitions]);
  const recipients = useMemo(() => users.filter((entry) => (
    !FULL_ACCESS_ROLES.has(String(entry.role || '').trim().toLowerCase())
    && (dutyRoles.has(String(entry.role || '').trim().toLowerCase()) || (Array.isArray(entry.adminPageAccess) && entry.adminPageAccess.includes(DUTY_PAGE_PATH)))
    && entry.isActive !== false
    && String(entry.approvalStatus || 'approved').toLowerCase() === 'approved'
    && String(entry.email || '').trim()
  )), [dutyRoles, users]);
  const allConfirmedBookings = useMemo(() => {
    const userId = String(user?.id || '').trim();
    const userEmail = String(user?.email || '').trim().toLowerCase();
    return bookings.filter((booking) => {
      if (String(booking.status || '').toLowerCase() !== 'confirmed') return false;
      if (canManage) return true;
      return getDutyAssignments(booking).some((assignee) => (
        (userId && String(assignee.userId || '').trim() === userId)
        || (userEmail && String(assignee.email || '').trim().toLowerCase() === userEmail)
      ));
    });
  }, [bookings, canManage, user?.email, user?.id]);
  const assigneeOptions = useMemo(() => {
    const options = new Map();
    allConfirmedBookings.forEach((booking) => {
      getDutyAssignments(booking).forEach((assignee) => {
        const id = String(assignee.userId || '').trim();
        if (id) options.set(id, assignee.name || assignee.email || 'Assigned user');
      });
    });
    return [...options.entries()].map(([id, name]) => ({ id, name })).sort((first, second) => first.name.localeCompare(second.name));
  }, [allConfirmedBookings]);
  const programmeOptions = useMemo(() => [...new Set(allConfirmedBookings
    .map((booking) => String(booking.occasionType || getDutyBookingLabel(booking)).trim())
    .filter(Boolean))].sort((first, second) => first.localeCompare(second)), [allConfirmedBookings]);
  const confirmedBookings = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return allConfirmedBookings.filter((booking) => {
      const bookingStart = String(booking.date || '');
      const bookingEnd = String(booking.toDate || booking.date || '');
      if (filters.assigneeId && !getDutyAssignments(booking).some((assignee) => String(assignee.userId || '') === filters.assigneeId)) return false;
      if (filters.fromDate && bookingEnd < filters.fromDate) return false;
      if (filters.toDate && bookingStart > filters.toDate) return false;
      if (filters.programme && String(booking.occasionType || getDutyBookingLabel(booking)) !== filters.programme) return false;
      if (!search) return true;
      return [booking.occasionType, getDutyBookingLabel(booking), booking.requesterName, booking.requesterEmail, booking.requesterPhone, booking.bookingLocation, ...getDutyAssignmentLabels(booking)]
        .some((value) => String(value || '').toLowerCase().includes(search));
    }).sort((first, second) => {
      if (filters.sort === 'date-desc') return `${second.date || ''}${second.startTime || ''}`.localeCompare(`${first.date || ''}${first.startTime || ''}`);
      if (filters.sort === 'programme') return String(first.occasionType || first.categoryName || first.title || '').localeCompare(String(second.occasionType || second.categoryName || second.title || ''));
      if (filters.sort === 'assignee') return getDutyAssignmentLabels(first).join(', ').localeCompare(getDutyAssignmentLabels(second).join(', '));
      return `${first.date || ''}${first.startTime || ''}`.localeCompare(`${second.date || ''}${second.startTime || ''}`);
    });
  }, [allConfirmedBookings, filters]);
  const totalPages = Math.max(1, Math.ceil(confirmedBookings.length / DUTIES_PAGE_SIZE));
  const pagedBookings = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    return confirmedBookings.slice((safePage - 1) * DUTIES_PAGE_SIZE, safePage * DUTIES_PAGE_SIZE);
  }, [confirmedBookings, currentPage, totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const bookingsByDate = useMemo(() => {
    const map = new Map();
    confirmedBookings.forEach((booking) => {
      eachDateKey(booking.date, booking.toDate || booking.date).forEach((key) => {
        const rows = map.get(key) || [];
        rows.push(booking);
        map.set(key, rows);
      });
    });
    return map;
  }, [confirmedBookings]);
  const selectedDateBookings = bookingsByDate.get(selectedDate) || [];

  const notifyMutation = useMutation({
    mutationFn: ({ bookingId = '', scope }) => bookingService.sendDutyNotification({ bookingId, scope }),
    onSuccess: (result) => {
      const data = result?.data || result || {};
      setEmailSuccessModal({
        title: 'Duty email sent',
        message: `The booking details were sent successfully to ${data.sent || 0} assigned recipient${Number(data.sent || 0) === 1 ? '' : 's'}.`
      });
    },
    onError: (error) => setEmailError(error?.message || 'Unable to send the duty email right now.')
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => bookingService.removeBooking(id),
    onSuccess: async () => {
      setSelectedBooking(null);
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
    }
  });

  const actionButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 transition hover:bg-slate-100 disabled:opacity-40';
  const renderActions = (booking) => (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={() => setSelectedBooking(booking)} className={actionButtonClass} aria-label="View booking details" title="View details"><EyeIcon className="h-4 w-4" /></button>
      {canManage ? <button type="button" onClick={() => { setEmailError(''); notifyMutation.mutate({ bookingId: booking.id, scope: 'single' }); }} disabled={notifyMutation.isPending || recipients.length === 0 || getDutyAssignments(booking).length === 0} className={`${actionButtonClass} text-brand-blue`} aria-label="Email duty briefing" title={getDutyAssignments(booking).length ? 'Email duty briefing' : 'Assign a duty performer first'}><EnvelopeIcon className="h-4 w-4" /></button> : null}
      {canManage ? <button type="button" onClick={() => window.confirm('Delete this booking?') && deleteMutation.mutate(booking.id)} className={`${actionButtonClass} border-rose-200 text-rose-600`} aria-label="Delete booking" title="Delete booking"><TrashIcon className="h-4 w-4" /></button> : null}
    </div>
  );

  return (
    <div className="-mt-3 space-y-3">
      {notifyMutation.isPending ? (
        <div className="fixed inset-0 z-[170] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-2xl border border-brand-blue/20 bg-white p-5 text-center shadow-2xl" role="status" aria-live="polite">
            <div className="donation-email-send-loader" aria-hidden="true">
              <span className="donation-email-send-orb donation-email-send-orb-saffron" />
              <span className="donation-email-send-orb donation-email-send-orb-blue" />
              <span className="donation-email-send-orb donation-email-send-orb-gold" />
              <div className="donation-email-send-envelope-wrap"><EnvelopeIcon className="h-7 w-7" /></div>
            </div>
            <p className="mt-3 text-sm font-bold text-slate-900">Please wait, sending email...</p>
            <p className="mt-1 text-xs text-slate-600">Delivering the booking duty details to the assigned team.</p>
          </div>
        </div>
      ) : null}

      {emailSuccessModal ? (
        <div className="fixed inset-0 z-[175] flex items-center justify-center bg-slate-950/35 px-4" onClick={() => setEmailSuccessModal(null)}>
          <div className="w-full max-w-sm rounded-lg border border-emerald-200 bg-white p-5 text-center shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="duty-email-success-title" onClick={(event) => event.stopPropagation()}>
            <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700"><CheckCircleIcon className="h-7 w-7" /></span>
            <h2 id="duty-email-success-title" className="mt-3 font-heading text-lg font-semibold text-slate-900">{emailSuccessModal.title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{emailSuccessModal.message}</p>
            <button type="button" onClick={() => setEmailSuccessModal(null)} className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800">Done</button>
          </div>
        </div>
      ) : null}

      <section data-ui-card className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3 shadow-sm" aria-label="Booking duty controls">
        <div className="flex justify-end">
          <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Booking duty view">
            <button type="button" onClick={() => setView('list')} aria-pressed={view === 'list'} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'list' ? 'bg-brand-blue text-white' : 'text-slate-700'}`}><ListBulletIcon className="h-4 w-4" />List</button>
            <button type="button" onClick={() => setView('calendar')} aria-pressed={view === 'calendar'} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold ${view === 'calendar' ? 'bg-brand-blue text-white' : 'text-slate-700'}`}><CalendarDaysIcon className="h-4 w-4" />Calendar</button>
          </div>
        </div>

      <section className="hidden overflow-x-auto xl:block" aria-label="Filter booking duties">
        <div className="flex min-w-max flex-nowrap items-end gap-2">
          <label className="relative w-44 shrink-0"><span className="sr-only">Search duties</span><MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search duties..." className="h-9 w-full rounded-md border border-slate-300 pl-8 pr-2 text-xs focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15" /></label>
          <label className="w-32 shrink-0"><span className="sr-only">Duty performer</span><select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"><option value="">All performers</option>{assigneeOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label className="w-32 shrink-0"><span className="sr-only">Programme</span><select value={filters.programme} onChange={(event) => setFilters((current) => ({ ...current, programme: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"><option value="">All programmes</option>{programmeOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
          <label className="w-28 shrink-0"><span className="sr-only">Sort duties</span><select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs"><option value="date-asc">Date: earliest</option><option value="date-desc">Date: latest</option><option value="programme">Programme A-Z</option><option value="assignee">Performer A-Z</option></select></label>
          <label className="shrink-0 text-[10px] font-bold uppercase text-slate-500">From<input type="date" value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} className="mt-0.5 block h-9 w-[126px] rounded-md border border-slate-300 px-2 text-xs font-normal normal-case text-slate-800" /></label>
          <label className="shrink-0 text-[10px] font-bold uppercase text-slate-500">To<input type="date" value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} className="mt-0.5 block h-9 w-[126px] rounded-md border border-slate-300 px-2 text-xs font-normal normal-case text-slate-800" /></label>
          <button type="button" onClick={() => setFilters({ search: '', assigneeId: '', fromDate: '', toDate: '', programme: '', sort: 'date-asc' })} className="h-9 shrink-0 rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Reset</button>
        </div>
      </section>

      <section className="min-w-0 xl:hidden" aria-label="Mobile booking duty filters">
        <button type="button" onClick={() => setMobileFiltersOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-800" aria-expanded={mobileFiltersOpen} aria-controls="mobile-booking-duty-filters"><span className="inline-flex items-center gap-2"><FunnelIcon className="h-4 w-4 text-brand-blue" />Filters</span><span className="text-xs text-slate-500">{mobileFiltersOpen ? 'Close' : 'Open'}</span></button>
        {mobileFiltersOpen ? <div id="mobile-booking-duty-filters" className="grid min-w-0 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2">
          <label className="relative min-w-0 sm:col-span-2"><span className="sr-only">Search duties</span><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input type="search" value={filters.search} onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))} placeholder="Search duties..." className="h-9 w-full min-w-0 rounded-md border border-slate-300 pl-9 pr-3 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/15" /></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Duty performer<select value={filters.assigneeId} onChange={(event) => setFilters((current) => ({ ...current, assigneeId: event.target.value }))} className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">All performers</option>{assigneeOptions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Programme<select value={filters.programme} onChange={(event) => setFilters((current) => ({ ...current, programme: event.target.value }))} className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">All programmes</option>{programmeOptions.map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Sort<select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} className="mt-1 h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="date-asc">Date: earliest</option><option value="date-desc">Date: latest</option><option value="programme">Programme A-Z</option><option value="assignee">Performer A-Z</option></select></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">From<input type="date" value={filters.fromDate} onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} className="mt-1 block h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal text-slate-800" /></label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">To<input type="date" value={filters.toDate} onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} className="mt-1 block h-9 w-full min-w-0 rounded-md border border-slate-300 px-2 text-sm font-normal text-slate-800" /></label>
          <div className="flex min-w-0 gap-2 sm:col-span-2"><button type="button" onClick={() => setFilters({ search: '', assigneeId: '', fromDate: '', toDate: '', programme: '', sort: 'date-asc' })} className="h-9 flex-1 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Reset</button><button type="button" onClick={() => setMobileFiltersOpen(false)} className="h-9 flex-1 rounded-md bg-brand-blue px-3 text-sm font-semibold text-white transition hover:bg-blue-800">Done</button></div>
        </div> : null}
      </section>

      </section>

      {emailError ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{emailError}</p> : null}

      {view === 'list' ? <div className="space-y-3">
        {isLoading ? <Card><p className="text-sm text-slate-500">Loading bookings...</p></Card> : null}
        {!isLoading && confirmedBookings.length === 0 ? <Card><p className="text-sm text-slate-500">No confirmed bookings match these filters.</p></Card> : null}
        {pagedBookings.map((booking) => <article key={booking.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-heading text-lg font-semibold text-slate-900">{booking.occasionType || getDutyBookingLabel(booking)}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getDutyAssignments(booking).length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{getDutyAssignments(booking).length ? `${getDutyAssignments(booking).length} assigned` : 'Unassigned'}</span></div><p className="mt-1 text-xs font-semibold uppercase text-slate-400">Booking #{booking.id}</p></div>{renderActions(booking)}</div>
          <div className="grid gap-4 px-4 py-4 sm:px-5 md:grid-cols-3">
            <div><p className="text-xs font-bold uppercase text-slate-400">Schedule</p><p className="mt-1 flex items-start gap-2 text-sm font-semibold text-brand-blue"><CalendarDaysIcon className="mt-0.5 h-4 w-4 shrink-0" />{dateLabel(booking)}</p><p className="mt-1 flex items-center gap-2 text-sm text-slate-600"><ClockIcon className="h-4 w-4 shrink-0" />{booking.startTime || 'TBD'}{booking.endTime ? ` - ${booking.endTime}` : ''}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-400">Location</p><p className="mt-1 flex items-start gap-2 text-sm text-slate-700"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />{booking.bookingLocation || '-'}</p></div>
            <div><p className="text-xs font-bold uppercase text-slate-400">Primary contact</p><p className="mt-1 text-sm font-semibold text-slate-800">{booking.requesterName || '-'}</p><p className="mt-1 truncate text-sm text-slate-500">{booking.requesterPhone || booking.requesterEmail || '-'}</p></div>
          </div>
        </article>)}
        {!isLoading && confirmedBookings.length > 0 ? <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-semibold text-slate-500">Page {Math.min(currentPage, totalPages)} of {totalPages}</p><div className="flex items-center gap-2"><button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={currentPage <= 1} className={actionButtonClass} aria-label="Previous page" title="Previous page"><ChevronLeftIcon className="h-4 w-4" /></button><button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={currentPage >= totalPages} className={actionButtonClass} aria-label="Next page" title="Next page"><ChevronRightIcon className="h-4 w-4" /></button></div></div> : null}
      </div> : <div className="booking-duty-calendar-layout">
        <section className="booking-duty-calendar-panel" aria-labelledby="duty-calendar-title">
          <div className="booking-duty-calendar-heading"><div><p className="booking-duty-calendar-kicker">Monthly overview</p><h2 id="duty-calendar-title">Duty Calendar</h2></div><div className="booking-duty-calendar-legend"><span /><strong>Confirmed duty</strong></div></div>
          <Calendar className="booking-duty-calendar" onClickDay={(date) => setSelectedDate(toDateKey(date))} value={new Date(`${selectedDate}T12:00:00`)} tileClassName={({ date, view: calendarView }) => calendarView === 'month' && bookingsByDate.has(toDateKey(date)) ? 'booking-duty-calendar-has-booking' : ''} tileContent={({ date, view: calendarView }) => { const count = calendarView === 'month' ? (bookingsByDate.get(toDateKey(date)) || []).length : 0; return count ? <span className="booking-duty-calendar-count">{count}</span> : null; }} />
        </section>
        <aside className="booking-duty-day-panel">
          <div className="booking-duty-day-heading"><CalendarDaysIcon className="h-5 w-5" /><div><p>Selected date</p><h2>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</h2></div></div>
          <div className="booking-duty-day-list">{selectedDateBookings.length === 0 ? <div className="booking-duty-empty-day"><CheckCircleIcon className="h-9 w-9" /><p>No confirmed duties on this date.</p></div> : selectedDateBookings.map((booking) => <article key={booking.id} className="booking-duty-day-item"><div className="min-w-0"><p className="truncate font-heading text-base font-semibold text-slate-900">{booking.occasionType || getDutyBookingLabel(booking)}</p><p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><ClockIcon className="h-4 w-4" />{booking.startTime || 'TBD'}{booking.endTime ? ` - ${booking.endTime}` : ''}</p><p className="mt-1 flex items-start gap-1.5 text-xs text-slate-500"><MapPinIcon className="mt-0.5 h-4 w-4 shrink-0" />{booking.bookingLocation || '-'}</p><p className="mt-2 text-xs font-bold text-emerald-700">{getDutyAssignmentLabels(booking).join(', ') || 'Unassigned'}</p></div>{renderActions(booking)}</article>)}</div>
        </aside>
      </div>}

      {selectedBooking ? <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-[2px]" onClick={() => setSelectedBooking(null)}><div role="dialog" aria-modal="true" aria-labelledby="booking-duty-detail-title" className="booking-duty-detail-dialog" onClick={(event) => event.stopPropagation()}>
        <header className="booking-duty-detail-header"><div className="booking-duty-detail-icon"><CalendarDaysIcon className="h-7 w-7" /></div><div className="min-w-0 flex-1"><p>Booking duty</p><h2 id="booking-duty-detail-title">{selectedBooking.occasionType || selectedBooking.categoryName || selectedBooking.title}</h2><div className="booking-duty-detail-time"><span><CalendarDaysIcon className="h-4 w-4" />{dateLabel(selectedBooking)}</span><span><ClockIcon className="h-4 w-4" />{selectedBooking.startTime || 'TBD'}{selectedBooking.endTime ? ` - ${selectedBooking.endTime}` : ''}</span></div></div><button type="button" onClick={() => setSelectedBooking(null)} className="booking-duty-detail-close" aria-label="Close booking details"><XMarkIcon className="h-5 w-5" /></button></header>
        <div className="booking-duty-detail-body"><section className="booking-duty-location"><MapPinIcon className="h-5 w-5" /><div><p>Location</p><strong>{selectedBooking.bookingLocation || '-'}</strong></div></section><div className="booking-duty-detail-grid">{[['Booking items', getDutyBookingLabel(selectedBooking)], ['Duty performers', getDutyAssignmentLabels(selectedBooking).join(', ') || 'Unassigned'], ['Contact name', selectedBooking.requesterName || '-'], ['Email', selectedBooking.requesterEmail || '-'], ['Phone', selectedBooking.requesterPhone || '-'], ['Address', selectedBooking.requesterAddress || '-']].map(([label, value]) => <div key={label}><p>{label}</p><strong>{value}</strong></div>)}</div><section className="booking-duty-notes"><p>Programme notes</p><div>{selectedBooking.notes || 'No additional notes were provided.'}</div></section></div>
        <footer className="booking-duty-detail-footer">{selectedBooking.requesterPhone ? <a href={`tel:${String(selectedBooking.requesterPhone).replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"><PhoneIcon className="h-4 w-4" />Call Contact</a> : null}{canManage ? <button type="button" onClick={() => { setEmailError(''); notifyMutation.mutate({ bookingId: selectedBooking.id, scope: 'single' }); }} disabled={notifyMutation.isPending || recipients.length === 0 || getDutyAssignments(selectedBooking).length === 0} className="inline-flex items-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"><EnvelopeIcon className="h-4 w-4" />Email Duty Performers</button> : null}</footer>
      </div></div> : null}
    </div>
  );
};

export default AdminBookingDutiesPage;
