import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bars3Icon,
  ArrowTopRightOnSquareIcon,
  PowerIcon,
  BellIcon,
  BellAlertIcon,
  MagnifyingGlassIcon,
  ChartBarSquareIcon,
  CalendarDaysIcon,
  CameraIcon,
  CurrencyDollarIcon,
  MegaphoneIcon,
  MicrophoneIcon,
  NewspaperIcon,
  PhotoIcon,
  QueueListIcon,
  RectangleGroupIcon,
  SignalIcon,
  Squares2X2Icon,
  TvIcon,
  UserGroupIcon,
  UsersIcon,
  VideoCameraIcon,
  BookOpenIcon,
  HeartIcon,
  SparklesIcon,
  ChatBubbleLeftRightIcon,
  SwatchIcon
} from '@heroicons/react/24/outline';
import { XMarkIcon } from '@heroicons/react/24/outline';
import GlobalSearchBar from '../components/common/GlobalSearchBar';
import { adminNav } from '../constants/navigation';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import auditService from '../services/auditService';
import contentApiService from '../services/contentApiService';
import phase2Service from '../services/phase2Service';
import userService from '../services/userService';

const FULL_ACCESS_ROLES = new Set(['Super Admin', 'Admin']);

const NOTIFICATION_READ_REMOTE_PREFIX = 'admin_notification_reads';

const normalizeNotificationReadIds = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
};

const getFirstName = (fullName) => {
  const tokens = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return tokens[0] || 'Member';
};

const getAdminAvatarFallback = (name = 'Member') => `https://ui-avatars.com/api/?name=${encodeURIComponent(String(name || 'Member'))}`;

const getAdminAvatarSrc = (entry = {}) => {
  const primary = String(entry?.avatarUrl || entry?.picture || entry?.photoURL || '').trim();
  if (primary) {
    return primary;
  }
  return getAdminAvatarFallback(entry?.name || 'Member');
};

const formatActivityTime = (value) => {
  if (!value) {
    return 'Just now';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Just now';
  }

  const diffMs = Date.now() - parsed.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }

  return parsed.toLocaleDateString();
};

const toSimpleTargetLabel = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'item';
  if (normalized.includes('user')) return 'user account';
  if (normalized.includes('event')) return 'event';
  if (normalized.includes('donation')) return 'donation';
  if (normalized.includes('volunteer') || normalized.includes('seva')) return 'seva application';
  if (normalized.includes('library')) return 'library item';
  return normalized.replace(/[_-]+/g, ' ');
};

const toSimpleActionLabel = (entry) => {
  const action = String(entry?.action || '').trim().toLowerCase();
  const target = toSimpleTargetLabel(entry?.targetType);

  if (action.includes('create') || action.includes('add') || action.includes('register')) {
    return `New ${target} added`;
  }
  if (action.includes('update') || action.includes('edit')) {
    return `${target.charAt(0).toUpperCase()}${target.slice(1)} updated`;
  }
  if (action.includes('delete') || action.includes('remove')) {
    return `${target.charAt(0).toUpperCase()}${target.slice(1)} removed`;
  }
  if (action.includes('approve')) {
    return 'User approved';
  }
  if (action.includes('reject')) {
    return 'User rejected';
  }

  return `${target.charAt(0).toUpperCase()}${target.slice(1)} activity`;
};

const adminPageByTargetType = {
  user: '/admin/users',
  users: '/admin/users',
  role: '/admin/roles-access',
  roles: '/admin/roles-access',
  event: '/admin/events',
  events: '/admin/events',
  donation: '/admin/donations',
  donations: '/admin/donations',
  campaign: '/admin/donations',
  volunteer: '/admin/seva-opportunities',
  seva: '/admin/seva-opportunities',
  gallery: '/admin/gallery',
  library: '/admin/library',
  video: '/admin/videos',
  stream: '/admin/streaming',
  cms: '/admin/cms',
  hukamnama: '/admin/hukamnama',
  schedule: '/admin/schedule',
  sponsor: '/admin/sponsors',
  advertisement: '/admin/advertisements',
  langar: '/admin/langar'
};

const toNotificationHrefFromPath = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  if (!raw.startsWith('/admin') && raw.startsWith('/api/')) {
    if (raw.includes('/events')) return '/admin/events';
    if (raw.includes('/donation')) return '/admin/donations';
    if (raw.includes('/volunteer') || raw.includes('/seva')) return '/admin/seva-opportunities';
    if (raw.includes('/users')) return '/admin/users';
    if (raw.includes('/roles')) return '/admin/roles-access';
    if (raw.includes('/news')) return '/admin/news';
    if (raw.includes('/gallery')) return '/admin/gallery';
    if (raw.includes('/library')) return '/admin/library';
    if (raw.includes('/videos')) return '/admin/videos';
    if (raw.includes('/streaming')) return '/admin/streaming';
    if (raw.includes('/cms')) return '/admin/cms';
    if (raw.includes('/hukamnama')) return '/admin/hukamnama';
    if (raw.includes('/schedule')) return '/admin/schedule';
    if (raw.includes('/sponsors')) return '/admin/sponsors';
    if (raw.includes('/advertisements')) return '/admin/advertisements';
  }

  if (!raw.startsWith('/admin')) {
    return '';
  }

  for (let index = 0; index < adminNav.length; index += 1) {
    const itemPath = String(adminNav[index]?.path || '').trim();
    if (!itemPath || itemPath === '/admin') {
      continue;
    }
    if (raw === itemPath || raw.startsWith(`${itemPath}/`)) {
      return itemPath;
    }
  }

  return raw === '/admin' ? '/admin' : '';
};

