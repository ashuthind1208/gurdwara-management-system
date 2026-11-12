import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import PageHero from '../../components/common/PageHero';
import Seo from '../../components/common/Seo';
import useSeoMeta from '../../hooks/useSeoMeta';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import bookingService from '../../services/bookingService';
import eventService from '../../services/eventService';
import donationService from '../../services/donationService';
import ZeffyDonationModal from '../Donation/ZeffyDonationModal';
import { toZeffyEmbedUrl } from '../../utils/zeffy';
import { expandDateRange, isAkhandPathBooking, toDateOnlyKey } from '../../utils/dateRange';

const toDateKey = toDateOnlyKey;

const toMinutes = (value) => {
  const [h, m] = String(value || '').split(':').map((token) => Number(token || 0));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return null;
  }
  return (h * 60) + m;
};

const overlaps = (aStart, aEnd, bStart, bEnd) => {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
    return true;
  }
  return aStart < bEnd && bStart < aEnd;
};

const toCategoryColor = (index, theme = {}) => {
  const palette = [theme.primaryColor || '#1d4ed8', theme.accentColor || '#b45309', '#0f766e', '#b91c1c', '#7c3aed', '#334155'];
  return palette[index % palette.length];
};

const toLightCalendarColor = (color, alpha = 0.16) => {
  const match = String(color || '').trim().match(/^#([\da-f]{6})$/i);
  if (!match) {
    return `rgba(71, 85, 105, ${alpha})`;
  }
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

const calendarCellColorStyle = (entries = []) => {
  const colors = [...new Set(entries.map((entry) => entry.color).filter(Boolean))];
  if (colors.length === 0) {
    return undefined;
  }
  if (colors.length === 1) {
    return { backgroundColor: toLightCalendarColor(colors[0]) };
  }
  const stops = colors.map((color, index) => (
    `${toLightCalendarColor(color, 0.18)} ${(index / (colors.length - 1)) * 100}%`
  ));
  return { backgroundImage: `linear-gradient(135deg, ${stops.join(', ')})` };
};

const startOfMonth = (value = new Date()) => new Date(value.getFullYear(), value.getMonth(), 1);

const BOOKING_TIME_OPTIONS = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const label = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  return { value, label };
});

const MOBILE_BOOKING_DATE_OPTIONS = Array.from({ length: 731 }, (_, index) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + index);
  return {
    value: toDateKey(date),
    label: date.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  };
});

const initialForm = {
  categoryId: '',
  date: '',
  toDate: '',
  startTime: '',
  endTime: '',
  bookingLocation: '',
  bookingVenueType: 'gurdwara',
  hidePublicLocation: true,
  bookingForDifferentPerson: false,
  requesterName: '',
  requesterEmail: '',
  requesterPhone: '',
  requesterAddress: '',
  notes: '',
  paymentMethod: '',
  amount: '',
  paymentReference: '',
  receiptNumber: ''
};

