import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import StatusAlert from '../../components/common/StatusAlert';
import LedAnnouncementSlide from '../../components/boards/LedAnnouncementSlide';
import LedBoardControlCard from './LedBoardControlCard';
import LedScreenOperationsCard from './LedScreenOperationsCard';
import ledAnnouncementService, { isAnnouncementLive, toLocalDateKey } from '../../services/ledAnnouncementService';
import { getLedScreens } from '../../constants/ledBoards';
import ledBoardSettingsService from '../../services/ledBoardSettingsService';
import uploadService from '../../services/uploadService';

const PAGE_SIZE = 10;
const emptyFormValues = {
  type: 'image',
  title: '',
  subtitle: '',
  details: '',
  imageUrl: '',
  eventDate: '',
  location: '',
  displayUntil: '',
  startsAt: '',
  endsAt: '',
  weekdays: [],
  screenIds: [],
  active: true
};

const formatDate = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: '2-digit' });
};

const formatDateKey = (value) => (value ? formatDate(`${value}T12:00:00`) : '-');

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm disabled:bg-slate-50';

const AdminLedAnnouncementsPage = () => {
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState({ open: false, mode: 'create', announcementId: null });
  const [uploadProgress, setUploadProgress] = useState(null);
  const [status, setStatus] = useState({ type: 'success', message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const form = useForm({ defaultValues: emptyFormValues });

  const { data: announcements = [] } = useQuery({
    queryKey: ['led-board-announcements'],
    queryFn: () => ledAnnouncementService.getAnnouncements().then((response) => response.data)
  });

  const { data: ledSettings } = useQuery({
    queryKey: ['led-board-settings'],
    queryFn: () => ledBoardSettingsService.getSettings().then((response) => response.data)
  });

  const selectedAnnouncement = useMemo(
    () => announcements.find((entry) => entry.id === modalState.announcementId) || null,
    [announcements, modalState.announcementId]
  );

  const filteredAnnouncements = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return announcements.filter((entry) => {
      if (statusFilter === 'active' && !entry.active) return false;
      if (statusFilter === 'inactive' && entry.active) return false;
      if (!query) return true;
      return [entry.title, entry.subtitle, entry.location, entry.type].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [announcements, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAnnouncements.length / PAGE_SIZE));
  const visibleAnnouncements = useMemo(
    () => filteredAnnouncements.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredAnnouncements, page]
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['led-board-announcements'] });

  const closeModal = () => {
    setModalState({ open: false, mode: 'create', announcementId: null });
    form.reset(emptyFormValues);
    setUploadProgress(null);
    setStatus({ type: 'success', message: '' });
  };

  const createMutation = useMutation({ mutationFn: (values) => ledAnnouncementService.createAnnouncement(values), onSuccess: () => { invalidate(); closeModal(); } });
  const updateMutation = useMutation({ mutationFn: ({ id, values }) => ledAnnouncementService.updateAnnouncement(id, values), onSuccess: () => { invalidate(); closeModal(); } });
  const deleteMutation = useMutation({ mutationFn: (id) => ledAnnouncementService.removeAnnouncement(id), onSuccess: invalidate });
  const toggleMutation = useMutation({ mutationFn: ({ id, active }) => ledAnnouncementService.updateAnnouncement(id, { active }), onSuccess: invalidate });

  const openModal = (mode, announcement = null) => {
    form.reset(announcement ? {
      type: announcement.type,
      title: announcement.title,
      subtitle: announcement.subtitle,
      details: announcement.details,
      imageUrl: announcement.imageUrl,
      eventDate: announcement.eventDate,
      location: announcement.location,
      displayUntil: announcement.displayUntil,
      startsAt: announcement.startsAt,
      endsAt: announcement.endsAt,
      weekdays: announcement.weekdays,
      screenIds: announcement.screenIds,
      active: announcement.active
    } : emptyFormValues);
    setStatus({ type: 'success', message: '' });
    setModalState({ open: true, mode, announcementId: announcement?.id || null });
  };

  const onSubmit = (values) => {
    const isImage = values.type === 'image';
    if (values.startsAt && values.endsAt && new Date(values.endsAt).getTime() <= new Date(values.startsAt).getTime()) {
      setStatus({ type: 'error', message: 'The schedule end must be later than the start.' });
      return;
    }
    if (isImage && !String(values.imageUrl || '').trim()) {
      setStatus({ type: 'error', message: 'Upload an image or paste an image URL for an image announcement.' });
      return;
    }
    const payload = {
      type: values.type,
      title: String(values.title || '').trim(),
      subtitle: isImage ? '' : String(values.subtitle || '').trim(),
      details: isImage ? '' : String(values.details || '').trim(),
      imageUrl: isImage ? String(values.imageUrl || '').trim() : '',
      eventDate: values.eventDate || '',
      location: String(values.location || '').trim(),
      displayUntil: values.displayUntil || '',
      startsAt: values.startsAt || '',
      endsAt: values.endsAt || '',
      weekdays: (values.weekdays || []).map(Number),
      screenIds: values.screenIds || [],
      active: Boolean(values.active)
    };
    if (modalState.mode === 'create') createMutation.mutate(payload);
    else if (selectedAnnouncement) updateMutation.mutate({ id: selectedAnnouncement.id, values: payload });
  };

  const uploadImage = async (file) => {
    if (!file) return;
    try {
      setUploadProgress(0);
      const uploaded = await uploadService.uploadFile({ service: 'ledboard', file, allowedMimeTypes: ['image/*'], maxSizeMB: 15, onProgress: setUploadProgress });
      if (!uploaded?.url) throw new Error('Upload did not return a file URL.');
      form.setValue('imageUrl', uploaded.url, { shouldDirty: true });
      setStatus({ type: 'success', message: 'Image uploaded successfully.' });
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'Unable to upload image.' });
    } finally {
      setUploadProgress(null);
    }
  };

  const watched = form.watch();
  const isViewMode = modalState.mode === 'view';
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const today = toLocalDateKey();

  useEffect(() => { setPage(1); }, [searchTerm, statusFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  return (
    <div className="admin-led-announcements w-full min-w-0 max-w-full space-y-6 overflow-x-clip">
      <h1 className="sr-only">LED Announcements</h1>

      <LedBoardControlCard />
      <LedScreenOperationsCard />

      <Card className="w-full min-w-0 max-w-full">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold">LED Announcements</h2>
            <p className="mt-1 text-sm text-slate-600">Special event photos and formatted notices for the Special Events LED board. Only Active announcements appear on screen.</p>
          </div>
          <Button type="button" onClick={() => openModal('create')}>Add Announcement</Button>
        </div>

        <div className="mt-4 grid min-w-0 gap-2 md:grid-cols-3">
          <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">Search
            <input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search title, subtitle, or location" className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20" />
          </label>
          <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20">
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-0 divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Announcement</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Type</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Event Date</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Display Until</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Added</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Updated</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Show on LED</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleAnnouncements.map((entry) => {
                const expired = entry.active && !isAnnouncementLive(entry, today) && entry.displayUntil && entry.displayUntil < today;
                return (
                  <tr key={entry.id}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        {entry.type === 'image' && entry.imageUrl
                          ? <img src={entry.imageUrl} alt="" className="h-10 w-16 shrink-0 rounded border border-slate-200 object-cover" />
                          : <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded bg-[#0b2a5b] font-heading text-lg font-bold text-amber-200" aria-hidden="true">Aa</span>}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{entry.title || 'Untitled announcement'}</p>
                          {entry.subtitle ? <p className="truncate text-xs text-slate-500">{entry.subtitle}</p> : null}
                          <div className="mt-1 flex flex-wrap gap-1.5 lg:hidden">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}>{entry.active ? 'Active' : 'Inactive'}</span>
                            <span className="text-[11px] text-slate-500">{entry.type === 'image' ? 'Image' : 'Text'} · {formatDateKey(entry.eventDate)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="admin-compact-mobile-hidden px-3 py-2">{entry.type === 'image' ? 'Image' : 'Text'}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2">{formatDateKey(entry.eventDate)}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2">{formatDateKey(entry.displayUntil)}{expired ? <span className="ml-1 text-[11px] font-semibold text-amber-700">(expired)</span> : null}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2">{formatDate(entry.createdAt)}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2">{formatDate(entry.updatedAt)}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2">
                      <button type="button" onClick={() => toggleMutation.mutate({ id: entry.id, active: !entry.active })} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`} aria-pressed={entry.active} title={entry.active ? 'Click to hide from the LED board' : 'Click to show on the LED board'}>{entry.active ? 'Active' : 'Inactive'}</button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openModal('view', entry)} className="rounded-md border border-slate-300 p-1.5 text-slate-700" title="View"><EyeIcon className="h-4 w-4" /></button>
                        <button type="button" onClick={() => openModal('edit', entry)} className="rounded-md border border-slate-300 p-1.5 text-slate-700" title="Edit"><PencilSquareIcon className="h-4 w-4" /></button>
                        <button type="button" onClick={() => deleteMutation.mutate(entry.id)} className="rounded-md border border-red-200 p-1.5 text-red-700" title={`Delete ${entry.title || 'announcement'}`}><TrashIcon className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredAnnouncements.length === 0 ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={8}>{announcements.length ? 'No announcements match your filters.' : 'No announcements yet. Use Add Announcement to create the first one.'}</td></tr> : null}
            </tbody>
          </table>
        </div>

        {filteredAnnouncements.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">Showing {visibleAnnouncements.length} of {filteredAnnouncements.length} announcements</p>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Prev</button>
              <span className="text-xs font-semibold text-slate-600">Page {page} of {totalPages}</span>
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        ) : null}
      </Card>

      {modalState.open ? (
        <div className="fixed inset-0 z-[95] overflow-x-hidden overflow-y-auto bg-slate-900/45 px-2 py-4 sm:px-4 sm:py-6">
          <div className="mx-auto flex min-h-full w-full min-w-0 items-center justify-center">
            <div className="w-full min-w-0 max-w-5xl rounded-xl bg-white p-3 shadow-xl sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-xl font-semibold">{modalState.mode === 'create' ? 'Add Announcement' : modalState.mode === 'edit' ? 'Edit Announcement' : 'View Announcement'}</h3>
                <button type="button" onClick={closeModal} className="rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
              </div>

              <form className="mt-4 grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-x-6" onSubmit={form.handleSubmit(onSubmit)}>
                <div className="lg:col-span-2"><StatusAlert type={status.type} message={status.message} /></div>

                <div className="grid content-start gap-3">
                <fieldset disabled={isViewMode} className="grid gap-2">
                  <legend className="text-sm font-semibold text-slate-700">What do you want to show?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[{ value: 'image', label: 'Full-screen image', hint: 'A photo or poster shown at full scale.' }, { value: 'text', label: 'Formatted text', hint: 'Title, sub-title, and details on a branded screen.' }].map((option) => (
                      <label key={option.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm ${watched.type === option.value ? 'border-brand-blue bg-blue-50' : 'border-slate-200'}`}>
                        <input type="radio" value={option.value} {...form.register('type')} className="mt-1" />
                        <span><span className="block font-semibold text-slate-800">{option.label}</span><span className="text-xs text-slate-500">{option.hint}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <label className="text-sm">{watched.type === 'image' ? 'Name (for your reference, not shown on screen)' : 'Title'}
                  <input disabled={isViewMode} {...form.register('title', { required: true })} required maxLength={160} className={inputClass} />
                </label>

                {watched.type === 'image' ? (
                  <div className="text-sm">
                    <label className="block">Image URL
                      <input disabled={isViewMode} {...form.register('imageUrl')} className={inputClass} placeholder="Upload below or paste an image URL" />
                    </label>
                    {!isViewMode ? (
                      <>
                        <input type="file" accept="image/*" className="mt-2 block w-full text-xs" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ''; }} aria-label="Upload image" />
                        <p className="mt-1 text-xs text-slate-500">{uploadProgress !== null ? `Uploading... ${uploadProgress}%` : 'Max 15 MB. A landscape image (16:9, e.g. 1920 x 1080) fills a standard LED screen.'}</p>
                        {uploadProgress !== null ? <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-blue transition-all" style={{ width: `${uploadProgress}%` }} /></div> : null}
                      </>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <label className="text-sm">Sub-title
                      <input disabled={isViewMode} {...form.register('subtitle')} maxLength={200} className={inputClass} />
                    </label>
                    <label className="text-sm">Details
                      <textarea disabled={isViewMode} {...form.register('details')} rows={4} maxLength={800} className={inputClass} placeholder="Timings, program, or any other message. Line breaks are kept." />
                    </label>
                  </>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm">Event Date
                    <input type="date" disabled={isViewMode} {...form.register('eventDate')} className={inputClass} />
                  </label>
                  <label className="text-sm">Display Until
                    <input type="date" disabled={isViewMode} {...form.register('displayUntil')} className={inputClass} />
                    <span className="mt-1 block text-xs text-slate-500">Leave empty to show until switched off.</span>
                  </label>
                  <label className="text-sm sm:col-span-2">Location
                    <input disabled={isViewMode} {...form.register('location')} maxLength={160} className={inputClass} placeholder="e.g. Main Darbar Hall" />
                  </label>
                </div>

                <fieldset disabled={isViewMode} className="rounded-lg border border-slate-200 p-3">
                  <legend className="px-1 text-sm font-semibold text-slate-700">Schedule and screens</legend>
                  <p className="text-xs text-slate-500">Optional local-time window. Choose weekdays to repeat; leave empty to show on any day. An end time before the start will keep this slide hidden.</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Start date and time<input type="datetime-local" {...form.register('startsAt')} className={inputClass} /></label>
                    <label className="text-sm">End date and time<input type="datetime-local" {...form.register('endsAt')} className={inputClass} /></label>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                      <label key={day} className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" value={index} checked={(watched.weekdays || []).map(Number).includes(index)} onChange={(event) => {
                        const selected = (watched.weekdays || []).map(Number);
                        form.setValue('weekdays', event.target.checked ? [...new Set([...selected, index])].sort() : selected.filter((value) => value !== index), { shouldDirty: true });
                      }} />{day}</label>
                    ))}
                  </div>
                  <p className="mt-3 text-xs font-semibold text-slate-600">Show on these screens (none selected means all screens)</p>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                    {getLedScreens(ledSettings).map((screen) => (
                      <label key={screen.id} className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={(watched.screenIds || []).includes(screen.id)} onChange={(event) => {
                        const selected = watched.screenIds || [];
                        form.setValue('screenIds', event.target.checked ? [...new Set([...selected, screen.id])] : selected.filter((value) => value !== screen.id), { shouldDirty: true });
                      }} />{screen.label}</label>
                    ))}
                  </div>
                </fieldset>

                {selectedAnnouncement ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Date Added<input value={formatDate(selectedAnnouncement.createdAt)} disabled className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm" /></label>
                    <label className="text-sm">Last Updated<input value={formatDate(selectedAnnouncement.updatedAt)} disabled className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5 text-sm" /></label>
                  </div>
                ) : null}

                <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="checkbox" disabled={isViewMode} {...form.register('active')} />
                  <span>Active (show on the Special Events LED board)</span>
                </label>
                </div>

                <div className="self-start lg:sticky lg:top-4">
                  <p className="text-sm font-semibold text-slate-700">LED preview</p>
                  <div className="mt-1 aspect-video w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-100">
                    {(watched.type === 'image' ? watched.imageUrl : watched.title)
                      ? <LedAnnouncementSlide announcement={{ ...watched, type: watched.type === 'image' ? 'image' : 'text' }} />
                      : <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-slate-500"><PhotoIcon className="h-8 w-8" />The preview appears here as you fill in the form.</div>}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">This is exactly how the announcement will look on the LED screen.</p>
                </div>

                {!isViewMode ? (
                  <div className="flex gap-2 lg:col-span-2">
                    <Button type="submit" disabled={isSaving || uploadProgress !== null}>{isSaving ? 'Saving...' : 'Save Announcement'}</Button>
                    <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminLedAnnouncementsPage;
