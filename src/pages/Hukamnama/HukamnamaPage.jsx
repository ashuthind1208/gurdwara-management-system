import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { ArchiveBoxIcon, ArrowUpIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';
import AudioPillPlayer from '../../components/common/AudioPillPlayer';
import PageHero from '../../components/common/PageHero';
import Card from '../../components/ui/Card';
import useSeoMeta from '../../hooks/useSeoMeta';
import Seo from '../../components/common/Seo';
import hukamnamaService from '../../services/hukamnamaService';

const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return toDateKey(new Date());
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toDisplayDate = (value) => {
  const normalizedValue = String(value || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
    ? new Date(`${normalizedValue}T12:00:00`)
    : (normalizedValue ? new Date(normalizedValue) : new Date());
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  return date.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
};

const HukamnamaPage = () => {
  const meta = useSeoMeta('Daily Hukamnama', 'Read today\'s hukamnama with translation, meaning, and archived entries.');
  const readAlongConfig = useMemo(() => hukamnamaService.getReadAlongConfig(), []);
  const [archiveDateFilter, setArchiveDateFilter] = useState('');
  const [archivePage, setArchivePage] = useState(1);
  const [selectedArchiveDate, setSelectedArchiveDate] = useState('');
  const todayDateKey = toDateKey(new Date());
  const { data: dailyHukamnama } = useQuery({
    queryKey: ['daily-hukamnama', todayDateKey],
    queryFn: () => hukamnamaService.getDailyHukamnama(todayDateKey).then((res) => res.data)
  });
  const currentHukamnama = dailyHukamnama?.entry || null;
  const currentAng = Math.max(0, Number(currentHukamnama?.ang || 0));

  const { data: readAlongAudio } = useQuery({
    queryKey: ['hukamnama-read-along-page', currentAng],
    queryFn: () => hukamnamaService.getReadAlongAudioUrl(currentAng).then((res) => res.data),
    enabled: Boolean(currentHukamnama) && currentAng > 0 && readAlongConfig.enabled
  });

  const { data: archive = [] } = useQuery({
    queryKey: ['hukamnama-archive'],
    queryFn: () => hukamnamaService.getArchive().then((res) => res.data)
  });

  const { data: selectedArchivePayload, isLoading: selectedArchiveLoading } = useQuery({
    queryKey: ['hukamnama-archive-detail', selectedArchiveDate],
    queryFn: () => hukamnamaService.getArchiveByDate(selectedArchiveDate).then((res) => res.data),
    enabled: Boolean(selectedArchiveDate)
  });
  const selectedArchiveEntry = selectedArchivePayload?.entry || null;
  const selectedArchiveAng = Math.max(0, Number(selectedArchiveEntry?.ang || 0));

  const { data: selectedArchiveAudio } = useQuery({
    queryKey: ['hukamnama-archive-read-along', selectedArchiveDate, selectedArchiveAng],
    queryFn: () => hukamnamaService.getReadAlongAudioUrl(selectedArchiveAng).then((res) => res.data),
    enabled: Boolean(selectedArchiveEntry) && selectedArchiveAng > 0 && readAlongConfig.enabled
  });

  const sortedArchive = useMemo(() => [...archive]
    .filter((item) => {
      const itemDate = String(item.date || item.updatedAt || '').slice(0, 10);
      return itemDate !== todayDateKey && (!archiveDateFilter || itemDate === archiveDateFilter);
    })
    .sort((first, second) => {
      const firstTime = new Date(first.date || first.updatedAt || 0).getTime();
      const secondTime = new Date(second.date || second.updatedAt || 0).getTime();
      return secondTime - firstTime;
    }), [archive, archiveDateFilter, todayDateKey]);
  const archivePageSize = 10;
  const archiveTotalPages = Math.max(1, Math.ceil(sortedArchive.length / archivePageSize));
  const safeArchivePage = Math.min(archivePage, archiveTotalPages);
  const paginatedArchive = sortedArchive.slice(
    (safeArchivePage - 1) * archivePageSize,
    safeArchivePage * archivePageSize
  );

  const resetArchiveFilter = () => {
    setArchiveDateFilter('');
    setArchivePage(1);
  };

  const handleArchiveFilterResetTouch = (event) => {
    event.preventDefault();
    event.stopPropagation();
    resetArchiveFilter();
  };

  const handleArchiveJump = (event) => {
    event.preventDefault();
    document.getElementById('hukamnama-archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleTopJump = (event) => {
    event.preventDefault();
    document.getElementById('hukamnama-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hukamnamaDateLabel = toDisplayDate(currentHukamnama?.date || currentHukamnama?.updatedAt);

  return (
    <div className="space-y-8">
      <Seo {...meta} />
      <div id="hukamnama-top" className="scroll-mt-28">
      <PageHero
        title="Hukamnama"
        description="Today’s hukamnama, translation, interpretation, and historical archive."
        inlineTitleActions
        titleActions={(
          <a
            href="#hukamnama-archive"
            onClick={handleArchiveJump}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-blue/25 bg-blue-50 px-3 py-1.5 text-xs font-bold text-brand-blue transition hover:border-brand-blue/50 hover:bg-blue-100"
          >
            <ArchiveBoxIcon className="h-4 w-4" />
            Archives
          </a>
        )}
      />
      </div>
      <Card>
        <div className="space-y-2">
          {readAlongAudio?.url ? (
            <div className="w-full">
              <AudioPillPlayer
                label="Gurdwara"
                subtitle={`Ang ${currentAng} | ${hukamnamaDateLabel}`}
                src={readAlongAudio.url}
                showProgress
              />
            </div>
          ) : null}
        </div>
        <div className="mt-3 space-y-3">
          {!currentHukamnama ? (
            <p className="text-sm text-slate-500">Today\'s hukamnama is not available yet.</p>
          ) : (currentHukamnama.lines || []).map((line) => (
            <div key={line.id}>
                    <p className="font-gurmukhi text-lg font-bold leading-relaxed text-slate-950">{line.gurmukhi}</p>
                    {line.translationPunjabi ? <p className="mt-1 text-sm font-semibold text-brand-saffron">Punjabi: {line.translationPunjabi}</p> : null}
                    {line.translationEnglish ? <p className="mt-0.5 text-sm font-semibold text-brand-navy">English: {line.translationEnglish}</p> : null}
            </div>
          ))}
        </div>
      </Card>
      <section id="hukamnama-archive" className="scroll-mt-28">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-heading text-lg font-semibold">Archive</h3>
              <a
                href="#hukamnama-top"
                onClick={handleTopJump}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-blue/25 bg-blue-50 px-2.5 py-1 text-xs font-bold text-brand-blue transition hover:border-brand-blue/50 hover:bg-blue-100"
              >
                <ArrowUpIcon className="h-3.5 w-3.5" />
                Top
              </a>
            </div>
            <p className="mt-1 text-xs text-slate-500">Newest entries first. Select an entry to read the complete Hukamnama.</p>
          </div>
          <div className="w-full sm:w-auto">
            <label htmlFor="hukamnama-archive-date" className="text-xs font-bold uppercase tracking-wide text-slate-600">Search by date</label>
            <span className="mt-1 flex min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-700">
              <CalendarDaysIcon className="h-4 w-4 shrink-0 text-brand-blue" />
              <input
                id="hukamnama-archive-date"
                type="date"
                value={archiveDateFilter}
                onChange={(event) => {
                  setArchiveDateFilter(event.target.value);
                  setArchivePage(1);
                }}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                aria-label="Search archived Hukamnama by date"
              />
              {archiveDateFilter ? (
                <button
                  type="button"
                  onTouchEnd={handleArchiveFilterResetTouch}
                  onClick={resetArchiveFilter}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 touch-manipulation select-none hover:bg-slate-100"
                  aria-label="Clear archive date filter"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Reset
                </button>
              ) : null}
            </span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {paginatedArchive.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {archiveDateFilter ? 'No archived Hukamnama was found for this date.' : 'No archived Hukamnama entries are available yet.'}
            </p>
          ) : paginatedArchive.map((item) => (
            <button
              key={`${item.date || item.updatedAt}-${item.ang}`}
              type="button"
              onClick={() => setSelectedArchiveDate(String(item.date || item.updatedAt || '').slice(0, 10))}
              className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left transition hover:border-brand-blue/50 hover:bg-blue-50/60 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-brand-blue">ਅੰਗ {item.ang} | Ang {item.ang}</span>
                <span className="text-xs font-semibold text-slate-500">{toDisplayDate(item.date || item.updatedAt)}</span>
              </span>
              <span className="mt-2 block font-gurmukhi text-base font-semibold leading-relaxed text-brand-navy">{item.preview}</span>
              {item.translation ? <span className="mt-1 block text-sm text-slate-600">{item.translation}</span> : null}
            </button>
          ))}
        </div>

        {sortedArchive.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <p className="text-xs text-slate-500">
              Page {safeArchivePage} of {archiveTotalPages} · {sortedArchive.length} entr{sortedArchive.length === 1 ? 'y' : 'ies'}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safeArchivePage === 1}
                onClick={() => setArchivePage((page) => Math.max(1, page - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeftIcon className="h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                disabled={safeArchivePage === archiveTotalPages}
                onClick={() => setArchivePage((page) => Math.min(archiveTotalPages, page + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </Card>
      </section>

      {selectedArchiveDate ? createPortal(
        <div className="fixed inset-0 z-[280] overflow-y-auto bg-slate-950/65 px-3 py-4 sm:px-5 sm:py-8" onClick={() => setSelectedArchiveDate('')}>
          <div className="flex min-h-full items-center justify-center">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-2xl sm:p-5" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{toDisplayDate(selectedArchiveDate)}</span>
                    {selectedArchiveEntry?.metadata?.raag ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Raag: {selectedArchiveEntry.metadata.raag}</span> : null}
                    {selectedArchiveEntry?.metadata?.writer ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">Written by: {selectedArchiveEntry.metadata.writer}</span> : null}
                  </div>
                  {selectedArchiveAng > 0 ? <h3 className="mt-3 font-heading text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">ਅੰਗ {selectedArchiveAng} | Ang {selectedArchiveAng}</h3> : <h3 className="mt-3 font-heading text-2xl font-bold text-slate-900">Archived Hukamnama</h3>}
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedArchiveDate('')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-brand-blue bg-brand-blue text-white"
                  aria-label="Close archived Hukamnama"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              {selectedArchiveAudio?.url ? (
                <div className="mt-4">
                  <AudioPillPlayer
                    label="Hukamnama Read Along"
                    subtitle={`Ang ${selectedArchiveAng} | ${toDisplayDate(selectedArchiveDate)}`}
                    src={selectedArchiveAudio.url}
                    showProgress
                  />
                </div>
              ) : null}

              <div className="mt-4 h-px bg-slate-200" />
              <div className="mt-4 max-h-[62vh] space-y-4 overflow-y-auto pr-1">
                {selectedArchiveLoading ? <p className="text-sm text-slate-500">Loading archived Hukamnama...</p> : null}
                {!selectedArchiveLoading && !selectedArchiveEntry ? <p className="text-sm text-slate-500">This archived Hukamnama is no longer available.</p> : null}
                {(selectedArchiveEntry?.lines || []).map((line) => (
                  <article key={line.id || `${line.lineNo}-${line.gurmukhi}`}>
                    <p className="font-gurmukhi text-lg font-bold leading-relaxed text-slate-950">{line.gurmukhi}</p>
                    {line.translationPunjabi ? <p className="mt-1 text-sm font-semibold text-brand-saffron">Punjabi: {line.translationPunjabi}</p> : null}
                    {line.translationEnglish ? <p className="mt-0.5 text-sm font-semibold text-brand-navy">English: {line.translationEnglish}</p> : null}
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      , document.body) : null}
    </div>
  );
};

export default HukamnamaPage;