const toNotificationHref = (entry) => {
  const pathMatch = toNotificationHrefFromPath(entry?.path);
  if (pathMatch) {
    return pathMatch;
  }

  const normalizedTargetType = String(entry?.targetType || '').trim().toLowerCase();
  for (const [needle, pagePath] of Object.entries(adminPageByTargetType)) {
    if (normalizedTargetType.includes(needle)) {
      return pagePath;
    }
  }

  return '';
};

const toNotificationPageLabel = (path = '') => {
  const normalized = String(path || '').trim();
  const matched = adminNav.find((item) => item.path === normalized);
  if (matched?.label) {
    return matched.label;
  }
  if (!normalized || normalized === '/admin/audit-trail') {
    return 'Audit Trail';
  }
  if (normalized === '/admin') {
    return 'Dashboard';
  }
  const suffix = normalized.replace('/admin/', '').replace(/[-_]+/g, ' ').trim();
  return suffix ? suffix.charAt(0).toUpperCase() + suffix.slice(1) : 'Admin';
};

const mapPublicSearchRouteToAdmin = (route = '') => {
  const normalized = String(route || '').trim();
  if (!normalized) {
    return '';
  }

  if (normalized.startsWith('/admin')) {
    return normalized;
  }

  const routeMap = {
    '/events': '/admin/events',
    '/news': '/admin/news',
    '/library': '/admin/library',
    '/seva': '/admin/seva-opportunities',
    '/gallery': '/admin/gallery',
    '/hukamnama': '/admin/hukamnama',
    '/about': '/admin/cms',
    '/sikhism': '/admin/cms',
    '/contact': '/admin/cms'
  };

  return routeMap[normalized] || '';
};

const toNotificationDetail = (entry) => {
  const description = String(entry?.description || '').trim();
  if (description) {
    return description;
  }

  const targetType = toSimpleTargetLabel(entry?.targetType);
  const targetId = String(entry?.targetId || '').trim();
  if (targetId) {
    return `${targetType} ID: ${targetId}`;
  }

  return `Activity recorded for ${targetType}.`;
};

const toAuditPayload = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  if (!entry.payload || typeof entry.payload !== 'object' || Array.isArray(entry.payload)) {
    return null;
  }
  return entry.payload;
};

const toNotificationItemTitle = (entry) => {
  const payload = toAuditPayload(entry);
  const directCandidates = [
    payload?.title,
    payload?.name,
    payload?.eventTitle,
    payload?.eventName,
    payload?.campaignName,
    payload?.campaign,
    payload?.sevaType,
    payload?.folderName,
    payload?.headline,
    payload?.pageName,
    payload?.videoTitle,
    payload?.streamTitle,
    payload?.donorName,
    payload?.userName,
    payload?.fullName
  ];

  for (let index = 0; index < directCandidates.length; index += 1) {
    const value = String(directCandidates[index] || '').trim();
    if (value) {
      return value.slice(0, 100);
    }
  }

  const description = String(entry?.description || '').trim();
  if (description) {
    const createdUpdatedDeletedMatch = description.match(/(?:created|updated|deleted)\s+\w+\s+(.+)/i);
    if (createdUpdatedDeletedMatch?.[1]) {
      const candidate = createdUpdatedDeletedMatch[1].trim();
      if (candidate && !/^\d+$/.test(candidate)) {
        return candidate.slice(0, 100);
      }
    }
  }

  return '';
};

const toNotificationChangeSummary = (entry) => {
  const action = String(entry?.action || '').trim().toLowerCase();
  const target = toNotificationAffectedItem(entry);
  let verb = 'changed';
  if (action.includes('create') || action.includes('add') || action.includes('register')) {
    verb = 'added';
  } else if (action.includes('update') || action.includes('edit')) {
    verb = 'updated';
  } else if (action.includes('delete') || action.includes('remove')) {
    verb = 'deleted';
  } else if (action.includes('approve')) {
    verb = 'approved';
  } else if (action.includes('reject')) {
    verb = 'rejected';
  }
  return `${target} was ${verb}.`;
};

