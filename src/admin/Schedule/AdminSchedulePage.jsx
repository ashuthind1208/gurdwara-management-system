import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircleIcon,
  EyeIcon,
  LockClosedIcon,
  PencilSquareIcon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';

const HOURS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const MINUTES = ['00', '15', '30', '45'];
const GURMUKHI_DIGITS = {
  '0': '੦',
  '1': '੧',
  '2': '੨',
  '3': '੩',
  '4': '੪',
  '5': '੫',
  '6': '੬',
  '7': '੭',
  '8': '੮',
  '9': '੯'
};

const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isValidDateKey = (value = '') => /^\d{4}-\d{2}-\d{2}$/.test(value);

const formatDateLabel = (dateKey) => {
  if (!isValidDateKey(dateKey)) {
    return dateKey;
  }
  const date = new Date(`${dateKey}T12:00:00`);
  return date.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const formatWeekday = (dateKey) => {
  if (!isValidDateKey(dateKey)) {
    return '';
  }
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'long' });
};

const getYearDateKeys = (year) => {
  const start = new Date(year, 0, 1, 12, 0, 0);
  const days = [];
  for (let index = 0; index < 365; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.push(toDateKey(date));
  }
  return days;
};

const formatSlotTime = (hour, minute, meridiem) => `${hour}:${minute} ${meridiem}`;

const toGurmukhiDigits = (value = '') => String(value || '').replace(/[0-9]/g, (digit) => GURMUKHI_DIGITS[digit] || digit);

const toPunjabiMeridiem = (meridiem = 'AM') => (String(meridiem).toUpperCase() === 'AM' ? 'ਸਵੇਰੇ' : 'ਸ਼ਾਮ');

const addFifteenMinutes = (hour = '5', minute = '00', meridiem = 'AM') => {
  const safeHour = Number(hour);
  const safeMinute = Number(minute);
  const safeMeridiem = String(meridiem || 'AM').toUpperCase();

  let hour24 = safeHour % 12;
  if (safeMeridiem === 'PM') {
    hour24 += 12;
  }

  const source = new Date();
  source.setHours(hour24, safeMinute, 0, 0);
  source.setMinutes(source.getMinutes() + 15);

  const nextHour24 = source.getHours();
  const nextMinute = String(source.getMinutes()).padStart(2, '0');
  const nextMeridiem = nextHour24 >= 12 ? 'PM' : 'AM';
  const nextHour12 = String(((nextHour24 + 11) % 12) + 1);

  return {
    endHour: nextHour12,
    endMinute: nextMinute,
    endMeridiem: nextMeridiem
  };
};

const parseTimeRange = (value = '') => {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(AM|PM)(?:\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM))?$/i);

  if (!match) {
    return {
      startHour: '5',
      startMinute: '00',
      startMeridiem: 'AM',
      endHour: '5',
      endMinute: '15',
      endMeridiem: 'AM'
    };
  }

  const autoEnd = addFifteenMinutes(match[1], match[2], match[3]);

  return {
    startHour: match[1],
    startMinute: match[2],
    startMeridiem: match[3].toUpperCase(),
    endHour: match[4] || autoEnd.endHour,
    endMinute: match[5] || autoEnd.endMinute,
    endMeridiem: (match[6] || autoEnd.endMeridiem).toUpperCase()
  };
};

const buildTimeRange = (values) => {
  const start = formatSlotTime(values.startHour, values.startMinute, values.startMeridiem);
  const end = formatSlotTime(values.endHour, values.endMinute, values.endMeridiem);
  return `${start} - ${end}`;
};

const buildPunjabiTimeRange = (values) => {
  const start = `${toGurmukhiDigits(values.startHour)}:${toGurmukhiDigits(values.startMinute)} ${toPunjabiMeridiem(values.startMeridiem)}`;
  const end = `${toGurmukhiDigits(values.endHour)}:${toGurmukhiDigits(values.endMinute)} ${toPunjabiMeridiem(values.endMeridiem)}`;
  return `${start} - ${end}`;
};

