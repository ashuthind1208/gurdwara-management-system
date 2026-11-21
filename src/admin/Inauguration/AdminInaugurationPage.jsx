import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import InaugurationPage from '../../pages/Inauguration/InaugurationPage';
import uploadService from '../../services/uploadService';
import inaugurationService, {
  DEFAULT_INAUGURATION_SETTINGS, INAUGURATION_QUERY_KEY, MAX_INAUGURATION_BUTTONS,
  normalizeInaugurationSettings, validateInaugurationSettings,
  toInaugurationLocalDateTime, fromInaugurationLocalDateTime
} from '../../services/inaugurationService';

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const sectionClass = 'space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const headingStyle = { borderBottom: 0, padding: 0, margin: 0 };

const ButtonDialog = ({ button, editing, onSave, onClose }) => {
  const [draft, setDraft] = useState(() => ({ ...button }));
  const [localTime, setLocalTime] = useState(() => toInaugurationLocalDateTime(button.availableAt));
  const [error, setError] = useState('');
  const dialogRef = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current.querySelector('input')?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  const handleKeyDown = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = dialogRef.current.querySelectorAll('input, button');
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const save = (event) => {
    event.preventDefault();
    try {
      const next = { ...draft, availableAt: fromInaugurationLocalDateTime(localTime) };
      const validation = validateInaugurationSettings({ ...DEFAULT_INAUGURATION_SETTINGS, buttons: [next] });
      if (validation) { setError(validation); return; }
      onSave(next);
    } catch (failure) { setError(failure.message); }
  };
  return createPortal(<div className="fixed inset-0 z-[280] flex items-center justify-center bg-slate-950/60 p-4" data-delete-guard-ignore="true">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="landing-button-dialog-title" aria-describedby="landing-button-dialog-description" onKeyDown={handleKeyDown} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
      <h2 id="landing-button-dialog-title" className="text-xl font-bold">{editing ? 'Edit button' : 'Add button'}</h2>
      <p id="landing-button-dialog-description" className="mt-2 text-sm text-slate-600">Save button updates only the local draft. Use Save landing page settings to publish.</p>
      <form onSubmit={save} noValidate className="mt-4 space-y-4">
        {['English', 'Punjabi'].map((language) => <label key={language} className="block text-sm font-semibold">Label ({language})<input lang={language === 'Punjabi' ? 'pa' : 'en'} value={draft[`label${language}`]} onChange={(event) => setDraft((current) => ({ ...current, [`label${language}`]: event.target.value }))} className={`${inputClass} ${language === 'Punjabi' ? 'font-gurmukhi' : ''}`} /></label>)}
        <label className="block text-sm font-semibold">URL<input value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} placeholder="/donation or https://example.com" className={inputClass} /></label>
        <label className="block text-sm font-semibold">Available at (local time)<input type="datetime-local" step="1" value={localTime} onChange={(event) => setLocalTime(event.target.value)} className={inputClass} /></label>
        <p className="text-xs text-slate-600">Use your device timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Leave blank for immediate availability. During a repeated daylight-saving hour, the earlier occurrence is used.</p>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft((current) => ({ ...current, enabled: event.target.checked }))} />Enabled</label>
        {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2">Cancel</button><button type="submit" className="rounded-lg bg-blue-800 px-4 py-2 font-semibold text-white">Save button</button></div>
      </form>
    </section>
  </div>, document.body);
};

