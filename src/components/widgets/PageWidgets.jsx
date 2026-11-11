import { useQuery } from '@tanstack/react-query';
import { useBranding } from '../../context/BrandingContext';
import { siteConfig } from '../../constants/siteConfig';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';
import communityAnnouncementService from '../../services/communityAnnouncementService';
import donationService from '../../services/donationService';
import eventService from '../../services/eventService';
import galleryService from '../../services/galleryService';
import newsService from '../../services/newsService';
import videoService from '../../services/videoService';
import sponsorService from '../../services/sponsorService';
import { getWidgetLayout } from '../../constants/widgetLayouts';
import { widgetRegistry } from '../../constants/widgetRegistry';
import widgetPlacementService from '../../services/widgetPlacementService';
import SikhContent from './SikhContent';
import { sanitizeWidgetHtml } from '../../utils/sanitizeWidgetHtml';

const DATA_WIDGETS = new Set(['news', 'events', 'schedule', 'langar', 'gallery', 'campaigns', 'notices', 'videos', 'sponsors']);
const localDateKey = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const limitRows = (rows, config) => rows.slice(0, Math.max(1, Math.min(20, Number(config.limit) || 4)));

const loadWidgetSource = async (source) => {
  if (source === 'news') return (await newsService.getArticles()).data || [];
  if (source === 'events') return (await eventService.getEvents()).data || [];
  if (source === 'schedule' || source === 'langar') return (await cmsService.getHomeContent()).data || {};
  if (source === 'gallery') return (await galleryService.getPublicAlbums()).data || [];
  if (source === 'campaigns') return (await donationService.getCampaigns()).data || [];
  if (source === 'notices') return communityAnnouncementService.listPublic();
  if (source === 'videos') return (await videoService.getVideos()).data || [];
  if (source === 'sponsors') return (await sponsorService.getSponsors()).data || [];
  return null;
};

const resolveWidgetRows = (widget, source, config) => {
  const today = localDateKey();
  if (widget.source === 'news') {
    const live = (source || []).filter((item) => item.active !== false && (!item.publishedAt || item.publishedAt.slice(0, 10) <= today) && (!item.expiryDate || item.expiryDate.slice(0, 10) >= today))
      .filter((item) => !config.filter || String(item.category || item.categoryName || '').toLowerCase() === config.filter.toLowerCase());
    if (config.displayMode === 'featured') return live.slice(0, 1);
    if (widget.id === 'featured-story') return live.filter((item) => !config.sourceId || String(item.id) === config.sourceId).slice(0, 1);
    return limitRows(live, config);
  }
  if (widget.source === 'events') {
    let list = (source || []).filter((item) => item.active !== false && item.isActive !== false && String(item.toDate || item.date || '') >= today)
      .filter((item) => !config.filter || String(item.category || item.categoryName || '').toLowerCase() === config.filter.toLowerCase());
    if (/^\d{4}-\d{2}$/.test(config.month || '')) list = list.filter((item) => String(item.date || '').slice(0, 7) === config.month || String(item.toDate || '').slice(0, 7) === config.month);
    if (config.displayMode === 'cards') list = limitRows(list, config);
    if (widget.id === 'next-event') return list.slice(0, 1);
    if (widget.id === 'month-events') {
      const month = /^\d{4}-\d{2}$/.test(config.month || '') ? config.month : today.slice(0, 7);
      return limitRows(list.filter((item) => String(item.date || '').slice(0, 7) === month || String(item.toDate || '').slice(0, 7) === month), config);
    }
    return limitRows(list, config);
  }
  if (widget.source === 'schedule') {
    const day = resolveScheduleForDate(source?.scheduleDays || [], config.date || today);
    let rows = (day?.entries || []).filter((item) => item.isActive !== false);
    if (widget.id === 'morning-schedule' || config.period === 'morning') rows = rows.filter((item) => item.segment === 'morning');
    if (widget.id === 'evening-schedule' || config.period === 'evening') rows = rows.filter((item) => item.segment === 'evening');
    return limitRows(rows, config);
  }
  if (widget.source === 'langar') {
    let rows = (source?.langarItems || []).filter((item) => item.needed !== false && item.isActive !== false);
    if (widget.id === 'urgent-langar-needs' || config.view === 'required soon') rows = rows.filter((item) => item.stockStatus === 'required_soon');
    if (config.filter) rows = rows.filter((item) => String(item.category || '').toLowerCase() === config.filter.toLowerCase());
    return limitRows(rows, config);
  }
  if (widget.source === 'gallery') {
    const albums = (source || []).filter((album) => album.isActive !== false);
    if (widget.id === 'featured-album') return albums.filter((album) => !config.sourceId || String(album.id) === config.sourceId).slice(0, 1);
    return limitRows(albums, config);
  }
  if (widget.source === 'campaigns') {
    const campaigns = (source || []).filter((campaign) => campaign.isActive !== false && campaign.isClosed !== true);
    if (widget.id === 'quick-donate') return campaigns.filter((campaign) => campaign.paymentProvider === 'STRIPE' && (!config.sourceId || String(campaign.id) === config.sourceId)).slice(0, 1);
    if (widget.id === 'campaign-progress') return campaigns.filter((campaign) => !config.sourceId || String(campaign.id) === config.sourceId).slice(0, 1);
    return limitRows(campaigns, config);
  }
  if (widget.source === 'notices') {
    const notices = (source || []).filter((notice) => notice.status === 'approved' || notice.isPublic === true || notice.active === true);
    if (widget.id === 'notice-board') return limitRows(notices.filter((notice) => notice.isFeatured === true), config);
    if (widget.id === 'latest-notice') return notices.slice(0, 1);
    return limitRows(notices, config);
  }
  if (widget.source === 'videos') {
    const videos = (source || []).filter((item) => item.active !== false && item.isActive !== false)
      .filter((item) => !config.filter || String(item.category || '').toLowerCase() === config.filter.toLowerCase());
    return widget.id === 'latest-video' ? videos.slice(0, 1) : limitRows(videos, config);
  }
  if (widget.source === 'sponsors') {
    const sponsors = (source || []).filter((item) => item.active !== false && (!item.expiryDate || item.expiryDate.slice(0, 10) >= today));
    return limitRows(sponsors, config);
  }
  return [];
};

