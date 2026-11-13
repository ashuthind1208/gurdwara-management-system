import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import sponsorService from '../../services/sponsorService';
import uploadService from '../../services/uploadService';
import StatusAlert from '../../components/common/StatusAlert';

const emptyFormValues = {
  title: '',
  bannerUrl: '',
  expiryDate: '',
  active: true
};
const SPONSORS_PAGE_SIZE = 10;

const formatDate = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: '2-digit' });
};

const toInputDate = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const AdminSponsorsPage = () => {
  const { setHeaderAction } = useOutletContext();
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState({ open: false, mode: 'create', sponsorId: null });
  const form = useForm({ defaultValues: emptyFormValues });
  const [uploadingField, setUploadingField] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ bannerUrl: 0 });
  const [uploadStatus, setUploadStatus] = useState({ type: 'success', message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const { data: sponsors = [] } = useQuery({
    queryKey: ['sponsors'],
    queryFn: () => sponsorService.getSponsors().then((res) => res.data)
  });

  const selectedSponsor = useMemo(
    () => sponsors.find((entry) => String(entry.id) === String(modalState.sponsorId)) || null,
    [modalState.sponsorId, sponsors]
  );

  const filteredSponsors = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    return sponsors.filter((sponsor) => {
      const statusOk = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? sponsor.active === true
          : sponsor.active !== true;

      if (!statusOk) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [sponsor?.title, sponsor?.bannerUrl, sponsor?.createdAt, sponsor?.expiryDate]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [searchTerm, sponsors, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSponsors.length / SPONSORS_PAGE_SIZE));
  const visibleSponsors = useMemo(() => {
    const start = (page - 1) * SPONSORS_PAGE_SIZE;
    return filteredSponsors.slice(start, start + SPONSORS_PAGE_SIZE);
  }, [filteredSponsors, page]);

  const createMutation = useMutation({
    mutationFn: (values) => sponsorService.createSponsor(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
      closeModal();
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }) => sponsorService.updateSponsor(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
      closeModal();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => sponsorService.removeSponsor(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => sponsorService.updateSponsor(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsors'] });
    }
  });

  const closeModal = () => {
    setModalState({ open: false, mode: 'create', sponsorId: null });
    form.reset(emptyFormValues);
    setUploadStatus({ type: 'success', message: '' });
    setUploadingField('');
    setUploadProgress({ bannerUrl: 0 });
  };

  const openModal = (mode, sponsor = null) => {
    if (!sponsor) {
      form.reset(emptyFormValues);
      setModalState({ open: true, mode, sponsorId: null });
      return;
    }

    form.reset({
      title: sponsor.title || '',
      bannerUrl: sponsor.bannerUrl || '',
      expiryDate: toInputDate(sponsor.expiryDate),
      active: typeof sponsor.active === 'boolean' ? sponsor.active : true
    });
    setModalState({ open: true, mode, sponsorId: sponsor.id });
  };

  const onSubmit = (values) => {
    const payload = {
      title: String(values.title || '').trim(),
      bannerUrl: String(values.bannerUrl || '').trim(),
      expiryDate: values.expiryDate ? new Date(values.expiryDate).toISOString() : '',
      active: Boolean(values.active)
    };

    if (modalState.mode === 'create') {
      createMutation.mutate(payload);
      return;
    }

    if (selectedSponsor) {
      updateMutation.mutate({
        id: selectedSponsor.id,
        values: {
          ...payload,
          createdAt: selectedSponsor.createdAt
        }
      });
    }
  };

  const uploadAndSetField = async (fieldName, file) => {
    if (!file) {
      return;
    }

    try {
      setUploadingField(fieldName);
      setUploadProgress((prev) => ({ ...prev, [fieldName]: 0 }));
      const uploaded = await uploadService.uploadFile({
        service: 'sponsors',
        file,
        allowedMimeTypes: ['image/*'],
        maxSizeMB: 15,
        onProgress: (percent) => setUploadProgress((prev) => ({ ...prev, [fieldName]: percent }))
      });

      const nextUrl = uploaded?.url || '';
      if (!nextUrl) {
        throw new Error('Upload did not return a file URL.');
      }

      form.setValue(fieldName, nextUrl, { shouldDirty: true, shouldValidate: true });
      setUploadStatus({ type: 'success', message: 'Banner uploaded successfully.' });
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message || 'Unable to upload banner.' });
    } finally {
      setUploadingField('');
      setUploadProgress((prev) => ({ ...prev, [fieldName]: 0 }));
    }
  };

  const isViewMode = modalState.mode === 'view';

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setHeaderAction(
      <AdminHeaderActionButton label="Add Sponsor" onClick={() => openModal('create')} />
    );

    return () => setHeaderAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderAction]);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Sponsors</h1>

      <Card>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
            Search
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search sponsor title or date"
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

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Date Added</th>
                <th className="px-3 py-2">Expiry Date</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleSponsors.map((sponsor) => (
                <tr key={sponsor.id}>
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    <div className="space-y-1.5 lg:hidden">
                      <p className="text-sm font-bold leading-tight text-slate-800">{sponsor.title || 'Untitled sponsor'}</p>
                      <p className="text-[12px] leading-snug text-slate-600">{formatDate(sponsor.createdAt)}</p>
                      <p className="text-[12px] leading-snug text-slate-600">{formatDate(sponsor.expiryDate)}</p>
                      <div className="pt-0.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${sponsor.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}>
                          {sponsor.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <span className="hidden lg:inline">{sponsor.title || 'Untitled sponsor'}</span>
                  </td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{formatDate(sponsor.createdAt)}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{formatDate(sponsor.expiryDate)}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleActiveMutation.mutate({ id: sponsor.id, active: !sponsor.active })}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sponsor.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}
                    >
                      {sponsor.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openModal('view', sponsor)} className="rounded-md border border-slate-300 p-1.5 text-slate-700" title="View"><EyeIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => openModal('edit', sponsor)} className="rounded-md border border-slate-300 p-1.5 text-slate-700" title="Edit"><PencilSquareIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => deleteMutation.mutate(sponsor.id)} className="rounded-md border border-red-200 p-1.5 text-red-700" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredSponsors.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={5}>No sponsors found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredSponsors.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">Showing {visibleSponsors.length} of {filteredSponsors.length} sponsors</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((prev) => prev - 1)}
              >
                Prev
              </button>
              <span className="text-xs font-semibold text-slate-600">Page {page} of {totalPages}</span>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
                disabled={page >= totalPages}
                onClick={() => setPage((prev) => prev + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {modalState.open ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-4 py-6">
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-heading text-xl font-semibold">{modalState.mode === 'create' ? 'Add Sponsor' : modalState.mode === 'edit' ? 'Edit Sponsor' : 'View Sponsor'}</h3>
                <button type="button" onClick={closeModal} className="rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
              </div>

              <form className="mt-4 grid gap-3" onSubmit={form.handleSubmit(onSubmit)}>
                <StatusAlert type={uploadStatus.type} message={uploadStatus.message} />

                <label className="text-sm">Sponsor Title
                  <input disabled={isViewMode} {...form.register('title', { required: true })} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
                </label>

                <label className="text-sm">Expiry Date
                  <input type="date" disabled={isViewMode} {...form.register('expiryDate')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
                </label>

                <label className="text-sm">Banner Image URL
                  <input disabled={isViewMode} {...form.register('bannerUrl')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
                  <p className="mt-1 text-xs text-slate-500">Recommended size: 1200 x 300 px (or similar wide banner).</p>
                  {!isViewMode ? (
                    <>
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-2 block w-full text-xs"
                        onChange={(event) => uploadAndSetField('bannerUrl', event.target.files?.[0])}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        {uploadingField === 'bannerUrl' ? `Uploading banner... ${uploadProgress.bannerUrl}%` : 'You can either paste image URL above or upload a banner file (max 15MB).'}
                      </p>
                      {uploadingField === 'bannerUrl' ? (
                        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div className="h-full bg-brand-blue transition-all" style={{ width: `${uploadProgress.bannerUrl}%` }} />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </label>

                {selectedSponsor ? (
                  <label className="text-sm">Date Added
                    <input value={formatDate(selectedSponsor.createdAt)} disabled className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-50 p-2.5" />
                  </label>
                ) : null}

                <label className="text-sm flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                  <input type="checkbox" disabled={isViewMode} {...form.register('active')} />
                  <span>Active</span>
                </label>

                {!isViewMode ? (
                  <div className="flex gap-2">
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      {createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Sponsor'}
                    </Button>
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

export default AdminSponsorsPage;
