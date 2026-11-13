import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import advertisementService, { AD_PLACEMENT_OPTIONS } from '../../services/advertisementService';
import uploadService from '../../services/uploadService';
import StatusAlert from '../../components/common/StatusAlert';

const placementOptions = AD_PLACEMENT_OPTIONS;

const groupedPlacementOptions = [
  {
    label: 'Homepage',
    options: placementOptions.filter((option) => option.startsWith('Homepage') || option === 'Global Banner')
  },
  {
    label: 'Seva Page',
    options: placementOptions.filter((option) => option.startsWith('Seva '))
  },
  {
    label: 'Donation Page',
    options: placementOptions.filter((option) => option.startsWith('Donation '))
  },
  {
    label: 'Library Page',
    options: placementOptions.filter((option) => option.startsWith('Library '))
  },
  {
    label: 'Events Page',
    options: placementOptions.filter((option) => option.startsWith('Events '))
  }
].filter((group) => group.options.length > 0);

const emptyFormValues = {
  title: '',
  content: '',
  website: '',
  bannerUrl: '',
  placement: 'Homepage Sidebar',
  active: true
};
const ADS_PAGE_SIZE = 10;

const TREND_RANGE_OPTIONS = [
  { id: '7d', label: 'Last 7 days', days: 7 },
  { id: '30d', label: 'Last 30 days', days: 30 },
  { id: '3m', label: 'Last 3 months', days: 90 },
  { id: '6m', label: 'Last 6 months', days: 180 },
  { id: '1y', label: 'Last 1 year', days: 365 }
];

