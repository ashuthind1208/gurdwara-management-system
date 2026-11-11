import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowTopRightOnSquareIcon, BookOpenIcon, CalendarDaysIcon, HeartIcon, PlayCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { useBranding } from '../../context/BrandingContext';
import cmsService, { resolveScheduleForDate } from '../../services/cmsService';
import welcomeJourneyService from '../../services/welcomeJourneyService';
import { resolveWelcomeTheme, selectedWelcomeDishes } from '../../services/welcomeJourneyDisplay';
import { siteConfig } from '../../constants/siteConfig';
import FloatingGutkaReader from '../../components/recitation/FloatingGutkaReader';
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
  const theme = resolveWelcomeTheme(settings.theme, branding);
  const liveChannelUrl = String(branding.youtubeUrl || siteConfig.social.youtube || '').trim();
  const engagementLinks = [
    { href: '/donation', label: 'Support the Gurdwara', description: 'Contribute to seva and community programs.', icon: HeartIcon, internal: true },
    { href: '/about', label: 'About the Gurdwara', description: 'Learn about our sangat and community.', icon: SparklesIcon, internal: true },
    { href: '/sikhism', label: 'Explore Sikhism', description: 'Discover Sikh beliefs, values, and practice.', icon: BookOpenIcon, internal: true },
    ...(liveChannelUrl.startsWith('https://') ? [{ href: liveChannelUrl, label: 'Watch live Kirtan', description: 'Join the live channel.', icon: PlayCircleIcon, internal: false }] : [])
  ];
  const followUpMutation = useMutation({
    mutationFn: (payload) => welcomeJourneyService.submitFollowUp(payload),
    onSuccess: () => { setSubmitted(true); setForm({ name: '', email: '', phone: '', message: '', consent: false, website: '' }); }
  });
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: key === 'consent' ? event.target.checked : event.target.value }));
  const submit = (event) => { event.preventDefault(); if (settings.showFollowUp !== true || form.consent !== true) return; followUpMutation.mutate(form); };
  const heading = settings.titleEnglish || `Welcome to ${branding.organizationName || 'Your Gurdwara'}`;

  if (settings.enabled === false) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><div><img src={logoSrc} alt="" className="mx-auto h-16 w-16 rounded-full" /><h1 className="mt-4 text-2xl font-bold">{branding.organizationName}</h1><p className="mt-2 text-slate-600">The welcome guide is temporarily unavailable.</p><Link to="/" className="mt-4 inline-block font-bold text-brand-blue">Visit our website</Link></div></main>;

  return <main className="min-h-screen text-slate-900" style={{ backgroundImage: theme.pageBackground }}>
    <Seo title={heading} description={settings.introEnglish || 'Welcome. Find today’s program, langar, directions, and contact information.'} />
    <header data-theme={theme.id} className="bg-gradient-to-r px-4 py-6 text-white shadow-lg sm:px-8" style={{ backgroundImage: theme.backgroundImage }}>
      <div className="mx-auto flex max-w-5xl items-center gap-4"><img src={logoSrc} alt={`${branding.organizationName} logo`} className="h-14 w-14 rounded-full border-2 border-amber-300 bg-white object-cover sm:h-16 sm:w-16" /><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-200">{settings.locationName || branding.organizationName}</p><h1 className="mt-1 font-heading text-2xl font-black sm:text-4xl">{heading}</h1>{settings.titlePunjabi ? <p lang="pa" className="mt-1 font-gurmukhi text-lg text-blue-100">{settings.titlePunjabi}</p> : null}</div></div>
    </header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-8 sm:py-9">
      <section className="rounded-2xl border border-t-4 bg-white/90 p-5 shadow-sm sm:p-7" style={{ borderColor: `${theme.primaryColor}33`, borderTopColor: theme.primaryColor }}><p className="text-base leading-relaxed text-slate-700 sm:text-lg">{settings.introEnglish || 'We are glad you are here. You are welcome to join the program and share langar with us.'}</p>{settings.introPunjabi ? <p lang="pa" className="mt-3 font-gurmukhi text-base leading-relaxed text-slate-700">{settings.introPunjabi}</p> : null}</section>
      <div className="grid gap-5 md:grid-cols-2">
        {settings.showProgram !== false ? <section className="rounded-2xl border border-t-4 bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: `${theme.primaryColor}33`, borderTopColor: theme.primaryColor }}><div className="flex items-center gap-2" style={{ color: theme.primaryColor }}><CalendarDaysIcon className="h-6 w-6" /><h2 className="font-heading text-2xl font-extrabold">{settings.programHeadingEnglish || 'Today’s program'}</h2></div>{settings.programHeadingPunjabi ? <p lang="pa" className="mt-1 font-gurmukhi font-semibold text-slate-600">{settings.programHeadingPunjabi}</p> : null}{day?.highlightTitle ? <p className="mt-2 rounded-lg p-2 text-sm font-bold" style={{ backgroundColor: `${theme.accentColor}22`, color: theme.primaryColor }}>{day.highlightTitle}: {day.highlightNoteEn || day.specialReason || ''}</p> : null}{settings.programNoteEnglish ? <p className="mt-2 text-sm text-slate-600">{settings.programNoteEnglish}</p> : null}
          <div className="mt-3 divide-y divide-slate-200">{programRows.length ? programRows.map((row, index) => <div key={row.id || index} className="flex gap-3 py-3"><span className="w-32 shrink-0 text-sm font-bold" style={{ color: theme.primaryColor }}>{row.timeEn || row.time || 'Today'}</span><div className="min-w-0 flex-1"><p className="font-bold" style={{ color: theme.primaryColor }}>{row.titleEn || row.label}</p>{row.titlePa ? <p lang="pa" className="mt-1 border-t border-dashed border-slate-200 pt-1 font-gurmukhi text-sm font-semibold" style={{ color: theme.accentColor }}>{row.titlePa}</p> : null}</div></div>) : <p className="py-4 text-sm text-slate-500">Please ask a volunteer for today’s schedule.</p>}</div>
        </section> : null}
        {settings.showLangar !== false ? <section className="rounded-2xl border border-t-4 p-5 shadow-sm sm:p-6" style={{ borderColor: `${theme.accentColor}77`, borderTopColor: theme.accentColor, backgroundImage: `linear-gradient(135deg, #ffffff, ${theme.surfaceColor})` }}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2" style={{ color: theme.primaryColor }}><SparklesIcon className="h-6 w-6 shrink-0" /><h2 className="font-heading text-2xl font-extrabold">{settings.langarHeadingEnglish || 'Langar today'}</h2></div>{settings.langarHeadingPunjabi ? <p lang="pa" className="mt-1 font-gurmukhi font-semibold text-slate-600">{settings.langarHeadingPunjabi}</p> : null}</div>{settings.langarServiceTimeEnglish || settings.langarServiceTimePunjabi ? <div className="shrink-0 rounded-lg px-3 py-2 text-right text-xs font-extrabold sm:text-sm" style={{ backgroundColor: `${theme.accentColor}22`, color: theme.primaryColor }}>{settings.langarServiceTimeEnglish ? <p>{settings.langarServiceTimeEnglish}</p> : null}{settings.langarServiceTimePunjabi ? <p lang="pa" className="mt-0.5 font-gurmukhi">{settings.langarServiceTimePunjabi}</p> : null}</div> : null}</div><p className="mt-2 text-sm leading-relaxed text-slate-600">{settings.langarNoteEnglish || 'Langar is served to everyone. Please join us.'}</p>
          {settings.showLangarMenu !== false && dishes.length > 0 ? <ul aria-label="Today’s langar menu" className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white px-4">{dishes.map((dish) => <li key={dish.id} className="flex flex-wrap items-baseline gap-x-2 py-3"><span className="font-bold" style={{ color: theme.primaryColor }}>{dish.nameEnglish}</span>{dish.namePunjabi ? <><span aria-hidden="true" style={{ color: theme.primaryColor }}>|</span><span lang="pa" className="font-gurmukhi text-sm font-semibold" style={{ color: theme.primaryColor }}>{dish.namePunjabi}</span></> : null}</li>)}</ul> : null}
        </section> : null}
      </div>
      <section aria-labelledby="welcome-explore-title" className="rounded-2xl border border-t-4 bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: `${theme.accentColor}77`, borderTopColor: theme.accentColor }}>
        <div className="mb-4"><h2 id="welcome-explore-title" className="font-heading text-2xl font-extrabold" style={{ color: theme.primaryColor }}>Continue exploring</h2><p className="mt-1 text-sm text-slate-600">Discover more ways to connect with the Gurdwara and Sikh community.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{engagementLinks.map(({ href, label, description, icon: Icon, internal }) => {
          const className = 'group flex min-h-24 items-start gap-3 rounded-xl border bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md';
          const content = <><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${theme.accentColor}22`, color: theme.primaryColor }}><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center gap-1 font-bold" style={{ color: theme.primaryColor }}>{label}{internal ? null : <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />}</span><span className="mt-1 block text-sm leading-snug text-slate-600">{description}</span></span></>;
          return internal ? <Link key={href} to={href} className={className} style={{ borderColor: `${theme.primaryColor}33` }}>{content}</Link> : <a key={href} href={href} target="_blank" rel="noreferrer" className={className} style={{ borderColor: `${theme.primaryColor}33` }}>{content}</a>;
        })}<FloatingGutkaReader placement="welcome" /></div>
      </section>
      {settings.showFollowUp === true && settings.followUpAvailable !== false ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h2 className="font-heading text-xl font-bold">{settings.followUpHeadingEnglish || 'Would you like us to follow up?'}</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{settings.followUpCopyEnglish || 'Leave your details only if you would like a member of our sangat team to contact you.'}</p>{submitted ? <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 font-semibold text-emerald-800">{settings.followUpSuccessEnglish || 'Thank you. A member of our team will be in touch.'}</p> : <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">Your name<input required autoComplete="name" maxLength={120} value={form.name} onChange={change('name')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-semibold">Email address<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={change('email')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
        <label className="text-sm font-semibold sm:col-span-2">Phone (optional)<input type="tel" autoComplete="tel" maxLength={30} value={form.phone} onChange={change('phone')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label><label className="text-sm font-semibold sm:col-span-2">Anything you’d like us to know? (optional)<textarea maxLength={1000} rows={3} value={form.message} onChange={change('message')} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input required type="checkbox" checked={form.consent} onChange={change('consent')} className="mt-1" /><span>{settings.followUpConsentEnglish || 'I agree to be contacted by the Gurdwara about my visit.'} Your details are shared with the sangat team for this follow-up only.</span></label><div className="absolute -left-[10000px]" aria-hidden="true"><label>Website<input tabIndex="-1" autoComplete="off" value={form.website} onChange={change('website')} /></label></div>
        {followUpMutation.isError ? <p role="alert" className="text-sm text-red-700 sm:col-span-2">{followUpMutation.error?.response?.data?.message || 'Unable to send your request right now.'}</p> : null}<button type="submit" disabled={followUpMutation.isPending} className="min-h-12 rounded-xl bg-amber-500 px-5 py-3 font-bold text-[#102b4d] hover:bg-amber-400 disabled:opacity-50 sm:col-span-2">{followUpMutation.isPending ? 'Sending…' : 'Request a follow-up'}</button>
      </form>}</section> : null}
      <p className="pb-3 text-center text-xs text-slate-500">No account is needed to use this guide. Follow-up details are optional.</p>
    </div>
  </main>;
};

export default WelcomeJourneyPage;
