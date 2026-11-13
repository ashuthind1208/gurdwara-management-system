import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import Card from '../../components/ui/Card';
import auditService from '../../services/auditService';

const PAGE_SIZE = 20;

const CleanupConfirmation = ({ daysToKeep, pending, error, onClose, onConfirm }) => {
  const dialogRef = useRef(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled)')];
    const focusFirst = () => (focusable()[0] || dialog).focus();
    document.body.style.overflow = 'hidden';
    focusFirst();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!pendingRef.current) onClose();
      }
      if (event.key === 'Tab') {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }
    };
    const onFocus = (event) => { if (!dialog.contains(event.target)) focusFirst(); };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);
  useEffect(() => { if (pending) dialogRef.current?.focus(); }, [pending]);

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/65 p-4">
      <section ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="audit-cleanup-title" aria-describedby="audit-cleanup-description" aria-busy={pending} data-delete-guard-ignore="true" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-red-200 bg-white p-6 shadow-2xl">
        <h3 id="audit-cleanup-title" className="text-xl font-semibold text-slate-900">Confirm audit trail deletion</h3>
        <p id="audit-cleanup-description" className="mt-3 text-sm text-slate-700">
          {daysToKeep === null
            ? 'Permanently delete the entire audit trail, including all recent entries. No audit entries will be retained.'
            : `Permanently delete audit entries older than ${daysToKeep} days. Entries from the last ${daysToKeep} days will be retained. The cutoff is calculated by the server when deletion runs.`}
          {' '}This cannot be undone. This applies to all audit entries in this scope, not just the current search or page. No other records will be deleted.
        </p>
        {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
        {pending ? <p role="status" className="mt-3 text-sm text-slate-600">Deleting audit entries… Please wait.</p> : null}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" disabled={pending} onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" disabled={pending} onClick={onConfirm} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Permanently delete</button>
        </div>
      </section>
    </div>, document.body
  );
};

const AdminAuditTrailPage = () => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [retention, setRetention] = useState('30');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [cleanupError, setCleanupError] = useState('');
  const [success, setSuccess] = useState('');
  const closeConfirmation = useCallback(() => setConfirmOpen(false), []);
  const { data: logs = [], isPending, isError, refetch } = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => auditService.getLogs().then((res) => res.data)
  });
  const daysToKeep = retention === 'all' ? null : Number(retention);
  const cleanup = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setCleanupError('');
    setSuccess('');
    try {
      const { data } = await auditService.cleanupLogs(daysToKeep);
      setSuccess(`Deleted ${data.deletedCount} audit ${data.deletedCount === 1 ? 'entry' : 'entries'}.`);
      setPage(1);
      try {
        await refetch({ throwOnError: true });
      } catch {
        setCleanupError('Deletion completed, but the audit trail could not be refreshed. Reload the page to see the current trail.');
      }
      setConfirmOpen(false);
    } catch (error) {
      setCleanupError(error.message || 'Unable to delete audit entries.');
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = String(search || '').trim().toLowerCase();
    if (!needle) {
      return logs;
    }

    return logs.filter((entry) => {
      const haystack = [
        entry?.action,
        entry?.targetType,
        entry?.targetId,
        entry?.actorEmail,
        entry?.actorRole,
        entry?.actorName,
        entry?.description
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [logs, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card className="border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-slate-900">Admin Audit Trail</h2>
            <p className="text-xs text-slate-600">Track create, update, and delete operations made through the admin portal.</p>
          </div>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search by action, target, or actor"
            className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </Card>

      <Card className="border border-red-200 bg-white">
        <h3 className="font-semibold text-slate-900">Audit trail cleanup</h3>
        <p className="mt-1 text-sm text-slate-600">Permanently delete older entries or the entire trail. This is a one-time action, not an automatic retention policy.</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-700">
            Entries to delete
            <select value={retention} disabled={pending || confirmOpen} onChange={(event) => setRetention(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 disabled:opacity-50">
              <option value="30">Older than 30 days</option>
              <option value="60">Older than 60 days</option>
              <option value="90">Older than 90 days</option>
              <option value="all">Entire audit trail</option>
            </select>
          </label>
          <button type="button" disabled={pending} data-delete-guard-ignore="true" onClick={() => { setCleanupError(''); setSuccess(''); setConfirmOpen(true); }} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Delete audit trail</button>
        </div>
        {success ? <p role="status" className="mt-3 text-sm text-green-800">{success}</p> : null}
        {cleanupError && !confirmOpen ? <p role="alert" className="mt-3 text-sm text-red-700">{cleanupError}</p> : null}
      </Card>

      {confirmOpen ? <CleanupConfirmation daysToKeep={daysToKeep} pending={pending} error={cleanupError} onClose={closeConfirmation} onConfirm={cleanup} /> : null}
      {isPending ? <p role="status">Loading audit trail…</p> : null}
      {isError ? <p role="alert">Unable to load the audit trail. Please reload or try again.</p> : null}
      {!isPending && !isError ? (
      <Card className="border border-slate-200 bg-white">
        <div className="hidden overflow-x-auto xl:block">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((entry) => (
                <tr key={entry.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2 text-xs text-slate-600">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}</td>
                  <td className="px-3 py-2 font-semibold text-slate-800">{entry.action || '-'}</td>
                  <td className="px-3 py-2 text-slate-700">{entry.targetType || '-'} {entry.targetId ? `(${entry.targetId})` : ''}</td>
                  <td className="px-3 py-2 text-slate-700">{entry.actorName || entry.actorEmail || '-'}{entry.actorRole ? ` • ${entry.actorRole}` : ''}</td>
                  <td className="px-3 py-2 text-slate-700">{entry.description || '-'}</td>
                </tr>
              ))}
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-sm text-slate-500">No audit entries found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 xl:hidden">
          {pagedRows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No audit entries found.</div>
          ) : (
            pagedRows.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <p className="text-xs text-slate-500">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '-'}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{entry.action || '-'}</p>
                <p className="mt-1 text-xs text-slate-700">{entry.targetType || '-'} {entry.targetId ? `(${entry.targetId})` : ''}</p>
                <p className="mt-1 text-xs text-slate-700">{entry.actorName || entry.actorEmail || '-'}{entry.actorRole ? ` • ${entry.actorRole}` : ''}</p>
                <p className="mt-2 text-sm text-slate-700">{entry.description || '-'}</p>
              </article>
            ))
          )}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-500">Page {safePage} of {totalPages}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={safePage === 1}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safePage === totalPages}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </Card>
      ) : null}
    </div>
  );
};

export default AdminAuditTrailPage;
