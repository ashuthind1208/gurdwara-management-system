import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRecitationLive, useRecitationText } from '../../hooks/useRecitation';
import { BRANDING_PRESETS, useBranding } from '../../context/BrandingContext';
import AnnouncementTicker from '../../components/recitation/AnnouncementTicker';
import { readStreamOverlayVisibility, subscribeStreamOverlayVisibility } from '../../services/streamOverlayControl';
import { getPublishedStreamOverlaySettings, normalizeTickerColors } from '../../services/streamOverlaySettings';

const clamp = (value, min, max, fallback) => {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

const hexToRgb = (hex) => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  return match ? match.slice(1).map((channel) => Number.parseInt(channel, 16)) : [11, 78, 162];
};

const normalizeHex = (value, fallback) => typeof value === 'string' && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

const formatBroadcastDateTime = (date) => ({
  date: date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  time: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
});

const StreamOverlayPage = () => {
  const slug = useMemo(() => {
    const match = window.location.pathname.match(/^\/stream-overlay\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : '';
  }, []);
  const { session } = useRecitationLive();
  const { lines } = useRecitationText(session, 'full');
  const { branding, logoSrc } = useBranding();
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const { data: publishedSettings = {}, isError, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['published-stream-overlay-settings', slug],
    queryFn: () => getPublishedStreamOverlaySettings(slug),
    refetchInterval: 2500,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: 1
  });
  const setting = (queryKey, settingsKey, fallback) => params.has(queryKey) ? params.get(queryKey) : (publishedSettings?.[settingsKey] ?? fallback);
  const enabledValue = setting('on', 'overlayOn', true);
  const enabled = enabledValue !== false && enabledValue !== '0' && enabledValue !== 'false';
  const logoValue = setting('logo', 'overlayLogo', true);
  const showLogo = logoValue !== false && logoValue !== '0' && logoValue !== 'false';
  const opacity = clamp(setting('opacity', 'overlayOpacity', 100), 15, 100, 100) / 100;
  const legacyScale = params.get('size');
  const gurmukhiScale = clamp(setting('sizeg', 'gurmukhiSize', legacyScale ?? 100), 0, 100, 100) / 100;
  const punjabiScale = clamp(setting('sizep', 'punjabiSize', legacyScale ?? 100), 0, 100, 100) / 100;
  const englishScale = clamp(setting('sizee', 'englishSize', legacyScale ?? 100), 0, 100, 100) / 100;
  const languages = String(setting('lang', 'overlayLanguages', 'gpe'));
  const announcement = String(setting('message', 'overlayAnnouncement', '') || '').trim().slice(0, 180);
  const punjabiAnnouncement = String(setting('messagepa', 'punjabiAnnouncement', '') || '').trim().slice(0, 180);
  const headerEnglishScale = clamp(setting('sizehen', 'headerSize', params.get('sizeh') ?? 100), 0, 100, 100) / 100;
  const headerPunjabiScale = clamp(setting('sizehpa', 'headerPunjabiSize', params.get('sizeh') ?? 100), 0, 100, 100) / 100;
  const headerMessage = String(setting('header', 'overlayHeaderMessage', '') || '').trim().slice(0, 120);
  const headerPunjabi = String(setting('headerpa', 'headerPunjabi', '') || '').trim().slice(0, 120);
  const upperEnglish = String(setting('uppermessage', 'upperEnglish', '') || '').trim().slice(0, 180);
  const upperPunjabi = String(setting('uppermessagepa', 'upperPunjabi', '') || '').trim().slice(0, 180);
  const hasTicker = Boolean(announcement || punjabiAnnouncement || upperEnglish || upperPunjabi);
  const [remoteVisible, setRemoteVisible] = useState(readStreamOverlayVisibility);
  const [clockNow, setClockNow] = useState(() => new Date());
  const headerRef = useRef(null);
  const footerRef = useRef(null);
  const [centerBounds, setCenterBounds] = useState({ header: 'var(--overlay-header-height)', footer: 'var(--overlay-footer-height)' });
  const { currentIndex = 0 } = session || {};
  const line = lines[currentIndex] || null;
  const hasRenderedFooter = Boolean(line || hasTicker);
  const selectedTheme = publishedSettings?.overlayThemeId === 'brand-colors'
    ? { primaryColor: '#004080', accentColor: '#F89820' }
    : BRANDING_PRESETS.find((preset) => preset.id === publishedSettings?.overlayThemeId);
  const overlayBlue = normalizeHex(setting('brandBlue', 'brandBlue', selectedTheme?.primaryColor || branding.primaryColor), '#0B4EA2');
  const accentColor = normalizeHex(setting('brandOrange', 'brandOrange', selectedTheme?.accentColor || branding.accentColor), '#F4A300');
  const tickerColors = normalizeTickerColors(publishedSettings?.tickerColors, { migrateLegacy: true });
  const tickerColor = (key, fallback) => normalizeHex(params.has(key) ? params.get(key) : tickerColors[key], fallback);
  const headerBackgroundColor = normalizeHex(publishedSettings?.headerBackgroundColor, overlayBlue);
  const headerBorderColor = normalizeHex(publishedSettings?.headerBorderColor, accentColor);
  const [blueRed, blueGreen, blueBlue] = hexToRgb(overlayBlue);
  const panelColor = `rgba(${blueRed}, ${blueGreen}, ${blueBlue}, ${opacity})`;
  const dateTime = formatBroadcastDateTime(clockNow);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => subscribeStreamOverlayVisibility(setRemoteVisible), []);

  useEffect(() => {
    const updateCenterBounds = () => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height;
      const footerHeight = footerRef.current?.getBoundingClientRect().height;
      setCenterBounds((current) => {
        const header = Number.isFinite(headerHeight) && headerHeight > 0 ? `${headerHeight}px` : current.header;
        const footer = footerRef.current
          ? (Number.isFinite(footerHeight) && footerHeight > 0 ? `${footerHeight}px` : current.footer)
          : '0px';
        return header === current.header && footer === current.footer ? current : { header, footer };
      });
    };
    updateCenterBounds();
    window.addEventListener('resize', updateCenterBounds);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateCenterBounds);
    if (headerRef.current) observer?.observe(headerRef.current);
    if (footerRef.current) observer?.observe(footerRef.current);
    return () => {
      window.removeEventListener('resize', updateCenterBounds);
      observer?.disconnect();
    };
  }, [hasRenderedFooter]);

  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;
    const previous = {
      bodyBackground: body.style.background,
      bodyMargin: body.style.margin,
      bodyOverflow: body.style.overflow,
      htmlBackground: html.style.background
    };
    body.style.background = 'transparent';
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    html.style.background = 'transparent';
    return () => {
      body.style.background = previous.bodyBackground;
      body.style.margin = previous.bodyMargin;
      body.style.overflow = previous.bodyOverflow;
      html.style.background = previous.htmlBackground;
    };
  }, []);

  // Named channels fail closed; an inactive/missing channel cannot be enabled with ?on=1.
  if ((slug && (isError || (!dataUpdatedAt && isFetching) || !publishedSettings.id || publishedSettings.isActive === false)) || !enabled || (!slug && typeof publishedSettings?.overlayOn !== 'boolean' && !remoteVisible)) return <main className="stream-overlay-root" aria-hidden="true" style={{ position: 'fixed', inset: 0, background: 'transparent' }} />;

  const showGurmukhi = languages.includes('g');
  const showPunjabi = languages.includes('p') && Boolean(line?.p);
  const showEnglish = languages.includes('e') && Boolean(line?.e);
  const displayName = slug && typeof publishedSettings.displayName === 'string' ? publishedSettings.displayName.trim() : '';
  const displayAddress = slug && typeof publishedSettings.displayAddress === 'string' ? publishedSettings.displayAddress.trim() : '';
  const organizationName = displayName || String(branding.organizationName || 'Gurdwara Singh Sabha').replace(/\s+Milton$/i, '').trim();
  const organizationAddress = displayAddress || branding.address || '';

  return (
    <main
      className="stream-overlay-root"
      aria-live="polite"
      aria-label="Live Gurbani broadcast overlay"
      style={{ '--gurbani-size': gurmukhiScale, '--punjabi-size': punjabiScale, '--english-size': englishScale, '--overlay-center-color': 'transparent', '--overlay-center-top': centerBounds.header, '--overlay-center-bottom': centerBounds.footer }}
    >
      <style>{`
        .stream-overlay-root{--overlay-header-height:clamp(80px,12vh,140px);--overlay-header-padding:clamp(12px,1.6vh,24px);--overlay-footer-height:clamp(190px,28vh,380px);position:fixed;inset:0;width:100vw;height:100vh;overflow:hidden;background:transparent;color:#fff;pointer-events:none;font-family:Manrope,Arial,sans-serif}
        .stream-overlay-root *{box-sizing:border-box}
        .stream-overlay-root:before{content:"";position:absolute;z-index:0;top:var(--overlay-center-top);right:0;bottom:var(--overlay-center-bottom);left:0;background:var(--overlay-center-color)}
        .stream-overlay-header{position:absolute;z-index:1;top:0;left:0;right:0;min-height:var(--overlay-header-height);width:100%;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr);align-items:center;gap:2vw;padding:var(--overlay-header-padding) 4vw;background-color:${headerBackgroundColor};border-bottom:clamp(3px,.45vh,7px) solid ${headerBorderColor};box-shadow:0 8px 28px rgba(0,0,0,.2)}
        .stream-overlay-identity{display:flex;min-width:0;align-items:center;gap:clamp(12px,1.8vw,28px)}
        .stream-overlay-logo{width:clamp(52px,8vh,92px);height:clamp(52px,8vh,92px);flex:0 0 auto;border:2px solid ${accentColor};border-radius:50%;background:#fff;object-fit:contain;padding:3px}
        .stream-overlay-org-block{min-width:0;display:flex;flex-direction:column;gap:.15vh}
        .stream-overlay-org{min-width:0;color:#fff;font-family:'Crimson Text',Georgia,serif;font-size:clamp(15px,1.35vw,24px);font-weight:500;letter-spacing:.01em;line-height:1.12;text-shadow:0 2px 4px rgba(0,0,0,.28);overflow-wrap:anywhere}
        .stream-overlay-address{min-width:0;color:rgba(255,255,255,.88);font-size:clamp(10px,.85vw,15px);font-weight:400;line-height:1.15;letter-spacing:.025em}
        .stream-overlay-custom-header{min-width:0;text-align:center;color:#fff;font-family:'Crimson Text',Georgia,serif;font-size:clamp(17px,2vw,34px);font-weight:700;line-height:1.15;text-shadow:0 2px 4px rgba(0,0,0,.3);overflow-wrap:anywhere}
        .stream-overlay-date-time{flex:0 0 auto;text-align:right;color:#fff;line-height:1.35}
        .stream-overlay-date{font-size:clamp(12px,1.15vw,20px);font-weight:600;opacity:.94}
        .stream-overlay-time{margin-top:.15vh;color:${accentColor};font-size:clamp(18px,1.8vw,30px);font-weight:800;font-variant-numeric:tabular-nums}
        .stream-overlay-footer{position:absolute;z-index:1;left:0;right:0;bottom:0;width:100%;min-height:0;display:flex;flex-direction:column;justify-content:flex-end;background:${panelColor};border-top:clamp(3px,.45vh,7px) solid ${accentColor};box-shadow:0 -8px 34px rgba(0,0,0,.28);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
        .stream-overlay-ticker-stack{margin-top:0;width:100%;display:flex;flex-direction:column;gap:0;flex-shrink:0}
        .stream-overlay-footer-ticker-only{min-height:0;display:block;background:transparent;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none}
        .stream-overlay-lines{width:100%;display:flex;flex-direction:column;align-items:center;gap:1.15vh;padding:1.5vh 4vw clamp(14px,1.8vh,24px);flex-shrink:0;text-align:center}
        .stream-overlay-g{font-family:'Noto Sans Gurmukhi',sans-serif;font-size:clamp(calc(18px * var(--gurbani-size)),calc(3vw * var(--gurbani-size)),calc(54px * var(--gurbani-size)));font-weight:700;line-height:1.3;color:${accentColor};text-shadow:0 2px 4px rgba(0,0,0,.6);overflow-wrap:anywhere}
        .stream-overlay-p{font-family:'Noto Sans Gurmukhi',sans-serif;font-size:clamp(calc(13px * var(--punjabi-size)),calc(1.45vw * var(--punjabi-size)),calc(27px * var(--punjabi-size)));font-weight:600;line-height:1.35;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.55);overflow-wrap:anywhere}
        .stream-overlay-e{font-size:clamp(calc(13px * var(--english-size)),calc(1.5vw * var(--english-size)),calc(28px * var(--english-size)));font-weight:600;line-height:1.35;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);overflow-wrap:anywhere}
        .stream-overlay-announcement{width:100%;padding:.8vh 4vw;background:${accentColor};color:${overlayBlue};text-align:center;font-size:clamp(15px,1.6vw,28px);font-weight:800}
        @media(max-aspect-ratio:4/3){.stream-overlay-root{--overlay-header-height:clamp(54px,10vh,88px);--overlay-footer-height:clamp(160px,30vh,300px)}.stream-overlay-header{padding:1vh 3vw;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)}.stream-overlay-logo{width:clamp(42px,7vh,72px);height:clamp(42px,7vh,72px)}.stream-overlay-org{font-size:clamp(13px,2vw,19px)}.stream-overlay-address{font-size:clamp(9px,1.4vw,13px)}.stream-overlay-custom-header{font-size:clamp(14px,2.5vw,24px)}.stream-overlay-date{font-size:clamp(10px,1.8vw,15px)}.stream-overlay-time{font-size:clamp(15px,2.6vw,22px)}.stream-overlay-lines{padding-left:3vw;padding-right:3vw;gap:1vh}}
        .stream-overlay-root .stream-overlay-footer-ticker-only{min-height:0}
        @media(max-aspect-ratio:4/3){.stream-overlay-root{--overlay-header-height:clamp(72px,12vh,112px)}.stream-overlay-header{padding-block:var(--overlay-header-padding)}}
      `}</style>
      <header ref={headerRef} className="stream-overlay-header" aria-label="Gurdwara broadcast header">
        <div className="stream-overlay-identity">
          {showLogo ? <img className="stream-overlay-logo" src={(slug && publishedSettings.logoUrl) || logoSrc} alt="" /> : null}
          <div className="stream-overlay-org-block">
            <p className="stream-overlay-org">{organizationName}</p>
            <p className="stream-overlay-address">{organizationAddress}</p>
          </div>
        </div>
        <div className="stream-overlay-custom-header" aria-label="Header occasion text">
          {headerPunjabi ? <p lang="pa" className="font-gurmukhi" style={{ fontSize: `clamp(${14 * headerPunjabiScale}px, ${2 * headerPunjabiScale}vw, ${34 * headerPunjabiScale}px)` }}>{headerPunjabi}</p> : null}
          {headerMessage ? <p lang="en" style={{ fontSize: `clamp(${14 * headerEnglishScale}px, ${2 * headerEnglishScale}vw, ${34 * headerEnglishScale}px)` }}>{headerMessage}</p> : null}
        </div>
        <div className="stream-overlay-date-time" aria-label={`${dateTime.date}, ${dateTime.time}`}>
          <p className="stream-overlay-date">{dateTime.date}</p>
          <p className="stream-overlay-time">{dateTime.time}</p>
        </div>
      </header>
      {hasRenderedFooter ? <section ref={footerRef} className={`stream-overlay-footer${!line ? ' stream-overlay-footer-ticker-only' : ''}`} aria-label={line ? 'Live Gurbani broadcast footer' : 'Announcement ticker'}>
        {line ? (
          <div className="stream-overlay-lines">
            {showGurmukhi ? <p className="stream-overlay-g">{line.g}</p> : null}
            {showPunjabi ? <p className="stream-overlay-p">{line.p}</p> : null}
            {showEnglish ? <p className="stream-overlay-e">{line.e}</p> : null}
          </div>
        ) : null}
        {hasTicker ? <div className="stream-overlay-ticker-stack">
          <AnnouncementTicker english={upperEnglish} punjabi={upperPunjabi} speed={setting('upperspeed', 'upperSpeed', 100)} fontSize={setting('uppersize', 'upperSize', 100)} label="Upper footer announcement ticker" backgroundColor={tickerColor('upperbg', overlayBlue)} color={tickerColor('upperfg', '#ffffff')} />
          <AnnouncementTicker english={announcement} punjabi={punjabiAnnouncement} speed={setting('tickerspeed', 'lowerSpeed', 100)} fontSize={setting('tickersize', 'lowerSize', 100)} backgroundColor={tickerColor('lowerbg', accentColor)} color={tickerColor('lowerfg', overlayBlue)} />
        </div> : null}
      </section> : null}
    </main>
  );
};

export default StreamOverlayPage;
