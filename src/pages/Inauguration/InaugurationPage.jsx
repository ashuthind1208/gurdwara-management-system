import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useBranding } from '../../context/BrandingContext';
import inaugurationService, {
  INAUGURATION_QUERY_KEY, normalizeInaugurationSettings, isSafeInaugurationUrl,
  getInaugurationAvailability, formatInaugurationTorontoTime
} from '../../services/inaugurationService';

const InaugurationContent = ({ settings, draft = false }) => {
  const { branding, logoSrc } = useBranding();
  const [now, setNow] = useState(Date.now);
  const [failedLogos, setFailedLogos] = useState([]);
  const id = useId();
  const config = normalizeInaugurationSettings(settings);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const customLogo = isSafeInaugurationUrl(config.logoUrl) ? config.logoUrl : '';
  const fallbackLogo = isSafeInaugurationUrl(logoSrc) ? logoSrc : '';
  const logo = [customLogo, fallbackLogo].find((src) => src && !failedLogos.includes(src));
  const Container = draft ? 'section' : 'main';
  return <Container aria-label={draft ? 'Landing page draft preview' : 'Landing page'}
    className={`${draft ? 'min-h-[36rem]' : 'min-h-screen'} flex items-center justify-center px-5 py-12 sm:px-10 sm:py-16`}
    style={{ backgroundColor: config.backgroundColor, color: config.textColor, fontFamily: 'var(--font-body, sans-serif)' }}>
    <div className="mx-auto w-full max-w-5xl">
      <div className="text-center">
        {logo ? <img src={logo} alt={branding?.organizationName || 'Gurdwara logo'}
          className="mx-auto mb-8 max-w-full object-contain" style={{ width: config.logoSize, height: config.logoSize }}
          onError={() => setFailedLogos((current) => [...current, logo])} /> : null}
        <div aria-hidden="true" className="mx-auto mb-8 h-1 w-12 rounded-full" style={{ backgroundColor: config.accentColor }} />
        <h1 lang="en" className="text-center text-3xl font-semibold leading-tight sm:text-5xl" style={{ fontFamily: 'var(--font-heading, serif)' }}>{config.headingEnglish}</h1>
        <h2 lang="pa" className="mt-4 text-center font-gurmukhi text-2xl leading-relaxed sm:text-3xl">{config.headingPunjabi}</h2>
      </div>
      <div className="mt-10 grid gap-8 text-lg leading-relaxed md:grid-cols-2 md:gap-12">
        <p lang="en" className="whitespace-pre-wrap break-words">{config.messageEnglish}</p>
        <p lang="pa" className="whitespace-pre-wrap break-words font-gurmukhi">{config.messagePunjabi}</p>
      </div>
      <div role="group" aria-label="Landing page buttons" className="mt-10 flex flex-wrap items-start justify-center gap-4">
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
      <p className="mt-10 text-center text-sm">
        Toronto local time · <time dateTime={new Date(now).toISOString()}>{formatInaugurationTorontoTime(now)}</time>
      </p>
    </div>
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
    <InaugurationContent settings={data} />
  </>;
};

// Draft rendering makes no inauguration request and ignores the homepage toggle.
// The route owner supplies QueryClient/branding providers for the saved page.
const InaugurationPage = ({ settings, preview = false, draft = true } = {}) => settings !== undefined
  ? <InaugurationContent settings={settings} draft={draft} /> : <SavedInaugurationPage preview={preview} />;

export default InaugurationPage;