const toNotificationAffectedItem = (entry) => {
  const itemTitle = toNotificationItemTitle(entry);
  if (itemTitle) {
    return itemTitle;
  }

  const target = toSimpleTargetLabel(entry?.targetType);
  const targetId = String(entry?.targetId || '').trim();
  const description = String(entry?.description || '').trim();
  if (targetId) {
    return `${target} #${targetId}`;
  }
  if (description) {
    const parts = description.split(/[:.-]/).map((token) => token.trim()).filter(Boolean);
    if (parts[0]) {
      return `${target} (${parts[0].slice(0, 70)})`;
    }
  }
  return target;
};

const toStableAuditNotificationId = (entry, index) => {
  const directId = String(entry?.id || '').trim();
  if (directId) {
    return directId;
  }

  const createdAt = String(entry?.createdAt || '').trim();
  const action = String(entry?.action || '').trim().toLowerCase();
  const targetType = String(entry?.targetType || '').trim().toLowerCase();
  const targetId = String(entry?.targetId || '').trim().toLowerCase();
  const actorEmail = String(entry?.actorEmail || '').trim().toLowerCase();
  const path = String(entry?.path || '').trim().toLowerCase();
  const description = String(entry?.description || '').trim().toLowerCase();

  const stableBase = [createdAt, action, targetType, targetId, actorEmail, path, description]
    .filter(Boolean)
    .join('|');

  if (stableBase) {
    return `audit-fallback-${stableBase}`;
  }

  return `audit-index-${index}`;
};

const notificationToneByPath = {
  '/admin': 'border-slate-300 bg-gradient-to-r from-slate-100 to-white',
  '/admin/users': 'border-indigo-300 bg-gradient-to-r from-indigo-100 to-white',
  '/admin/events': 'border-sky-300 bg-gradient-to-r from-sky-100 to-white',
  '/admin/donations': 'border-emerald-300 bg-gradient-to-r from-emerald-100 to-white',
  '/admin/seva-opportunities': 'border-violet-300 bg-gradient-to-r from-violet-100 to-white',
  '/admin/library': 'border-cyan-300 bg-gradient-to-r from-cyan-100 to-white',
  '/admin/news': 'border-amber-300 bg-gradient-to-r from-amber-100 to-white',
  '/admin/gallery': 'border-pink-300 bg-gradient-to-r from-pink-100 to-white',
  '/admin/videos': 'border-red-300 bg-gradient-to-r from-red-100 to-white',
  '/admin/streaming': 'border-teal-300 bg-gradient-to-r from-teal-100 to-white',
  '/admin/cms': 'border-lime-300 bg-gradient-to-r from-lime-100 to-white',
  '/admin/hukamnama': 'border-fuchsia-300 bg-gradient-to-r from-fuchsia-100 to-white',
  '/admin/langar': 'border-orange-300 bg-gradient-to-r from-orange-100 to-white',
  '/admin/sponsors': 'border-rose-300 bg-gradient-to-r from-rose-100 to-white',
  '/admin/advertisements': 'border-yellow-300 bg-gradient-to-r from-yellow-100 to-white',
  '/admin/roles-access': 'border-purple-300 bg-gradient-to-r from-purple-100 to-white',
  '/admin/bookings': 'border-cyan-300 bg-gradient-to-r from-cyan-100 to-white',
  '/admin/analytics': 'border-blue-300 bg-gradient-to-r from-blue-100 to-white',
  '/admin/audit-trail': 'border-slate-300 bg-gradient-to-r from-slate-100 to-white'
};

const getNotificationToneClasses = (entry, isRead) => {
  if (isRead) {
    return 'border-slate-200 bg-gradient-to-r from-white to-slate-50';
  }

  if (entry.urgent) {
    return 'border-amber-300 bg-gradient-to-r from-amber-100 to-orange-50';
  }

  return notificationToneByPath[entry.pagePath] || 'border-blue-300 bg-gradient-to-r from-blue-100 to-sky-50';
};

