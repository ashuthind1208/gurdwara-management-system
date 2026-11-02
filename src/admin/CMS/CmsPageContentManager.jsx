import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import RichTextEditor from '../../components/forms/RichTextEditor';
import PhoneInput from '../../components/forms/PhoneInput';
import cmsService, { normalizeCmsPagePath } from '../../services/cmsService';
import uploadService from '../../services/uploadService';
import siteNavigationService from '../../services/siteNavigationService';
import { isTenDigitPhone, TEN_DIGIT_PHONE_ERROR } from '../../utils/phone';

const emptyPage = () => ({ heroTitle: '', heroDescription: '', intro: '', mediaUrl: '', phone: '', email: '', address: '', contactHours: [], socialLinks: { facebook: '', instagram: '' }, sections: [] });
const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 p-2.5';
const titleFor = (key, page) => page.heroTitle || key.replace(/-/g, ' ');
let openDialogCount = 0;
let savedBodyOverflow = '';

const CmsDialog = ({ title, children, onClose, nested = false, busy = false }) => {
  const ref = useRef(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };
  useEffect(() => {
    const previousFocus = document.activeElement;
    if (openDialogCount === 0) savedBodyOverflow = document.body.style.overflow;
    openDialogCount += 1;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (event) => {
      const dialogs = document.querySelectorAll('[data-cms-dialog]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === 'Escape' && !latest.current.busy) { event.stopPropagation(); latest.current.onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...ref.current.querySelectorAll('button, input, textarea, select, a[href], [contenteditable="true"]')].filter((node) => !node.disabled);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openDialogCount -= 1;
      if (openDialogCount === 0) document.body.style.overflow = savedBodyOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<div className={`fixed inset-0 overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm ${nested ? 'z-[140]' : 'z-[130]'}`}>
    <div className="flex min-h-full items-center justify-center">
      <div ref={ref} data-cms-dialog role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl outline-none">
        <div className="mb-5 flex items-center justify-between gap-3"><h3 className="font-heading text-xl font-semibold">{title}</h3><button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  </div>, document.body);
};

const MediaPreview = ({ url, title }) => !url ? null : /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(url)
  ? <img src={url} alt={title || 'Media preview'} className="mt-3 max-h-48 rounded-lg object-contain" />
  : <a href={url} target="_blank" rel="noreferrer" className="mt-3 block text-brand-blue underline">Open media</a>;

const MediaField = ({ label, value, onChange, onBusy }) => {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const upload = async (file) => {
    if (!file) return;
    setProgress(0); setError(''); onBusy(true);
    try {
      const result = await uploadService.uploadFile({ service: 'cms', file, allowedMimeTypes: ['image/*', 'video/*', 'application/pdf'], maxSizeMB: 15, onProgress: setProgress });
      if (!result?.url) throw new Error('Upload did not return a file URL.');
      onChange(result.url);
    } catch (err) { setError(err.message || 'Unable to upload file.'); }
    finally { setProgress(null); onBusy(false); }
  };
  return <div><label className="text-sm">{label}<input value={value || ''} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>
    <input aria-label={`Upload ${label}`} type="file" accept="image/*,video/*,application/pdf" disabled={progress !== null} className="mt-2 block text-xs" onChange={(event) => upload(event.target.files?.[0])} />
    <p className="mt-1 text-xs text-slate-500">{progress !== null ? `Uploading media… ${progress}%` : 'Image, video or PDF; max 15MB.'}</p>
    {progress !== null ? <progress aria-label="Media upload progress" value={progress} max="100" className="w-full" /> : null}
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}<MediaPreview url={value} />
  </div>;
};

const PageEditor = ({ mode, pageKey, initial, onSave, onClose, pending, error, lockPath = false }) => {
  const [path, setPath] = useState(pageKey || '');
  const [draft, setDraft] = useState(() => ({ ...emptyPage(), ...initial }));
  const [sectionModal, setSectionModal] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sectionUploading, setSectionUploading] = useState(false);
  const [validation, setValidation] = useState('');
  const setField = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const editable = mode !== 'view';
  const submit = (event) => {
    event.preventDefault();
    try {
      const key = normalizeCmsPagePath(path);
      if (draft.phone && !isTenDigitPhone(draft.phone)) throw new Error(TEN_DIGIT_PHONE_ERROR);
      setValidation(''); onSave(key, draft);
    } catch (err) { setValidation(err.message); }
  };
  const closeSection = () => setSectionModal(null);
  return <CmsDialog title={mode === 'add' ? 'Add Page Content' : mode === 'edit' ? 'Edit Page Content' : 'View Page Content'} onClose={onClose} busy={pending || uploading || sectionUploading}>
    {editable ? <form onSubmit={submit} className="space-y-5">
      {error || validation ? <p role="alert" className="text-sm text-red-700">{error || validation}</p> : null}
      <label className="block text-sm">Page path<input required value={path} disabled={mode !== 'add' || lockPath} placeholder="/panjpyaare" onChange={(event) => setPath(event.target.value)} className={inputClass} /></label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm">Hero Title<input value={draft.heroTitle || ''} onChange={(event) => setField('heroTitle', event.target.value)} className={inputClass} /></label>
        <MediaField label="Media Link" value={draft.mediaUrl} onChange={(value) => setField('mediaUrl', value)} onBusy={setUploading} />
        <label className="text-sm md:col-span-2">Hero Description<textarea rows={2} value={draft.heroDescription || ''} onChange={(event) => setField('heroDescription', event.target.value)} className={inputClass} /></label>
        <div className="md:col-span-2"><p className="mb-1 text-sm">Intro Text</p><RichTextEditor value={draft.intro} onChange={(value) => setField('intro', value)} minHeight={120} /></div>
      </div>
      <fieldset className="space-y-3 rounded-xl border p-4"><legend className="px-1 text-sm font-semibold">Contact details</legend>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Phone<PhoneInput value={draft.phone || ''} onChange={(event) => setField('phone', event.target.value)} className={inputClass} /></label>
          <label className="text-sm">Email<input type="email" value={draft.email || ''} onChange={(event) => setField('email', event.target.value)} className={inputClass} /></label>
          <label className="text-sm md:col-span-2">Address<input value={draft.address || ''} onChange={(event) => setField('address', event.target.value)} className={inputClass} /></label>
          {['facebook', 'instagram'].map((social) => <label key={social} className="text-sm">{social === 'facebook' ? 'Facebook URL' : 'Instagram URL'}<input type="url" value={draft.socialLinks?.[social] || ''} onChange={(event) => setField('socialLinks', { ...draft.socialLinks, [social]: event.target.value })} className={inputClass} /></label>)}
        </div>
        <h4 className="text-sm font-semibold">Hours &amp; Channels</h4>
        {(draft.contactHours || []).map((hour, index) => <div key={index} className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          {['label', 'value'].map((field) => <label key={field} className="text-xs">{field === 'label' ? 'Channel name' : 'Hours or availability'}<input value={hour[field]} onChange={(event) => setField('contactHours', draft.contactHours.map((entry, i) => i === index ? { ...entry, [field]: event.target.value } : entry))} className={inputClass} /></label>)}
          <button type="button" aria-label={`Remove channel ${index + 1}`} onClick={() => setField('contactHours', draft.contactHours.filter((_, i) => i !== index))}>Remove</button>
        </div>)}
        <button type="button" className="text-sm font-semibold text-brand-blue" onClick={() => setField('contactHours', [...(draft.contactHours || []), { label: '', value: '' }])}>Add Channel</button>
      </fieldset>
      <div className="rounded-xl border p-4">
        <div className="flex items-center justify-between"><h4 className="font-semibold">Sections</h4><button type="button" className="rounded-lg bg-brand-saffron px-3 py-2 text-sm" disabled={pending || uploading} onClick={() => setSectionModal({ mode: 'add', draft: { id: `section-${Date.now()}`, title: '', body: '', mediaUrl: '' } })}>Add Section</button></div>
        <p className="mt-2 text-xs text-slate-500">Section changes are published with Save Page Details.</p>
        <ul className="mt-3 divide-y">{(draft.sections || []).map((section) => <li key={section.id} className="flex items-center justify-between gap-3 py-3"><span>{section.title || 'Untitled section'}</span><div className="flex gap-2">
          {[[EyeIcon, 'view', 'View'], [PencilSquareIcon, 'edit', 'Edit'], [TrashIcon, 'delete', 'Delete']].map(([Icon, action, label]) => <button key={action} type="button" aria-label={`${label} section ${section.title || 'Untitled section'}`} title={label} disabled={pending || uploading} className="rounded-lg border p-2" onClick={() => setSectionModal({ mode: action, draft: { ...section } })}><Icon className="h-4 w-4" /></button>)}
        </div></li>)}</ul>
      </div>
      <div className="flex gap-3"><Button type="submit" disabled={pending || uploading || sectionUploading}>{pending ? 'Saving…' : mode === 'add' ? 'Create Page' : 'Save Page Details'}</Button><button type="button" disabled={pending || uploading || sectionUploading} onClick={onClose}>Cancel</button></div>
    </form> : <div className="space-y-5">
      <p className="text-sm text-slate-500">/{pageKey}</p><h4 className="text-2xl font-semibold">{draft.heroTitle || 'Untitled page'}</h4><p>{draft.heroDescription}</p>
      <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: draft.intro || '' }} /><MediaPreview url={draft.mediaUrl} title={draft.heroTitle} />
      <h4 className="font-semibold">Sections</h4>{(draft.sections || []).map((section) => <section key={section.id} className="rounded-xl border p-4"><h5 className="text-lg font-semibold">{section.title}</h5><div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: section.body || '' }} /><MediaPreview url={section.mediaUrl} title={section.title} /></section>)}
      <p>{draft.phone} {draft.email}</p><p>{draft.address}</p>{(draft.contactHours || []).map((hour, i) => <p key={i}>{hour.label}: {hour.value}</p>)}
      {Object.entries(draft.socialLinks || {}).map(([name, url]) => url ? <p key={name}>{name}: {url}</p> : null)}
    </div>}
    {sectionModal ? <CmsDialog nested title={`${sectionModal.mode === 'delete' ? 'Delete' : sectionModal.mode === 'view' ? 'View' : sectionModal.mode === 'edit' ? 'Edit' : 'Add'} Section`} onClose={closeSection} busy={sectionUploading || pending}>
      {sectionModal.mode === 'delete' ? <><p>Delete section “{sectionModal.draft.title || 'Untitled section'}”? This is published immediately.</p><div className="mt-5 flex gap-3"><Button type="button" disabled={pending} onClick={() => {
        const next = { ...draft, sections: draft.sections.filter((section) => section.id !== sectionModal.draft.id) };
        try {
          const key = normalizeCmsPagePath(path);
          setDraft(next); closeSection(); onSave(key, next, { closeAfterSave: true });
        } catch (err) { setValidation(err.message); closeSection(); }
      }}>Confirm Delete Section</Button><button type="button" disabled={pending} onClick={closeSection}>Cancel</button></div></>
        : sectionModal.mode === 'view' ? <><h4>{sectionModal.draft.title}</h4><div dangerouslySetInnerHTML={{ __html: sectionModal.draft.body || '' }} /><MediaPreview url={sectionModal.draft.mediaUrl} /></>
          : <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            setField('sections', sectionModal.mode === 'add' ? [...draft.sections, sectionModal.draft] : draft.sections.map((section) => section.id === sectionModal.draft.id ? sectionModal.draft : section));
            closeSection();
          }}>
            <label className="block text-sm">Section Title<input value={sectionModal.draft.title} onChange={(event) => setSectionModal({ ...sectionModal, draft: { ...sectionModal.draft, title: event.target.value } })} className={inputClass} /></label>
            <MediaField label="Section Media Link" value={sectionModal.draft.mediaUrl} onChange={(value) => setSectionModal((current) => ({ ...current, draft: { ...current.draft, mediaUrl: value } }))} onBusy={setSectionUploading} />
            <p className="text-sm">Section Body</p><RichTextEditor value={sectionModal.draft.body} onChange={(value) => setSectionModal((current) => ({ ...current, draft: { ...current.draft, body: value } }))} minHeight={180} />
            <Button type="submit" disabled={sectionUploading}>Save Section</Button>
          </form>}
    </CmsDialog> : null}
  </CmsDialog>;
};

