import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { widgetCategories, widgetRegistry } from '../../constants/widgetRegistry';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import widgetPlacementService from '../../services/widgetPlacementService';
import cmsService from '../../services/cmsService';
import { WidgetVisualization } from '../../components/widgets/PageWidgets';
import { DEFAULT_WIDGET_LAYOUT, distributePageSections, getWidgetColumns, getWidgetLayout, widgetLayouts } from '../../constants/widgetLayouts';
import { publicNav } from '../../constants/navigation';
import RichTextEditor from '../../components/forms/RichTextEditor';
import uploadService from '../../services/uploadService';

const buildInitialConfig = (widget) => {
  return widget.fields.reduce((accumulator, field) => ({
    ...accumulator,
    [field.key]: field.defaultValue ?? (
      field.type === 'number' ? 1 : field.type === 'checkbox' ? false : ''
    )
  }), {});
};

const WidgetInput = ({ field, value, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const sharedClasses = 'mt-1 min-w-0 w-full max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-blue-100';

  if (field.type === 'color') {
    return <label className="block text-sm font-medium text-slate-700">{field.label}
      <span className="mt-1 flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1">
        <input aria-label={field.label} type="color" value={value || field.defaultValue} onChange={(event) => onChange(field.key, event.target.value)} className="h-8 w-10 cursor-pointer border-0 bg-transparent p-0" />
        <span aria-hidden="true" className="font-mono text-xs text-slate-500">{value || field.defaultValue}</span>
      </span>
    </label>;
  }

  if (field.type === 'richtext') {
    return <label className="block min-w-0 text-sm font-medium text-slate-700">{field.label}<div className="mt-1"><RichTextEditor value={value || ''} onChange={(next) => onChange(field.key, next)} minHeight={220} /></div></label>;
  }

  if (field.type === 'image') {
    return <div className="min-w-0 text-sm font-medium text-slate-700"><label>{field.label}<input type="url" value={value || ''} onChange={(event) => onChange(field.key, event.target.value)} placeholder="https://… or upload below" className={sharedClasses} /></label><label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{uploading ? 'Uploading image…' : 'Upload image'}<input type="file" accept="image/*" disabled={uploading} className="sr-only" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); setUploadError(''); try { const uploaded = await uploadService.uploadFile({ service: 'cms', file, allowedMimeTypes: ['image/*'], maxSizeMB: 15 }); if (!uploaded?.url) throw new Error('Upload did not return an image URL.'); onChange(field.key, uploaded.url); } catch (error) { setUploadError(error.message || 'Image upload failed.'); } finally { setUploading(false); event.target.value = ''; } }} /></label>{uploadError ? <p role="alert" className="mt-1 text-xs text-rose-700">{uploadError}</p> : null}</div>;
  }

  if (field.type === 'textarea') {
    return (
      <label className="block text-sm font-medium text-slate-700">
        {field.label}
        <textarea
          value={value ?? ''}
          onChange={(event) => onChange(field.key, event.target.value)}
          rows={3}
          className={`${sharedClasses} resize-none`}
        />
      </label>
    );
  }

  if (field.type === 'select') {
    return (
      <label className="block text-sm font-medium text-slate-700">
        {field.label}
        <select
          value={value ?? field.defaultValue ?? ''}
          onChange={(event) => onChange(field.key, event.target.value)}
          className={sharedClasses}
        >
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.key, event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
        />
        {field.label}
      </label>
    );
  }

  return (
    <label className="block text-sm font-medium text-slate-700">
      {field.label}
      <input
        type={field.type === 'number' || field.type === 'color' ? field.type : 'text'}
        min={field.type === 'number' ? 1 : undefined}
        max={field.key === 'ang' ? 1430 : field.key === 'limit' ? 20 : ['imageWidth', 'imageHeight'].includes(field.key) ? 1920 : undefined}
        value={value ?? ''}
        onChange={(event) => onChange(field.key, field.type === 'number' ? Number(event.target.value || 0) : event.target.value)}
        className={sharedClasses}
      />
    </label>
  );
};

