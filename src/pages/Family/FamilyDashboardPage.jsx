import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowDownTrayIcon, CalendarDaysIcon, HandRaisedIcon, BanknotesIcon, DocumentArrowDownIcon, EnvelopeIcon, EyeIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Seo from '../../components/common/Seo';
import PageHero from '../../components/common/PageHero';
import useSeoMeta from '../../hooks/useSeoMeta';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import eventService from '../../services/eventService';
import donationService from '../../services/donationService';
import volunteerService from '../../services/volunteerService';
import bookingService from '../../services/bookingService';
import { downloadCsv, downloadDonationInvoicePdf, downloadMembershipFeeInformationPdf } from '../../utils/csvExport';
import { siteConfig } from '../../constants/siteConfig';
import { isEventCurrent } from '../../utils/eventAvailability';
import { bookingBelongsToProfile, isBookingArchived, isBookingPaymentDonation, sortBookingsBySchedule } from '../../utils/profileBookings';
import langarService, { LANGAR_CONTRIBUTIONS_RESOURCE } from '../../services/langarService';
import CommunityAnnouncementRequestCard from '../../components/communityAnnouncements/CommunityAnnouncementRequestCard';
import FamilyReadingProgressCard from '../../components/recitation/FamilyReadingProgressCard';

const toDateKey = (value) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const bookingStatusPillClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'confirmed') {
    return 'border-emerald-300 bg-emerald-500 text-white';
  }
  if (normalized === 'cancelled') {
    return 'border-rose-300 bg-rose-500 text-white';
  }
  return 'border-amber-300 bg-amber-400 text-slate-950';
};

const paymentStatusPillClass = (status) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'paid') {
    return 'border-emerald-300 bg-emerald-500 text-white';
  }
  if (normalized === 'refunded') {
    return 'border-cyan-300 bg-cyan-500 text-slate-950';
  }
  if (normalized === 'partial') {
    return 'border-orange-300 bg-orange-400 text-slate-950';
  }
  return 'border-slate-300 bg-slate-200 text-slate-800';
};

const parseTimeTokenToMinutes = (token) => {
  const raw = String(token || '').trim().toLowerCase();
  if (!raw) {
    return null;
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] || '0');
  const meridiem = String(match[3] || '').toLowerCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem) {
    if (hour < 1 || hour > 12) {
      return null;
    }
    if (meridiem === 'am') {
      hour = hour % 12;
    } else {
      hour = (hour % 12) + 12;
    }
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
};

const extractRangeEndMinutes = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const parts = raw.split(/\s*-\s*/);
  if (parts.length < 2) {
    return null;
  }

  const endRaw = parts[parts.length - 1] || '';
  const startRaw = parts[0] || '';
  const endHasMeridiem = /\b(am|pm)\b/i.test(endRaw);
  const startMeridiemMatch = startRaw.match(/\b(am|pm)\b/i);
  const normalizedEnd = endHasMeridiem || !startMeridiemMatch
    ? endRaw
    : `${endRaw} ${startMeridiemMatch[1]}`;

  return parseTimeTokenToMinutes(normalizedEnd);
};

const nowLocalMinutes = () => {
  const now = new Date();
  return (now.getHours() * 60) + now.getMinutes();
};

