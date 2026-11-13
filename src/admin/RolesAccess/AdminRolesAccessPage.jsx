import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, PencilSquareIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import AdminHeaderActionButton from '../../components/ui/AdminHeaderActionButton';
import { adminNav } from '../../constants/navigation';
import { useAuth } from '../../context/AuthContext';
import contentApiService from '../../services/contentApiService';
import userService from '../../services/userService';

const STANDARD_ROLES = new Set(['Family', 'Member', 'Volunteer', 'Admin', 'Super Admin']);
const CUSTOM_ROLE_RESOURCE = 'admin_roles';
const PUBLIC_TITLE_RESOURCE = 'public_titles';
const DEFAULT_PUBLIC_TITLES = ['President', 'Member', 'Volunteer'];
const FULL_ACCESS_ROLES = new Set(['Super Admin', 'Admin']);
const adminPageOptions = adminNav.map((item) => ({ label: item.label, path: item.path }));
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

const SYSTEM_ROLE_ACCESS = {
  Family: [],
  'Super Admin': adminPageOptions.map((item) => item.path),
  Admin: adminPageOptions.map((item) => item.path),
  Member: MEMBER_ALLOWED_ADMIN_PAGE_PATHS,
  Volunteer: VOLUNTEER_ALLOWED_ADMIN_PAGE_PATHS
};

const normalizeAdminPageAccess = (value = []) => {
  const normalized = Array.isArray(value) ? value.map((path) => String(path || '').trim()).filter(Boolean) : [];
  return [...new Set(normalized.filter((path) => adminPageOptions.some((item) => item.path === path)))];
};

const normalizeRoleRecords = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();
  return value
    .map((entry) => ({
      name: String(entry?.name || '').trim(),
      adminPageAccess: normalizeAdminPageAccess(entry?.adminPageAccess),
      isSystem: STANDARD_ROLES.has(String(entry?.name || '').trim())
    }))
    .filter((entry) => entry.name && !seen.has(entry.name) && seen.add(entry.name));
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

const emptyEditor = { name: '', adminPageAccess: [] };
const MEMBERS_PAGE_SIZE = 10;

