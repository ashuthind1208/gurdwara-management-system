import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDaysIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useQuery } from '@tanstack/react-query';
import Seo from '../../components/common/Seo';
import { useBranding } from '../../context/BrandingContext';
import brandingService from '../../services/brandingService';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import { resolveWelcomeTheme, selectedWelcomeDishes } from '../../services/welcomeJourneyDisplay';

const todayKey = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

const WelcomeJourneyBoardPage = () => {
  const { branding: contextBranding, logoSrc } = useBranding();
  const { data: refreshedBranding } = useQuery({ queryKey: ['gurdwara-branding'], queryFn: () => brandingService.getBranding().then((response) => response.data), refetchInterval: 15000, refetchIntervalInBackground: true });
  const branding = { ...contextBranding, ...(refreshedBranding || {}) };
  const { data: settings = {} } = useQuery({ queryKey: ['welcome-journey-settings'], queryFn: welcomeJourneyService.getSettings, refetchInterval: 15000, refetchIntervalInBackground: true });
  const { data: home = {} } = useQuery({ queryKey: ['welcome-journey-home-content'], queryFn: () => cmsService.getHomeContent().then((response) => response.data), refetchInterval: 15000, refetchIntervalInBackground: true });
  const day = useMemo(() => resolveScheduleForDate(home.scheduleDays || [], todayKey()), [home.scheduleDays]);
  const programs = (day?.entries || []).filter((entry) => entry.isActive !== false).slice(0, 3);
  const dishes = selectedWelcomeDishes(settings);
  const url = `${window.location.origin}/welcome`;
  const theme = resolveWelcomeTheme(settings.theme, branding);
  const guideSections = [settings.showProgram !== false && 'Program', settings.showLangar !== false && 'Langar'].filter(Boolean).join(' · ');

  if (settings.enabled === false) return <main className="grid h-screen place-items-center bg-gradient-to-br p-8 text-center text-white" style={{ backgroundImage: theme.backgroundImage }}><div><img src={logoSrc} alt="" className="mx-auto h-24 w-24 rounded-full" /><h1 className="mt-6 text-4xl font-bold">{branding.organizationName}</h1><p role="status" className="mt-4 text-2xl">The welcome guide is temporarily unavailable.</p></div></main>;

  return <main data-theme={theme.id} className="relative flex h-screen min-h-[480px] w-screen flex-col overflow-hidden bg-gradient-to-br p-[clamp(16px,2.4vw,42px)] text-white" style={{ backgroundImage: theme.backgroundImage }} aria-label="Sangat welcome journey LED board">
    <Seo title="Sangat Welcome Journey" description="Scan for today’s program, langar, and optional follow-up." />
    <header className="flex shrink-0 items-center gap-4 border-b border-white/20 pb-4"><img src={logoSrc} alt="" className="h-[clamp(48px,8vh,92px)] w-[clamp(48px,8vh,92px)] rounded-full border-2 bg-white object-cover" style={{ borderColor: theme.accentColor }} /><div className="min-w-0 flex-1"><p className="truncate text-[clamp(12px,1vw,20px)] font-bold uppercase tracking-[.18em]" style={{ color: theme.accentColor }}>{settings.locationName || branding.organizationName}</p><h1 className="truncate font-heading text-[clamp(28px,4vw,68px)] font-black leading-tight">{settings.titleEnglish || `Welcome to ${branding.organizationName || 'Your Gurdwara'}`}</h1>{settings.titlePunjabi ? <p lang="pa" className="font-gurmukhi text-[clamp(15px,1.3vw,24px)]" style={{ color: theme.accentColor }}>{settings.titlePunjabi}</p> : null}</div></header>
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.65fr)_minmax(260px,.75fr)] gap-[clamp(14px,2vw,32px)] py-[clamp(14px,2vh,28px)]">
      <section className="flex min-h-0 flex-col justify-start gap-[clamp(12px,2vh,26px)]">
        <p className="max-w-5xl text-[clamp(17px,1.75vw,30px)] leading-relaxed text-blue-50">{settings.introEnglish || 'We are glad you are here. Scan for today’s program, langar, and a way to stay connected.'}</p>
        {settings.introPunjabi ? <p lang="pa" className="max-w-5xl font-gurmukhi text-[clamp(15px,1.35vw,24px)] leading-relaxed text-blue-100">{settings.introPunjabi}</p> : null}
        <div className="grid min-h-0 content-start grid-cols-2 items-start gap-4">
          {settings.showProgram !== false ? <section className="min-w-0 rounded-2xl border p-[clamp(13px,1.5vw,24px)] backdrop-blur-sm" style={{ backgroundColor: theme.surfaceColor, borderColor: `${theme.accentColor}66`, color: theme.textColor }}><h2 className="flex items-start gap-2 text-[clamp(17px,1.5vw,25px)] font-extrabold"><CalendarDaysIcon className="mt-1 h-6 w-6 shrink-0" style={{ color: theme.accentColor }} /><span>{settings.programHeadingEnglish || 'Today’s program'}{settings.programHeadingPunjabi ? <span lang="pa" className="mt-1 block font-gurmukhi text-[.8em] font-semibold">{settings.programHeadingPunjabi}</span> : null}</span></h2><div className="mt-3 space-y-3">{programs.length ? programs.map((entry, index) => <div key={entry.id || index} className="border-t border-slate-400/30 pt-2"><p className="text-[clamp(12px,1vw,18px)] font-bold" style={{ color: theme.accentColor }}>{entry.timeEn || entry.time || ''}</p><p className="line-clamp-2 text-[clamp(15px,1.2vw,21px)] font-bold">{entry.titleEn || entry.label}</p>{entry.titlePa ? <p lang="pa" className="mt-1 line-clamp-1 border-t border-dashed border-slate-400/30 pt-1 font-gurmukhi text-[clamp(13px,1vw,18px)] font-semibold" style={{ color: theme.accentColor }}>{entry.titlePa}</p> : null}</div>) : <p className="mt-3 text-lg">{settings.programNoteEnglish || 'Please ask a volunteer for today’s schedule.'}</p>}</div></section> : null}
          {settings.showLangar !== false ? <section className="min-w-0 rounded-2xl border p-[clamp(13px,1.5vw,24px)] backdrop-blur-sm" style={{ backgroundColor: theme.surfaceColor, borderColor: `${theme.accentColor}66`, color: theme.textColor }}><div className="flex items-start justify-between gap-2"><h2 className="flex min-w-0 items-start gap-2 text-[clamp(17px,1.5vw,25px)] font-extrabold"><SparklesIcon className="mt-1 h-6 w-6 shrink-0" style={{ color: theme.accentColor }} /><span>{settings.langarHeadingEnglish || 'Langar today'}{settings.langarHeadingPunjabi ? <span lang="pa" className="mt-1 block font-gurmukhi text-[.8em] font-semibold">{settings.langarHeadingPunjabi}</span> : null}</span></h2>{settings.langarServiceTimeEnglish || settings.langarServiceTimePunjabi ? <div className="shrink-0 rounded-lg px-2 py-1 text-right text-[clamp(10px,.8vw,15px)] font-extrabold" style={{ backgroundColor: `${theme.accentColor}22`, color: theme.primaryColor }}>{settings.langarServiceTimeEnglish ? <p>{settings.langarServiceTimeEnglish}</p> : null}{settings.langarServiceTimePunjabi ? <p lang="pa" className="mt-0.5 font-gurmukhi">{settings.langarServiceTimePunjabi}</p> : null}</div> : null}</div><p className="mt-2 text-[clamp(13px,1.05vw,19px)]">{settings.langarNoteEnglish || 'Langar is served to everyone. Please join us.'}</p>
            {settings.showLangarMenu !== false && dishes.length > 0 ? <ul aria-label="Today’s langar menu" className="mt-3 divide-y rounded-xl border px-3" style={{ borderColor: `${theme.accentColor}55`, backgroundColor: `${theme.primaryColor}0D` }}>{dishes.map((dish) => <li key={dish.id} className="flex flex-wrap items-baseline gap-x-2 py-2"><span className="text-[clamp(12px,.95vw,17px)] font-bold">{dish.nameEnglish}</span>{dish.namePunjabi ? <><span aria-hidden="true" className="text-slate-400">|</span><span lang="pa" className="font-gurmukhi text-[clamp(11px,.85vw,15px)] font-semibold" style={{ color: theme.accentColor }}>{dish.namePunjabi}</span></> : null}</li>)}</ul> : null}</section> : null}
        </div>
      </section>
      <aside className="flex min-h-0 flex-col items-center justify-center rounded-[clamp(18px,2.5vw,38px)] border p-[clamp(14px,1.8vw,30px)] text-center shadow-[0_24px_70px_rgba(0,0,0,.32)]" style={{ backgroundColor: theme.surfaceColor, borderColor: `${theme.accentColor}88`, color: theme.textColor }}>
        <p className="text-[clamp(17px,1.4vw,25px)] font-black uppercase tracking-wide" style={{ color: theme.primaryColor }}>{settings.scanHeadingEnglish || 'Your visit starts here'}</p>
        <div className="my-[clamp(10px,1.5vh,20px)] flex min-h-0 flex-1 items-center justify-center"><QRCodeSVG value={url} size={360} level="H" includeMargin bgColor={theme.surfaceColor} fgColor={theme.primaryColor} style={{ width: 'min(24vw, 40vh)', height: 'min(24vw, 40vh)', maxWidth: '100%', maxHeight: '100%' }} /></div>
        <p className="text-[clamp(18px,1.7vw,30px)] font-extrabold">Scan for today’s guide</p>
        {guideSections ? <p className="mt-1 text-[clamp(12px,1vw,18px)] font-medium" style={{ color: theme.textColor }}>{guideSections}</p> : null}
        {settings.showFollowUp !== false ? <p className="mt-2 text-[clamp(11px,.8vw,15px)] opacity-75">Optional follow-up · No account required</p> : null}
      </aside>
    </div>
    <footer className="flex shrink-0 items-center justify-between border-t border-white/20 pt-3 text-[clamp(11px,.85vw,16px)] text-blue-100"><span>Scan for today’s guide and community information</span><span>{branding.organizationName}</span></footer>
  </main>;
};

export default WelcomeJourneyBoardPage;
