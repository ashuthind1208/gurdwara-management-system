import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  PencilSquareIcon,
  Squares2X2Icon,
  TrashIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import { adminNav } from '../../constants/navigation';
import { useAuth } from '../../context/AuthContext';
import contentApiService from '../../services/contentApiService';
import userService from '../../services/userService';
import uploadService from '../../services/uploadService';
import { siteConfig } from '../../constants/siteConfig';
import { downloadMembershipFeeInformationPdf } from '../../utils/csvExport';
import PhoneInput from '../../components/forms/PhoneInput';
import { isTenDigitPhone, TEN_DIGIT_PHONE_ERROR } from '../../utils/phone';

const FILTERS = ['All', 'Pending', 'Approved', 'Rejected'];

const filterIconMap = {
  All: Squares2X2Icon,
  Pending: ClockIcon,
  Approved: CheckCircleIcon,
  Rejected: XCircleIcon
};

const statusClassMap = {
  approved: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  pending: 'border border-amber-200 bg-amber-50 text-amber-700',
  rejected: 'border border-red-200 bg-red-50 text-red-700'
};

const activeStatusClassMap = {
  active: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  inactive: 'border border-slate-200 bg-slate-100 text-slate-700'
};

const actionIconClass = 'h-4 w-4';
const STANDARD_ROLES = ['Family', 'Member', 'Volunteer', 'Admin', 'Super Admin'];
const CUSTOM_ROLE_RESOURCE = 'admin_roles';
const PUBLIC_TITLE_RESOURCE = 'public_titles';
const OTHER_PUBLIC_TITLE_VALUE = '__other__';
const DEFAULT_PUBLIC_TITLES = ['President', 'Member', 'Volunteer'];
const adminPageOptions = adminNav.map((item) => ({ label: item.label, path: item.path }));
const memberAllowedAdminPagePaths = [
  '/admin',
  '/admin/hukamnama',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/library',
  '/admin/videos',
  '/admin/streaming',
  '/admin/events'
];
const volunteerAllowedAdminPagePaths = [
  '/admin',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/videos',
  '/admin/events'
];

const normalizeAdminPageAccess = (value = []) => {
  const normalized = Array.isArray(value) ? value.map((path) => String(path || '').trim()).filter(Boolean) : [];
  return [...new Set(normalized.filter((path) => adminPageOptions.some((item) => item.path === path)))];
};

const getDefaultAdminPageAccess = (user = {}) => {
  const storedAccess = normalizeAdminPageAccess(user.adminPageAccess);
  if (storedAccess.length > 0) {
    return storedAccess;
  }

  const role = String(user.role || '').trim().toLowerCase();
  if (role === 'admin' || role === 'super admin') {
    return adminPageOptions.map((item) => item.path);
  }

  if (role === 'member') {
    return memberAllowedAdminPagePaths;
  }

  if (role === 'volunteer') {
    return volunteerAllowedAdminPagePaths;
  }

  return [];
};

const isStandardRole = (role) => STANDARD_ROLES.includes(role);

const normalizeRoleDefinitions = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map((entry) => ({
      name: String(entry?.name || '').trim(),
      adminPageAccess: normalizeAdminPageAccess(entry?.adminPageAccess)
    }))
    .filter((entry) => entry.name && !isStandardRole(entry.name) && !seen.has(entry.name) && seen.add(entry.name));
};

const normalizePublicTitles = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map((entry) => String(entry?.name || entry || '').trim())
    .filter((title) => title && !seen.has(title.toLowerCase()) && seen.add(title.toLowerCase()));
};

const getAvatarSrc = (user = {}) => (
  getAvatarUrl(user) || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}`
);

const getAvatarUrl = (user = {}) => user.avatarUrl || user.picture || user.photoURL || '';

const userFormDefaults = {
  name: '',
  email: '',
  phone: '',
  address: '',
  title: '',
  customTitle: '',
  description: '',
  showOnAbout: false,
  role: 'Member',
  dateOfBirth: '',
  canadianStatus: '',
  donationMethod: '',
  donationSchedule: 'monthly'
};

const membershipFeeFormDefaults = {
  amount: '',
  currency: 'CAD',
  receiptNumber: '',
  paymentDate: '',
  paymentMethod: 'Cash',
  membershipEntryType: 'renew',
  status: 'pending',
  notes: ''
};

const sortMembershipFeeRecords = (records = []) => {
  return [...records].sort((left, right) => {
    const rightStamp = new Date(right.paymentDate || right.updatedAt || 0).getTime();
    const leftStamp = new Date(left.paymentDate || left.updatedAt || 0).getTime();
    return rightStamp - leftStamp;
  });
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MEMBERSHIP_VALIDITY_DAYS_BY_SCHEDULE = {
  monthly: 30,
  yearly: 365
};

const toValidDate = (value) => {
  const parsed = new Date(value || '');
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const resolveMembershipReviewMeta = ({ records = [], schedule = 'monthly' } = {}) => {
  const normalizedSchedule = String(schedule || 'monthly').trim().toLowerCase() === 'yearly' ? 'yearly' : 'monthly';
  const validityDays = MEMBERSHIP_VALIDITY_DAYS_BY_SCHEDULE[normalizedSchedule];
  const paidRecords = (Array.isArray(records) ? records : []).filter((entry) => String(entry?.status || '').toLowerCase() === 'paid');
  if (paidRecords.length === 0) {
    return {
      isActive: false,
      schedule: normalizedSchedule,
      showReviewCard: false,
      latestPaidDate: null,
      nextDueDate: null,
      daysUntilDue: null,
      overdueDays: null,
      reminder: ''
    };
  }

  const latestPaidRecord = [...paidRecords].sort((left, right) => new Date(right.paymentDate || right.updatedAt || 0).getTime() - new Date(left.paymentDate || left.updatedAt || 0).getTime())[0];
  const latestPaidDate = toValidDate(latestPaidRecord?.paymentDate || latestPaidRecord?.updatedAt);

  if (!latestPaidDate) {
    return {
      isActive: false,
      showReviewCard: true,
      latestPaidDate: null,
      nextDueDate: null,
      daysUntilDue: null,
      overdueDays: null,
      reminder: 'Latest paid fee has an invalid date. Review required before activation.'
    };
  }

  const nextDueDate = new Date(latestPaidDate.getTime() + (validityDays * MS_PER_DAY));
  const daysUntilDue = Math.ceil((nextDueDate.getTime() - Date.now()) / MS_PER_DAY);
  const isActive = daysUntilDue >= 0;

  if (isActive) {
    return {
      isActive: true,
      schedule: normalizedSchedule,
      showReviewCard: true,
      latestPaidDate,
      nextDueDate,
      daysUntilDue,
      overdueDays: null,
      reminder: `${normalizedSchedule === 'yearly' ? 'Yearly' : 'Monthly'} membership is active. Next review due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}.`
    };
  }

  const overdueDays = Math.abs(daysUntilDue);
  return {
    isActive: false,
    schedule: normalizedSchedule,
    showReviewCard: true,
    latestPaidDate,
    nextDueDate,
    daysUntilDue,
    overdueDays,
    reminder: `${normalizedSchedule === 'yearly' ? 'Yearly' : 'Monthly'} membership fee is overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}. Review and collect renewal payment.`
  };
};

const AdminUsersPage = () => {
  const { setHeaderAction } = useOutletContext();
  const { user: currentUser, persistUser } = useAuth();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState('All');
  const [viewUser, setViewUser] = useState(null);
  const [editUserId, setEditUserId] = useState('');
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [approvalNotice, setApprovalNotice] = useState('');
  const [removeBlockedMessage, setRemoveBlockedMessage] = useState('');
  const [showDeleteActions, setShowDeleteActions] = useState(false);
  const [membershipUserId, setMembershipUserId] = useState('');
  const [membershipSearchTerm, setMembershipSearchTerm] = useState('');
  const [membershipFeeEntryOpen, setMembershipFeeEntryOpen] = useState(false);
  const [editingMembershipFeeId, setEditingMembershipFeeId] = useState('');
  const [membershipFeeNotice, setMembershipFeeNotice] = useState(null);
  const [confirmDeleteMembershipFee, setConfirmDeleteMembershipFee] = useState(null);
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [isEditImageUploading, setIsEditImageUploading] = useState(false);
  const [editImageUploadProgress, setEditImageUploadProgress] = useState(0);
  const [editImageUploadError, setEditImageUploadError] = useState('');

  const form = useForm({ defaultValues: userFormDefaults });
  const editForm = useForm({ defaultValues: userFormDefaults });
  const membershipFeeForm = useForm({ defaultValues: membershipFeeFormDefaults });

  const { data: users = [], refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => userService.getUsers().then((res) => res.data),
    staleTime: 0,
    refetchOnWindowFocus: true
  });
  const { data: customRoleDefinitions = [] } = useQuery({
    queryKey: ['admin-role-definitions'],
    queryFn: () => contentApiService.getSingleton(CUSTOM_ROLE_RESOURCE, []).then((res) => normalizeRoleDefinitions(res || []))
  });
  const { data: managedPublicTitles = [] } = useQuery({
    queryKey: ['admin-public-titles'],
    queryFn: () => contentApiService.getSingleton(PUBLIC_TITLE_RESOURCE, DEFAULT_PUBLIC_TITLES).then((res) => normalizePublicTitles(res || []))
  });
  const [desktopSearchTerm, setDesktopSearchTerm] = useState('');
  const [desktopPage, setDesktopPage] = useState(1);
  const [mobileSearchTerm, setMobileSearchTerm] = useState('');
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;
  const roleOptions = useMemo(
    () => [...new Set([...STANDARD_ROLES, ...customRoleDefinitions.map((entry) => entry.name)])],
    [customRoleDefinitions]
  );
  const publicTitleOptions = useMemo(
    () => normalizePublicTitles([...managedPublicTitles, ...users.map((entry) => entry.title)]),
    [managedPublicTitles, users]
  );
  const createPublicTitleSelection = form.watch('title');
  const editPublicTitleSelection = editForm.watch('title');

  const getCustomRoleAccessByName = (roleName) => {
    const role = customRoleDefinitions.find((entry) => entry.name === String(roleName || '').trim());
    return role ? normalizeAdminPageAccess(role.adminPageAccess) : undefined;
  };

  const resolveAndPersistPublicTitle = async (values) => {
    const selectedTitle = String(values.title || '').trim();
    if (selectedTitle !== OTHER_PUBLIC_TITLE_VALUE) {
      return selectedTitle;
    }

    const customTitle = String(values.customTitle || '').trim();
    if (!customTitle) {
      throw new Error('Enter a public title.');
    }

    const latestTitles = await contentApiService.getSingleton(PUBLIC_TITLE_RESOURCE, DEFAULT_PUBLIC_TITLES);
    const normalizedTitles = normalizePublicTitles(latestTitles || []);
    if (!normalizedTitles.some((title) => title.toLowerCase() === customTitle.toLowerCase())) {
      await contentApiService.setSingleton(PUBLIC_TITLE_RESOURCE, [...normalizedTitles, customTitle]);
    }
    return customTitle;
  };

  const createMutation = useMutation({
    mutationFn: async (values) => {
      const resolvedRole = String(values.role || '').trim() || 'Member';
      const customRoleAccess = getCustomRoleAccessByName(resolvedRole);
      const isCustomRole = !isStandardRole(resolvedRole);
      const resolvedTitle = await resolveAndPersistPublicTitle(values);
      const { customTitle, ...userValues } = values;

      return userService.createUser({
        ...userValues,
        role: resolvedRole,
        title: resolvedTitle,
        adminPageAccess: isCustomRole ? customRoleAccess : undefined,
        isActive: true,
        registrationComplete: true
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-public-titles'] });
      form.reset(userFormDefaults);
      setCreateUserOpen(false);
    }
  });

  const editMutation = useMutation({
    mutationFn: async ({ id, values }) => {
      const resolvedRole = String(values.role || '').trim() || 'Member';
      const customRoleAccess = getCustomRoleAccessByName(resolvedRole);
      const isCustomRole = !isStandardRole(resolvedRole);
      const existingUser = users.find((u) => u.id === id);
      const resolvedTitle = await resolveAndPersistPublicTitle(values);
      const { customTitle, ...userValues } = values;

      return userService.updateUser(id, {
        ...userValues,
        role: resolvedRole,
        title: resolvedTitle,
        adminPageAccess: isCustomRole ? customRoleAccess : undefined,
        avatarUrl: String(editAvatarUrl || '').trim(),
        membershipProfile: {
          ...(existingUser?.membershipProfile || {}),
          dateOfBirth: String(values.dateOfBirth || '').trim(),
          canadianStatus: String(values.canadianStatus || '').trim(),
          donationMethod: String(values.donationMethod || '').trim(),
          donationSchedule: String(values.donationSchedule || 'monthly').trim().toLowerCase() || 'monthly'
        }
      });
    },
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-public-titles'] });
      queryClient.invalidateQueries({ queryKey: ['public-members'] });
      setEditUserId('');
      if (currentUser?.id && currentUser.id === variables?.id && response?.data) {
        persistUser(response.data);
      }
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }) => userService.updateUser(id, { isActive }),
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (currentUser?.id && currentUser.id === variables?.id && response?.data) {
        persistUser(response.data);
      }
    },
    onError: (error) => {
      setApprovalNotice(String(error?.message || 'Unable to update member status.'));
    }
  });

  const toggleAboutMutation = useMutation({
    mutationFn: ({ id, showOnAbout }) => userService.updateUser(id, { showOnAbout }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['public-members'] });
    }
  });

  const removeMutation = useMutation({
    mutationFn: (id) => userService.removeUser(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      if (viewUser?.id === id) {
        setViewUser(null);
      }
      if (editUserId === id) {
        setEditUserId('');
      }
      setRemoveBlockedMessage('');
    },
    onError: (error) => {
      const message = String(error?.message || '').trim();
      setRemoveBlockedMessage(message || 'User could not be deleted right now.');
    }
  });

  const filteredUsers = useMemo(() => {
    if (activeFilter === 'All') {
      return users;
    }

    return users.filter((user) => String(user.approvalStatus || 'pending').toLowerCase() === activeFilter.toLowerCase());
  }, [activeFilter, users]);

  const desktopFilteredUsers = useMemo(() => {
    const searchTerm = String(desktopSearchTerm || '').trim().toLowerCase();
    if (!searchTerm) {
      return filteredUsers;
    }

    return filteredUsers.filter((user) => {
      const haystack = [user.name, user.email, user.role, user.approvalStatus]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(searchTerm);
    });
  }, [desktopSearchTerm, filteredUsers]);

  const mobileFilteredUsers = useMemo(() => {
    const searchTerm = String(mobileSearchTerm || '').trim().toLowerCase();
    if (!searchTerm) {
      return filteredUsers;
    }

    return filteredUsers.filter((user) => {
      const haystack = [user.name, user.email, user.role, user.approvalStatus]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');

      return haystack.includes(searchTerm);
    });
  }, [filteredUsers, mobileSearchTerm]);

  const desktopTotalPages = Math.max(1, Math.ceil(desktopFilteredUsers.length / 10));
  const safeDesktopPage = Math.min(desktopPage, desktopTotalPages);
  const paginatedDesktopUsers = desktopFilteredUsers.slice((safeDesktopPage - 1) * 10, safeDesktopPage * 10);

  useEffect(() => { setDesktopPage(1); }, [activeFilter, desktopSearchTerm]);
  useEffect(() => {
    setDesktopPage((current) => Math.min(current, desktopTotalPages));
  }, [desktopTotalPages]);

  const mobileTotalPages = Math.max(1, Math.ceil(mobileFilteredUsers.length / mobilePageSize));
  const safeMobilePage = Math.min(mobilePage, mobileTotalPages);
  const paginatedMobileUsers = useMemo(() => {
    const startIndex = (safeMobilePage - 1) * mobilePageSize;
    return mobileFilteredUsers.slice(startIndex, startIndex + mobilePageSize);
  }, [mobileFilteredUsers, safeMobilePage]);

  useEffect(() => {
    setMobilePage(1);
  }, [activeFilter, mobileSearchTerm]);

  useEffect(() => {
    if (safeMobilePage !== mobilePage) {
      setMobilePage(safeMobilePage);
    }
  }, [mobilePage, safeMobilePage]);

  const openEditUser = (user) => {
    setViewUser(null);
    setEditUserId(user.id);
    setEditAvatarUrl(String(getAvatarUrl(user) || ''));
    setIsEditImageUploading(false);
    setEditImageUploadProgress(0);
    setEditImageUploadError('');
    editForm.reset({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
      title: user.title || '',
      customTitle: '',
      description: user.description || '',
      showOnAbout: user.showOnAbout === true,
      role: user.role || 'Member',
      dateOfBirth: user.membershipProfile?.dateOfBirth || '',
      canadianStatus: user.membershipProfile?.canadianStatus || '',
      donationMethod: user.membershipProfile?.donationMethod || '',
      donationSchedule: user.membershipProfile?.donationSchedule || 'monthly'
    });
  };

  const openViewUser = (user) => {
    setEditUserId('');
    setViewUser(user);
  };

  const openMembershipUser = (user) => {
    setViewUser(null);
    setEditUserId('');
    setMembershipSearchTerm('');
    refetchUsers();
    setMembershipUserId(user.id);
    membershipFeeForm.reset({
      ...membershipFeeFormDefaults,
      paymentDate: new Date().toISOString().slice(0, 10)
    });
    setEditingMembershipFeeId('');
    setMembershipFeeEntryOpen(false);
  };

  const openMembershipFeeEntry = (record = null) => {
    const hasPaidMembershipFee = membershipFeeRecords.some((entry) => String(entry?.status || '').toLowerCase() === 'paid');
    const defaultMembershipEntryType = hasPaidMembershipFee ? 'renew' : 'new';

    if (record) {
      membershipFeeForm.reset({
        amount: String(record.amount ?? ''),
        currency: String(record.currency || 'CAD'),
        receiptNumber: String(record.receiptNumber || ''),
        paymentDate: String(record.paymentDate || ''),
        paymentMethod: String(record.paymentMethod || 'Cash'),
        membershipEntryType: String(record.membershipEntryType || defaultMembershipEntryType || 'renew').trim().toLowerCase() === 'new' ? 'new' : 'renew',
        status: String(record.status || 'pending'),
        notes: String(record.notes || '')
      });
      setEditingMembershipFeeId(String(record.id || ''));
    } else {
      membershipFeeForm.reset({
        ...membershipFeeFormDefaults,
        paymentDate: new Date().toISOString().slice(0, 10),
        membershipEntryType: defaultMembershipEntryType
      });
      setEditingMembershipFeeId('');
    }
    setMembershipFeeEntryOpen(true);
  };

  const openCreateUser = () => {
    form.reset(userFormDefaults);
    setCreateUserOpen(true);
  };

  const closeModals = () => {
    setViewUser(null);
    setEditUserId('');
    setMembershipUserId('');
    setMembershipSearchTerm('');
    setMembershipFeeEntryOpen(false);
    setEditingMembershipFeeId('');
    setCreateUserOpen(false);
    setEditAvatarUrl('');
    setIsEditImageUploading(false);
    setEditImageUploadProgress(0);
    setEditImageUploadError('');
  };

  const handleEditAvatarSelected = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsEditImageUploading(true);
      setEditImageUploadError('');
      const uploaded = await uploadService.uploadFile({
        service: 'users',
        file,
        allowedMimeTypes: ['image/*'],
        maxSizeMB: 5,
        onProgress: setEditImageUploadProgress
      });
      const nextUrl = String(uploaded?.url || '').trim();
      if (!nextUrl) {
        throw new Error('Upload did not return a file URL.');
      }
      setEditAvatarUrl(nextUrl);
    } catch (error) {
      setEditImageUploadError(error?.message || 'Unable to upload profile image right now.');
    } finally {
      setIsEditImageUploading(false);
      event.target.value = '';
    }
  };

  const viewUserAccess = useMemo(() => getDefaultAdminPageAccess(viewUser || {}), [viewUser]);
  const editUserRecord = useMemo(() => users.find((entry) => entry.id === editUserId) || null, [editUserId, users]);
  const membershipUserRecord = useMemo(() => users.find((entry) => entry.id === membershipUserId) || null, [membershipUserId, users]);
  const membershipFeeRecords = useMemo(
    () => sortMembershipFeeRecords(Array.isArray(membershipUserRecord?.membershipFeeRecords) ? membershipUserRecord.membershipFeeRecords : []),
    [membershipUserRecord]
  );
  const membershipReviewMeta = useMemo(
    () => resolveMembershipReviewMeta({
      records: membershipFeeRecords,
      schedule: membershipUserRecord?.membershipProfile?.donationSchedule,
      startDate: membershipUserRecord?.membershipProfile?.submittedAt || membershipUserRecord?.createdAt || new Date().toISOString()
    }),
    [membershipFeeRecords, membershipUserRecord?.createdAt, membershipUserRecord?.membershipProfile?.donationSchedule, membershipUserRecord?.membershipProfile?.submittedAt]
  );
  const filteredMembershipFeeRecords = useMemo(() => {
    const query = String(membershipSearchTerm || '').trim().toLowerCase();
    if (!query) {
      return membershipFeeRecords;
    }

    return membershipFeeRecords.filter((entry) => {
      const haystack = [entry.receiptNumber, entry.status, entry.paymentMethod, entry.notes, entry.currency, entry.paymentDate]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      return haystack.includes(query);
    });
  }, [membershipFeeRecords, membershipSearchTerm]);

  const downloadMembershipTransactionInvoice = (entry) => {
    void downloadMembershipFeeInformationPdf({
      user: { ...membershipUserRecord, membershipFeeRecords: [entry] },
      membershipFeeRecord: entry,
      organizationName: siteConfig.name,
      address: siteConfig.contact?.address,
      phone: siteConfig.contact?.phone,
      email: siteConfig.contact?.email
    }).catch(() => null);
  };

  const membershipFeeMutation = useMutation({
    mutationFn: async ({ id, values, editingId }) => {
      const userRecord = users.find((entry) => entry.id === id);
      if (!userRecord) {
        throw new Error('User not found.');
      }

      const targetId = String(editingId || '').trim();
      const nextRecord = {
        id: targetId || `fee-${Date.now()}`,
        amount: Number(values.amount || 0),
        currency: String(values.currency || 'CAD').trim() || 'CAD',
        receiptNumber: String(values.receiptNumber || '').trim(),
        paymentDate: String(values.paymentDate || '').trim(),
        paymentMethod: String(values.paymentMethod || 'Cash').trim() || 'Cash',
        membershipEntryType: String(values.membershipEntryType || 'renew').trim().toLowerCase() === 'new' ? 'new' : 'renew',
        status: String(values.status || 'pending').trim().toLowerCase(),
        notes: String(values.notes || '').trim(),
        updatedAt: new Date().toISOString()
      };

      const existingFeeRecords = Array.isArray(userRecord.membershipFeeRecords) ? userRecord.membershipFeeRecords : [];
      const filteredExisting = targetId
        ? existingFeeRecords.filter((entry) => String(entry?.id || '') !== targetId)
        : existingFeeRecords;
      const nextFeeRecords = sortMembershipFeeRecords([...filteredExisting, nextRecord]);

      const response = await userService.updateUser(id, {
        membershipFeeRecords: nextFeeRecords
      });
      const savedRecords = Array.isArray(response?.data?.membershipFeeRecords)
        ? response.data.membershipFeeRecords
        : [];
      if (!savedRecords.some((entry) => String(entry?.id || '') === nextRecord.id)) {
        throw new Error('The membership fee was not saved. Please try again.');
      }
      return response;
    },
    onSuccess: (response, variables) => {
      if (response?.data) {
        queryClient.setQueryData(['admin-users'], (current = []) => (
          current.map((entry) => entry.id === response.data.id ? response.data : entry)
        ));
      }
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      membershipFeeForm.reset({
        ...membershipFeeFormDefaults,
        paymentDate: new Date().toISOString().slice(0, 10)
      });
      setMembershipFeeNotice({
        type: 'success',
        message: String(variables?.editingId || '').trim()
          ? 'Membership fee entry updated. Member approval refreshed automatically.'
          : 'Membership fee entry added. Member approval refreshed automatically.'
      });
      setEditingMembershipFeeId('');
      setMembershipFeeEntryOpen(false);
    },
    onError: (error) => {
      setMembershipFeeNotice({
        type: 'error',
        message: String(error?.message || 'Unable to save membership fee entry right now.')
      });
    }
  });

  const membershipFeeDeleteMutation = useMutation({
    mutationFn: ({ id, feeId }) => {
      const userRecord = users.find((entry) => entry.id === id);
      if (!userRecord) {
        throw new Error('User not found.');
      }

      const existingFeeRecords = Array.isArray(userRecord.membershipFeeRecords) ? userRecord.membershipFeeRecords : [];
      const nextFeeRecords = existingFeeRecords.filter((entry) => String(entry?.id || '') !== String(feeId || ''));
      const nextSortedFeeRecords = sortMembershipFeeRecords(nextFeeRecords);

      return userService.updateUser(id, {
        membershipFeeRecords: nextSortedFeeRecords
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setMembershipFeeNotice({ type: 'success', message: 'Membership fee entry removed. Member approval refreshed automatically.' });
      setConfirmDeleteMembershipFee(null);
    },
    onError: (error) => {
      setMembershipFeeNotice({
        type: 'error',
        message: String(error?.message || 'Unable to remove membership fee entry right now.')
      });
    }
  });

  useEffect(() => {
    if (!membershipFeeNotice?.message) {
      return undefined;
    }

    const timerId = window.setTimeout(() => setMembershipFeeNotice(null), 4000);
    return () => window.clearTimeout(timerId);
  }, [membershipFeeNotice]);

  const renderActivePill = (user) => {
    const isActive = user.isActive !== false;
    const activeLabel = isActive ? 'Active' : 'Inactive';

    return (
      <button
        type="button"
        onClick={() => toggleActiveMutation.mutate({ id: user.id, isActive: !isActive })}
        disabled={toggleActiveMutation.isPending}
        className={`inline-flex w-full items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold transition ${activeStatusClassMap[isActive ? 'active' : 'inactive']} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        {activeLabel}
      </button>
    );
  };

  const renderApprovalPill = (approvalStatus) => (
    <span className={`inline-flex w-full items-center justify-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClassMap[approvalStatus] || statusClassMap.pending}`}>
      {approvalStatus}
    </span>
  );

  const renderAboutPill = (user) => {
    const isVisible = user.showOnAbout === true;
    const VisibilityIcon = isVisible ? EyeIcon : EyeSlashIcon;
    return (
      <button
        type="button"
        onClick={() => toggleAboutMutation.mutate({ id: user.id, showOnAbout: !isVisible })}
        disabled={toggleAboutMutation.isPending}
        className={`mx-auto inline-flex h-8 w-8 items-center justify-center rounded-full border transition ${activeStatusClassMap[isVisible ? 'active' : 'inactive']} disabled:cursor-not-allowed disabled:opacity-50`}
        aria-label={isVisible ? `Hide ${user.name} from About page` : `Show ${user.name} on About page`}
        aria-pressed={isVisible}
        title={isVisible ? 'Shown on About page' : 'Hidden from About page'}
      >
        <VisibilityIcon className="h-4 w-4" />
      </button>
    );
  };

  useEffect(() => {
    setHeaderAction(<AdminHeaderActionButton label="Add User" onClick={openCreateUser} />);

    return () => setHeaderAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderAction]);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Users and Roles</h1>

      <Card>
        {approvalNotice ? (
          <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">{approvalNotice}</p>
        ) : null}

        <div className="mb-4 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-1">
            {FILTERS.map((filter) => {
              const Icon = filterIconMap[filter] || Squares2X2Icon;
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border p-0 shadow-sm transition sm:h-auto sm:w-auto sm:gap-2 sm:rounded-full sm:px-3 sm:py-1.5 ${isActive ? 'border-blue-600 bg-blue-600 text-blue-50' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}
                  aria-label={`Filter ${filter}`}
                  title={`Filter ${filter}`}
                >
                  <Icon className="h-4 w-4 stroke-2" />
                  <span className="hidden sm:inline">{filter}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowDeleteActions((prev) => !prev)}
            className={`ml-auto inline-flex h-9 w-9 items-center justify-center rounded-full border p-0 text-sm font-semibold transition sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-1.5 ${showDeleteActions ? 'border-red-300 bg-red-100 text-red-900' : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'}`}
            aria-pressed={showDeleteActions}
            title="Toggle delete icons"
            aria-label={showDeleteActions ? 'Hide delete icons' : 'Show delete icons'}
          >
            <TrashIcon className="h-4 w-4 stroke-2" />
            <span className="hidden sm:inline">{showDeleteActions ? 'Hide Delete Icons' : 'Show Delete Icons'}</span>
          </button>
        </div>

        <div className="mb-4 lg:hidden">
          <label className="block text-sm font-semibold text-slate-700">
            Search users
            <input
              type="search"
              value={mobileSearchTerm}
              onChange={(event) => setMobileSearchTerm(event.target.value)}
              placeholder="Search name, email, role, status"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-blue"
            />
          </label>
        </div>

        <div className="mb-4 hidden lg:block">
          <label className="block text-sm font-semibold text-slate-700">
            Search users
            <input
              type="search"
              value={desktopSearchTerm}
              onChange={(event) => setDesktopSearchTerm(event.target.value)}
              placeholder="Search name, email, role, status"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none transition focus:border-brand-blue"
            />
          </label>
        </div>

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Joined</th>
                <th className="px-3 py-2.5">Approval</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">About</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDesktopUsers.map((user) => {
                const approvalStatus = String(user.approvalStatus || 'pending').toLowerCase();
                const avatarUrl = getAvatarUrl(user);
                return (
                  <tr key={user.id} className="border-t border-slate-100">
                    <td className="px-3 py-2.5">
                      <div className="space-y-1.5 lg:hidden">
                        <div className="flex items-center gap-2">
                          <img
                            src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
                            alt={user.name}
                            className="h-8 w-8 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                          <span className="text-sm font-bold leading-tight text-slate-800">{user.name}</span>
                        </div>
                        <p className="text-[12px] leading-snug text-slate-600">{user.email}</p>
                        <p className="text-[12px] leading-snug text-slate-600">{user.role || '-'}</p>
                        <p className="text-[12px] leading-snug text-slate-600">Joined: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</p>
                        <p className="text-[12px] leading-snug text-slate-600">Approval: {approvalStatus}</p>
                        <div>{renderActivePill(user)}</div>
                      </div>
                      <div className="hidden lg:flex items-center gap-2">
                        <img
                          src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
                          alt={user.name}
                          className="h-8 w-8 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="font-medium text-slate-800">{user.name}</span>
                      </div>
                    </td>
                    <td className="admin-compact-mobile-hidden px-3 py-2.5 text-slate-700">{user.email}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2.5 text-slate-700">{user.role || '-'}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2.5 text-slate-700">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusClassMap[approvalStatus] || statusClassMap.pending}`}>
                        {approvalStatus}
                      </span>
                    </td>
                    <td className="admin-compact-mobile-hidden px-3 py-2.5">{renderActivePill(user)}</td>
                    <td className="admin-compact-mobile-hidden px-3 py-2.5">{renderAboutPill(user)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openViewUser(user)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                          aria-label="View user"
                          title="View"
                        >
                          <EyeIcon className={actionIconClass} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditUser(user)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 transition hover:bg-blue-50"
                          aria-label="Edit user"
                          title="Edit"
                        >
                          <PencilSquareIcon className={actionIconClass} />
                        </button>
                        {String(user.role || '').trim().toLowerCase() === 'member' ? (
                          <button
                            type="button"
                            onClick={() => openMembershipUser(user)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50"
                            aria-label="Membership fee tracking"
                            title="Membership"
                          >
                            <CurrencyDollarIcon className={actionIconClass} />
                          </button>
                        ) : null}
                        {showDeleteActions ? (
                          <button
                            type="button"
                            onClick={() => removeMutation.mutate(user.id)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 transition hover:bg-red-50"
                            aria-label="Delete user"
                            title="Delete"
                          >
                            <TrashIcon className={actionIconClass} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {desktopFilteredUsers.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={8}>No users found for this tab.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <nav aria-label="Users table pagination" className="flex items-center justify-between gap-3 border-t p-3 text-sm">
            <span>{desktopFilteredUsers.length ? `Showing ${(safeDesktopPage - 1) * 10 + 1}–${Math.min(safeDesktopPage * 10, desktopFilteredUsers.length)} of ${desktopFilteredUsers.length}` : '0 users'}</span>
            <div className="flex items-center gap-3">
              <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={safeDesktopPage === 1} onClick={() => setDesktopPage(safeDesktopPage - 1)}>Previous</button>
              <span>Page {safeDesktopPage} of {desktopTotalPages}</span>
              <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40" disabled={safeDesktopPage === desktopTotalPages} onClick={() => setDesktopPage(safeDesktopPage + 1)}>Next</button>
            </div>
          </nav>
        </div>

        <div className="space-y-3 lg:hidden">
          {paginatedMobileUsers.length > 0 ? paginatedMobileUsers.map((user) => {
            const approvalStatus = String(user.approvalStatus || 'pending').toLowerCase();
            const avatarUrl = getAvatarUrl(user);
            return (
              <div key={user.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <img
                        src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'User')}`}
                        alt={user.name}
                        className="h-10 w-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{user.name}</p>
                        <p className="truncate text-[12px] text-slate-600">{user.email}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[12px] font-medium text-slate-600">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">{user.role || '-'}</span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1">Joined: {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</span>
                    </div>

                    <div className="mt-3 grid w-full grid-cols-3 gap-2">
                      <div className="min-w-0">{renderApprovalPill(approvalStatus)}</div>
                      <div className="min-w-0">{renderActivePill(user)}</div>
                      <div className="min-w-0">{renderAboutPill(user)}</div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openViewUser(user)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 transition hover:bg-slate-100"
                      aria-label="View user"
                      title="View"
                    >
                      <EyeIcon className={actionIconClass} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEditUser(user)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 transition hover:bg-blue-50"
                      aria-label="Edit user"
                      title="Edit"
                    >
                      <PencilSquareIcon className={actionIconClass} />
                    </button>
                    {String(user.role || '').trim().toLowerCase() === 'member' ? (
                      <button
                        type="button"
                        onClick={() => openMembershipUser(user)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 transition hover:bg-emerald-50"
                        aria-label="Membership fee tracking"
                        title="Membership"
                      >
                        <CurrencyDollarIcon className={actionIconClass} />
                      </button>
                    ) : null}
                    {showDeleteActions ? (
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(user.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 transition hover:bg-red-50"
                        aria-label="Delete user"
                        title="Delete"
                      >
                        <TrashIcon className={actionIconClass} />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
              No users found for this search or tab.
            </div>
          )}

          {mobileFilteredUsers.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
              <button
                type="button"
                onClick={() => setMobilePage((prev) => Math.max(1, prev - 1))}
                disabled={safeMobilePage === 1}
                className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Page {safeMobilePage} of {mobileTotalPages}
              </p>
              <button
                type="button"
                onClick={() => setMobilePage((prev) => Math.min(mobileTotalPages, prev + 1))}
                disabled={safeMobilePage >= mobileTotalPages}
                className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
      </Card>

      {createUserOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeModals} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <h3 className="font-heading text-lg font-semibold">Add User</h3>
              <button type="button" onClick={closeModals} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700" aria-label="Close add user modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <form className="grid gap-3 md:grid-cols-3" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
                <label className="text-sm">Name
                  <input {...form.register('name', { required: true })} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                </label>
                <label className="text-sm">Email
                  <input type="email" {...form.register('email', { required: true })} required className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                </label>
                <label className="text-sm">Phone
                  <PhoneInput {...form.register('phone', { validate: (value) => !value || isTenDigitPhone(value) || TEN_DIGIT_PHONE_ERROR })} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                </label>
                <label className="text-sm md:col-span-2">Address
                  <input {...form.register('address')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                </label>
                <label className="text-sm">Role
                  <select {...form.register('role')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5">
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">Public title
                  <select {...form.register('title')} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5">
                    <option value="">— Select —</option>
                    {publicTitleOptions.map((title) => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                    <option value={OTHER_PUBLIC_TITLE_VALUE}>Other</option>
                  </select>
                </label>
                {createPublicTitleSelection === OTHER_PUBLIC_TITLE_VALUE ? (
                  <label className="text-sm">New public title
                    <input {...form.register('customTitle', { required: true })} required placeholder="e.g. Treasurer" className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                  </label>
                ) : null}
                <label className="text-sm md:col-span-2">Public description
                  <textarea {...form.register('description')} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
                </label>
                <label className="flex items-center gap-2 text-sm md:col-span-3">
                  <input type="checkbox" {...form.register('showOnAbout')} className="h-4 w-4 rounded border-slate-300 text-brand-blue" />
                  Show this profile on the About page
                </label>
                <div className="md:col-span-3 flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? 'Adding...' : 'Add User'}</Button>
                  <Button type="button" variant="ghost" onClick={closeModals}>Cancel</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {viewUser ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeModals} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-blue px-6 py-5 text-white">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <img
                    src={getAvatarSrc(viewUser)}
                    alt={viewUser?.name || 'User'}
                    className="h-18 w-18 rounded-xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <h3 className="font-heading text-2xl font-semibold">User Details</h3>
                  <p className="text-sm text-white/75">Profile snapshot and access summary</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-white/15 px-3 py-1">{viewUser.role || 'Member'}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-100">{viewUser.isActive === false ? 'Inactive' : 'Active'}</span>
                      <span className={`rounded-full px-3 py-1 ${String(viewUser.approvalStatus || 'pending').toLowerCase() === 'approved' ? 'bg-emerald-500/20 text-emerald-100' : 'bg-amber-500/20 text-amber-100'}`}>
                        {(viewUser.approvalStatus || 'pending').charAt(0).toUpperCase() + String(viewUser.approvalStatus || 'pending').slice(1)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <button type="button" onClick={closeModals} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close view modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Profile</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</p>
                      <p className="mt-1 font-semibold text-slate-900">{viewUser.name || '-'}</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email</p>
                      <p className="mt-1 break-words text-slate-700">{viewUser.email || '-'}</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone</p>
                      <p className="mt-1 text-slate-700">{viewUser.phone || '-'}</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</p>
                      <p className="mt-1 text-slate-700">{viewUserAccess.length} assigned</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</p>
                        <p className="mt-2 text-sm text-slate-700">{viewUser.address || '-'}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</p>
                        <p className="mt-2 text-sm text-slate-700">{viewUser.createdAt ? new Date(viewUser.createdAt).toLocaleDateString() : '-'}</p>
                      </div>
                    </div>

                  <div className="border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Approval and Access</p>
                        <p className="mt-1 text-sm text-slate-600">Assigned admin pages.</p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap gap-2">
                        {viewUserAccess.length > 0 ? (
                          viewUserAccess.map((path) => {
                            const label = adminPageOptions.find((item) => item.path === path)?.label || path;
                            return (
                              <span key={path} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                                {label}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-sm text-slate-500">No admin pages assigned.</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={closeModals}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {editUserId ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeModals} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-brand-blue to-slate-950 px-6 py-5 text-white">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <img
                    src={getAvatarSrc(editUserRecord || {})}
                    alt={editUserRecord?.name || 'User'}
                    className="h-18 w-18 rounded-xl object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Edit profile</p>
                  <h3 className="mt-1 font-heading text-2xl font-semibold">{editUserRecord?.name || 'Edit User'}</h3>
                  <p className="mt-1 text-sm text-white/75">Update account details and profile information.</p>
                </div>
              </div>
              <button type="button" onClick={closeModals} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close edit modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-6 py-5" onSubmit={editForm.handleSubmit((values) => editMutation.mutate({ id: editUserId, values }))}>
              <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Current profile</p>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</p>
                      <p className="mt-1 font-semibold text-slate-900">{editUserRecord?.role || 'Member'}</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval</p>
                      <p className="mt-1 text-slate-700">{editUserRecord?.approvalStatus || 'pending'}</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access</p>
                      <p className="mt-1 text-slate-700">{getDefaultAdminPageAccess(editUserRecord || {}).length} pages</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Joined</p>
                      <p className="mt-1 text-slate-700">{editUserRecord?.createdAt ? new Date(editUserRecord.createdAt).toLocaleDateString() : '-'}</p>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
                      <p className="mt-1 text-slate-700">{editUserRecord?.approvalStatus || 'pending'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Profile photo</p>
                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={editAvatarUrl || getAvatarSrc(editUserRecord || {})}
                        alt={editUserRecord?.name || 'User'}
                        className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div>
                        <label className="inline-flex cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                          Upload photo
                          <input type="file" accept="image/*" className="hidden" onChange={handleEditAvatarSelected} />
                        </label>
                        {isEditImageUploading ? (
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">Uploading {editImageUploadProgress}%</p>
                        ) : (
                          <p className="mt-1 text-[11px] text-slate-500">Image up to 5MB</p>
                        )}
                        {editImageUploadError ? <p className="mt-1 text-[11px] font-semibold text-red-600">{editImageUploadError}</p> : null}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="text-sm font-semibold text-slate-700">Name
                      <input {...editForm.register('name', { required: true })} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Email
                      <input type="email" {...editForm.register('email', { required: true })} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Phone
                      <PhoneInput {...editForm.register('phone', { validate: (value) => !value || isTenDigitPhone(value) || TEN_DIGIT_PHONE_ERROR })} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                    </label>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700 md:col-span-2">Address
                        <textarea {...editForm.register('address')} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                      </label>
                      <div className="md:col-span-2 h-px bg-slate-200" />
                      <label className="text-sm font-semibold text-slate-700 md:col-span-2">Role
                        <select {...editForm.register('role')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue">
                          {roleOptions.map((role) => (
                            <option key={role} value={role}>{role}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold text-slate-700">Public title
                        <select {...editForm.register('title')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue">
                          <option value="">— Select —</option>
                          {publicTitleOptions.map((title) => (
                            <option key={title} value={title}>{title}</option>
                          ))}
                          <option value={OTHER_PUBLIC_TITLE_VALUE}>Other</option>
                        </select>
                      </label>
                      {editPublicTitleSelection === OTHER_PUBLIC_TITLE_VALUE ? (
                        <label className="text-sm font-semibold text-slate-700">New public title
                          <input {...editForm.register('customTitle', { required: true })} required placeholder="e.g. Treasurer" className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                        </label>
                      ) : null}
                      <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-700">
                        <input type="checkbox" {...editForm.register('showOnAbout')} className="h-4 w-4 rounded border-slate-300 text-brand-blue" />
                        Show on About page
                      </label>
                      <label className="text-sm font-semibold text-slate-700 md:col-span-2">Public description
                        <textarea {...editForm.register('description')} rows={4} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-5">
                    <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Membership Profile</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="text-sm font-semibold text-slate-700">Date of Birth
                        <input type="date" {...editForm.register('dateOfBirth')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" />
                      </label>
                      <label className="text-sm font-semibold text-slate-700">Canadian Status
                        <select {...editForm.register('canadianStatus')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue">
                          <option value="">— Select —</option>
                          <option value="Citizen">Citizen</option>
                          <option value="Permanent Resident">Permanent Resident</option>
                          <option value="Immigrant">Immigrant</option>
                        </select>
                      </label>
                      <label className="text-sm font-semibold text-slate-700">Donation Method
                        <select {...editForm.register('donationMethod')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue">
                          <option value="">— Select —</option>
                          <option value="Interac E-Transfer">Interac E-Transfer</option>
                          <option value="Cash at Gurdwara">Cash at Gurdwara</option>
                        </select>
                      </label>
                      <label className="text-sm font-semibold text-slate-700">Donation Schedule
                        <select {...editForm.register('donationSchedule')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue">
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={closeModals}>Cancel</Button>
                <Button type="submit" disabled={editMutation.isPending || isEditImageUploading}>{editMutation.isPending ? 'Saving...' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {membershipUserRecord ? (
        <div className="fixed inset-0 z-[52] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={closeModals} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 px-4 py-4 text-white sm:flex-row sm:items-start sm:justify-between sm:px-6 sm:py-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/80">Membership Desk</p>
                <h3 className="mt-1 font-heading text-2xl font-semibold">Membership Fee Tracking</h3>
                <p className="mt-1 truncate text-sm text-white/85">{membershipUserRecord.name || 'Member'} • {membershipUserRecord.email || '-'}</p>
              </div>
              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button
                  type="button"
                  className="min-w-0 rounded-full border border-white/25 bg-emerald-950 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-emerald-950/25 hover:bg-emerald-900"
                  onClick={openMembershipFeeEntry}
                >
                  <span className="sm:hidden">Add Fee Entry</span>
                  <span className="hidden sm:inline">Add Membership Fee Entry</span>
                </Button>
                <button type="button" onClick={closeModals} className="rounded-md p-1.5 text-white/85 hover:bg-white/10 hover:text-white" aria-label="Close membership modal">
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {membershipFeeNotice?.message ? (
                <p className={`mb-4 rounded-xl border px-3 py-2 text-sm font-semibold ${membershipFeeNotice.type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                  {membershipFeeNotice.message}
                </p>
              ) : null}
              <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_1fr] lg:items-start">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Member Profile</p>
                    <div className="mt-2 h-px w-full bg-slate-200" />
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      <p><span className="font-semibold text-slate-900">Phone:</span> {membershipUserRecord.phone || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Address:</span> {membershipUserRecord.address || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Date of Birth:</span> {membershipUserRecord.membershipProfile?.dateOfBirth || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Canadian Status:</span> {membershipUserRecord.membershipProfile?.canadianStatus || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Donation Method:</span> {membershipUserRecord.membershipProfile?.donationMethod || '-'}</p>
                      <p><span className="font-semibold text-slate-900">Schedule:</span> {(membershipUserRecord.membershipProfile?.donationSchedule || 'monthly').replace(/^./, (token) => token.toUpperCase())}</p>
                    </div>
                  </div>

                  {membershipReviewMeta.showReviewCard ? (
                    <div className={`rounded-2xl border p-4 shadow-sm ${membershipReviewMeta.isActive ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="whitespace-nowrap text-xs font-bold uppercase tracking-[0.16em] text-slate-600">{membershipReviewMeta.schedule === 'yearly' ? 'Yearly' : 'Monthly'} Membership Review</p>
                        <span className={`inline-flex w-fit whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${membershipReviewMeta.isActive ? 'border border-emerald-300 bg-emerald-100 text-emerald-700' : 'border border-amber-300 bg-amber-100 text-amber-700'}`}>
                          {membershipReviewMeta.isActive ? 'Active' : 'Review Required'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{membershipReviewMeta.reminder}</p>
                      <p className="mt-2 text-xs text-slate-600">
                        Latest paid date: {membershipReviewMeta.latestPaidDate ? membershipReviewMeta.latestPaidDate.toISOString().slice(0, 10) : '-'}
                        {' '}| Next due date: {membershipReviewMeta.nextDueDate ? membershipReviewMeta.nextDueDate.toISOString().slice(0, 10) : '-'}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      No paid membership fee recorded yet. Add a paid fee entry to approve the member for the current membership period and show the review status.
                    </div>
                  )}
                </div>

                <div className="space-y-3 lg:pr-6">
                  <label className="block text-sm font-semibold text-slate-700">
                    Search fee records
                  </label>

                  <div className="h-px w-full bg-slate-200" />

                  <input
                    type="search"
                    value={membershipSearchTerm}
                    onChange={(event) => setMembershipSearchTerm(event.target.value)}
                    placeholder="Search receipt, status, method"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"
                  />

                  <div className="rounded-2xl border border-slate-200 shadow-sm xl:hidden">
                    {filteredMembershipFeeRecords.length === 0 ? (
                      <p className="px-4 py-4 text-center text-sm text-slate-500">No membership fee records found.</p>
                    ) : (
                      <div className="divide-y divide-slate-200">
                        {filteredMembershipFeeRecords.map((entry) => (
                          <div key={entry.id} className="space-y-3 px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">{entry.currency} {Number(entry.amount || 0).toFixed(2)}</p>
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${entry.status === 'paid' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-amber-200 bg-amber-50 text-amber-700'}`}>{entry.status || 'pending'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-600">
                              <p><span className="font-semibold text-slate-800">Date:</span> {entry.paymentDate || '-'}</p>
                              <p><span className="font-semibold text-slate-800">Type:</span> <span className="capitalize">{entry.membershipEntryType || 'renew'}</span></p>
                              <p><span className="font-semibold text-slate-800">Method:</span> {entry.paymentMethod || '-'}</p>
                              <p><span className="font-semibold text-slate-800">Receipt:</span> {entry.receiptNumber || '-'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => downloadMembershipTransactionInvoice(entry)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                aria-label={`Download ${entry.membershipEntryType || 'membership'} transaction invoice`}
                                title="Download invoice"
                              >
                                <ArrowDownTrayIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openMembershipFeeEntry(entry)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                                aria-label="Edit membership fee entry"
                                title="Edit"
                              >
                                <PencilSquareIcon className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteMembershipFee(entry)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                                aria-label="Remove membership fee entry"
                                title="Remove"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 shadow-sm xl:block">
                    <table className="min-w-[900px] text-left text-sm">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Amount</th>
                          <th className="px-3 py-2">Receipt</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Method</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMembershipFeeRecords.map((entry) => (
                          <tr key={entry.id} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700">{entry.paymentDate || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-900">{entry.currency} {Number(entry.amount || 0).toFixed(2)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700">{entry.receiptNumber || '-'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700 capitalize">{entry.membershipEntryType || 'renew'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-700">{entry.paymentMethod || '-'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${entry.status === 'paid' ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'border border-amber-200 bg-amber-50 text-amber-700'}`}>{entry.status || 'pending'}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => downloadMembershipTransactionInvoice(entry)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  aria-label={`Download ${entry.membershipEntryType || 'membership'} transaction invoice`}
                                  title="Download invoice"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openMembershipFeeEntry(entry)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                                  aria-label="Edit membership fee entry"
                                  title="Edit"
                                >
                                  <PencilSquareIcon className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteMembershipFee(entry)}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"
                                  aria-label="Remove membership fee entry"
                                  title="Remove"
                                >
                                  <TrashIcon className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredMembershipFeeRecords.length === 0 ? (
                          <tr>
                            <td className="px-3 py-4 text-center text-slate-500" colSpan={7}>No membership fee records found.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {membershipUserRecord && membershipFeeEntryOpen ? (
        <div className="fixed inset-0 z-[53] flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/55" onClick={() => setMembershipFeeEntryOpen(false)} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-700 px-5 py-3 text-white">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/80">Membership Desk</p>
                <h3 className="mt-0.5 font-heading text-base font-semibold">Add Membership Fee Entry</h3>
              </div>
              <button type="button" onClick={() => setMembershipFeeEntryOpen(false)} className="rounded-md p-1 text-white/90 hover:bg-white/10 hover:text-white" aria-label="Close membership fee modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <form className="flex-1 overflow-y-auto px-5 py-4" onSubmit={membershipFeeForm.handleSubmit((values) => membershipFeeMutation.mutate({ id: membershipUserRecord.id, values, editingId: editingMembershipFeeId }))}>
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Payment Details</h4>
                  <div className="h-px w-full bg-slate-200" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-semibold text-slate-700">Amount
                      <input type="number" min="0" step="0.01" {...membershipFeeForm.register('amount', { required: true })} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Currency
                      <input {...membershipFeeForm.register('currency', { required: true })} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Receipt Number
                      <input {...membershipFeeForm.register('receiptNumber')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Payment Date
                      <input type="date" {...membershipFeeForm.register('paymentDate', { required: true })} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Payment Method
                      <select {...membershipFeeForm.register('paymentMethod')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5">
                        <option value="Cash">Cash</option>
                        <option value="E-Transfer">E-Transfer</option>
                        <option value="Card">Card</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </label>
                    <label className="text-sm font-semibold text-slate-700">Status
                      <select {...membershipFeeForm.register('status')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5">
                        <option value="pending">Pending</option>
                        <option value="paid">Paid</option>
                        <option value="waived">Waived</option>
                      </select>
                    </label>
                  </div>
                </section>

                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h4 className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Membership Type and Notes</h4>
                  <div className="h-px w-full bg-slate-200" />
                  <fieldset>
                    <legend className="text-sm font-semibold text-slate-700">Membership Type *</legend>
                    <div className="mt-2 flex flex-nowrap items-center gap-3">
                      <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                        <input type="radio" value="new" {...membershipFeeForm.register('membershipEntryType')} />
                        New
                      </label>
                      <label className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
                        <input type="radio" value="renew" {...membershipFeeForm.register('membershipEntryType')} />
                        Renew
                      </label>
                    </div>
                  </fieldset>
                  <label className="block text-sm font-semibold text-slate-700">Notes
                    <textarea rows={3} {...membershipFeeForm.register('notes')} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2.5" />
                  </label>
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Membership approval is based on the schedule shown above. Only current paid entries approve the member and show the review card.
                  </p>
                </section>
              </div>

              <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={() => setMembershipFeeEntryOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={membershipFeeMutation.isPending}>{membershipFeeMutation.isPending ? 'Saving...' : (editingMembershipFeeId ? 'Update Fee Entry' : 'Save Fee Entry')}</Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {membershipUserRecord && confirmDeleteMembershipFee ? (
        <div className="fixed inset-0 z-[54] flex items-center justify-center px-4" data-delete-guard-ignore="true">
          <div className="absolute inset-0 bg-slate-900/55" onClick={() => setConfirmDeleteMembershipFee(null)} aria-hidden="true" />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="font-heading text-lg font-semibold text-slate-900">Remove Fee Entry</h3>
            <p className="mt-2 text-sm text-slate-700">
              Remove receipt <span className="font-semibold">{confirmDeleteMembershipFee.receiptNumber || 'N/A'}</span> for {confirmDeleteMembershipFee.currency} {Number(confirmDeleteMembershipFee.amount || 0).toFixed(2)}?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDeleteMembershipFee(null)}>Cancel</Button>
              <Button
                type="button"
                onClick={() => membershipFeeDeleteMutation.mutate({ id: membershipUserRecord.id, feeId: confirmDeleteMembershipFee.id })}
                disabled={membershipFeeDeleteMutation.isPending}
              >
                {membershipFeeDeleteMutation.isPending ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {removeBlockedMessage ? (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/55 px-4" onClick={() => setRemoveBlockedMessage('')}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Action Required</p>
                <h3 className="mt-1 font-heading text-xl font-semibold text-slate-900">User linked with Event or Seva</h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoveBlockedMessage('')}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100"
                aria-label="Close message"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{removeBlockedMessage}</p>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={() => setRemoveBlockedMessage('')}>Understood</Button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
};

export default AdminUsersPage;
