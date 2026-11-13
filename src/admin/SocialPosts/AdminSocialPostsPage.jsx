import { useMemo, useState } from 'react';
import { ArrowPathIcon, Cog6ToothIcon, EyeIcon } from '@heroicons/react/24/outline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '../../components/ui/Card';
import StatusAlert from '../../components/common/StatusAlert';
import socialService from '../../services/socialService';
import eventService from '../../services/eventService';

const fieldClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20';

const POSTERS_PER_PAGE = 10;

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const STATUS_STYLES = {
  posted: 'bg-emerald-100 text-emerald-700',
  'dry-run': 'bg-slate-200 text-slate-700',
  partial: 'bg-amber-100 text-amber-800',
  failed: 'bg-red-100 text-red-700',
  skipped: 'bg-red-100 text-red-700'
};

const STATUS_LABELS = { posted: 'Posted', 'dry-run': 'Dry run', partial: 'Partly posted', failed: 'Unsuccessful', skipped: 'Unsuccessful' };
const PLATFORM_LABELS = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp (Meta)', whatsappGroup: 'WhatsApp group', all: 'All platforms' };
const MODE_LABELS = { auto: 'Automatic', manual: 'Manual', retry: 'Retry' };
const isUnsuccessful = (item) => ['failed', 'partial', 'skipped'].includes(item.status);
const formatWhen = (value) => new Date(value).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const RadioOption = ({ name, label, hint, checked, onChange, children }) => (
  <label className={`block cursor-pointer rounded-lg border p-3 ${checked ? 'border-brand-blue bg-blue-50/40' : 'border-slate-200'}`}>
    <span className="flex items-start gap-3">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-1 h-4 w-4" />
      <span><span className="block text-sm font-semibold text-slate-800">{label}</span>{hint ? <span className="block text-xs text-slate-500">{hint}</span> : null}</span>
    </span>
    {children ? <span className="mt-2 block pl-7">{children}</span> : null}
  </label>
);

const PLATFORM_OPTIONS = [
  { key: 'instagram', label: 'Instagram', statusKey: 'instagramConfigured' },
  { key: 'facebook', label: 'Facebook', statusKey: 'facebookConfigured' },
  { key: 'whatsapp', label: 'WhatsApp (Meta)', statusKey: 'whatsappConfigured' },
  { key: 'whatsappGroup', label: 'WhatsApp group', statusKey: 'whatsappGroupConfigured' }
];

const Light = ({ ok }) => <span className={`inline-block h-3 w-3 shrink-0 rounded-full ${ok ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]'}`} role="img" aria-label={ok ? 'Ready' : 'Not ready'} />;

const ManualPostButton = ({ loading, disabled, children, className, onClick }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={`${className} inline-flex items-center justify-center gap-2 disabled:cursor-wait disabled:opacity-70`}>
    {loading ? <><ArrowPathIcon className="h-4 w-4 animate-spin" aria-hidden="true" /><span>Posting…</span></> : children}
  </button>
);

const PosterThumb = ({ src, alt, title, onOpen }) => {
  const [failed, setFailed] = useState(false);
  return (
    <button type="button" onClick={() => onOpen({ src, title })} disabled={failed} title={failed ? 'No poster available yet' : 'View full poster'} aria-label={`View ${title} poster`} className="relative block h-[60px] w-12 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 disabled:cursor-default">
      <img src={src} alt={alt} loading="lazy" className={`h-full w-full object-cover ${failed ? 'hidden' : ''}`} onError={() => setFailed(true)} onLoad={() => setFailed(false)} />
    </button>
  );
};

const PosterLightbox = ({ poster, onClose }) => (
  <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true" aria-label={poster.title} onClick={onClose}>
    <div className="relative max-h-full" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={onClose} className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-sm font-semibold text-slate-800">Close</button>
      <img src={poster.src} alt={poster.title} className="max-h-[90vh] max-w-full rounded-lg shadow-xl" />
    </div>
  </div>
);

