import { serviceResponse } from './serviceResponse';
import contentApiService from './contentApiService';
import { adminNav } from '../constants/navigation';
import apiClient from './apiClient';

const RESOURCE = 'users';
const ADMIN_PAGE_PATHS = adminNav.map((item) => item.path);
const MEMBER_ALLOWED_ADMIN_PAGE_PATHS = [
  '/admin',
  '/admin/hukamnama',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/library',
  '/admin/videos',
  '/admin/streaming',
  '/admin/events'
];
const VOLUNTEER_ALLOWED_ADMIN_PAGE_PATHS = [
  '/admin',
  '/admin/seva-opportunities',
  '/admin/gallery',
  '/admin/videos',
  '/admin/events'
];
const ROLE_DEFINITIONS_RESOURCE = 'admin_roles';

const getDefaultAdminPageAccessForRole = (role) => {
  if (role === 'Super Admin' || role === 'Admin') {
    return [...ADMIN_PAGE_PATHS];
  }

  if (role === 'Member') {
    return [...MEMBER_ALLOWED_ADMIN_PAGE_PATHS];
  }

  if (role === 'Volunteer') {
    return [...VOLUNTEER_ALLOWED_ADMIN_PAGE_PATHS];
  }

  return [];
};

const getRoleDefinitions = async () => {
  try {
    const records = await contentApiService.getSingleton(ROLE_DEFINITIONS_RESOURCE, []);
    return Array.isArray(records)
      ? records.map((entry) => ({
        name: String(entry?.name || '').trim(),
        adminPageAccess: Array.isArray(entry?.adminPageAccess)
          ? [...new Set(entry.adminPageAccess.map((path) => String(path || '').trim()).filter((path) => ADMIN_PAGE_PATHS.includes(path)))]
          : []
      })).filter((entry) => entry.name)
      : [];
  } catch {
    return [];
  }
};

const resolveRoleAdminPageAccess = (role, storedAccess, roleDefinitions = []) => {
  const normalizedRole = String(role || '').trim();
  const definition = roleDefinitions.find((entry) => entry.name === normalizedRole);
  if (definition) {
    const definedAccess = [...new Set((definition.adminPageAccess || []).filter((path) => ADMIN_PAGE_PATHS.includes(path)))]
      ;
    if (definedAccess.length > 0) {
      return definedAccess;
    }
    return getDefaultAdminPageAccessForRole(normalizedRole);
  }

  const normalizedStoredAccess = Array.isArray(storedAccess)
    ? [...new Set(storedAccess.map((path) => String(path || '').trim()).filter((path) => ADMIN_PAGE_PATHS.includes(path)))]
    : [];

  if (normalizedStoredAccess.length > 0) {
    return normalizedStoredAccess;
  }

  return getDefaultAdminPageAccessForRole(normalizedRole);
};

const seedUsers = [];

const normalizeRole = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'super admin' || raw === 'super_admin' || raw === 'superadmin') {
    return 'Super Admin';
  }
  if (raw === 'admin') {
    return 'Admin';
  }
  if (raw === 'volunteer' || raw === 'volunteer coordinator' || raw === 'volunteer_coordinator') {
    return 'Volunteer';
  }
  if (raw === 'family') {
    return 'Family';
  }
  if (raw === 'editor') {
    return 'Editor';
  }
  if (raw === 'finance') {
    return 'Finance';
  }
  return String(value || '').trim() || 'Member';
};

const resolveMemberType = (role, fallback) => {
  if (role === 'Super Admin' || role === 'Admin' || role === 'Editor' || role === 'Finance') {
    return 'Admin';
  }
  if (role === 'Volunteer') {
    return 'Volunteer';
  }
  if (role === 'Family') {
    return 'Family';
  }
  return fallback || 'Member';
};

const resolveAvatarUrl = (user = {}) => (
  user.avatarUrl || user.picture || user.photoURL || user.imageUrl || user.profileImageUrl || ''
);

const normalizeMembershipFeeRecords = (records = []) => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((entry, index) => ({
      id: String(entry?.id || `fee-${Date.now()}-${index}`).trim(),
      amount: Number(entry?.amount || 0),
      currency: String(entry?.currency || 'CAD').trim() || 'CAD',
      receiptNumber: String(entry?.receiptNumber || '').trim(),
      paymentDate: String(entry?.paymentDate || '').trim(),
      paymentMethod: String(entry?.paymentMethod || 'Cash').trim() || 'Cash',
      membershipEntryType: String(entry?.membershipEntryType || 'renew').trim().toLowerCase() === 'new' ? 'new' : 'renew',
      status: String(entry?.status || 'pending').trim().toLowerCase() || 'pending',
      notes: String(entry?.notes || '').trim(),
      updatedAt: String(entry?.updatedAt || new Date().toISOString())
    }))
    .sort((left, right) => new Date(right.paymentDate || right.updatedAt || 0).getTime() - new Date(left.paymentDate || left.updatedAt || 0).getTime());
};

const normalizeMembershipProfile = (profile = {}) => {
  const source = profile && typeof profile === 'object' ? profile : {};
  return {
    completed: source.completed === true,
    submittedAt: String(source.submittedAt || '').trim(),
    dateOfBirth: String(source.dateOfBirth || '').trim(),
    occupation: String(source.occupation || '').trim(),
    emergencyContactName: String(source.emergencyContactName || '').trim(),
    emergencyContactPhone: String(source.emergencyContactPhone || '').trim(),
    canadianStatus: String(source.canadianStatus || '').trim(),
    donationMethod: String(source.donationMethod || '').trim(),
    donationSchedule: String(source.donationSchedule || 'monthly').trim().toLowerCase() || 'monthly',
    membershipPledgeAccepted: source.membershipPledgeAccepted === true,
    notes: String(source.notes || '').trim()
  };
};

const hasCurrentPaidMembershipFee = (records = [], schedule = 'monthly') => {
  const validityDays = String(schedule || '').trim().toLowerCase() === 'yearly' ? 365 : 30;
  const paidDates = records
    .filter((entry) => String(entry?.status || '').trim().toLowerCase() === 'paid')
    .map((entry) => new Date(entry?.paymentDate || entry?.updatedAt || '').getTime())
    .filter(Number.isFinite);

  if (paidDates.length === 0) {
    return false;
  }

  return Date.now() <= Math.max(...paidDates) + (validityDays * 24 * 60 * 60 * 1000);
};

const normalizeUser = (user = {}, roleDefinitions = []) => {
  const role = normalizeRole(user.role);
  const memberType = resolveMemberType(role, user.memberType || '');
  const resolvedAvatarUrl = resolveAvatarUrl(user);
  const membershipProfile = normalizeMembershipProfile(user.membershipProfile);
  const membershipFeeRecords = normalizeMembershipFeeRecords(user.membershipFeeRecords);
  const approvalStatus = role === 'Member' && !hasCurrentPaidMembershipFee(membershipFeeRecords, membershipProfile.donationSchedule)
    ? 'pending'
    : 'approved';

  return {
    id: user.id || `user-${Date.now()}`,
    name: user.name || '',
    role,
    email: String(user.email || '').toLowerCase(),
    phone: user.phone || '',
    address: user.address || '',
    memberType,
    authProvider: user.authProvider || 'LOCAL',
    avatarUrl: resolvedAvatarUrl,
    title: String(user.title || '').trim(),
    description: String(user.description || '').trim(),
    showOnAbout: user.showOnAbout === true,
    adminPageAccess: resolveRoleAdminPageAccess(role, user.adminPageAccess, roleDefinitions),
    registrationComplete: Boolean(user.registrationComplete),
    isActive: user.isActive !== false,
    approvalStatus,
    approvalUpdatedAt: user.approvalUpdatedAt || '',
    membershipProfile,
    membershipFeeRecords,
    createdAt: user.createdAt || new Date().toISOString(),
    updatedAt: user.updatedAt || new Date().toISOString()
  };
};

const ensureSeedUsers = async () => {
  const roleDefinitions = await getRoleDefinitions();
  const rows = await contentApiService.list(RESOURCE);
  if (rows.length > 0) {
    return rows.map((row) => normalizeUser(row, roleDefinitions));
  }

  await Promise.all(seedUsers.map((user) => contentApiService.create(RESOURCE, normalizeUser(user, roleDefinitions))));
  const seeded = await contentApiService.list(RESOURCE);
  return seeded.map((row) => normalizeUser(row, roleDefinitions));
};

const findUserByEmail = async (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const rows = await ensureSeedUsers();
  return rows.find((entry) => entry.email === normalizedEmail) || null;
};

