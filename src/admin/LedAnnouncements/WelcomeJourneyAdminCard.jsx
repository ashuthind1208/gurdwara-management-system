import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Card from '../../components/ui/Card';
import StatusAlert from '../../components/common/StatusAlert';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import { useAuth } from '../../context/AuthContext';

const initial = {
  enabled: true,
  titleEnglish: 'Welcome to Singh Sabha Milton', titlePunjabi: 'ਸਿੰਘ ਸਭਾ ਮਿਲਟਨ ਵਿੱਚ ਜੀ ਆਇਆਂ ਨੂੰ',
  introEnglish: '', introPunjabi: '', scanHeadingEnglish: 'Your visit starts here', theme: 'navy',
  locationName: 'Gurdwara Singh Sabha Milton', address: '7035 Sixth Line, Milton, ON',
  directionsUrl: 'https://maps.google.com/?q=7035+Sixth+Line+Milton+ON', directionsLabel: 'Get directions',
  programHeadingEnglish: 'Today’s program', programHeadingPunjabi: 'ਅੱਜ ਦਾ ਪ੍ਰੋਗਰਾਮ', programNoteEnglish: '',
  langarHeadingEnglish: 'Langar today', langarHeadingPunjabi: 'ਅੱਜ ਦਾ ਲੰਗਰ', langarNoteEnglish: 'Langar is served to everyone. Please join us.',
  showProgram: true, showLangar: true, showFollowUp: true,
  showDirections: true, showLangarMenu: true, dishes: [], selectedDishIds: [],
  langarServiceTimeEnglish: '', langarServiceTimePunjabi: '',
  followUpHeadingEnglish: 'Would you like us to follow up?', followUpCopyEnglish: '',
  followUpConsentEnglish: 'I agree to be contacted by Singh Sabha Milton about my visit.',
  followUpSuccessEnglish: 'Thank you. A member of our team will be in touch.'
};
const fields = [
  ['titleEnglish', 'Welcome heading', 120], ['titlePunjabi', 'Welcome heading (Punjabi)', 160],
  ['introEnglish', 'Introduction', 500], ['introPunjabi', 'Introduction (Punjabi)', 500], ['scanHeadingEnglish', 'QR panel heading', 100],
  ['locationName', 'Location name', 120], ['address', 'Street address', 200], ['directionsUrl', 'Map directions URL (HTTPS)', 500], ['directionsLabel', 'Directions button text', 50],
  ['programHeadingEnglish', 'Program heading', 100], ['programHeadingPunjabi', 'Program heading (Punjabi)', 120], ['programNoteEnglish', 'Program note', 300],
  ['langarHeadingEnglish', 'Langar heading', 100], ['langarHeadingPunjabi', 'Langar heading (Punjabi)', 120], ['langarNoteEnglish', 'Langar note', 300],
  ['langarServiceTimeEnglish', 'Langar serving hours', 120], ['langarServiceTimePunjabi', 'Langar serving hours (Punjabi)', 120],
  ['followUpHeadingEnglish', 'Follow-up heading', 120], ['followUpCopyEnglish', 'Follow-up explanation', 300], ['followUpConsentEnglish', 'Contact consent text', 250], ['followUpSuccessEnglish', 'Follow-up confirmation', 250]
];
const toggleFields = [['enabled', 'Publish the Welcome Journey board'], ['showProgram', 'Show today’s schedule'], ['showLangar', 'Show langar details'], ['showLangarMenu', 'Show selected dishes'], ['showDirections', 'Show directions'], ['showFollowUp', 'Allow optional visitor follow-up requests']];