const CmsPageContentManager = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [message, setMessage] = useState('');
  const { data: pages = {}, isLoading, isError, refetch } = useQuery({ queryKey: ['cms-pages-admin'], queryFn: () => cmsService.readAllPageContent().then((res) => res.data) });
  const { data: navigationItems = [] } = useQuery({ queryKey: ['site-navigation'], queryFn: siteNavigationService.get });
  const navigationRows = navigationItems.flatMap((item) => [item, ...(item.children || [])]).flatMap((item) => {
    if (!String(item.path || '').startsWith('/')) return [];
    try {
      const key = normalizeCmsPagePath(item.path.split(/[?#]/)[0]);
      return pages[key] && !pages[key].deleted ? [] : [[key, { ...emptyPage(), heroTitle: item.label, unpublished: true }]];
    } catch { return []; }
  });
  const rows = [...Object.entries(pages).filter(([, content]) => !content.deleted), ...navigationRows.filter(([key], index, all) => all.findIndex(([other]) => other === key) === index)];
  const totalPages = Math.max(1, Math.ceil(rows.length / 10));
  const currentPage = Math.min(page, totalPages);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const close = () => { setModal(null); mutation.reset(); };
  const mutation = useMutation({
    mutationFn: ({ action, key, values }) => action === 'delete' ? cmsService.deletePageContent(key) : action === 'add' ? cmsService.createPageContent(key, values) : cmsService.updatePageContent(key, values),
    onSuccess: async (_, variables) => {
      await Promise.all(['cms-pages-admin', 'cms-pages-public', 'page-content', 'page-content-admin'].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      setMessage(variables.action === 'delete' ? 'Page content deleted. Navigation links are unchanged.' : variables.sectionDeleted ? 'Section deleted.' : 'Page content saved.');
      setModal(null);
    }
  });
  const open = (mode, key, content, lockPath = false) => { mutation.reset(); setMessage(''); setModal({ mode, key, content, lockPath }); };
  return <Card>
    <div className="flex items-center justify-between gap-3"><h2 className="font-heading text-xl font-semibold">Page Content</h2><Button type="button" variant="secondary" disabled={isLoading || isError} onClick={() => open('add')}>Add Page Content</Button></div>
    {message ? <p role="status" className="mt-3 text-sm text-green-700">{message}</p> : null}
    {isLoading ? <p role="status" className="mt-4">Loading page content…</p> : isError ? <div role="alert" className="mt-4 text-red-700">Unable to load page content. <button type="button" onClick={() => refetch()}>Retry</button></div> : <>
      <div className="mt-4 overflow-x-auto"><table aria-label="Page Content" className="min-w-full divide-y divide-slate-200 text-sm"><thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Title</th><th className="px-3 py-3">Path</th><th className="px-3 py-3">Status</th><th className="px-3 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.slice((currentPage - 1) * 10, currentPage * 10).map(([key, content]) => <tr key={key}><td className="px-3 py-3 font-medium">{titleFor(key, content)}</td><td className="px-3 py-3 text-slate-500">/{key}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${content.unpublished ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{content.unpublished ? 'Needs content' : 'Published'}</span></td><td className="px-3 py-3"><div className="flex justify-end gap-2">
          {(content.unpublished ? [[PencilSquareIcon, 'edit', 'Add content to']] : [[EyeIcon, 'view', 'View'], [PencilSquareIcon, 'edit', 'Edit'], [TrashIcon, 'delete', 'Delete']]).map(([Icon, action, label]) => <button key={action} type="button" title={label} aria-label={`${label} page ${titleFor(key, content)}`} className={`rounded-lg border p-2 ${action === 'delete' ? 'border-red-200 text-red-700' : 'border-slate-300 text-slate-700'}`} onClick={() => content.unpublished ? open('add', key, content, true) : open(action, key, content)}><Icon className="h-4 w-4" /></button>)}
        </div></td></tr>)}{!rows.length ? <tr><td colSpan={4} className="p-4 text-center text-slate-500">No page content.</td></tr> : null}</tbody></table></div>
      <nav aria-label="Page content pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><span>{rows.length ? `Showing ${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, rows.length)} of ${rows.length}` : '0 pages'}</span><div className="flex items-center gap-3"><button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button><span>Page {currentPage} of {totalPages}</span><button type="button" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button></div></nav>
    </>}
    {modal?.mode === 'delete' ? <CmsDialog title="Delete Page Content" onClose={close} busy={mutation.isPending}><p>Delete page content for “{titleFor(modal.key, modal.content)}” (/{modal.key})? This removes its published CMS content, not its navigation link or built-in application page.</p>{mutation.isError ? <p role="alert" className="mt-3 text-red-700">{mutation.error?.message || 'Unable to delete page content.'}</p> : null}<div className="mt-5 flex gap-3"><Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: 'delete', key: modal.key })}>{mutation.isPending ? 'Deleting…' : 'Confirm Delete'}</Button><button type="button" disabled={mutation.isPending} onClick={close}>Cancel</button></div></CmsDialog>
      : modal ? <PageEditor mode={modal.mode} lockPath={modal.lockPath} pageKey={modal.key} initial={modal.content} onClose={close} pending={mutation.isPending} error={mutation.isError ? mutation.error?.message || 'Unable to save page content.' : ''} onSave={(key, { unpublished, ...values }, options = {}) => mutation.mutate({ action: modal.mode, key, values, sectionDeleted: options.closeAfterSave })} /> : null}
  </Card>;
};

export default CmsPageContentManager;