const AdminInaugurationPage = () => {
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => normalizeInaugurationSettings());
  const [status, setStatus] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [buttonDialog, setButtonDialog] = useState(null);
  const dirty = useRef(false);
  const nextId = useRef(0);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: INAUGURATION_QUERY_KEY, queryFn: inaugurationService.getSettings, retry: false });
  useEffect(() => {
    if (data && !dirty.current) setValues(normalizeInaugurationSettings(data));
  }, [data]);
  const mutation = useMutation({
    mutationFn: inaugurationService.saveSettings,
    onSuccess: (saved) => {
      dirty.current = false;
      setValues(normalizeInaugurationSettings(saved));
      queryClient.setQueryData(INAUGURATION_QUERY_KEY, saved);
      setStatus({ type: 'success', message: 'Landing page settings saved.' });
    },
    onError: (error) => setStatus({ type: 'error', message: error?.response?.data?.message || error.message || 'Unable to save landing page settings.' })
  });
  const patch = (key, value) => {
    dirty.current = true;
    setStatus(null);
    setValues((current) => ({ ...current, [key]: value }));
  };
  const uploadLogo = async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setStatus(null);
    try {
      const result = await uploadService.uploadFile({ service: 'cms', file,
        allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], maxSizeMB: 5, onProgress: setProgress });
      if (!result?.url) throw new Error('Upload did not return a logo URL.');
      patch('logoUrl', result.url);
      setStatus({ type: 'success', message: 'Logo uploaded to the draft. Save to publish this change.' });
    } catch (error) {
      setStatus({ type: 'error', message: error?.response?.data?.message || error.message || 'Logo upload failed.' });
    } finally { setUploading(false); input.value = ''; }
  };
  const submit = (event) => {
    event.preventDefault();
    const error = validateInaugurationSettings(values);
    if (error) { setStatus({ type: 'error', message: error }); return; }
    mutation.mutate(values);
  };
  const locked = isLoading || isError || !data || mutation.isPending || uploading;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-center justify-end gap-4">
      <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
        <span id="landing-homepage-switch-label">Use landing page as homepage</span>
        <button type="button" role="switch" aria-labelledby="landing-homepage-switch-label" aria-describedby="landing-homepage-switch-help" aria-checked={values.enabled} disabled={locked} onClick={() => patch('enabled', !values.enabled)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50 ${values.enabled ? 'bg-emerald-600' : 'bg-slate-400'}`}>
          <span aria-hidden="true" className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${values.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
        <span aria-hidden="true">{values.enabled ? 'On' : 'Off'}</span>
      </div>
      <a href="/inauguration-preview" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">Open saved landing page preview</a>
    </header>
    {status ? <p role={status.type === 'error' ? 'alert' : 'status'} className={`rounded-lg p-3 ${status.type === 'error' ? 'bg-rose-50 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>{status.message}</p> : null}
    {isLoading ? <p role="status">Loading landing page settings…</p> : null}
    {isError ? <p role="alert">Unable to load saved settings. <button type="button" onClick={() => refetch()} className="underline">Retry loading</button></p> : null}
    <form onSubmit={submit} noValidate>
      <fieldset disabled={locked} className="space-y-5 disabled:opacity-60">
        <section className={sectionClass}>
          <div className="admin-card-header-row border-b border-slate-200 pb-3"><h2 style={headingStyle} className="text-lg font-semibold">Homepage and appearance</h2></div>
          <p id="landing-homepage-switch-help" className="text-sm text-slate-600">When enabled and saved, visitors see this landing page at the homepage. On day two, turn it off and save to restore the current homepage. Your landing page settings remain available. This switch is manual.</p>
          <div className="grid gap-4 sm:grid-cols-3">{[['backgroundColor', 'Background color'], ['textColor', 'Text color'], ['accentColor', 'Accent color']].map(([key, label]) =>
            <div key={key}><label className="block text-sm font-semibold">{label}<input aria-label={label} type="color" value={/^#[\da-f]{6}$/i.test(values[key]) ? values[key] : DEFAULT_INAUGURATION_SETTINGS[key]} onChange={(event) => patch(key, event.target.value)} className="mt-2 block h-10 w-full rounded border border-slate-300" /></label><label className="mt-2 block text-xs font-semibold">{label} hex<input value={values[key]} onChange={(event) => patch(key, event.target.value)} maxLength={7} placeholder="#123456" className={inputClass} /></label></div>)}
          </div>
          <label className="block text-sm font-semibold">Logo URL<input value={values.logoUrl} onChange={(event) => patch('logoUrl', event.target.value)} placeholder="Leave blank to use the Gurdwara branding logo" className={inputClass} /></label>
          <label className="block text-sm font-semibold">Upload logo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={uploadLogo} className="mt-2 block text-sm" /></label>
          <p className="text-xs text-slate-600">{uploading ? `Uploading logo… ${progress}%` : 'PNG, JPEG, WebP or GIF, maximum 5 MB. Uploading does not publish settings.'}</p>
          <label className="block text-sm font-semibold">Logo size: {values.logoSize} px<input type="range" min="80" max="320" step="1" value={values.logoSize} onChange={(event) => patch('logoSize', Number(event.target.value))} className="mt-2 block w-full" /></label>
        </section>
        <section className={sectionClass}>
          <div className="admin-card-header-row border-b border-slate-200 pb-3"><h2 style={headingStyle} className="text-lg font-semibold">Bilingual welcome</h2></div>
          <div className="grid gap-4 md:grid-cols-2">{[['English', 'en'], ['Punjabi', 'pa']].map(([language, lang]) => <div key={lang} className="space-y-4">
            <label className="block text-sm font-semibold">Heading ({language})<input lang={lang} value={values[`heading${language}`]} onChange={(event) => patch(`heading${language}`, event.target.value)} className={`${inputClass} ${lang === 'pa' ? 'font-gurmukhi' : ''}`} /></label>
            <label className="block text-sm font-semibold">Message ({language})<textarea lang={lang} rows={6} value={values[`message${language}`]} onChange={(event) => patch(`message${language}`, event.target.value)} className={`${inputClass} ${lang === 'pa' ? 'font-gurmukhi' : ''}`} /></label>
          </div>)}</div>
          <p className="text-xs text-slate-600">Messages preserve line breaks. Headings are centered; messages appear side by side on larger screens.</p>
        </section>
        <section className={sectionClass}>
          <div className="admin-card-header-row flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3"><h2 style={headingStyle} className="text-lg font-semibold">Button links ({values.buttons.length}/12)</h2>
            <button type="button" disabled={values.buttons.length >= MAX_INAUGURATION_BUTTONS} onClick={() => {
              nextId.current += 1;
              setButtonDialog({ index: null, button: { id: `inauguration-${Date.now()}-${nextId.current}`, labelEnglish: '', labelPunjabi: '', url: '', enabled: true, availableAt: '' } });
            }} className="rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50">Add button</button>
          </div>
          <p className="text-sm text-slate-600">Schedules use your device timezone ({timezone}). They are saved as ISO instants and displayed to visitors in Toronto time. During a repeated daylight-saving hour, the earlier occurrence is used. Leave the schedule blank for immediate availability.</p>
          <div className="overflow-x-auto"><table aria-label="Button links" className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>{['Button labels', 'URL', 'Enabled status', 'Available at (local time)', 'Actions'].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
            <tbody>{values.buttons.map((button, index) => <tr key={button.id} className="border-b border-slate-200">
              <td className="p-3"><span lang="en" className="block font-semibold">{button.labelEnglish || '—'}</span><span lang="pa" className="mt-1 block font-gurmukhi">{button.labelPunjabi || '—'}</span></td>
              <td className="max-w-xs break-all p-3">{button.url}</td><td className="p-3">{button.enabled ? 'Enabled' : 'Disabled'}</td>
              <td className="whitespace-nowrap p-3">{button.availableAt ? toInaugurationLocalDateTime(button.availableAt).replace('T', ' ') || 'Invalid schedule' : 'Immediate'}</td>
              <td className="p-3"><div className="flex gap-2"><button type="button" aria-label={`Edit button ${index + 1}`} onClick={() => setButtonDialog({ index, button })} className="rounded-lg border border-slate-300 px-3 py-2">Edit</button><button type="button" data-delete-guard-ignore="true" aria-label={`Delete button ${index + 1}`} onClick={() => patch('buttons', values.buttons.filter((_, position) => position !== index))} className="rounded-lg border border-rose-200 px-3 py-2 text-rose-700">Delete</button></div></td>
            </tr>)}</tbody>
          </table>{!values.buttons.length ? <p className="p-3 text-sm text-slate-600">No button links yet. Add a button to get started.</p> : null}</div>
        </section>
        <div className="flex justify-end"><button type="submit" className="rounded-xl bg-blue-800 px-6 py-3 font-semibold text-white disabled:opacity-50" disabled={locked}>{mutation.isPending ? 'Saving…' : 'Save landing page settings'}</button></div>
      </fieldset>
    </form>
    <section aria-label="Live draft" className="space-y-3">
      <h2 className="text-lg font-bold text-slate-900">Landing page draft preview</h2>
      <p className="text-sm text-slate-600">This embedded preview uses unsaved values, even when the homepage toggle is off. It does not change the live site.</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200"><InaugurationPage settings={values || DEFAULT_INAUGURATION_SETTINGS} /></div>
    </section>
    {buttonDialog ? <ButtonDialog button={buttonDialog.button} editing={buttonDialog.index !== null} onClose={() => setButtonDialog(null)} onSave={(button) => {
      patch('buttons', buttonDialog.index === null ? [...values.buttons, button] : values.buttons.map((current, index) => index === buttonDialog.index ? button : current));
      setButtonDialog(null);
    }} /> : null}
  </div>;
};

export default AdminInaugurationPage;
