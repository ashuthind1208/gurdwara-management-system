import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserGroupIcon } from '@heroicons/react/24/outline';
import { QRCodeSVG } from 'qrcode.react';
import Seo from '../../components/common/Seo';
import useSeoMeta from '../../hooks/useSeoMeta';
import cmsService from '../../services/cmsService';
import langarService, { LANGAR_CONTRIBUTIONS_RESOURCE } from '../../services/langarService';
import { useBranding } from '../../context/BrandingContext';

const imageFallback = (item) => item.imageUrl || 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=240&q=80';
const toNumber = (value) => Math.max(0, Number(value) || 0);
const displayName = (entry) => entry.anonymous ? 'Anonymous seva' : (entry.donorName || 'Sangat member');
const formatReceivedDate = (receivedAt) => {
  const date = new Date(receivedAt);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
};
const previewItems = [
  { id: 'preview-ginger', name: 'Ginger', category: 'Grocery', quantityRequired: 20, quantityReceived: 8, unit: 'lb' },
  { id: 'preview-atta', name: 'Atta', category: 'Grocery', quantityRequired: 30, quantityReceived: 12, unit: 'kg' },
  { id: 'preview-tomatoes', name: 'Tomatoes', category: 'Grocery', quantityRequired: 30, quantityReceived: 18, unit: 'kg' },
  { id: 'preview-onions', name: 'Onions', category: 'Grocery', quantityRequired: 50, quantityReceived: 20, unit: 'kg' },
  { id: 'preview-rice', name: 'Basmati Rice', category: 'Grocery', quantityRequired: 40, quantityReceived: 10, unit: 'kg' },
  { id: 'preview-lentils', name: 'Lentils', category: 'Grocery', quantityRequired: 25, quantityReceived: 9, unit: 'kg' },
  { id: 'preview-oil', name: 'Cooking Oil', category: 'Grocery', quantityRequired: 20, quantityReceived: 6, unit: 'L' },
  { id: 'preview-milk', name: 'Milk', category: 'Dairy', quantityRequired: 30, quantityReceived: 15, unit: 'bags' },
  { id: 'preview-paneer', name: 'Paneer', category: 'Dairy', quantityRequired: 20, quantityReceived: 5, unit: 'kg' },
  { id: 'preview-potatoes', name: 'Potatoes', category: 'Grocery', quantityRequired: 60, quantityReceived: 30, unit: 'kg' },
  { id: 'preview-sugar', name: 'Sugar', category: 'Grocery', quantityRequired: 25, quantityReceived: 7, unit: 'kg' },
  { id: 'preview-tea', name: 'Tea', category: 'Grocery', quantityRequired: 15, quantityReceived: 4, unit: 'boxes' },
  { id: 'preview-cups', name: 'Paper Cups', category: 'Supplies', quantityRequired: 100, quantityReceived: 25, unit: 'units' },
  { id: 'preview-napkins', name: 'Napkins', category: 'Supplies', quantityRequired: 100, quantityReceived: 50, unit: 'packs' }
];

const Donut = ({ value }) => (
  <div className="relative h-36 w-36 shrink-0 rounded-full p-2 sm:h-44 sm:w-44" style={{ background: `conic-gradient(var(--brand-saffron, #f5a623) ${value * 3.6}deg, rgba(255,255,255,.14) 0deg)` }}>
    <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#071b3b] text-center">
      <strong className="block text-4xl font-black leading-none text-white sm:text-5xl">{value}%</strong>
      <span className="mt-1 block text-[10px] font-bold uppercase leading-none tracking-[0.14em] text-cyan-100 sm:text-xs">complete</span>
    </div>
  </div>
);

