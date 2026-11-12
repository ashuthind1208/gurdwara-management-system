import { serviceResponse } from './serviceResponse';
import { userRoles } from '../constants/siteConfig';
import userService from './userService';
import apiClient from './apiClient';

const getAdminEmails = () => {
  const configured = process.env.REACT_APP_ADMIN_EMAILS || '';
  if (!configured.trim()) {
    return [];
  }
  return configured
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
};

const resolveMemberType = (role) => {
  if (role === userRoles.SUPER_ADMIN || role === userRoles.ADMIN) {
    return 'Admin';
  }
  if (role === userRoles.VOLUNTEER) {
    return 'Volunteer';
  }
  if (role === userRoles.FAMILY) {
    return 'Family';
  }
  return 'Member';
};

const mapRoleByEmail = (email) => {
  const adminEmails = getAdminEmails();
  const normalizedEmail = String(email || '').toLowerCase();

  if (adminEmails.length === 0) {
    return null;
  }

  return adminEmails.includes(normalizedEmail)
    ? userRoles.SUPER_ADMIN
    : null;
};

const getAssignedRole = ({ email, fallbackRole = userRoles.FAMILY }) => mapRoleByEmail(email) || fallbackRole;

const resolveAuthPolicy = ({ email, intent = 'signin', existingUser = null }) => {
  const isAllowlistedAdmin = mapRoleByEmail(email) === userRoles.SUPER_ADMIN;
  if (isAllowlistedAdmin) {
    return {
      role: userRoles.SUPER_ADMIN,
      approvalStatus: 'approved',
      registrationComplete: true
    };
  }

  if (existingUser?.role) {
    return {
      role: existingUser.role,
      approvalStatus: existingUser.approvalStatus || 'approved',
      registrationComplete: true
    };
  }

  if (intent === 'signup') {
    return {
      role: userRoles.MEMBER,
      approvalStatus: 'pending',
      registrationComplete: true
    };
  }

  return {
    role: userRoles.FAMILY,
    approvalStatus: 'approved',
    registrationComplete: true
  };
};

export const resolveGoogleOAuthRedirectUri = (origin, configuredRedirectUri = '') => {
  const current = new URL(origin);
  const configured = String(configuredRedirectUri || '').trim();
  if (configured && ['localhost', '127.0.0.1'].includes(current.hostname)) {
    try {
      const callback = new URL(configured);
      if (callback.hostname === 'localhost' && callback.port === current.port && callback.pathname === '/login') return callback.toString();
    } catch { /* use the current origin if the configured callback is malformed */ }
  }
  return `${current.origin}/login`;
};

const getPersistedUser = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem('gurdwara_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const authService = {
  login: async ({ email }) => {
    const resolvedEmail = String(email || '').trim();
    if (!resolvedEmail) {
      throw new Error('Email is required for login.');
    }
    const existingUser = await userService.getUserByEmail(resolvedEmail).then((res) => res.data);
    if (existingUser && existingUser.isActive === false) {
      throw new Error('Admin has marked your account inactive. Please contact admin for access.');
    }
    const policy = resolveAuthPolicy({ email: resolvedEmail, intent: 'signin', existingUser });
    const assignedRole = policy.role;
    const persisted = await userService.upsertUserByEmail({
      name: existingUser?.name || resolvedEmail.split('@')[0],
      email: resolvedEmail,
      role: assignedRole,
      memberType: resolveMemberType(assignedRole),
      authProvider: 'LOCAL',
      registrationComplete: policy.registrationComplete,
      approvalStatus: policy.approvalStatus,
      phone: existingUser?.phone || '',
      address: existingUser?.address || '',
      avatarUrl: existingUser?.avatarUrl || ''
    }).then((res) => res.data);

    return serviceResponse({
      token: `session-token-${Date.now()}`,
      user: {
        ...persisted,
        email: resolvedEmail,
        role: assignedRole
      }
    });
  },
  loginWithGoogle: async ({ email, name, avatarUrl, intent = 'signin', googleAccessToken }) => {
    const resolvedEmail = String(email || '').trim();
    if (!resolvedEmail) {
      throw new Error('Email is required for Google login.');
    }
    const existingUser = await userService.getUserByEmail(resolvedEmail).then((res) => res.data);
    if (existingUser && existingUser.isActive === false) {
      throw new Error('Admin has marked your account inactive. Please contact admin for access.');
    }
    const policy = resolveAuthPolicy({ email: resolvedEmail, intent, existingUser });
    const assignedRole = policy.role;
    const existingMemberType = resolveMemberType(assignedRole);

    const persisted = await userService.upsertUserByEmail({
      name: existingUser?.name || name || resolvedEmail.split('@')[0],
      email: resolvedEmail,
      role: assignedRole,
      memberType: existingMemberType,
      authProvider: 'GOOGLE',
      avatarUrl: existingUser?.avatarUrl || avatarUrl || existingUser?.picture || existingUser?.photoURL,
      phone: existingUser?.phone || '',
      address: existingUser?.address || '',
      registrationComplete: policy.registrationComplete,
      approvalStatus: policy.approvalStatus
    }).then((res) => res.data);

    return serviceResponse({
      token: googleAccessToken || `google-session-token-${Date.now()}`,
      user: {
        ...persisted,
        id: persisted.id,
        name: persisted.name,
        email: resolvedEmail,
        role: assignedRole,
        authProvider: 'GOOGLE'
      },
      wasExistingUser: Boolean(existingUser)
    });
  },
  completeRegistration: async ({ email, name, phone, address, memberType, role, avatarUrl, googleAccessToken }) => {
    const assignedRole = getAssignedRole({ email, fallbackRole: role || userRoles.FAMILY });
    const updatedUser = await userService.completeRegistration({
      email,
      name,
      phone,
      address,
      memberType: memberType || resolveMemberType(assignedRole),
      role: assignedRole,
      avatarUrl
    }).then((res) => res.data);

    return serviceResponse({
      token: googleAccessToken || `google-session-token-${Date.now()}`,
      user: {
        ...updatedUser,
        role: getAssignedRole({ email: updatedUser.email, fallbackRole: updatedUser.role || assignedRole })
      }
    });
  },
  getGoogleOAuthUrl: () => {
    const raw = String(process.env.REACT_APP_GOOGLE_OAUTH_URL || '').trim();
    const sanitized = raw.replace(/^['"]|['"]$/g, '');
    if (!sanitized) {
      return '';
    }

    try {
      const parsed = new URL(sanitized);
      if (/accounts\.google\.com$/.test(parsed.hostname)) {
        const redirectUri = resolveGoogleOAuthRedirectUri(window.location.origin, parsed.searchParams.get('redirect_uri'));
        parsed.searchParams.set('redirect_uri', redirectUri);

        if (!parsed.searchParams.get('response_type')) {
          parsed.searchParams.set('response_type', 'token');
        }
        if (!parsed.searchParams.get('scope')) {
          parsed.searchParams.set('scope', 'openid email profile');
        }
        if (!parsed.searchParams.get('prompt')) {
          parsed.searchParams.set('prompt', 'select_account');
        }
      }
      return parsed.toString();
    } catch {
      return sanitized;
    }
  },
  logout: async () => {
    const response = await apiClient.post('/auth/logout', {});
    return serviceResponse(response.data?.data || { success: true });
  },
  me: async () => serviceResponse({ user: getPersistedUser() })
};

export default authService;
