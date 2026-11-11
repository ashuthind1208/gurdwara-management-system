import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CalendarDaysIcon, MapPinIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useBranding } from '../../context/BrandingContext';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import { selectedWelcomeDishes, WELCOME_THEMES } from '../../services/welcomeJourneyDisplay';
import Seo from '../../components/common/Seo';

const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseStartTime = (value = '') => {
  const match = String(value).match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 9999;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return hour * 60 + Number(match[2]);
};

const WelcomeJourneyPage = () => {
  const { branding, logoSrc } = useBranding();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', consent: false, website: '' });
  const { data: settings = {} } = useQuery({ queryKey: ['welcome-journey-settings'], queryFn: welcomeJourneyService.getSettings, refetchInterval: 30000 });
  const { data: home = {} } = useQuery({ queryKey: ['welcome-journey-home-content'], queryFn: () => cmsService.getHomeContent().then((response) => response.data), refetchInterval: 60000 });
  const day = useMemo(() => resolveScheduleForDate(home.scheduleDays || [], dateKey()), [home.scheduleDays]);
  const programRows = useMemo(() => (day?.entries || []).filter((item) => item.isActive !== false).sort((a, b) => parseStartTime(a.timeEn || a.time) - parseStartTime(b.timeEn || b.time)), [day]);
  const dishes = selectedWelcomeDishes(settings);
  const theme = WELCOME_THEMES[settings.theme] || WELCOME_THEMES.navy;
  const followUpMutation = useMutation({
    mutationFn: (payload) => welcomeJourneyService.submitFollowUp(payload),
    onSuccess: () => { setSubmitted(true); setForm({ name: '', email: '', phone: '', message: '', consent: false, website: '' }); }
  });
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: key === 'consent' ? event.target.checked : event.target.value }));
  const submit = (event) => { event.preventDefault(); if (settings.showFollowUp !== true || form.consent !== true) return; followUpMutation.mutate(form); };
  const address = settings.address || branding.address || '7035 Sixth Line, Milton, ON';
  const mapsHref = settings.directionsUrl || `https://maps.google.com/?q=${encodeURIComponent(address)}`;
  const heading = settings.titleEnglish || 'Welcome to Singh Sabha Milton';

  if (settings.enabled === false) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><div><img src={logoSrc} alt="" className="mx-auto h-16 w-16 rounded-full" /><h1 className="mt-4 text-2xl font-bold">{branding.organizationName}</h1><p className="mt-2 text-slate-600">The welcome guide is temporarily unavailable.</p><Link to="/" className="mt-4 inline-block font-bold text-brand-blue">Visit our website</Link></div></main>;

  return <main className="min-h-screen bg-gradient-to-b from-[#eef5ff] via-white to-[#fff7e6] text-slate-900">
    <Seo title={heading} description={settings.introEnglish || 'Welcome. Find today’s program, langar, directions, and contact information.'} />
    <header className={`bg-gradient-to-r ${theme} px-4 py-6 text-white shadow-lg sm:px-8`}>
      <div className="mx-auto flex max-w-5xl items-center gap-4"><img src={logoSrc} alt={`${branding.organizationName} logo`} className="h-14 w-14 rounded-full border-2 border-amber-300 bg-white object-cover sm:h-16 sm:w-16" /><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-200">{settings.locationName || branding.organizationName}</p><h1 className="mt-1 font-heading text-2xl font-black sm:text-4xl">{heading}</h1>{settings.titlePunjabi ? <p lang="pa" className="mt-1 font-gurmukhi text-lg text-blue-100">{settings.titlePunjabi}</p> : null}</div></div>
    </header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-8 sm:py-9">
      <section className="rounded-2xl border border-blue-100 bg-white/90 p-5 shadow-sm sm:p-7"><p className="text-base leading-relaxed text-slate-700 sm:text-lg">{settings.introEnglish || 'We are glad you are here. You are welcome to join the program and share langar with us.'}</p>{settings.introPunjabi ? <p lang="pa" className="mt-3 font-gurmukhi text-base leading-relaxed text-slate-700">{settings.introPunjabi}</p> : null}</section>
      <div className="grid gap-5 md:grid-cols-2">
        {settings.showProgram !== false ? <section className="rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2 text-brand-blue"><CalendarDaysIcon className="h-6 w-6" /><h2 className="font-heading text-xl font-bold">{settings.programHeadingEnglish || 'Today’s program'}</h2></div>{settings.programHeadingPunjabi ? <p lang="pa" className="mt-1 font-gurmukhi font-semibold text-slate-600">{settings.programHeadingPunjabi}</p> : null}{day?.highlightTitle ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm font-bold text-amber-900">{day.highlightTitle}: {day.highlightNoteEn || day.specialReason || ''}</p> : null}{settings.programNoteEnglish ? <p className="mt-2 text-sm text-slate-600">{settings.programNoteEnglish}</p> : null}
          <div className="mt-3 divide-y divide-slate-100">{programRows.length ? programRows.map((row, index) => <div key={row.id || index} className="flex gap-3 py-3"><span className="w-32 shrink-0 text-sm font-bold text-brand-blue">{row.timeEn || row.time || 'Today'}</span><div className="min-w-0"><p className="font-semibold">{row.titleEn || row.label}</p>{row.titlePa ? <p lang="pa" className="font-gurmukhi text-sm text-slate-600">{row.titlePa}</p> : null}</div></div>) : <p className="py-4 text-sm text-slate-500">Please ask a volunteer for today’s schedule.</p>}</div>
        </section> : null}
        {settings.showLangar !== false ? <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50 p-5 shadow-sm sm:p-6"><div className="flex items-center gap-2 text-amber-800"><SparklesIcon className="h-6 w-6" /><h2 className="font-heading text-xl font-bold">{settings.langarHeadingEnglish || 'Langar today'}</h2></div>{settings.langarHeadingPunjabi ? <p lang="pa" className="mt-1 font-gurmukhi font-semibold text-slate-600">{settings.langarHeadingPunjabi}</p> : null}<p className="mt-2 text-sm leading-relaxed text-slate-600">{settings.langarNoteEnglish || 'Langar is served to everyone. Please join us.'}</p>
          {settings.langarServiceTimeEnglish ? <p className="mt-2 text-sm font-semibold text-amber-900">{settings.langarServiceTimeEnglish}</p> : null}
          {settings.langarServiceTimePunjabi ? <p lang="pa" className="mt-1 font-gurmukhi text-sm text-amber-900">{settings.langarServiceTimePunjabi}</p> : null}
          {settings.showLangarMenu !== false && dishes.length > 0 ? <ul aria-label="Today’s langar menu" className="mt-3 flex flex-wrap gap-2">{dishes.map((dish) => <li key={dish.id} className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950"><span>{dish.nameEnglish}</span>{dish.namePunjabi ? <span lang="pa" className="mt-1 block font-gurmukhi">{dish.namePunjabi}</span> : null}</li>)}</ul> : null}
        </section> : null}
      </div>
      {settings.showDirections !== false ? <section className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6"><div className="flex items-start gap-3"><MapPinIcon className="mt-1 h-6 w-6 shrink-0 text-brand-blue" /><div><h2 className="font-heading text-lg font-bold">{settings.locationName || branding.organizationName}</h2><p className="mt-1 text-slate-600">{address}</p></div></div><a href={mapsHref} target="_blank" rel="noreferrer" className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-gradient-to-r ${theme} px-5 py-3 text-center font-bold text-white shadow-sm hover:opacity-90`}>{settings.directionsLabel || 'Get directions'}</a></section> : null}
      {settings.showFollowUp === true && settings.followUpAvailable !== false ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="font-heading text-xl font-bold">{settings.followUpHeadingEnglish || 'Would you like us to follow up?'}</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{settings.followUpCopyEnglish || 'Leave your details only if you would like a member of our sangat team to contact you.'}</p>{submitted ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">{settings.followUpSuccessEnglish || 'Thank you. A member of our team will be in touch.'}</p> : <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Your name<input required autoComplete="name" maxLength={120} value={form.name} onChange={change('name')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-semibold">Email address<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={change('email')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
        <label className="text-sm font-semibold sm:col-span-2">Phone (optional)<input type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={change('phone')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-semibold sm:col-span-2">Anything you’d like us to know? (optional)<textarea maxLength={1000} rows={3} value={form.message} onChange={change('message')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input required type="checkbox" checked={form.consent} onChange={change('consent')} className="mt-1" /><span>{settings.followUpConsentEnglish || 'I agree to be contacted by Singh Sabha Milton about my visit.'} Your details are shared with the sangat team for this follow-up only.</span></label><div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={change('website')} /></label></div>
        {followUpMutation.isError ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{followUpMutation.error?.response?.data?.message || 'Unable to send your request right now.'}</p> : null}<button type="submit" disabled={followUpMutation.isPending} className="min-h-12 rounded-xl bg-amber-500 px-5 py-3 font-bold text-[#102b4d] hover:bg-amber-400 disabled:opacity-50 sm:col-span-2">{followUpMutation.isPending ? 'Sending…' : 'Request a follow-up'}</button>
      </form>}</section> : null}
      <p className="pb-3 text-center text-xs text-slate-500">No account is needed to use this guide. Follow-up details are optional.</p>
    </div>
  </main>;
};

export default WelcomeJourneyPage;