const LangarDisplayBoardPage = () => {
  const { branding, logoSrc } = useBranding();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const meta = useSeoMeta('Langar Needs Display Board', 'Live portrait display of current Langar needs and community contributions.');
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(Boolean(document.fullscreenElement));
  const [tickerGroupCount, setTickerGroupCount] = useState(2);
  const [tickerDuration, setTickerDuration] = useState(24);
  const [tickerDistance, setTickerDistance] = useState(0);
  const [itemPage, setItemPage] = useState(0);
  const [itemPageCount, setItemPageCount] = useState(1);
  const [itemPageDuration, setItemPageDuration] = useState(14);
  const tickerViewportRef = useRef(null);
  const tickerGroupRef = useRef(null);
  const itemViewportRef = useRef(null);
  const itemTrackRef = useRef(null);
  const itemPageHeightRef = useRef(0);

  const { data: homeContent } = useQuery({
    queryKey: ['langar-display-board-content'],
    queryFn: () => cmsService.getHomeContent().then((response) => response.data),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  });
  const { data: contributions = [] } = useQuery({
    queryKey: [LANGAR_CONTRIBUTIONS_RESOURCE, 'display-board'],
    queryFn: () => langarService.getContributions().then((response) => response.data),
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  });

  const items = useMemo(() => {
    const sourceItems = searchParams.get('sample') === '1' ? previewItems : (homeContent?.langarItems || []);
    return sourceItems.map(langarService.normalizeItem).filter((item) => item.needed !== false || toNumber(item.quantityReceived) < toNumber(item.quantityRequired));
  }, [homeContent, searchParams]);
  const displayedItems = items;
  const receivedTotal = useMemo(() => items.reduce((sum, item) => sum + Math.min(toNumber(item.quantityReceived), toNumber(item.quantityRequired)), 0), [items]);
  const requiredTotal = useMemo(() => items.reduce((sum, item) => sum + toNumber(item.quantityRequired), 0), [items]);
  const committedByItem = useMemo(() => contributions.reduce((totals, contribution) => {
    if (String(contribution.status || 'pending').toLowerCase() !== 'pending') return totals;
    const key = String(contribution.itemId || '');
    totals[key] = (totals[key] || 0) + toNumber(contribution.quantity);
    return totals;
  }, {}), [contributions]);
  const completion = requiredTotal ? Math.min(100, Math.round((receivedTotal / requiredTotal) * 100)) : 0;
  const receivedContributions = useMemo(() => contributions.filter((entry) => entry.status === 'received'), [contributions]);
  const contributorCount = useMemo(() => new Set(receivedContributions.map((entry) => entry.anonymous ? `anonymous-${entry.id}` : entry.donorEmail || entry.donorName)).size, [receivedContributions]);
  const tickerItems = useMemo(() => (
    contributions
      .filter((entry) => ['pending', 'received'].includes(String(entry.status || 'pending').toLowerCase()))
      .sort((a, b) => new Date(b.receivedAt || b.updatedAt || b.createdAt || 0) - new Date(a.receivedAt || a.updatedAt || a.createdAt || 0))
  ), [contributions]);

  useEffect(() => {
    const viewport = tickerViewportRef.current;
    const group = tickerGroupRef.current;
    if (!viewport || !group || !tickerItems.length) return undefined;

    const measure = () => {
      const groupWidth = group.getBoundingClientRect().width;
      if (!groupWidth) return;
      setTickerGroupCount(Math.max(2, Math.ceil(viewport.clientWidth / groupWidth) + 1));
      setTickerDuration(Math.max(18, groupWidth / 55));
      setTickerDistance(-groupWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(group);
    return () => observer.disconnect();
  }, [tickerItems]);

  useEffect(() => {
    const viewport = itemViewportRef.current;
    const track = itemTrackRef.current;
    if (!viewport || !track) return undefined;
    let animationFrame = 0;
    const measure = () => {
      const firstCard = track.querySelector('[data-langar-board-card]');
      if (!firstCard) {
        setItemPageCount(1);
        setItemPage(0);
        return;
      }
      const cardHeight = firstCard.getBoundingClientRect().height;
      const columns = Math.max(1, window.getComputedStyle(track).gridTemplateColumns.split(' ').length);
      const gap = Number.parseFloat(window.getComputedStyle(track).rowGap) || 0;
      const cardStep = cardHeight + gap;
      const rowsPerPage = Math.max(1, Math.floor((viewport.clientHeight + gap) / cardStep));
      const itemsPerPage = rowsPerPage * columns;
      const pageCount = Math.max(1, Math.ceil(displayedItems.length / itemsPerPage));
      itemPageHeightRef.current = rowsPerPage * cardStep;
      setItemPageCount(pageCount);
      setItemPage((current) => Math.min(current, pageCount - 1));
      setItemPageDuration(Math.max(6, Math.min(10, rowsPerPage * 2)));
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };
    scheduleMeasure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(viewport);
    if (track.firstElementChild) observer.observe(track.firstElementChild);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [displayedItems.length]);

  useEffect(() => {
    if (itemPageCount <= 1) return undefined;
    const timer = window.setInterval(() => {
      setItemPage((current) => (current + 1) % itemPageCount);
    }, itemPageDuration * 1000);
    return () => window.clearInterval(timer);
  }, [itemPageCount, itemPageDuration, searchParams]);

  useEffect(() => {
    const handleFullscreen = () => setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  useEffect(() => {
    if (searchParams.get('sample') === '1' || typeof EventSource === 'undefined') return undefined;
    const events = new EventSource('/api/live/langar');
    const refreshBoardData = () => {
      queryClient.invalidateQueries({ queryKey: ['langar-display-board-content'] });
      queryClient.invalidateQueries({ queryKey: [LANGAR_CONTRIBUTIONS_RESOURCE] });
    };
    events.addEventListener('refresh', refreshBoardData);
    return () => {
      events.removeEventListener('refresh', refreshBoardData);
      events.close();
    };
  }, [queryClient, searchParams]);

  const contributionUrl = useMemo(() => new URL('/langar-contribute', window.location.origin).toString(), []);
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen?.();
    else await document.documentElement.requestFullscreen?.();
  };

  return (
    <>
      <Seo {...meta} />
      <div className="langar-display-board h-screen w-full overflow-hidden bg-[#06142f] text-white">
        <style>{`@keyframes langar-board-ticker { from { transform: translateX(0); } to { transform: translateX(var(--ticker-distance)); } } .langar-board-ticker { display: flex; width: max-content; max-width: none; animation: langar-board-ticker var(--ticker-duration) linear infinite; will-change: transform; } .langar-board-ticker-group { display: flex; width: max-content; flex: none; align-items: center; gap: .75rem; padding-right: .75rem; box-sizing: border-box; white-space: nowrap; } @media (prefers-reduced-motion: reduce) { .langar-board-ticker { animation-play-state: paused; } }`}</style>
        <div className="mx-auto flex h-full w-full flex-col px-4 py-3 sm:px-6 lg:px-8">
          <header className="flex shrink-0 items-center gap-3 pb-3">
            <img src={logoSrc} alt={`${branding.organizationName} logo`} className="h-16 w-16 rounded-full border-2 border-brand-saffron object-cover sm:h-20 sm:w-20" />
            <div className="min-w-0 flex-1">
              <p className="pt-3 text-xs font-bold uppercase tracking-[0.25em] text-brand-saffron">{branding.shortName}</p>
              <h1 className="mt-1 font-heading text-3xl font-bold leading-tight sm:text-4xl">Langar Needs</h1>
              <p className="mt-2 text-xs text-cyan-100 sm:text-sm">Help stock the kitchen for the sangat</p>
            </div>
            <button type="button" data-board-control onClick={() => void toggleFullscreen()} className="rounded-lg border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold text-white">{isBrowserFullscreen ? 'Exit' : 'Fullscreen'}</button>
          </header>

          <div ref={tickerViewportRef} className="mt-2 w-full max-w-full shrink-0 overflow-hidden border-y border-white/15 py-2.5">
            {tickerItems.length ? <div className="langar-board-ticker" style={{ '--ticker-group-count': tickerGroupCount, '--ticker-duration': `${tickerDuration}s`, '--ticker-distance': `${tickerDistance}px` }}>
              {Array.from({ length: tickerGroupCount }, (_, groupIndex) => <div key={`ticker-group-${groupIndex}`} ref={groupIndex === 0 ? tickerGroupRef : undefined} className="langar-board-ticker-group" aria-hidden={groupIndex > 0}>
                {tickerItems.map((entry, index) => {
                  const isReceived = String(entry.status || '').toLowerCase() === 'received';
                  const receivedDate = entry.receivedAt || entry.updatedAt || entry.createdAt;
                  return <span key={`${groupIndex}-${entry.id}-${index}`} className="flex-none whitespace-nowrap rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-bold sm:text-base"><span className="text-brand-saffron">{displayName(entry)}</span> {isReceived ? 'provided' : 'committed to'} {entry.quantity} {entry.unit} of {entry.itemName}{isReceived && formatReceivedDate(receivedDate) ? <span className="ml-2 text-cyan-100">· received {formatReceivedDate(receivedDate)}</span> : !isReceived ? <span className="ml-2 text-amber-200">· not yet delivered</span> : null}</span>;
                })}
              </div>)}
            </div> : <p className="text-center text-sm font-semibold text-slate-300">Contributions will appear here as the sangat helps.</p>}
          </div>

          <main className="mt-3 grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(250px,30%)_minmax(0,70%)]">
            <section className="flex min-h-0 flex-col items-center justify-center gap-3 overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-[#12386d] to-[#071b3b] p-4 text-center shadow-2xl sm:p-5">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-100 sm:text-sm">Overall completion</p>
              <div className="flex w-full items-center justify-center gap-6 sm:gap-8">
                <Donut value={completion} />
                <div className="flex aspect-square w-36 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-brand-saffron/35 bg-white p-1.5 text-center text-slate-900 shadow-lg sm:w-40"><QRCodeSVG value={contributionUrl} size={144} level="M" marginSize={1} fgColor="#071b3b" bgColor="#ffffff" className="h-auto w-full shrink-0" aria-label="Scan to contribute to Langar" /><p className="text-[10px] font-black uppercase tracking-[0.08em] text-brand-blue">Scan to help</p></div>
              </div>
              <div><p className="font-heading text-2xl font-bold sm:text-3xl">{receivedTotal} <span className="text-base text-cyan-100 sm:text-lg">of {requiredTotal} units</span></p><p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-200"><UserGroupIcon className="h-4 w-4 text-brand-saffron" /> {contributorCount} contributors</p></div>
              <div className="flex w-full flex-col gap-2"><div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2"><p className="text-2xl font-black text-white">{items.length}</p><p className="text-[9px] font-bold uppercase tracking-wide text-cyan-100">Open items</p></div><div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2"><p className="text-2xl font-black text-white">{requiredTotal - receivedTotal}</p><p className="text-[9px] font-bold uppercase tracking-wide text-cyan-100">Units remaining</p></div><div className="rounded-xl border border-white/15 bg-white/10 px-3 py-2"><p className="text-xl font-black text-white">{receivedTotal}</p><p className="text-[9px] font-bold uppercase tracking-wide text-cyan-100">Units received</p></div><div className="rounded-xl border border-brand-saffron/30 bg-brand-saffron/10 px-3 py-2"><p className="text-xl font-black text-brand-saffron">{receivedContributions.length}</p><p className="text-[9px] font-bold uppercase tracking-wide text-amber-100">Completed sevas</p></div></div>
            </section>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/15 bg-white/5 p-3 shadow-2xl sm:p-4">
              <div ref={itemViewportRef} className="min-h-0 flex-1 overflow-hidden px-1 pb-1">
                <div ref={itemTrackRef} className="grid auto-rows-[176px] grid-cols-1 gap-4 md:grid-cols-2" style={{ transform: `translateY(-${itemPage * itemPageHeightRef.current}px)`, transition: 'transform 1000ms ease-in-out' }}>
            {[...displayedItems, ...(itemPageCount > 1 ? displayedItems : [])].map((item, cardIndex) => {
              const required = toNumber(item.quantityRequired);
              const received = Math.min(toNumber(item.quantityReceived), required);
              const committed = Math.min(toNumber(committedByItem[String(item.id)]), Math.max(0, required - received));
              const committedPercent = required ? Math.min(100, Math.round((committed / required) * 100)) : 0;
              const receivedPercent = required ? Math.min(100, Math.round((received / required) * 100)) : 0;
              return <article data-langar-board-card key={`${cardIndex}-${item.id}`} aria-hidden={cardIndex >= displayedItems.length} className="grid h-full w-full grid-cols-[7.5rem_minmax(0,1fr)] items-stretch gap-5 rounded-xl border border-white/15 bg-white/10 px-5 py-4"><img src={imageFallback(item)} alt="" className="h-[7.5rem] w-[7.5rem] rounded-lg object-cover" /><div className="min-w-0 self-start pt-1 pr-4"><div className="flex min-w-0 items-baseline justify-between gap-2"><h3 className="min-w-0 truncate font-heading text-2xl font-black leading-none text-brand-saffron sm:text-3xl">{item.name}</h3><p className="shrink-0 text-right text-xs font-bold text-cyan-100 sm:text-sm">{item.category} · {required} {item.unit} needed</p></div><div className="mt-2 w-full border-t border-white/25" /><div className="mt-3 space-y-3"><div><div className="mb-1 flex w-full items-center justify-between gap-2 text-xs font-extrabold leading-tight"><span className="shrink-0 text-cyan-100">Committed</span><span className="shrink-0 text-right text-white">{committed} / {required} {item.unit}</span></div><div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950/60"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300" style={{ width: `${committedPercent}%` }} /></div></div><div><div className="mb-1 flex w-full items-center justify-between gap-2 text-xs font-extrabold leading-tight"><span className="shrink-0 text-amber-100">Received</span><span className="shrink-0 text-right text-white">{received} / {required} {item.unit}</span></div><div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-950/60"><div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-300" style={{ width: `${receivedPercent}%` }} /></div></div></div></div></article>;
            })}
                </div>
              </div>
              {itemPageCount > 1 ? <p className="mt-1 shrink-0 text-right text-[10px] font-semibold text-cyan-100">Items continue automatically · {itemPage + 1}/{itemPageCount}</p> : null}
            {!items.length ? <p className="rounded-2xl bg-white/10 p-6 text-center text-slate-200">The Langar team has no open needs right now.</p> : null}
            </section>
          </main>

        </div>
      </div>
    </>
  );
};

export default LangarDisplayBoardPage;
