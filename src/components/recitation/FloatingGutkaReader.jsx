import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { BookOpenIcon, ChevronLeftIcon, ChevronRightIcon, MoonIcon, SunIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import recitationService from '../../services/recitationService';
import { readReadingHistory, updateReadingHistory } from '../../services/gutkaReadingService';
import './FloatingGutkaReader.css';

const NITNEM = [
  { id: 2, en: 'Japji Sahib', pa: 'ਜਪੁਜੀ ਸਾਹਿਬ', group: 'Morning Nitnem' },
  { id: 4, en: 'Jaap Sahib', pa: 'ਜਾਪੁ ਸਾਹਿਬ', group: 'Morning Nitnem' },
  { id: 6, en: 'Tav-Prasad Savaiye', pa: 'ਤ੍ਵਪ੍ਰਸਾਦਿ ਸਵੱਯੇ', group: 'Morning Nitnem' },
  { id: 9, en: 'Chaupai Sahib', pa: 'ਚੌਪਈ ਸਾਹਿਬ', group: 'Morning Nitnem' },
  { id: 10, en: 'Anand Sahib', pa: 'ਅਨੰਦੁ ਸਾਹਿਬ', group: 'Morning Nitnem' },
  { id: 21, en: 'Rehras Sahib', pa: 'ਰਹਰਾਸਿ ਸਾਹਿਬ', group: 'Evening Nitnem' },
  { id: 23, en: 'Kirtan Sohila', pa: 'ਕੀਰਤਨ ਸੋਹਿਲਾ', group: 'Evening Nitnem' }
];
const FONT_SIZES = [18, 22, 26, 32, 40];
const LINES_PER_PAGE = 8;
const formatAngs = (line) => Number(line?.a) > 0 ? `Ang ${line.a}` : '';

const FloatingGutkaReader = ({ placement = 'floating' }) => {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home');
  const [source, setSource] = useState(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [angInput, setAngInput] = useState('');
  const linesPerPage = LINES_PER_PAGE;
  const [baniSearch, setBaniSearch] = useState('');
  const [fontStep, setFontStep] = useState(0);
  const [readingScript, setReadingScript] = useState('gurmukhi');
  const sourceStartedAt = useRef(0);
  const lastAdvanceAt = useRef(0);
  const swipeStartRef = useRef(null);
  const [turnDirection, setTurnDirection] = useState('next');
  const trackedUserId = isAuthenticated ? user?.id : null;


  const { data: textData, isLoading: textLoading, isError: textError } = useQuery({
    queryKey: ['gutka-reader-text-v2', source?.type, source?.id],
    queryFn: () => recitationService.getText(source.type, source.id, 'full'),
    enabled: open && view === 'reader' && Boolean(source), staleTime: 5 * 60 * 1000, retry: 1
  });
  const { data: catalog = [], isLoading: catalogLoading, isError: catalogError } = useQuery({
    queryKey: ['gutka-reader-catalog'], queryFn: recitationService.getCatalog,
    enabled: open && view === 'home', staleTime: 60 * 60 * 1000, retry: 1
  });
  const lines = useMemo(() => (textData?.lines || []).filter((line) => line && (line.g || line)), [textData]);
  const currentPage = Math.floor(lineIndex / linesPerPage);
  const totalPages = Math.max(1, Math.ceil(lines.length / linesPerPage));
  const pageStart = currentPage * linesPerPage;
  const pageLines = useMemo(() => lines.slice(pageStart, pageStart + linesPerPage), [lines, pageStart, linesPerPage]);
  const currentLine = lines[pageStart] || null;
  const filteredCatalog = useMemo(() => catalog.filter((bani) => !NITNEM.some((nitnem) => nitnem.id === bani.id)
    && `${bani.english} ${bani.gurmukhi}`.toLowerCase().includes(baniSearch.trim().toLowerCase())), [catalog, baniSearch]);

  useEffect(() => {
    sourceStartedAt.current = 0;
    lastAdvanceAt.current = Date.now();
  }, [trackedUserId]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        if (view === 'reader') { flushReadingTime(); setView('home'); }
        else setOpen(false);
      }
      if (view === 'reader' && event.key === 'ArrowRight') navigatePage(currentPage + 1);
      if (view === 'reader' && event.key === 'ArrowLeft') navigatePage(currentPage - 1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKey); };
  });

  const updateHistory = useCallback((update) => updateReadingHistory(trackedUserId, update), [trackedUserId]);
  const flushReadingTime = useCallback(() => {
    if (trackedUserId == null || !sourceStartedAt.current) return;
    const elapsedMinutes = Math.min(2, Math.max(0, (Date.now() - lastAdvanceAt.current) / 60000));
    if (elapsedMinutes > 0) updateHistory((current) => ({ ...current, minutes: Math.round((current.minutes + elapsedMinutes) * 10) / 10 }));
    sourceStartedAt.current = 0;
  }, [trackedUserId, updateHistory]);

  useEffect(() => {
    if (trackedUserId == null || view !== 'reader' || !source || !lines.length) return;
    const ang = Number(lines[0]?.a) || (source.type === 'ang' ? Number(source.id) : 0);
    if (ang && !readReadingHistory(trackedUserId).angs.includes(ang)) updateHistory((current) => ({ ...current, angs: [...current.angs, ang] }));
  }, [trackedUserId, view, source, lines, updateHistory]);

  const resetActivityForSource = (selection) => {
    flushReadingTime();
    setSource(selection);
    setLineIndex(0);
    sourceStartedAt.current = Date.now();
    lastAdvanceAt.current = Date.now();
    if (trackedUserId != null) {
      const day = new Date().toLocaleDateString('en-CA');
      const key = `${selection.type}:${selection.id}`;
      updateHistory((current) => ({
        ...current,
        sessions: current.sessions + 1,
        bySource: { ...current.bySource, [key]: { title: selection.label, lines: current.bySource[key]?.lines || 0 } },
        days: { ...current.days, [day]: current.days[day] || 0 }
      }));
    }
    setView('reader');
  };
  const navigatePage = useCallback((nextPage) => {
    const boundedPage = Math.max(0, Math.min(totalPages - 1, nextPage));
    if (boundedPage === currentPage) return;
    setTurnDirection(boundedPage > currentPage ? 'next' : 'previous');
    const nextStart = boundedPage * linesPerPage;
    if (boundedPage > currentPage && trackedUserId != null && source) {
      const day = new Date().toLocaleDateString('en-CA');
      const key = `${source.type}:${source.id}`;
      const readLines = pageLines;
      const newAngs = readLines.map((line) => Number(line?.a) || (source.type === 'ang' ? Number(source.id) : 0)).filter((ang) => ang > 0);
      const elapsedMinutes = Math.min(2, Math.max(0, (Date.now() - lastAdvanceAt.current) / 60000));
      lastAdvanceAt.current = Date.now();
      updateHistory((current) => ({
        ...current,
        lines: current.lines + readLines.length,
        minutes: Math.round((current.minutes + elapsedMinutes) * 10) / 10,
        angs: [...new Set([...current.angs, ...newAngs])],
        bySource: { ...current.bySource, [key]: { title: source.label, lines: (current.bySource[key]?.lines || 0) + readLines.length } },
        days: { ...current.days, [day]: (current.days[day] || 0) + readLines.length }
      }));
    }
    setLineIndex(nextStart);
  }, [currentPage, linesPerPage, pageLines, source, totalPages, trackedUserId, updateHistory]);
  const backToSelection = () => { flushReadingTime(); setView('home'); };
  const closeReader = () => { flushReadingTime(); setOpen(false); setView('home'); };

  return <>
    <button type="button" data-testid="floating-gutka-button" onClick={() => { setView('home'); setOpen(true); }} aria-label="Open Gutka Sahib reader" title="Read Gurbani at your own pace" className={placement === 'navbar' ? 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-[#2b79bd] text-white shadow-sm hover:bg-[#246ba9] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-amber-300 md:h-8 md:w-auto md:gap-2 md:rounded-full md:px-3' : 'fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-[#072553] text-amber-200 shadow-[0_0_0_4px_rgba(251,191,36,.22),0_6px_20px_rgba(7,37,83,.4)] hover:bg-[#10386b] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-300 sm:right-6 sm:h-16 sm:w-16'}>
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className={placement === 'navbar' ? 'h-6 w-6 md:h-5 md:w-5' : 'h-11 w-11 sm:h-12 sm:w-12'}>
        <circle cx="24" cy="24" r="21" stroke="currentColor" strokeOpacity=".45" />
        <path d="M24 35V23M24 23C19 19 13 19 8 21V34C13 32 19 33 24 37C29 33 35 32 40 34V21C35 19 29 19 24 23Z" fill="#fff8df" fillOpacity=".12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 25C15 24 18 25 20 26M12 29C15 28 18 29 20 30M28 26C30 25 33 24 36 25M28 30C30 29 33 28 36 29" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <text x="24" y="17" textAnchor="middle" fill="currentColor" className="font-gurmukhi" fontSize="14">ੴ</text>
      </svg>
      {placement === 'navbar' ? <span className="hidden text-xs font-bold md:inline">Gutka Sahib</span> : null}
    </button>
    {open ? createPortal(<div data-testid="gutka-backdrop" className="gutka-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && view !== 'reader') closeReader(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="gutka-title" className={`gutka-dialog flex w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/40 bg-[#fffdf8] shadow-2xl sm:rounded-3xl ${view === 'reader' ? 'gutka-dialog-reading' : 'h-auto'}`}>
        <header className="flex shrink-0 items-center gap-2 rounded-t-[inherit] bg-gradient-to-r from-[#072553] to-[#0b4ea2] px-4 py-3 text-white sm:gap-3 sm:px-5 sm:py-4">
          {view !== 'home' ? <button type="button" onClick={backToSelection} aria-label="Back to Gutka selection" className="rounded-full p-2 hover:bg-white/10"><ChevronLeftIcon className="h-6 w-6" /></button> : null}
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">Personal Gurbani reader</p><h2 id="gutka-title" className="truncate font-heading text-xl font-bold sm:text-2xl">{view === 'reader' ? (textData?.titleEnglish || source?.label || 'Reading') : 'Gutka Sahib'}</h2></div>
          <button type="button" onClick={closeReader} aria-label="Close Gutka reader" className="rounded-full p-2 hover:bg-white/10"><XMarkIcon className="h-6 w-6" /></button>
        </header>
        {view === 'home' ? <div data-testid="gutka-home-content" className="gutka-scroll relative grid min-h-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="order-1 mb-3 min-w-0"><h3 className="font-heading text-lg font-bold text-slate-900 sm:text-xl">Choose what to read</h3><p className="mt-1 text-xs text-slate-600">Read at your own pace. This reader does not control or change the live Darbar Sahib recitation.</p>{!isAuthenticated ? <p className="mt-1 text-xs text-slate-500">Sign in to save reading progress on this device.</p> : null}</div>
          <section aria-label="Nitnem prayers" className="order-3 col-span-2">
            <div className="mb-2 flex items-center gap-2"><BookOpenIcon aria-hidden="true" className="h-5 w-5 text-brand-blue" /><div><h4 className="font-heading text-lg font-bold">Nitnem</h4><p className="text-xs text-slate-500">Daily prayers · select a bani to begin</p></div></div>
            {['Morning Nitnem', 'Evening Nitnem'].map((group) => {
              const BadgeIcon = group === 'Morning Nitnem' ? SunIcon : MoonIcon;
              return <div key={group} className="mb-4">
                <div data-testid={`nitnem-cover-${group === 'Morning Nitnem' ? 'morning' : 'evening'}`} className={`gutka-book-cover mb-3 ${group === 'Evening Nitnem' ? 'gutka-book-cover-evening' : ''}`}>
                  <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-amber-200/50 text-amber-200"><BadgeIcon className="h-7 w-7" /></span>
                  <div className="min-w-0"><p lang="pa" className="font-gurmukhi text-lg font-bold text-amber-100">{group === 'Morning Nitnem' ? 'ਅੰਮ੍ਰਿਤ ਵੇਲੇ ਦਾ ਨਿਤਨੇਮ' : 'ਸ਼ਾਮ ਦਾ ਨਿਤਨੇਮ'}</p><h5 className="font-heading text-lg font-bold tracking-wide">{group}</h5><p className="mt-0.5 text-[10px] uppercase tracking-[.14em] text-amber-100/70">{group === 'Morning Nitnem' ? 'Begin the day with Gurbani' : 'A peaceful close to the day'}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">{NITNEM.filter((bani) => bani.group === group).map((bani) => <button key={bani.id} type="button" onClick={() => resetActivityForSource({ type: 'bani', id: bani.id, label: bani.en })} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm hover:border-amber-400 hover:bg-amber-50/50">
                  <BookOpenIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-blue" /><span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{bani.en}<span lang="pa" className="block font-gurmukhi text-sm font-normal text-slate-600">{bani.pa}</span></span><ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />
                </button>)}</div>
              </div>;
            })}
          </section>
          <details className="order-2 justify-self-end rounded-xl border border-blue-100 bg-blue-50/50">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-800 sm:text-sm"><BookOpenIcon aria-hidden="true" className="h-4 w-4 text-brand-blue" /><span className="flex-1">All Banis</span><span className="rounded-full bg-white px-1.5 py-0.5 text-xs text-slate-500">{catalog.length}</span></summary>
            <div className="absolute inset-x-3 top-14 z-20 rounded-xl border border-blue-100 bg-white p-3 shadow-xl sm:left-auto sm:right-4 sm:w-96">
              <label className="block text-xs font-semibold text-slate-600">Find a Bani<input aria-label="Find a Bani" value={baniSearch} onChange={(event) => setBaniSearch(event.target.value)} placeholder="Search Bani names" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label>
              {catalogLoading ? <p role="status" className="mt-2 text-xs text-slate-500">Loading Banis…</p> : catalogError ? <p role="alert" className="mt-2 text-xs text-rose-700">Bani list is unavailable. Try again later.</p> : <>
                <p className="mt-2 text-xs text-slate-500">{filteredCatalog.length} Banis available</p>
                <div className="gutka-scroll mt-1 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg bg-white">
                  {filteredCatalog.map((bani) => <button key={bani.id} type="button" onClick={() => resetActivityForSource({ type: 'bani', id: bani.id, label: bani.english })} className="flex min-h-10 w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-amber-50">
                    <BookOpenIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" /><span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{bani.english}<span lang="pa" className="ml-2 font-gurmukhi text-slate-500">{bani.gurmukhi}</span></span><ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />
                  </button>)}
                  {!filteredCatalog.length ? <p className="p-3 text-center text-xs text-slate-500">No Banis match that name.</p> : null}
                </div>
              </>}
            </div>
          </details>
          <section aria-labelledby="gutka-sggs-title" className="order-4 col-span-2 mt-3 w-full rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
            <h4 id="gutka-sggs-title" className="flex items-center gap-2 font-heading text-xl font-bold"><BookOpenIcon aria-hidden="true" className="h-6 w-6 text-amber-700" />Sri Guru Granth Sahib Ji</h4>
            <p className="mt-1 text-sm text-slate-600">Read a specific Ang from Sri Guru Granth Sahib Ji.</p>
            <form aria-label="Ang selection" className="mt-3 flex w-full gap-2" onSubmit={(event) => { event.preventDefault(); const value = Number(angInput); if (Number.isInteger(value) && value >= 1 && value <= 1430) resetActivityForSource({ type: 'ang', id: value, label: `Ang ${value}` }); }}>
              <label className="min-w-0 flex-1 text-xs font-bold">Go to Ang (1–1430)<input aria-label="Go to Ang" inputMode="numeric" value={angInput} onChange={(event) => setAngInput(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 662" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><button className="self-end rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white">Read</button>
            </form>
          </section>
        </div> : null}
        {view === 'reader' ? <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-5">
            <span className="text-xs font-semibold text-slate-600">{formatAngs(currentLine) || source?.label}</span>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <div role="group" aria-label="Reading script" className="inline-flex rounded-full border border-blue-200 bg-blue-50 p-0.5">
                {[['gurmukhi', 'Gurmukhi'], ['roman', 'Roman English']].map(([value, label]) => <button key={value} type="button" aria-pressed={readingScript === value} onClick={() => setReadingScript(value)} className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${readingScript === value ? 'bg-brand-blue text-white shadow-sm' : 'text-slate-600'}`}>{label}</button>)}
              </div>
              <button type="button" onClick={() => setFontStep((value) => Math.max(0, value - 1))} aria-label="Smaller text" className="rounded-lg border px-2 py-1 text-xs font-bold">A−</button>
              <button type="button" onClick={() => setFontStep((value) => Math.min(FONT_SIZES.length - 1, value + 1))} aria-label="Larger text" className="rounded-lg border px-2 py-1 text-xs font-bold">A+</button>
            </div>
          </div>
          <div data-testid="gutka-reader-content" tabIndex={0} aria-label="Gurbani reading text" onTouchStart={(event) => { const touch = event.changedTouches[0]; swipeStartRef.current = { x: touch.clientX, y: touch.clientY }; }} onTouchEnd={(event) => { const start = swipeStartRef.current; swipeStartRef.current = null; if (!start) return; const touch = event.changedTouches[0]; const dx = touch.clientX - start.x; const dy = touch.clientY - start.y; if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) navigatePage(currentPage + (dx < 0 ? 1 : -1)); }} onPointerDown={(event) => { if (event.pointerType === 'mouse') swipeStartRef.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => { if (event.pointerType !== 'mouse') return; const start = swipeStartRef.current; swipeStartRef.current = null; if (!start) return; const dx = event.clientX - start.x; const dy = event.clientY - start.y; if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.4) navigatePage(currentPage + (dx < 0 ? 1 : -1)); }} className="gutka-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-6 sm:py-4">
            {textLoading ? <div role="status" className="py-8 text-center text-slate-500">Loading Gurbani…</div> : textError ? <div role="alert" className="py-8 text-center text-rose-700">Gurbani text could not be loaded. Return to selection and try again.</div> : pageLines.length ? <article key={`${source?.type}-${source?.id}-${pageStart}`} data-direction={turnDirection} aria-label={`Gurbani page ${currentPage + 1}`} className="gutka-reading-page mx-auto max-w-4xl rounded-xl border-[3px] border-double border-blue-200 bg-[#fffefa] px-3 py-3 text-center shadow-inner sm:px-6 sm:py-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Lines {pageStart + 1}–{Math.min(pageStart + pageLines.length, lines.length)} of {lines.length} · Page {currentPage + 1}</p>
              <p aria-label={readingScript === 'roman' ? 'Roman English Gurbani' : 'Gurmukhi Gurbani'} lang={readingScript === 'roman' ? 'pa-Latn' : 'pa'} className={`gutka-gurbani-flow font-bold text-slate-900 ${readingScript === 'gurmukhi' ? 'font-gurmukhi' : 'gutka-roman-flow'}`} style={{ fontSize: `${FONT_SIZES[fontStep]}px` }}>{pageLines.map((line, index) => {
                const text = String(readingScript === 'roman' ? line.r || '[Roman English unavailable for this verse]' : line.g || line).replace(/\s+/g, ' ').trim();
                const parts = text.split(/(॥|\|\|)/);
                return <span key={pageStart + index} className="gutka-verse-line inline font-bold">{parts.map((part, partIndex) => <span key={partIndex}>{part}{(part === '॥' || part === '||') && parts.slice(partIndex + 1).some((remaining) => remaining.trim()) ? <br className="gutka-desktop-verse-break" /> : null}</span>)}{index < pageLines.length - 1 ? <> <br className="gutka-desktop-verse-break" /></> : null}</span>;
              })}</p>
            </article> : null}
          </div>
          <footer data-testid="gutka-page-controls" className="relative z-10 mt-auto shrink-0 border-t border-slate-200 bg-white px-3 py-2.5 pb-[max(.625rem,env(safe-area-inset-bottom))] sm:px-5">
            <div className="mx-auto flex max-w-4xl items-center gap-2.5">
              <button type="button" onClick={() => navigatePage(currentPage - 1)} disabled={textLoading || currentPage <= 0} aria-label="Previous page" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white disabled:opacity-40"><ChevronLeftIcon className="h-6 w-6" /></button>
              <div className="min-w-0 flex-1"><div className="mb-1.5 flex justify-between text-[10px] font-semibold text-slate-500"><span>Page {currentPage + 1} of {totalPages}</span><span>{Math.round(((currentPage + (pageLines.length ? 1 : 0)) / totalPages) * 100)}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-saffron transition-[width] duration-300" style={{ width: `${Math.min(100, ((currentPage + (pageLines.length ? 1 : 0)) / totalPages) * 100)}%` }} /></div></div>
              <button type="button" onClick={() => navigatePage(currentPage + 1)} disabled={textLoading || currentPage >= totalPages - 1} aria-label="Next page" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-white disabled:opacity-40"><ChevronRightIcon className="h-6 w-6" /></button>
            </div>
          </footer>
        </div> : null}
      </section>
    </div>, document.body) : null}
  </>;
};

export default FloatingGutkaReader;