const buildEmptyEntry = (segment = 'morning') => ({
  id: `schedule-entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  segment,
  timeEn: '',
  timePa: '',
  titleEn: '',
  titlePa: '',
  noteEn: '',
  notePa: '',
  isHighlighted: false,
  isActive: true,
  sortOrder: 0
});

const buildEmptyDay = (dateKey = 'default', entries = []) => ({
  dateKey,
  dateLabel: dateKey === 'default' ? 'Daily Default' : formatDateLabel(dateKey),
  title: dateKey === 'default' ? 'Standard Daily Maryada' : 'Special Day Schedule',
  isSpecial: dateKey !== 'default',
  highlightTitle: '',
  highlightNoteEn: '',
  highlightNotePa: '',
  entries
});

const normalizeEntry = (entry = {}, index = 0) => ({
  ...buildEmptyEntry(entry.segment || 'morning'),
  ...entry,
  isActive: entry.isActive !== false,
  sortOrder: Number.isFinite(Number(entry.sortOrder)) ? Number(entry.sortOrder) : index + 1
});

const entryFormDefaults = {
  segment: 'morning',
  startHour: '5',
  startMinute: '00',
  startMeridiem: 'AM',
  endHour: '5',
  endMinute: '15',
  endMeridiem: 'AM',
  titleEn: '',
  titlePa: ''
};

const statusPillClass = (isActive) => (
  isActive
  ? 'border-green-200 bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-900'
  : 'border-red-200 bg-red-100 text-red-800 hover:bg-red-200 hover:text-red-900'
);
const scheduleButtonClass = 'inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-brand-blue hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';
const scheduleCompactButtonClass = 'inline-flex items-center justify-center rounded-xl border border-sky-200 bg-sky-100 px-3 py-2 text-xs font-semibold text-slate-900 transition hover:bg-brand-blue hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';
const scheduleIconButtonClass = 'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-sky-100 text-slate-900 transition hover:bg-brand-blue hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';

const scheduleTransparentIconButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-slate-900 transition hover:bg-transparent hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300';
const scheduleDeleteIconButtonClass = 'inline-flex h-7 w-7 items-center justify-center rounded-md bg-transparent text-red-600 transition hover:bg-transparent hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300';

const slotAddButtonClass = (tone) => (
  tone === 'sky'
    ? 'inline-flex items-center justify-center rounded-xl border border-[#065985] bg-[#065985] px-3 py-2 text-[11px] font-semibold text-slate-900 transition hover:bg-[#065985] hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300'
    : 'inline-flex items-center justify-center rounded-xl border border-[#92400D] bg-[#92400D] px-3 py-2 text-[11px] font-semibold text-amber-50 transition hover:bg-[#92400D] hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300'
);

const sortEntries = (entries = []) => entries
  .map((entry, index) => normalizeEntry(entry, index))
  .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
  .map((entry, index) => ({ ...entry, sortOrder: index + 1 }));

const AdminSchedulePage = () => {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const todayDateKey = toDateKey(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey(new Date()));
  const [quickDateKey, setQuickDateKey] = useState(toDateKey(new Date()));
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [dayFilter, setDayFilter] = useState('');
  const [page, setPage] = useState(1);
  const [dayModal, setDayModal] = useState({ open: false, mode: 'view' });
  const [entryModal, setEntryModal] = useState({ open: false, mode: 'create', entryId: null, segment: 'morning' });
  const [dayMeta, setDayMeta] = useState({ isSpecial: false, specialReason: '', specialReasonPa: '' });
  const form = useForm({ defaultValues: entryFormDefaults });

  const isPastDateKey = useCallback(
    (dateKey) => dateKey !== 'default' && isValidDateKey(dateKey) && dateKey < todayDateKey,
    [todayDateKey]
  );

  const { data: cmsData } = useQuery({
    queryKey: ['cms-home'],
    queryFn: () => cmsService.getHomeContent().then((res) => res.data)
  });

  const scheduleDays = useMemo(() => Array.isArray(cmsData?.scheduleDays) ? cmsData.scheduleDays : [], [cmsData]);
  const scheduleMap = useMemo(() => {
    const map = new Map();
    scheduleDays.forEach((day) => {
      map.set(day.dateKey, {
        ...day,
        entries: sortEntries(day.entries || [])
      });
    });
    return map;
  }, [scheduleDays]);

  const defaultDay = useMemo(() => (
    scheduleMap.get('default') || buildEmptyDay('default')
  ), [scheduleMap]);

  const selectedDay = useMemo(() => {
    if (selectedDateKey === 'default') {
      return {
        ...defaultDay,
        isSpecial: false,
        entries: sortEntries(defaultDay.entries || [])
      };
    }

    const existing = scheduleMap.get(selectedDateKey);
    if (existing) {
      return {
        ...existing,
        isSpecial: existing.isSpecial !== false,
        entries: sortEntries(existing.entries || [])
      };
    }

    const inheritedDay = resolveScheduleForDate(scheduleDays, selectedDateKey);
    return {
      ...buildEmptyDay(selectedDateKey, inheritedDay?.entries || defaultDay.entries || []),
      isSpecial: false,
      entries: sortEntries(inheritedDay?.entries || defaultDay.entries || [])
    };
  }, [defaultDay, scheduleDays, scheduleMap, selectedDateKey]);

  const saveDayMutation = useMutation({
    mutationFn: ({ nextEntries, meta }) => cmsService.updateSchedule({
      day: {
        ...selectedDay,
        dateKey: selectedDateKey,
        dateLabel: selectedDateKey === 'default' ? 'Daily Default' : formatDateLabel(selectedDateKey),
        title: selectedDateKey === 'default' ? 'Standard Daily Maryada' : (meta?.isSpecial ? 'Special Day Schedule' : 'Daily Schedule'),
        isSpecial: selectedDateKey === 'default' ? false : Boolean(meta?.isSpecial),
        highlightTitle: meta?.isSpecial ? 'Special Day Notice' : '',
        highlightNoteEn: meta?.specialReason || '',
        highlightNotePa: meta?.specialReasonPa || '',
        specialReason: meta?.specialReason || '',
        specialReasonPa: meta?.specialReasonPa || '',
        entries: sortEntries(nextEntries)
      }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
    }
  });

  const removeDayMutation = useMutation({
    mutationFn: () => cmsService.removeScheduleDay(selectedDateKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      setSelectedDateKey(toDateKey(new Date()));
      closeEntryModal();
      closeDayModal();
    }
  });

  const closeEntryModal = () => {
    setEntryModal({ open: false, mode: 'create', entryId: null, segment: 'morning' });
  };

  const closeDayModal = () => {
    setDayModal({ open: false, mode: 'view' });
  };

  const openDayModal = (dateKey, mode = 'view') => {
    const existing = scheduleMap.get(dateKey);
    const defaultSpecial = dateKey !== 'default' && Boolean(existing?.isSpecial);
    const defaultReason = existing?.specialReason || existing?.highlightNoteEn || '';
    const defaultReasonPa = existing?.specialReasonPa || existing?.highlightNotePa || '';
    setDayMeta({
      isSpecial: dateKey === 'default' ? false : defaultSpecial,
      specialReason: dateKey === 'default' ? '' : defaultReason,
      specialReasonPa: dateKey === 'default' ? '' : defaultReasonPa
    });
    setSelectedDateKey(dateKey);
    setDayModal({ open: true, mode });
  };

  const openCreateModal = (segment = 'morning') => {
    form.reset({ ...entryFormDefaults, segment });
    setEntryModal({ open: true, mode: 'create', entryId: null, segment });
  };

  const openEditModal = (entry) => {
    const parsed = parseTimeRange(entry.timeEn);
    form.reset({
      segment: entry.segment || 'morning',
      ...parsed,
      titleEn: entry.titleEn || '',
      titlePa: entry.titlePa || '',
      isActive: entry.isActive !== false
    });
    setEntryModal({ open: true, mode: 'edit', entryId: entry.id, segment: entry.segment || 'morning' });
  };

  const rows = useMemo(() => (Array.isArray(selectedDay.entries) ? selectedDay.entries : []), [selectedDay.entries]);
  const isSelectedDayPast = isPastDateKey(selectedDateKey);
  const isDayModalReadOnly = dayModal.mode === 'view' || isSelectedDayPast;

  const handleSaveEntry = (values) => {
    const existingEntry = entryModal.mode === 'edit' && entryModal.entryId
      ? rows.find((entry) => entry.id === entryModal.entryId)
      : null;

    const nextPayload = {
      segment: entryModal.segment || existingEntry?.segment || values.segment || 'morning',
      timeEn: buildTimeRange(values),
      timePa: buildPunjabiTimeRange(values),
      titleEn: values.titleEn,
      titlePa: values.titlePa,
      noteEn: '',
      notePa: '',
      isHighlighted: false,
      isActive: existingEntry ? existingEntry.isActive !== false : true
    };

    if (entryModal.mode === 'edit' && entryModal.entryId) {
      const nextEntries = sortEntries(rows.map((entry) => (
        entry.id === entryModal.entryId ? { ...entry, ...nextPayload } : entry
      )));
      saveDayMutation.mutate({ nextEntries, meta: dayMeta }, { onSuccess: closeEntryModal });
      return;
    }

    const nextEntries = sortEntries([...rows, normalizeEntry(nextPayload, rows.length)]);
    saveDayMutation.mutate({ nextEntries, meta: dayMeta }, { onSuccess: closeEntryModal });
  };

  const handleDeleteEntry = (entryId) => {
    if (isSelectedDayPast) {
      return;
    }
    const nextEntries = sortEntries(rows.filter((entry) => entry.id !== entryId));
    saveDayMutation.mutate({ nextEntries, meta: dayMeta });
  };

  const handleToggleActive = (entry) => {
    if (isSelectedDayPast) {
      return;
    }
    const nextEntries = sortEntries(rows.map((item) => (
      item.id === entry.id ? { ...item, isActive: item.isActive === false } : item
    )));
    saveDayMutation.mutate({ nextEntries, meta: dayMeta });
  };

  const morningEntries = useMemo(() => rows.filter((entry) => (entry.segment || 'morning') === 'morning'), [rows]);
  const eveningEntries = useMemo(() => rows.filter((entry) => (entry.segment || 'morning') !== 'morning'), [rows]);

  const yearRows = useMemo(() => {
    const dateKeys = getYearDateKeys(yearFilter);
    return dateKeys.map((dateKey) => {
      const day = scheduleMap.get(dateKey);
      const isSpecial = Boolean(day) && day?.isSpecial !== false;
      const effectiveEntries = day?.entries?.length ? day.entries : (defaultDay.entries || []);
      return {
        dateKey,
        weekday: formatWeekday(dateKey),
        type: isSpecial ? 'Special' : 'Default',
        isPast: isPastDateKey(dateKey),
        eventCount: effectiveEntries.filter((item) => item.isActive !== false).length
      };
    });
  }, [defaultDay.entries, isPastDateKey, scheduleMap, yearFilter]);

  const filteredYearRows = useMemo(() => {
    const query = dayFilter.trim().toLowerCase();
    if (!query) {
      return yearRows;
    }

    return yearRows.filter((row) => (
      row.dateKey.toLowerCase().includes(query)
      || row.weekday.toLowerCase().includes(query)
      || row.type.toLowerCase().includes(query)
      || (row.isPast ? 'inactive' : 'active').includes(query)
    ));
  }, [dayFilter, yearRows]);

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(filteredYearRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredYearRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sr-only">Daily Schedule</h1>
      </div>

      <Card className="border border-slate-200 bg-white">
        <div role="group" aria-label="Schedule date and filters" className="flex w-full flex-wrap items-end justify-between gap-3">
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[180px_auto_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Pick Date</span>
              <input
                type="date"
                value={quickDateKey}
                onChange={(event) => setQuickDateKey(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-brand-blue/60 focus:ring-2 focus:ring-brand-blue/20"
              />
            </label>
            <Button
              type="button"
              variant="primary"
              className="h-11 rounded-xl px-4 text-white hover:bg-blue-800 hover:text-white"
              onClick={() => openDayModal(quickDateKey, 'view')}
            >
              View Day
            </Button>
            <Button
              type="button"
              className="h-11 rounded-xl px-4 text-white hover:bg-blue-800 hover:text-white"
              onClick={() => openDayModal(quickDateKey, 'edit')}
            >
              Edit Day
            </Button>
          </div>
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[130px_1fr_auto] sm:items-end">
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Year</span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={yearFilter}
                onChange={(event) => {
                  const nextYear = Number(event.target.value);
                  if (Number.isFinite(nextYear)) {
                    setYearFilter(nextYear);
                    setPage(1);
                  }
                }}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-brand-blue/60 focus:ring-2 focus:ring-brand-blue/20"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              <span className="mb-1 block">Filter Days</span>
              <input
                type="text"
                placeholder="Date, weekday, type, active"
                value={dayFilter}
                onChange={(event) => {
                  setDayFilter(event.target.value);
                  setPage(1);
                }}
                className="h-11 w-full min-w-[220px] rounded-xl border border-slate-300 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-brand-blue/60 focus:ring-2 focus:ring-brand-blue/20"
              />
            </label>
            <Button
              type="button"
              variant="primary"
              className="h-11 rounded-xl px-4 text-white hover:bg-brand-saffron hover:text-slate-900"
              onClick={() => {
                setYearFilter(currentYear);
                setDayFilter('');
                setPage(1);
              }}
            >
              Reset Filters
            </Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Day</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Events</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.dateKey} className={`border-b border-slate-100 ${selectedDateKey === row.dateKey ? 'bg-blue-50/60' : ''}`}>
                  <td className="py-2.5 pr-3 font-semibold text-slate-900">{row.dateKey}</td>
                  <td className="py-2.5 pr-3 text-slate-700">{row.weekday}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${row.type === 'Special' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                      {row.type}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${row.isPast ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-800'}`}>
                      {row.isPast ? <XCircleIcon className="h-3.5 w-3.5" /> : <CheckCircleIcon className="h-3.5 w-3.5" />}
                      {row.isPast ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-slate-700">{row.eventCount}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openDayModal(row.dateKey, 'view')}
                        className={scheduleIconButtonClass}
                        aria-label={`View ${row.dateKey}`}
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openDayModal(row.dateKey, 'edit')}
                        disabled={row.isPast}
                        className={`${scheduleIconButtonClass} ${row.isPast ? 'cursor-not-allowed opacity-50' : ''}`}
                        aria-label={`Edit ${row.dateKey}`}
                      >
                        {row.isPast ? <LockClosedIcon className="h-4 w-4" /> : <PencilSquareIcon className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pagedRows.length === 0 ? (
                <tr>
                  <td className="py-3 text-center text-slate-500" colSpan={6}>No rows match your filter.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filteredYearRows.length)} of {filteredYearRows.length}</p>
          <div className="flex gap-2">
            <Button type="button" onClick={() => setPage((prev) => Math.max(1, prev - 1))} disabled={safePage === 1} className="px-3 py-2 text-xs font-semibold text-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Previous</Button>
            <Button type="button" onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))} disabled={safePage === totalPages} className="px-3 py-2 text-xs font-semibold text-white hover:text-white disabled:cursor-not-allowed disabled:opacity-50">Next</Button>
          </div>
        </div>
      </Card>

      {dayModal.open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeDayModal} aria-hidden="true" />
          <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-7xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-lg font-semibold">{formatDateLabel(selectedDateKey)}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${dayMeta.isSpecial ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                    {dayMeta.isSpecial ? 'Special' : 'Default'}
                  </span>
                  {isSelectedDayPast ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      <LockClosedIcon className="h-3.5 w-3.5" /> Past date locked
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isDayModalReadOnly && selectedDateKey !== 'default' ? (
                  <Button
                    type="button"
                    onClick={() => removeDayMutation.mutate()}
                    disabled={removeDayMutation.isPending}
                    className="h-8 rounded-lg border border-[#065985] bg-[#065985] px-3 text-xs font-semibold text-slate-900 hover:bg-[#065985] hover:text-slate-900"
                  >
                    {removeDayMutation.isPending ? 'Resetting...' : 'Reset To Default'}
                  </Button>
                ) : null}
                <button type="button" onClick={closeDayModal} className="rounded-md bg-sky-100 p-1.5 text-slate-900 hover:bg-brand-blue hover:text-white" aria-label="Close day modal">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.15fr]">
              {!isDayModalReadOnly && selectedDateKey !== 'default' ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 shadow-sm">
                  <div className="grid gap-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Special Day Message (English)
                      <textarea
                        rows={4}
                        value={dayMeta.specialReason}
                        onChange={(event) => setDayMeta((prev) => ({ ...prev, specialReason: event.target.value }))}
                        placeholder="Example: Gurpurab today, special kirtan and langar schedule."
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Special Day Message (Punjabi)
                      <textarea
                        rows={4}
                        value={dayMeta.specialReasonPa}
                        onChange={(event) => setDayMeta((prev) => ({ ...prev, specialReasonPa: event.target.value }))}
                        placeholder="ਉਦਾਹਰਨ: ਅੱਜ ਗੁਰਪੁਰਬ ਹੈ, ਵਿਸ਼ੇਸ਼ ਕੀਰਤਨ ਅਤੇ ਲੰਗਰ ਸਮਾਂ।"
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
                      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="checkbox"
                          checked={dayMeta.isSpecial}
                          onChange={(event) => setDayMeta((prev) => ({ ...prev, isSpecial: event.target.checked }))}
                        />
                        Mark this day as special
                      </label>
                      <Button
                        type="button"
                        onClick={() => saveDayMutation.mutate({ nextEntries: rows, meta: dayMeta })}
                        disabled={saveDayMutation.isPending}
                        className="h-8 rounded-xl border border-[#92400D] bg-[#92400D] px-3 text-xs font-semibold text-amber-50 hover:bg-[#92400D] hover:text-amber-50"
                      >
                        {saveDayMutation.isPending ? 'Saving...' : 'Save Day Details'}
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}

              <div className="space-y-4">
                {[
                  { title: 'Morning', segment: 'morning', entries: morningEntries, tone: 'sky' },
                  { title: 'Evening', segment: 'evening', entries: eveningEntries, tone: 'amber' }
                ].map((group) => (
                  <article key={group.segment} className={`overflow-hidden rounded-2xl border ${group.tone === 'sky' ? 'border-sky-200' : 'border-amber-200'} bg-white shadow-sm`}>
                    <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${group.tone === 'sky' ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide ${group.tone === 'sky' ? 'text-sky-800' : 'text-amber-800'}`}>{group.title}</p>
                        <p className="text-[11px] text-slate-500">{group.entries.length} event{group.entries.length === 1 ? '' : 's'}</p>
                      </div>
                      {!isDayModalReadOnly ? (
                        <Button
                          type="button"
                          onClick={() => openCreateModal(group.segment)}
                          className={slotAddButtonClass(group.tone)}
                        >
                          Add Event
                        </Button>
                      ) : null}
                    </div>
                    <div className="divide-y divide-slate-100">
                      {group.entries.length === 0 ? (
                        <p className="px-3 py-4 text-sm text-slate-500">No {group.title.toLowerCase()} events yet.</p>
                      ) : group.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className={`grid gap-2 px-3 py-2 text-xs ${entry.isCurrent ? 'bg-brand-blue/10' : entry.isHighlighted ? 'bg-blue-50/70' : 'bg-white'} ${entry.isActive === false ? 'opacity-50' : ''} md:grid-cols-[120px_minmax(0,1fr)_auto] md:items-center`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold leading-snug text-slate-900 md:whitespace-nowrap">{entry.timeEn || 'Time TBD'}</p>
                            {entry.timePa ? <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-500 md:whitespace-nowrap">{entry.timePa}</p> : null}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900 md:whitespace-nowrap">{entry.titleEn || 'Untitled schedule item'}</p>
                            {entry.titlePa ? <p className="mt-0.5 truncate text-[11px] text-brand-blue md:whitespace-nowrap">{entry.titlePa}</p> : null}
                            {entry.noteEn ? <p className="mt-0.5 truncate text-[11px] text-slate-600 md:whitespace-nowrap">{entry.noteEn}</p> : null}
                            {entry.notePa ? <p className="mt-0.5 truncate text-[11px] text-slate-500 md:whitespace-nowrap">{entry.notePa}</p> : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 md:justify-end">
                            <button
                              type="button"
                              disabled={isDayModalReadOnly}
                              onClick={() => handleToggleActive(entry)}
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${statusPillClass(entry.isActive !== false)} ${isDayModalReadOnly ? 'cursor-not-allowed opacity-60' : ''}`}
                            >
                              {entry.isActive === false ? <XCircleIcon className="h-3.5 w-3.5" /> : <CheckCircleIcon className="h-3.5 w-3.5" />}
                              {entry.isActive === false ? 'Inactive' : 'Active'}
                            </button>
                            <button
                              type="button"
                              disabled={isDayModalReadOnly}
                              onClick={() => openEditModal(entry)}
                              className={`${scheduleTransparentIconButtonClass} ${isDayModalReadOnly ? 'cursor-not-allowed opacity-50' : ''}`}
                              aria-label="Edit row"
                            >
                              <PencilSquareIcon className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              disabled={isDayModalReadOnly}
                              onClick={() => handleDeleteEntry(entry.id)}
                              className={`${scheduleDeleteIconButtonClass} ${isDayModalReadOnly ? 'cursor-not-allowed opacity-50' : ''}`}
                              aria-label="Delete row"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {entryModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeEntryModal} aria-hidden="true" />
          <div className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-2xl border border-brand-blue/20 bg-gradient-to-br from-blue-50 via-white to-amber-50 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-heading text-xl font-extrabold text-brand-blue">{entryModal.mode === 'edit' ? 'Edit Event' : 'Add Event'}</h3>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{entryModal.segment === 'evening' ? 'Evening slot' : 'Morning slot'}</p>
              </div>
              <button type="button" onClick={closeEntryModal} className="rounded-md bg-brand-blue p-1.5 text-slate-900 hover:bg-brand-saffron hover:text-slate-900" aria-label="Close add row modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form className="mt-4 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]" onSubmit={form.handleSubmit(handleSaveEntry)}>
              <div className="rounded-xl border border-brand-blue/20 bg-white/85 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Time Slot</p>
                <div className="mt-3 space-y-3">
                  <input type="hidden" {...form.register('startMeridiem')} value={entryModal.segment === 'evening' ? 'PM' : 'AM'} />
                  <input type="hidden" {...form.register('endMeridiem')} value={entryModal.segment === 'evening' ? 'PM' : 'AM'} />
                  <div className="grid gap-2 sm:grid-cols-[52px_1fr_1fr_1fr] sm:items-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start</p>
                    <select {...form.register('startHour')} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {HOURS.map((hour) => <option key={`start-hour-${hour}`} value={hour}>{hour}</option>)}
                    </select>
                    <select {...form.register('startMinute')} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {MINUTES.map((minute) => <option key={`start-minute-${minute}`} value={minute}>{minute}</option>)}
                    </select>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold text-slate-500">
                      {entryModal.segment === 'evening' ? 'PM' : 'AM'}
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[52px_1fr_1fr_1fr] sm:items-center">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">End</p>
                    <select {...form.register('endHour')} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {HOURS.map((hour) => <option key={`end-hour-${hour}`} value={hour}>{hour}</option>)}
                    </select>
                    <select {...form.register('endMinute')} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs">
                      {MINUTES.map((minute) => <option key={`end-minute-${minute}`} value={minute}>{minute}</option>)}
                    </select>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-semibold text-slate-500">
                      {entryModal.segment === 'evening' ? 'PM' : 'AM'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-white/85 p-3 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Content</p>
                <div className="mt-3 grid gap-3">
                  <label className="text-sm">Content (English)
                    <textarea {...form.register('titleEn', { required: true })} rows={3} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
                  </label>
                  <label className="text-sm">Content (Punjabi)
                    <textarea {...form.register('titlePa')} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
                  </label>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button type="button" onClick={closeEntryModal} className={`${scheduleCompactButtonClass} h-9 px-4 text-xs !text-slate-900 hover:!bg-sky-100 hover:!text-slate-900`}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saveDayMutation.isPending} className={`${scheduleButtonClass} h-9 px-4 text-xs !text-slate-900 hover:!bg-sky-100 hover:!text-slate-900`}>
                      {saveDayMutation.isPending ? 'Saving...' : 'Save Event'}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminSchedulePage;
