import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import streamingService, { verifyStreamingAvailability, validateStreamingSource } from '../../services/streamingService';
import { siteConfig } from '../../constants/siteConfig';

const emptyForm = {
  title: 'Live Streaming',
  text: 'YouTube live stream for sangat',
  streamUrl: siteConfig.social.youtube,
  active: true
};

const PAGE_SIZE = 10;

const AdminStreamingPage = () => {
  const { setHeaderAction } = useOutletContext();
  const queryClient = useQueryClient();
  const form = useForm({ defaultValues: emptyForm });
  const [modalState, setModalState] = useState({ open: false, mode: 'view', id: '' });
  const [availability, setAvailability] = useState({ loading: false, available: false, checkedAt: '', reason: '' });
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: streamingItems = [] } = useQuery({
    queryKey: ['streaming-config'],
    queryFn: () => streamingService.getStreamingItems().then((res) => res.data)
  });

  const rows = useMemo(() => streamingItems || [], [streamingItems]);
  const isMiltonPrimaryStream = (stream = {}) => {
    const haystack = `${stream?.title || ''} ${stream?.text || ''} ${stream?.streamUrl || ''}`.toLowerCase();
    return haystack.includes('milton') || haystack.includes('singh sabha');
  };
  const currentStreaming = useMemo(() => rows.find((entry) => entry.id === modalState.id) || null, [modalState.id, rows]);
  const filteredRows = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    return rows.filter((row) => {
      const statusOk = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? row.active === true
          : row.active !== true;

      if (!statusOk) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [row?.title, row?.text, row?.streamUrl]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(query);
    });
  }, [rows, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = useMemo(() => {
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page, totalPages]);

  useEffect(() => {
    if (!modalState.open) {
      return;
    }

    const nextValues = modalState.mode === 'add'
      ? emptyForm
      : {
          title: currentStreaming?.title || emptyForm.title,
          text: currentStreaming?.text || emptyForm.text,
          streamUrl: currentStreaming?.streamUrl || '',
          active: Boolean(currentStreaming?.active)
        };

    form.reset(nextValues);

    if (!currentStreaming) {
      setAvailability({ loading: false, available: false, checkedAt: '', reason: '' });
      return;
    }

    setAvailability((current) => ({ ...current, loading: true }));
    verifyStreamingAvailability(currentStreaming).then((result) => {
      setAvailability({
        loading: false,
        available: Boolean(result.available),
        checkedAt: result.checkedAt || '',
        reason: result.reason || ''
      });
    });
  }, [currentStreaming, form, modalState.mode, modalState.open]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  const modalTitle = useMemo(() => {
    if (modalState.mode === 'add') {
      return 'Add Stream';
    }
    if (modalState.mode === 'edit') {
      return 'Edit Stream';
    }
    return 'Stream Details';
  }, [modalState.mode]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['streaming-config'] });

  const saveMutation = useMutation({
    mutationFn: (values) => {
      if (modalState.mode === 'edit' && modalState.id) {
        return streamingService.updateStreaming(modalState.id, values);
      }
      return streamingService.addStreaming(values);
    },
    onSuccess: () => {
      invalidate();
      closeModal();
    }
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => streamingService.setStreamingActive(id, active),
    onSuccess: () => invalidate()
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => streamingService.removeStreaming(id),
    onSuccess: () => invalidate()
  });

  const openModal = (mode, id = '') => setModalState({ open: true, mode, id });
  const closeModal = () => setModalState({ open: false, mode: 'view', id: '' });

  useEffect(() => {
    setHeaderAction(
      <AdminHeaderActionButton label="Add Stream" onClick={() => openModal('add', '')} />
    );

    return () => setHeaderAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderAction]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="sr-only">Streaming</h1>
        <p className="mt-1 text-sm text-slate-600">Manage the live sources used by the header preview and the sangat stream page. Enter only a YouTube channel name or @handle; the current live video is resolved automatically.</p>
      </div>

      <Card>
        <div className="mb-4 grid gap-2 md:grid-cols-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
            Search
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, text, or stream URL"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Text</th>
                <th className="px-3 py-2">Link</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                  <td className="px-3 py-3 text-slate-700">
                    <div className="space-y-1.5 lg:hidden">
                      <p className="text-sm font-bold leading-tight text-slate-800">{row.text || '-'}</p>
                      <p className="text-[12px] leading-snug break-all text-slate-600">{row.streamUrl || 'Not configured'}</p>
                      <p className="text-[12px] leading-snug text-slate-600">{row.active ? 'Active' : 'Inactive'}</p>
                      <button
                        type="button"
                        onClick={() => toggleMutation.mutate({ id: row.id, active: !row.active })}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${row.active ? 'border-emerald-200 bg-emerald-100 text-emerald-700 hover:border-emerald-300' : 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400'}`}
                      >
                        {row.active ? 'Set Inactive' : 'Set Active'}
                      </button>
                      <div className="pt-0.5">
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => openModal('view', row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-brand-blue hover:text-brand-blue" aria-label="View stream">
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => openModal('edit', row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-brand-blue hover:text-brand-blue" aria-label="Edit stream">
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!isMiltonPrimaryStream(row)) {
                                deleteMutation.mutate(row.id);
                              }
                            }}
                            disabled={isMiltonPrimaryStream(row) || deleteMutation.isPending}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={isMiltonPrimaryStream(row) ? 'Milton main stream cannot be deleted' : 'Delete stream'}
                            title={isMiltonPrimaryStream(row) ? 'Milton main stream cannot be deleted' : 'Delete stream'}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                    <span className="hidden lg:inline">{row.text || '-'}</span>
                  </td>
                  <td className="admin-compact-mobile-hidden px-3 py-3 break-all text-xs text-slate-600">{row.streamUrl || 'Not configured'}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-3">
                    <button
                      type="button"
                      onClick={() => toggleMutation.mutate({ id: row.id, active: !row.active })}
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold transition ${row.active ? 'border-emerald-200 bg-emerald-100 text-emerald-700 hover:border-emerald-300' : 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400'}`}
                    >
                      {row.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="admin-compact-mobile-hidden px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => openModal('view', row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-brand-blue hover:text-brand-blue" aria-label="View stream">
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => openModal('edit', row.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-brand-blue hover:text-brand-blue" aria-label="Edit stream">
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isMiltonPrimaryStream(row)) {
                            deleteMutation.mutate(row.id);
                          }
                        }}
                        disabled={isMiltonPrimaryStream(row) || deleteMutation.isPending}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:border-red-500 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={isMiltonPrimaryStream(row) ? 'Milton main stream cannot be deleted' : 'Delete stream'}
                        title={isMiltonPrimaryStream(row) ? 'Milton main stream cannot be deleted' : 'Delete stream'}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>No streaming configuration found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredRows.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <p className="text-xs">Showing {visibleRows.length} of {filteredRows.length} streams</p>
            <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Prev</button>
            <span>Page {Math.min(page, totalPages)} of {totalPages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-300 px-3 py-1.5 font-semibold disabled:opacity-40">Next</button>
            </div>
          </div>
        ) : null}
      </Card>

      {modalState.open ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 px-4 py-6" onClick={closeModal}>
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-blue">Streaming</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{modalTitle}</h2>
              </div>
              <button type="button" onClick={closeModal} className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:border-brand-blue hover:text-brand-blue" aria-label="Close streaming modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            {modalState.mode === 'view' ? (
              <div className="space-y-4 p-5">
                <div className="grid gap-3 md:grid-cols-2 text-sm text-slate-700">
                  <p><span className="font-semibold text-slate-900">Title:</span> {currentStreaming?.title || '-'}</p>
                  <p><span className="font-semibold text-slate-900">Status:</span> {currentStreaming?.active ? 'Active' : 'Inactive'}</p>
                  <p className="md:col-span-2"><span className="font-semibold text-slate-900">Text:</span> {currentStreaming?.text || '-'}</p>
                  <p className="md:col-span-2 break-all"><span className="font-semibold text-slate-900">URL:</span> {currentStreaming?.streamUrl || '-'}</p>
                  <p><span className="font-semibold text-slate-900">Availability:</span> {availability.loading ? 'Checking...' : availability.available ? 'Confirmed' : 'Pending'}</p>
                  {availability.checkedAt ? <p><span className="font-semibold text-slate-900">Last checked:</span> {new Date(availability.checkedAt).toLocaleString()}</p> : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" onClick={() => setModalState({ open: true, mode: 'edit', id: currentStreaming?.id || '' })}>Edit Stream</Button>
                  <Button type="button" variant="ghost" onClick={closeModal}>Close</Button>
                </div>
              </div>
            ) : (
              <form className="grid gap-3 p-5 md:grid-cols-2" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
                <label className="text-sm font-semibold text-slate-700">
                  Title
                  <input {...form.register('title', { required: true })} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Link text
                  <input {...form.register('text', { required: true })} maxLength={48} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                <label className="text-sm font-semibold text-slate-700 md:col-span-2">
                  YouTube channel or custom public player URL
                  <input {...form.register('streamUrl', { required: true, validate: validateStreamingSource })} placeholder="@yourchannel or https://provider.example/live/player" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </label>
                {form.formState.errors.streamUrl ? <p role="alert" className="text-sm text-red-700 md:col-span-2">{form.formState.errors.streamUrl.message || 'Enter a streaming source.'}</p> : null}
                <p className="-mt-1 text-xs text-slate-500 md:col-span-2">YouTube: enter a channel name, @handle, or channel URL to resolve its current live broadcast. Streamlabs/OBS or another broadcaster: enter your destination's public viewing/embed URL (for example YouTube or another hosting provider). The homepage Live button uses this source. Do not enter RTMP ingest URLs, stream keys, or the text-only Streamlabs overlay URL. Custom providers must allow iframe embedding; an external viewing link is also available.</p>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
                  <input type="checkbox" {...form.register('active')} className="h-4 w-4 rounded border-slate-300" />
                  Active stream
                </label>
                <div className="flex flex-wrap gap-2 md:col-span-2">
                  <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : 'Save Stream'}</Button>
                  <Button type="button" variant="ghost" onClick={closeModal}>Cancel</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminStreamingPage;