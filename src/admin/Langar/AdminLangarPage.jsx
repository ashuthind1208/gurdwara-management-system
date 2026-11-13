import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  ArrowDownTrayIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  EyeIcon,
  FunnelIcon,
  PencilSquareIcon,
  PowerIcon,
  TrashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import cmsService from '../../services/cmsService';
import langarService, { LANGAR_CONTRIBUTIONS_RESOURCE, resolveGroceryImage, searchGroceryImages } from '../../services/langarService';
import contentApiService from '../../services/contentApiService';
import { downloadLangarReceivedReportCsv, downloadLangarReceivedReportPdf } from '../../utils/csvExport';
import { siteConfig } from '../../constants/siteConfig';

const actionIconClass = 'h-4 w-4';
const LANGAR_PAGE_SIZE = 10;
const COMMITMENTS_PAGE_SIZE = 10;
const VIEW_CONTRIBUTORS_PAGE_SIZE = 10;
const LANGAR_UNIT_OPTIONS = ['items', 'kg', 'gm', 'lb', 'unit'];
const LANGAR_CATEGORY_OPTIONS = ['Grocery', 'Dairy', 'Produce', 'Spices', 'Pantry', 'Other'];
const CUSTOM_UNITS_STORAGE_KEY = 'ssm_langar_custom_units';
const CUSTOM_CATEGORIES_STORAGE_KEY = 'ssm_langar_custom_categories';
const CUSTOM_BRANDS_STORAGE_KEY = 'ssm_langar_custom_brands';
const ADD_CUSTOM_VALUE = '__add_custom_option__';

const loadStoredList = (storageKey) => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string' && value.trim()) : [];
  } catch {
    return [];
  }
};

const saveStoredList = (storageKey, values) => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  } catch {
    // Ignore storage write failures.
  }
};

const loadCustomUnits = () => loadStoredList(CUSTOM_UNITS_STORAGE_KEY);
const saveCustomUnits = (units) => saveStoredList(CUSTOM_UNITS_STORAGE_KEY, units);
const loadCustomCategories = () => loadStoredList(CUSTOM_CATEGORIES_STORAGE_KEY);
const saveCustomCategories = (categories) => saveStoredList(CUSTOM_CATEGORIES_STORAGE_KEY, categories);
const loadCustomBrands = () => loadStoredList(CUSTOM_BRANDS_STORAGE_KEY);
const saveCustomBrands = (brands) => saveStoredList(CUSTOM_BRANDS_STORAGE_KEY, brands);

const REPORT_PRESETS = [
  { value: 'week', label: '7 Days', days: 7 },
  { value: 'month', label: '30 Days', days: 30 },
  { value: 'year', label: '365 Days', days: 365 }
];

const toDateInputValue = (date) => date.toISOString().slice(0, 10);
const defaultReportDates = () => {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));
  return { start: toDateInputValue(weekAgo), end: toDateInputValue(today) };
};

const defaultForm = {
  name: '',
  category: 'Grocery',
  brand: '',
  addedOn: new Date().toISOString().slice(0, 10),
  expiryDate: '',
  quantityRequired: 0,
  quantityReceived: 0,
  unit: 'items',
  imageUrl: ''
};

const resolveStatusPreview = (item = {}) => (item.needed === false ? 'Stock Available' : 'Required Soon');