const PagePreviewDialog = ({ children, onClose }) => {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const headingId = useId();

  useEffect(() => {
    const previousFocus = document.activeElement;
    const { overflow, paddingRight } = document.body.style;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
    if (scrollbarWidth) {
      document.body.style.paddingRight = `${(parseFloat(window.getComputedStyle(document.body).paddingRight) || 0) + scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === 'Tab') {
        const controls = [...dialogRef.current.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
          .filter((element) => !element.disabled && element.tabIndex >= 0 && !element.closest('[hidden], [inert], [aria-hidden="true"]'));
        const index = controls.indexOf(document.activeElement);
        const nextIndex = event.shiftKey
          ? (index <= 0 ? controls.length - 1 : index - 1)
          : (index + 1) % controls.length;
        event.preventDefault();
        (controls[nextIndex] || dialogRef.current).focus();
      }
    };
    const containFocus = (event) => {
      if (!dialogRef.current.contains(event.target)) closeRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = overflow;
      document.body.style.paddingRight = paddingRight;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-4 sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId} tabIndex={-1} data-delete-guard-ignore="true" className="flex max-h-[calc(100dvh-3rem)] w-full max-w-7xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 id={headingId} className="text-3xl font-bold text-slate-900">Page preview</h2>
          <button ref={closeRef} type="button" aria-label="Close page preview" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue"><span aria-hidden="true">×</span></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-5 sm:p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const AdminWidgetsPage = () => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const [activeCategory, setActiveCategory] = useState('All');
  const [catalogPage, setCatalogPage] = useState(1);
  const [editingPlacementId, setEditingPlacementId] = useState(null);
  const [selectedWidgetId, setSelectedWidgetId] = useState(widgetRegistry[0]?.id || '');
  const [selectedPage, setSelectedPage] = useState('/');
  const [selectedLayoutId, setSelectedLayoutId] = useState(DEFAULT_WIDGET_LAYOUT);
  const [selectedSlot, setSelectedSlot] = useState(getWidgetColumns(getWidgetLayout(DEFAULT_WIDGET_LAYOUT))[0]?.id || 'main');
  const queryClient = useQueryClient();
  const { data: placementState = { placements: [], layouts: [] }, isPending, isError } = useQuery({ queryKey: ['widget-placements'], queryFn: widgetPlacementService.get });
  const savedWidgets = placementState.placements || [];
  const savedLayouts = placementState.layouts || [];
  const { data: cmsPages = {} } = useQuery({ queryKey: ['widgets-cms-pages'], queryFn: () => cmsService.getAllPageContent().then((response) => response.data), retry: false });
  const pages = useMemo(() => {
    const options = new Map(publicNav.map((page) => [page.path, page.label]));
    Object.entries(cmsPages || {}).forEach(([key, page]) => {
      const path = `/${key.replace(/^\/+|\/+$/g, '')}`;
      if (!page?.deleted && path !== '/') options.set(path, page.heroTitle || options.get(path) || key);
    });
    return [...options].map(([path, label]) => ({ path, label }));
  }, [cmsPages]);
  const saveMutation = useMutation({
    mutationFn: (nextState) => widgetPlacementService.save(nextState),
    onSuccess: (nextState) => queryClient.setQueryData(['widget-placements'], nextState)
  });
  const [config, setConfig] = useState(() => buildInitialConfig(widgetRegistry[0]));
  const currentLayout = getWidgetLayout(selectedLayoutId);
  const currentPageLayout = savedLayouts.find((page) => page.pagePath === selectedPage)?.layoutId || DEFAULT_WIDGET_LAYOUT;
  const pageContentKey = selectedPage.replace(/^\/+|\/+$/g, '');
  const selectedPageContent = cmsPages?.[pageContentKey] || null;
  const isBuiltInPage = publicNav.some((page) => page.path === selectedPage);
  const contentColumns = distributePageSections(selectedPageContent?.sections || [], getWidgetColumns(currentLayout));

  const getDefaultSlot = (layout) => getWidgetColumns(layout)[0]?.id || layout.slots[0]?.id || 'main';

  useEffect(() => {
    setSelectedLayoutId(currentPageLayout);
    const layout = getWidgetLayout(currentPageLayout);
    setSelectedSlot(getDefaultSlot(layout));
  }, [selectedPage, currentPageLayout]);

  useEffect(() => {
    if (pages.length && !pages.some((page) => page.path === selectedPage)) setSelectedPage(pages[0].path);
  }, [pages, selectedPage]);

  const filteredWidgets = useMemo(() => {
    if (activeCategory === 'All') {
      return widgetRegistry.filter((widget) => !widget.deprecated);
    }

    return widgetRegistry.filter((widget) => !widget.deprecated && widget.category === activeCategory);
  }, [activeCategory]);
  const catalogPageSize = 5;
  const catalogPageCount = Math.max(1, Math.ceil(filteredWidgets.length / catalogPageSize));
  const visibleWidgets = filteredWidgets.slice((catalogPage - 1) * catalogPageSize, catalogPage * catalogPageSize);

  const selectedWidget = useMemo(
    () => widgetRegistry.find((widget) => widget.id === selectedWidgetId) || widgetRegistry[0],
    [selectedWidgetId]
  );

  const handleSelectWidget = (widget) => {
    setEditingPlacementId(null);
    setSelectedWidgetId(widget.id);
    setConfig(buildInitialConfig(widget));
  };

  const handleFieldChange = (key, value) => {
    setConfig((previous) => ({ ...previous, [key]: value }));
  };

  const handleAddToPage = () => {
    if (editingPlacementId) {
      saveMutation.mutate({ layouts: savedLayouts, placements: savedWidgets.map((entry) => entry.id === editingPlacementId ? { ...entry, config } : entry) });
      return;
    }
    const pageLayout = getWidgetLayout(selectedLayoutId);
    const pagePlacements = savedWidgets.filter((entry) => entry.pagePath === selectedPage && entry.slot === selectedSlot);
    const layouts = [...savedLayouts.filter((entry) => entry.pagePath !== selectedPage), { pagePath: selectedPage, layoutId: pageLayout.id }];
    const defaultSlot = getDefaultSlot(pageLayout);
    const placements = savedWidgets.map((entry) => entry.pagePath === selectedPage && !pageLayout.slots.some((slot) => slot.id === entry.slot)
      ? { ...entry, slot: defaultSlot }
      : entry);
    saveMutation.mutate({
      layouts,
      placements: [
        ...placements,
        {
          id: `${selectedWidget.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          widgetId: selectedWidget.id,
          pagePath: selectedPage,
          slot: pageLayout.slots.some((slot) => slot.id === selectedSlot) ? selectedSlot : defaultSlot,
          order: pagePlacements.length,
          config
        }
      ]
    });
  };

  const savePageLayout = () => {
    const layout = getWidgetLayout(selectedLayoutId);
    const layouts = [...savedLayouts.filter((entry) => entry.pagePath !== selectedPage), { pagePath: selectedPage, layoutId: layout.id }];
    const placements = savedWidgets.map((entry) => {
      if (entry.pagePath !== selectedPage || layout.slots.some((slot) => slot.id === entry.slot)) return entry;
      return { ...entry, slot: getDefaultSlot(layout) };
    });
    saveMutation.mutate({ placements, layouts });
    setSelectedSlot(getDefaultSlot(layout));
  };

  const widgetCountLabel = `${filteredWidgets.length} widgets`;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-blue">Content Builder</p>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">Widget Library</h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {widgetCountLabel}
        </div>
      </div>

      <Card>
        <h2 className="text-xl font-bold">Page connections</h2>
        <p className="mt-1 text-sm text-slate-600">Connect live data-backed widgets to site pages, choose their layout region, and preview which widgets are assigned where.</p>
        {isPending ? <p role="status">Loading saved connections…</p> : null}
        {isError ? <p role="alert" className="text-rose-700">Could not load connections. Check the backend before saving.</p> : null}
        {saveMutation.isError ? <p role="alert" className="text-rose-700">{saveMutation.error.message || 'Unable to save connections.'}</p> : null}
        {saveMutation.isSuccess ? <p role="status" className="text-emerald-700">Page connections saved.</p> : null}
        <div className="my-4 flex flex-wrap items-end gap-3">
          <label className="min-w-0 w-full sm:w-64 text-sm font-semibold text-slate-700">Page
            <select aria-label="Page connections page" value={selectedPage} onChange={(event) => setSelectedPage(event.target.value)} className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" disabled={!pages.length}>
              {pages.map((page) => <option key={page.path} value={page.path}>{page.label} · {savedWidgets.filter((entry) => entry.pagePath === page.path).length} widgets</option>)}
              {!pages.length ? <option value="">No custom CMS pages published</option> : null}
            </select>
          </label>
              <label className="min-w-0 w-full sm:w-64 text-sm font-semibold text-slate-700">Page layout
                <select aria-label="Page layout" value={selectedLayoutId} onChange={(event) => { setSelectedLayoutId(event.target.value); setSelectedSlot(getWidgetLayout(event.target.value).slots[0]?.id || 'main'); }} className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              {widgetLayouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.label}</option>)}
            </select>
          </label>
          <Button type="button" disabled={saveMutation.isPending || isPending || isError} onClick={savePageLayout}>{saveMutation.isPending ? 'Saving…' : 'Save page layout'}</Button>
          <Button type="button" variant="ghost" aria-haspopup="dialog" onClick={() => setPreviewOpen(true)}>Preview</Button>
        </div>
        {previewOpen ? <PagePreviewDialog onClose={closePreview}>
        <section aria-label="Selected page layout preview" className="rounded-2xl border bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 break-words font-bold">{pages.find((page) => page.path === selectedPage)?.label || selectedPage} · {selectedPage}</h3><a href={selectedPage} target="_blank" rel="noreferrer" className="text-sm font-bold text-brand-blue">Open actual page ↗</a></div>
          <div className="my-3 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{isBuiltInPage ? 'Existing live page (its content layout stays unchanged; widgets render in selected regions)' : 'Existing CMS page content'}</p>
            <p className="mt-1 font-heading text-lg font-bold text-slate-800">{selectedPageContent?.heroTitle || pages.find((page) => page.path === selectedPage)?.label || selectedPage}</p>
            {selectedPageContent?.heroDescription ? <p className="mt-1 text-sm text-slate-600">{selectedPageContent.heroDescription}</p> : null}
            {selectedPageContent?.intro ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">Page intro content</p> : null}
          </div>
          <div className={`grid ${currentLayout.gridClass} gap-3`}>
            {currentLayout.slots.map((slot) => <div key={slot.id} aria-label={`${slot.label} preview slot`} className={`min-h-24 min-w-0 rounded-xl border border-dashed border-slate-300 bg-white p-2 ${slot.className}`}>
              <div className="grid content-start gap-2">{(getWidgetColumns(currentLayout).includes(slot) ? contentColumns[getWidgetColumns(currentLayout).indexOf(slot)] || [] : []).map((section) => <article key={section.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <p className="font-semibold text-slate-700">{section.title || 'Content section'}</p><p className="mt-1 line-clamp-2 text-xs text-slate-500">Existing section content</p>
              </article>)}{savedWidgets.filter((entry) => entry.pagePath === selectedPage && entry.slot === slot.id).sort((a, b) => a.order - b.order).map((entry) => <div key={entry.id}>
                <WidgetVisualization widgetId={entry.widgetId} config={entry.config} preview />
                <div className="mt-2 flex justify-end rounded-lg bg-white p-1">
                  <button type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ placements: savedWidgets.filter((item) => item.id !== entry.id), layouts: savedLayouts })} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800 transition hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-700 disabled:opacity-50" aria-label={`Remove ${widgetRegistry.find((widget) => widget.id === entry.widgetId)?.name || 'widget'} from page`}>Remove from page</button>
                </div>
              </div>)}</div>
              {!savedWidgets.some((entry) => entry.pagePath === selectedPage && entry.slot === slot.id) && !(getWidgetColumns(currentLayout).includes(slot) && (contentColumns[getWidgetColumns(currentLayout).indexOf(slot)] || []).length) ? <p className="text-sm text-slate-400">Choose this position below to place a widget here.</p> : null}
            </div>)}
          </div>
          {!savedWidgets.some((entry) => entry.pagePath === selectedPage) && !isPending ? <p className="text-sm text-slate-500">No widgets connected to this page.</p> : null}
        </section>
        </PagePreviewDialog> : null}
      </Card>

      <Card>
        <div className="flex flex-wrap gap-2">
          {widgetCategories.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => { setActiveCategory(category); setCatalogPage(1); }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${activeCategory === category ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {category}
            </button>
          ))}
        </div>
      </Card>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)]">
        <Card className="min-w-0 p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Choose a widget</h2>
          </div>
          <div aria-label="Widget catalog" className="space-y-3 p-4">
            {visibleWidgets.map((widget) => (
              <button
                key={widget.id}
                type="button"
                onClick={() => handleSelectWidget(widget)}
                className={`w-full rounded-2xl border p-4 text-left transition ${selectedWidget?.id === widget.id ? 'border-brand-blue bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold text-slate-900">{widget.name}</p>
                    <p className="mt-1 text-sm text-slate-600">{widget.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    {widget.category}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <nav aria-label="Widget catalog pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 text-sm">
            <button type="button" disabled={catalogPage === 1} onClick={() => setCatalogPage((page) => page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Previous</button>
            <span role="status">Page {catalogPage} of {catalogPageCount} · {filteredWidgets.length} widgets</span>
            <button type="button" disabled={catalogPage === catalogPageCount} onClick={() => setCatalogPage((page) => page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Next</button>
          </nav>
        </Card>

        <Card className="min-w-0">
          <div className="space-y-4 border-b border-slate-200 pb-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-blue">Selected widget</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">{selectedWidget.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{selectedWidget.description}</p>
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <a href={selectedWidget.managePath} target="_blank" rel="noreferrer" className="justify-self-start rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-brand-blue sm:col-span-2">{selectedWidget.managePath.startsWith('http') ? 'View source ↗' : 'Manage source ↗'}</a>
              <label className="min-w-0 text-sm font-medium text-slate-700">
                Add to page
                <select
                  aria-label="Add widget to page"
                  value={selectedPage}
                  onChange={(event) => setSelectedPage(event.target.value)}
                  disabled={!pages.length}
                  className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-blue-100"
                >
                  {pages.map((page) => (
                    <option key={page.path} value={page.path}>{page.label}</option>
                  ))}
                  {!pages.length ? <option value="">No custom CMS pages</option> : null}
                </select>
              </label>
              <label className="min-w-0 text-sm font-medium text-slate-700">
                Position
                <select aria-label="Widget position" value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} className="mt-1 block w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                  {currentLayout.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="mt-6 grid min-w-0 gap-6">
            <div className="min-w-0 space-y-4">
              {selectedWidget.fields.filter((field) => field.type !== 'color').map((field) => (
                <WidgetInput
                  key={field.key}
                  field={field}
                  value={config[field.key]}
                  onChange={handleFieldChange}
                />
              ))}
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                {selectedWidget.fields.filter((field) => field.type === 'color').map((field) => <WidgetInput key={field.key} field={field} value={config[field.key]} onChange={handleFieldChange} />)}
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button type="button" disabled={!pages.length || isPending || isError || saveMutation.isPending} onClick={handleAddToPage}>{saveMutation.isPending ? 'Saving…' : editingPlacementId ? 'Save widget changes' : 'Add to page'}</Button>
                {editingPlacementId ? <Button type="button" variant="ghost" onClick={() => setEditingPlacementId(null)}>Cancel editing</Button> : null}
                <Button type="button" variant="ghost" onClick={() => setConfig(buildInitialConfig(selectedWidget))}>Reset</Button>
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <WidgetVisualization widgetId={selectedWidget.id} config={config} />
              <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Page placements</h3>
                {savedWidgets.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-600">No widgets saved yet.</p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {savedWidgets.map((item) => (
                      <li key={item.id} className="min-w-0 break-words [overflow-wrap:anywhere] rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {widgetRegistry.find((widget) => widget.id === item.widgetId)?.name || item.widgetId} → {pages.find((page) => page.path === item.pagePath)?.label || item.pagePath} ({item.pagePath})
                        <button type="button" aria-label={`Edit ${item.config.title || item.widgetId}`} className="ml-2 rounded-full bg-blue-700/10 px-2 py-1 text-xs font-semibold text-brand-blue" onClick={() => { const widget = widgetRegistry.find((entry) => entry.id === item.widgetId); if (!widget) return; setSelectedWidgetId(widget.id); setConfig({ ...buildInitialConfig(widget), ...item.config }); setSelectedPage(item.pagePath); setEditingPlacementId(item.id); }}>Edit widget</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminWidgetsPage;