const BookingHistoryRows = ({ bookings, onView, emptyMessage }) => (
  <div className="mt-3 space-y-2">
    {bookings.map((booking) => (
      <div key={booking.id} className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-800">{booking.title || booking.categoryName || 'Booking'}</p>
            <p className="mt-0.5 text-xs text-slate-600">{booking.date || 'Date not set'}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-brand-blue">Type: {booking.categoryName || 'Other'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase shadow-sm ${bookingStatusPillClass(booking.status)}`}>{booking.status || 'pending'}</span>
            <button type="button" onClick={(event) => onView(booking, event.currentTarget)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-blue/25 bg-blue-50 text-brand-blue transition hover:border-brand-blue hover:bg-brand-blue hover:text-white" aria-label={`View booking details for ${booking.title || booking.categoryName || 'booking'}`} title="View booking details"><EyeIcon className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    ))}
    {bookings.length === 0 ? <p className="text-sm text-slate-500">{emptyMessage}</p> : null}
  </div>
);

const FamilyDashboardPage = () => {
  const meta = useSeoMeta('Family Dashboard', 'Track your family event RSVPs, waitlists, seva applications, and donations in one view.');
  const { user, isAuthenticated } = useAuth();
  const { branding } = useBranding();
  const queryClient = useQueryClient();
  const [donationPage, setDonationPage] = useState(1);
  const [calendarNotice, setCalendarNotice] = useState({ type: '', message: '' });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [bookingArchiveOpen, setBookingArchiveOpen] = useState(false);
  const bookingArchiveDialogRef = useRef(null);
  const bookingDetailDialogRef = useRef(null);
  const bookingArchiveReturnFocusRef = useRef(null);
  const bookingDetailReturnFocusRef = useRef(null);
  const openBookingDetails = (booking, trigger) => {
    bookingDetailReturnFocusRef.current = trigger;
    setSelectedBooking(booking);
  };
  const donationsPerPage = 6;
  const userDisplayName = String(user?.name || 'Member').trim() || 'Member';
  const userAvatarUrl = String(user?.avatarUrl || user?.picture || user?.photoURL || user?.imageUrl || user?.profileImageUrl || '').trim();
  const isMember = String(user?.role || '').trim().toLowerCase() === 'member';

  const email = String(user?.email || '').toLowerCase();
  const userName = String(user?.name || '').trim().toLowerCase();
  const userPhone = String(user?.phone || '').trim().toLowerCase();
  const userPhoneDigits = userPhone.replace(/\D/g, '');

  const { data: events = [] } = useQuery({
    queryKey: ['events', 'family-dashboard'],
    queryFn: () => eventService.getEvents({ includeInactive: true }).then((res) => res.data),
    enabled: isAuthenticated
  });

  const { data: sevaApplications = [] } = useQuery({
    queryKey: ['admin-volunteers', 'family-dashboard'],
    queryFn: () => volunteerService.getApplications().then((res) => res.data),
    enabled: isAuthenticated
  });

  const { data: allSevaOpportunities = [] } = useQuery({
    queryKey: ['seva-opportunities', 'family-dashboard', 'all-statuses'],
    queryFn: () => volunteerService.getSevaOpportunities({ includeInactive: true, includeClosed: true }).then((res) => res.data),
    enabled: isAuthenticated
  });

  const { data: donations = [] } = useQuery({
    queryKey: ['family-dashboard-donations'],
    queryFn: () => donationService.getDonations().then((res) => res.data),
    enabled: isAuthenticated
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ['bookings', 'family-dashboard'],
    queryFn: () => bookingService.getBookings().then((res) => res.data),
    enabled: isAuthenticated
  });
  const { data: langarContributions = [] } = useQuery({
    queryKey: ['family-dashboard-langar-contributions', LANGAR_CONTRIBUTIONS_RESOURCE],
    queryFn: () => langarService.getContributions().then((res) => res.data),
    enabled: isAuthenticated,
    refetchInterval: 15000
  });

  const familyEventRegistrations = useMemo(() => {
    if (!isAuthenticated) {
      return [];
    }

    const rows = [];
    events.filter((event) => isEventCurrent(event)).forEach((event) => {
      const registrants = Array.isArray(event.registrants) ? event.registrants : [];
      registrants.forEach((entry) => {
        const entryName = String(entry.name || '').trim().toLowerCase();
        const entryContact = String(entry.contact || entry.phone || entry.whatsapp || '').trim().toLowerCase();
        const entryContactDigits = entryContact.replace(/\D/g, '');
        const entryEmail = String(entry.email || '').trim().toLowerCase();
        const hasEntryIdentifier = Boolean(entryEmail || entryContactDigits || entryContact);

        let belongsToUser = false;

        if (email && (entryEmail === email || entryContact === email)) {
          belongsToUser = true;
        }

        if (!belongsToUser && userPhoneDigits && entryContactDigits && userPhoneDigits === entryContactDigits) {
          belongsToUser = true;
        }

        if (!belongsToUser && userPhone && entryContact && userPhone === entryContact) {
          belongsToUser = true;
        }

        if (!belongsToUser && !hasEntryIdentifier) {
          belongsToUser = Boolean(userName && entryName === userName);
        }

        if (!belongsToUser) {
          return;
        }

        rows.push({
          registrantId: entry.id,
          eventId: event.id,
          eventTitle: event.title,
          eventDate: event.date,
          location: event.location,
          contact: entry.contact || entry.email || '',
          createdAt: entry.createdAt || ''
        });
      });
    });

    return rows.sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  }, [events, isAuthenticated, email, userName, userPhone, userPhoneDigits]);

  const familySevaApplications = useMemo(() => {
    if (!isAuthenticated) {
      return [];
    }

    const todayDateKey = toDateKey(Date.now());
    const opportunitiesById = new Map(
      allSevaOpportunities.map((item) => [String(item?.id || ''), item])
    );

    return sevaApplications.filter((entry) => {
      const entryEmail = String(entry.email || '').trim().toLowerCase();
      const entryPhoneRaw = String(entry.phone || entry.whatsapp || '').trim().toLowerCase();
      const entryPhoneDigits = entryPhoneRaw.replace(/\D/g, '');
      const entryName = String(entry.name || '').trim().toLowerCase();
      const hasUserIdentifier = Boolean(email || userPhoneDigits || userPhone);
      const hasEntryIdentifier = Boolean(entryEmail || entryPhoneDigits || entryPhoneRaw);

      let belongsToUser = false;

      if (email && entryEmail === email) {
        belongsToUser = true;
      }

      if (!belongsToUser && userPhoneDigits && entryPhoneDigits && userPhoneDigits === entryPhoneDigits) {
        belongsToUser = true;
      }

      if (!belongsToUser && userPhone && entryPhoneRaw && userPhone === entryPhoneRaw) {
        belongsToUser = true;
      }

      if (!belongsToUser) {
        belongsToUser = !hasUserIdentifier && !hasEntryIdentifier && userName && entryName === userName;
      }

      if (!belongsToUser) {
        return false;
      }

      const linkedOpportunity = opportunitiesById.get(String(entry.opportunityId || ''));
      if (linkedOpportunity) {
        return !linkedOpportunity.isClosed && linkedOpportunity.active !== false;
      }

      const sevaDateKey = toDateKey(entry.sevaDate || entry.date);
      if (!sevaDateKey) {
        return true;
      }

      if (sevaDateKey === todayDateKey) {
        const endMinutes = extractRangeEndMinutes(entry.sevaTime || entry.time);
        if (Number.isFinite(endMinutes) && nowLocalMinutes() > endMinutes) {
          return false;
        }
      }

      return sevaDateKey >= todayDateKey;
    });
  }, [sevaApplications, isAuthenticated, email, userName, userPhone, userPhoneDigits, allSevaOpportunities]);

  const familyBookings = useMemo(() => {
    if (!isAuthenticated) {
      return [];
    }
    return sortBookingsBySchedule(
      bookings.filter((booking) => bookingBelongsToProfile(booking, user || {})),
      'desc'
    );
  }, [bookings, isAuthenticated, user]);

  const bookingNow = new Date();
  const currentBookings = familyBookings.filter((booking) => !isBookingArchived(booking, bookingNow));
  const archivedBookings = familyBookings.filter((booking) => isBookingArchived(booking, bookingNow));

  const familyDonations = useMemo(() => {
    if (!isAuthenticated) {
      return [];
    }

    return donations
      .filter((entry) => String(entry.donorEmail || '').trim().toLowerCase() === email && !isBookingPaymentDonation(entry, familyBookings))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [donations, email, familyBookings, isAuthenticated]);

  const donationTotal = useMemo(
    () => familyDonations.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [familyDonations]
  );
  const familyLangarContributions = useMemo(() => langarContributions
    .filter((entry) => String(entry.donorEmail || '').trim().toLowerCase() === email)
    .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()), [email, langarContributions]);
  const langarContributionTotal = useMemo(
    () => familyLangarContributions.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
    [familyLangarContributions]
  );
  const membershipRenewals = useMemo(() => (
    isMember && Array.isArray(user?.membershipFeeRecords)
      ? user.membershipFeeRecords
        .filter((entry) => String(entry?.membershipEntryType || '').trim().toLowerCase() === 'renew'
          && String(entry?.status || '').trim().toLowerCase() === 'paid')
        .sort((left, right) => new Date(right.paymentDate || right.updatedAt || 0).getTime() - new Date(left.paymentDate || left.updatedAt || 0).getTime())
      : []
  ), [isMember, user?.membershipFeeRecords]);

  useEffect(() => {
    if (!selectedBooking && !bookingArchiveOpen) {
      return undefined;
    }
    const dialog = selectedBooking ? bookingDetailDialogRef.current : bookingArchiveDialogRef.current;
    const previousFocus = selectedBooking ? bookingDetailReturnFocusRef.current : bookingArchiveReturnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element) => !element.contains(dialog))
      .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') }));
    background.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });
    document.body.style.overflow = 'hidden';
    const focusableElements = () => Array.from(dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    if (!dialog.contains(document.activeElement)) {
      (focusableElements()[0] || dialog).focus();
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (selectedBooking) {
          setSelectedBooking(null);
        } else {
          setBookingArchiveOpen(false);
        }
      } else if (event.key === 'Tab') {
        const elements = focusableElements();
        const first = elements[0] || dialog;
        const last = elements[elements.length - 1] || dialog;
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
      background.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) {
          element.removeAttribute('aria-hidden');
        } else {
          element.setAttribute('aria-hidden', ariaHidden);
        }
      });
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, [selectedBooking, bookingArchiveOpen]);

  const exportFamilyEventsCsv = () => {
    downloadCsv({
      fileName: 'family-event-registrations.csv',
      headers: ['Event', 'Date', 'Location', 'Contact', 'Registered At'],
      rows: familyEventRegistrations.map((entry) => ([
        entry.eventTitle || '',
        entry.eventDate ? format(new Date(entry.eventDate), 'yyyy-MM-dd HH:mm') : '',
        entry.location || '',
        entry.contact || '',
        entry.createdAt ? format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm') : ''
      ]))
    });
  };

  const exportFamilySevaCsv = () => {
    downloadCsv({
      fileName: 'family-seva-applications.csv',
      headers: ['Seva Type', 'Date', 'Time', 'Status', 'Submitted'],
      rows: familySevaApplications.map((entry) => ([
        entry.sevaType || entry.area || '',
        entry.sevaDate || '',
        entry.sevaTime || '',
        entry.status || '',
        entry.createdAt ? format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm') : (entry.date || '')
      ]))
    });
  };

  const exportFamilyDonationsCsv = () => {
    downloadCsv({
      fileName: 'family-donations.csv',
      headers: ['Campaign', 'Amount', 'Status', 'Frequency', 'Date'],
      rows: familyDonations.map((entry) => ([
        entry.campaignName || 'General Donation',
        Number(entry.amount || 0).toFixed(2),
        entry.paymentStatus || 'PAID',
        entry.frequency || 'one-time',
        entry.createdAt ? format(new Date(entry.createdAt), 'yyyy-MM-dd HH:mm') : ''
      ]))
    });
  };

  const handleDownloadInvoice = (entry) => {
    void downloadDonationInvoicePdf({
      fileName: `invoice-${entry.receiptId || entry.id}.pdf`,
      organizationName: siteConfig.name,
      address: branding.address || siteConfig.contact.address,
      phone: siteConfig.contact.phone,
      donation: entry,
      campaignDescription: ''
    }).catch(() => null);
  };

  const handleDownloadMembershipRenewal = (entry) => {
    void downloadMembershipFeeInformationPdf({
      user: { ...user, membershipFeeRecords: [entry] },
      organizationName: siteConfig.name,
      address: branding.address || siteConfig.contact.address,
      phone: siteConfig.contact.phone,
      email: siteConfig.contact.email
    }).catch(() => null);
  };

  const removeEventRegistrationMutation = useMutation({
    mutationFn: ({ eventId, registrantId }) => eventService.removeEventRegistrant({ eventId, registrantId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
    onError: (error) => {
      window.alert(error?.message || 'Unable to remove this registration right now.');
    }
  });

  const removeSevaApplicationMutation = useMutation({
    mutationFn: ({ id }) => volunteerService.removeApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-volunteers'] });
      queryClient.invalidateQueries({ queryKey: ['family-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['seva-opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['navbar-family-events'] });
      queryClient.invalidateQueries({ queryKey: ['navbar-family-donations'] });
    },
    onError: (error) => {
      window.alert(error?.message || 'Unable to remove this seva application right now.');
    }
  });

  const handleNotGoing = (entry) => {
    if (!entry?.eventId || !entry?.registrantId) {
      window.alert('Unable to remove this registration because details are missing.');
      return;
    }

    removeEventRegistrationMutation.mutate({
      eventId: entry.eventId,
      registrantId: entry.registrantId
    });
  };

  const handleNotAttendingSeva = (entry) => {
    if (!entry?.id) {
      window.alert('Unable to remove this seva application because details are missing.');
      return;
    }

    removeSevaApplicationMutation.mutate({ id: entry.id });
  };

  const totalDonationPages = Math.max(1, Math.ceil(familyDonations.length / donationsPerPage));
  const safeDonationPage = Math.min(donationPage, totalDonationPages);
  const paginatedDonations = useMemo(() => {
    const startIndex = (safeDonationPage - 1) * donationsPerPage;
    return familyDonations.slice(startIndex, startIndex + donationsPerPage);
  }, [familyDonations, safeDonationPage]);

  useEffect(() => {
    if (donationPage > totalDonationPages) {
      setDonationPage(totalDonationPages);
    }
  }, [donationPage, totalDonationPages]);

  useEffect(() => {
    if (!calendarNotice.message) {
      return undefined;
    }

    const timerId = window.setTimeout(() => {
      setCalendarNotice({ type: '', message: '' });
    }, 4200);

    return () => window.clearTimeout(timerId);
  }, [calendarNotice]);

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <Seo {...meta} />
        <PageHero title="Family Dashboard" description="Please sign in to view your family activity." />
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
          <p>You need to sign in before accessing the family dashboard.</p>
          <Link to="/login" className="mt-3 inline-flex rounded-lg bg-brand-blue px-3 py-2 font-semibold text-white">Go to Login</Link>
        </div>
      </div>
    );
  }

  const formatSevaDateLabel = (value) => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return String(value || '-');
    }
    return format(parsed, 'EEE, MMM d yyyy');
  };

  const handleAddEventToCalendar = async (entry) => {
    if (!entry?.eventId) {
      setCalendarNotice({ type: 'error', message: 'Unable to add this event to calendar right now.' });
      return;
    }

    try {
      const response = await eventService.downloadEventCalendar(entry.eventId);
      const source = response?.data;
      const blob = source instanceof Blob
        ? source
        : new Blob([source], { type: 'text/calendar;charset=utf-8' });
      const fileUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = fileUrl;
      const safeTitle = String(entry.eventTitle || 'event')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'event';
      link.download = `${safeTitle}.ics`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(fileUrl), 1200);

      setCalendarNotice({ type: 'success', message: 'Calendar file downloaded. Open it to add the event.' });
    } catch {
      setCalendarNotice({ type: 'error', message: 'Unable to download calendar file. Please try again.' });
    }
  };

  const exportButtons = (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
      <button
        type="button"
        onClick={exportFamilyEventsCsv}
        className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-saffron hover:text-brand-navy sm:w-auto"
      >
        <CalendarDaysIcon className="h-3.5 w-3.5" />
        <span>Export Events CSV</span>
      </button>
      <button
        type="button"
        onClick={exportFamilySevaCsv}
        className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-saffron hover:text-brand-navy sm:w-auto"
      >
        <HandRaisedIcon className="h-3.5 w-3.5" />
        <span>Export Seva CSV</span>
      </button>
      <button
        type="button"
        onClick={exportFamilyDonationsCsv}
        className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-bold text-white transition hover:bg-brand-saffron hover:text-brand-navy sm:w-auto"
      >
        <BanknotesIcon className="h-3.5 w-3.5" />
        <span>Export Donations CSV</span>
        <ArrowDownTrayIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Seo {...meta} />
      <PageHero
        title="Family Dashboard"
        description=""
        containerClassName="w-full"
        titleActions={exportButtons}
      />

      <section className="rounded-2xl border border-brand-blue/20 bg-gradient-to-r from-blue-50 via-white to-amber-50 p-4 md:p-5">
        <div className="flex flex-wrap items-start gap-4 md:gap-5">
          <div className="h-20 w-20 overflow-hidden rounded-2xl border-2 border-brand-saffron bg-brand-blue/10 md:h-24 md:w-24">
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={userDisplayName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-black text-brand-blue md:text-3xl">
                {String(userDisplayName.charAt(0) || 'M').toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-[220px] flex-1">
            <p className="text-sm font-bold uppercase tracking-widest text-brand-blue/80">Sat Sri Akal,</p>
            <h2 className="text-2xl font-black text-slate-900 md:text-3xl">{userDisplayName}</h2>
            <p className="mt-1 text-sm text-slate-700">
              You currently have {familyEventRegistrations.length} event RSVP{familyEventRegistrations.length === 1 ? '' : 's'}, {familySevaApplications.length} seva application{familySevaApplications.length === 1 ? '' : 's'}, {familyBookings.length} booking{familyBookings.length === 1 ? '' : 's'}, and {familyDonations.length} donation record{familyDonations.length === 1 ? '' : 's'}.
            </p>
            <div className="mt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick Links</p>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Link to="/events" className="group inline-flex min-h-[58px] items-center gap-2 rounded-xl border-2 border-blue-700 bg-gradient-to-r from-blue-700 to-blue-600 px-2.5 py-2 text-xs font-extrabold text-white shadow-md shadow-blue-900/15 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15"><CalendarDaysIcon className="h-5 w-5" /></span>
                  <span className="leading-tight">View Events</span>
                </Link>
                <Link to="/seva" className="group inline-flex min-h-[58px] items-center gap-2 rounded-xl border-2 border-emerald-500 bg-gradient-to-r from-emerald-500 to-green-600 px-2.5 py-2 text-xs font-extrabold text-white shadow-md shadow-emerald-900/15 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15"><HandRaisedIcon className="h-5 w-5" /></span>
                  <span className="leading-tight">Explore Seva</span>
                </Link>
                <Link to="/donation" className="group inline-flex min-h-[58px] items-center gap-2 rounded-xl border-2 border-amber-500 bg-gradient-to-r from-amber-400 to-yellow-400 px-2.5 py-2 text-xs font-extrabold text-slate-950 shadow-md shadow-amber-900/15 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-950/10"><BanknotesIcon className="h-5 w-5" /></span>
                  <span className="leading-tight">Give Donation</span>
                </Link>
                <Link to="/contact" className="group inline-flex min-h-[58px] items-center gap-2 rounded-xl border-2 border-rose-600 bg-gradient-to-r from-rose-600 to-pink-600 px-2.5 py-2 text-xs font-extrabold text-white shadow-md shadow-rose-900/15 transition hover:-translate-y-0.5 hover:shadow-lg">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15"><EnvelopeIcon className="h-5 w-5" /></span>
                  <span className="leading-tight">Contact Committee</span>
                </Link>
              </div>
            </div>
          </div>

        </div>
      </section>

      <CommunityAnnouncementRequestCard />

      <FamilyReadingProgressCard />

      <section className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <article className="rounded-2xl border border-brand-blue/20 bg-gradient-to-br from-blue-50 via-white to-blue-100 p-5">
            <h2 className="text-2xl font-black text-brand-blue">Event Registrations</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total RSVPs: {familyEventRegistrations.length}</p>
            {calendarNotice.message ? (
              <p className={`mt-2 rounded-lg border px-3 py-2 text-xs font-semibold ${calendarNotice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
                {calendarNotice.message}
              </p>
            ) : null}
            <div className="mt-3 space-y-2">
              {familyEventRegistrations.map((entry, index) => (
                <div key={`${entry.eventId}-${index}`} className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-800">{entry.eventTitle}</p>
                    <button
                      type="button"
                      onClick={() => handleNotGoing(entry)}
                      aria-label="Remove event registration"
                      disabled={removeEventRegistrationMutation.isPending}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircleIcon className="h-3.5 w-3.5" />
                      <span>
                        {removeEventRegistrationMutation.isPending && removeEventRegistrationMutation.variables?.registrantId === entry.registrantId
                          ? 'Removing...'
                          : 'Not Going'}
                      </span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-600">{entry.location || 'Location TBD'} • {format(new Date(entry.eventDate), 'EEE, MMM d yyyy, h:mm a')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {entry.eventId ? (
                      <button
                        type="button"
                        onClick={() => {
                          void handleAddEventToCalendar(entry);
                        }}
                        className="inline-flex text-[11px] font-semibold text-brand-blue underline underline-offset-2"
                      >
                        Add to calendar
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
              {familyEventRegistrations.length === 0 ? <p className="text-sm text-slate-500">No event registrations found for your profile yet.</p> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50 via-white to-amber-100 p-5">
            <h2 className="text-2xl font-black text-brand-blue">Seva Applications</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total applications: {familySevaApplications.length}</p>
            <div className="mt-3 space-y-2">
              {familySevaApplications.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{entry.sevaType || entry.area || 'Seva'}</p>
                      <p className="text-xs text-slate-600">{formatSevaDateLabel(entry.sevaDate || entry.date)} • {entry.sevaTime || '-'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNotAttendingSeva(entry)}
                      aria-label="Remove seva application"
                      disabled={removeSevaApplicationMutation.isPending}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-300 px-2 py-0.5 text-[11px] font-semibold text-red-700 transition hover:border-red-400 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <XCircleIcon className="h-3.5 w-3.5" />
                      <span>
                        {removeSevaApplicationMutation.isPending && removeSevaApplicationMutation.variables?.id === entry.id
                          ? 'Removing...'
                          : 'Not Attending'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
              {familySevaApplications.length === 0 ? <p className="text-sm text-slate-500">No seva applications found for your profile yet.</p> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50 via-white to-blue-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-black text-brand-blue">Booking History</h2>
              <button type="button" onClick={(event) => { bookingArchiveReturnFocusRef.current = event.currentTarget; setBookingArchiveOpen(true); }} aria-haspopup="dialog" className="rounded-full border border-brand-blue/25 bg-white px-3 py-1.5 text-xs font-bold text-brand-blue transition hover:bg-blue-50">Archived</button>
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Current / upcoming bookings: {currentBookings.length}</p>
            <BookingHistoryRows bookings={currentBookings} onView={openBookingDetails} emptyMessage={familyBookings.length === 0 ? 'No bookings found for your profile yet.' : 'No current or upcoming bookings for your profile.'} />
          </article>

          <article className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-emerald-100 p-5">
            <h2 className="text-2xl font-black text-brand-blue">Donations</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Records: {familyDonations.length}</p>
            <p className="mt-2 text-[2rem] font-black leading-none text-emerald-700 md:text-[2.4rem]">${donationTotal.toFixed(2)}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total contributed</p>
          </article>

          <article className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-orange-100 p-5">
            <h2 className="text-2xl font-black text-brand-blue">Langar Contributions</h2>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Commitments made: {familyLangarContributions.length}</p>
            <p className="mt-2 text-[2rem] font-black leading-none text-amber-700 md:text-[2.4rem]">{langarContributionTotal}</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total units committed</p>
            <div className="mt-3 space-y-2">
              {familyLangarContributions.slice(0, 3).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-white/90 px-3 py-2 text-xs">
                  <span className="font-semibold text-slate-800">{entry.itemName} · {entry.quantity} {entry.unit}</span>
                  <span className="text-slate-500">{entry.createdAt ? format(new Date(entry.createdAt), 'MMM d, yyyy') : '-'}</span>
                </div>
              ))}
              {familyLangarContributions.length === 0 ? <p className="text-sm text-slate-500">No Langar contributions found for your profile yet.</p> : null}
            </div>
          </article>

          {isMember ? (
            <article className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-blue-50 p-5">
              <h2 className="text-2xl font-black text-brand-blue">Membership Renewal Receipts</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Paid renewals only</p>
              <div className="mt-3 space-y-2">
                {membershipRenewals.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{entry.receiptNumber || 'Membership renewal'}</p>
                      <p className="text-xs text-slate-600">{entry.paymentDate ? format(new Date(entry.paymentDate), 'MMM d, yyyy') : 'Date unavailable'} · {entry.currency || 'CAD'} {Number(entry.amount || 0).toFixed(2)}</p>
                    </div>
                    <button type="button" onClick={() => handleDownloadMembershipRenewal(entry)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-blue/20 px-3 py-1 text-xs font-semibold text-brand-blue transition hover:border-brand-blue hover:bg-brand-blue hover:text-white">
                      <DocumentArrowDownIcon className="h-4 w-4" />
                      Receipt
                    </button>
                  </div>
                ))}
                {membershipRenewals.length === 0 ? <p className="text-sm text-slate-500">No paid membership renewals are available yet.</p> : null}
              </div>
            </article>
          ) : null}
        </div>

        <article className="rounded-2xl border border-brand-blue/20 bg-gradient-to-br from-blue-50 via-white to-amber-100 p-5">
          <h2 className="text-2xl font-black text-brand-blue">Donation History</h2>
          <div className="mt-3 space-y-2">
            {paginatedDonations.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200/80 bg-white/90 px-3 py-1.5 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-800">{entry.campaignName || 'General Donation'}</p>
                    <p className="text-xs text-slate-600">{entry.createdAt ? format(new Date(entry.createdAt), 'EEE, MMM d yyyy, h:mm a') : '-'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-extrabold text-emerald-700">${Number(entry.amount || 0).toFixed(2)}</p>
                    <span className="inline-flex rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      {String(entry.paymentStatus || 'PAID')}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDownloadInvoice(entry)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/20 px-2 py-1 text-[11px] font-semibold text-brand-blue transition hover:border-brand-blue hover:bg-brand-blue hover:text-white sm:px-3 sm:text-xs"
                      title="Download invoice PDF"
                    >
                      <DocumentArrowDownIcon className="h-4 w-4" />
                      <span>Invoice</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {familyDonations.length === 0 ? <p className="text-sm text-slate-500">No donations found for your profile yet.</p> : null}
          </div>
          {familyDonations.length > donationsPerPage ? (
            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Page {safeDonationPage} of {totalDonationPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDonationPage((prev) => Math.max(1, prev - 1))}
                  disabled={safeDonationPage === 1}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setDonationPage((prev) => Math.min(totalDonationPages, prev + 1))}
                  disabled={safeDonationPage === totalDonationPages}
                  className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </article>
      </section>

      {bookingArchiveOpen ? createPortal(
        <div hidden={Boolean(selectedBooking)} className="fixed inset-0 z-[280] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setBookingArchiveOpen(false)}>
          <div className="flex min-h-full items-center justify-center py-4">
            <div ref={bookingArchiveDialogRef} role="dialog" aria-modal="true" aria-labelledby="booking-archive-title" tabIndex={-1} className="w-full max-w-3xl rounded-2xl border border-white/20 bg-white p-5 shadow-2xl sm:p-7" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 id="booking-archive-title" className="text-2xl font-black text-brand-blue">Archived Bookings</h2>
                  <p className="mt-1 text-sm text-slate-600">Past and cancelled bookings: {archivedBookings.length}</p>
                </div>
                <button type="button" onClick={() => setBookingArchiveOpen(false)} aria-label="Close archived bookings" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-300 text-brand-blue hover:bg-blue-50"><XMarkIcon className="h-5 w-5" /></button>
              </div>
              <BookingHistoryRows bookings={archivedBookings} onView={openBookingDetails} emptyMessage="No archived bookings found for your profile yet." />
              <div className="mt-4 flex justify-end"><button type="button" onClick={() => setBookingArchiveOpen(false)} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-bold text-white hover:bg-blue-700">Close</button></div>
            </div>
          </div>
        </div>, document.body
      ) : null}

      {selectedBooking ? createPortal(
        <div className="fixed inset-0 z-[280] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setSelectedBooking(null)}>
          <div className="flex min-h-full items-center justify-center py-4">
            <div ref={bookingDetailDialogRef} role="dialog" aria-modal="true" aria-labelledby="booking-detail-title" tabIndex={-1} className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/20 bg-white shadow-[0_28px_80px_rgba(2,6,23,0.42)]" onClick={(event) => event.stopPropagation()}>
              <div className="relative overflow-hidden bg-[#052f63] px-5 py-5 text-white sm:px-7">
                <div className="absolute inset-y-0 right-0 w-40 bg-brand-saffron/25 [clip-path:polygon(45%_0,100%_0,100%_100%,0_100%)]" />
                <div className="relative flex items-start justify-between gap-4">
                  <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-100">Booking Details</p><h2 id="booking-detail-title" className="mt-1 truncate font-heading text-2xl font-bold">{selectedBooking.title || selectedBooking.categoryName || 'Booking'}</h2><p className="mt-1 text-sm text-blue-100">{selectedBooking.date || 'Date not set'} · {selectedBooking.startTime || '-'} - {selectedBooking.endTime || '-'}</p></div>
                  <button type="button" onClick={() => setSelectedBooking(null)} className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/10 text-white transition hover:bg-white hover:text-brand-blue" aria-label="Close booking details"><XMarkIcon className="h-5 w-5" /></button>
                </div>
                <div className="relative mt-4 flex flex-wrap gap-2"><span className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase shadow-sm ${bookingStatusPillClass(selectedBooking.status)}`}>{selectedBooking.status || 'pending'}</span><span className={`rounded-full border px-3 py-1 text-xs font-extrabold uppercase shadow-sm ${paymentStatusPillClass(selectedBooking.paymentStatus)}`}>Payment: {selectedBooking.paymentStatus || 'pending'}</span><span className="rounded-full border border-amber-300 bg-brand-saffron px-3 py-1 text-xs font-extrabold uppercase text-brand-navy shadow-sm">{selectedBooking.categoryName || 'Other'}</span></div>
              </div>
              <div className="grid gap-4 bg-slate-100/80 p-5 sm:p-7 md:grid-cols-2">
                <section className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm"><h3 className="border-b-2 border-blue-200 pb-2 font-heading text-base font-bold text-brand-blue">Programme</h3><dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="font-semibold text-slate-500">Type</dt><dd className="font-semibold text-slate-900">{selectedBooking.categoryName || '-'}</dd><dt className="font-semibold text-slate-500">Date</dt><dd>{selectedBooking.date || '-'}</dd><dt className="font-semibold text-slate-500">Time</dt><dd>{selectedBooking.startTime || '-'} - {selectedBooking.endTime || '-'}</dd><dt className="font-semibold text-slate-500">Location</dt><dd>{selectedBooking.bookingLocation || '-'}</dd><dt className="font-semibold text-slate-500">Booking ID</dt><dd className="break-all font-mono text-xs">{selectedBooking.id || '-'}</dd></dl></section>
                <section className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm"><h3 className="border-b-2 border-amber-200 pb-2 font-heading text-base font-bold text-brand-blue">Contact</h3><dl className="mt-3 grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="font-semibold text-slate-500">Name</dt><dd>{selectedBooking.requesterName || '-'}</dd><dt className="font-semibold text-slate-500">Email</dt><dd className="break-all">{selectedBooking.requesterEmail || '-'}</dd><dt className="font-semibold text-slate-500">Phone</dt><dd>{selectedBooking.requesterPhone || '-'}</dd><dt className="font-semibold text-slate-500">Address</dt><dd>{selectedBooking.requesterAddress || '-'}</dd><dt className="font-semibold text-slate-500">Requested for</dt><dd>{selectedBooking.bookingForDifferentPerson ? 'Another person' : 'Profile holder'}</dd></dl></section>
                <section className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><h3 className="border-b-2 border-emerald-200 pb-2 font-heading text-base font-bold text-brand-blue">Payment</h3><dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="font-semibold text-slate-500">Amount</dt><dd className="font-bold text-emerald-700">CAD ${Number(selectedBooking.amount || 0).toFixed(2)}</dd><dt className="font-semibold text-slate-500">Method</dt><dd>{selectedBooking.paymentMethod || selectedBooking.paymentProvider || '-'}</dd><dt className="font-semibold text-slate-500">Receipt</dt><dd>{selectedBooking.receiptNumber || '-'}</dd><dt className="font-semibold text-slate-500">Reference</dt><dd className="break-all">{selectedBooking.paymentReference || '-'}</dd>{selectedBooking.refundStatus ? <><dt className="font-semibold text-slate-500">Refund</dt><dd>{selectedBooking.refundStatus === 'processed' ? 'released' : selectedBooking.refundStatus} · CAD ${Number(selectedBooking.refundAmount || 0).toFixed(2)}</dd><dt className="font-semibold text-slate-500">Refund date</dt><dd>{selectedBooking.refundDate || '-'}</dd><dt className="font-semibold text-slate-500">Refund ref.</dt><dd className="break-all">{selectedBooking.refundReference || '-'}</dd><dt className="font-semibold text-slate-500">Refund notes</dt><dd className="whitespace-pre-wrap">{selectedBooking.refundNotes || '-'}</dd></> : null}</dl></section>
                <section className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm"><h3 className="border-b-2 border-cyan-200 pb-2 font-heading text-base font-bold text-brand-blue">Record</h3><dl className="mt-3 grid grid-cols-[90px_1fr] gap-x-3 gap-y-2 text-sm"><dt className="font-semibold text-slate-500">Source</dt><dd>{selectedBooking.source || '-'}</dd><dt className="font-semibold text-slate-500">Created</dt><dd>{selectedBooking.createdAt ? format(new Date(selectedBooking.createdAt), 'MMM d, yyyy, h:mm a') : '-'}</dd><dt className="font-semibold text-slate-500">Updated</dt><dd>{selectedBooking.updatedAt ? format(new Date(selectedBooking.updatedAt), 'MMM d, yyyy, h:mm a') : '-'}</dd><dt className="font-semibold text-slate-500">Notes</dt><dd className="whitespace-pre-wrap">{selectedBooking.notes || 'No additional notes.'}</dd></dl></section>
              </div>
              <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3 sm:px-7"><button type="button" onClick={() => setSelectedBooking(null)} className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700">Close</button></div>
            </div>
          </div>
        </div>, document.body
      ) : null}
    </div>
  );
};

export default FamilyDashboardPage;