const userService = {
  getUsers: async () => {
    const users = await ensureSeedUsers();
    return serviceResponse(users);
  },

  getPublicMembers: async () => {
    const response = await apiClient.get('/public/members');
    return serviceResponse(response.data?.data || []);
  },

  getUserByEmail: async (email) => {
    const user = await findUserByEmail(email);
    return serviceResponse(user);
  },

  upsertUserByEmail: async (payload) => {
    const roleDefinitions = await getRoleDefinitions();
    const normalized = normalizeUser(payload, roleDefinitions);
    const existing = await findUserByEmail(normalized.email);
    const hasNameInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'name');
    const hasPhoneInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'phone');
    const hasAddressInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'address');
    const hasAuthProviderInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'authProvider');
    const hasAvatarUrlInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'avatarUrl');
    const hasTitleInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'title');
    const hasDescriptionInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'description');
    const hasShowOnAboutInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'showOnAbout');
    const hasAdminPageAccessInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'adminPageAccess');
    const hasRoleInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'role');
    const hasMemberTypeInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'memberType');
    const hasApprovalStatusInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'approvalStatus');
    const hasRegistrationCompleteInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'registrationComplete');
    const hasMembershipFeeRecordsInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'membershipFeeRecords');
    const hasMembershipProfileInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'membershipProfile');
    const nextRole = hasRoleInPayload ? normalizeRole(payload.role) : normalizeRole(existing?.role || normalized.role);
    const roleChanged = hasRoleInPayload && nextRole !== normalizeRole(existing?.role);
    const nextAdminPageAccess = hasAdminPageAccessInPayload
      ? normalized.adminPageAccess
      : (roleChanged ? undefined : existing?.adminPageAccess);

    if (!existing) {
      const created = await contentApiService.create(RESOURCE, {
        ...normalized,
        id: normalized.id || `user-${Date.now()}`
      });
      return serviceResponse(normalizeUser(created || normalized, roleDefinitions));
    }

    const updated = await contentApiService.update(RESOURCE, existing.id, {
      ...existing,
      ...normalized,
      name: hasNameInPayload ? normalized.name : existing.name,
      phone: hasPhoneInPayload ? normalized.phone : existing.phone,
      address: hasAddressInPayload ? normalized.address : existing.address,
      authProvider: hasAuthProviderInPayload ? normalized.authProvider : existing.authProvider,
      avatarUrl: hasAvatarUrlInPayload ? normalized.avatarUrl : existing.avatarUrl,
      title: hasTitleInPayload ? normalized.title : existing.title,
      description: hasDescriptionInPayload ? normalized.description : existing.description,
      showOnAbout: hasShowOnAboutInPayload ? normalized.showOnAbout : existing.showOnAbout,
      role: nextRole,
      memberType: hasMemberTypeInPayload ? normalized.memberType : existing.memberType,
      approvalStatus: hasApprovalStatusInPayload ? normalized.approvalStatus : existing.approvalStatus,
      registrationComplete: hasRegistrationCompleteInPayload ? normalized.registrationComplete : existing.registrationComplete,
      adminPageAccess: resolveRoleAdminPageAccess(nextRole, nextAdminPageAccess, roleDefinitions),
      membershipProfile: hasMembershipProfileInPayload ? normalized.membershipProfile : existing.membershipProfile,
      membershipFeeRecords: roleChanged && nextRole === 'Member'
        ? []
        : (hasMembershipFeeRecordsInPayload ? normalized.membershipFeeRecords : existing.membershipFeeRecords),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString()
    });

    return serviceResponse(normalizeUser(updated || { ...existing, ...normalized }, roleDefinitions));
  },

  completeRegistration: async ({ email, name, phone, address, memberType, role, avatarUrl }) => {
    const roleDefinitions = await getRoleDefinitions();
    const normalizedEmail = String(email || '').toLowerCase();
    if (!normalizedEmail) {
      throw new Error('Email is required for registration.');
    }

    const existing = await findUserByEmail(normalizedEmail);
    const base = existing || normalizeUser({ email: normalizedEmail, name, avatarUrl }, roleDefinitions);
    const resolvedRole = normalizeRole(role || base.role);
    const resolvedMemberType = resolveMemberType(resolvedRole, memberType || base.memberType || 'Member');
    const updated = normalizeUser({
      ...base,
      name: name || base.name,
      phone: phone || '',
      address: address || '',
      role: resolvedRole,
      memberType: resolvedMemberType,
      avatarUrl: avatarUrl || base.avatarUrl,
      registrationComplete: true,
      isActive: base.isActive !== false,
      approvalUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, roleDefinitions);

    if (existing?.id) {
      const saved = await contentApiService.update(RESOURCE, existing.id, {
        ...updated,
        id: existing.id,
        createdAt: existing.createdAt
      });
      return serviceResponse(normalizeUser(saved || updated, roleDefinitions));
    }

    const created = await contentApiService.create(RESOURCE, updated);
    return serviceResponse(normalizeUser(created || updated, roleDefinitions));
  },

  submitMembershipDetails: async (id, payload) => {
    if (!id) {
      throw new Error('User id is required.');
    }

    const roleDefinitions = await getRoleDefinitions();
    const users = await ensureSeedUsers();
    const existing = users.find((user) => user.id === id);
    if (!existing) {
      throw new Error('User not found.');
    }

    const profile = normalizeMembershipProfile({
      ...existing.membershipProfile,
      ...(payload || {}),
      completed: true,
      submittedAt: new Date().toISOString()
    });

    const updated = normalizeUser({
      ...existing,
      phone: String(payload?.phone || existing.phone || '').trim(),
      address: String(payload?.address || existing.address || '').trim(),
      membershipFeeRecords: payload?.membershipPaymentConfirmed === true
        ? [
          ...(Array.isArray(existing.membershipFeeRecords) ? existing.membershipFeeRecords : []),
          {
            id: `zeffy-membership-${Date.now()}`,
            amount: 0,
            currency: 'CAD',
            paymentDate: new Date().toISOString(),
            paymentMethod: 'Zeffy',
            membershipEntryType: existing.membershipFeeRecords?.some((entry) => String(entry?.status || '').toLowerCase() === 'paid') ? 'renew' : 'new',
            status: 'paid',
            notes: 'Membership payment completed through Zeffy.'
          }
        ]
        : existing.membershipFeeRecords,
      membershipProfile: profile,
      isActive: existing.isActive !== false,
      registrationComplete: true,
      approvalUpdatedAt: existing.approvalUpdatedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }, roleDefinitions);

    const saved = await contentApiService.update(RESOURCE, id, {
      ...updated,
      id,
      createdAt: existing.createdAt
    });

    return serviceResponse(normalizeUser(saved || updated, roleDefinitions));
  },

  createUser: async (payload) => {
    const roleDefinitions = await getRoleDefinitions();
    const record = normalizeUser({
      id: `user-${Date.now()}`,
      name: payload.name,
      role: payload.role,
      email: payload.email,
      phone: payload.phone,
      address: payload.address,
      memberType: payload.memberType || '',
      authProvider: payload.authProvider || 'LOCAL',
      avatarUrl: payload.avatarUrl,
      title: payload.title,
      description: payload.description,
      showOnAbout: payload.showOnAbout === true,
      registrationComplete: Boolean(payload.registrationComplete),
      isActive: payload.isActive !== false,
      approvalUpdatedAt: new Date().toISOString()
    }, roleDefinitions);

    const created = await contentApiService.create(RESOURCE, record);
    return serviceResponse(normalizeUser(created || record, roleDefinitions));
  },

  updateUser: async (id, payload) => {
    const roleDefinitions = await getRoleDefinitions();
    const users = await ensureSeedUsers();
    const existing = users.find((user) => user.id === id) || { id };
    const hasAccessInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'adminPageAccess');
    const hasApprovalInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'approvalStatus');
    const hasRoleInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'role');
    const hasMembershipFeeRecordsInPayload = Object.prototype.hasOwnProperty.call(payload || {}, 'membershipFeeRecords');
    const nextRole = hasRoleInPayload ? normalizeRole(payload.role) : normalizeRole(existing.role);
    const roleChanged = hasRoleInPayload && nextRole !== normalizeRole(existing.role);
    const nextAdminPageAccess = hasAccessInPayload
      ? payload.adminPageAccess
      : (roleChanged ? undefined : existing.adminPageAccess);

    const record = normalizeUser({
      ...existing,
      ...payload,
      role: nextRole,
      membershipFeeRecords: roleChanged && nextRole === 'Member'
        ? []
        : (hasMembershipFeeRecordsInPayload ? payload.membershipFeeRecords : existing.membershipFeeRecords),
      approvalStatus: hasApprovalInPayload ? payload.approvalStatus : existing.approvalStatus,
      adminPageAccess: resolveRoleAdminPageAccess(nextRole, nextAdminPageAccess, roleDefinitions),
      id,
      createdAt: existing.createdAt
    }, roleDefinitions);
    const updated = await contentApiService.update(RESOURCE, id, record);
    return serviceResponse(normalizeUser(updated || record, roleDefinitions));
  },

  updateApprovalStatus: async (id, approvalStatus) => {
    const users = await ensureSeedUsers();
    const existing = users.find((user) => user.id === id);
    if (!existing) {
      return serviceResponse(null);
    }

    const updated = normalizeUser({
      ...existing,
      approvalStatus,
      approvalUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      registrationComplete: approvalStatus === 'approved' ? existing.registrationComplete : false
    });

    const saved = await contentApiService.update(RESOURCE, id, updated);
    return serviceResponse(normalizeUser(saved || updated));
  },

  removeUser: async (id) => {
    await contentApiService.remove(RESOURCE, id);
    return serviceResponse({ success: true });
  }
};

export default userService;
