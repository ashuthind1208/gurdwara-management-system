import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArchiveBoxIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  GiftIcon,
  ListBulletIcon,
  ShoppingBagIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import HomeHeroBanner from '../../components/common/HomeHeroBanner';
import SectionTitle from '../../components/common/SectionTitle';
import eventService from '../../services/eventService';
import galleryService from '../../services/galleryService';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';
import hukamnamaService from '../../services/hukamnamaService';
import advertisementService from '../../services/advertisementService';
import newsService from '../../services/newsService';
import useSeoMeta from '../../hooks/useSeoMeta';
import Seo from '../../components/common/Seo';
import NewsArticleDialog from '../../components/news/NewsArticleDialog';
import gurdwaraLogo from '../../assets/default-gurdwara.svg';
import { isEventCurrent } from '../../utils/eventAvailability';
import { truncateHeading, truncateHtmlByCharacters } from '../../utils/newsContent';
import LangarNeedsBoard from '../../components/langar/LangarNeedsBoardReference';
import PageWidgets from '../../components/widgets/PageWidgets';

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

const parseTimeToken = (token) => {
  const match = String(token || '').trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hours < 12) {
    hours += 12;
  }
  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return (hours * 60) + minutes;
};

const resolveScheduleRowState = (timeEn, now = new Date()) => {
  const input = String(timeEn || '').trim();
  if (!input) {
    return { isCurrent: false, isPast: false };
  }

  const parts = input.split(/\s*-\s*/);
  const startMinutes = parseTimeToken(parts[0]);
  const endMinutes = parseTimeToken(parts[1] || '');
  if (startMinutes == null) {
    return { isCurrent: false, isPast: false };
  }

  const nowMinutes = (now.getHours() * 60) + now.getMinutes();
  if (endMinutes != null) {
    const effectiveEndMinutes = endMinutes > startMinutes ? endMinutes - 1 : endMinutes;
    return {
      isCurrent: nowMinutes >= startMinutes && nowMinutes <= effectiveEndMinutes,
      isPast: nowMinutes > effectiveEndMinutes
    };
  }

  return {
    isCurrent: Math.abs(nowMinutes - startMinutes) <= 20,
    isPast: nowMinutes > startMinutes + 20
  };
};

const resolveScheduleStartMinutes = (timeEn) => {
  const input = String(timeEn || '').trim();
  if (!input) {
    return Number.POSITIVE_INFINITY;
  }

  const parts = input.split(/\s*-\s*/);
  const startMinutes = parseTimeToken(parts[0]);
  return startMinutes == null ? Number.POSITIVE_INFINITY : startMinutes;
};

const sortScheduleEntries = (entries = []) => [...entries].sort((left, right) => {
  const leftMinutes = resolveScheduleStartMinutes(left.timeEn);
  const rightMinutes = resolveScheduleStartMinutes(right.timeEn);
  return leftMinutes !== rightMinutes
    ? leftMinutes - rightMinutes
    : Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
});

