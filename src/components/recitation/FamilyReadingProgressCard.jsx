import { useEffect, useId, useState } from 'react';
import { BookOpenIcon, Bars3BottomLeftIcon, DocumentTextIcon, ClockIcon, ChartBarIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { readReadingHistory, subscribeReadingHistory } from '../../services/gutkaReadingService';

const FamilyReadingProgressCard = () => {
  const gradientId = useId();
  const { user, isAuthenticated } = useAuth();
  const userId = isAuthenticated ? user?.id : null;
  const [snapshot, setSnapshot] = useState(() => ({ userId, history: readReadingHistory(userId) }));

  useEffect(() => {
    const refresh = () => setSnapshot({ userId, history: readReadingHistory(userId) });
    refresh();
    return subscribeReadingHistory(userId, refresh);
  }, [userId]);

  if (userId == null || userId === '') return null;
  // Never render the previous profile's activity while the subscription changes.
  const history = snapshot.userId === userId ? snapshot.history : readReadingHistory(userId);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toLocaleDateString('en-CA');
    return { key, label: date.toLocaleDateString(undefined, { weekday: 'short' }), count: history.days[key] || 0 };
  });
  const maxDay = Math.max(1, ...days.map((day) => day.count));
  const points = days.map((day, index) => `${12 + index * 46},${76 - (day.count / maxDay) * 60}`).join(' ');
  const sources = Object.entries(history.bySource).sort((a, b) => b[1].lines - a[1].lines).slice(0, 8);
  const weeklyLines = days.reduce((total, day) => total + day.count, 0);
  const activeDays = days.filter((day) => day.count > 0).length;
  const maxSource = Math.max(1, ...sources.map(([, item]) => item.lines));

  return <section aria-labelledby="family-reading-progress-title" className="rounded-2xl border border-brand-blue/20 bg-gradient-to-br from-blue-50 via-white to-amber-50 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-amber-300 shadow-sm"><BookOpenIcon aria-hidden="true" className="h-6 w-6" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-slate-500">Your daily connection</p><h2 id="family-reading-progress-title" className="text-lg font-bold text-brand-blue">My reading progress</h2></div></div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"><SparklesIcon aria-hidden="true" className="h-4 w-4" />{activeDays ? `${activeDays} active ${activeDays === 1 ? 'day' : 'days'} this week` : 'Begin at your own pace'}</span>
    </div>
    <p className="mt-1 text-xs text-slate-600">On-device only: saved for your signed-in profile in this browser; not synced to other devices. Guests are not tracked.</p>
    <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      {[['Readings', history.sessions, BookOpenIcon, 'bg-blue-100 text-blue-700'], ['Lines read', history.lines, Bars3BottomLeftIcon, 'bg-teal-100 text-teal-700'], ['Angs explored', history.angs.length, DocumentTextIcon, 'bg-violet-100 text-violet-700'], ['Reading minutes', Math.round(history.minutes), ClockIcon, 'bg-amber-100 text-amber-700']].map(([label, value, Icon, color]) => <div key={label} className="relative rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm">
        <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>{label}</dt>
        <dd className="mt-2 text-2xl font-bold tabular-nums text-slate-800">{value}</dd>
      </div>)}
    </dl>
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <section aria-label="Reading activity in the last 7 days" className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold"><ChartBarIcon aria-hidden="true" className="h-4 w-4 text-blue-600" />Last 7 days</h3><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{weeklyLines} lines</span></div>
        <svg role="img" aria-label={`Reading activity line chart: ${days.map((day) => `${day.label} ${day.count} lines`).join(', ')}`} viewBox="0 0 300 88" className="mt-2 h-24 w-full" preserveAspectRatio="none">
          <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#38bdf8" stopOpacity=".32" /><stop offset="100%" stopColor="#38bdf8" stopOpacity=".02" /></linearGradient></defs>
          {[16, 46, 76].map((y) => <line key={y} x1="12" x2="288" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 4" />)}
          <polygon points={`12,76 ${points} 288,76`} fill={`url(#${gradientId})`} />
          <polyline points={points} fill="none" stroke="#0B4EA2" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {days.map((day, index) => <circle key={day.key} cx={12 + index * 46} cy={76 - (day.count / maxDay) * 60} r="3" fill="#F4A300"><title>{day.label}: {day.count} lines</title></circle>)}
        </svg>
        <ul className="mt-1 grid grid-cols-7 gap-2">
          {days.map((day) => <li key={day.key} aria-label={`${day.key}: ${day.count} lines read`} className="flex min-w-0 flex-col items-center gap-1">
            <span className={`flex h-6 min-w-6 items-center justify-center rounded-lg px-1 text-xs font-semibold ${day.count ? 'bg-blue-100 text-blue-800' : 'text-slate-400'}`}>{day.count}</span>
            <span className="text-[10px] font-semibold text-slate-500">{day.label}</span>
          </li>)}
        </ul>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold"><BookOpenIcon aria-hidden="true" className="h-4 w-4 text-amber-600" />Recently read</h3>
        <ul className="mt-2 divide-y divide-slate-100">{sources.map(([key, item]) => <li key={key} className="flex items-center justify-between gap-2 py-2">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700"><BookOpenIcon className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span><div aria-hidden="true" className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-400" style={{ width: `${(item.lines / maxSource) * 100}%` }} /></div></div><span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">{item.lines} lines</span>
        </li>)}</ul>
        {!sources.length ? <p className="py-3 text-sm text-slate-500">Your reading activity will appear here as you read.</p> : null}
      </section>
    </div>
  </section>;
};

export default FamilyReadingProgressCard;