const buildLangarPayload = (values) => {
  const quantityRequired = Number(values.quantityRequired || 0);
  const quantityReceived = Number(values.quantityReceived || 0);
  const needed = quantityReceived < quantityRequired;
  return {
    name: values.name,
    category: values.category,
    addedOn: values.addedOn,
    expiryDate: values.expiryDate,
    needed,
    stockStatus: needed ? 'required_soon' : 'stock_available',
    customStatusLabel: '',
    brand: String(values.brand || '').trim(),
    quantityRequired,
    quantityReceived,
    unit: String(values.unit || 'items').trim() || 'items',
    imageUrl: String(values.imageUrl || '').trim()
  };
};

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none transition focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20';
const labelClass = 'text-xs font-bold uppercase tracking-wide text-slate-500';
const formatShortDate = (value) => (value ? new Date(value).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-');
const datePillClass = 'inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight';

const StatusPill = ({ isReceived, onToggle, disabled }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold transition ${isReceived ? 'border-emerald-300 bg-emerald-100 text-emerald-800 hover:border-emerald-400' : 'border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400'} disabled:cursor-not-allowed disabled:opacity-60`}
  >
    <PowerIcon className="h-3.5 w-3.5" />
    {isReceived ? 'Received' : 'Pending'}
  </button>
);

const DropdownField = ({ label, value, options, onSelectChange, onAddCustomOption, placeholder, addOptionLabel, className = 'w-32', disabled = false }) => {
  const [addingCustom, setAddingCustom] = useState(false);
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (!trimmed) { setAddingCustom(false); return; }
    onAddCustomOption(trimmed);
    setDraft('');
    setAddingCustom(false);
  };

  return (
    <label className={`${labelClass} ${className}`}>{label}
      {addingCustom ? (
        <div className="mt-1 flex gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitDraft(); } }}
            placeholder={placeholder}
            className={inputClass}
          />
          <button type="button" onClick={commitDraft} className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white" aria-label="Save">
            <CheckIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <select
          disabled={disabled}
          value={value}
          onChange={(event) => {
            if (event.target.value === ADD_CUSTOM_VALUE) { setAddingCustom(true); return; }
            onSelectChange(event.target.value);
          }}
          className={`${inputClass} disabled:bg-slate-100`}
        >
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
          <option value={ADD_CUSTOM_VALUE}>{addOptionLabel}</option>
        </select>
      )}
    </label>
  );
};

const AdminLangarPage = () => {
  const { setHeaderAction } = useOutletContext();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [walkInDraft, setWalkInDraft] = useState({ itemId: '', itemName: '', category: 'Grocery', brand: '', quantity: '1', unit: 'items', donorName: '', receivedOn: new Date().toISOString().slice(0, 10), expiryDate: '', imageUrl: '' });
  const [walkInImageLookupPending, setWalkInImageLookupPending] = useState(false);
  const [walkInImageOptions, setWalkInImageOptions] = useState([]);
  const [viewItem, setViewItem] = useState(null);
  const [viewContributorsPage, setViewContributorsPage] = useState(1);
  const [editingItem, setEditingItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [page, setPage] = useState(1);

  const [commitmentStatusFilter, setCommitmentStatusFilter] = useState('all');
  const [commitmentItemFilter, setCommitmentItemFilter] = useState('all');
  const [commitmentPage, setCommitmentPage] = useState(1);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportDates, setReportDates] = useState(defaultReportDates);
  const [reportPage, setReportPage] = useState(1);
  const [customUnits, setCustomUnits] = useState(loadCustomUnits);
  const [customCategories, setCustomCategories] = useState(loadCustomCategories);
  const [customBrands, setCustomBrands] = useState(loadCustomBrands);

  const form = useForm({ defaultValues: defaultForm });
  const editForm = useForm({ defaultValues: defaultForm });
  const createName = form.watch('name');
  const editName = editForm.watch('name');
  const createUnit = form.watch('unit');
  const editUnit = editForm.watch('unit');
  const createCategory = form.watch('category');
  const editCategory = editForm.watch('category');
  const createBrand = form.watch('brand');
  const editBrand = editForm.watch('brand');
  const createImageUrl = form.watch('imageUrl');
  const editImageUrl = editForm.watch('imageUrl');
  const [createImageLookupPending, setCreateImageLookupPending] = useState(false);
  const [editImageLookupPending, setEditImageLookupPending] = useState(false);
  const [createImageOptions, setCreateImageOptions] = useState([]);
  const [editImageOptions, setEditImageOptions] = useState([]);

  const lookupItemImage = async (name, formToUpdate, setPending, setOptions) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    formToUpdate.setValue('imageUrl', '', { shouldDirty: true });
    setPending(true);
    try {
      const imageOptions = await searchGroceryImages(trimmed);
      const options = [...new Set(imageOptions.filter(Boolean))].slice(0, 10);
      setOptions(options);
    } finally {
      setPending(false);
    }
  };
  const lookupWalkInImage = async (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    setWalkInDraft((current) => ({ ...current, imageUrl: '' }));
    setWalkInImageLookupPending(true);
    try {
      setWalkInImageOptions([...new Set((await searchGroceryImages(trimmed)).filter(Boolean))].slice(0, 10));
    } finally {
      setWalkInImageLookupPending(false);
    }
  };
  const unitOptions = useMemo(() => [...new Set([...LANGAR_UNIT_OPTIONS, ...customUnits])], [customUnits]);
  const categoryFormOptions = useMemo(() => [...new Set([...LANGAR_CATEGORY_OPTIONS, ...customCategories])], [customCategories]);
  const brandFormOptions = useMemo(() => [...new Set(['Any brand', ...customBrands])], [customBrands]);

  const addCustomUnit = (unit, formToUpdate) => {
    const trimmed = unit.trim();
    if (!trimmed) return;
    setCustomUnits((prev) => {
      if (prev.includes(trimmed) || LANGAR_UNIT_OPTIONS.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveCustomUnits(next);
      return next;
    });
    formToUpdate.setValue('unit', trimmed);
  };

  const addCustomCategory = (category, formToUpdate) => {
    const trimmed = category.trim();
    if (!trimmed) return;
    setCustomCategories((prev) => {
      if (prev.includes(trimmed) || LANGAR_CATEGORY_OPTIONS.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveCustomCategories(next);
      return next;
    });
    formToUpdate.setValue('category', trimmed);
  };

  const addCustomBrand = (brand, formToUpdate) => {
    const trimmed = brand.trim();
    if (!trimmed) return;
    setCustomBrands((prev) => {
      if (prev.includes(trimmed)) return prev;
      const next = [...prev, trimmed];
      saveCustomBrands(next);
      return next;
    });
    formToUpdate.setValue('brand', trimmed);
  };

  const { data: cmsData } = useQuery({
    queryKey: ['cms-home'],
    queryFn: () => cmsService.getHomeContent().then((res) => res.data)
  });
  const { data: contributions = [] } = useQuery({
    queryKey: [LANGAR_CONTRIBUTIONS_RESOURCE, 'admin'],
    queryFn: () => langarService.getContributions().then((res) => res.data),
    refetchInterval: 15000
  });

  const langarItems = useMemo(() => cmsData?.langarItems || [], [cmsData?.langarItems]);

  const categoryOptions = useMemo(() => {
    const categories = langarItems
      .map((item) => String(item?.category || '').trim())
      .filter(Boolean);
    return [...new Set(categories)].sort((a, b) => a.localeCompare(b));
  }, [langarItems]);

  const filteredItems = useMemo(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    return langarItems.filter((item) => {
      const statusOk = statusFilter === 'all'
        ? true
        : statusFilter === 'required_soon'
          ? item.needed === true
          : item.needed !== true;
      const categoryOk = categoryFilter === 'all' ? true : String(item?.category || '') === categoryFilter;

      if (!statusOk || !categoryOk) {
        return false;
      }

      if (!query) {
        return true;
      }

      const haystack = [item?.name, item?.category, item?.stockStatus, item?.customStatusLabel]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(query);
    });
  }, [categoryFilter, langarItems, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / LANGAR_PAGE_SIZE));
  const visibleItems = useMemo(() => {
    const start = (page - 1) * LANGAR_PAGE_SIZE;
    return filteredItems.slice(start, start + LANGAR_PAGE_SIZE);
  }, [filteredItems, page]);

  const sortedContributions = useMemo(
    () => [...contributions].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
    [contributions]
  );

  const filteredCommitments = useMemo(() => sortedContributions.filter((entry) => {
    const statusOk = commitmentStatusFilter === 'all' ? true : String(entry.status || 'pending') === commitmentStatusFilter;
    const itemOk = commitmentItemFilter === 'all' ? true : String(entry.itemName || '') === commitmentItemFilter;
    return statusOk && itemOk;
  }), [sortedContributions, commitmentStatusFilter, commitmentItemFilter]);

  const commitmentItemOptions = useMemo(
    () => [...new Set(sortedContributions.map((entry) => entry.itemName).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [sortedContributions]
  );

  const totalCommitmentPages = Math.max(1, Math.ceil(filteredCommitments.length / COMMITMENTS_PAGE_SIZE));
  const visibleCommitments = useMemo(() => {
    const start = (commitmentPage - 1) * COMMITMENTS_PAGE_SIZE;
    return filteredCommitments.slice(start, start + COMMITMENTS_PAGE_SIZE);
  }, [filteredCommitments, commitmentPage]);

  const viewItemContributions = useMemo(() => {
    if (!viewItem) return [];
    return sortedContributions.filter((entry) => String(entry.itemId || '') === String(viewItem.id));
  }, [sortedContributions, viewItem]);
  const totalViewContributorPages = Math.max(1, Math.ceil(viewItemContributions.length / VIEW_CONTRIBUTORS_PAGE_SIZE));
  const visibleViewContributions = useMemo(() => {
    const start = (viewContributorsPage - 1) * VIEW_CONTRIBUTORS_PAGE_SIZE;
    return viewItemContributions.slice(start, start + VIEW_CONTRIBUTORS_PAGE_SIZE);
  }, [viewItemContributions, viewContributorsPage]);

  const reportRows = useMemo(() => {
    const startTime = reportDates.start ? new Date(`${reportDates.start}T00:00:00`).getTime() : -Infinity;
    const endTime = reportDates.end ? new Date(`${reportDates.end}T23:59:59`).getTime() : Infinity;
    return sortedContributions.filter((entry) => {
      if (String(entry.status || '').toLowerCase() !== 'received') return false;
      const createdTime = new Date(entry.createdAt || 0).getTime();
      return createdTime >= startTime && createdTime <= endTime;
    });
  }, [sortedContributions, reportDates]);

  const reportGrandTotal = useMemo(() => reportRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0), [reportRows]);
  const totalReportPages = Math.max(1, Math.ceil(reportRows.length / COMMITMENTS_PAGE_SIZE));
  const visibleReportRows = useMemo(() => {
    const start = (reportPage - 1) * COMMITMENTS_PAGE_SIZE;
    return reportRows.slice(start, start + COMMITMENTS_PAGE_SIZE);
  }, [reportPage, reportRows]);

  const addMutation = useMutation({
    mutationFn: (values) => cmsService.addLangarItem(buildLangarPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      form.reset(defaultForm);
      setCreateImageOptions([]);
      setCreateOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }) => cmsService.updateLangarItem(id, buildLangarPayload(values)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      setEditImageOptions([]);
      setEditingItem(null);
    }
  });

  const walkInReceiptMutation = useMutation({
    mutationFn: async (draft) => {
      const quantity = Number(draft.quantity || 0);
      if (!(quantity > 0)) throw new Error('Enter a quantity greater than zero.');
      const receivedAt = new Date().toISOString();
      const receipt = {
        id: `walk-in-${Date.now()}`,
        quantity,
        unit: draft.unit || 'items',
        donorName: String(draft.donorName || '').trim(),
        receivedAt: draft.receivedOn ? new Date(`${draft.receivedOn}T12:00:00`).toISOString() : receivedAt,
        expiryDate: String(draft.expiryDate || '').trim(),
        imageUrl: String(draft.imageUrl || '').trim()
      };
      const existing = langarItems.find((item) => String(item.id) === String(draft.itemId));
      if (existing) {
        const quantityReceived = Number(existing.quantityReceived || 0) + quantity;
        const quantityRequired = Number(existing.quantityRequired || 0);
        return cmsService.updateLangarItem(existing.id, {
          ...existing,
          quantityReceived,
          imageUrl: receipt.imageUrl || existing.imageUrl,
          needed: quantityReceived < quantityRequired,
          stockStatus: quantityReceived < quantityRequired ? 'required_soon' : 'stock_available',
          walkInReceipts: [...(Array.isArray(existing.walkInReceipts) ? existing.walkInReceipts : []), receipt]
        });
      }
      const itemName = String(draft.itemName || '').trim();
      if (!itemName) throw new Error('Enter the name of the unlisted grocery item.');
      if (!receipt.imageUrl) throw new Error('Select an image for the grocery item.');
      return cmsService.addLangarItem({
        name: itemName,
        category: String(draft.category || 'Grocery').trim(),
        brand: String(draft.brand || '').trim(),
        addedOn: draft.receivedOn || receivedAt.slice(0, 10),
        expiryDate: receipt.expiryDate,
        quantityRequired: 0,
        quantityReceived: quantity,
        needed: false,
        stockStatus: 'stock_available',
        unit: draft.unit || 'items',
        imageUrl: receipt.imageUrl,
        walkInReceipts: [receipt]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      setWalkInOpen(false);
      setWalkInDraft({ itemId: '', itemName: '', category: 'Grocery', brand: '', quantity: '1', unit: 'items', donorName: '', receivedOn: new Date().toISOString().slice(0, 10), expiryDate: '', imageUrl: '' });
      setWalkInImageOptions([]);
    }
  });

  const removeMutation = useMutation({
    mutationFn: (id) => cmsService.removeLangarItem(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
      setViewItem((prev) => (prev?.id === id ? null : prev));
      setEditingItem((prev) => (prev?.id === id ? null : prev));
    }
  });

  const contributionStatusMutation = useMutation({
    mutationFn: ({ id, status }) => contentApiService.update(LANGAR_CONTRIBUTIONS_RESOURCE, id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LANGAR_CONTRIBUTIONS_RESOURCE, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
    }
  });

  const contributionDeleteMutation = useMutation({
    mutationFn: (id) => langarService.deleteContribution(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [LANGAR_CONTRIBUTIONS_RESOURCE, 'admin'] });
      queryClient.invalidateQueries({ queryKey: ['cms-home'] });
    }
  });

  const openEdit = (item) => {
    setEditImageOptions([]);
    setEditImageLookupPending(false);
    setEditingItem(item);
    editForm.reset({
      name: item.name,
      category: item.category || 'Grocery',
      brand: item.brand || '',
      addedOn: item.addedOn || '',
      expiryDate: item.expiryDate || '',
      quantityRequired: item.quantityRequired || 0,
      quantityReceived: item.quantityReceived || 0,
      unit: item.unit || 'items',
      imageUrl: item.imageUrl || ''
    });
  };

  const openCreate = useCallback(() => {
    form.reset(defaultForm);
    setCreateImageOptions([]);
    setCreateImageLookupPending(false);
    setCreateOpen(true);
  }, [form]);

  const openView = (item) => {
    setViewItem(item);
    setViewContributorsPage(1);
  };

  const closeModals = () => {
    setCreateOpen(false);
    setViewItem(null);
    setEditingItem(null);
    setCreateImageOptions([]);
    setEditImageOptions([]);
    setCreateImageLookupPending(false);
    setEditImageLookupPending(false);
  };

  const applyReportPreset = (days) => {
    const today = new Date();
    const from = new Date(today.getTime() - (days * 24 * 60 * 60 * 1000));
    setReportDates({ start: toDateInputValue(from), end: toDateInputValue(today) });
  };

  const buildReportRowsForExport = () => reportRows.map((entry) => ({
    itemName: entry.itemName || '-',
    donorName: entry.anonymous ? 'Anonymous' : (entry.donorName || 'Member'),
    quantity: entry.quantity,
    unit: entry.unit,
    receivedDate: entry.updatedAt ? formatShortDate(entry.updatedAt) : '-',
    createdDate: entry.createdAt ? formatShortDate(entry.createdAt) : '-',
    expectedDate: entry.expectedDeliveryDate ? formatShortDate(entry.expectedDeliveryDate) : '-'
  }));

  const downloadReport = async (format) => {
    const periodLabel = `${formatShortDate(reportDates.start)} – ${formatShortDate(reportDates.end)}`;
    const rows = buildReportRowsForExport();
    if (format === 'pdf') {
      await downloadLangarReceivedReportPdf({ organizationName: siteConfig.name, periodLabel, rows, fileName: `langar-items-received-${reportDates.start}-to-${reportDates.end}.pdf` });
      return;
    }
    downloadLangarReceivedReportCsv({ organizationName: siteConfig.name, periodLabel, rows, fileName: `langar-items-received-${reportDates.start}-to-${reportDates.end}.csv` });
  };

  useEffect(() => {
    setHeaderAction(<AdminHeaderActionButton label="Add New Seva Item" onClick={openCreate} />);

    return () => setHeaderAction(null);
  }, [openCreate, setHeaderAction]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, categoryFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    setCommitmentPage(1);
  }, [commitmentStatusFilter, commitmentItemFilter]);

  useEffect(() => {
    setReportPage(1);
  }, [reportDates]);

  useEffect(() => {
    if (commitmentPage > totalCommitmentPages) {
      setCommitmentPage(totalCommitmentPages);
    }
  }, [commitmentPage, totalCommitmentPages]);

  useEffect(() => {
    if (reportPage > totalReportPages) {
      setReportPage(totalReportPages);
    }
  }, [reportPage, totalReportPages]);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Seva Items</h1>

      <Card>
        <div className="admin-card-header-row flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-brand-blue">Langar Commitments</h2>
            <p className="mt-1 text-xs text-slate-500">Review contributor commitments and mark supplies received.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{filteredCommitments.length} of {contributions.length} total</span>
            <Button type="button" onClick={() => setReportOpen(true)} className="rounded-full bg-brand-blue px-3.5 py-1.5 text-xs text-white hover:bg-blue-800">
              <ArrowDownTrayIcon className="mr-1.5 h-3.5 w-3.5" /> Download Report
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className={labelClass}>Status
            <select value={commitmentStatusFilter} onChange={(event) => setCommitmentStatusFilter(event.target.value)} className={inputClass}>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="received">Received</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className={labelClass}>Item
            <select value={commitmentItemFilter} onChange={(event) => setCommitmentItemFilter(event.target.value)} className={inputClass}>
              <option value="all">All items</option>
              {commitmentItemOptions.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-x-auto">
          {filteredCommitments.length > 0 ? (
            <table className="langar-commitments-table min-w-full text-left text-sm">
              <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Contributed For</th>
                <th className="py-2 pr-3">Quantity</th>
                <th className="py-2 pr-3">Dates</th>
                <th className="py-2 pr-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleCommitments.map((entry) => {
                const isReceived = String(entry.status || 'pending') === 'received';
                return (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-semibold text-slate-800">{entry.anonymous ? 'Anonymous' : entry.donorName}</td>
                    <td className="py-2 pr-3 text-slate-700">{entry.itemName}</td>
                    <td className="py-2 pr-3 font-bold text-slate-800">{entry.quantity} {entry.unit}</td>
                    <td className="py-2 pr-3">
                      <div className="mb-3 flex flex-wrap gap-1 pt-2">
                        <span className={`${datePillClass} bg-violet-100 text-violet-800`}>Committed {entry.createdAt ? formatShortDate(entry.createdAt) : '-'}</span>
                        {entry.expectedDeliveryDate ? <span className={`${datePillClass} bg-amber-100 text-amber-800`}>Expected {formatShortDate(entry.expectedDeliveryDate)}</span> : null}
                        {isReceived && entry.updatedAt ? <span className={`${datePillClass} bg-emerald-100 text-emerald-800`}>Received {formatShortDate(entry.updatedAt)}</span> : null}
                      </div>
                    </td>
                    <td className="border-t border-slate-200 py-2 pr-3">
                      <div className="flex flex-nowrap items-center gap-2">
                        <StatusPill
                          isReceived={isReceived}
                          disabled={contributionStatusMutation.isPending}
                          onToggle={() => contributionStatusMutation.mutate({ id: entry.id, status: isReceived ? 'pending' : 'received' })}
                        />
                        <button
                          type="button"
                          onClick={() => { if (window.confirm('Delete this Langar commitment?')) contributionDeleteMutation.mutate(entry.id); }}
                          disabled={contributionDeleteMutation.isPending}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 hover:bg-red-100 hover:text-red-900 disabled:opacity-50"
                          title="Delete commitment"
                          aria-label="Delete commitment"
                        >
                          <TrashIcon className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            </table>
          ) : (
            <p className="whitespace-nowrap py-4 text-center text-sm text-slate-500">No Langar commitments found.</p>
          )}
        </div>
        {filteredCommitments.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">Showing {visibleCommitments.length} of {filteredCommitments.length} commitments</p>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={commitmentPage <= 1} onClick={() => setCommitmentPage((prev) => prev - 1)}>Prev</button>
              <span className="text-xs font-semibold text-slate-600">Page {commitmentPage} of {totalCommitmentPages}</span>
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={commitmentPage >= totalCommitmentPages} onClick={() => setCommitmentPage((prev) => prev + 1)}>Next</button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
          <div><p className="text-sm font-bold text-emerald-900">Unplanned grocery drop-off?</p><p className="text-xs text-emerald-800">Record items brought in without a prior commitment. Stock is updated directly—no donor commitment is created.</p></div>
          <Button type="button" onClick={() => { setWalkInDraft({ itemId: '', itemName: '', category: 'Grocery', brand: '', quantity: '1', unit: 'items', donorName: '', receivedOn: new Date().toISOString().slice(0, 10), expiryDate: '', imageUrl: '' }); setWalkInImageOptions([]); setWalkInImageLookupPending(false); setWalkInOpen(true); }} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-800">Record Walk-in Arrival</Button>
        </div>
        <div className="mb-4 grid gap-2 md:grid-cols-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
            Search
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search item name or category"
              className={inputClass}
            />
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">All</option>
              <option value="required_soon">Required Soon</option>
              <option value="stock_available">Stock Available</option>
            </select>
          </label>
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className={inputClass}
            >
              <option value="all">All</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Item</th>
                <th className="py-2 pr-3">Category</th>
                <th className="py-2 pr-3">Brand</th>
                <th className="py-2 pr-3">Added</th>
                <th className="py-2 pr-3">Expiry</th>
                <th className="py-2 pr-3">Received</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-semibold text-slate-800">
                    <div className="flex items-center gap-2">
                      <img src={item.imageUrl || resolveGroceryImage(item.name)} alt="" className="hidden h-9 w-9 shrink-0 rounded-lg object-cover sm:block" />
                      <div className="space-y-1.5 lg:hidden">
                        <p className="text-sm font-bold leading-tight text-slate-800">{item.name || '-'}</p>
                        <p className="text-[12px] leading-snug text-slate-600">{item.category || 'Grocery'}</p>
                        {item.brand ? <p className="text-[12px] leading-snug text-slate-600">{item.brand}</p> : null}
                        <div className="flex max-w-full flex-wrap gap-1">
                          <span className={`${datePillClass} bg-sky-100 text-sky-800`}>Added {item.addedOn || '-'}</span>
                          {item.expiryDate ? <span className={`${datePillClass} bg-amber-100 text-amber-800`}>Expiry {item.expiryDate}</span> : null}
                        </div>
                        <div className="pt-0.5">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.needed ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                            {resolveStatusPreview(item)}
                          </span>
                        </div>
                      </div>
                      <span className="hidden lg:inline">{item.name || '-'}</span>
                    </div>
                  </td>
                  <td className="admin-langar-mobile-hidden py-2 pr-3">{item.category || 'Grocery'}</td>
                  <td className="admin-langar-mobile-hidden py-2 pr-3">{item.brand || '-'}</td>
                  <td className="admin-langar-mobile-hidden py-2 pr-3">{item.addedOn || '-'}</td>
                  <td className="admin-langar-mobile-hidden py-2 pr-3">{item.expiryDate || '-'}</td>
                  <td className="admin-langar-mobile-hidden py-2 pr-3">
                    {Number(item.quantityReceived || 0)} / {Number(item.quantityRequired || 0)} {item.unit || 'items'}
                  </td>
                  <td className="admin-langar-mobile-hidden py-2 pr-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${item.needed ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                      {resolveStatusPreview(item)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openView(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100"
                        title="View"
                        aria-label="View"
                      >
                        <EyeIcon className={actionIconClass} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                        title="Edit"
                        aria-label="Edit"
                      >
                        <PencilSquareIcon className={actionIconClass} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(item.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                        title="Delete"
                        aria-label="Delete"
                      >
                        <TrashIcon className={actionIconClass} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 ? (
                <tr>
                  <td className="py-4 text-center text-slate-500" colSpan={8}>No seva items found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filteredItems.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">Showing {visibleItems.length} of {filteredItems.length} seva items</p>
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

      {walkInOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" onClick={() => setWalkInOpen(false)}>
          <form className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onSubmit={(event) => { event.preventDefault(); walkInReceiptMutation.mutate(walkInDraft); }} onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-emerald-700 to-teal-700 px-5 py-4 text-white"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-100">Inventory only · no commitment</p><h3 className="font-heading text-xl font-semibold">Record Grocery Arrival</h3></div><button type="button" onClick={() => setWalkInOpen(false)} className="rounded-full border border-white/40 p-1.5 hover:bg-white/10" aria-label="Close arrival dialog"><XMarkIcon className="h-4 w-4" /></button></div>
            <div className="max-h-[calc(100vh-9rem)] space-y-4 overflow-y-auto p-5">
              {walkInReceiptMutation.error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{walkInReceiptMutation.error.message}</p> : null}
              <label className={labelClass}>Match a listed need (optional)
                <select value={walkInDraft.itemId} onChange={(event) => {
                  const item = langarItems.find((entry) => String(entry.id) === event.target.value);
                  const imageUrl = item?.imageUrl || '';
                  setWalkInDraft((current) => ({ ...current, itemId: event.target.value, itemName: item?.name || '', category: item?.category || current.category, brand: item?.brand || '', unit: item?.unit || current.unit, imageUrl }));
                  setWalkInImageOptions(imageUrl ? [imageUrl] : []);
                  setWalkInImageLookupPending(false);
                  if (item && !imageUrl) lookupWalkInImage(item.name);
                }} className={inputClass}>
                  <option value="">Unlisted item / create inventory record</option>
                  {langarItems.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.quantityReceived || 0)} received / {Number(item.quantityRequired || 0)} needed</option>)}
                </select>
              </label>
              {walkInDraft.itemId ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">This arrival increases the selected item’s received stock. Arrival details and donor name are stored separately from online commitments.</p> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelClass}>Item name<input required disabled={Boolean(walkInDraft.itemId)} value={walkInDraft.itemName} onChange={(event) => setWalkInDraft((current) => ({ ...current, itemName: event.target.value, imageUrl: '' }))} onBlur={(event) => { if (!walkInDraft.itemId && event.target.value.trim()) lookupWalkInImage(event.target.value); }} placeholder="e.g. Rice" className={`${inputClass} disabled:bg-slate-100`} /></label>
                <label className={labelClass}>Category<select disabled={Boolean(walkInDraft.itemId)} value={walkInDraft.category} onChange={(event) => setWalkInDraft((current) => ({ ...current, category: event.target.value }))} className={`${inputClass} disabled:bg-slate-100`}>{categoryFormOptions.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                <img src={walkInDraft.imageUrl || resolveGroceryImage(walkInDraft.itemName) || undefined} alt="Selected grocery" className="h-16 w-16 shrink-0 rounded-lg border border-slate-200 bg-white object-cover" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }} />
                <div className="min-w-0 flex-1"><p className="text-xs text-slate-600">{walkInImageLookupPending ? 'Looking up grocery images…' : walkInImageOptions.length ? 'Choose an image for this item.' : 'Enter the item name, then choose an image.'}</p>
                  {walkInImageOptions.length ? <div className="mt-2 grid grid-cols-5 gap-1.5">{walkInImageOptions.map((imageUrl, index) => <button key={`${imageUrl}-${index}`} type="button" onClick={() => setWalkInDraft((current) => ({ ...current, imageUrl }))} className={`overflow-hidden rounded-md border-2 ${walkInDraft.imageUrl === imageUrl ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-slate-200'}`} aria-label={`Select grocery image ${index + 1}`}><img src={imageUrl} alt="" className="h-11 w-full object-cover" /></button>)}</div> : null}
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {!walkInDraft.itemId ? <label className={labelClass}>Brand (optional)<input value={walkInDraft.brand} onChange={(event) => setWalkInDraft((current) => ({ ...current, brand: event.target.value }))} placeholder="e.g. Any brand" className={inputClass} /></label> : null}
                <label className={labelClass}>Donated by (optional)<input value={walkInDraft.donorName} onChange={(event) => setWalkInDraft((current) => ({ ...current, donorName: event.target.value }))} placeholder="Name for internal records" className={inputClass} /></label>
                <label className={labelClass}>Quantity received<input type="number" min="0.01" step="0.01" required value={walkInDraft.quantity} onChange={(event) => setWalkInDraft((current) => ({ ...current, quantity: event.target.value }))} className={inputClass} /></label>
                <DropdownField
                  label="Unit"
                  className="w-full"
                  value={walkInDraft.unit}
                  options={[...new Set([...unitOptions, walkInDraft.unit].filter(Boolean))]}
                  onSelectChange={(unit) => setWalkInDraft((current) => ({ ...current, unit }))}
                  onAddCustomOption={(unit) => addCustomUnit(unit, { setValue: (value) => setWalkInDraft((current) => ({ ...current, unit: value })) })}
                  placeholder="e.g. bags"
                  addOptionLabel="+ Add custom unit…"
                  disabled={Boolean(walkInDraft.itemId)}
                />
                <label className={labelClass}>Received date<input type="date" required value={walkInDraft.receivedOn} onChange={(event) => setWalkInDraft((current) => ({ ...current, receivedOn: event.target.value }))} className={inputClass} /></label>
                <label className={labelClass}>Expiry date (optional)<input type="date" value={walkInDraft.expiryDate} onChange={(event) => setWalkInDraft((current) => ({ ...current, expiryDate: event.target.value }))} className={inputClass} /></label>
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><Button type="button" variant="ghost" onClick={() => setWalkInOpen(false)}>Cancel</Button><Button type="submit" disabled={walkInReceiptMutation.isPending || walkInImageLookupPending || !walkInDraft.imageUrl} className="bg-emerald-700 text-white hover:bg-emerald-800">{walkInReceiptMutation.isPending ? 'Recording…' : 'Record Arrival'}</Button></div>
            </div>
          </form>
        </div>
      ) : null}

      {createOpen ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-4 py-6">
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-brand-blue/20 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-r from-brand-blue to-blue-700 px-5 py-4">
                <h3 className="font-heading text-xl font-semibold text-white">Add Seva Item</h3>
                <button type="button" className="rounded-full border border-white/40 p-1.5 text-white hover:bg-white/10" onClick={closeModals} aria-label="Close">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <form className="space-y-4 p-5" onSubmit={form.handleSubmit((values) => addMutation.mutate(values))}>
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                  <img src={createImageUrl || resolveGroceryImage(createName) || undefined} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }} />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{createImageLookupPending ? 'Looking up images for this item…' : createImageOptions.length ? 'Choose one image to continue.' : 'Image selection is required.'}</p>
                    {createImageOptions.length > 0 ? (
                      <div className="mt-2 grid grid-cols-5 gap-1.5">
                        {createImageOptions.map((imageUrl, index) => (
                          <button key={imageUrl} type="button" onClick={() => form.setValue('imageUrl', imageUrl, { shouldDirty: true })} className={`overflow-hidden rounded-md border-2 ${createImageUrl === imageUrl ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-slate-200'}`} aria-label={`Select image ${index + 1}`}>
                            <img src={imageUrl} alt="" className="h-10 w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <label className={labelClass}>Item Name
                  <input {...form.register('name', { required: true })} required className={inputClass} onBlur={(event) => { form.register('name').onBlur(event); lookupItemImage(event.target.value, form, setCreateImageLookupPending, setCreateImageOptions); }} />
                </label>
                <DropdownField
                  label="Category"
                  className="w-full"
                  value={createCategory}
                  options={categoryFormOptions}
                  onSelectChange={(value) => form.setValue('category', value)}
                  onAddCustomOption={(category) => addCustomCategory(category, form)}
                  placeholder="e.g. Beverages"
                  addOptionLabel="+ Add custom category…"
                />
                <DropdownField
                  label="Brand"
                  className="w-full"
                  value={createBrand || 'Any brand'}
                  options={brandFormOptions}
                  onSelectChange={(value) => form.setValue('brand', value === 'Any brand' ? '' : value)}
                  onAddCustomOption={(brand) => addCustomBrand(brand, form)}
                  placeholder="e.g. Nestlé"
                  addOptionLabel="+ Add custom brand…"
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>Added Date
                    <input type="date" {...form.register('addedOn', { required: true })} required className={inputClass} />
                  </label>
                  <label className={labelClass}>Expiry Date <span className="font-normal normal-case text-slate-400">(optional)</span>
                    <input type="date" {...form.register('expiryDate')} className={inputClass} />
                  </label>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <label className={labelClass}>Quantity Needed
                    <input type="number" min="0" step="0.01" {...form.register('quantityRequired', { valueAsNumber: true })} className={inputClass} />
                  </label>
                  <DropdownField
                    label="Unit"
                    value={createUnit}
                    options={unitOptions}
                    onSelectChange={(value) => form.setValue('unit', value)}
                    onAddCustomOption={(unit) => addCustomUnit(unit, form)}
                    placeholder="e.g. bags"
                    addOptionLabel="+ Add custom unit…"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={addMutation.isPending || !createImageUrl}>{addMutation.isPending ? 'Saving...' : 'Create Item'}</Button>
                  <Button type="button" variant="ghost" onClick={closeModals}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {viewItem ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-4 py-6">
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-4xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-brand-blue/20 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-r from-brand-blue to-blue-700 px-5 py-4">
                <h3 className="font-heading text-xl font-semibold text-white">Seva Item Details</h3>
                <button type="button" className="rounded-full border border-white/40 p-1.5 text-white hover:bg-white/10" onClick={closeModals} aria-label="Close">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="grid gap-5 p-5 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-3">
                    <img src={viewItem.imageUrl || resolveGroceryImage(viewItem.name)} alt="" className="h-16 w-16 shrink-0 rounded-xl border border-slate-200 object-cover" />
                    <div>
                      <p className="font-heading text-lg font-bold text-slate-900">{viewItem.name || '-'}</p>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${viewItem.needed ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{resolveStatusPreview(viewItem)}</span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-brand-blue">Category</span>
                      <span className="truncate text-sm text-slate-800">{viewItem.category || '-'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 px-3 py-2">
                      <span className={`${datePillClass} bg-sky-100 text-sky-800`}>Added {viewItem.addedOn || '-'}</span>
                      {viewItem.expiryDate ? <span className={`${datePillClass} bg-amber-100 text-amber-800`}>Expiry {viewItem.expiryDate}</span> : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-brand-blue">Quantity</span>
                      <span className="truncate text-sm text-slate-800">{Number(viewItem.quantityReceived || 0)} / {Number(viewItem.quantityRequired || 0)} {viewItem.unit || 'items'}</span>
                    </div>
                    {(viewItem.walkInReceipts || []).length > 0 ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Walk-in arrivals · no online commitment</p><div className="mt-2 space-y-2">{[...viewItem.walkInReceipts].reverse().map((receipt) => <div key={receipt.id} className="rounded-lg border border-emerald-100 bg-white/80 p-2"><p className="text-sm font-semibold text-emerald-950">{receipt.quantity} {receipt.unit || viewItem.unit || 'items'}{receipt.donorName ? ` · Donated by ${receipt.donorName}` : ' · Donor not recorded'}</p><p className="mt-0.5 text-[11px] text-emerald-800">Received {receipt.receivedAt ? formatShortDate(receipt.receivedAt) : '-'}{receipt.expiryDate ? ` · Expires ${receipt.expiryDate}` : ''}</p></div>)}</div></div> : null}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                      <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-brand-blue">Status</span>
                      <span className="truncate text-sm font-bold text-brand-saffron">{resolveStatusPreview(viewItem)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="font-heading text-lg font-bold text-slate-900">Contributors</p>
                  <p className="text-xs text-slate-500">People who committed to this item.</p>
                  <div className="mt-3 border-t border-slate-200 pt-3 space-y-2">
                    {visibleViewContributions.map((entry) => (
                      <div key={entry.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-800">{entry.anonymous ? 'Anonymous' : entry.donorName}</p>
                          <p className="truncate text-xs text-slate-500">{entry.quantity} {entry.unit}</p>
                          <div className="mt-1 flex flex-wrap gap-1"><span className={`${datePillClass} bg-violet-100 text-violet-800`}>Committed {entry.createdAt ? formatShortDate(entry.createdAt) : '-'}</span><span className={`${datePillClass} bg-emerald-100 text-emerald-800`}>Received {entry.updatedAt ? formatShortDate(entry.updatedAt) : '-'}</span></div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.status === 'received' ? 'bg-emerald-100 text-emerald-700' : entry.status === 'cancelled' ? 'bg-slate-200 text-slate-600' : 'bg-amber-100 text-amber-800'}`}>{entry.status === 'received' ? 'Received' : entry.status === 'cancelled' ? 'Cancelled' : 'Pending'}</span>
                      </div>
                    ))}
                    {viewItemContributions.length === 0 ? (
                      <p className="py-4 text-center text-sm text-slate-500">No contributions yet for this item.</p>
                    ) : null}
                  </div>
                  {viewItemContributions.length > 0 ? (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={viewContributorsPage <= 1} onClick={() => setViewContributorsPage((prev) => prev - 1)}>Prev</button>
                      <span className="text-xs font-semibold text-slate-600">Page {viewContributorsPage} of {totalViewContributorPages}</span>
                      <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={viewContributorsPage >= totalViewContributorPages} onClick={() => setViewContributorsPage((prev) => prev + 1)}>Next</button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editingItem ? (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-slate-900/45 px-4 py-6">
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-brand-blue/20 bg-white shadow-xl">
              <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-r from-brand-blue to-blue-700 px-5 py-4">
                <h3 className="font-heading text-xl font-semibold text-white">Edit Seva Item</h3>
                <button type="button" className="rounded-full border border-white/40 p-1.5 text-white hover:bg-white/10" onClick={closeModals} aria-label="Close">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <form className="space-y-4 p-5" onSubmit={editForm.handleSubmit((values) => updateMutation.mutate({ id: editingItem.id, values }))}>
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
                  <img src={editImageUrl || resolveGroceryImage(editName) || undefined} alt="" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }} />
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500">{editImageLookupPending ? 'Looking up images for this item…' : editImageOptions.length ? 'Choose one image to continue.' : 'Image selection is required.'}</p>
                    {editImageOptions.length > 0 ? (
                      <div className="mt-2 grid grid-cols-5 gap-1.5">
                        {editImageOptions.map((imageUrl, index) => (
                          <button key={imageUrl} type="button" onClick={() => editForm.setValue('imageUrl', imageUrl, { shouldDirty: true })} className={`overflow-hidden rounded-md border-2 ${editImageUrl === imageUrl ? 'border-brand-blue ring-2 ring-brand-blue/20' : 'border-slate-200'}`} aria-label={`Select image ${index + 1}`}>
                            <img src={imageUrl} alt="" className="h-10 w-full object-cover" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <label className={labelClass}>Item Name
                  <input {...editForm.register('name', { required: true })} required className={inputClass} onBlur={(event) => { editForm.register('name').onBlur(event); lookupItemImage(event.target.value, editForm, setEditImageLookupPending, setEditImageOptions); }} />
                </label>
                <DropdownField
                  label="Category"
                  className="w-full"
                  value={editCategory}
                  options={categoryFormOptions}
                  onSelectChange={(value) => editForm.setValue('category', value)}
                  onAddCustomOption={(category) => addCustomCategory(category, editForm)}
                  placeholder="e.g. Beverages"
                  addOptionLabel="+ Add custom category…"
                />
                <DropdownField
                  label="Brand"
                  className="w-full"
                  value={editBrand || 'Any brand'}
                  options={brandFormOptions}
                  onSelectChange={(value) => editForm.setValue('brand', value === 'Any brand' ? '' : value)}
                  onAddCustomOption={(brand) => addCustomBrand(brand, editForm)}
                  placeholder="e.g. Nestlé"
                  addOptionLabel="+ Add custom brand…"
                />
                <div className="grid grid-cols-2 gap-3">
                  <label className={labelClass}>Added Date
                    <input type="date" {...editForm.register('addedOn', { required: true })} required className={inputClass} />
                  </label>
                  <label className={labelClass}>Expiry Date <span className="font-normal normal-case text-slate-400">(optional)</span>
                    <input type="date" {...editForm.register('expiryDate')} className={inputClass} />
                  </label>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-3">
                  <label className={labelClass}>Quantity Needed
                    <input type="number" min="0" step="0.01" {...editForm.register('quantityRequired', { valueAsNumber: true })} className={inputClass} />
                  </label>
                  <DropdownField
                    label="Unit"
                    value={editUnit}
                    options={unitOptions}
                    onSelectChange={(value) => editForm.setValue('unit', value)}
                    onAddCustomOption={(unit) => addCustomUnit(unit, editForm)}
                    placeholder="e.g. bags"
                    addOptionLabel="+ Add custom unit…"
                  />
                </div>
                <label className={labelClass}>Quantity Received
                  <input type="number" readOnly disabled {...editForm.register('quantityReceived', { valueAsNumber: true })} className={`${inputClass} cursor-not-allowed bg-slate-100 text-slate-500`} />
                </label>
                <div className="flex gap-2 pt-2">
                  <Button type="submit" disabled={updateMutation.isPending || !editImageUrl}>{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</Button>
                  <Button type="button" variant="ghost" onClick={closeModals}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {reportOpen ? (
        <div className="fixed inset-0 z-[96] overflow-y-auto bg-slate-900/45 px-4 py-6" onClick={() => setReportOpen(false)}>
          <div className="mx-auto flex min-h-full items-center justify-center">
            <div className="w-full max-w-3xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-brand-blue/20 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 rounded-t-2xl bg-gradient-to-r from-brand-blue to-blue-700 px-5 py-4">
                <div className="flex items-center gap-2 text-white">
                  <ArrowDownTrayIcon className="h-5 w-5" />
                  <h3 className="font-heading text-xl font-semibold">Langar Items Received Report</h3>
                </div>
                <button type="button" className="rounded-full border border-white/40 p-1.5 text-white hover:bg-white/10" onClick={() => setReportOpen(false)} aria-label="Close">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0 space-y-4 p-3 sm:p-5">
                <div className="space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><FunnelIcon className="h-4 w-4 text-slate-400" />Quick range:</span>
                  <div className="flex flex-wrap gap-2 pb-1">
                    {REPORT_PRESETS.map((preset) => (
                      <button key={preset.value} type="button" onClick={() => applyReportPreset(preset.days)} className="shrink-0 whitespace-nowrap rounded-full border border-brand-blue/30 bg-blue-50 px-3 py-1 text-xs font-bold text-brand-blue hover:bg-blue-100">
                        Past {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}><CalendarDaysIcon className="mr-1 inline h-3.5 w-3.5" />Start Date
                    <input type="date" value={reportDates.start} onChange={(event) => setReportDates((prev) => ({ ...prev, start: event.target.value }))} className={inputClass} />
                  </label>
                  <label className={labelClass}><CalendarDaysIcon className="mr-1 inline h-3.5 w-3.5" />End Date
                    <input type="date" value={reportDates.end} onChange={(event) => setReportDates((prev) => ({ ...prev, end: event.target.value }))} className={inputClass} />
                  </label>
                </div>
                <div className="flex min-w-0 items-stretch gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-slate-600">
                  <div className="flex shrink-0 flex-col justify-between py-0.5">
                    <ClockIcon className="h-4 w-4 text-brand-blue" />
                    <CheckCircleIcon className="h-3.5 w-3.5 text-emerald-600" />
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="break-words">Showing {reportRows.length} received commitment{reportRows.length === 1 ? '' : 's'}.</p>
                    <hr className="my-1.5 border-sky-200" />
                    <p className="flex flex-wrap items-center gap-1 break-words">Total received: <strong className="text-brand-blue">{reportGrandTotal}</strong> units.</p>
                    <p className="break-words">Report period: {formatShortDate(reportDates.start)} to {formatShortDate(reportDates.end)}.</p>
                  </div>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  <table className="langar-report-table w-full table-fixed !text-left text-xs sm:text-sm" style={{ textAlign: 'left' }}>
                    <thead className="sticky top-0">
                      <tr className="border-b border-slate-200 bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                        <th className="w-[28%] px-2 py-2 !text-left sm:px-3">Item</th>
                        <th className="w-[30%] px-2 py-2 !text-left sm:px-3">Dates</th>
                        <th className="w-[42%] px-2 py-2 !text-left sm:px-3">User</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleReportRows.map((entry, index) => (
                        <tr key={entry.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'} !text-left`} style={{ textAlign: 'left' }}>
                          <td className="break-words px-2 py-2 !text-left text-base font-bold text-slate-900 sm:px-3" style={{ textAlign: 'left' }}>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{entry.itemName}</span>
                              <span className={`${datePillClass} bg-blue-100 text-brand-blue`}>Committed: {entry.quantity} {entry.unit}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 !text-left text-slate-700 sm:px-3" style={{ textAlign: 'left' }}>
                            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-2">
                              <span className={`${datePillClass} bg-emerald-100 text-emerald-800`}>Received {entry.updatedAt ? formatShortDate(entry.updatedAt) : '-'}</span>
                              <span className={`${datePillClass} bg-violet-100 text-violet-800`}>Committed {entry.createdAt ? formatShortDate(entry.createdAt) : '-'}</span>
                            </div>
                          </td>
                          <td className="px-2 py-2 !text-left text-slate-700 sm:px-3" style={{ textAlign: 'left' }}>
                            <div className="flex min-w-0 items-center justify-start gap-2 text-left">
                              <img
                                src={entry.anonymous ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"%3E%3Ccircle cx="20" cy="20" r="20" fill="%23dbeafe"/%3E%3Ccircle cx="20" cy="15" r="7" fill="%230f3b75"/%3E%3Cpath d="M8 35c1-8 6-12 12-12s11 4 12 12" fill="%230f3b75"/%3E%3C/svg%3E' : (entry.donorAvatarUrl || `https://ui-avatars.com/api/?background=0f3b75&color=fff&bold=true&name=${encodeURIComponent(entry.donorName || 'Member')}`)}
                                alt=""
                                className="mr-1 h-7 w-7 shrink-0 rounded-full object-cover"
                                onError={(event) => {
                                  event.currentTarget.onerror = null;
                                  event.currentTarget.src = `https://ui-avatars.com/api/?background=0f3b75&color=fff&bold=true&name=${encodeURIComponent(entry.donorName || 'Member')}`;
                                }}
                              />
                              <div className="min-w-0 text-left">
                                <p className="flex min-h-7 items-center break-words font-semibold text-slate-800">{entry.anonymous ? 'Anonymous' : entry.donorName}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {reportRows.length === 0 ? (
                        <tr><td className="px-3 py-4 text-center text-slate-500" colSpan={3}>No items received in this period.</td></tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                {reportRows.length > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                    <p className="text-xs text-slate-600">Showing {visibleReportRows.length} of {reportRows.length} received items</p>
                    <div className="flex items-center gap-2">
                      <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={reportPage <= 1} onClick={() => setReportPage((prev) => prev - 1)}>Prev</button>
                      <span className="text-xs font-semibold text-slate-600">Page {reportPage} of {totalReportPages}</span>
                      <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={reportPage >= totalReportPages} onClick={() => setReportPage((prev) => prev + 1)}>Next</button>
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => downloadReport('pdf')} disabled={reportRows.length === 0} className="bg-brand-blue text-white hover:bg-blue-800">
                    <ArrowDownTrayIcon className="mr-1.5 h-4 w-4" /> Download PDF
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => downloadReport('csv')} disabled={reportRows.length === 0}>
                    <ArrowDownTrayIcon className="mr-1.5 h-4 w-4" /> Download CSV
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminLangarPage;
