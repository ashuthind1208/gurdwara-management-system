import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import StatusAlert from '../../components/common/StatusAlert';
import recitationService from '../../services/recitationService';
import { formatClock, formatDay, formatSpan, useRecitationLive, useRecitationText } from '../../hooks/useRecitation';
import StreamOverlayManager from './StreamOverlayManager';

const PAGE_SIZE = 10;
const inputClass = 'mt-1 block w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case text-slate-700 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20';

const localDateKey = (iso) => {
  const date = new Date(iso || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const StatusPill = ({ status }) => <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${status === 'live' ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-700'}`}>{status === 'live' ? 'Live' : 'Ended'}</span>;

const CopyLinkRow = ({ label, path }) => {
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => new URL(path, window.location.origin).toString(), [path]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        <p className="truncate text-xs text-slate-500" title={url}>{url}</p>
      </div>
      <button type="button" onClick={copy} className="shrink-0 rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" title="Copy link" aria-label={`Copy ${label} link`}><ClipboardDocumentIcon className="h-4 w-4" /></button>
      <a href={path} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-blue px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" aria-label={`Go to ${label} page`}>Go to page<ArrowTopRightOnSquareIcon className="h-4 w-4" /></a>
      {copied ? <span className="text-xs font-semibold text-emerald-600">Copied</span> : null}
    </div>
  );
};

const AdminRecitationsPage = () => {
  const queryClient = useQueryClient();
  const { session: live, setSession } = useRecitationLive();
  const { lines: fullLines } = useRecitationText(live, 'full');
  const [status, setStatus] = useState({ type: 'success', message: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data: sessions = [] } = useQuery({ queryKey: ['recitation-sessions'], queryFn: () => recitationService.listSessions(), refetchInterval: 30000 });

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['recitation-sessions'] });
  }, [live?.id, live?.status, queryClient]);

  const onFailure = (error) => {
    setStatus({ type: 'error', message: error?.response?.data?.message || error.message || 'That did not go through.' });
  };

  const filtered = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return sessions.filter((entry) => {
      if (statusFilter !== 'all' && entry.status !== statusFilter) return false;
      if (dateFilter && localDateKey(entry.startedAt) !== dateFilter) return false;
      return !needle || [entry.title, entry.titleEnglish, entry.reciter, entry.notes].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }, [sessions, searchTerm, statusFilter, dateFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);
  useEffect(() => { setPage(1); }, [searchTerm, statusFilter, dateFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const stepMutation = useMutation({ mutationFn: (change) => recitationService.step(live.id, change), onSuccess: setSession, onError: onFailure });
  const endMutation = useMutation({
    mutationFn: () => recitationService.end(live.id),
    onSuccess: () => { setSession(null); setStatus({ type: 'success', message: 'Recitation ended and saved to the table below.' }); },
    onError: onFailure
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => recitationService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recitation-sessions'] }),
    onError: onFailure
  });

  const index = live?.currentIndex ?? 0;
  const line = fullLines[index];

  return (
    <div className="admin-recitations w-full min-w-0 max-w-full space-y-6 overflow-x-clip">
      <h1 className="sr-only">Gurbani Studio</h1>
      <StatusAlert type={status.type} message={status.message} />

      <Card className="w-full min-w-0 max-w-full border-t-4 border-t-blue-600 bg-gradient-to-br from-blue-50/80 to-white">
        <h2 className="font-heading text-xl font-semibold">Live Recitation Control</h2>
        <p className="mt-1 text-sm text-slate-600">Recitations are started from the Granthi's phone. The Darbar Hall LED screen shows the Gurmukhi with Punjabi and English translations; the sangat follows the Gurbani from the QR code on the LED board.</p>

        {live ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-700"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Live now</p>
                <p className="mt-1 font-gurmukhi text-2xl font-bold text-slate-900">{live.title}</p>
                <p className="text-sm text-slate-600">{live.titleEnglish} · started {formatClock(live.startedAt)} ({formatSpan(live.startedAt)} ago){live.reciter ? ` · ${live.reciter}` : ''}</p>
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-[#0b2a5b] p-4 text-center text-white">
              <p className="font-gurmukhi text-2xl font-bold leading-snug">{line?.g || 'Loading...'}</p>
              {line?.p ? <p className="mt-2 font-gurmukhi text-base font-semibold text-amber-300">{line.p}</p> : null}
              {line?.e ? <p className="mt-1 text-base font-semibold text-cyan-100">{line.e}</p> : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => stepMutation.mutate({ delta: -1 })} disabled={index <= 0} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-40">Previous line</button>
              <button type="button" onClick={() => stepMutation.mutate({ delta: 1 })} disabled={index >= live.totalLines - 1} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Next line</button>
              <span className="text-sm font-semibold text-slate-600">Line {index + 1} of {live.totalLines}</span>
              <button type="button" onClick={() => { if (window.confirm('End this recitation now?')) endMutation.mutate(); }} className="ml-auto rounded-full bg-red-600 px-8 py-3 text-base font-extrabold text-white shadow hover:bg-red-700">End recitation</button>
            </div>
          </div>
        ) : null}

        {!live ? <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No recitation is live right now.</p> : null}
      </Card>

      <Card className="w-full min-w-0 max-w-full border-t-4 border-t-cyan-500 bg-gradient-to-br from-cyan-50/80 to-white">
        <h2 className="font-heading text-xl font-semibold">Screens and links</h2>
        <p className="mt-1 text-sm text-slate-600">Open the LED board on the Darbar Hall screen. Its QR code is for the sangat; the Granthi starts and controls the recitation from the Granthi page on their phone.</p>
        <div className="mt-3 grid min-w-0 gap-2 md:grid-cols-2">
          <CopyLinkRow label="LED board (Darbar Hall screen)" path="/recitation-board" />
          <CopyLinkRow label="Granthi's Recitation Controls (phone)" path="/granthi-remote" />
        </div>
      </Card>

      <StreamOverlayManager />

      <Card className="w-full min-w-0 max-w-full border-t-4 border-t-amber-500 bg-gradient-to-br from-amber-50/80 to-white">
        <h2 className="font-heading text-xl font-semibold">All recitations</h2>
        <p className="mt-1 text-sm text-slate-600">Every recitation by date, with when it started and ended. The audience follows from the QR code displayed on the LED board.</p>
        <div className="mt-4 grid min-w-0 gap-2 md:grid-cols-3">
          <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Search<input type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Shabad, reciter, or occasion" className={inputClass} /></label>
          <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Date<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className={inputClass} /></label>
          <label className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate-500">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputClass}><option value="all">All</option><option value="live">Live</option><option value="ended">Ended</option></select></label>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-0 divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Recitation</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Date</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Started</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Ended</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Duration</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Reciter</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Progress</th>
                <th className="admin-compact-mobile-hidden px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2">
                    <p className="truncate font-gurmukhi text-base font-bold text-slate-800">{entry.title}</p>
                    <p className="truncate text-xs text-slate-500">{entry.titleEnglish}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 xl:hidden"><StatusPill status={entry.status} /><span className="text-[11px] text-slate-500">{formatDay(entry.startedAt)} · {formatClock(entry.startedAt)} to {entry.endedAt ? formatClock(entry.endedAt) : 'now'}</span></div>
                  </td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{formatDay(entry.startedAt)}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{formatClock(entry.startedAt)}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{entry.endedAt ? formatClock(entry.endedAt) : '-'}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{formatSpan(entry.startedAt, entry.endedAt)}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{entry.reciter || '-'}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2">{Math.min(entry.totalLines, entry.currentIndex + 1)} / {entry.totalLines}</td>
                  <td className="admin-compact-mobile-hidden px-3 py-2"><StatusPill status={entry.status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => { if (window.confirm('Delete this recitation record?')) deleteMutation.mutate(entry.id); }} className="rounded-md border border-red-200 p-1.5 text-red-700" title="Delete" aria-label="Delete recitation"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={9}>{sessions.length ? 'No recitations match your filters.' : 'No recitations yet. Start one above and it will be listed here.'}</td></tr> : null}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">Showing {visible.length} of {filtered.length} recitations</p>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Prev</button>
              <span className="text-xs font-semibold text-slate-600">Page {page} of {totalPages}</span>
              <button type="button" className="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next</button>
            </div>
          </div>
        ) : null}
      </Card>

    </div>
  );
};

export default AdminRecitationsPage;
