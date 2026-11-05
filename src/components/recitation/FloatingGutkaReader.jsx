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
const FONT_SIZES = [24, 30, 38, 48, 60];
const formatAngs = (line) => Number(line?.a) > 0 ? `Ang ${line.a}` : '';

const FloatingGutkaReader = () => {
  const { user, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState('home');
  const [source, setSource] = useState(null);
  const [lineIndex, setLineIndex] = useState(0);
  const [angInput, setAngInput] = useState('');
  const [fontStep, setFontStep] = useState(2);
  const [showPunjabi, setShowPunjabi] = useState(false);
  const [showEnglish, setShowEnglish] = useState(false);
  const sourceStartedAt = useRef(0);
  const lastAdvanceAt = useRef(0);
  const trackedUserId = isAuthenticated ? user?.id : null;

  const { data: textData, isLoading: textLoading, isError: textError } = useQuery({
    queryKey: ['gutka-reader-text', source?.type, source?.id],
    queryFn: () => recitationService.getText(source.type, source.id, 'full'),
    enabled: open && view === 'reader' && Boolean(source), staleTime: Infinity, retry: 1
  });
  const lines = useMemo(() => (textData?.lines || []).filter((line) => line && (line.g || line)), [textData]);
  const currentLine = lines[lineIndex] || null;

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
      if (view === 'reader' && event.key === 'ArrowRight') navigateLine(lineIndex + 1);
      if (view === 'reader' && event.key === 'ArrowLeft') navigateLine(lineIndex - 1);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKey); };
  });

  const updateHistory = useCallback((update) => updateReadingHistory(trackedUserId, update), [trackedUserId]);
  const flushReadingTime = () => {
    if (trackedUserId == null || !sourceStartedAt.current) return;
    const elapsedMinutes = Math.min(2, Math.max(0, (Date.now() - lastAdvanceAt.current) / 60000));
    if (elapsedMinutes > 0) updateHistory((current) => ({ ...current, minutes: Math.round((current.minutes + elapsedMinutes) * 10) / 10 }));
    sourceStartedAt.current = 0;
  };

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
  const navigateLine = (next) => {
    const bounded = Math.max(0, Math.min(lines.length - 1, next));
    if (bounded > lineIndex && trackedUserId != null && source) {
      const day = new Date().toLocaleDateString('en-CA');
      const key = `${source.type}:${source.id}`;
      const line = lines[bounded];
      const ang = Number(line?.a) || (source.type === 'ang' ? Number(source.id) : 0);
      const elapsedMinutes = Math.min(2, Math.max(0, (Date.now() - lastAdvanceAt.current) / 60000));
      lastAdvanceAt.current = Date.now();
      updateHistory((current) => ({
        ...current,
        lines: current.lines + 1,
        minutes: Math.round((current.minutes + elapsedMinutes) * 10) / 10,
        angs: ang && !current.angs.includes(ang) ? [...current.angs, ang] : current.angs,
        bySource: { ...current.bySource, [key]: { title: source.label, lines: (current.bySource[key]?.lines || 0) + 1 } },
        days: { ...current.days, [day]: (current.days[day] || 0) + 1 }
      }));
    }
    setLineIndex(bounded);
  };
  const backToSelection = () => { flushReadingTime(); setView('home'); };
  const closeReader = () => { flushReadingTime(); setOpen(false); setView('home'); };

  return <>
    <button type="button" data-testid="floating-gutka-button" onClick={() => { setView('home'); setOpen(true); }} aria-label="Open Gutka Sahib reader" title="Read Gurbani at your own pace" className="fixed bottom-[calc(max(1rem,env(safe-area-inset-bottom))+5rem)] right-4 z-[80] flex h-14 w-14 items-center justify-center rounded-full border-2 border-amber-300 bg-[#072553] text-amber-200 shadow-[0_0_0_4px_rgba(251,191,36,.22),0_6px_20px_rgba(7,37,83,.4)] hover:bg-[#10386b] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-amber-300 sm:right-6 sm:h-16 sm:w-16">
      <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className="h-11 w-11 sm:h-12 sm:w-12">
        <circle cx="24" cy="24" r="21" stroke="currentColor" strokeOpacity=".45" />
        <path d="M24 35V23M24 23C19 19 13 19 8 21V34C13 32 19 33 24 37C29 33 35 32 40 34V21C35 19 29 19 24 23Z" fill="#fff8df" fillOpacity=".12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 25C15 24 18 25 20 26M12 29C15 28 18 29 20 30M28 26C30 25 33 24 36 25M28 30C30 29 33 28 36 29" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <text x="24" y="17" textAnchor="middle" fill="currentColor" className="font-gurmukhi" fontSize="14">ੴ</text>
      </svg>
    </button>
    {open ? createPortal(<div data-testid="gutka-backdrop" className="gutka-backdrop fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/65 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReader(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="gutka-title" className="gutka-dialog flex h-auto w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-white/40 bg-[#fffdf8] shadow-2xl sm:rounded-3xl">
        <header className="flex shrink-0 items-center gap-2 rounded-t-[inherit] bg-gradient-to-r from-[#072553] to-[#0b4ea2] px-4 py-3 text-white sm:gap-3 sm:px-5 sm:py-4">
          {view !== 'home' ? <button type="button" onClick={backToSelection} aria-label="Back to Gutka selection" className="rounded-full p-2 hover:bg-white/10"><ChevronLeftIcon className="h-6 w-6" /></button> : null}
          <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-amber-300">Personal Gurbani reader</p><h2 id="gutka-title" className="truncate font-heading text-xl font-bold sm:text-2xl">{view === 'reader' ? (textData?.titleEnglish || source?.label || 'Reading') : 'Gutka Sahib'}</h2></div>
          <button type="button" onClick={closeReader} aria-label="Close Gutka reader" className="rounded-full p-2 hover:bg-white/10"><XMarkIcon className="h-6 w-6" /></button>
        </header>
        {view === 'home' ? <div data-testid="gutka-home-content" className="gutka-scroll min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4">
          <div className="mb-3"><h3 className="font-heading text-xl font-bold text-slate-900">Choose what to read</h3><p className="mt-1 text-xs text-slate-600">Read at your own pace. This reader does not control or change the live Darbar Sahib recitation.</p>{!isAuthenticated ? <p className="mt-1 text-xs text-slate-500">Sign in to save reading progress on this device.</p> : null}</div>
          <section aria-label="Nitnem prayers">
            <div className="mb-2 flex items-center gap-2"><BookOpenIcon aria-hidden="true" className="h-5 w-5 text-brand-blue" /><div><h4 className="font-heading text-lg font-bold">Nitnem</h4><p className="text-xs text-slate-500">Daily prayers · select a bani to begin</p></div></div>
            {['Morning Nitnem', 'Evening Nitnem'].map((group) => {
              const BadgeIcon = group === 'Morning Nitnem' ? SunIcon : MoonIcon;
              return <div key={group} className="mb-2">
                <h5 className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-brand-blue"><span className={`rounded-full p-1 ${group === 'Morning Nitnem' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-800'}`}><BadgeIcon aria-hidden="true" className="h-4 w-4" /></span>{group}</h5>
                <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-3">{NITNEM.filter((bani) => bani.group === group).map((bani) => <button key={bani.id} type="button" onClick={() => resetActivityForSource({ type: 'bani', id: bani.id, label: bani.en })} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm hover:border-amber-400 hover:bg-amber-50/50">
                  <BookOpenIcon aria-hidden="true" className="h-5 w-5 shrink-0 text-brand-blue" /><span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">{bani.en}<span lang="pa" className="block font-gurmukhi text-sm font-normal text-slate-600">{bani.pa}</span></span><ChevronRightIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-blue" />
                </button>)}</div>
              </div>;
            })}
          </section>
          <section aria-labelledby="gutka-sggs-title" className="mt-3 w-full rounded-2xl border border-amber-200 bg-amber-50/50 p-3">
            <h4 id="gutka-sggs-title" className="flex items-center gap-2 font-heading text-xl font-bold"><BookOpenIcon aria-hidden="true" className="h-6 w-6 text-amber-700" />Sri Guru Granth Sahib Ji</h4>
            <p className="mt-1 text-sm text-slate-600">Read a specific Ang from Sri Guru Granth Sahib Ji.</p>
            <form aria-label="Ang selection" className="mt-3 flex w-full gap-2" onSubmit={(event) => { event.preventDefault(); const value = Number(angInput); if (Number.isInteger(value) && value >= 1 && value <= 1430) resetActivityForSource({ type: 'ang', id: value, label: `Ang ${value}` }); }}>
              <label className="min-w-0 flex-1 text-xs font-bold">Go to Ang (1–1430)<input aria-label="Go to Ang" inputMode="numeric" value={angInput} onChange={(event) => setAngInput(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="e.g. 662" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" /></label><button className="self-end rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white">Read</button>
            </form>
          </section>
        </div> : null}
        {view === 'reader' ? <div className="flex min-h-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600 sm:px-6"><span>{formatAngs(currentLine) || source?.label}</span><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={showPunjabi} onClick={() => setShowPunjabi((value) => !value)} className={`rounded-full border px-3 py-1 text-xs font-bold ${showPunjabi ? 'border-blue-300 bg-blue-50 text-brand-blue' : 'border-slate-200'}`}>Punjabi</button><button type="button" aria-pressed={showEnglish} onClick={() => setShowEnglish((value) => !value)} className={`rounded-full border px-3 py-1 text-xs font-bold ${showEnglish ? 'border-blue-300 bg-blue-50 text-brand-blue' : 'border-slate-200'}`}>English</button><button type="button" onClick={() => setFontStep((value) => Math.max(0, value - 1))} aria-label="Smaller text" className="rounded-lg border px-2 py-1 font-bold">A−</button><button type="button" onClick={() => setFontStep((value) => Math.min(FONT_SIZES.length - 1, value + 1))} aria-label="Larger text" className="rounded-lg border px-2 py-1 font-bold">A+</button></div></div>
          <div data-testid="gutka-reader-content" tabIndex={0} aria-label="Gurbani reading text" className="gutka-scroll min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-10">{textLoading ? <div role="status" className="py-8 text-center text-slate-500">Loading Gurbani…</div> : textError ? <div role="alert" className="py-8 text-center text-rose-700">Gurbani text could not be loaded. Return to selection and try again.</div> : currentLine ? <article className="mx-auto max-w-3xl text-center"><p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Line {lineIndex + 1} of {lines.length}</p><p lang="pa" className="font-gurmukhi font-bold leading-[1.9] text-slate-900" style={{ fontSize: `${FONT_SIZES[fontStep]}px` }}>{currentLine.g || currentLine}</p>{showPunjabi && currentLine.p ? <p lang="pa" className="mt-4 font-gurmukhi leading-relaxed text-slate-700" style={{ fontSize: `${Math.max(18, FONT_SIZES[fontStep] * .58)}px` }}>{currentLine.p}</p> : null}{showEnglish && currentLine.e ? <p lang="en" className="mx-auto mt-4 max-w-2xl leading-relaxed text-slate-700" style={{ fontSize: `${Math.max(16, FONT_SIZES[fontStep] * .48)}px` }}>{currentLine.e}</p> : null}<p className="mt-4 text-xs text-slate-400">Read at a comfortable pace · Pause whenever you wish</p></article> : null}</div>
          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] sm:px-6"><div className="mx-auto flex max-w-3xl items-center gap-3"><button type="button" onClick={() => navigateLine(lineIndex - 1)} disabled={textLoading || lineIndex <= 0} aria-label="Previous line" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-300 disabled:opacity-40"><ChevronLeftIcon className="h-6 w-6" /></button><div className="min-w-0 flex-1"><div className="mb-2 flex justify-between text-xs font-semibold text-slate-500"><span>{lineIndex + 1} / {lines.length || '—'}</span><span>Take your time</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand-saffron transition-[width]" style={{ width: `${lines.length ? ((lineIndex + 1) / lines.length) * 100 : 0}%` }} /></div></div><button type="button" onClick={() => navigateLine(lineIndex + 1)} disabled={textLoading || lineIndex >= lines.length - 1} aria-label="Next line" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-blue text-white disabled:opacity-40"><ChevronRightIcon className="h-6 w-6" /></button></div></footer>
        </div> : null}
      </section>
    </div>, document.body) : null}
  </>;
};

export default FloatingGutkaReader;