const BookingsPage = () => {
  const { branding } = useBranding();
  const meta = useSeoMeta('Bookings', 'Book Akhand Path, Sehaj Path, Bhog, Antim Ardas, and more with availability checks.');
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();

  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [mobileCalendarDate, setMobileCalendarDate] = useState('');
  const [selectedCalendarItem, setSelectedCalendarItem] = useState(null);
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [notice, setNotice] = useState({ type: '', message: '' });
  const [zeffyFormUrl, setZeffyFormUrl] = useState('');
  const [isZeffyModalOpen, setIsZeffyModalOpen] = useState(false);
  const checkoutWindowRef = useRef(null);

  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => bookingService.getPublicBookings().then((res) => res.data)
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['booking-categories'],
    queryFn: () => bookingService.getBookingCategories().then((res) => res.data)
  });

  const { data: events = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => eventService.getEvents().then((res) => res.data)
  });

  const { data: bookingPageSettings } = useQuery({
    queryKey: ['booking-page-settings'],
    queryFn: () => bookingService.getBookingPageSettings().then((res) => res.data)
  });

  const activeCategories = useMemo(
    () => (Array.isArray(categories) ? categories : []).filter((entry) => entry.active !== false)
      .sort((first, second) => Number(first.sortOrder || 0) - Number(second.sortOrder || 0)),
    [categories]
  );

  const categoryById = useMemo(() => {
    const map = new Map();
    activeCategories.forEach((entry, index) => {
      map.set(entry.id, { ...entry, color: entry.color || toCategoryColor(index, branding) });
    });
    return map;
  }, [activeCategories, branding]);

  const calendarEntries = useMemo(() => {
    const bookingEntries = bookings
      .filter((entry) => String(entry.status || '').toLowerCase() !== 'cancelled')
      .flatMap((entry) => {
        const category = categoryById.get(entry.categoryId);
        const booking = { ...entry, categoryName: category?.name || entry.categoryName };
        const fullDay = isAkhandPathBooking(booking);
        const orderedItemNames = [...(Array.isArray(entry.itemizedItems) ? entry.itemizedItems : [])]
          .sort((first, second) => (
            (activeCategories.findIndex((candidate) => String(candidate.id) === String(first.categoryId)))
            - (activeCategories.findIndex((candidate) => String(candidate.id) === String(second.categoryId)))
          ))
          .map((item) => String(item.name || '').trim())
          .filter(Boolean);
        const calendarTitle = orderedItemNames.length ? orderedItemNames.join(', ') : entry.title || category?.name || entry.categoryName || 'Booking';
        return expandDateRange(entry.date, entry.toDate || entry.date).map((date) => ({
          id: `booking-${entry.id}-${date}`,
          kind: 'booking',
          title: calendarTitle,
          date,
          startTime: fullDay ? '00:00' : entry.startTime,
          endTime: fullDay ? '24:00' : entry.endTime,
          color: category?.color || branding.primaryColor || '#1d4ed8',
          location: entry.bookingLocation || ''
        }));
      });

    const eventEntries = events.flatMap((entry) => {
      const startDate = toDateKey(entry.date);
      const start = new Date(entry.date);
      const end = entry.endDate ? new Date(entry.endDate) : new Date(start.getTime() + (60 * 60 * 1000));
      const endDate = toDateKey(end);
      return expandDateRange(startDate, endDate).map((date) => ({
        id: `event-${entry.id}-${date}`,
        kind: 'event',
        title: entry.title || 'Event',
        date,
        startTime: date === startDate ? `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` : '00:00',
        endTime: date === endDate ? `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}` : '24:00',
        color: '#475569'
      }));
    });

    return [...bookingEntries, ...eventEntries];
  }, [activeCategories, bookings, branding.primaryColor, categoryById, events]);

  const selectedDateKey = toDateKey(calendarDate);

  const calendarEntriesByDate = useMemo(() => {
    const entriesByDate = new Map();
    calendarEntries.forEach((entry) => {
      if (!entry.date) {
        return;
      }
      const dateEntries = entriesByDate.get(entry.date) || [];
      dateEntries.push(entry);
      entriesByDate.set(entry.date, dateEntries);
    });
    return entriesByDate;
  }, [calendarEntries]);

  useEffect(() => {
    if (mobileCalendarDate || calendarEntriesByDate.size === 0) {
      return;
    }

    const todayKey = toDateKey(new Date());
    const populatedDates = [...calendarEntriesByDate.keys()].sort();
    const nearestUpcomingDate = populatedDates.find((date) => date >= todayKey) || populatedDates[0];
    setMobileCalendarDate(nearestUpcomingDate || todayKey);
  }, [calendarEntriesByDate, mobileCalendarDate]);

  const mobileDateEntries = useMemo(
    () => [...(calendarEntriesByDate.get(mobileCalendarDate) || [])].sort((first, second) => {
      const firstMinutes = toMinutes(first.startTime);
      const secondMinutes = toMinutes(second.startTime);
      return (firstMinutes ?? Number.MAX_SAFE_INTEGER) - (secondMinutes ?? Number.MAX_SAFE_INTEGER);
    }),
    [calendarEntriesByDate, mobileCalendarDate]
  );

  const selectedCategory = categoryById.get(form.categoryId) || null;
  const conflictMessage = useMemo(() => {
    if (!form.date || !form.toDate || !form.startTime || !form.endTime) {
      return '';
    }

    const selectedDates = expandDateRange(form.date, form.toDate);
    if (selectedDates.length === 0) {
      return 'End date must be on or after the start date.';
    }

    const fullDay = isAkhandPathBooking({ categoryName: selectedCategory?.name });
    const start = fullDay ? 0 : toMinutes(form.startTime);
    const end = fullDay ? 24 * 60 : toMinutes(form.endTime);
    if (start == null || end == null || end <= start) {
      return 'Please choose a valid time window.';
    }
    if (start % 15 !== 0 || end % 15 !== 0) {
      return 'Start and end times must use 15-minute intervals.';
    }

    const conflicts = calendarEntries.filter((entry) => {
      if (!selectedDates.includes(entry.date)) {
        return false;
      }
      const entryStart = toMinutes(entry.startTime);
      const entryEnd = toMinutes(entry.endTime);
      return overlaps(start, end, entryStart, entryEnd);
    });

    if (conflicts.length === 0) {
      return '';
    }

    return `Selected slot overlaps with ${conflicts.length} existing booking/event item(s). Choose another time.`;
  }, [calendarEntries, form.date, form.endTime, form.startTime, form.toDate, selectedCategory?.name]);

  const categoryPaymentRequired = Number(selectedCategory?.feeAmount || 0) > 0;
  const selfPaymentRequired = Boolean(
    categoryPaymentRequired &&
    bookingPageSettings?.donationCampaignId &&
    Number(selectedCategory?.feeAmount || 0) > 0
  );

  const openCheckoutPlaceholder = () => {
    const popup = window.open('', 'booking_checkout', 'popup=yes,width=620,height=820');
    if (!popup) {
      return false;
    }
    popup.document.title = 'Preparing Secure Payment';
    popup.document.body.innerHTML = '<div style="min-height:80vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:Arial,sans-serif;color:#0f172a"><span style="display:block;width:48px;height:48px;border:5px solid #dbeafe;border-top-color:#0a4d9f;border-radius:999px;animation:ssm-spin .8s linear infinite"></span><strong>Preparing secure payment...</strong><style>@keyframes ssm-spin{to{transform:rotate(360deg)}}</style></div>';
    checkoutWindowRef.current = popup;
    return true;
  };

  const openPayment = (payment) => {
    if (!payment?.checkoutUrl) {
      return false;
    }

    if (String(payment.paymentProvider || '').toUpperCase() === 'ZEFFY') {
      if (checkoutWindowRef.current && !checkoutWindowRef.current.closed) {
        checkoutWindowRef.current.close();
      }
      const embedUrl = toZeffyEmbedUrl(payment.checkoutUrl);
      if (!embedUrl) {
        return false;
      }
      setZeffyFormUrl(embedUrl);
      setIsZeffyModalOpen(true);
      return true;
    }

    if (checkoutWindowRef.current && !checkoutWindowRef.current.closed) {
      checkoutWindowRef.current.location.href = payment.checkoutUrl;
      checkoutWindowRef.current.focus();
      return true;
    }

    const popup = window.open(payment.checkoutUrl, 'booking_checkout', 'popup=yes,width=620,height=820');
    if (popup) {
      checkoutWindowRef.current = popup;
      return true;
    }
    window.location.assign(payment.checkoutUrl);
    return true;
  };

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const category = categoryById.get(payload.categoryId);
      let payment = null;
      if (payload.selfPaymentRequired) {
        payment = await donationService.initiateDonation({
          campaignId: Number(bookingPageSettings?.donationCampaignId),
          donorName: payload.requesterName,
          donorEmail: payload.requesterEmail,
          donorPhone: payload.requesterPhone,
          frequency: 'one-time',
          amount: Number(category?.feeAmount || 0)
        }).then((res) => res.data);
      }

      const created = await bookingService.createBooking({
        ...payload,
        bookedByEmail: String(user?.email || '').trim().toLowerCase(),
        title: category?.name || 'Booking',
        categoryName: category?.name || 'Other',
        color: category?.color || branding.primaryColor || '#1d4ed8',
        status: 'pending',
        paymentStatus: 'pending',
        paymentMethod: payment?.paymentProvider || '',
        paymentProvider: String(payment?.paymentProvider || '').toUpperCase(),
        amount: Number(payment?.amount || (payload.selfPaymentRequired ? category?.feeAmount : payload.amount) || 0),
        paymentReference: payment?.pendingId || '',
        donationPendingId: payment?.pendingId || '',
        donationCampaignId: payload.selfPaymentRequired ? String(bookingPageSettings?.donationCampaignId || '') : '',
        checkoutUrl: payment?.checkoutUrl || '',
        source: 'public'
      }).then((res) => res.data);

      return { created, payment };
    },
    onSuccess: async ({ created, payment }) => {
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setForm((prev) => ({
        ...initialForm,
        requesterName: prev.bookingForDifferentPerson ? '' : String(user?.name || ''),
        requesterEmail: prev.bookingForDifferentPerson ? '' : String(user?.email || ''),
        requesterPhone: prev.bookingForDifferentPerson ? '' : String(user?.phone || ''),
        requesterAddress: prev.bookingForDifferentPerson ? '' : String(user?.address || '')
      }));
      setNotice(payment?.checkoutUrl
        ? { type: '', message: '' }
        : { type: 'success', message: `Booking request submitted. A status email will be sent to ${created.requesterEmail}.` });
      setIsBookingModalOpen(false);
      if (payment?.checkoutUrl) {
        openPayment(payment);
      }
    },
    onError: (error) => {
      if (checkoutWindowRef.current && !checkoutWindowRef.current.closed) {
        checkoutWindowRef.current.close();
      }
      setNotice({ type: 'error', message: error?.message || 'Unable to create booking right now.' });
    }
  });

  const bookingDefaults = useMemo(() => ({
    requesterName: String(user?.name || ''),
    requesterEmail: String(user?.email || ''),
    requesterPhone: String(user?.phone || ''),
    requesterAddress: String(user?.address || '')
  }), [user?.address, user?.email, user?.name, user?.phone]);

  const handleField = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const openBookingModal = () => {
    setNotice({ type: '', message: '' });
    setForm((prev) => ({
      ...prev,
      date: prev.date || selectedDateKey,
      toDate: prev.toDate || prev.date || selectedDateKey,
      bookingLocation: prev.bookingVenueType === 'gurdwara'
        ? (branding.address || prev.bookingLocation || '')
        : prev.bookingLocation,
      requesterName: prev.bookingForDifferentPerson ? prev.requesterName : bookingDefaults.requesterName,
      requesterEmail: prev.bookingForDifferentPerson ? prev.requesterEmail : bookingDefaults.requesterEmail,
      requesterPhone: prev.bookingForDifferentPerson ? prev.requesterPhone : bookingDefaults.requesterPhone,
      requesterAddress: prev.bookingForDifferentPerson ? prev.requesterAddress : bookingDefaults.requesterAddress
    }));
    setIsBookingModalOpen(true);
  };

  useEffect(() => {
    if (!isBookingModalOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !createMutation.isPending) {
        setIsBookingModalOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [createMutation.isPending, isBookingModalOpen]);

  const submitRequest = (event) => {
    event.preventDefault();
    setNotice({ type: '', message: '' });

    if (!form.categoryId || !form.date || !form.toDate || !form.startTime || !form.endTime || !String(form.bookingLocation || '').trim()) {
      setNotice({ type: 'error', message: 'Booking type, start date, end date, time, and location are required.' });
      return;
    }

    if (conflictMessage) {
      setNotice({ type: 'error', message: conflictMessage });
      return;
    }

    const requesterName = String(form.bookingForDifferentPerson ? form.requesterName : bookingDefaults.requesterName).trim();
    const requesterEmail = String(form.bookingForDifferentPerson ? form.requesterEmail : bookingDefaults.requesterEmail).trim().toLowerCase();
    const requesterPhone = String(form.bookingForDifferentPerson ? form.requesterPhone : bookingDefaults.requesterPhone).trim();
    const requesterAddress = String(form.bookingForDifferentPerson ? form.requesterAddress : bookingDefaults.requesterAddress).trim();

    if (!requesterName || !requesterEmail || !requesterPhone || !requesterAddress) {
      setNotice({ type: 'error', message: 'Name, email, phone, and address are required for booking.' });
      return;
    }

    if (categoryPaymentRequired && !bookingPageSettings?.donationCampaignId) {
      setNotice({ type: 'error', message: 'Online payment is not configured for this booking type. Please contact the Gurdwara office.' });
      return;
    }

    if (selfPaymentRequired) {
      openCheckoutPlaceholder();
    }

    createMutation.mutate({
      ...form,
      requesterName,
      requesterEmail,
      requesterPhone,
      requesterAddress,
      amount: selfPaymentRequired ? Number(selectedCategory?.feeAmount || 0) : Number(form.amount || 0),
      selfPaymentRequired
    });
  };

  const moveCalendarMonth = (offset) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  };

  const showToday = () => {
    const today = new Date();
    setCalendarDate(today);
    setCalendarMonth(startOfMonth(today));
    setMobileCalendarDate(toDateKey(today));
  };

  return (
    <div className="bookings-page min-w-0 max-w-full space-y-6 overflow-x-clip">
      <Seo {...meta} />
      <PageHero
        title="Bookings"
        containerClassName="w-full"
        titleActions={bookingPageSettings?.showCreateBookingButton !== false ? (
          <button type="button" onClick={openBookingModal} className="rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            Create Booking Request
          </button>
        ) : null}
      />
      <hr className="border-slate-200" />

      <section className="min-w-0 w-full max-w-full">
        <div className="mb-5 border-b border-slate-200 pb-4">
          <div
            className="prose prose-sm max-w-none text-slate-600"
            dangerouslySetInnerHTML={{ __html: bookingPageSettings?.guidelines || '<p>Please review availability before submitting your booking request.</p>' }}
          />
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Bookings
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Events
          </span>
        </div>

        {notice.message ? (
          <p className={`mb-4 rounded-lg border px-3 py-2 text-sm ${notice.type === 'error' ? 'border-red-200 text-red-700 bg-red-50' : 'border-emerald-200 text-emerald-700 bg-emerald-50'}`}>
            {notice.message}
          </p>
        ) : null}
        <div className="booking-calendar-shell hidden rounded-xl border border-slate-200 bg-white lg:block">
            <div className="booking-calendar-toolbar">
              <p className="font-heading text-lg font-semibold text-slate-900">
                {calendarMonth.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })}
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={showToday} className="booking-calendar-today-button">Today</button>
                <button type="button" onClick={() => moveCalendarMonth(-1)} className="booking-calendar-arrow-button" aria-label="Previous month">&lt;</button>
                <button type="button" onClick={() => moveCalendarMonth(1)} className="booking-calendar-arrow-button" aria-label="Next month">&gt;</button>
              </div>
            </div>
            <Calendar
              className="booking-availability-calendar"
              value={calendarDate}
              activeStartDate={calendarMonth}
              calendarType="gregory"
              showNavigation={false}
              onChange={(value) => {
                const nextDate = Array.isArray(value) ? value[0] : value;
                setCalendarDate(nextDate);
                setMobileCalendarDate(toDateKey(nextDate));
              }}
              onActiveStartDateChange={({ activeStartDate }) => {
                if (activeStartDate) {
                  setCalendarMonth(startOfMonth(activeStartDate));
                }
              }}
              showNeighboringMonth={false}
              tileClassName={({ date, view }) => {
                if (view !== 'month') {
                  return '';
                }
                const classNames = date.getDate() === 1
                  ? [`booking-calendar-month-start-${date.getDay() + 1}`]
                  : [];
                const dateEntries = calendarEntriesByDate.get(toDateKey(date)) || [];
                if (dateEntries.length === 0) {
                  return classNames.join(' ');
                }
                classNames.push('booking-calendar-day-has-items');
                if (dateEntries.some((entry) => entry.kind === 'event')) {
                  classNames.push('booking-calendar-day-has-event');
                }
                return classNames.join(' ');
              }}
              tileContent={({ date, view }) => {
                if (view !== 'month') {
                  return null;
                }
                const dateEntries = calendarEntriesByDate.get(toDateKey(date)) || [];
                return (
                  <>
                    {dateEntries.length > 0 ? <span className="booking-calendar-cell-background" style={calendarCellColorStyle(dateEntries)} aria-hidden="true" /> : null}
                    <span className="booking-calendar-pills">
                      {dateEntries.map((entry) => (
                        <span
                          key={entry.id}
                          role="button"
                          tabIndex={0}
                          title={`${entry.title}: ${entry.startTime || '-'} - ${entry.endTime || '-'}`}
                          className={`booking-calendar-pill ${entry.kind === 'event' ? 'booking-calendar-pill-event' : ''}`}
                          style={entry.kind === 'booking' ? { borderColor: entry.color, backgroundColor: `${entry.color}18`, color: entry.color } : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCalendarItem(entry);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedCalendarItem(entry);
                            }
                          }}
                        >
                          <span className="booking-calendar-pill-title">{entry.title}</span>
                          <span className="booking-calendar-pill-time">{entry.startTime || '-'}</span>
                        </span>
                      ))}
                    </span>
                  </>
                );
              }}
            />
        </div>

        <div className="min-w-0 max-w-full lg:hidden">
          <p className="block text-sm font-semibold text-slate-800">Select a calendar date</p>
          <div className="mt-2 min-w-0 max-w-full overflow-hidden rounded-lg shadow-sm">
            <Calendar
              className="booking-mobile-calendar"
              value={mobileCalendarDate ? new Date(`${mobileCalendarDate}T12:00:00`) : null}
              activeStartDate={calendarMonth}
              calendarType="gregory"
              onChange={(value) => {
                const nextDate = Array.isArray(value) ? value[0] : value;
                setCalendarDate(nextDate);
                setMobileCalendarDate(toDateKey(nextDate));
              }}
              onActiveStartDateChange={({ activeStartDate }) => {
                if (activeStartDate) {
                  setCalendarMonth(startOfMonth(activeStartDate));
                }
              }}
              showNeighboringMonth={false}
              tileContent={({ date, view }) => {
                if (view !== 'month') {
                  return null;
                }
                const dateEntries = calendarEntriesByDate.get(toDateKey(date)) || [];
                const dotColors = [...new Set(dateEntries.map((entry) => entry.color).filter(Boolean))].slice(0, 3);
                return dotColors.length > 0 ? (
                  <span className="booking-mobile-calendar-dots" aria-label={`${dateEntries.length} booking or event item${dateEntries.length === 1 ? '' : 's'}`}>
                    {dotColors.map((color) => <span key={color} className="booking-mobile-calendar-dot" style={{ backgroundColor: color }} />)}
                  </span>
                ) : null;
              }}
            />
          </div>

          <div className="mt-4 space-y-3" aria-live="polite">
            {mobileDateEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setSelectedCalendarItem(entry)}
                className="block w-full rounded-lg border-l-4 bg-white p-4 text-left shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300"
                style={{ borderLeftColor: entry.color, backgroundColor: `${entry.color}0D` }}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block text-xs font-bold uppercase tracking-wide" style={{ color: entry.color }}>
                      {entry.kind === 'event' ? 'Event' : 'Booking'}
                    </span>
                    <span className="mt-1 block text-base font-semibold text-slate-900">{entry.title}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                    {entry.startTime || '-'}
                  </span>
                </span>
                <span className="mt-2 block text-sm text-slate-600">{entry.startTime || '-'} - {entry.endTime || '-'}</span>
              </button>
            ))}

            {mobileDateEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center">
                <p className="text-sm font-semibold text-slate-700">No bookings or events on this date.</p>
                <p className="mt-1 text-xs text-slate-500">Choose another date from the calendar above.</p>
              </div>
            ) : null}
          </div>
        </div>

      </section>

      {isBookingModalOpen && bookingPageSettings?.showCreateBookingButton !== false ? (
        <div className="fixed inset-0 z-[125] flex max-w-[100vw] items-center justify-center overflow-x-hidden bg-slate-950/65 px-3 py-5 sm:px-5" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !createMutation.isPending) {
            setIsBookingModalOpen(false);
          }
        }}>
          <section className="booking-request-dialog max-h-full min-w-0 max-w-3xl overflow-x-hidden overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="booking-request-title">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h2 id="booking-request-title" className="font-heading text-2xl font-semibold text-slate-900">Create Booking Request</h2>
                <p className="mt-1 text-sm text-slate-600">Choose an available date and provide the programme details.</p>
              </div>
              <button type="button" onClick={() => setIsBookingModalOpen(false)} disabled={createMutation.isPending} className="h-9 w-9 shrink-0 rounded-full border border-slate-300 text-xl leading-none text-slate-600 hover:bg-slate-100 disabled:opacity-50" aria-label="Close booking request">×</button>
            </div>

            {notice.message ? (
              <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${notice.type === 'error' ? 'border-red-200 text-red-700 bg-red-50' : 'border-emerald-200 text-emerald-700 bg-emerald-50'}`}>
                {notice.message}
              </p>
            ) : null}

            <form className="booking-request-form mt-4 space-y-5" onSubmit={submitRequest}>
          <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 p-3 sm:p-4">
            <h3 className="font-heading text-lg font-semibold text-slate-900">Programme Details</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Booking Type
            <select value={form.categoryId} onChange={handleField('categoryId')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required>
              <option value="">Select booking type</option>
              {activeCategories.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Start Date
            <select value={form.date} onChange={handleField('date')} className="booking-mobile-date-select mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 sm:hidden" required>
              <option value="">Select date</option>
              {form.date && !MOBILE_BOOKING_DATE_OPTIONS.some((entry) => entry.value === form.date) ? <option value={form.date}>{form.date}</option> : null}
              {MOBILE_BOOKING_DATE_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
            <input type="date" value={form.date} onChange={handleField('date')} className="booking-date-input mt-1 hidden w-full rounded-lg border border-slate-300 px-3 py-2 sm:block" required />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            End Date
            <select value={form.toDate} onChange={handleField('toDate')} className="booking-mobile-date-select mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 sm:hidden" required>
              <option value="">Select end date</option>
              {form.toDate && !MOBILE_BOOKING_DATE_OPTIONS.some((entry) => entry.value === form.toDate) ? <option value={form.toDate}>{form.toDate}</option> : null}
              {MOBILE_BOOKING_DATE_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
            <input type="date" min={form.date || undefined} value={form.toDate} onChange={handleField('toDate')} className="booking-date-input mt-1 hidden w-full rounded-lg border border-slate-300 px-3 py-2 sm:block" required />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Start Time
            <select value={form.startTime} onChange={handleField('startTime')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" required>
              <option value="">Select start time</option>
              {BOOKING_TIME_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            End Time
            <select value={form.endTime} onChange={handleField('endTime')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" required>
              <option value="">Select end time</option>
              {BOOKING_TIME_OPTIONS.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Venue
            <select value={form.bookingVenueType} onChange={handleField('bookingVenueType')} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" required>
              <option value="gurdwara">At Gurdwara</option><option value="residence">At Residence</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Private venue address
            <input value={form.bookingLocation} onChange={handleField('bookingLocation')} placeholder={form.bookingVenueType === 'residence' ? 'Enter the residence address' : 'Gurdwara address'} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required />
          </label>
          <label className="md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <input type="checkbox" checked={form.hidePublicLocation !== false} onChange={handleField('hidePublicLocation')} className="h-4 w-4 accent-brand-blue" />
            Keep exact venue details private on public calendars
          </label>
            </div>
          </section>

          <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 p-3 sm:p-4">
            <h3 className="font-heading text-lg font-semibold text-slate-900">Contact Details</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">

          <label className="md:col-span-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={form.bookingForDifferentPerson} onChange={handleField('bookingForDifferentPerson')} />
            Booking under a different name
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Name
            <input
              value={form.bookingForDifferentPerson ? form.requesterName : bookingDefaults.requesterName}
              onChange={handleField('requesterName')}
              disabled={!form.bookingForDifferentPerson && isAuthenticated}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              required
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Email
            <input
              type="email"
              value={form.bookingForDifferentPerson ? form.requesterEmail : bookingDefaults.requesterEmail}
              onChange={handleField('requesterEmail')}
              disabled={!form.bookingForDifferentPerson && isAuthenticated}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              required
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Phone
            <input
              value={form.bookingForDifferentPerson ? form.requesterPhone : bookingDefaults.requesterPhone}
              onChange={handleField('requesterPhone')}
              disabled={!form.bookingForDifferentPerson && isAuthenticated}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              required
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Address
            <input
              value={form.bookingForDifferentPerson ? form.requesterAddress : bookingDefaults.requesterAddress}
              onChange={handleField('requesterAddress')}
              disabled={!form.bookingForDifferentPerson && isAuthenticated}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
              required
            />
          </label>
            </div>
          </section>

          <label className="block text-sm font-semibold text-slate-700">
            Notes
            <textarea value={form.notes} onChange={handleField('notes')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" rows={3} placeholder="Any additional details" />
          </label>

          {conflictMessage ? <p className="text-xs font-semibold text-amber-700">{conflictMessage}</p> : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {createMutation.isPending
                ? 'Submitting...'
                : selfPaymentRequired
                ? 'Submit & Continue to Payment'
                : 'Submit Booking Request'}
            </button>
          </div>
            </form>
          </section>
        </div>
      ) : null}

      {selectedCalendarItem ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 px-4" onClick={() => setSelectedCalendarItem(null)}>
          <div
            className="w-full max-w-lg overflow-hidden rounded-xl border-2 bg-white shadow-2xl"
            style={{ borderColor: selectedCalendarItem.color }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 p-5 text-white" style={{ backgroundColor: selectedCalendarItem.color }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-white/80">{selectedCalendarItem.kind === 'event' ? 'Community Event' : 'Programme Booking'}</p>
                <h3 className="mt-1 font-heading text-2xl font-bold text-white">{selectedCalendarItem.title}</h3>
              </div>
              <button type="button" className="rounded-md border border-white/60 px-3 py-1 text-sm font-bold text-white hover:bg-white/15" onClick={() => setSelectedCalendarItem(null)}>Close</button>
            </div>
            <div className="space-y-3 p-5 text-sm text-slate-700" style={{ backgroundColor: `${selectedCalendarItem.color}0D` }}>
              <p className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3"><span className="font-bold text-slate-900">Date</span><span>{selectedCalendarItem.date || '-'}</span></p>
              <p className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3"><span className="font-bold text-slate-900">Time</span><span>{selectedCalendarItem.startTime || '-'} - {selectedCalendarItem.endTime || '-'}</span></p>
              {selectedCalendarItem.kind === 'booking' ? <p className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3"><span className="font-bold text-slate-900">Location</span><span>{selectedCalendarItem.location || 'At Gurdwara'}</span></p> : null}
              <p className="flex items-center justify-between gap-4"><span className="font-bold text-slate-900">Type</span><span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: selectedCalendarItem.color }}>{selectedCalendarItem.kind === 'event' ? 'Event' : 'Booking'}</span></p>
            </div>
          </div>
        </div>
      ) : null}
      {createMutation.isPending ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" role="status" aria-live="assertive" aria-label="Saving booking request">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-blue-200 bg-white shadow-2xl">
            <div className="h-1.5 w-full overflow-hidden bg-blue-100">
              <div className="h-full w-1/2 animate-pulse bg-brand-saffron" />
            </div>
            <div className="flex flex-col items-center px-6 py-8 text-center">
              <div className="relative flex h-16 w-16 items-center justify-center">
                <span className="absolute inset-0 animate-spin rounded-full border-4 border-blue-100 border-t-brand-blue" />
                <span className="h-7 w-7 rounded-full bg-brand-saffron/20 ring-4 ring-brand-saffron/10" />
              </div>
              <h3 className="mt-5 font-heading text-xl font-bold text-slate-900">Saving your booking</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">Please wait while we securely submit your request. Keep this window open.</p>
            </div>
          </div>
        </div>
      ) : null}
      <ZeffyDonationModal isOpen={isZeffyModalOpen} formUrl={zeffyFormUrl} onClose={() => setIsZeffyModalOpen(false)} />
    </div>
  );
};

export default BookingsPage;