const iconByPath = {
  '/admin': Squares2X2Icon,
  '/admin/cms': RectangleGroupIcon,
  '/admin/widgets': RectangleGroupIcon,
  '/admin/welcome-journey': SparklesIcon,
  '/admin/news': NewspaperIcon,
  '/admin/schedule': CalendarDaysIcon,
  '/admin/hukamnama': SparklesIcon,
  '/admin/ask-granthi': ChatBubbleLeftRightIcon,
  '/admin/gurdwara-branding': SwatchIcon,
  '/admin/langar': HeartIcon,
  '/admin/seva-opportunities': UserGroupIcon,
  '/admin/gallery': PhotoIcon,
  '/admin/library': BookOpenIcon,
  '/admin/videos': VideoCameraIcon,
  '/admin/streaming': SignalIcon,
  '/admin/advertisements': MegaphoneIcon,
  '/admin/sponsors': CameraIcon,
  '/admin/led-announcements': TvIcon,
  '/admin/recitations': MicrophoneIcon,
  '/admin/social-posts': MegaphoneIcon,
  '/admin/events': QueueListIcon,
  '/admin/bookings': CalendarDaysIcon,
  '/admin/booking-duties': UserGroupIcon,
  '/admin/phase2-config': SparklesIcon,
  '/admin/donations': CurrencyDollarIcon,
  '/admin/audit-trail': BellAlertIcon,
  '/admin/roles-access': QueueListIcon,
  '/admin/users': UsersIcon,
  '/admin/analytics': ChartBarSquareIcon
};

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const { branding, logoSrc } = useBranding();
  const location = useLocation();
  const navigate = useNavigate();
  const [accessDeniedModalOpen, setAccessDeniedModalOpen] = useState(false);
  const [accessDeniedNotice, setAccessDeniedNotice] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [headerAction, setHeaderAction] = useState(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const notificationsDesktopRef = useRef(null);
  const notificationsMobileRef = useRef(null);
  const forcedLogoutRef = useRef(false);
  const hasHydratedNotificationReadsRef = useRef(false);
  const skipNextNotificationPersistKeyRef = useRef('');
  const [readNotificationIds, setReadNotificationIds] = useState([]);
  const notificationReadRemoteKey = useMemo(() => {
    const normalizedEmail = String(user?.email || 'guest')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${NOTIFICATION_READ_REMOTE_PREFIX}_${normalizedEmail || 'guest'}`;
  }, [user?.email]);
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => auditService.getLogs().then((res) => res.data),
    staleTime: 5 * 1000,
    retry: false,
    refetchInterval: (query) => (query.state.status === 'error' || query.state.fetchFailureCount > 0 ? false : 5 * 1000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
  const { data: users = [], isFetched: areUsersFetched } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => userService.getUsers().then((res) => res.data),
    staleTime: 10 * 1000,
    retry: false,
    refetchInterval: (query) => (query.state.status === 'error' || query.state.fetchFailureCount > 0 ? false : 5 * 1000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true
  });
  const effectiveUser = useMemo(() => {
    const currentEmail = String(user?.email || '').trim().toLowerCase();
    if (!currentEmail) {
      return user || null;
    }

    const matched = users.find((entry) => String(entry?.email || '').trim().toLowerCase() === currentEmail);
    return matched || user || null;
  }, [user, users]);
  const firstName = getFirstName(effectiveUser?.name);
  const effectiveUserAvatar = getAdminAvatarSrc(effectiveUser || {});
  const hasFullAccess = FULL_ACCESS_ROLES.has(String(effectiveUser?.role || ''));
  const assignedAdminPages = useMemo(
    () => (Array.isArray(effectiveUser?.adminPageAccess) ? effectiveUser.adminPageAccess.map((path) => String(path || '').trim()).filter(Boolean) : []),
    [effectiveUser?.adminPageAccess]
  );
  const hasRoleBasedAdminAccess = hasFullAccess || assignedAdminPages.length > 0;
  const isSuperAdminRole = String(effectiveUser?.role || '') === 'Super Admin';
  const limitedAccessPaths = useMemo(() => {
    const normalized = [...new Set(assignedAdminPages)];
    if (normalized.includes('/admin')) {
      return normalized;
    }
    if (normalized.length === 0) {
      return ['/admin'];
    }
    return ['/admin', ...normalized];
  }, [assignedAdminPages]);
  const roleVisibleAdminNav = adminNav.filter((item) => item.path !== '/admin/gurdwara-branding' || isSuperAdminRole);
  const visibleNav = hasFullAccess
    ? roleVisibleAdminNav
    : roleVisibleAdminNav.filter((item) => limitedAccessPaths.includes(item.path));
  const primaryVisibleNav = visibleNav.filter((item) => item.path !== '/admin/gurdwara-branding');
  const brandingNavItem = visibleNav.find((item) => item.path === '/admin/gurdwara-branding');
  const adminSearchItems = useMemo(() => {
    const allowedPaths = new Set(visibleNav.map((item) => String(item.path || '').trim()).filter(Boolean));
    const pageItems = visibleNav
      .filter((item) => String(item.path || '').trim() !== '/admin/audit-trail')
      .map((item) => {
      const normalizedPath = String(item.path || '').trim();
      const pageSlug = normalizedPath === '/admin'
        ? 'dashboard'
        : normalizedPath.replace('/admin/', '').replace(/[-_]+/g, ' ').trim();

      return {
        id: `admin-search-page-${normalizedPath}`,
        type: 'admin',
        title: item.label,
        subtitle: normalizedPath,
        body: `Open ${item.label}`,
        keywords: [item.label, normalizedPath, pageSlug].filter(Boolean),
        route: normalizedPath,
        updatedAt: ''
      };
      });

    const userItems = allowedPaths.has('/admin/users')
      ? users.map((entry) => ({
        id: `admin-search-user-${entry.id}`,
        type: 'admin',
        title: String(entry.name || entry.email || 'User').trim(),
        subtitle: `Users - ${String(entry.role || 'Member').trim()}`,
        body: [
          entry.email,
          entry.phone,
          entry.address,
          entry.approvalStatus,
          entry.memberType,
          entry.id
        ].filter(Boolean).join(' '),
        keywords: [entry.role, entry.memberType, entry.approvalStatus].filter(Boolean),
        route: '/admin/users',
        updatedAt: entry.updatedAt || entry.createdAt || ''
      }))
      : [];

    return [...pageItems, ...userItems];
  }, [visibleNav, users]);
  const adminRemoteFullTextSearch = useCallback(async (query) => {
    const allowedPaths = new Set(
      visibleNav
        .map((item) => String(item.path || '').trim())
        .filter((path) => Boolean(path) && path !== '/admin/audit-trail')
    );

    const response = await phase2Service.searchFullText(query, { limit: 20, scope: 'admin' });
    const rows = Array.isArray(response?.data) ? response.data : [];

    return rows
      .map((row) => {
        const mappedRoute = mapPublicSearchRouteToAdmin(row.route);
        if (!mappedRoute || !allowedPaths.has(mappedRoute)) {
          return null;
        }

        return {
          ...row,
          id: `admin-remote-${String(row.type || 'content')}-${String(row.id || row.title || '')}-${mappedRoute}`,
          type: 'admin',
          route: mappedRoute,
          subtitle: String(row.subtitle || toNotificationPageLabel(mappedRoute)).trim()
        };
      })
      .filter(Boolean);
  }, [visibleNav]);
  const currentNavItem = [...adminNav]
    .sort((a, b) => b.path.length - a.path.length)
    .find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`));
  const pageTitle = currentNavItem?.label || (location.pathname.startsWith('/admin/analytics') ? 'Analytics and KPIs' : 'Admin');
  const pendingApprovals = useMemo(
    () => users.filter((entry) => String(entry?.approvalStatus || '').toLowerCase() === 'pending').length,
    [users]
  );
  const notifications = useMemo(() => {
    const items = [];

    if (pendingApprovals > 0) {
      items.push({
        id: 'pending-approvals',
        title: `${pendingApprovals} member approval${pendingApprovals === 1 ? '' : 's'} waiting`,
        meta: 'System',
        detail: 'Open Users and approve or reject pending profiles.',
        timeLabel: 'Action needed',
        href: '/admin/users',
        pagePath: '/admin/users',
        pageLabel: 'Users',
        actorLabel: 'System',
        urgent: true,
        kind: 'warning'
      });
    }

    const recentLogs = (Array.isArray(auditLogs) ? auditLogs : []).slice(0, 7).map((entry, index) => {
      const action = String(entry?.action || '').toLowerCase();
      const destinationPath = toNotificationHref(entry);
      const kind = action.includes('delete') || action.includes('remove')
        ? 'danger'
        : action.includes('create') || action.includes('add') || action.includes('approve')
          ? 'success'
          : 'info';

      return {
        id: toStableAuditNotificationId(entry, index),
        title: toSimpleActionLabel(entry),
        meta: `${entry?.actorName || entry?.actorEmail || 'System'}${entry?.actorRole ? ` • ${entry.actorRole}` : ''}`,
        detail: toNotificationDetail(entry),
        changeSummary: toNotificationChangeSummary(entry),
        affectedItem: toNotificationAffectedItem(entry),
        timeLabel: formatActivityTime(entry?.createdAt),
        href: destinationPath,
        pagePath: destinationPath,
        pageLabel: toNotificationPageLabel(destinationPath),
        actorLabel: entry?.actorName || entry?.actorEmail || 'System',
        urgent: false,
        kind
      };
    });

    const combined = [...items, ...recentLogs];
    if (hasFullAccess) {
      return combined.filter((entry) => entry.href).slice(0, 8);
    }

    return combined.filter((entry) => entry.href && limitedAccessPaths.includes(entry.href)).slice(0, 8);
  }, [auditLogs, hasFullAccess, limitedAccessPaths, pendingApprovals]);
  const unreadNotificationCount = useMemo(
    () => notifications.filter((entry) => !readNotificationIds.includes(entry.id)).length,
    [notifications, readNotificationIds]
  );

  const notificationCount = unreadNotificationCount;

  useEffect(() => {
    const state = location.state || {};
    if (!state.accessDenied) {
      return;
    }

    const message = "You don't have the right permissions for this page. Please check with admin.";
    setAccessDeniedNotice(message);
    setAccessDeniedModalOpen(true);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    setIsSearchModalOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (hasFullAccess) {
      return;
    }

    const isAllowed = limitedAccessPaths.some((path) => (
      path === '/admin'
        ? location.pathname === '/admin'
        : (location.pathname === path || location.pathname.startsWith(`${path}/`))
    ));

    if (isAllowed) {
      return;
    }

    navigate('/admin', {
      replace: true,
      state: {
        accessDenied: true,
        deniedPath: location.pathname
      }
    });
  }, [hasFullAccess, limitedAccessPaths, location.pathname, navigate]);

  useEffect(() => {
    if (forcedLogoutRef.current) {
      return;
    }

    if (!areUsersFetched) {
      return;
    }

    const currentEmail = String(user?.email || '').trim().toLowerCase();
    if (!currentEmail) {
      return;
    }

    const hasUserRecord = users.some((entry) => String(entry?.email || '').trim().toLowerCase() === currentEmail);
    const isInactive = effectiveUser?.isActive === false;
    const isApproved = hasRoleBasedAdminAccess
      ? true
      : String(effectiveUser?.approvalStatus || 'approved').trim().toLowerCase() === 'approved';
    const accessRevoked = hasRoleBasedAdminAccess
      ? isInactive
      : (!hasUserRecord || isInactive || !isApproved);

    if (!accessRevoked) {
      return;
    }

    forcedLogoutRef.current = true;
    try {
      window.sessionStorage.setItem('ssm_admin_logout_in_progress', '1');
    } catch {
      // Ignore storage write failures.
    }

    Promise.resolve(logout()).finally(() => {
      navigate('/', { replace: true, state: { accessNotice: 'account_inactive' } });
    });
  }, [areUsersFetched, effectiveUser?.approvalStatus, effectiveUser?.isActive, hasRoleBasedAdminAccess, logout, navigate, user?.email, users]);

  useEffect(() => {
    hasHydratedNotificationReadsRef.current = false;
    let cancelled = false;

    const hydrateNotificationReads = async () => {
      let nextReadIds = [];
      try {
        const remote = await contentApiService.getSingleton(notificationReadRemoteKey, null);
        const remoteReadIds = normalizeNotificationReadIds(remote?.readIds || remote?.ids || remote);
        nextReadIds = remoteReadIds;
      } catch {
        // Ignore remote read failures and keep empty fallback.
      }

      if (cancelled) {
        return;
      }

      setReadNotificationIds(nextReadIds);
      skipNextNotificationPersistKeyRef.current = notificationReadRemoteKey;
      hasHydratedNotificationReadsRef.current = true;
    };

    void hydrateNotificationReads();

    return () => {
      cancelled = true;
    };
  }, [notificationReadRemoteKey]);

  useEffect(() => {
    if (!hasHydratedNotificationReadsRef.current) {
      return;
    }

    if (skipNextNotificationPersistKeyRef.current === notificationReadRemoteKey) {
      skipNextNotificationPersistKeyRef.current = '';
      return;
    }

    void contentApiService.setSingleton(notificationReadRemoteKey, {
      readIds: normalizeNotificationReadIds(readNotificationIds),
      updatedAt: new Date().toISOString()
    }).catch(() => {
      // Ignore remote sync failures.
    });
  }, [notificationReadRemoteKey, readNotificationIds]);

  useEffect(() => {
    if (!isNotificationsOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const inDesktop = notificationsDesktopRef.current?.contains(event.target);
      const inMobile = notificationsMobileRef.current?.contains(event.target);
      if (!inDesktop && !inMobile) {
        setIsNotificationsOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isNotificationsOpen]);

  const handleLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    try {
      window.sessionStorage.setItem('ssm_admin_logout_in_progress', '1');
      window.sessionStorage.setItem('ssm_skip_login_auto_once', '1');
    } catch {
      // Ignore storage errors and continue logout flow.
    }

    setIsLoggingOut(true);
    navigate('/', { replace: true });

    try {
      try {
        await logout();
      } catch {
        // Continue redirect flow even if the API call fails.
      }
    } catch {
      // Ignore and keep user on public home.
    } finally {
      try {
        window.sessionStorage.removeItem('ssm_admin_logout_in_progress');
      } catch {
        // Ignore storage errors.
      }
    }
  };

  const markNotificationAsRead = (id) => {
    if (!id) {
      return;
    }
    setReadNotificationIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const markAllNotificationsAsRead = () => {
    setReadNotificationIds(notifications.map((entry) => entry.id));
  };

  const renderNotificationsPanel = (widthClassName) => (
    <div className={`absolute right-0 top-12 z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ${widthClassName}`}>
        <div className="flex items-center justify-between border-b border-slate-700/40 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-blue px-3 py-2 text-white">
        <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-white">Notifications</p>
            <p className="text-[10px] text-slate-200">{unreadNotificationCount} unread</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllNotificationsAsRead}
              className="text-[11px] font-semibold text-slate-100 underline underline-offset-2 disabled:opacity-50"
            disabled={unreadNotificationCount === 0}
          >
            Mark all read
          </button>
            <Link to="/admin/audit-trail" onClick={() => setIsNotificationsOpen(false)} className="text-[11px] font-semibold text-white underline underline-offset-2">
            View all
          </Link>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto p-1">
        {notifications.length === 0 ? <p className="p-2 text-xs text-slate-500">No new activities.</p> : null}
        {notifications.map((entry) => {
          const isRead = readNotificationIds.includes(entry.id);
          const NotificationIcon = iconByPath[entry.pagePath] || BellAlertIcon;
          return (
            <div
              key={entry.id}
              onMouseEnter={() => markNotificationAsRead(entry.id)}
              onFocus={() => markNotificationAsRead(entry.id)}
              className={`group relative mb-1 overflow-hidden rounded-xl border px-2.5 py-2 transition hover:shadow-md ${getNotificationToneClasses(entry, isRead)}`}
            >
              <span className="absolute inset-y-0 left-0 w-1 bg-slate-900/20" aria-hidden="true" />
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={entry.href}
                  onClick={() => {
                    markNotificationAsRead(entry.id);
                    setIsNotificationsOpen(false);
                  }}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300/80 bg-white/85 text-slate-700">
                      <NotificationIcon className="h-3 w-3" />
                    </span>
                    <span className="rounded-full border border-slate-300/70 bg-white/80 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-slate-600">{entry.pageLabel || 'Admin'}</span>
                    <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500">{entry.timeLabel}</p>
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-800">{entry.title}</p>
                  <p className="truncate text-[10px] text-slate-600">By {entry.meta || entry.actorLabel || 'System'}</p>
                </Link>
                <button
                  type="button"
                  onClick={() => markNotificationAsRead(entry.id)}
                  disabled={isRead}
                  className="shrink-0 rounded border border-slate-300 bg-white px-1 py-0.5 text-[9px] font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRead ? 'Read' : 'Mark read'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-brand-cream dark:bg-slate-950">
      <div className="grid min-w-0 grid-cols-1 lg:min-h-screen lg:grid-cols-[270px_1fr]">
      <aside className="hidden border-r border-slate-800 bg-slate-950 p-4 text-slate-100 lg:block lg:min-h-full lg:self-stretch">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-heading text-xl font-bold text-white">
            <img src={logoSrc} alt={`${branding.shortName} logo`} className="brand-logo h-8 w-8 rounded-full border border-brand-saffron/70 object-cover" />
            Admin Portal
          </p>
          <button
            type="button"
            onClick={() => setIsSearchModalOpen(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-brand-saffron transition hover:bg-white/20"
            aria-label="Open admin search"
            title="Search accessible content"
          >
            <MagnifyingGlassIcon className="h-4 w-4" />
          </button>
        </div>
        <nav className="mt-6 grid gap-2" aria-label="Admin navigation">
          {primaryVisibleNav.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-blue text-white' : 'text-slate-300 hover:bg-slate-800'}`
              }
            >
              {(() => {
                const Icon = iconByPath[item.path] || Squares2X2Icon;
                return (
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </span>
                );
              })()}
            </NavLink>
          ))}
          {brandingNavItem ? (
            <div className="mt-4 border-t border-slate-700 pt-4">
              <NavLink
                to={brandingNavItem.path}
                className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-blue text-white' : 'text-slate-300 hover:bg-slate-800'}`}
              >
                <span className="inline-flex items-center gap-2"><SwatchIcon className="h-4 w-4" /><span>{brandingNavItem.label}</span></span>
              </NavLink>
            </div>
          ) : null}
        </nav>
      </aside>
      <main className="admin-main-content min-w-0 overflow-x-hidden p-4 md:p-8">
        <div className="mb-6 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 lg:hidden"
                aria-label="Open admin menu"
              >
                <Bars3Icon className="h-5 w-5" />
              </button>
              <h1 className="min-w-0 truncate font-heading text-xl font-bold leading-tight text-slate-900 sm:text-3xl">{pageTitle}</h1>
              {headerAction ? <div className="flex-shrink-0">{headerAction}</div> : null}
            </div>

            <div className="relative flex flex-shrink-0 items-center gap-1.5 lg:hidden" ref={notificationsMobileRef}>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700"
                aria-label="Open admin notifications"
                aria-expanded={isNotificationsOpen}
              >
                <BellIcon className="h-5 w-5" />
                {notificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                ) : null}
              </button>
              <img
                src={effectiveUserAvatar}
                alt={effectiveUser?.name || 'Profile'}
                className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                onError={(event) => {
                  const fallback = getAdminAvatarFallback(effectiveUser?.name || 'Member');
                  if (event.currentTarget.src !== fallback) {
                    event.currentTarget.src = fallback;
                  }
                }}
              />
              <Link
                to="/"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700"
                aria-label="Go to website"
                title="Go to website"
              >
                <ArrowTopRightOnSquareIcon className="h-5 w-5 stroke-2" />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Logout"
                title="Logout"
              >
                <PowerIcon className="h-5 w-5 stroke-2" />
              </button>

              {isNotificationsOpen ? (
                renderNotificationsPanel('w-[min(88vw,22rem)]')
              ) : null}
            </div>

            <div className="relative hidden items-center gap-3 lg:flex" ref={notificationsDesktopRef}>
              <button
                type="button"
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-brand-blue/40 hover:text-brand-blue"
                aria-label="Open admin notifications"
                aria-expanded={isNotificationsOpen}
              >
                <BellIcon className="h-5 w-5" />
                {notificationCount > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                ) : null}
              </button>
              <img
                src={effectiveUserAvatar}
                alt={effectiveUser?.name || 'Profile'}
                className="h-9 w-9 rounded-full border border-slate-200 object-cover"
                onError={(event) => {
                  const fallback = getAdminAvatarFallback(effectiveUser?.name || 'Member');
                  if (event.currentTarget.src !== fallback) {
                    event.currentTarget.src = fallback;
                  }
                }}
              />
              <p className="text-base font-extrabold text-slate-800">{firstName}</p>
              <Link
                to="/"
                className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              >
                Go to Website
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="text-sm font-semibold text-slate-700 underline underline-offset-4"
              >
                Logout
              </button>

              {isNotificationsOpen ? (
                renderNotificationsPanel('w-[22rem]')
              ) : null}
            </div>
          </div>
        </div>
        <Outlet context={{ setHeaderAction }} />

        {accessDeniedModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4" role="dialog" aria-modal="true" aria-live="assertive">
            <div className="w-full max-w-md rounded-2xl border border-rose-300 bg-white p-5 shadow-2xl">
              <h2 className="text-lg font-bold text-rose-800">Access Restricted</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{accessDeniedNotice || "You don't have the right permissions for this page. Please check with admin."}</p>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setAccessDeniedModalOpen(false)}
                  className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-[140] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/60"
            aria-label="Close admin menu"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative h-full w-[86%] max-w-[320px] overflow-y-auto border-r border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-heading text-xl font-bold text-white">
                <img src={logoSrc} alt={`${branding.shortName} logo`} className="h-8 w-8 rounded-full border border-brand-saffron/70 object-cover" />
                Admin Portal
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setIsSearchModalOpen(true);
                  }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-brand-saffron transition hover:bg-white/20"
                  aria-label="Open admin search"
                  title="Search accessible pages"
                >
                  <MagnifyingGlassIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded-md border border-slate-700 p-1 text-slate-300"
                  aria-label="Close admin menu"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>
            </div>

            <nav className="mt-6 grid gap-2" aria-label="Admin navigation mobile">
              {primaryVisibleNav.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/admin'}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-blue text-white' : 'text-slate-300 hover:bg-slate-800'}`
                  }
                >
                  {(() => {
                    const Icon = iconByPath[item.path] || Squares2X2Icon;
                    return (
                      <span className="inline-flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </span>
                    );
                  })()}
                </NavLink>
              ))}
              {brandingNavItem ? (
                <div className="mt-4 border-t border-slate-700 pt-4">
                  <NavLink
                    to={brandingNavItem.path}
                    onClick={() => setMobileNavOpen(false)}
                    className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-brand-blue text-white' : 'text-slate-300 hover:bg-slate-800'}`}
                  >
                    <span className="inline-flex items-center gap-2"><SwatchIcon className="h-4 w-4" /><span>{brandingNavItem.label}</span></span>
                  </NavLink>
                </div>
              ) : null}
            </nav>
          </aside>
        </div>
      ) : null}

      {isLoggingOut ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-950/65 px-4" role="status" aria-live="assertive" aria-label="Logging out">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <img
              src={logoSrc}
              alt={`${branding.shortName} logo`}
              className="mx-auto h-16 w-16 rounded-full border border-brand-saffron/70 object-cover"
            />
            <div className="mx-auto mt-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-blue" />
            <p className="mt-4 text-sm font-semibold text-slate-800">You are currently being logged out, please wait.</p>
          </div>
        </div>
      ) : null}

      {isSearchModalOpen ? createPortal(
        <div className="fixed inset-0 z-[281] flex items-start justify-center bg-slate-950/45 px-5 py-20 backdrop-blur-sm sm:px-4" onClick={() => setIsSearchModalOpen(false)}>
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_30px_70px_-34px_rgba(15,23,42,0.75)]" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Search</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSearchModalOpen(false)}
                className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100"
                aria-label="Close search modal"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            <GlobalSearchBar
              className="w-full px-2 sm:px-0"
              inputClassName="py-2.5"
              placeholder="Search accessible content"
              autoFocus
              inputId="admin-global-search-modal"
              items={adminSearchItems}
              remoteSearchFn={adminRemoteFullTextSearch}
              scope="admin"
              onResultSelect={() => setIsSearchModalOpen(false)}
            />
          </div>
        </div>
      , document.body) : null}
    </div>
  );
};

export default AdminLayout;