const WelcomeJourneyAdminCard = () => {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState({ type: 'success', message: '' });
  const { data: settings = initial, isLoading, isError } = useQuery({ queryKey: ['welcome-journey-settings'], queryFn: welcomeJourneyService.getSettings });
  const { data: followUps = [], isLoading: followUpsLoading, isError: followUpsError } = useQuery({ queryKey: ['welcome-journey-follow-ups'], queryFn: welcomeJourneyService.listFollowUps, refetchInterval: 30000, retry: false });
  useEffect(() => setValues({ ...initial, ...settings }), [settings]);
  const mutation = useMutation({
    mutationFn: (next) => welcomeJourneyService.saveSettings(next),
    onSuccess: (saved) => { queryClient.setQueryData(['welcome-journey-settings'], saved); setStatus({ type: 'success', message: 'Welcome Journey settings saved.' }); },
    onError: (error) => setStatus({ type: 'error', message: error?.response?.data?.message || 'Unable to save Welcome Journey settings.' })
  });
  const patch = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const updateDish = (id, patch) => setValues((current) => ({ ...current, dishes: current.dishes.map((dish) => dish.id === id ? { ...dish, ...patch } : dish) }));
  const removeDish = (id) => setValues((current) => ({ ...current, dishes: current.dishes.filter((dish) => dish.id !== id), selectedDishIds: current.selectedDishIds.filter((selected) => selected !== id) }));
  const submit = (event) => {
    event.preventDefault();
    const { canSave, followUpAvailable, ...editableSettings } = values;
    mutation.mutate(editableSettings);
  };
  const reauthenticate = async () => {
    try { await logout(); } finally { window.location.assign('/login?next=%2Fadmin%2Fwelcome-journey'); }
  };
  return <Card className="border-cyan-200 bg-cyan-50/20">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-heading text-xl font-bold">Welcome page settings</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Customize the lobby LED board and visitor page. Programs use the CMS schedule; Langar uses your saved dishes below, never the grocery inventory.</p></div><div className="flex gap-2"><a href="/welcome" target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm font-bold text-cyan-900">Preview visitor page</a><a href="/welcome-journey-board" target="_blank" rel="noreferrer" className="rounded-lg border border-cyan-300 bg-white px-3 py-2 text-sm font-bold text-cyan-900">Preview LED board</a></div></div>
    <StatusAlert type={status.type} message={status.message} />
    <form onSubmit={submit} className="mt-4 space-y-4">
      {isError ? <p role="alert" className="text-sm text-rose-700">Unable to load saved settings. Reload before editing.</p> : null}
      {!isLoading && !isError && settings.canSave === false ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>This browser session could not be verified as an active, approved Super Admin Google account. Sign out and sign in again with Google to edit these settings.</p><button type="button" onClick={reauthenticate} className="shrink-0 rounded-lg bg-amber-800 px-3 py-2 font-bold text-white hover:bg-amber-900">Sign out and sign in with Google</button></div> : null}
      <fieldset disabled={isLoading || isError || mutation.isPending || settings.canSave === false} className="space-y-4 disabled:opacity-60">
        <div className="grid gap-3 sm:grid-cols-2">{toggleFields.map(([key, label]) => <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"><input type="checkbox" checked={values[key] !== false} onChange={(event) => patch(key, event.target.checked)} />{label}</label>)}</div>
        <label className="block text-sm font-semibold">Visitor page and LED color theme<select aria-label="Welcome Journey color theme" value={values.theme || 'navy'} onChange={(event) => patch('theme', event.target.value)} className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="navy">Gurdwara navy and saffron</option><option value="blue">Sky blue</option><option value="warm">Warm welcome</option></select></label>
        <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4" aria-label="Langar dish library">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-heading text-lg font-bold">Langar dish library</h3><p className="text-sm text-slate-600">Save dishes once, then tick the dishes being served today. Unticking a dish keeps it in the library for next time.</p></div><button type="button" disabled={values.dishes.length >= 100} onClick={() => patch('dishes', [...values.dishes, { id: `dish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, nameEnglish: '', namePunjabi: '' }])} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Add dish</button></div>
          <p className="text-xs font-bold text-amber-900">{values.selectedDishIds.length} dishes selected for today · Save Welcome Journey to store your changes</p>
          {values.dishes.map((dish, index) => <div key={dish.id} className="grid items-end gap-3 rounded-lg border border-amber-200 bg-white p-3 sm:grid-cols-[auto_1fr_1fr_auto]">
            <label className="flex items-center gap-2 py-2 text-sm font-bold"><input type="checkbox" aria-label={`Serve ${dish.nameEnglish || `dish ${index + 1}`} today`} checked={values.selectedDishIds.includes(dish.id)} disabled={!values.selectedDishIds.includes(dish.id) && values.selectedDishIds.length >= 30} onChange={(event) => patch('selectedDishIds', event.target.checked ? [...values.selectedDishIds, dish.id] : values.selectedDishIds.filter((id) => id !== dish.id))} />Today</label>
            <label className="text-xs font-semibold">Dish name<input required maxLength={120} aria-label={`Dish ${index + 1} name`} value={dish.nameEnglish} onChange={(event) => updateDish(dish.id, { nameEnglish: event.target.value })} placeholder="e.g. Dal, Roti, Sabzi" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
            <label className="text-xs font-semibold">Punjabi name<input maxLength={120} aria-label={`Dish ${index + 1} Punjabi name`} lang="pa" value={dish.namePunjabi} onChange={(event) => updateDish(dish.id, { namePunjabi: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-gurmukhi text-sm" /></label>
            <button type="button" onClick={() => removeDish(dish.id)} aria-label={`Remove ${dish.nameEnglish || `dish ${index + 1}`} from library`} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">Remove</button>
          </div>)}
          {!values.dishes.length ? <p className="text-sm text-slate-500">No dishes saved yet. Add cooked dishes here, not ingredients or grocery needs.</p> : null}
        </section>
        <div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label, max]) => <label key={key} className={`block text-sm font-semibold ${['introEnglish', 'introPunjabi', 'directionsUrl', 'programNoteEnglish', 'langarNoteEnglish', 'followUpCopyEnglish', 'followUpConsentEnglish'].includes(key) ? 'sm:col-span-2' : ''}`}>{label}{['introEnglish', 'introPunjabi', 'programNoteEnglish', 'langarNoteEnglish', 'followUpCopyEnglish', 'followUpConsentEnglish', 'followUpSuccessEnglish'].includes(key) ? <textarea maxLength={max} rows={2} value={values[key] || ''} onChange={(event) => patch(key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" /> : <input maxLength={max} type={key === 'directionsUrl' ? 'url' : 'text'} value={values[key] || ''} onChange={(event) => patch(key, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />}</label>)}</div>
        <div className="flex justify-end"><button type="submit" disabled={mutation.isPending} className="rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{mutation.isPending ? 'Saving…' : 'Save Welcome Journey'}</button></div>
      </fieldset>
    </form>
    <div className="mt-6 border-t border-slate-200 pt-4"><h3 className="font-heading text-lg font-bold">Visitor follow-up requests {!followUpsError ? <span className="text-sm font-semibold text-slate-500">({followUps.length})</span> : null}</h3><p className="mt-1 text-xs text-slate-600">Only visitors who explicitly consented appear here.</p>{followUpsLoading ? <p className="mt-3 text-sm text-slate-500">Loading requests…</p> : followUpsError ? <p role="alert" className="mt-3 text-sm text-rose-700">Visitor follow-up requests are unavailable.</p> : <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{followUps.slice(0, 100).map((entry) => <article key={entry.id} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold">{entry.name} <span className="font-normal text-slate-600">· {entry.email}</span></p><time className="text-xs text-slate-500">{new Date(entry.submittedAt).toLocaleString()}</time></div>{entry.phone ? <p className="mt-1 text-sm">Phone: {entry.phone}</p> : null}{entry.message ? <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{entry.message}</p> : null}</article>)}{!followUps.length ? <p className="text-sm text-slate-500">No visitor requests yet.</p> : null}</div>}</div>
  </Card>;
};

export default WelcomeJourneyAdminCard;