const RowStatus = ({ item, onView }) => (
  <>
    {item
      ? <span title={`${formatWhen(item.createdAt)} · ${MODE_LABELS[item.mode] || item.mode}`} className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.status] || STATUS_STYLES.skipped}`}>{STATUS_LABELS[item.status] || item.status}</span>
      : <span className="inline-flex shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">Not posted</span>}
    <button type="button" onClick={() => onView(item)} disabled={!item} className="shrink-0 rounded-md border border-slate-300 p-1.5 text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:opacity-40" title={item ? 'View posting history' : 'Not posted yet'} aria-label="View posting history"><EyeIcon className="h-4 w-4" /></button>
  </>
);

const PostDetailsModal = ({ item, earlier = [], canRetry, retrying, onRetry, onClose }) => (
  <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-3 py-6" role="dialog" aria-modal="true" aria-label="Post details">
    <div className="mx-auto flex min-h-full items-center justify-center">
      <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-slate-900">{item.title}</h3><span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[item.status] || STATUS_STYLES.skipped}`}>{STATUS_LABELS[item.status] || item.status}</span></div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
        </div>
        <dl className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
          {[['Type', item.kind === 'event' ? 'Event poster' : 'Hukamnama'], ['When', formatWhen(item.createdAt)], ['How', MODE_LABELS[item.mode] || item.mode], ['By', item.actor || 'Automatic']].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-3 py-2"><dt className="font-semibold text-slate-500">{label}</dt><dd className="text-right text-slate-800">{value}</dd></div>
          ))}
        </dl>
        <h4 className="mt-4 text-sm font-semibold text-slate-800">Platforms</h4>
        <ul className="mt-2 space-y-2">
          {(item.results || []).map((result, index) => (
            <li key={`${result.platform}-${index}`} className="flex items-start gap-2.5 rounded-lg border border-slate-200 p-3 text-sm">
              <span className="mt-1"><Light ok={['posted', 'dry-run'].includes(result.status)} /></span>
              <span className="min-w-0 break-words"><span className="font-semibold text-slate-800">{PLATFORM_LABELS[result.platform] || result.platform}</span> · {STATUS_LABELS[result.status] || result.status}{result.message ? <span className="block text-slate-600">{result.message}</span> : null}{result.externalId ? <span className="block text-xs text-slate-500">Post ID {result.externalId}</span> : null}</span>
            </li>
          ))}
        </ul>
        {item.imageUrl ? <img src={item.imageUrl} alt="Card that was posted" className="mt-4 max-h-80 rounded-lg border border-slate-200" /> : null}
        {item.caption ? <><h4 className="mt-4 text-sm font-semibold text-slate-800">Caption</h4><p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{item.caption}</p></> : null}
        {earlier.length ? (
          <>
            <h4 className="mt-4 text-sm font-semibold text-slate-800">Earlier attempts</h4>
            <ul className="mt-2 space-y-1.5">
              {earlier.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
                  <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLES[entry.status] || STATUS_STYLES.skipped}`}>{STATUS_LABELS[entry.status] || entry.status}</span>
                  <span>{formatWhen(entry.createdAt)} · {MODE_LABELS[entry.mode] || entry.mode}</span>
                  <span className="min-w-0 break-words">{(entry.results || []).map((result) => `${PLATFORM_LABELS[result.platform] || result.platform}: ${STATUS_LABELS[result.status] || result.status}`).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {canRetry ? <button type="button" onClick={onRetry} disabled={retrying} className="mt-5 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">{retrying ? 'Retrying…' : 'Retry posting'}</button> : null}
      </div>
    </div>
  </div>
);

const AdminSocialPostsPage = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState({ type: '', message: '' });
  const date = todayKey();
  const [draft, setDraft] = useState(null);
  const [viewItem, setViewItem] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [page, setPage] = useState(0);
  const [activePostTarget, setActivePostTarget] = useState(null);
  const [metaTokenStatus, setMetaTokenStatus] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const settingsQuery = useQuery({ queryKey: ['social-settings'], queryFn: socialService.getSettings });
  const logQuery = useQuery({ queryKey: ['social-log'], queryFn: socialService.getLog, refetchInterval: 30000 });
  const eventsQuery = useQuery({ queryKey: ['social-events'], queryFn: async () => (await eventService.getEvents()).data });

  const settings = draft || settingsQuery.data?.settings;
  const serverStatus = settingsQuery.data?.status;
  const dirty = Boolean(draft);

  const upcoming = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (Array.isArray(eventsQuery.data) ? eventsQuery.data : [])
      .filter((event) => event.active !== false && new Date(event.date).getTime() >= cutoff)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [eventsQuery.data]);

  const posterRows = [{ id: 'hukamnama' }, ...upcoming.map((event) => ({ id: `event:${event.id}`, event }))];
  const pageCount = Math.max(1, Math.ceil(posterRows.length / POSTERS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = posterRows.slice(currentPage * POSTERS_PER_PAGE, (currentPage + 1) * POSTERS_PER_PAGE);

  const saveMutation = useMutation({
    mutationFn: socialService.saveSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(['social-settings'], data);
      setDraft(null);
      setSettingsOpen(false);
      setStatus({ type: 'success', message: 'Settings saved.' });
    },
    onError: (error) => setStatus({ type: 'error', message: error?.response?.data?.message || 'Could not save settings.' })
  });

  const postMutation = useMutation({
    mutationFn: socialService.post,
    onSuccess: (record) => {
      setActivePostTarget(null);
      queryClient.invalidateQueries({ queryKey: ['social-log'] });
      const failed = (record.results || []).filter((item) => item.status === 'failed');
      setStatus({
        type: record.status === 'posted' || record.status === 'dry-run' ? 'success' : 'error',
        message: record.status === 'dry-run'
          ? 'Dry run complete: the card was created and nothing was posted. See the log below.'
          : failed.length ? `Some posts failed: ${failed.map((item) => `${item.platform}: ${item.message}`).join('; ')}` : `Result: ${record.status}.`
      });
    },
    onError: (error) => {
      setActivePostTarget(null);
      setStatus({ type: 'error', message: error?.response?.data?.message || 'Could not create the post.' });
    }
  });

  const retryMutation = useMutation({
    mutationFn: socialService.retry,
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: ['social-log'] });
      setViewItem(null);
      setStatus(record.status === 'posted' || record.status === 'dry-run'
        ? { type: 'success', message: record.status === 'dry-run' ? 'Retry complete.' : 'Posted successfully on retry.' }
        : { type: 'error', message: `Retry was unsuccessful: ${(record.results || []).filter((item) => item.status === 'failed').map((item) => `${PLATFORM_LABELS[item.platform] || item.platform}: ${item.message}`).join('; ') || record.status}` });
    },
    onError: (error) => setStatus({ type: 'error', message: error?.response?.data?.message || 'Could not retry the post.' })
  });
  const tokenStatusMutation = useMutation({
    mutationFn: socialService.checkMetaTokenStatus,
    onSuccess: setMetaTokenStatus,
    onError: (error) => setStatus({ type: 'error', message: error?.response?.data?.message || 'Could not check Meta token status.' })
  });
  const needsRetry = (item) => isUnsuccessful(item) && !(logQuery.data || []).some((other) => other.refKey === item.refKey && other.status === 'posted' && other.createdAt > item.createdAt);

  const update = (patch) => setDraft({ ...settings, ...patch });
  const latestFor = (refKey) => (logQuery.data || []).find((item) => item.refKey === refKey);
  const closeSettings = () => {
    setDraft(null);
    setSettingsOpen(false);
  };
  const postNow = (payload) => {
    const live = settings && !settings.dryRun;
    if (live && !window.confirm('This will publish to the connected social accounts now. Continue?')) return;
    setActivePostTarget(payload.kind === 'event' ? `event:${payload.eventId}` : `hukamnama:${payload.date}`);
    postMutation.mutate({ ...payload, dryRun: !live });
  };


  return (
    <div className="space-y-6">
      <StatusAlert type={status.type} message={status.message} />

      {settingsOpen ? (
      <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-3 py-6" role="dialog" aria-modal="true" aria-label="Automatic posting">
        <div className="mx-auto flex min-h-full items-center justify-center">
          <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Automatic posting</h2>
            <button type="button" onClick={closeSettings} className="shrink-0 rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
          </div>
          {settings ? (
            <div className="mt-4 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-xl border border-slate-200 p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Hukamnama</h3>
                  <div className="mt-3 space-y-2">
                    <RadioOption name="hukamnamaMode" label="Manual only" hint="Nothing is posted until you press Post." checked={settings.hukamnamaMode === 'off'} onChange={() => update({ hukamnamaMode: 'off' })} />
                    <RadioOption name="hukamnamaMode" label="When the Granthi saves it" hint="Posts as soon as today's Hukamnama is saved." checked={settings.hukamnamaMode === 'onSave'} onChange={() => update({ hukamnamaMode: 'onSave' })} />
                    <RadioOption name="hukamnamaMode" label="At a set time" hint="Posts today's Hukamnama at this time each day, including one saved ahead." checked={settings.hukamnamaMode === 'scheduled'} onChange={() => update({ hukamnamaMode: 'scheduled' })}>
                      <input type="time" aria-label="Hukamnama post time" value={settings.hukamnamaTime} disabled={settings.hukamnamaMode !== 'scheduled'} onChange={(event) => update({ hukamnamaTime: event.target.value })} className={`${fieldClass} py-1 disabled:opacity-50`} />
                    </RadioOption>
                  </div>
                </section>
                <div className="space-y-4">
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Events</h3>
                    <div className="mt-3 space-y-2">
                      <RadioOption name="eventMode" label="Automatic" hint="Posts the poster as soon as an event is created." checked={settings.eventAuto} onChange={() => update({ eventAuto: true })} />
                      <RadioOption name="eventMode" label="Manual only" hint="Nothing is posted until you press Post." checked={!settings.eventAuto} onChange={() => update({ eventAuto: false })} />
                    </div>
                  </section>
                  <section className="rounded-xl border border-slate-200 p-4">
                    <h3 className="text-sm font-semibold text-slate-900">Social platforms</h3>
                    <ul className="mt-3 space-y-2">
                      {PLATFORM_OPTIONS.map(({ key, label, statusKey }) => (
                        <li key={key}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3">
                            <input type="checkbox" className="h-4 w-4" checked={Boolean(settings[key])} onChange={(event) => update({ [key]: event.target.checked })} />
                            <span className="flex-1 text-sm font-semibold text-slate-800">{label}</span>
                            <span className="inline-flex items-center gap-2 text-xs text-slate-500"><Light ok={Boolean(serverStatus?.[statusKey])} />{serverStatus?.[statusKey] ? 'Connected' : 'Not connected'}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                    {serverStatus ? <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600"><Light ok={serverStatus.postingEnabled} />Publishing {serverStatus.postingEnabled ? 'enabled' : 'disabled on the server'}</p> : null}
                  </section>
                </div>
              </div>
              <button type="button" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate({ ...settings, dryRun: false })} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saveMutation.isPending ? 'Saving…' : 'Save settings'}</button>
            </div>
          ) : <p className="mt-3 text-sm text-slate-500">Loading…</p>}
          <div className="mt-5 border-t border-slate-200 pt-4">
            <button type="button" onClick={() => tokenStatusMutation.mutate()} disabled={tokenStatusMutation.isPending} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">{tokenStatusMutation.isPending ? 'Checking…' : 'Check Meta token status'}</button>
            {metaTokenStatus ? (
              <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                {Object.entries({ 'Facebook / Instagram': metaTokenStatus.page, WhatsApp: metaTokenStatus.whatsapp }).map(([label, token]) => (
                  <p key={label}><span className="font-semibold">{label}:</span> {token.valid === true ? 'Valid' : token.valid === false ? 'Invalid or expired' : token.configured ? 'Unable to verify' : 'Not configured'}{token.expiresAt ? ` · Expires ${new Date(token.expiresAt).toLocaleString()}` : token.neverExpires ? ' · No expiry reported' : ''}{token.reason ? ` · ${token.reason}` : ''}</p>
                ))}
              </div>
            ) : null}
          </div>
          </div>
        </div>
      </div>
      ) : null}

      <Card>
        <div className="mb-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <h2 className="text-2xl font-bold text-slate-900" style={{ borderBottom: 0, marginBottom: 0, paddingBottom: 0 }}>Posters</h2>
          <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white">
            <Cog6ToothIcon className="h-4 w-4" aria-hidden="true" />Automatic posting
          </button>
        </div>
        <ul>
          {currentPage === 0 ? (
          <li className="flex items-center gap-3 border-b border-slate-200 py-3">
            <PosterThumb src={socialService.hukamnamaCardUrl(date)} alt="Today's Hukamnama card" title="Today's Hukamnama" onOpen={setLightbox} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">Hukamnama</p>
              <p className="text-xs text-slate-500">Today · {new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </div>
            <RowStatus item={latestFor(`hukamnama:${date}`)} onView={setViewItem} />
            <ManualPostButton disabled={postMutation.isPending} loading={postMutation.isPending && activePostTarget === `hukamnama:${date}`} onClick={() => postNow({ kind: 'hukamnama', date })} className="shrink-0 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white">Post</ManualPostButton>
          </li>
          ) : null}
          {visibleRows.filter((row) => row.event).map(({ event }) => (
            <li key={event.id} className="flex items-center gap-3 border-b border-slate-200 py-3">
              <PosterThumb src={socialService.eventCardUrl(event.id)} alt={`Poster for ${event.title}`} title={event.title} onOpen={setLightbox} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800" title={event.title}>{event.title}</p>
                <p className="text-xs text-slate-500">{formatWhen(event.date)}</p>
              </div>
              <RowStatus item={latestFor(`event:${event.id}`)} onView={setViewItem} />
              <ManualPostButton disabled={postMutation.isPending} loading={postMutation.isPending && activePostTarget === `event:${event.id}`} onClick={() => postNow({ kind: 'event', eventId: event.id })} className="shrink-0 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white">Post</ManualPostButton>
            </li>
          ))}
        </ul>
        {pageCount > 1 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>Page {currentPage + 1} of {pageCount} · {posterRows.length} items</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPage(currentPage - 1)} disabled={currentPage === 0} className="rounded-md border border-slate-300 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40">Previous</button>
              <button type="button" onClick={() => setPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} className="rounded-md border border-slate-300 px-3 py-1 font-semibold text-slate-700 disabled:opacity-40">Next</button>
            </div>
          </div>
        ) : null}
        {upcoming.length === 0 ? <p className="mt-2 text-xs text-slate-500">No upcoming events.</p> : null}
        <p className="mt-2 text-xs text-slate-500">Click a thumbnail to see the full poster, or the eye icon for its posting history. A blank Hukamnama thumbnail means none has been saved for today yet.</p>
      </Card>
      {viewItem ? <PostDetailsModal item={viewItem} earlier={(logQuery.data || []).filter((entry) => entry.refKey === viewItem.refKey && entry.id !== viewItem.id)} canRetry={needsRetry(viewItem)} retrying={retryMutation.isPending} onRetry={() => retryMutation.mutate(viewItem.id)} onClose={() => setViewItem(null)} /> : null}
      {lightbox ? <PosterLightbox poster={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
};

export default AdminSocialPostsPage;