const getAvatarSrc = (entry = {}) => (
  entry.avatarUrl || entry.picture || entry.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(entry?.name || 'User')}`
);

const AdminRolesAccessPage = () => {
  const { setHeaderAction } = useOutletContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasFullAccess = FULL_ACCESS_ROLES.has(String(user?.role || ''));

  const [editorOpen, setEditorOpen] = useState(false);
  const [viewRole, setViewRole] = useState(null);
  const [roleNotice, setRoleNotice] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editorState, setEditorState] = useState(emptyEditor);
  const [membersRole, setMembersRole] = useState(null);
  const [membersPage, setMembersPage] = useState(1);
  const [titleEditorOpen, setTitleEditorOpen] = useState(false);
  const [editingTitle, setEditingTitle] = useState('');
  const [titleName, setTitleName] = useState('');
  const [titleNotice, setTitleNotice] = useState('');

  const { data: roleDefinitions = [] } = useQuery({
    queryKey: ['admin-role-definitions'],
    queryFn: () => contentApiService.getSingleton(CUSTOM_ROLE_RESOURCE, []).then((res) => normalizeRoleRecords(res || [])),
    enabled: hasFullAccess
  });

  const { data: users = [] } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => contentApiService.list('users'),
    enabled: hasFullAccess
  });
  const { data: managedPublicTitles = [] } = useQuery({
    queryKey: ['admin-public-titles'],
    queryFn: () => contentApiService.getSingleton(PUBLIC_TITLE_RESOURCE, DEFAULT_PUBLIC_TITLES).then((res) => normalizePublicTitles(res || [])),
    enabled: hasFullAccess
  });

  const saveMutation = useMutation({
    mutationFn: async ({ definitions, renamedFrom = '', renamedTo = '', renamedAccess = [] }) => {
      if (renamedFrom && renamedTo && renamedFrom !== renamedTo) {
        const assignedUsers = users.filter((entry) => String(entry?.role || '').trim() === renamedFrom);
        await Promise.all(assignedUsers.map((entry) => contentApiService.update('users', entry.id, {
          ...entry,
          role: renamedTo,
          adminPageAccess: renamedAccess,
          updatedAt: new Date().toISOString()
        })));
      }

      await contentApiService.setSingleton(CUSTOM_ROLE_RESOURCE, definitions);
      return definitions;
    },
    onSuccess: async () => {
      setRoleNotice('');
      setEditorState(emptyEditor);
      setEditingName('');
      setEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-role-definitions'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    }
  });

  const savePublicTitlesMutation = useMutation({
    mutationFn: async ({ titles, renamedFrom = '', renamedTo = '' }) => {
      if (renamedFrom && renamedTo && renamedFrom !== renamedTo) {
        const assignedUsers = users.filter((entry) => String(entry?.title || '').trim() === renamedFrom);
        await Promise.all(assignedUsers.map((entry) => contentApiService.update('users', entry.id, {
          ...entry,
          title: renamedTo,
          updatedAt: new Date().toISOString()
        })));
      }

      await contentApiService.setSingleton(PUBLIC_TITLE_RESOURCE, titles);
      return titles;
    },
    onSuccess: async () => {
      setTitleNotice('');
      setEditingTitle('');
      setTitleName('');
      setTitleEditorOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-public-titles'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      await queryClient.invalidateQueries({ queryKey: ['public-members'] });
    },
    onError: (error) => {
      setTitleNotice(String(error?.message || 'Unable to save public titles.'));
    }
  });

  const openAddRole = () => {
    setRoleNotice('');
    setEditingName('');
    setEditorState(emptyEditor);
    setEditorOpen(true);
  };

  const openEditRole = (role) => {
    setRoleNotice('');
    setEditingName(role.name);
    setEditorState({
      name: role.name,
      adminPageAccess: normalizeAdminPageAccess(role.adminPageAccess)
    });
    setEditorOpen(true);
  };

  const deleteRole = async (roleName) => {
    if (STANDARD_ROLES.has(roleName)) {
      setRoleNotice(`System role ${roleName} cannot be deleted.`);
      return;
    }

    const latestUsers = await userService.getUsers().then((res) => res.data || []);
    const isAssigned = latestUsers.some((entry) => String(entry?.role || '').trim() === roleName);
    if (isAssigned) {
      setRoleNotice(`Cannot delete ${roleName} because users are assigned to this role.`);
      return;
    }

    const next = roleDefinitions.filter((entry) => entry.name !== roleName);
    saveMutation.mutate(next);
  };

  const toggleRoleAccess = (path) => {
    setEditorState((prev) => ({
      ...prev,
      adminPageAccess: prev.adminPageAccess.includes(path)
        ? prev.adminPageAccess.filter((item) => item !== path)
        : [...prev.adminPageAccess, path]
    }));
  };

  const saveRole = () => {
    const normalizedName = String(editorState.name || '').trim();
    const normalizedAccess = normalizeAdminPageAccess(editorState.adminPageAccess);
    const isEditingSystemRole = STANDARD_ROLES.has(editingName);

    if (!normalizedName) {
      setRoleNotice('Role name is required.');
      return;
    }

    if (isEditingSystemRole && normalizedName !== editingName) {
      setRoleNotice('System role names cannot be changed.');
      return;
    }

    if (normalizedAccess.length === 0) {
      setRoleNotice('Select at least one page for this role.');
      return;
    }

    const duplicate = roleDefinitions.some((entry) => entry.name === normalizedName && entry.name !== editingName);
    if (duplicate) {
      setRoleNotice('A role with this name already exists.');
      return;
    }

    const payloadName = isEditingSystemRole ? editingName : normalizedName;
    const next = roleDefinitions.map((entry) => (entry.name === editingName ? { name: payloadName, adminPageAccess: normalizedAccess } : entry));
    const roleExists = next.some((entry) => entry.name === payloadName);
    const nextDefinitions = roleExists
      ? next.map((entry) => (entry.name === payloadName ? { name: payloadName, adminPageAccess: normalizedAccess } : entry))
      : [...next, { name: payloadName, adminPageAccess: normalizedAccess }];

    saveMutation.mutate({
      definitions: nextDefinitions,
      renamedFrom: !isEditingSystemRole && editingName && normalizedName !== editingName ? editingName : '',
      renamedTo: !isEditingSystemRole && editingName && normalizedName !== editingName ? normalizedName : '',
      renamedAccess: normalizedAccess
    });
  };

  const publicTitleRows = useMemo(() => {
    const titles = normalizePublicTitles([...managedPublicTitles, ...users.map((entry) => entry.title)]);
    return titles.map((title) => ({
      name: title,
      userCount: users.filter((entry) => String(entry?.title || '').trim() === title).length
    }));
  }, [managedPublicTitles, users]);

  const openAddPublicTitle = () => {
    setTitleNotice('');
    setEditingTitle('');
    setTitleName('');
    setTitleEditorOpen(true);
  };

  const openEditPublicTitle = (title) => {
    setTitleNotice('');
    setEditingTitle(title);
    setTitleName(title);
    setTitleEditorOpen(true);
  };

  const savePublicTitle = () => {
    const normalizedName = String(titleName || '').trim();
    if (!normalizedName) {
      setTitleNotice('Public title is required.');
      return;
    }

    const duplicate = publicTitleRows.some((entry) => entry.name.toLowerCase() === normalizedName.toLowerCase() && entry.name !== editingTitle);
    if (duplicate) {
      setTitleNotice('A public title with this name already exists.');
      return;
    }

    const currentTitles = publicTitleRows.map((entry) => entry.name);
    const nextTitles = editingTitle
      ? currentTitles.map((title) => (title === editingTitle ? normalizedName : title))
      : [...currentTitles, normalizedName];
    savePublicTitlesMutation.mutate({
      titles: normalizePublicTitles(nextTitles),
      renamedFrom: editingTitle,
      renamedTo: normalizedName
    });
  };

  const deletePublicTitle = async (title) => {
    const latestUsers = await userService.getUsers().then((res) => res.data || []);
    const isAssigned = latestUsers.some((entry) => String(entry?.title || '').trim() === title);
    if (isAssigned) {
      setTitleNotice(`Cannot delete ${title} because users are assigned to this public title.`);
      return;
    }

    setTitleNotice('');
    savePublicTitlesMutation.mutate({ titles: publicTitleRows.map((entry) => entry.name).filter((entry) => entry !== title) });
  };

  const roleRows = useMemo(() => {
    const systemRows = ['Family', 'Member', 'Volunteer', 'Admin', 'Super Admin'].map((name) => {
      const override = roleDefinitions.find((entry) => entry.name === name);
      const adminPageAccess = normalizeAdminPageAccess(override?.adminPageAccess || SYSTEM_ROLE_ACCESS[name] || []);
      return {
        name,
        adminPageAccess,
        pageCount: adminPageAccess.length,
        isSystem: true
      };
    });

    const customRows = roleDefinitions.filter((entry) => !STANDARD_ROLES.has(entry.name)).map((entry) => {
      const adminPageAccess = normalizeAdminPageAccess(entry.adminPageAccess);
      return {
        ...entry,
        adminPageAccess,
        pageCount: adminPageAccess.length,
        isSystem: false
      };
    });

    return [...systemRows, ...customRows];
  }, [roleDefinitions]);

  const roleUserMap = useMemo(() => {
    const map = new Map();
    users.forEach((entry) => {
      const roleName = String(entry?.role || '').trim();
      if (!roleName) {
        return;
      }

      if (!map.has(roleName)) {
        map.set(roleName, []);
      }

      map.get(roleName).push(entry);
    });

    return map;
  }, [users]);

  const roleRowsWithUsers = useMemo(() => roleRows.map((role) => {
    const assignedUsers = roleUserMap.get(role.name) || [];
    return {
      ...role,
      assignedUsers,
      userCount: assignedUsers.length
    };
  }), [roleRows, roleUserMap]);

  const membersForSelectedRole = useMemo(() => {
    if (!membersRole) {
      return [];
    }

    return roleUserMap.get(membersRole.name) || [];
  }, [membersRole, roleUserMap]);

  const membersTotalPages = Math.max(1, Math.ceil(membersForSelectedRole.length / MEMBERS_PAGE_SIZE));
  const safeMembersPage = Math.min(membersPage, membersTotalPages);
  const pagedMembers = useMemo(() => {
    const startIndex = (safeMembersPage - 1) * MEMBERS_PAGE_SIZE;
    return membersForSelectedRole.slice(startIndex, startIndex + MEMBERS_PAGE_SIZE);
  }, [membersForSelectedRole, safeMembersPage]);

  const openMembersModal = (role) => {
    setMembersRole(role);
    setMembersPage(1);
  };

  useEffect(() => {
    if (!membersRole) {
      return;
    }

    if (safeMembersPage !== membersPage) {
      setMembersPage(safeMembersPage);
    }
  }, [membersRole, membersPage, safeMembersPage]);

  useEffect(() => {
    if (!hasFullAccess) {
      setHeaderAction(null);
      return undefined;
    }

    setHeaderAction(<AdminHeaderActionButton label="Add Role" onClick={openAddRole} />);
    return () => setHeaderAction(null);
  }, [hasFullAccess, setHeaderAction]);

  if (!hasFullAccess) {
    return (
      <Card>
        <p className="text-sm text-slate-700">Only Admin and Super Admin can manage roles and access.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        {roleNotice ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{roleNotice}</p>
        ) : null}

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Pages Access</th>
                <th className="px-3 py-2.5">Users</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {roleRowsWithUsers.map((role) => (
                <tr key={role.name} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">
                    <div className="flex items-center gap-2">
                      <span>{role.name}</span>
                      {role.isSystem ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">System</span> : null}
                      {!role.isSystem ? <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Custom</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    <div className="flex flex-wrap gap-1.5">
                      {role.adminPageAccess.map((path) => {
                        const label = adminPageOptions.find((item) => item.path === path)?.label || path;
                        return (
                          <span key={`${role.name}-${path}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => openMembersModal(role)}
                      className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      {role.userCount}
                    </button>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setViewRole(role)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100" aria-label="View role" title="View">
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => openEditRole(role)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50" aria-label="Edit role" title="Edit">
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      {!role.isSystem ? (
                        <button type="button" onClick={() => deleteRole(role.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50" aria-label="Delete role" title="Delete">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {roleDefinitions.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-center text-slate-500" colSpan={4}>No custom roles created yet. System roles are listed above.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {roleRowsWithUsers.length > 0 ? roleRowsWithUsers.map((role) => (
            <div key={role.name} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-bold text-slate-900">{role.name}</p>
                  </div>
                  <p className="text-xs text-slate-600">{role.pageCount} pages • {role.userCount} users</p>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setViewRole(role)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-700"><EyeIcon className="h-4 w-4" /></button>
                  <button type="button" onClick={() => openEditRole(role)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700"><PencilSquareIcon className="h-4 w-4" /></button>
                  {!role.isSystem ? (
                    <button type="button" onClick={() => deleteRole(role.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700" aria-label="Delete role" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                  ) : null}
                </div>
              </div>
              <div className="mt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openMembersModal(role)}
                    className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    View users ({role.userCount})
                  </button>
                  {role.isSystem ? <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">System</span> : <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">Custom</span>}
                </div>
              </div>
              <div className="mt-3 h-px bg-slate-200" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.adminPageAccess.map((path) => {
                  const label = adminPageOptions.find((item) => item.path === path)?.label || path;
                  return (
                    <span key={`${role.name}-${path}`} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      {label}
                    </span>
                  );
                })}
              </div>
            </div>
          )) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
              No custom roles created yet.
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="admin-card-header-row mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Public Titles</h2>
          </div>
          <Button type="button" onClick={openAddPublicTitle}>Add Title</Button>
        </div>

        {titleNotice ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{titleNotice}</p>
        ) : null}

        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 lg:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Public Title</th>
                <th className="px-3 py-2.5">Users</th>
                <th className="px-3 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {publicTitleRows.map((title) => (
                <tr key={title.name} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 font-semibold text-slate-800">{title.name}</td>
                  <td className="px-3 py-2.5 text-slate-700">{title.userCount}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEditPublicTitle(title.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50" aria-label={`Edit ${title.name} public title`} title="Edit">
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => deletePublicTitle(title.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50" aria-label={`Delete ${title.name} public title`} title="Delete">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 lg:hidden">
          {publicTitleRows.map((title) => (
            <div key={title.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{title.name}</p>
                <p className="text-xs text-slate-600">{title.userCount} assigned user{title.userCount === 1 ? '' : 's'}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => openEditPublicTitle(title.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-blue-200 text-blue-700" aria-label={`Edit ${title.name} public title`}><PencilSquareIcon className="h-4 w-4" /></button>
                <button type="button" onClick={() => deletePublicTitle(title.name)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700" aria-label={`Delete ${title.name} public title`}><TrashIcon className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setEditorOpen(false)} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-blue px-6 py-5 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Role Management</p>
                <h3 className="mt-1 font-heading text-2xl font-semibold">{editingName ? 'Edit Role' : 'Add Role'}</h3>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close role editor">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <label className="text-sm font-semibold text-slate-700">Role name
                <input
                  value={editorState.name}
                  onChange={(event) => setEditorState((prev) => ({ ...prev, name: event.target.value }))}
                  disabled={STANDARD_ROLES.has(editingName)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue"
                  placeholder="e.g. Event Lead"
                />
              </label>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="mt-1 grid gap-3 md:grid-cols-2">
                  {adminPageOptions.map((item) => {
                    const isChecked = editorState.adminPageAccess.includes(item.path);
                    return (
                      <label key={item.path} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition ${isChecked ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRoleAccess(item.path)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                        />
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                          <p className="text-[11px] text-slate-500">{item.path}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
                <Button type="button" onClick={saveRole} disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Saving...' : (editingName ? 'Update Role' : 'Create Role')}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {titleEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setTitleEditorOpen(false)} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-blue px-6 py-5 text-white">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">Public Profile</p>
                <h3 className="mt-1 font-heading text-2xl font-semibold">{editingTitle ? 'Edit Public Title' : 'Add Public Title'}</h3>
              </div>
              <button type="button" onClick={() => setTitleEditorOpen(false)} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close public title editor">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <label className="text-sm font-semibold text-slate-700">Public title
                <input value={titleName} onChange={(event) => setTitleName(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 shadow-sm outline-none transition focus:border-brand-blue" placeholder="e.g. Treasurer" autoFocus />
              </label>
              <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={() => setTitleEditorOpen(false)}>Cancel</Button>
                <Button type="button" onClick={savePublicTitle} disabled={savePublicTitlesMutation.isPending}>{savePublicTitlesMutation.isPending ? 'Saving...' : (editingTitle ? 'Update Title' : 'Create Title')}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {viewRole ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setViewRole(null)} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-blue px-6 py-5 text-white">
              <h3 className="font-heading text-2xl font-semibold">{viewRole.name}</h3>
              <button type="button" onClick={() => setViewRole(null)} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close role view">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap gap-2">
                {normalizeAdminPageAccess(viewRole.adminPageAccess).map((path) => {
                  const label = adminPageOptions.find((item) => item.path === path)?.label || path;
                  return (
                    <span key={`${viewRole.name}-${path}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">{label}</span>
                  );
                })}
              </div>
              <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={() => setViewRole(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {membersRole ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMembersRole(null)} aria-hidden="true" />
          <div className="relative z-10 my-4 flex max-h-[calc(100vh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 sm:my-6 sm:max-h-[calc(100vh-3rem)]">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-950 via-slate-900 to-brand-blue px-6 py-5 text-white">
              <div>
                <h3 className="font-heading text-2xl font-semibold">{membersRole.name} Users</h3>
                <p className="mt-1 text-sm text-white/75">Showing {membersForSelectedRole.length} assigned users</p>
              </div>
              <button type="button" onClick={() => setMembersRole(null)} className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close role members modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {pagedMembers.length > 0 ? (
                <div className="space-y-3">
                  {pagedMembers.map((member) => (
                    <div key={member.id || `${membersRole.name}-${member.email}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                      <img
                        src={getAvatarSrc(member)}
                        alt={member?.name || 'User'}
                        className="h-10 w-10 rounded-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{member?.name || '-'}</p>
                        <p className="truncate text-xs text-slate-600">{member?.email || '-'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">
                  No users assigned to this role.
                </div>
              )}

              {membersForSelectedRole.length > MEMBERS_PAGE_SIZE ? (
                <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <button
                    type="button"
                    onClick={() => setMembersPage((prev) => Math.max(1, prev - 1))}
                    disabled={safeMembersPage === 1}
                    className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Page {safeMembersPage} of {membersTotalPages}
                  </p>
                  <button
                    type="button"
                    onClick={() => setMembersPage((prev) => Math.min(membersTotalPages, prev + 1))}
                    disabled={safeMembersPage >= membersTotalPages}
                    className="rounded-full border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              ) : null}

              <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                <Button type="button" variant="ghost" onClick={() => setMembersRole(null)}>Close</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminRolesAccessPage;
