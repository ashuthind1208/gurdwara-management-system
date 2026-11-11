import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDaysIcon, MapPinIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Seo from '../../components/common/Seo';
import { useBranding } from '../../context/BrandingContext';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import { selectedWelcomeDishes, WELCOME_THEMES } from '../../services/welcomeJourneyDisplay';

const todayKey = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

const WelcomeJourneyBoardPage = () => {
  const { branding, logoSrc } = useBranding();
  const { data: settings = {} } = useQuery({ queryKey: ['welcome-journey-settings'], queryFn: welcomeJourneyService.getSettings, refetchInterval: 15000, refetchIntervalInBackground: true });
  const { data: home = {} } = useQuery({ queryKey: ['welcome-journey-home-content'], queryFn: () => cmsService.getHomeContent().then((response) => response.data), refetchInterval: 15000, refetchIntervalInBackground: true });
  const day = useMemo(() => resolveScheduleForDate(home.scheduleDays || [], todayKey()), [home.scheduleDays]);
  const programs = (day?.entries || []).filter((entry) => entry.isActive !== false).slice(0, 3);
  const dishes = selectedWelcomeDishes(settings);
  const url = `${window.location.origin}/welcome`;
  const theme = WELCOME_THEMES[settings.theme] || WELCOME_THEMES.navy;
  const guideSections = [settings.showDirections !== false && 'Directions', settings.showProgram !== false && 'Program', settings.showLangar !== false && 'Langar'].filter(Boolean).join(' · ');

  if (settings.enabled === false) return <main className={`grid h-screen place-items-center bg-gradient-to-br ${theme} p-8 text-center text-white`}><div><img src={logoSrc} alt="" className="mx-auto h-24 w-24 rounded-full" /><h1 className="mt-6 text-4xl font-bold">{branding.organizationName}</h1><p role="status" className="mt-4 text-2xl">The welcome guide is temporarily unavailable.</p></div></main>;

  return <main className={`relative flex h-screen min-h-[480px] w-screen flex-col overflow-hidden bg-gradient-to-br ${theme} p-[clamp(16px,2.4vw,42px)] text-white`} aria-label="Sangat welcome journey LED board">
    <Seo title="Sangat Welcome Journey" description="Scan for directions, today’s program, langar, and optional follow-up." />
    <header className="flex shrink-0 items-center gap-4 border-b border-white/20 pb-4"><img src={logoSrc} alt="" className="h-[clamp(48px,8vh,92px)] w-[clamp(48px,8vh,92px)] rounded-full border-2 border-amber-300 bg-white object-cover" /><div className="min-w-0 flex-1"><p className="truncate text-[clamp(12px,1vw,20px)] font-bold uppercase tracking-[.18em] text-amber-200">{settings.locationName || branding.organizationName}</p><h1 className="truncate font-heading text-[clamp(28px,4vw,68px)] font-black leading-tight">{settings.titleEnglish || 'Welcome to Singh Sabha Milton'}</h1>{settings.titlePunjabi ? <p lang="pa" className="font-gurmukhi text-[clamp(15px,1.3vw,24px)] text-blue-100">{settings.titlePunjabi}</p> : null}</div></header>
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.65fr)_minmax(260px,.75fr)] gap-[clamp(14px,2vw,32px)] py-[clamp(14px,2vh,28px)]">
      <section className="flex min-h-0 flex-col justify-center gap-[clamp(12px,2vh,26px)]">
        <p className="max-w-5xl text-[clamp(17px,1.75vw,30px)] leading-relaxed text-blue-50">{settings.introEnglish || 'We are glad you are here. Scan for today’s program, langar, directions, and a way to stay connected.'}</p>
        {settings.introPunjabi ? <p lang="pa" className="max-w-5xl font-gurmukhi text-[clamp(15px,1.35vw,24px)] leading-relaxed text-blue-100">{settings.introPunjabi}</p> : null}
        <div className="grid min-h-0 grid-cols-2 gap-4">
          {settings.showProgram !== false ? <section className="min-w-0 rounded-2xl border border-white/20 bg-white/10 p-[clamp(13px,1.5vw,24px)] backdrop-blur-sm"><h2 className="flex items-center gap-2 text-[clamp(17px,1.5vw,25px)] font-extrabold"><CalendarDaysIcon className="h-6 w-6 text-amber-300" /><span>{settings.programHeadingEnglish || 'Today’s program'}{settings.programHeadingPunjabi ? <span lang="pa" className="mt-1 block font-gurmukhi text-[.8em] font-semibold text-blue-100">{settings.programHeadingPunjabi}</span> : null}</span></h2><div className="mt-3 space-y-3">{programs.length ? programs.map((entry, index) => <div key={entry.id || index} className="border-t border-white/15 pt-2"><p className="text-[clamp(12px,1vw,18px)] font-bold text-amber-200">{entry.timeEn || entry.time || ''}</p><p className="line-clamp-2 text-[clamp(15px,1.2vw,21px)] font-semibold">{entry.titleEn || entry.label}</p>{entry.titlePa ? <p lang="pa" className="line-clamp-1 font-gurmukhi text-sm text-blue-100">{entry.titlePa}</p> : null}</div>) : <p className="mt-3 text-lg">{settings.programNoteEnglish || 'Please ask a volunteer for today’s schedule.'}</p>}</div></section> : null}
          {settings.showLangar !== false ? <section className="min-w-0 rounded-2xl border border-amber-200/30 bg-amber-100/10 p-[clamp(13px,1.5vw,24px)] backdrop-blur-sm"><h2 className="flex items-center gap-2 text-[clamp(17px,1.5vw,25px)] font-extrabold"><SparklesIcon className="h-6 w-6 text-amber-300" /><span>{settings.langarHeadingEnglish || 'Langar today'}{settings.langarHeadingPunjabi ? <span lang="pa" className="mt-1 block font-gurmukhi text-[.8em] font-semibold text-blue-100">{settings.langarHeadingPunjabi}</span> : null}</span></h2><p className="mt-2 text-[clamp(13px,1.05vw,19px)] text-blue-50">{settings.langarNoteEnglish || 'Langar is served to everyone. Please join us.'}</p>
            {settings.langarServiceTimeEnglish ? <p className="mt-2 font-semibold text-amber-200">{settings.langarServiceTimeEnglish}</p> : null}
            {settings.langarServiceTimePunjabi ? <p lang="pa" className="mt-1 font-gurmukhi text-amber-200">{settings.langarServiceTimePunjabi}</p> : null}
            {settings.showLangarMenu !== false && dishes.length > 0 ? <ul aria-label="Today’s langar menu" className="mt-3 flex flex-wrap gap-2">{dishes.map((dish) => <li key={dish.id} className="rounded-xl border border-amber-200/40 bg-black/10 px-3 py-1 text-[clamp(11px,.9vw,16px)] font-semibold"><span>{dish.nameEnglish}</span>{dish.namePunjabi ? <span lang="pa" className="mt-1 block font-gurmukhi">{dish.namePunjabi}</span> : null}</li>)}</ul> : null}</section> : null}
        </div>
        {settings.showDirections !== false ? <p className="flex items-center gap-2 text-[clamp(13px,1.1vw,20px)] text-blue-100"><MapPinIcon className="h-5 w-5 shrink-0 text-amber-300" />{settings.address || branding.address || '7035 Sixth Line, Milton, ON'}</p> : null}
      </section>
      <aside className="flex min-h-0 flex-col items-center justify-center rounded-[clamp(18px,2.5vw,38px)] border border-white/30 bg-white p-[clamp(14px,1.8vw,30px)] text-center text-[#0b2f58] shadow-[0_24px_70px_rgba(0,0,0,.32)]">
        <p className="text-[clamp(17px,1.4vw,25px)] font-black uppercase tracking-wide text-[#0b2f58]">{settings.scanHeadingEnglish || 'Your visit starts here'}</p>
        <div className="my-[clamp(10px,1.5vh,20px)] flex min-h-0 flex-1 items-center justify-center"><QRCodeSVG value={url} size={420} level="H" includeMargin bgColor="#ffffff" fgColor="#0b2f58" style={{ width: 'min(29vw, 48vh)', height: 'min(29vw, 48vh)', maxWidth: '100%', maxHeight: '100%' }} /></div>
        <p className="text-[clamp(18px,1.7vw,30px)] font-extrabold">Scan for today’s guide</p>
        {guideSections ? <p className="mt-1 text-[clamp(12px,1vw,18px)] font-medium text-slate-600">{guideSections}</p> : null}
        {settings.showFollowUp !== false ? <p className="mt-2 text-[clamp(11px,.8vw,15px)] text-slate-500">Optional follow-up · No account required</p> : null}
      </aside>
    </div>
    <footer className="flex shrink-0 items-center justify-between border-t border-white/20 pt-3 text-[clamp(11px,.85vw,16px)] text-blue-100"><span>{settings.showDirections !== false ? settings.directionsLabel || 'Scan for directions and visitor information' : 'Scan for visitor information'}</span><span>{branding.organizationName}</span></footer>
  </main>;
};

export default WelcomeJourneyBoardPage;
