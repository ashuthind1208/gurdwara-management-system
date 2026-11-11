import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Seo from '../../components/common/Seo';
import LedSlideshow from '../../components/boards/LedSlideshow';
import useSeoMeta from '../../hooks/useSeoMeta';
import useDailyHukamnama from '../../hooks/useDailyHukamnama';
import ledAnnouncementService, { isAnnouncementLive } from '../../services/ledAnnouncementService';
import ledBoardSettingsService from '../../services/ledBoardSettingsService';
import { buildLedSlides, getLedScreens, readScreenId } from '../../constants/ledBoards';
import { useBranding } from '../../context/BrandingContext';
import nanakshahiHolidayService from '../../services/nanakshahiHolidayService';
import useLedScreenHeartbeat from '../../hooks/useLedScreenHeartbeat';
import welcomeJourneyService from '../../services/welcomeJourneyService';

const noop = () => {};

// Display-only LED screen. Which boards play, and for how long, is controlled from the admin portal and picked up on refresh.
const LedBoardLauncherPage = () => {
  const { branding, logoSrc } = useBranding();
  const meta = useSeoMeta('LED Board', 'Gurdwara community LED display.');
  const [searchParams] = useSearchParams();
  const screenId = readScreenId(searchParams.get('screen'));
  const [currentSlide, setCurrentSlide] = useState('Starting');

  const { data: settings } = useQuery({
    queryKey: ['led-board-settings'],
    queryFn: () => ledBoardSettingsService.getSettings().then((response) => response.data),
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });
  const { data: announcements = [] } = useQuery({
    queryKey: ['led-board-announcements'],
    queryFn: () => ledAnnouncementService.getAnnouncements().then((response) => response.data),
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });
  const { data: welcomeJourneySettings } = useQuery({
    queryKey: ['welcome-journey-settings'],
    queryFn: welcomeJourneyService.getSettings,
    refetchInterval: 15000,
    refetchIntervalInBackground: true
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ['nanakshahi-holidays-led'],
    queryFn: () => nanakshahiHolidayService.getHolidaysForDateWindow(),
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1
  });

  const { hasHukamnama } = useDailyHukamnama({ refetchInterval: 5000 });
  const screenLabel = getLedScreens(settings).find((screen) => screen.id === screenId)?.label;

  useLedScreenHeartbeat(screenId, currentSlide, screenLabel);

  const festivalSlides = useMemo(() => {
    if (settings?.festivalBannersEnabled === false) return [];
    const today = new Date();
    const dateKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return holidays.filter((holiday) => holiday.gregorianDate === dateKey && (holiday.isGurpurab || /sangrand|sankranti/i.test(`${holiday.type} ${holiday.title}`)))
      .map((holiday) => ({
        key: `festival:${holiday.id}`,
        kind: 'announcement',
        label: `Gurpurab · ${holiday.title}`,
        durationSeconds: settings.intervalSeconds,
        announcement: { id: `festival:${holiday.id}`, type: 'text', title: holiday.title || 'Gurpurab', subtitle: holiday.titlePa || '', details: holiday.significanceEn || holiday.blurb || 'A blessed day in the Nanakshahi calendar.', eventDate: holiday.gregorianDate, location: '', active: true }
      }));
  }, [holidays, settings]);

  const slides = useMemo(
    () => (settings ? buildLedSlides(settings, { liveAnnouncements: announcements.filter((entry) => isAnnouncementLive(entry) && (!entry.screenIds?.length || entry.screenIds.includes(screenId))), hasHukamnama, screenId, festivalSlides, welcomeJourneyEnabled: welcomeJourneySettings?.enabled !== false }) : []),
    [settings, announcements, hasHukamnama, screenId, festivalSlides, welcomeJourneySettings]
  );

  return (
    <>
      <Seo {...meta} />
      {slides.length && settings
        ? <LedSlideshow kiosk slides={slides} intervalSeconds={settings.intervalSeconds} onExit={noop} onCurrentSlideChange={setCurrentSlide} />
        : (
          <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-[#06142f] via-[#0b2a5b] to-[#06142f] px-8 text-center text-white">
            <img src={logoSrc} alt={`${branding.organizationName} logo`} className="h-32 w-32 rounded-full border-4 border-brand-saffron object-cover" />
            <p className="font-heading text-5xl font-bold">{branding.organizationName}</p>
          </main>
        )}
    </>
  );
};

export default LedBoardLauncherPage;