const WidgetRows = ({ widget, rows, error, config }) => {
  if (error) return <p role="status" className="mt-3 text-sm text-slate-500">This content is temporarily unavailable.</p>;
  if (!rows.length) return <p className="mt-3 text-sm text-slate-500">Nothing to display right now.</p>;
  return <ul className="mt-4 divide-y divide-slate-100">{rows.map((row, index) => {
    const title = row.heading || row.titleEn || row.title || row.name || row.itemName || row.categoryName || `Item ${index + 1}`;
    const detail = row.content || row.noteEn || row.description || row.timeEn || row.time || row.address || row.category || '';
    const date = row.date || row.publishedAt || row.eventDate || '';
    const value = widget.source === 'campaigns' && Number(row.target) > 0
      ? `${Math.round((Number(row.raised || 0) / Number(row.target)) * 100)}% of $${Number(row.target).toLocaleString()}`
      : widget.source === 'langar' && Number(row.quantityRequired) > 0 && (widget.id === 'langar-progress' || config.view === 'collection progress')
        ? `${Number(row.quantityReceived || 0)} / ${Number(row.quantityRequired)} ${row.unit || ''}`.trim()
        : '';
    const href = widget.source === 'campaigns'
      ? (row.paymentProvider === 'STRIPE' ? `/quick-donate?campaign=${encodeURIComponent(row.id)}` : `/donation?campaignId=${encodeURIComponent(row.id)}`)
      : widget.source === 'events' ? '/events'
        : widget.source === 'news' ? '/news'
          : widget.source === 'gallery' ? '/gallery'
            : widget.source === 'videos' ? row.videoUrl || '/videos'
              : widget.source === 'sponsors' ? row.websiteUrl || '/contact'
                : widget.source === 'notices' ? '/community-announcements-board' : '';
    return <li key={row.id || `${title}-${index}`} className={`${config.displayMode === 'cards' || config.displayMode === 'featured' ? 'rounded-lg border border-slate-200/70 px-3' : ''} flex items-start justify-between gap-3 py-3`}>
      <div className="min-w-0">{row.bannerUrl ? <img src={row.bannerUrl} alt={title} className="mb-2 max-h-24 max-w-full object-contain" loading="lazy" /> : null}
        {row.thumbnailUrl || row.coverImage ? <img src={row.thumbnailUrl || row.coverImage} alt={title} className="mb-2 max-h-32 max-w-full rounded-lg object-cover" loading="lazy" /> : null}
        <p className="font-semibold text-slate-800">{href ? <a className="hover:text-brand-blue" href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer' : undefined}>{title}</a> : title}</p>
        {detail ? <p className="mt-1 line-clamp-2 text-sm text-slate-600">{detail}</p> : null}
        {date ? <time className={`mt-1 block text-xs ${widget.id === 'event-calendar' || widget.id === 'month-events' ? 'font-bold text-brand-blue' : 'text-slate-500'}`} dateTime={date}>{date}</time> : null}</div>
      {value ? <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800">{value}</span> : null}
    </li>;
  })}</ul>;
};

export const WidgetVisualization = ({ widgetId, config = {}, headerAction }) => {
  const widget = widgetRegistry.find((entry) => entry.id === widgetId);
  const { branding } = useBranding();
  const dataQuery = useQuery({
    queryKey: ['widget-data', widget?.source],
    queryFn: () => loadWidgetSource(widget.source),
    enabled: Boolean(widget && DATA_WIDGETS.has(widget.source)),
    staleTime: 60 * 1000,
    retry: false
  });
  if (!widget) return null;
  const values = { ...widget.defaultConfig, ...config };
  const rows = DATA_WIDGETS.has(widget.source) ? resolveWidgetRows(widget, dataQuery.data, values) : [];
  const heading = values.title || widget.name;
  const backgroundColor = /^#[0-9a-f]{6}$/i.test(values.backgroundColor || '') ? values.backgroundColor : '#ffffff';
  const textColor = /^#[0-9a-f]{6}$/i.test(values.textColor || '') ? values.textColor : '#0f172a';

  if (widget.id === 'photo-only') {
    const imageUrl = String(values.imageUrl || '').trim();
    if (!imageUrl) return <p role="status" className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">Choose or upload an image to preview this photo widget.</p>;
    const imageWidth = Math.min(1920, Math.max(1, Number(values.imageWidth) || 800));
    const imageHeight = Math.min(1920, Math.max(1, Number(values.imageHeight) || 450));
    return <figure aria-label={`${widget.name} widget`} className="relative m-0 min-w-0 max-w-full overflow-hidden" style={{ backgroundColor }}>
      <img src={imageUrl} alt={values.imageAlt || ''} loading="lazy" className="block max-w-full" style={{ width: `${imageWidth}px`, height: `${imageHeight}px`, objectFit: values.imageFit === 'contain' ? 'contain' : 'cover', maxWidth: '100%' }} />
      {headerAction ? <div className="absolute right-2 top-2">{headerAction}</div> : null}
    </figure>;
  }
  if (widget.id === 'live-kirtan') {
    const streamUrl = String(siteConfig?.liveKirtanStreamUrl || '').trim();
    const safeStreamUrl = streamUrl.startsWith('/') && !streamUrl.startsWith('//')
      ? streamUrl
      : /^https:\/\/(?:[\w-]+\.)*(?:sgpc\.net|youtube\.com|youtu\.be)(?::\d+)?(?:\/|$)/i.test(streamUrl) ? streamUrl : '';
    return <section aria-label="Live Kirtan Player widget" className="min-w-0 max-w-full rounded-xl border border-slate-200 p-4" style={{ backgroundColor, color: textColor }}>
      <div className="flex items-center justify-between gap-2"><h3 className="truncate font-heading text-xl font-bold">{heading}</h3>{headerAction}</div>
      {safeStreamUrl ? <audio className="mt-3 w-full" controls preload="none" src={safeStreamUrl}>Your browser does not support audio playback.</audio> : <p className="mt-3 text-sm">Live audio is not configured.</p>}
      {widget.publicPath && widget.actionLabel ? <a href={widget.publicPath} className="mt-3 inline-flex text-sm font-bold text-brand-blue">{widget.actionLabel} →</a> : null}
    </section>;
  }

  return (
    <section aria-label={`${widget.name} widget`} className="min-w-0 max-w-full rounded-xl border border-slate-200 p-4 [&_h3]:text-inherit [&_h4]:text-inherit [&_li]:text-inherit [&_p]:text-inherit [&_time]:text-inherit" style={{ backgroundColor, color: textColor }}>
      {widget.id === 'rich-content' ? (headerAction ? <div className="mb-2 flex justify-end">{headerAction}</div> : null) : <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 title={heading} className="min-w-0 max-w-full truncate font-heading text-xl font-bold text-slate-900">{heading}</h3>{headerAction}
      </div>}
      {widget.id === 'rich-content' ? <div aria-label="Custom rich content" className="prose mt-1 min-w-0 max-w-none text-inherit [overflow-wrap:anywhere] [&_a]:underline [&_img]:h-auto [&_img]:max-w-full [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: sanitizeWidgetHtml(values.contentHtml || '') }} /> : <>
      {['hukamnama', 'scripture', 'nitnem', 'sikh-resources', 'scripture-search', 'quiz', 'live-recitation'].includes(widget.source) ? <SikhContent widget={widget} config={values} /> : widget.source === 'branding' ? <div className="mt-3 space-y-2 text-sm text-slate-700"><p className="font-semibold">{branding?.organizationName}</p>{branding?.tagline ? <p>{branding.tagline}</p> : null}{branding?.address ? <p>{branding.address}</p> : null}{widget.id === 'map-location' && branding?.address ? <a className="inline-flex font-semibold text-brand-blue" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branding.address)}`} target="_blank" rel="noreferrer">Get directions →</a> : null}{branding?.phone ? <a className="block text-brand-blue" href={`tel:${branding.phone}`}>{branding.phone}</a> : null}{branding?.email ? <a className="block text-brand-blue" href={`mailto:${branding.email}`}>{branding.email}</a> : null}{[branding?.facebookUrl, branding?.instagramUrl, branding?.youtubeUrl].filter(Boolean).map((href) => { let host = 'Social channel'; try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { return null; } return <a key={href} className="mr-3 inline-block text-brand-blue" href={href} target="_blank" rel="noreferrer">{host}</a>; })}</div>
          : DATA_WIDGETS.has(widget.source) ? (dataQuery.isPending ? <p role="status" className="mt-3 text-sm text-slate-500">Loading {widget.sourceLabel.toLowerCase()}…</p> : <WidgetRows widget={widget} rows={rows} error={dataQuery.isError} config={values} />)
          : <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{values.quote || values.story || values.blurb || values.description || values.topic || widget.description}</p>}
      {widget.publicPath && widget.actionLabel ? <a href={widget.publicPath} className="mt-3 inline-flex text-sm font-bold text-brand-blue">{widget.actionLabel} →</a> : null}
      </>}
    </section>
  );
};

const PageWidgets = ({ pagePath, region = 'columns', homeColumn }) => {
  const { data = [] } = useQuery({
    queryKey: ['widget-placements'], queryFn: widgetPlacementService.get,
    staleTime: 30000, retry: false
  });
  const currentPage = data.layouts?.find((page) => page.pagePath === pagePath);
  const layout = getWidgetLayout(currentPage?.layoutId);
  const placements = (data.placements || []).filter((entry) => entry.pagePath === pagePath)
    .sort((first, second) => first.order - second.order);
  const regionSlots = layout.slots.filter((slot) => region === 'header' ? slot.id === 'header'
    : region === 'footer' ? slot.id === 'footer'
      : slot.id !== 'header' && slot.id !== 'footer');
  const populatedSlots = regionSlots.map((slot) => ({ slot, entries: placements.filter((entry) => entry.slot === slot.id) })).filter(({ entries }) => entries.length);
  // Home owns two independent card stacks. Keep widgets inside those stacks so
  // a taller sidebar cannot push primary-column widgets below the entire grid.
  if (homeColumn) {
    const entries = populatedSlots.flatMap(({ slot, entries: slotEntries }) =>
      (homeColumn === 'sidebar' ? slot.id === 'right' : slot.id !== 'right') ? slotEntries : []);
    if (!entries.length) return null;
    return <div aria-label={`${homeColumn} Home page widgets`} className="min-w-0 space-y-3">
      {entries.map((entry) => <WidgetVisualization key={entry.id} widgetId={entry.widgetId} config={entry.config} />)}
    </div>;
  }
  if (!populatedSlots.length) return null;
  return <div aria-label={`${region === 'columns' ? 'Content' : region} page widgets`} className={`grid ${layout.gridClass} gap-3 py-2`}>
    {populatedSlots.map(({ slot, entries }) => <div key={slot.id} aria-label={`${slot.label} widget slot`} className={`min-w-0 ${slot.className} grid content-start gap-3`}>
      {entries.map((entry) => <WidgetVisualization key={entry.id} widgetId={entry.widgetId} config={entry.config} />)}
    </div>)}
  </div>;
};

export default PageWidgets;