const AdminAdvertisementsPage = () => {
  const { setHeaderAction } = useOutletContext();
  const queryClient = useQueryClient();
  const [modalState, setModalState] = useState({ open: false, mode: 'create', adId: null });
  const [trendAdId, setTrendAdId] = useState(null);
  const [trendRangeId, setTrendRangeId] = useState('7d');
  const [trendHoverIndex, setTrendHoverIndex] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [placementFilter, setPlacementFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const form = useForm({
    defaultValues: emptyFormValues
  });
  const [uploadingField, setUploadingField] = useState('');
  const [uploadProgress, setUploadProgress] = useState({ bannerUrl: 0 });
  const [uploadStatus, setUploadStatus] = useState({ type: 'success', message: '' });

  const { data: ads = [] } = useQuery({
    queryKey: ['advertisements'],
    queryFn: () => advertisementService.getAds().then((res) => res.data)
  });

  const selectedAd = useMemo(() => ads.find((ad) => ad.id === modalState.adId) || null, [ads, modalState.adId]);
  const selectedTrendAd = useMemo(() => ads.find((ad) => ad.id === trendAdId) || null, [ads, trendAdId]);
  const selectedTrendRange = useMemo(
    () => TREND_RANGE_OPTIONS.find((option) => option.id === trendRangeId) || TREND_RANGE_OPTIONS[0],
    [trendRangeId]
  );

  const trendSeries = useMemo(() => {
    const history = Array.isArray(selectedTrendAd?.clickHistory) ? selectedTrendAd.clickHistory : [];
    const countsByDate = new Map();

    history.forEach((stamp) => {
      const date = new Date(stamp);
      if (Number.isNaN(date.getTime())) {
        return;
      }
      const dateKey = date.toISOString().slice(0, 10);
      countsByDate.set(dateKey, Number(countsByDate.get(dateKey) || 0) + 1);
    });

    const totalDays = Number(selectedTrendRange.days || 7);
    const result = [];
    for (let offset = totalDays - 1; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setDate(day.getDate() - offset);
      const key = day.toISOString().slice(0, 10);
      result.push({
        key,
        label: day.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
        value: Number(countsByDate.get(key) || 0)
      });
    }

    return result;
  }, [selectedTrendAd, selectedTrendRange]);

  const trendGraph = useMemo(() => {
    const width = 760;
    const height = 260;
    const plotLeft = 44;
    const plotRight = width - 16;
    const plotTop = 16;
    const plotBottom = height - 32;
    const plotWidth = Math.max(1, plotRight - plotLeft);
    const plotHeight = Math.max(1, plotBottom - plotTop);
    const values = trendSeries.map((entry) => Number(entry.value || 0));
    const maxValue = Math.max(1, ...values);
    const xStep = trendSeries.length > 1 ? plotWidth / (trendSeries.length - 1) : 0;

    const points = trendSeries.map((entry, index) => {
      const x = plotLeft + (xStep * index);
      const y = plotBottom - ((Number(entry.value || 0) / maxValue) * plotHeight);
      return { ...entry, x, y };
    });

    const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ');
    const first = points[0] || null;
    const last = points[points.length - 1] || null;
    const totalPoints = points.length;
    const xLabelStep = totalPoints <= 14 ? 1 : totalPoints <= 30 ? 3 : totalPoints <= 90 ? 10 : totalPoints <= 180 ? 20 : 30;
    const xLabelFontSize = totalPoints <= 30 ? 10 : totalPoints <= 90 ? 9 : 8;

    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const ratio = index / 4;
      const value = Math.round(maxValue * (1 - ratio));
      const y = plotTop + (plotHeight * ratio);
      return { value, y };
    });

    const xLabels = points.filter((point, index) => index % xLabelStep === 0 || index === totalPoints - 1);

    return {
      width,
      height,
      maxValue,
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      plotWidth,
      plotHeight,
      xStep,
      xLabels,
      xLabelFontSize,
      yTicks,
      points,
      polylinePoints,
      firstLabel: first?.label || '',
      lastLabel: last?.label || ''
    };
  }, [trendSeries]);

  const filteredAds = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    return ads.filter((ad) => {
      const placementOk = placementFilter === 'all' ? true : String(ad?.placement || '') === placementFilter;
      const statusOk = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? ad.active === true
          : ad.active !== true;

      if (!placementOk || !statusOk) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [ad?.title, ad?.content, ad?.website, ad?.placement]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(query);
    });
  }, [ads, placementFilter, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAds.length / ADS_PAGE_SIZE));
  const visibleAds = useMemo(() => {
    const start = (page - 1) * ADS_PAGE_SIZE;
    return filteredAds.slice(start, start + ADS_PAGE_SIZE);
  }, [filteredAds, page]);

  useEffect(() => {
    if (trendGraph.points.length === 0) {
      setTrendHoverIndex(null);
      return;
    }
    setTrendHoverIndex(trendGraph.points.length - 1);
  }, [selectedTrendAd?.id, trendRangeId, trendGraph.points.length]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, placementFilter, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const createMutation = useMutation({
    mutationFn: (values) => advertisementService.createAd(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      form.reset(emptyFormValues);
      setModalState({ open: false, mode: 'create', adId: null });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }) => advertisementService.updateAd(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['advertisements'] });
      setModalState({ open: false, mode: 'create', adId: null });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => advertisementService.removeAd(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['advertisements'] })
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => advertisementService.updateAd(id, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['advertisements'] })
  });

  const openModal = (mode, ad = null) => {
    if (ad) {
      form.reset({
        title: ad.title || '',
        content: ad.content || '',
        website: ad.website || '',
        bannerUrl: ad.bannerUrl || '',
        placement: ad.placement || 'Homepage Sidebar',
        active: typeof ad.active === 'boolean' ? ad.active : true
      });
      setModalState({ open: true, mode, adId: ad.id });
      return;
    }

    form.reset(emptyFormValues);
    setModalState({ open: true, mode: 'create', adId: null });
  };

  const closeModal = () => {
    setModalState({ open: false, mode: 'create', adId: null });
  };

  const uploadAndSetField = async (fieldName, file) => {
    if (!file) {
      return;
    }

    try {
      setUploadingField(fieldName);
      setUploadProgress((prev) => ({ ...prev, [fieldName]: 0 }));
      const uploaded = await uploadService.uploadFile({
        service: 'advertisements',
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
      setUploadStatus({ type: 'success', message: 'File uploaded successfully.' });
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message || 'Unable to upload file.' });
    } finally {
      setUploadingField('');
      setUploadProgress((prev) => ({ ...prev, [fieldName]: 0 }));
    }
  };

  const onSubmit = (values) => {
    if (modalState.mode === 'create') {
      createMutation.mutate(values);
      return;
    }

    if (modalState.mode === 'edit' && selectedAd) {
      updateMutation.mutate({ id: selectedAd.id, values });
    }
  };

  const isViewMode = modalState.mode === 'view';

  useEffect(() => {
    setHeaderAction(
      <AdminHeaderActionButton label="Create Advertisement" onClick={() => openModal('create')} />
    );

    return () => setHeaderAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderAction]);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Advertisements</h1>

      <Card>
        <div className="grid gap-2 md:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
            Search
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search advertiser, website, or content"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Placement
            <select
              value={placementFilter}
              onChange={(event) => setPlacementFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-700 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20"
            >
              <option value="all">All</option>
              {placementOptions.map((placement) => (
                <option key={placement} value={placement}>{placement}</option>
              ))}
            </select>
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
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Placement</th>
                <th className="px-3 py-2">Website</th>
                <th className="px-3 py-2">Organic Views</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleAds.map((ad) => (
                <tr key={ad.id}>
                  <td className="px-3 py-2 font-semibold text-slate-800">
                    <div className="space-y-1.5 lg:hidden">
                      <p className="text-sm font-bold leading-tight text-slate-800">{ad.title || 'Untitled ad'}</p>
                      <p className="text-[12px] leading-snug text-slate-600">{ad.placement}</p>
                      <p className="text-[12px] leading-snug text-slate-600 break-all">{ad.website || '-'}</p>
                      <p className="text-[12px] leading-snug text-slate-600">{Number(ad.clickCount || 0)} organic</p>
                      <div className="pt-0.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${ad.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}>
                          {ad.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                    <span className="hidden lg:inline">{ad.title || 'Untitled ad'}</span>
                  </td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{ad.placement}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{ad.website || '-'}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setTrendAdId(ad.id)}
                      className="inline-flex rounded-full border border-brand-blue/30 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-brand-blue hover:bg-blue-100"
                    >
                      {Number(ad.clickCount || 0)} organic
                    </button>
                  </td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleActiveMutation.mutate({ id: ad.id, active: !ad.active })}
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ad.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-700'}`}
                    >
                      {ad.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => openModal('view', ad)} className="rounded-md border border-slate-300 p-1.5 text-slate-700" title="View"><EyeIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => openModal('edit', ad)} className="rounded-md border border-slate-300 p-1.5 text-slate-700" title="Edit"><PencilSquareIcon className="h-4 w-4" /></button>
                      <button type="button" onClick={() => deleteMutation.mutate(ad.id)} className="rounded-md border border-red-200 p-1.5 text-red-700" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAds.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={6}>No advertisements found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredAds.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">Showing {visibleAds.length} of {filteredAds.length} advertisements</p>
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
          <div className="w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading text-xl font-semibold">{modalState.mode === 'create' ? 'Create Advertisement' : modalState.mode === 'edit' ? 'Edit Advertisement' : 'View Advertisement'}</h3>
              <button type="button" onClick={closeModal} className="rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="md:col-span-2">
                <StatusAlert type={uploadStatus.type} message={uploadStatus.message} />
              </div>
              <label className="text-sm">Advertiser Name
                <input disabled={isViewMode} {...form.register('title', { required: true })} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Placement
                <select disabled={isViewMode} {...form.register('placement')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50">
                  {groupedPlacementOptions.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.options.map((option) => <option key={option}>{option}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="text-sm md:col-span-2">Content
                <textarea rows={3} disabled={isViewMode} {...form.register('content')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Website
                <input disabled={isViewMode} {...form.register('website')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Banner URL
                <input disabled={isViewMode} {...form.register('bannerUrl')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
                <p className="mt-1 text-xs text-slate-500">Recommended banner size: 1200 x 300 px (4:1). Banner click opens Website URL.</p>
                {!isViewMode ? (
                  <>
                    <input
                      type="file"
                      accept="image/*"
                      className="mt-2 block w-full text-xs"
                      onChange={(event) => uploadAndSetField('bannerUrl', event.target.files?.[0])}
                    />
                    <p className="mt-1 text-xs text-slate-500">{uploadingField === 'bannerUrl' ? `Uploading banner... ${uploadProgress.bannerUrl}%` : 'Paste URL or upload banner file (max 15MB).'}</p>
                    {uploadingField === 'bannerUrl' ? (
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-brand-blue transition-all" style={{ width: `${uploadProgress.bannerUrl}%` }} />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </label>
              <label className="text-sm md:col-span-2 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <input type="checkbox" disabled={isViewMode} {...form.register('active')} />
                <span>Active</span>
              </label>
              {!isViewMode ? (
                <div className="md:col-span-2 flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>{createMutation.isPending || updateMutation.isPending ? 'Saving...' : 'Save Advertisement'}</Button>
                  <button type="button" onClick={closeModal} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
                </div>
              ) : null}
            </form>
          </div>
          </div>
        </div>
      ) : null}

      {selectedTrendAd ? (
        <div className="fixed inset-0 z-[96] overflow-y-auto bg-slate-900/45 px-4 py-6">
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-4xl rounded-xl bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading text-xl font-semibold">Ad Organic View Trend</h3>
                  <p className="text-xs text-slate-600">{selectedTrendAd.title || 'Untitled ad'} • {selectedTrendRange.label}</p>
                </div>
                <button type="button" onClick={() => setTrendAdId(null)} className="rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {TREND_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setTrendRangeId(option.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${trendRangeId === option.id ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <div className="mb-3 text-sm font-semibold text-slate-700">Total Organic Views: {Number(selectedTrendAd.clickCount || 0)}</div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <svg viewBox={`0 0 ${trendGraph.width} ${trendGraph.height}`} className="h-56 w-full">
                    {trendGraph.yTicks.map((tick) => (
                      <g key={`tick-${tick.value}-${tick.y}`}>
                        <line x1={trendGraph.plotLeft} y1={tick.y} x2={trendGraph.plotRight} y2={tick.y} stroke="#e2e8f0" strokeWidth="1" />
                        <text x={trendGraph.plotLeft - 8} y={tick.y + 3} textAnchor="end" fontSize="9" fill="#64748b">{tick.value}</text>
                      </g>
                    ))}
                    <line x1={trendGraph.plotLeft} y1={trendGraph.plotBottom} x2={trendGraph.plotRight} y2={trendGraph.plotBottom} stroke="#cbd5e1" strokeWidth="1" />
                    <line x1={trendGraph.plotLeft} y1={trendGraph.plotTop} x2={trendGraph.plotLeft} y2={trendGraph.plotBottom} stroke="#cbd5e1" strokeWidth="1" />
                    <polyline fill="none" stroke="#0a4d9f" strokeWidth="3" points={trendGraph.polylinePoints} />

                    {trendGraph.points.map((point, index) => {
                      const previousX = index > 0 ? trendGraph.points[index - 1].x : trendGraph.plotLeft;
                      const nextX = index < trendGraph.points.length - 1 ? trendGraph.points[index + 1].x : trendGraph.plotRight;
                      const zoneLeft = index === 0 ? trendGraph.plotLeft : (previousX + point.x) / 2;
                      const zoneRight = index === trendGraph.points.length - 1 ? trendGraph.plotRight : (nextX + point.x) / 2;
                      return (
                        <rect
                          key={`hover-zone-${point.key}`}
                          x={zoneLeft}
                          y={trendGraph.plotTop}
                          width={Math.max(1, zoneRight - zoneLeft)}
                          height={trendGraph.plotHeight}
                          fill="transparent"
                          onMouseEnter={() => setTrendHoverIndex(index)}
                          onMouseMove={() => setTrendHoverIndex(index)}
                        />
                      );
                    })}

                    {trendGraph.points.map((point, index) => (
                      <g key={point.key}>
                        <circle cx={point.x} cy={point.y} r={trendHoverIndex === index ? '5' : '3.5'} fill="#f5a623" />
                        <title>{`${point.label}: ${point.value} clicks`}</title>
                      </g>
                    ))}

                    {trendHoverIndex != null && trendGraph.points[trendHoverIndex] ? (() => {
                      const point = trendGraph.points[trendHoverIndex];
                      const tooltipWidth = 118;
                      const tooltipHeight = 38;
                      const tooltipX = Math.max(
                        trendGraph.plotLeft,
                        Math.min(point.x + 8, trendGraph.plotRight - tooltipWidth)
                      );
                      const tooltipY = Math.max(trendGraph.plotTop + 2, point.y - tooltipHeight - 8);
                      return (
                        <g>
                          <rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="6" fill="#0f172a" opacity="0.92" />
                          <text x={tooltipX + 8} y={tooltipY + 14} fontSize="10" fill="#e2e8f0">{point.key}</text>
                          <text x={tooltipX + 8} y={tooltipY + 28} fontSize="11" fill="#f8fafc" fontWeight="700">{point.value} clicks</text>
                        </g>
                      );
                    })() : null}

                    {trendGraph.xLabels.map((point) => (
                      <text
                        key={`x-label-${point.key}`}
                        x={point.x}
                        y={trendGraph.plotBottom + 14}
                        textAnchor="middle"
                        fontSize={trendGraph.xLabelFontSize}
                        fill="#64748b"
                      >
                        {point.label}
                      </text>
                    ))}
                  </svg>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-slate-600">
                    <span>{trendGraph.firstLabel}</span>
                    <span>Max daily clicks: {trendGraph.maxValue}</span>
                    <span>{trendGraph.lastLabel}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminAdvertisementsPage;
