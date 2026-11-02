import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import cmsService from '../../services/cmsService';
import uploadService from '../../services/uploadService';
import StatusAlert from '../../components/common/StatusAlert';
import WebsiteNavigationEditor from './WebsiteNavigationEditor';
import CmsPageContentManager from './CmsPageContentManager';

const emptySlide = {
  image: '',
  eyebrow: '',
  title: '',
  description: '',
  order: 1,
  primaryCtaLabel: '',
  primaryCtaPath: '',
  secondaryCtaLabel: '',
  secondaryCtaPath: '',
  contentLinkLabel: '',
  contentLinkPath: '',
  contentLinkTwoLabel: '',
  contentLinkTwoPath: ''
};

const heroSlideIntervalOptions = [5, 7, 10, 15, 20, 30];

const AdminCmsPage = () => {
  const queryClient = useQueryClient();
  const [slideModal, setSlideModal] = useState({ open: false, mode: 'view', slideId: null });
  const [slideUploadPending, setSlideUploadPending] = useState(false);
  const [slideUploadProgress, setSlideUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState({ type: 'success', message: '' });
  const [heroSlideIntervalSeconds, setHeroSlideIntervalSeconds] = useState(5);

  const slideForm = useForm({ defaultValues: emptySlide });

  const { data: slides = [] } = useQuery({
    queryKey: ['hero-slides'],
    queryFn: () => cmsService.getHeroSlides().then((res) => res.data)
  });

  const { data: homeContent } = useQuery({
    queryKey: ['cms-home'],
    queryFn: () => cmsService.getHomeContent().then((res) => res.data)
  });

  useEffect(() => {
    if (homeContent?.hero?.slideIntervalSeconds) {
      setHeroSlideIntervalSeconds(Number(homeContent.hero.slideIntervalSeconds));
    }
  }, [homeContent?.hero?.slideIntervalSeconds]);

  const selectedSlide = useMemo(() => slides.find((slide) => slide.id === slideModal.slideId), [slides, slideModal.slideId]);

  useEffect(() => {
    if (!slideModal.open) {
      return;
    }

    if (slideModal.mode === 'add') {
      slideForm.reset({ ...emptySlide, order: slides.length + 1 });
      return;
    }

    if (selectedSlide) {
      slideForm.reset({
        ...emptySlide,
        ...selectedSlide,
        order: selectedSlide.order || 1
      });
    }
  }, [selectedSlide, slideForm, slideModal, slides.length]);

  const addSlideMutation = useMutation({
    mutationFn: (values) => cmsService.addHeroSlide(values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hero-slides'] });
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      setSlideModal({ open: false, mode: 'view', slideId: null });
    }
  });

  const updateSlideMutation = useMutation({
    mutationFn: ({ id, values }) => cmsService.updateHeroSlide(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hero-slides'] });
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      setSlideModal({ open: false, mode: 'view', slideId: null });
    }
  });

  const deleteSlideMutation = useMutation({
    mutationFn: (id) => cmsService.removeHeroSlide(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hero-slides'] });
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
    }
  });

  const updateSlideIntervalMutation = useMutation({
    mutationFn: (slideIntervalSeconds) => cmsService.updateHomeContent({
      hero: { slideIntervalSeconds }
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
    }
  });

  const onSlideSubmit = (values) => {
    if (slideModal.mode === 'add') {
      addSlideMutation.mutate(values);
      return;
    }

    if (selectedSlide) {
      updateSlideMutation.mutate({ id: selectedSlide.id, values });
    }
  };

  const uploadCmsFile = async ({ file, target }) => {
    if (!file) return;
    try {
      setSlideUploadPending(true);
      setSlideUploadProgress(0);
      const uploaded = await uploadService.uploadFile({
        service: 'cms', file,
        allowedMimeTypes: ['image/*', 'video/*', 'application/pdf'],
        maxSizeMB: 15, onProgress: setSlideUploadProgress
      });
      const nextUrl = uploaded?.url || '';
      if (!nextUrl) throw new Error('Upload did not return a file URL.');
      slideForm.setValue('image', nextUrl, { shouldDirty: true, shouldValidate: true });
      setUploadStatus({ type: 'success', message: 'File uploaded successfully.' });
    } catch (error) {
      setUploadStatus({ type: 'error', message: error.message || 'Unable to upload file.' });
    } finally {
      setSlideUploadPending(false);
      setSlideUploadProgress(0);
    }
  };

  return (
    <div className="admin-cms-page space-y-6">
      <h1 className="sr-only">CMS Management</h1>
      <WebsiteNavigationEditor />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold">Hero Slides</h2>
            <p className="mt-1 text-sm text-slate-600">Slides are managed as a table with modal view/edit/add.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-slate-700">
              Seconds per slide
              <select
                aria-label="Seconds per hero slide"
                value={heroSlideIntervalSeconds}
                disabled={updateSlideIntervalMutation.isPending}
                onChange={(event) => {
                  const seconds = Number(event.target.value);
                  setHeroSlideIntervalSeconds(seconds);
                  updateSlideIntervalMutation.mutate(seconds);
                }}
                className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-blue-100 disabled:cursor-wait disabled:bg-slate-100"
              >
                {heroSlideIntervalOptions.map((seconds) => (
                  <option key={seconds} value={seconds}>{seconds} seconds</option>
                ))}
              </select>
              {updateSlideIntervalMutation.isPending ? <span className="mt-1 block text-xs font-normal text-slate-500">Saving...</span> : null}
            </label>
            <Button type="button" variant="secondary" onClick={() => setSlideModal({ open: true, mode: 'add', slideId: null })}>Add New Slide</Button>
          </div>
        </div>

        <div className="mt-4 overflow-x-hidden">
          <table className="admin-cms-table min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Eyebrow</th>
                <th className="px-3 py-2">Primary CTA</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slides.map((slide) => (
                <tr key={slide.id}>
                  <td className="px-3 py-2 font-semibold text-brand-blue">#{slide.order}</td>
                  <td className="px-3 py-2">{slide.title || 'Untitled slide'}</td>
                  <td className="px-3 py-2">{slide.eyebrow || '-'}</td>
                  <td className="px-3 py-2">{slide.primaryCtaLabel || '-'} {slide.primaryCtaPath ? `(${slide.primaryCtaPath})` : ''}</td>
                  <td className="px-3 py-2">
                    <div className="admin-cms-actions flex flex-wrap gap-2">
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-semibold xl:w-auto xl:px-2.5" onClick={() => setSlideModal({ open: true, mode: 'view', slideId: slide.id })} aria-label="View slide" title="View">
                        <EyeIcon className="h-4 w-4" /><span className="admin-cms-action-label hidden xl:inline">View</span>
                      </button>
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-xs font-semibold xl:w-auto xl:px-2.5" onClick={() => setSlideModal({ open: true, mode: 'edit', slideId: slide.id })} aria-label="Edit slide" title="Edit">
                        <PencilSquareIcon className="h-4 w-4" /><span className="admin-cms-action-label hidden xl:inline">Edit</span>
                      </button>
                      <button type="button" className="inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-lg border border-red-200 text-xs font-semibold text-red-700 xl:w-auto xl:px-2.5" onClick={() => deleteSlideMutation.mutate(slide.id)} aria-label="Delete slide" title="Delete">
                        <TrashIcon className="h-4 w-4" /><span className="admin-cms-action-label hidden xl:inline">Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <CmsPageContentManager />
      {slideModal.open ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-4 py-6">
          <div className="mx-auto flex min-h-full items-center justify-center">
          <div className="w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading text-xl font-semibold">{slideModal.mode === 'add' ? 'Add New Slide' : slideModal.mode === 'edit' ? 'Edit Slide' : 'View Slide'}</h3>
              <button type="button" onClick={() => setSlideModal({ open: false, mode: 'view', slideId: null })} className="rounded-md border border-slate-300 px-2 py-1 text-sm">Close</button>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={slideForm.handleSubmit(onSlideSubmit)}>
              <div className="md:col-span-2">
                <StatusAlert type={uploadStatus.type} message={uploadStatus.message} />
              </div>
              <label className="text-sm">Slide Order
                <input type="number" min="1" max={Math.max(1, slides.length + (slideModal.mode === 'add' ? 1 : 0))} disabled={slideModal.mode === 'view'} {...slideForm.register('order', { valueAsNumber: true })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Image URL
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('image')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
                {slideModal.mode !== 'view' ? (
                  <>
                    <input
                      type="file"
                      accept="image/*,video/*,application/pdf"
                      className="mt-2 block w-full text-xs"
                      onChange={(event) => uploadCmsFile({ file: event.target.files?.[0], target: 'slide' })}
                    />
                    <p className="mt-1 text-xs text-slate-500">{slideUploadPending ? `Uploading slide media... ${slideUploadProgress}%` : 'Paste URL or upload file (image/video/pdf, max 15MB).'}</p>
                    {slideUploadPending ? (
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-brand-blue transition-all" style={{ width: `${slideUploadProgress}%` }} />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </label>
              <label className="text-sm">Eyebrow
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('eyebrow')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Title
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('title')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm md:col-span-2">Description
                <textarea rows={3} disabled={slideModal.mode === 'view'} {...slideForm.register('description')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Primary CTA Label
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('primaryCtaLabel')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Primary CTA Path
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('primaryCtaPath')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Secondary CTA Label
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('secondaryCtaLabel')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Secondary CTA Path
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('secondaryCtaPath')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Content Link One Label
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('contentLinkLabel')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Content Link One Path
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('contentLinkPath')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Content Link Two Label
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('contentLinkTwoLabel')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              <label className="text-sm">Content Link Two Path
                <input disabled={slideModal.mode === 'view'} {...slideForm.register('contentLinkTwoPath')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 disabled:bg-slate-50" />
              </label>
              {slideModal.mode !== 'view' ? (
                <div className="md:col-span-2 flex gap-2">
                  <Button type="submit" disabled={addSlideMutation.isPending || updateSlideMutation.isPending}>{addSlideMutation.isPending || updateSlideMutation.isPending ? 'Saving...' : 'Save Slide'}</Button>
                  <button type="button" onClick={() => setSlideModal({ open: false, mode: 'view', slideId: null })} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
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

export default AdminCmsPage;
