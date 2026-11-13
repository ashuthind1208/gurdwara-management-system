import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from '../../components/ui/Card';
import { BRANDING_PRESETS } from '../../context/BrandingContext';
import streamOverlayProfileService, { overlaySettingsPayload } from '../../services/streamOverlayProfileService';
import uploadService from '../../services/uploadService';

const inputClass = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800 focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20';
const buttonClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50';
const presets = [{ id: 'brand-colors', label: 'Logo Brand Colors', primaryColor: '#004080', accentColor: '#F89820' }, ...BRANDING_PRESETS];
const logoTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const overlayPath = (record) => record.id === 'default' ? '/stream-overlay' : `/stream-overlay/${encodeURIComponent(record.slug)}`;
const suggestSlug = (title) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60).replace(/-$/g, '');
const errorMessage = (error) => error?.response?.data?.message || error?.message || 'Unable to save overlay changes.';

// Mounted only while open, so focus is captured from the invoking table button.
const Dialog = ({ title, busy, onClose, children }) => {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((element) => !element.matches(':disabled'));
    (dialog.querySelector('input:not(:disabled)') || focusable()[0] || dialog).focus();
    const keydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
      }
    };
    const keepFocus = (event) => {
      if (!dialog.contains(event.target)) (focusable()[0] || dialog).focus();
    };
    const overflow = document.body.style.overflow;
    const paddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${parseFloat(window.getComputedStyle(document.body).paddingRight || '0') + scrollbarWidth}px`;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', keepFocus);
      if (previous?.isConnected) previous.focus();
      else document.querySelector('[data-overlay-focus-return]')?.focus();
    };
  }, []);
  return createPortal(<div data-delete-guard-ignore="true" className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 p-3">
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} aria-busy={busy} tabIndex={-1} className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
      <div className="mb-5 flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <h3 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h3>
        <button type="button" aria-label="Close overlay dialog" disabled={busy} onClick={onClose} className="order-last flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-2xl leading-none text-slate-600 hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue disabled:opacity-50">×</button>
      </div>
      {children}
    </div>
  </div>, document.body);
};

const Range = ({ label, name, draft, change, min = 0 }) => <label className="block text-xs font-semibold text-slate-700">{label}: {draft[name]}%{name.endsWith('Speed') && draft[name] === 0 ? ' (paused)' : ''}
  <input type="range" min={min} max="100" value={draft[name]} onChange={(event) => change(name, Number(event.target.value))} className="mt-2 block w-full accent-brand-blue" />
</label>;

const OverlayControls = ({ draft, change }) => {
  const theme = presets.find((preset) => preset.id === draft.overlayThemeId) || presets[0];
  return <div className="space-y-4">
    <section aria-label="Overlay themes" className="rounded-xl border border-rose-200 border-t-4 border-t-rose-500 bg-rose-50 p-4">
      <h4 className="mb-3 border-b border-rose-200 pb-3 text-lg font-bold">Themes and background</h4>
      <div role="group" aria-label="Brand color presets" className="my-3 flex flex-wrap gap-2">
        {presets.map((preset) => <button key={preset.id} type="button" aria-pressed={draft.overlayThemeId === preset.id} onClick={() => change('overlayThemeId', preset.id)} className={`${buttonClass} inline-flex items-center gap-2 ${draft.overlayThemeId === preset.id ? 'border-brand-blue ring-2 ring-brand-blue/20' : ''}`}>
          <span aria-hidden="true" className="flex gap-1"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.primaryColor }} /><span className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.accentColor }} /></span>{preset.label}
        </button>)}
      </div>
      <Range label="Background opacity" name="overlayOpacity" draft={draft} change={change} min={15} />
    </section>
    <div role="group" aria-label="Text and header settings" className="grid gap-4 sm:grid-cols-2">
    <section aria-label="Overlay text and fonts" className="min-w-0 space-y-3 rounded-xl border border-violet-200 border-t-4 border-t-violet-500 bg-violet-50/70 p-4">
      <h4 className="mb-3 border-b border-violet-200 pb-3 text-lg font-bold">Text and font sizes</h4>
      <div className="space-y-4">
        <label className="text-xs font-semibold">Text shown<select className={inputClass} value={draft.overlayLanguages} onChange={(event) => change('overlayLanguages', event.target.value)}><option value="gpe">Gurmukhi + Punjabi + English</option><option value="ge">Gurmukhi + English</option><option value="gp">Gurmukhi + Punjabi</option><option value="g">Gurmukhi only</option></select></label>
        <Range label="Gurbani font size" name="gurmukhiSize" draft={draft} change={change} />
        <Range label="Punjabi translation size" name="punjabiSize" draft={draft} change={change} />
        <Range label="English translation size" name="englishSize" draft={draft} change={change} />
      </div>
    </section>
    <section aria-label="Header controls" className="min-w-0 space-y-3 rounded-xl border border-cyan-200 border-t-4 border-t-cyan-500 bg-cyan-50/70 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 border-b border-cyan-200 pb-3">
        <h4 className="text-lg font-bold">Header — stationary text</h4>
        <button type="button" className={`${buttonClass} ml-auto`} onClick={() => { change('headerBackgroundColor', ''); change('headerBorderColor', ''); }}>Use theme colors</button>
      </div>
      <div role="group" aria-label="Header colors" className="flex flex-wrap items-start gap-3">
        <label className="text-xs font-semibold">Background color<input type="color" className="mt-1 block h-9 w-16" value={draft.headerBackgroundColor || theme.primaryColor} onChange={(event) => change('headerBackgroundColor', event.target.value)} /></label>
        <label className="text-xs font-semibold">Bottom border color<input type="color" className="mt-1 block h-9 w-16" value={draft.headerBorderColor || theme.accentColor} onChange={(event) => change('headerBorderColor', event.target.value)} /></label>
      </div>
      <div className="space-y-4">
        <label className="block text-xs font-semibold">Header occasion — English<input className={inputClass} maxLength={120} value={draft.overlayHeaderMessage} onChange={(event) => change('overlayHeaderMessage', event.target.value)} /></label>
        <label className="block text-xs font-semibold">Header occasion — Punjabi<input lang="pa" className={`${inputClass} font-gurmukhi`} maxLength={120} value={draft.headerPunjabi} onChange={(event) => change('headerPunjabi', event.target.value)} /></label>
        <div role="group" aria-label="Header font sizes" className="space-y-4">
          <Range label="English header font size" name="headerSize" draft={draft} change={change} />
          <Range label="Punjabi header font size" name="headerPunjabiSize" draft={draft} change={change} />
        </div>
      </div>
    </section>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { title: 'Upper footer ticker', position: 'upper', english: 'upperEnglish', punjabi: 'upperPunjabi', speed: 'upperSpeed', size: 'upperSize' },
        { title: 'Bottom footer ticker', position: 'lower', english: 'overlayAnnouncement', punjabi: 'punjabiAnnouncement', speed: 'lowerSpeed', size: 'lowerSize' }
      ].map((ticker) => <section key={ticker.position} aria-label={`${ticker.title} controls`} className={`space-y-3 rounded-xl border border-t-4 p-4 ${ticker.position === 'upper' ? 'border-emerald-200 border-t-emerald-500 bg-emerald-50/70' : 'border-amber-200 border-t-amber-500 bg-amber-50/70'}`}>
        <div className={`flex flex-wrap items-start justify-between gap-3 border-b pb-3 ${ticker.position === 'upper' ? 'border-emerald-200' : 'border-amber-200'}`}>
          <h4 className="text-lg font-bold">{ticker.title}</h4>
          <button type="button" className={`${buttonClass} ml-auto`} onClick={() => change('tickerColors', {
            ...draft.tickerColors,
            [`${ticker.position}bg`]: '',
            [`${ticker.position}fg`]: ''
          })}>Use theme colors</button>
        </div>
        <div className="flex gap-4">{['bg', 'fg'].map((channel) => {
          const key = `${ticker.position}${channel}`;
          const fallback = ticker.position === 'upper' ? (channel === 'bg' ? theme.primaryColor : '#ffffff') : (channel === 'bg' ? theme.accentColor : theme.primaryColor);
          return <label key={key} className="text-xs font-semibold">{channel === 'bg' ? 'Background color' : 'Text color'}<input type="color" className="mt-1 block h-9 w-16" value={draft.tickerColors[key] || fallback} onChange={(event) => change('tickerColors', { ...draft.tickerColors, [key]: event.target.value })} /></label>;
        })}</div>
        <label className="block text-xs font-semibold">English text<input className={inputClass} maxLength={180} placeholder="Leave blank to hide" value={draft[ticker.english]} onChange={(event) => change(ticker.english, event.target.value)} /></label>
        <label className="block text-xs font-semibold">Punjabi text<input lang="pa" className={`${inputClass} font-gurmukhi`} maxLength={180} value={draft[ticker.punjabi]} onChange={(event) => change(ticker.punjabi, event.target.value)} /></label>
        <Range label="Scroll speed" name={ticker.speed} draft={draft} change={change} />
        <Range label="Font size" name={ticker.size} draft={draft} change={change} />
      </section>)}
    </div>
  </div>;
};

const OverlayEditor = ({ record, onClose, onSaved }) => {
  const isDefault = record?.id === 'default';
  const [draft, setDraft] = useState(() => ({ title: '', description: '', slug: '', logoUrl: '', displayName: '', displayAddress: '', isActive: true, ...record, ...overlaySettingsPayload(record, { migrateLegacy: true }), overlayLogo: true }));
  const [slugTouched, setSlugTouched] = useState(Boolean(record));
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value, ...(key === 'title' && !slugTouched ? { slug: suggestSlug(value) } : {}) }));
  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setUploading(true); setProgress(0); setError('');
    try {
      const result = await uploadService.uploadFile({ service: 'cms', file, allowedMimeTypes: logoTypes, maxSizeMB: 5, onProgress: setProgress });
      if (!result?.url) throw new Error('Upload did not return an image URL.');
      change('logoUrl', result.url);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { busyRef.current = false; setBusy(false); setUploading(false); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (busyRef.current) return;
    if (!isDefault && (!draft.title.trim() || draft.title.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) || draft.slug.length > 60)) {
      setError('Enter a title (up to 100 characters) and lowercase kebab-case slug (up to 60).'); return;
    }
    busyRef.current = true; setBusy(true); setError('');
    try {
      const saved = isDefault ? await streamOverlayProfileService.updateDefault(overlaySettingsPayload(draft)) : record ? await streamOverlayProfileService.update(record.id, draft) : await streamOverlayProfileService.create(draft);
      onSaved({ ...draft, ...saved, ...(isDefault ? { id: 'default' } : {}) });
    } catch (failure) { setError(errorMessage(failure)); }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <Dialog title={isDefault ? 'Edit Default overlay' : record ? 'Edit overlay' : 'Add overlay'} busy={busy} onClose={onClose}>
    <form aria-label="Overlay settings" onSubmit={save}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        {isDefault ? <p className="text-sm text-slate-600">Default overlay uses the existing /stream-overlay URL. Its title and URL cannot be changed.</p> : <section aria-label="Overlay identity" className="rounded-xl border border-indigo-200 border-t-4 border-t-indigo-500 bg-indigo-50/70 p-4">
          <h4 className="mb-3 border-b border-indigo-200 pb-3 text-lg font-bold text-slate-900">Overlay identity</h4>
          <div className="grid items-start gap-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <label className="block text-sm font-semibold">Title<input required maxLength={100} className={`${inputClass} bg-white`} value={draft.title} onChange={(event) => change('title', event.target.value)} /></label>
              <label className="block text-sm font-semibold">Slug<input required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={`${inputClass} bg-white`} value={draft.slug} onChange={(event) => { setSlugTouched(true); change('slug', event.target.value); }} /><span className="mt-1 block text-xs font-normal text-slate-500">Lowercase words separated by hyphens; changing this changes the browser-source URL.</span></label>
              <label className="block text-sm font-semibold">Display name<input maxLength={120} aria-describedby="overlay-display-identity-help" className={`${inputClass} bg-white`} value={draft.displayName} onChange={(event) => change('displayName', event.target.value)} /></label>
              <label className="block text-sm font-semibold">Display address<input maxLength={300} aria-describedby="overlay-display-identity-help" className={`${inputClass} bg-white`} value={draft.displayAddress} onChange={(event) => change('displayAddress', event.target.value)} /></label>
              <p id="overlay-display-identity-help" className="text-xs text-slate-500">Leave either field blank to use the Gurdwara branding for that field.</p>
              <p className="break-all text-xs text-indigo-800">Browser source: /stream-overlay/{draft.slug || 'your-channel'}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-indigo-100 bg-white/80 p-3">
              <label className="block text-sm font-semibold">Upload logo<input type="file" accept={logoTypes.join(',')} onChange={upload} className={`${inputClass} bg-white text-xs`} /><span className="mt-2 block text-xs font-normal text-slate-500">PNG, JPEG, WebP or GIF · up to 5 MB</span></label>
              {draft.logoUrl ? <img src={draft.logoUrl} alt="Overlay logo preview" className="mt-3 h-20 w-20 rounded-lg border border-slate-200 bg-white object-contain p-1" /> : <p className="mt-3 text-xs text-slate-500">Uses the Gurdwara logo until you upload a channel logo.</p>}
            </div>
          </div>
        </section>}
        <OverlayControls draft={draft} change={change} />
      </fieldset>
      <p className="mt-4 text-xs text-slate-500">Draft changes are not published. Save to update the browser source. Use a 1920 × 1080 (16:9) browser source above the camera; it follows the Granthi remote.</p>
      {uploading ? <p role="status" className="mt-3 text-sm">Uploading logo… {progress}%</p> : null}
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className={`${buttonClass} bg-brand-blue text-white hover:bg-blue-700`} disabled={busy}>{busy && !uploading ? 'Saving…' : 'Save overlay'}</button>
      </div>
    </form>
  </Dialog>;
};

const StreamOverlayManager = () => {
  const [defaultRecord, setDefaultRecord] = useState(null);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [listReady, setListReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError(''); setListReady(false);
    Promise.allSettled([streamOverlayProfileService.getDefault(), streamOverlayProfileService.list()]).then(([legacy, named]) => {
      if (!active) return;
      const failures = [];
      if (legacy.status === 'fulfilled') setDefaultRecord({ ...legacy.value, id: 'default', title: 'Default overlay' });
      else { setDefaultRecord(null); failures.push(`Default overlay: ${errorMessage(legacy.reason)}`); }
      if (named.status === 'fulfilled') { setRecords(named.value.filter((record) => record.id !== 'default')); setListReady(true); }
      else { setRecords([]); failures.push(`Named overlays: ${errorMessage(named.reason)}`); }
      setLoadError(failures.join(' ')); setLoading(false);
    });
    return () => { active = false; };
  }, [reload]);
  const replace = (record) => {
    if (record.id === 'default') setDefaultRecord(record);
    else setRecords((current) => current.some((item) => item.id === record.id) ? current.map((item) => item.id === record.id ? record : item) : [...current, record]);
  };
  const toggle = async (record) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusyId(record.id); setError(''); setMessage('');
    try {
      if (record.id === 'default') {
        const settings = await streamOverlayProfileService.updateDefault(overlaySettingsPayload({ ...record, overlayOn: !record.overlayOn }));
        replace({ ...record, ...settings });
      } else {
        const isActive = !record.isActive;
        await streamOverlayProfileService.setActive(record.id, isActive);
        replace({ ...record, isActive });
      }
      setMessage(`${record.title} status saved.`);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { busyRef.current = false; setBusyId(null); }
  };
  const remove = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusyId(deleting.id); setError(''); setMessage('');
    try {
      await streamOverlayProfileService.remove(deleting.id);
      setRecords((current) => current.filter((record) => record.id !== deleting.id));
      setDeleting(null); setMessage('Overlay deleted.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { busyRef.current = false; setBusyId(null); }
  };
  const rows = [...(defaultRecord ? [defaultRecord] : []), ...records];
  return <Card className="w-full min-w-0 max-w-full border-t-4 border-t-violet-500 bg-gradient-to-br from-violet-50/80 to-white">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-heading text-xl font-semibold">Stream overlays</h2><p className="mt-1 text-sm text-slate-600">Manage Streamlabs browser sources. Changes are published only when saved.</p></div>
      <button type="button" data-overlay-focus-return className={`${buttonClass} bg-brand-blue text-white hover:bg-blue-700`} disabled={loading || !listReady || busyId !== null} onClick={() => { setError(''); setEditor({ record: null }); }}>Add overlay</button>
    </div>
    {loading ? <p role="status" className="mt-3 text-sm">Loading overlays…</p> : null}
    {loadError ? <div role="alert" className="mt-3 text-sm text-red-700">{loadError} <button type="button" className="underline" disabled={loading || busyId !== null} onClick={() => setReload((value) => value + 1)}>Retry loading overlays</button></div> : null}
    {error && !deleting ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
    {message ? <p role="status" className="mt-3 text-sm text-emerald-700">{message}</p> : null}
    <div data-delete-guard-ignore="true" className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] divide-y divide-slate-200 text-sm">
        <caption className="sr-only">Saved stream overlays</caption>
        <thead><tr className="text-left text-xs uppercase text-slate-500"><th scope="col" className="px-3 py-2">Overlay</th><th scope="col" className="px-3 py-2">URL</th><th scope="col" className="px-3 py-2">Status</th><th scope="col" className="px-3 py-2">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((record) => {
          const active = record.id === 'default' ? record.overlayOn : record.isActive;
          return <tr key={record.id}>
            <th scope="row" className="max-w-xs px-3 py-3 text-left"><p className="break-words font-semibold">{record.title}</p>{record.description ? <p className="mt-1 line-clamp-2 text-xs font-normal text-slate-500">{record.description}</p> : null}</th>
            <td className="px-3 py-3 text-xs text-slate-500">{overlayPath(record)}</td>
            <td className="px-3 py-3"><button type="button" aria-label={`Toggle ${record.title} active status`} aria-pressed={Boolean(active)} disabled={loading || busyId !== null} onClick={() => toggle(record)} className={`rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-50 ${active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{busyId === record.id ? 'Saving…' : active ? 'Active' : 'Inactive'}</button></td>
            <td className="px-3 py-3"><div className="flex items-center gap-3">
              <a href={overlayPath(record)} target="_blank" rel="noreferrer" aria-label={`View ${record.title} (opens in new tab)`} className="font-semibold text-brand-blue underline">View</a>
              <button type="button" className="font-semibold text-brand-blue disabled:opacity-50" aria-label={`Edit ${record.title}`} disabled={loading || busyId !== null} onClick={() => { setError(''); setEditor({ record }); }}>Edit</button>
              {record.id !== 'default' ? <button type="button" className="font-semibold text-red-700 disabled:opacity-50" aria-label={`Delete ${record.title}`} disabled={loading || busyId !== null} onClick={() => { setError(''); setDeleting(record); }}>Delete</button> : <span className="text-xs text-slate-400">Protected</span>}
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {editor ? <OverlayEditor record={editor.record} onClose={() => setEditor(null)} onSaved={(saved) => { replace(saved); setEditor(null); setMessage('Overlay saved.'); }} /> : null}
    {deleting ? <Dialog title="Delete overlay" busy={busyId !== null} onClose={() => setDeleting(null)}>
      <p className="text-sm">Delete “{deleting.title}”? Its browser-source URL will stop working. This cannot be undone.</p>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 flex justify-end gap-2"><button type="button" className={buttonClass} disabled={busyId !== null} onClick={() => setDeleting(null)}>Cancel</button><button type="button" className={`${buttonClass} text-red-700`} disabled={busyId !== null} onClick={remove}>{busyId !== null ? 'Deleting…' : 'Confirm delete'}</button></div>
    </Dialog> : null}
  </Card>;
};

export default StreamOverlayManager;