const formatScheduleDate = (dateKey) => {
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const resolveLangarCategoryIcon = (category = '') => {
  const normalizedCategory = String(category || '').toLowerCase();

  if (normalizedCategory.includes('clean')) {
    return SparklesIcon;
  }
  if (normalizedCategory.includes('kitchen') || normalizedCategory.includes('serv') || normalizedCategory.includes('supply')) {
    return ArchiveBoxIcon;
  }
  return ShoppingBagIcon;
};

const resolvePublicLangarNeedLabel = (item = {}) => {
  if (item.stockStatus === 'custom' && String(item.customStatusLabel || '').trim()) {
    return String(item.customStatusLabel).trim();
  }
  return 'Needed now';
};

const isRecentlyAddedLangarItem = (addedOn = '') => {
  const addedDate = new Date(`${addedOn}T12:00:00`);
  if (!addedOn || Number.isNaN(addedDate.getTime())) {
    return false;
  }

  const ageInDays = Math.floor((Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24));
  return ageInDays >= 0 && ageInDays < 7;
};

const HomePage = () => {
  const navigate = useNavigate();
  const meta = useSeoMeta('Home', 'Daily hukamnama, events, seva, donations, and Sikh education for the sangat.');
  const { data: events = [] } = useQuery({ queryKey: ['events'], queryFn: () => eventService.getEvents().then((res) => res.data) });
  const { data: albums = [] } = useQuery({ queryKey: ['albums'], queryFn: () => galleryService.getPublicAlbums().then((res) => res.data) });
  const { data: cmsData } = useQuery({ queryKey: ['cms-home'], queryFn: () => cmsService.getHomeContent().then((res) => res.data) });
  const todayDateKey = toDateKey(new Date());
  const { data: dailyHukamnama } = useQuery({ queryKey: ['daily-hukamnama', todayDateKey], queryFn: () => hukamnamaService.getDailyHukamnama(todayDateKey).then((res) => res.data) });
  const { data: ads = [] } = useQuery({ queryKey: ['advertisements'], queryFn: () => advertisementService.getAds().then((res) => res.data) });
  const { data: newsArticles = [] } = useQuery({ queryKey: ['news-articles'], queryFn: () => newsService.getArticles().then((res) => res.data) });
  const [selectedTickerEvent, setSelectedTickerEvent] = useState(null);
  const [selectedContentLink, setSelectedContentLink] = useState(null);
  const [selectedNewsArticle, setSelectedNewsArticle] = useState(null);
  const [selectedSevaCategory, setSelectedSevaCategory] = useState('All');
  const [selectedSevaPage, setSelectedSevaPage] = useState(1);
  const [tickerMotionSeed, setTickerMotionSeed] = useState(0);
  const [selectedSchedulePreview, setSelectedSchedulePreview] = useState(null);
  const homeTickerTrackRef = useRef(null);
  const specialTickerTrackRef = useRef(null);

  const tickerItems = useMemo(
    () => (events.length > 0 ? events.filter((event) => isEventCurrent(event)) : []),
    [events]
  );
  const tickerLoopItems = useMemo(() => {
    if (tickerItems.length === 0) {
      return [];
    }

    // Ensure each repeated ticker segment is long enough to avoid visible dead space.
    const minimumCardsPerSegment = 14;
    const repeatCount = Math.max(1, Math.ceil(minimumCardsPerSegment / tickerItems.length));

    return Array.from({ length: repeatCount }, (_, repeatIndex) => (
      tickerItems.map((event) => ({
        ...event,
        _tickerLoopKey: `${repeatIndex}-${event.id}`
      }))
    )).flat();
  }, [tickerItems]);
  const tickerRenderKey = useMemo(() => {
    if (tickerLoopItems.length === 0) {
      return 'empty';
    }

    const firstId = String(tickerLoopItems[0]?.id || 'na');
    const lastId = String(tickerLoopItems[tickerLoopItems.length - 1]?.id || 'na');
    return `${tickerLoopItems.length}-${firstId}-${lastId}`;
  }, [tickerLoopItems]);

  const restartTickerTrack = (trackRef) => {
    const node = trackRef?.current;
    if (!(node instanceof HTMLElement)) {
      return;
    }

    node.style.animation = 'none';
    // Force layout so browsers re-apply animation timeline reliably.
    void node.offsetHeight;
    node.style.animation = '';
  };

  useEffect(() => {
    if (tickerLoopItems.length === 0) {
      return undefined;
    }

    const restartTicker = () => {
      restartTickerTrack(homeTickerTrackRef);
      restartTickerTrack(specialTickerTrackRef);
      setTickerMotionSeed((value) => value + 1);
    };

    const rafId = window.requestAnimationFrame(restartTicker);
    const timeoutId = window.setTimeout(restartTicker, 120);
    const delayedTimeoutId = window.setTimeout(restartTicker, 480);
    const onPageShow = () => restartTicker();
    const onWindowLoad = () => restartTicker();
    const onResize = () => restartTicker();
    const onOrientationChange = () => restartTicker();
    let touchedOnce = false;
    const onFirstTouch = () => {
      if (touchedOnce) {
        return;
      }
      touchedOnce = true;
      restartTicker();
    };
    const onVisibilityChange = () => {
      if (!document.hidden) {
        restartTicker();
      }
    };

    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('load', onWindowLoad);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onOrientationChange);
    window.addEventListener('touchstart', onFirstTouch, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      window.clearTimeout(delayedTimeoutId);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('load', onWindowLoad);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.removeEventListener('touchstart', onFirstTouch);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [tickerLoopItems.length]);
  const latestArticle = useMemo(
    () => (newsArticles || []).find((article) => newsService.isLiveArticle(article)) || null,
    [newsArticles]
  );

  const langarItems = useMemo(
    () => (Array.isArray(cmsData?.langarItems) ? cmsData.langarItems : []),
    [cmsData?.langarItems]
  );
  const publicLangarNeeds = useMemo(
    () => langarItems.filter((item) => item?.needed === true),
    [langarItems]
  );
  const langarNeedsSummary = useMemo(() => {
    const sortedItems = [...publicLangarNeeds]
      .sort((first, second) => String(second?.addedOn || '').localeCompare(String(first?.addedOn || '')));
    const categoryCounts = sortedItems.reduce((counts, item) => {
      const category = String(item?.category || 'General').trim() || 'General';
      counts.set(category, (counts.get(category) || 0) + 1);
      return counts;
    }, new Map());
    const latestAddedOn = sortedItems.find((item) => String(item?.addedOn || '').trim())?.addedOn || '';
    const latestDate = latestAddedOn ? new Date(`${latestAddedOn}T12:00:00`) : null;
    const latestUpdateLabel = latestDate && !Number.isNaN(latestDate.getTime())
      ? latestDate.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
      : 'Current';
    const featuredItems = sortedItems
      .slice(0, 4);

    return {
      neededCount: publicLangarNeeds.length,
      categoryCount: categoryCounts.size,
      categoryCounts: [...categoryCounts.entries()].sort((first, second) => second[1] - first[1]),
      latestUpdateLabel,
      hiddenCount: Math.max(0, publicLangarNeeds.length - featuredItems.length),
      featuredItems
    };
  }, [publicLangarNeeds]);
  const activeHukamnama = dailyHukamnama?.entry || null;
  const scheduleDaysForResolution = useMemo(() => {
    const scheduleDays = Array.isArray(cmsData?.scheduleDays) ? cmsData.scheduleDays : [];
    const fallbackEntries = [
      ...(cmsData?.schedule?.morning || []).map((item) => ({ ...item, segment: 'morning', titleEn: item.label || '', timeEn: item.time || '' })),
      ...(cmsData?.schedule?.evening || []).map((item) => ({ ...item, segment: 'evening', titleEn: item.label || '', timeEn: item.time || '' }))
    ];

    if (scheduleDays.length === 0) {
      return [{
        dateKey: 'default',
        title: 'Daily Schedule',
        highlightTitle: '',
        highlightNoteEn: '',
        highlightNotePa: '',
        entries: fallbackEntries
      }];
    }

    return scheduleDays;
  }, [cmsData]);
  const resolvedScheduleDay = useMemo(
    () => resolveScheduleForDate(scheduleDaysForResolution, todayDateKey),
    [scheduleDaysForResolution, todayDateKey]
  );
  const schedulePreviews = useMemo(() => {
    const today = new Date(`${todayDateKey}T12:00:00`);
    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + (7 - today.getDay() || 7));
    const sundayDateKey = toDateKey(nextSunday);
    const specialDay = scheduleDaysForResolution
      .filter((day) => day.dateKey > todayDateKey && day.dateKey !== 'default' && day.isSpecial !== false)
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey))[0] || null;

    return {
      sunday: {
        type: 'sunday',
        dateKey: sundayDateKey,
        title: 'Upcoming Sunday Schedule',
        schedule: resolveScheduleForDate(scheduleDaysForResolution, sundayDateKey)
      },
      special: specialDay ? {
        type: 'special',
        dateKey: specialDay.dateKey,
        title: 'Upcoming Special-Day Schedule',
        schedule: resolveScheduleForDate(scheduleDaysForResolution, specialDay.dateKey)
      } : {
        type: 'special',
        dateKey: '',
        title: 'Upcoming Special-Day Schedule',
        schedule: null
      }
    };
  }, [scheduleDaysForResolution, todayDateKey]);
  const selectedPreviewRows = useMemo(
    () => sortScheduleEntries(selectedSchedulePreview?.schedule?.entries || []),
    [selectedSchedulePreview]
  );
  const selectedPreviewMorningRows = useMemo(
    () => selectedPreviewRows.filter((item) => (item.segment || 'morning') === 'morning'),
    [selectedPreviewRows]
  );
  const selectedPreviewEveningRows = useMemo(
    () => selectedPreviewRows.filter((item) => (item.segment || 'morning') !== 'morning'),
    [selectedPreviewRows]
  );
  const scheduleRows = useMemo(() => {
    return sortScheduleEntries(Array.isArray(resolvedScheduleDay?.entries) ? resolvedScheduleDay.entries : []).map((item) => ({
      ...item,
      ...resolveScheduleRowState(item.timeEn, new Date())
    }));
  }, [resolvedScheduleDay]);
  const morningScheduleRows = useMemo(
    () => scheduleRows.filter((item) => (item.segment || 'morning') === 'morning'),
    [scheduleRows]
  );
  const eveningScheduleRows = useMemo(
    () => scheduleRows.filter((item) => (item.segment || 'morning') !== 'morning'),
    [scheduleRows]
  );
  const isTodaySpecial = resolvedScheduleDay?.dateKey === todayDateKey && resolvedScheduleDay?.isSpecial !== false;
  const specialDayReason = (resolvedScheduleDay?.specialReason || resolvedScheduleDay?.highlightNoteEn || '').trim();
  const specialDayReasonPa = (resolvedScheduleDay?.specialReasonPa || resolvedScheduleDay?.highlightNotePa || '').trim();
  const specialDayTickerParts = useMemo(
    () => [
      specialDayReason ? { key: 'special-en', label: specialDayReason } : null,
      specialDayReasonPa ? { key: 'special-pa', label: specialDayReasonPa } : null
    ].filter(Boolean),
    [specialDayReason, specialDayReasonPa]
  );
  const specialDayTickerTextVisible = specialDayTickerParts.length > 0;
  const specialDayTickerTextClass = isTodaySpecial ? 'text-amber-50' : 'text-brand-navy';

  useEffect(() => {
    const homeTrack = homeTickerTrackRef.current;
    const specialTrack = specialTickerTrackRef.current;
    if (!homeTrack || !specialTrack || !specialDayTickerTextVisible) {
      return undefined;
    }

    const syncTickerSpeed = () => {
      const homeDuration = Number.parseFloat(window.getComputedStyle(homeTrack).animationDuration) || 160;
      const homeTravelDistance = homeTrack.scrollWidth / 2;
      const specialTravelDistance = specialTrack.scrollWidth / 2;
      if (homeTravelDistance <= 0 || specialTravelDistance <= 0) {
        return;
      }

      const specialDuration = homeDuration * (specialTravelDistance / homeTravelDistance);
      specialTrack.style.setProperty('animation-duration', `${specialDuration}s`, 'important');
    };

    const animationFrameId = window.requestAnimationFrame(syncTickerSpeed);
    const resizeObserver = new ResizeObserver(syncTickerSpeed);
    resizeObserver.observe(homeTrack);
    resizeObserver.observe(specialTrack);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [specialDayTickerTextVisible, specialDayReason, specialDayReasonPa, tickerMotionSeed, tickerRenderKey]);

  const fullHukamnamaLines = activeHukamnama?.lines || [];
  const hukamnamaLines = hukamnamaService.getSelectedShabadLines(activeHukamnama || {});
  const hukamnamaMeta = activeHukamnama?.metadata || {};
  const hasDailyHukamnama = Boolean(activeHukamnama?.ang && hukamnamaLines.length > 0);
  const volunteerOptions = ['Langar', 'Cleaning', 'Parking', 'Teaching', 'Events'];
  const hukamnamaMetaPills = [
    activeHukamnama?.updatedAt ? { key: 'date', label: new Date(activeHukamnama.updatedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) } : null,
    activeHukamnama?.metadata?.raag ? { key: 'raag', label: `Raag: ${activeHukamnama.metadata.raag}` } : null,
    activeHukamnama?.metadata?.writer ? { key: 'writer', label: `Written by: ${activeHukamnama.metadata.writer}` } : null
  ].filter(Boolean);
  const featuredAlbum = albums[0];
  const globalBannerAds = ads.filter((ad) => ad.active && ad.placement === 'Global Banner');
  const globalBannerImageHeightClass = globalBannerAds.length > 2 ? 'h-16 md:h-20' : 'h-24 md:h-28';
  const homeSidebarAds = ads.filter((ad) => ad.active && ad.placement === 'Homepage Sidebar').slice(0, 2);
  const homeFooterAds = ads.filter((ad) => ad.active && ad.placement === 'Homepage Footer').slice(0, 2);

  const openContentModal = (path) => {
    const previewMap = {
      '/events': {
        title: 'Upcoming Events',
        path: '/events',
        type: 'events',
        description: 'View the latest samagams, workshops, and seva gatherings.',
        items: tickerItems.slice(0, 4).map((event) => ({
          primary: event.title,
          secondary: new Date(event.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
        }))
      },
      '/hukamnama': {
        type: 'hukamnama',
        title: 'Daily Hukamnama',
        path: '/hukamnama',
        description: hasDailyHukamnama ? `Ang ${activeHukamnama?.ang || '-'} with full lines and translations.` : 'Today\'s hukamnama is not available yet.',
        metadata: hukamnamaMeta,
        items: fullHukamnamaLines
      },
      '/seva': {
        type: 'seva',
        title: 'Seva Opportunities',
        path: '/seva',
        description: 'Choose seva and register your participation with the sangat.',
        tickerItems: volunteerOptions,
        items: publicLangarNeeds.map((entry) => ({
          primary: entry.name,
          category: entry.category || 'General',
          isNew: isRecentlyAddedLangarItem(entry.addedOn)
        }))
      },
      '/donation': {
        title: 'Support Langar',
        path: '/donation',
        description: 'Your dasvandh supports langar, education, and community outreach.',
        items: [
          { primary: 'Langar Sewa', secondary: 'Weekly groceries, kitchen supplies, and serving support.' },
          { primary: 'Youth Programs', secondary: 'Punjabi school and Gurbani learning activities.' },
          { primary: 'Maintenance', secondary: 'Daily operations and sangat facilities upkeep.' }
        ]
      },
      '/news': {
        type: 'updates',
        title: 'Latest Updates',
        path: '/news',
        description: 'Recent announcements and important community updates.',
        items: (newsArticles || []).map((article) => ({
          primary: article.heading,
          secondary: `Published ${new Date(article.publishedAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })} • ${article.active ? 'Active' : 'Inactive'}`
        }))
      },
      '/gallery': {
        title: 'Gallery',
        path: '/gallery',
        description: 'Browse recent event photos and videos.',
        items: albums.slice(0, 3).map((album) => ({
          primary: album.title,
          secondary: `${album.items} items` 
        }))
      }
    };

    if (path === '/seva') {
      setSelectedSevaCategory('All');
      setSelectedSevaPage(1);
    }

    setSelectedContentLink(previewMap[path] || null);
  };

  const handleHeroSlideAction = (path) => {
    if (/^https?:\/\//i.test(String(path || '').trim())) {
      window.open(path, '_blank', 'noopener,noreferrer');
      return;
    }

    navigate(path);
  };

  return (
    <div className="min-w-0 space-y-0">
      <Seo {...meta} />

      <HomeHeroBanner
        content={cmsData?.hero}
        actions={null}
        onSlideAction={handleHeroSlideAction}
        topRightSlot={null}
      />

      {tickerItems.length > 0 ? (
        <section className="ticker-shell ticker-shell-home relative left-1/2 w-screen -translate-x-1/2 overflow-hidden py-0.5 -mt-1 mb-5 md:mb-6">
          <div
            ref={homeTickerTrackRef}
            key={`${tickerRenderKey}-${tickerMotionSeed}`}
            className="ticker-track ticker-force-motion ticker-speed-medium"
            style={{
              animationName: 'ticker-scroll-left',
              animationDuration: '160s',
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite'
            }}
          >
            {[0, 1, 2].map((groupIndex) => (
              <div key={groupIndex} className="ticker-group">
                {tickerLoopItems.map((event) => (
                  <button
                    key={`${groupIndex}-${event._tickerLoopKey}`}
                    type="button"
                    className="ticker-item ticker-item-home mx-1 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide transition hover:-translate-y-0.5"
                    onClick={() => setSelectedTickerEvent(event)}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-brand-saffron" />
                    <span className="max-w-[190px] truncate font-black sm:max-w-[280px]">{event.title}</span>
                    <span className="ticker-item-date rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-900">
                      {new Date(event.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="h-4 md:h-6 lg:h-8" aria-hidden="true" />

      {globalBannerAds.length > 0 ? (
        <section className="mb-4 rounded-xl py-2 md:mb-5 lg:mb-6">
          <div className="flex flex-nowrap items-stretch gap-2 overflow-hidden">
            {globalBannerAds.map((ad) => (
              <a
                key={ad.id}
                href={ad.website || '#'}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (ad.website) {
                    void advertisementService.recordAdClick(ad.id);
                  }
                }}
                className="block min-w-0 flex-1 overflow-hidden rounded-lg transition hover:opacity-95"
              >
                {ad.bannerUrl ? <img src={ad.bannerUrl} alt={ad.title || 'Advertisement'} className={`${globalBannerImageHeightClass} w-full p-1 object-contain`} loading="lazy" /> : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 pb-8 md:mt-8 lg:mt-10">
        <div className="min-w-0 grid gap-3 lg:grid-cols-[1.5fr_0.85fr]">
          <div className="min-w-0 space-y-3">
            <div className="rounded-xl border border-brand-blue/20 bg-white px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionTitle title="Daily Hukamnama" subtitle="Today's Gurbani with translation." />
                <div className="flex flex-wrap justify-end gap-1.5 text-[11px] font-semibold text-slate-600">
                  {activeHukamnama?.ang ? <span className="rounded-full bg-slate-100 px-2 py-1">Ang {activeHukamnama.ang}</span> : null}
                  {activeHukamnama?.metadata?.raag ? <span className="rounded-full bg-slate-100 px-2 py-1">Raag: {activeHukamnama.metadata.raag}</span> : null}
                  {activeHukamnama?.metadata?.writer ? <span className="rounded-full bg-slate-100 px-2 py-1">Writer: {activeHukamnama.metadata.writer}</span> : null}
                </div>
              </div>
              <div className="mt-3 h-px w-full bg-slate-200" />
              <div className="space-y-3 pt-4">
                {!hasDailyHukamnama ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">Today's hukamnama is not available yet.</p>
                ) : hukamnamaLines.map((line) => (
                  <div key={line.id}>
                    <p className="font-gurmukhi text-lg font-bold leading-relaxed text-slate-950">{line.gurmukhi}</p>
                    {line.translationPunjabi ? <p className="mt-1 text-sm font-semibold text-brand-saffron">Punjabi: {line.translationPunjabi}</p> : null}
                    {line.translationEnglish ? <p className="mt-0.5 text-sm font-semibold text-brand-navy">English: {line.translationEnglish}</p> : null}
                  </div>
                ))}
              </div>
              {hasDailyHukamnama ? (
                <div className="mt-4 flex justify-end">
                  <button type="button" onClick={() => navigate('/hukamnama')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"><span>&gt;</span> Read all hukamnama</button>
                </div>
              ) : null}
            </div>

            <section className={`relative min-w-0 max-w-full overflow-hidden rounded-xl border px-5 py-4 ${isTodaySpecial ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
              {isTodaySpecial ? (
                <div className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  <span aria-hidden="true">✦</span>
                  Special Day
                </div>
              ) : null}

              <div className={`flex flex-wrap items-start justify-between gap-3 ${isTodaySpecial ? 'pt-8' : ''}`}>
                <SectionTitle title="Daily Schedule" subtitle="" />
                <div className="ml-auto flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs font-semibold">
                  <button type="button" onClick={() => setSelectedSchedulePreview(schedulePreviews.sunday)} className="text-brand-blue hover:underline">Upcoming Sunday</button>
                  <button type="button" onClick={() => setSelectedSchedulePreview(schedulePreviews.special)} className="text-brand-blue hover:underline">Next Special Day</button>
                </div>
              </div>

              {specialDayTickerTextVisible ? (
                <div className={`daily-schedule-special-ticker mt-2 w-full min-w-0 max-w-full overflow-hidden border-y ${isTodaySpecial ? 'border-brand-saffron/40 bg-brand-saffron' : 'border-brand-blue/20 bg-brand-blue/10'}`}>
                  <div className="ticker-mask px-3 py-1.5">
                    <div ref={specialTickerTrackRef} key={`special-track-${tickerMotionSeed}`} className="ticker-track ticker-force-motion daily-schedule-special-track ticker-speed-fast ticker-no-pause">
                      {[0, 1].map((groupIndex) => (
                        <div key={`special-day-note-${groupIndex}`} className="ticker-group">
                          {[0, 1, 2, 3].map((unitIndex) => (
                            <div key={`${groupIndex}-unit-${unitIndex}`} className={`daily-schedule-special-item inline-flex shrink-0 items-center gap-3 text-sm font-extrabold ${specialDayTickerTextClass}`}>
                              {specialDayTickerParts.map((part) => <span key={part.key} className="whitespace-nowrap">{part.label}</span>)}
                              <span aria-hidden="true" className="inline-flex h-3 w-3 items-center justify-center text-base font-black leading-none text-black">•</span>
                              <img
                                src={gurdwaraLogo}
                                alt=""
                                aria-hidden="true"
                                className="h-5 w-5 shrink-0 rounded-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="mt-3 space-y-4">
                {scheduleRows.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">No schedule items available for this day.</p>
                ) : null}

                {morningScheduleRows.length > 0 ? (
                  <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-sky-200">
                    <div className="border-b border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-sky-800">Morning</div>
                    <table className="schedule-mobile-table w-full table-fixed border-collapse text-left">
                      <tbody>
                        {morningScheduleRows.map((item) => (
                          <tr key={item.id} className={`schedule-mobile-row border-t border-sky-100 ${item.isCurrent ? 'animate-pulse bg-brand-blue/15' : item.isHighlighted ? 'bg-sky-50/40' : 'bg-sky-50/25'} ${item.isActive === false ? 'opacity-45' : ''}`}>
                            <td className="schedule-mobile-time-cell w-[132px] py-3 pr-3 pl-2 align-top md:w-[170px] md:pr-4">
                              <div className="flex items-start gap-3">
                                <span className={`mt-1 inline-flex h-3 w-3 rounded-full ${item.isCurrent ? 'bg-green-500 shadow-[0_0_0_6px_rgba(34,197,94,0.18)]' : item.isHighlighted ? 'bg-brand-blue/80' : 'bg-slate-300'}`} />
                                <div className="min-w-0">
                                  <p className="whitespace-nowrap text-sm font-bold leading-snug text-slate-900">{item.timeEn || 'Time TBD'}</p>
                                  {item.timePa ? <p className="mt-1 whitespace-nowrap text-xs font-medium leading-snug text-slate-500">{item.timePa}</p> : null}
                                </div>
                              </div>
                            </td>
                            <td className="schedule-mobile-text-cell min-w-0 py-3 align-top">
                              <p className="schedule-cell-clip schedule-mobile-title text-sm font-normal text-slate-900 sm:font-semibold">{item.titleEn || 'Untitled schedule item'}</p>
                              {item.titlePa ? <p className="schedule-cell-clip mt-1 text-sm text-brand-saffron">{item.titlePa}</p> : null}
                              {item.noteEn ? <p className="schedule-cell-clip mt-1 text-xs text-slate-600">{item.noteEn}</p> : null}
                              {item.notePa ? <p className="schedule-cell-clip mt-1 text-xs text-slate-500">{item.notePa}</p> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}

                {eveningScheduleRows.length > 0 ? (
                  <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-brand-saffron/35">
                    <div className="border-b border-brand-saffron/35 bg-brand-saffron/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-navy">Evening</div>
                    <table className="schedule-mobile-table w-full table-fixed border-collapse text-left">
                      <tbody>
                        {eveningScheduleRows.map((item) => (
                          <tr key={item.id} className={`schedule-mobile-row border-t border-brand-saffron/20 ${item.isCurrent ? 'animate-pulse bg-brand-blue/15' : item.isHighlighted ? 'bg-brand-saffron/20' : item.segment === 'special' ? 'bg-brand-saffron/10' : 'bg-brand-saffron/5'} ${item.isActive === false ? 'opacity-45' : ''}`}>
                            <td className="schedule-mobile-time-cell w-[132px] py-3 pr-3 pl-2 align-top md:w-[170px] md:pr-4">
                              <div className="flex items-start gap-3">
                                <span className={`mt-1 inline-flex h-3 w-3 rounded-full ${item.isCurrent ? 'bg-green-500 shadow-[0_0_0_6px_rgba(34,197,94,0.18)]' : item.isHighlighted ? 'bg-brand-blue/80' : 'bg-brand-saffron'}`} />
                                <div className="min-w-0">
                                  <p className="whitespace-nowrap text-sm font-bold leading-snug text-slate-900">{item.timeEn || 'Time TBD'}</p>
                                  {item.timePa ? <p className="mt-1 whitespace-nowrap text-xs font-medium leading-snug text-slate-500">{item.timePa}</p> : null}
                                </div>
                              </div>
                            </td>
                            <td className="schedule-mobile-text-cell min-w-0 py-3 align-top">
                              <p className="schedule-cell-clip schedule-mobile-title text-sm font-normal text-slate-900 sm:font-semibold">{item.titleEn || 'Untitled schedule item'}</p>
                              {item.titlePa ? <p className="schedule-cell-clip mt-1 text-sm text-brand-saffron">{item.titlePa}</p> : null}
                              {item.noteEn ? <p className="schedule-cell-clip mt-1 text-xs text-slate-600">{item.noteEn}</p> : null}
                              {item.notePa ? <p className="schedule-cell-clip mt-1 text-xs text-slate-500">{item.notePa}</p> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </section>
            <PageWidgets pagePath="/" homeColumn="primary" />
          </div>

          <div className="min-w-0 space-y-3 self-start">
            {false ? (<aside className="overflow-hidden rounded-xl border border-brand-blue/20 bg-white shadow-[0_18px_45px_-34px_rgba(11,78,162,0.65)]">
              <div className="bg-gradient-to-r from-brand-blue to-blue-700 px-4 py-4 text-white">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-100">Langar needs board</p>
                    <h3 className="mt-1 font-heading text-2xl font-bold">Help stock the kitchen</h3>
                  </div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/15" aria-hidden="true">
                    <ShoppingBagIcon className="h-6 w-6" />
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-blue-100">Only supplies currently requested by the Langar team are shown here.</p>
              </div>

              <div className="px-4 py-4">
                <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 pb-3 text-center">
                  <div className="px-1">
                    <p className="text-xl font-black text-amber-600">{langarNeedsSummary.neededCount}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Required now</p>
                  </div>
                  <div className="px-1">
                    <p className="text-xl font-black text-brand-blue">{langarNeedsSummary.categoryCount}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Categories</p>
                  </div>
                  <div className="px-1">
                    <p className="text-base font-black leading-7 text-emerald-700">{langarNeedsSummary.latestUpdateLabel}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-500">Updated</p>
                  </div>
                </div>

                {langarNeedsSummary.featuredItems.length > 0 ? (
                  <>
                    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Required items by category">
                      {langarNeedsSummary.categoryCounts.map(([category, count]) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => {
                            openContentModal('/seva');
                            setSelectedSevaCategory(category);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-blue-100 hover:text-brand-blue"
                        >
                          {category}
                          <span className="text-brand-blue">{count}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                        <span className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.15)]" />
                        Current requests
                      </p>
                      <p className="text-[11px] font-semibold text-slate-500">Updated {langarNeedsSummary.latestUpdateLabel}</p>
                    </div>
                    <ul className="mt-1 divide-y divide-slate-100">
                      {langarNeedsSummary.featuredItems.map((entry) => {
                        const CategoryIcon = resolveLangarCategoryIcon(entry.category);
                        const category = String(entry.category || 'General').trim() || 'General';

                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              onClick={() => {
                                openContentModal('/seva');
                                setSelectedSevaCategory(category);
                              }}
                              className="group flex w-full items-center gap-3 py-2.5 text-left"
                              aria-label={`View ${category} Langar items`}
                            >
                              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700">
                                <CategoryIcon className="h-5 w-5" />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-bold text-slate-800 group-hover:text-brand-blue">{entry.name}</span>
                                <span className="block text-[11px] text-slate-500">{category}</span>
                              </span>
                              <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-bold text-amber-700">
                                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                                <span className="max-w-[76px] text-right leading-tight">{resolvePublicLangarNeedLabel(entry)}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {langarNeedsSummary.hiddenCount > 0 ? (
                      <button type="button" onClick={() => openContentModal('/seva')} className="mt-1 w-full py-1 text-center text-[11px] font-bold text-brand-blue hover:underline">
                        +{langarNeedsSummary.hiddenCount} more required item{langarNeedsSummary.hiddenCount === 1 ? '' : 's'}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 flex items-start gap-3 border-y border-emerald-100 bg-emerald-50 px-3 py-3">
                    <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-sm font-bold text-emerald-900">No supplies are currently requested</p>
                      <p className="mt-0.5 text-xs text-emerald-800">The Langar team will update this board when new items are needed.</p>
                    </div>
                  </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-200 pt-3">
                  <button type="button" onClick={() => openContentModal('/seva')} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-brand-blue/25 bg-blue-50 px-2 py-2 text-xs font-bold text-brand-blue transition hover:border-brand-blue hover:bg-blue-100">
                    <ListBulletIcon className="h-4 w-4" />
                    Required list
                  </button>
                  <Link to="/donation" className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-brand-saffron px-2 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-500">
                    <GiftIcon className="h-4 w-4" />
                    Support Langar
                  </Link>
                </div>
              </div>
            </aside>) : <LangarNeedsBoard items={cmsData?.langarItems || []} compact />}

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-4">
              <SectionTitle title="Latest Update" subtitle={latestArticle ? '' : 'No active update'} />
              <hr className="-mt-1 mb-4 border-slate-200" />
              <h3 className="truncate font-heading text-xl font-semibold text-slate-900" title={latestArticle?.heading || ''}>{truncateHeading(latestArticle?.heading || 'No active updates', 40)}</h3>
              {latestArticle ? (
                <div
                  className="mt-2 text-sm leading-6 text-slate-600 [&_a]:font-semibold [&_a]:text-brand-saffron [&_a]:underline [&_a]:underline-offset-2 [&_h1]:font-heading [&_h1]:text-xl [&_h1]:font-bold [&_h2]:font-heading [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:list-disc"
                  dangerouslySetInnerHTML={{ __html: truncateHtmlByCharacters(latestArticle.content, 200) }}
                />
              ) : (
                <p className="mt-2 text-sm text-slate-600">Please check the News page for upcoming announcements.</p>
              )}
              <div className="mt-3 flex items-center justify-end gap-4 border-t border-slate-200 pt-3">
                {latestArticle ? <button type="button" onClick={() => setSelectedNewsArticle(latestArticle)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-saffron hover:underline"><span>&gt;</span> Read full update</button> : null}
                <button type="button" onClick={() => navigate('/news')} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"><span>&gt;</span> Read all updates</button>
              </div>
            </section>

            {featuredAlbum ? (
              <article className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                <SectionTitle title="Gallery Highlight" subtitle={featuredAlbum.eventDate || 'Featured folder'} />
                <Link
                  to="/media"
                  className="mt-2 w-full overflow-hidden rounded-lg"
                >
                  <img src={featuredAlbum.frontImage || featuredAlbum.coverUrl || featuredAlbum.coverImage || featuredAlbum.cover || ''} alt={featuredAlbum.title} className="h-36 w-full object-cover" loading="lazy" />
                </Link>
                <h3 className="mt-2 font-heading text-lg font-semibold">{featuredAlbum.title}</h3>
                <div className="mt-1 flex justify-end">
                  <Link to="/media" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-blue hover:underline"><span>&gt;</span> View gallery</Link>
                </div>
              </article>
            ) : null}

            {homeSidebarAds.map((ad) => (
              <a
                key={ad.id}
                href={ad.website || '#'}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (ad.website) {
                    void advertisementService.recordAdClick(ad.id);
                  }
                }}
                className="block overflow-hidden rounded-xl border border-slate-200 hover:border-brand-blue/30"
              >
                {ad.bannerUrl ? <img src={ad.bannerUrl} alt={ad.title || 'Advertisement'} className="h-28 w-full p-2 object-contain md:h-32" loading="lazy" /> : null}
              </a>
            ))}
            <PageWidgets pagePath="/" homeColumn="sidebar" />
          </div>
        </div>
      </section>

      {homeFooterAds.length > 0 ? (
        <section className="rounded-xl border border-slate-200 px-3 py-2">
          <div className="grid gap-2 md:grid-cols-2">
            {homeFooterAds.map((ad) => (
              <a
                key={ad.id}
                href={ad.website || '#'}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (ad.website) {
                    void advertisementService.recordAdClick(ad.id);
                  }
                }}
                className="block overflow-hidden rounded-lg border border-slate-200 hover:border-brand-blue/30"
              >
                {ad.bannerUrl ? <img src={ad.bannerUrl} alt={ad.title || 'Advertisement'} className="h-24 w-full p-1 object-contain md:h-28" loading="lazy" /> : null}
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {selectedTickerEvent ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-[2px]" onClick={() => setSelectedTickerEvent(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_30px_90px_-35px_rgba(15,23,42,0.7)]" onClick={(event) => event.stopPropagation()}>
            <div className="bg-[linear-gradient(110deg,#0b4ea2_0%,#1e3a8a_48%,#0f172a_100%)] px-5 py-4 text-white sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Featured Event</p>
                  <h3 className="mt-1.5 font-heading text-xl font-bold leading-tight text-white sm:text-2xl">{selectedTickerEvent.title}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTickerEvent(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/10 text-base leading-none text-white transition hover:bg-white/20"
                  aria-label="Close event details"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="space-y-3 px-5 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  Date: {new Date(selectedTickerEvent.date).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  Location: {selectedTickerEvent.location || 'To be announced'}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                  Registrations: {selectedTickerEvent.registrations ?? 0}
                </span>
              </div>

              <div className="mt-5 mb-2 h-px bg-slate-200" />

              {selectedTickerEvent.description ? (
                <p className="text-sm leading-6 text-slate-700">{selectedTickerEvent.description}</p>
              ) : null}

              {(() => {
                const imageCandidates = [
                  selectedTickerEvent.mediaUrl,
                  selectedTickerEvent.bannerUrl,
                  ...(Array.isArray(selectedTickerEvent.photos) ? selectedTickerEvent.photos : []),
                  ...(Array.isArray(selectedTickerEvent.images) ? selectedTickerEvent.images : [])
                ];
                const eventImages = Array.from(new Set(
                  imageCandidates
                    .map((value) => String(value || '').trim())
                    .filter(Boolean)
                ));

                if (eventImages.length === 0) {
                  return null;
                }

                return (
                  <div className="space-y-2">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Event Photos</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {eventImages.map((imageUrl, index) => (
                        <a
                          key={`${imageUrl}-${index}`}
                          href={imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group block overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                        >
                          <img src={imageUrl} alt={`${selectedTickerEvent.title} ${index + 1}`} className="h-28 w-full object-cover transition duration-300 group-hover:scale-[1.04]" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="h-px bg-slate-200" />

              <div className="flex flex-wrap items-center justify-end gap-2 pt-0.5">
                <Link to="/events" onClick={() => setSelectedTickerEvent(null)} className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-semibold text-white shadow-[0_12px_30px_-16px_rgba(11,78,162,0.75)] transition hover:bg-brand-blue/90">Open Events Page</Link>
                <button type="button" onClick={() => setSelectedTickerEvent(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedContentLink ? (
        <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/45 px-3 py-4 sm:px-4">
          <div role="dialog" aria-modal="true" aria-label={selectedContentLink.type === 'seva' ? 'Langar Items Needed' : selectedContentLink.title} className={`w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-xl bg-white shadow-xl ${selectedContentLink.type === 'seva' ? 'overflow-hidden p-0' : 'p-4 sm:p-5'}`}>
            <div className={`${selectedContentLink.type === 'seva' ? 'flex items-start justify-between gap-3 rounded-t-xl bg-slate-900 px-4 py-3 text-white' : '-mx-4 -mt-4 mb-4 flex items-start justify-between gap-3 rounded-t-xl px-4 py-3'}`}>
              <div className="min-w-0">
                {selectedContentLink.type === 'hukamnama' ? (
                  <div>
                    <div className="modal-meta-shell sm:hidden">
                      <div className="modal-meta-track modal-meta-scroll gap-2 pb-1 pr-1">
                        <div className="modal-meta-group gap-2 pr-2">
                          {hukamnamaMetaPills.map((pill) => (
                            <p key={pill.key} className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                              {pill.label}
                            </p>
                          ))}
                        </div>
                        <div className="modal-meta-group gap-2 pr-2" aria-hidden="true">
                          {hukamnamaMetaPills.map((pill) => (
                            <p key={`${pill.key}-clone`} className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                              {pill.label}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="hidden flex-nowrap gap-2 overflow-x-auto pb-1 pr-1 sm:flex">
                      {hukamnamaMetaPills.map((pill) => (
                        <p key={pill.key} className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
                          {pill.label}
                        </p>
                      ))}
                    </div>
                    {activeHukamnama?.ang ? <h3 className="mt-3 pt-1 font-heading text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">ਅੰਗ {activeHukamnama.ang} | Ang {activeHukamnama.ang}</h3> : null}
                  </div>
                ) : selectedContentLink.type === 'seva' ? (
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/65">Community Supplies</p>
                    <h3 className="mt-1 font-heading text-2xl font-semibold text-white sm:text-3xl">Langar Items Needed</h3>
                    <p className="mt-1 text-xs text-white/70">Only supplies currently requested by the Gurdwara are listed.</p>
                  </div>
                ) : (
                  <>
                    <h3 className="font-heading text-xl font-semibold text-slate-900 sm:text-2xl">{selectedContentLink.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{selectedContentLink.description}</p>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedContentLink(null)}
                className={`inline-flex h-8 w-8 shrink-0 flex-none items-center justify-center rounded-full text-lg leading-none text-white shadow-[0_8px_18px_rgba(10,77,159,0.3)] transition hover:text-white ${selectedContentLink.type === 'seva' ? 'border border-white/25 bg-white/10 hover:bg-white/20' : 'border border-brand-blue bg-brand-blue hover:border-brand-saffron hover:bg-brand-saffron'}`}
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {selectedContentLink.type === 'hukamnama' ? (
              <>
                <div className="mt-3 h-px bg-slate-200" />
                <div className="mt-4 max-h-[72vh] space-y-4 overflow-y-auto pr-1">
                  {(selectedContentLink.items || []).map((line) => (
                    <article key={line.id}>
                      <p className="mt-1 font-gurmukhi text-lg text-brand-navy">{line.gurmukhi}</p>
                      {line.translationPunjabi ? <p className="mt-1 text-sm font-normal text-brand-saffron">Punjabi: {line.translationPunjabi}</p> : null}
                      {line.translationEnglish ? <p className="mt-0.5 text-sm font-normal text-brand-blue">English: {line.translationEnglish}</p> : null}
                    </article>
                  ))}
                </div>
              </>
            ) : selectedContentLink.type === 'seva' ? (
              <div className="px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="mt-3 flex flex-wrap gap-2">
                  {['All', ...Array.from(new Set((selectedContentLink.items || []).map((item) => item.category || 'General')))].map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setSelectedSevaCategory(category);
                        setSelectedSevaPage(1);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${selectedSevaCategory === category ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
                <div className="mt-3 max-h-[50vh] overflow-y-auto pr-1">
                  {(() => {
                    const filteredItems = (selectedContentLink.items || [])
                      .filter((item) => selectedSevaCategory === 'All' || item.category === selectedSevaCategory);
                    const pageSize = 10;
                    const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
                    const safePage = Math.min(selectedSevaPage, totalPages);
                    const pageItems = filteredItems.slice((safePage - 1) * pageSize, safePage * pageSize);

                    return (
                      <>
                        {pageItems.length > 0 ? (
                          <>
                            <ul className="divide-y divide-slate-100">
                              {pageItems.map((item) => (
                                <li key={`${item.primary}-${item.category}`} className="py-2.5">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <p className="truncate text-base font-bold leading-tight text-slate-800 sm:text-lg">{item.primary}</p>
                                      {item.isNew ? <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">New</span> : null}
                                    </div>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{item.category}</span>
                                  </div>
                                </li>
                              ))}
                            </ul>
                            <div className="mt-3 flex items-center justify-between gap-2">
                              <p className="text-xs text-slate-500">Page {safePage} of {totalPages}</p>
                              <div className="flex gap-2">
                                <button type="button" disabled={safePage === 1} onClick={() => setSelectedSevaPage((prev) => Math.max(1, prev - 1))} className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50">Prev</button>
                                <button type="button" disabled={safePage === totalPages} onClick={() => setSelectedSevaPage((prev) => Math.min(totalPages, prev + 1))} className="rounded-md border border-slate-300 px-2 py-1 text-xs disabled:opacity-50">Next</button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-start gap-3 bg-emerald-50 px-3 py-4">
                            <CheckCircleIcon className="h-5 w-5 shrink-0 text-emerald-700" />
                            <p className="text-sm font-semibold text-emerald-900">No supplies are currently requested in this category.</p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : selectedContentLink.type === 'updates' ? (
              <div className="mt-4 max-h-[55vh] overflow-y-auto pr-1">
                <ul className="divide-y divide-slate-100">
                  {(selectedContentLink.items || []).map((item) => (
                    <li key={`${item.primary}-${item.secondary}`} className="py-3">
                      <p className="text-sm font-semibold text-slate-800">{item.primary}</p>
                      <p className="mt-1 text-xs text-slate-600 sm:text-sm">{item.secondary}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="mt-4 max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                {(selectedContentLink.items || []).map((item) => (
                  <article key={`${item.primary}-${item.secondary}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-800">{item.primary}</p>
                    <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">{item.secondary}</p>
                  </article>
                ))}
              </div>
            )}

          </div>
        </div>
      ) : null}
      {selectedSchedulePreview ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 px-3 py-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedSchedulePreview(null);
        }}>
          <div role="dialog" aria-modal="true" aria-labelledby="schedule-preview-title" className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 bg-gradient-to-r from-brand-blue to-blue-700 px-4 py-4 text-white sm:px-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100">Gurdwara Program</p>
                <h3 id="schedule-preview-title" className="mt-1 font-heading text-xl font-semibold text-white sm:text-2xl">{selectedSchedulePreview.title}</h3>
              </div>
              <div className="flex shrink-0 items-start gap-3">
                {selectedSchedulePreview.dateKey ? <p className="pt-1 text-right text-sm font-bold text-white sm:text-base">{formatScheduleDate(selectedSchedulePreview.dateKey)}</p> : null}
                <button type="button" onClick={() => setSelectedSchedulePreview(null)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/10 text-lg leading-none text-white hover:bg-white/20" aria-label="Close schedule preview">×</button>
              </div>
            </div>
            {selectedSchedulePreview.schedule ? (
              <div className="max-h-[calc(90vh-92px)] overflow-y-auto">
                {(selectedSchedulePreview.schedule.specialReason || selectedSchedulePreview.schedule.highlightNoteEn || selectedSchedulePreview.schedule.specialReasonPa || selectedSchedulePreview.schedule.highlightNotePa) ? <div className="daily-schedule-special-ticker w-full overflow-hidden border-y border-slate-800 bg-slate-900">
                  <div className="ticker-mask px-3 py-2">
                    <div className="ticker-track ticker-force-motion daily-schedule-special-track ticker-speed-fast ticker-no-pause">
                      {[0, 1].map((groupIndex) => (
                        <div key={`preview-ticker-${groupIndex}`} className="ticker-group" aria-hidden={groupIndex === 1}>
                          {[0, 1, 2].map((unitIndex) => (
                            <div key={`preview-ticker-${groupIndex}-${unitIndex}`} className="daily-schedule-special-item inline-flex shrink-0 items-center gap-3 text-sm font-extrabold text-amber-50">
                              {[selectedSchedulePreview.schedule.specialReason, selectedSchedulePreview.schedule.highlightNoteEn, selectedSchedulePreview.schedule.specialReasonPa, selectedSchedulePreview.schedule.highlightNotePa].filter(Boolean).map((message) => <span key={message} className="ml-5 whitespace-nowrap">{message}</span>)}
                              <img src={gurdwaraLogo} alt="" aria-hidden="true" className="mr-3 h-5 w-5 shrink-0 rounded-full object-cover" />
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div> : null}
                <div className="space-y-4 p-4 sm:p-5">
                  {[
                    { key: 'morning', label: 'Morning', rows: selectedPreviewMorningRows, border: 'border-sky-200', header: 'border-sky-200 bg-sky-50 text-sky-800', row: 'border-sky-100 bg-sky-50/25' },
                    { key: 'evening', label: 'Evening', rows: selectedPreviewEveningRows, border: 'border-amber-200', header: 'border-amber-200 bg-amber-50 text-amber-800', row: 'border-amber-100 bg-amber-50/35' }
                  ].filter((section) => section.rows.length > 0).map((section) => (
                    <section key={section.key} className={`overflow-hidden rounded-lg border ${section.border}`}>
                      <div className={`border-b px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide ${section.header}`}>{section.label}</div>
                      <div className="divide-y divide-slate-100">
                        {section.rows.map((item) => (
                          <div key={item.id} className={`grid grid-cols-[110px_1fr] gap-3 px-3 py-3 sm:grid-cols-[160px_1fr] ${section.row}`}>
                            <div className="text-sm font-bold text-slate-800">
                              <p>{item.timeEn || 'Time TBD'}</p>
                              {item.timePa ? <p className="mt-1 text-xs font-medium text-slate-500">{item.timePa}</p> : null}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900">{item.titleEn || 'Schedule item'}</p>
                              {item.titlePa ? <p className="mt-1 text-sm text-brand-saffron">{item.titlePa}</p> : null}
                              {item.noteEn ? <p className="mt-1 text-xs text-slate-600">{item.noteEn}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <p className="px-5 py-10 text-center text-sm text-slate-600">No upcoming special-day schedule has been published.</p>
            )}
          </div>
        </div>
      ) : null}
      <NewsArticleDialog article={selectedNewsArticle} onClose={() => setSelectedNewsArticle(null)} />
    </div>
  );
};

export default HomePage;
