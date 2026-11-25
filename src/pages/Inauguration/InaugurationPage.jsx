import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBranding } from '../../context/BrandingContext';
import inaugurationVisitorService from '../../services/inaugurationVisitorService';
import OccasionTicker from './OccasionTicker';
import { getNanakshahiDate } from '../../utils/punjabiCalendar';
import AudioPillPlayer from '../../components/common/AudioPillPlayer';
import { siteConfig } from '../../constants/siteConfig';
import inaugurationService, {
  INAUGURATION_QUERY_KEY, normalizeInaugurationSettings, isSafeInaugurationUrl,
  getInaugurationAvailability, formatInaugurationTorontoTime, getInaugurationOccasionAvailability
} from '../../services/inaugurationService';

const InaugurationContent = ({ settings, draft = false, trackVisitors = true }) => {
  const { branding, logoSrc } = useBranding();
  const [now, setNow] = useState(Date.now);
  const [failedLogos, setFailedLogos] = useState([]);
  const [visitorCount, setVisitorCount] = useState(null);
  const id = useId();
  const config = normalizeInaugurationSettings(settings);
  useEffect(() => {
    if (draft) return undefined;
    let cancelled = false;
    const load = (register) => inaugurationVisitorService.load(register).then((count) => {
      if (!cancelled) setVisitorCount(count);
    }).catch(() => {});
    load(trackVisitors && config.enabled);
    const timer = window.setInterval(() => load(false), 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [draft, trackVisitors, config.enabled]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const customLogo = isSafeInaugurationUrl(config.logoUrl) ? config.logoUrl : '';
  const fallbackLogo = isSafeInaugurationUrl(logoSrc) ? logoSrc : '';
  const logo = [customLogo, fallbackLogo].find((src) => src && !failedLogos.includes(src));
  const Container = draft ? 'section' : 'main';
  const occasion = getInaugurationOccasionAvailability(config.occasion, now);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  const civilDate = new Date(`${today}T12:00:00`);
  const nanakshahi = getNanakshahiDate(civilDate);
  return <Container aria-label={draft ? 'Landing page draft preview' : 'Landing page'}
    className={`${draft ? 'min-h-[36rem]' : 'min-h-screen'} relative flex flex-col px-5 pb-6 pt-5 sm:px-10`}
    style={{ backgroundColor: config.backgroundColor, color: config.textColor, fontFamily: 'var(--font-body, sans-serif)', ...(occasion.visible ? { paddingBottom: `calc(${config.occasion.height + 24}px + env(safe-area-inset-bottom, 0px))` } : {}) }}>
    <div className="grid w-full items-start gap-5 md:grid-cols-3">
      <div className="justify-self-start">
      {!draft ? <AudioPillPlayer label="Live kirtan from Darbar Sahib" src={siteConfig.liveKirtanStreamUrl} stream accent="dark" minimal autoPlay={trackVisitors} initialVolume={0.5} /> : <span className="text-sm">Live kirtan from Darbar Sahib · Preview</span>}
      </div>
      <div className="justify-self-center rounded-full border px-6 py-3 text-center text-xl font-semibold sm:text-2xl" style={{ borderColor: config.accentColor, backgroundColor: 'rgba(255,255,255,0.06)' }} title="Unique browsers using an anonymous cookie. Refreshing does not add another visit; clearing cookies or using another browser counts again.">
      Visitors · {draft ? 'Preview' : visitorCount === null ? '—' : visitorCount.toLocaleString('en-CA')}
      </div>
      <div aria-label="Calendar dates" className="justify-self-center text-center text-base font-medium leading-relaxed sm:text-lg md:justify-self-end md:text-right">
      <time dateTime={today} className="block font-semibold">{new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }).format(civilDate)}</time>
      <p className="mt-1">{nanakshahi.label}</p><p lang="pa" className="mt-1 font-gurmukhi text-lg sm:text-xl">{nanakshahi.labelPa}</p>
      </div>
    </div>
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center py-6">
      <div className="text-center">
        {logo ? <img src={logo} alt={branding?.organizationName || 'Gurdwara logo'}
          className="mx-auto mb-8 max-w-full object-contain" style={{ width: 2 * (occasion.visible ? Math.min(config.logoSize, 96) : config.logoSize), height: 2 * (occasion.visible ? Math.min(config.logoSize, 96) : config.logoSize) }}
          onError={() => setFailedLogos((current) => [...current, logo])} /> : null}
        <h1 lang="en" className={`text-center font-semibold leading-tight ${occasion.visible ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-5xl'}`} style={{ fontFamily: 'var(--font-heading, serif)' }}>{config.headingEnglish}</h1>
        <h2 lang="pa" className="mt-2 text-center font-gurmukhi text-xl leading-relaxed sm:text-2xl">{config.headingPunjabi}</h2>
      </div>
      <div className="mt-5 grid gap-4 text-lg leading-relaxed md:grid-cols-2 md:gap-12">
        <p lang="en" className="whitespace-pre-wrap break-words">{config.messageEnglish}</p>
        <p lang="pa" className="whitespace-pre-wrap break-words font-gurmukhi">{config.messagePunjabi}</p>
      </div>
      <div role="group" aria-label="Landing page buttons" className="mt-5 flex flex-wrap items-start justify-center gap-4">
        {config.buttons.map((button, index) => {
          const availability = getInaugurationAvailability(button, now);
          const descriptionId = `${id}-availability-${index}`;
          const labels = <><span lang="en" className="block font-semibold">{button.labelEnglish}</span><span lang="pa" className="mt-1 block font-gurmukhi">{button.labelPunjabi}</span></>;
          const classes = 'block w-full rounded-xl border px-6 py-4 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4';
          return <div key={`${button.id}-${index}`} className="w-full max-w-xs min-w-0 sm:w-72">
            {availability.available ? <a href={button.url} rel="noopener noreferrer"
              className={classes} style={{ borderColor: config.accentColor, color: config.textColor }}>{labels}</a>
              : <button type="button" disabled aria-describedby={descriptionId} className={`${classes} cursor-not-allowed opacity-60`}
                style={{ borderColor: config.textColor, color: config.textColor }}>{labels}</button>}
            {!availability.available ? <div id={descriptionId} className="mt-2 text-center text-sm">
              <p role="status" aria-live="polite" aria-atomic="true">{availability.message}</p>
              {button.availableAt && Number.isFinite(Date.parse(button.availableAt)) ? <p className="mt-1">
                Opens <time dateTime={button.availableAt}>{formatInaugurationTorontoTime(button.availableAt)}</time> · Toronto
              </p> : null}
            </div> : null}
          </div>;
        })}
      </div>
    </div>
    {occasion.visible ? <OccasionTicker occasion={config.occasion} draft={draft} /> : null}
  </Container>;
};

const SavedInaugurationPage = ({ preview = false }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: INAUGURATION_QUERY_KEY, queryFn: inaugurationService.getSettings,
    refetchInterval: 15000, retry: false
  });
  if (!data) return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
    {isError ? <div role="alert">Unable to load landing page settings. <button type="button" onClick={() => refetch()} className="underline">Try again</button></div>
      : <p role="status">{isLoading ? 'Loading landing page…' : 'Landing page unavailable.'}</p>}
  </main>;
  if (!data.enabled && !preview) return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><p role="status">The landing page is not currently enabled.</p></main>;
  return <>
    {isError ? <p role="alert" className="bg-amber-50 p-3 text-center text-amber-950">Settings could not refresh. Showing the last available version.</p> : null}
    <InaugurationContent settings={data} trackVisitors={!preview} />
  </>;
};

// Draft rendering makes no inauguration request and ignores the homepage toggle.
// The route owner supplies QueryClient/branding providers for the saved page.
const InaugurationPage = ({ settings, preview = false, draft = true } = {}) => settings !== undefined
  ? <InaugurationContent settings={settings} draft={draft} /> : <SavedInaugurationPage preview={preview} />;

export default InaugurationPage;
