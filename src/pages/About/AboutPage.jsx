import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDaysIcon, EnvelopeIcon, PhoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
import PageHero from '../../components/common/PageHero';
import SectionTitle from '../../components/common/SectionTitle';
import useSeoMeta from '../../hooks/useSeoMeta';
import Seo from '../../components/common/Seo';
import cmsService from '../../services/cmsService';
import userService from '../../services/userService';
import { useBranding } from '../../context/BrandingContext';

const isImageUrl = (value = '') => /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(String(value || ''));

const resolveLeadershipRank = (title = '') => {
  const normalizedTitle = String(title || '').toLowerCase();
  if (normalizedTitle.includes('president')) return 0;
  if (normalizedTitle.includes('member')) return 1;
  if (normalizedTitle.includes('volunteer')) return 3;
  return 2;
};

const resolveGroupHeading = (title = '', count = 0) => {
  const normalizedTitle = String(title || '').trim();
  if (count > 1 && normalizedTitle.toLowerCase() === 'member') return 'Members';
  if (count > 1 && normalizedTitle.toLowerCase() === 'volunteer') return 'Volunteers';
  return normalizedTitle;
};

const formatMemberSince = (value = '') => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
};

const AboutPage = () => {
  const { branding } = useBranding();
  const [selectedMember, setSelectedMember] = useState(null);
  const meta = useSeoMeta('About', 'History, mission, leadership, and management details of the Gurdwara.');
  const { data: content } = useQuery({
    queryKey: ['page-content', 'about'],
    queryFn: () => cmsService.getPageContent('about').then((res) => res.data)
  });

  const sections = content?.sections || [];
  const { data: publicMembers = [] } = useQuery({
    queryKey: ['public-members'],
    queryFn: () => userService.getPublicMembers().then((res) => res.data)
  });
  const membersByTitle = publicMembers.reduce((groups, member) => {
    const title = String(member.title || '').trim();
    if (!title) return groups;
    groups[title] = [...(groups[title] || []), member];
    return groups;
  }, {});
  const memberGroups = Object.entries(membersByTitle)
    .sort(([leftTitle], [rightTitle]) => resolveLeadershipRank(leftTitle) - resolveLeadershipRank(rightTitle) || leftTitle.localeCompare(rightTitle));

  return (
    <div className="space-y-10">
      <Seo {...meta} />
      <PageHero title={content?.heroTitle ?? 'About Our Gurdwara'} description={content?.heroDescription ?? 'Serving the sangat with spiritual guidance, seva, and community development.'} />

      {content?.mediaUrl ? <img src={content.mediaUrl} alt="About section" className="h-56 w-full object-cover" loading="lazy" /> : null}

      {content?.intro ? <div className="text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: content.intro }} /> : null}

      <section>
        <SectionTitle title="History, Vision, and Mission" />
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((section) => (
            <article key={section.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="font-heading text-xl font-semibold text-brand-blue">{section.title}</h3>
              <div className="mt-2 text-sm leading-relaxed text-slate-700" dangerouslySetInnerHTML={{ __html: section.body }} />
              {section.mediaUrl ? (
                isImageUrl(section.mediaUrl) ? (
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img src={section.mediaUrl} alt={section.title || 'Section media'} className="h-48 w-full object-contain" loading="lazy" />
                  </div>
                ) : (
                  <a href={section.mediaUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs font-semibold text-brand-blue hover:underline">Open section media</a>
                )
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {Object.keys(membersByTitle).length > 0 ? (
        <section aria-labelledby="community-members-title">
          <SectionTitle title="Our Community Leadership" />
          <div className="mt-6 space-y-12">
            {memberGroups.map(([title, members]) => (
              <div key={title}>
                <div className="mb-6 flex items-center gap-3">
                  <h3 className="shrink-0 font-heading text-xl font-semibold text-brand-blue">{resolveGroupHeading(title, members.length)}</h3>
                  <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-5">
                  {members.map((member) => (
                    <button key={member.id} type="button" onClick={() => setSelectedMember(member)} className="group flex w-28 flex-col items-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-4" aria-label={`View details for ${member.name}`}>
                      <img
                        src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name || 'Member')}`}
                        alt={member.name}
                        className="h-24 w-24 rounded-xl border-2 border-white object-cover shadow-md ring-1 ring-slate-200 transition group-hover:ring-brand-blue"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                      <span className="mt-3 block text-sm font-bold leading-tight text-slate-900 group-hover:text-brand-blue">{member.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {selectedMember ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="member-dialog-title">
          <button type="button" className="absolute inset-0 cursor-default" onClick={() => setSelectedMember(null)} aria-label="Close member details" />
          <article className="relative z-10 my-auto max-h-[calc(100vh-2rem)] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 bg-brand-navy px-5 py-4 text-white sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase text-blue-200">Community profile</p>
                <p className="mt-1 font-heading text-lg font-semibold">{branding.organizationName}</p>
              </div>
              <button type="button" onClick={() => setSelectedMember(null)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-white hover:bg-white/10" aria-label="Close member details">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </header>
            <div className="grid gap-6 p-5 sm:grid-cols-[128px_1fr] sm:p-6">
              <img
                src={selectedMember.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedMember.name || 'Member')}`}
                alt={selectedMember.name}
                className="mx-auto h-28 w-28 rounded-full border-4 border-white object-cover shadow-md ring-1 ring-slate-200 sm:h-32 sm:w-32"
                referrerPolicy="no-referrer"
              />
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">{selectedMember.title}</span>
                <h3 id="member-dialog-title" className="mt-3 font-heading text-3xl font-semibold text-slate-950">{selectedMember.name}</h3>
                {selectedMember.description ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{selectedMember.description}</p> : null}

                <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                  {selectedMember.email ? (
                    <div className="flex items-center gap-3 py-3">
                      <EnvelopeIcon className="h-5 w-5 shrink-0 text-brand-blue" />
                      <div className="min-w-0">
                        <dt className="text-[10px] font-bold uppercase text-slate-500">Email</dt>
                        <dd><a href={`mailto:${selectedMember.email}`} className="break-all text-sm font-semibold text-slate-800 hover:text-brand-blue hover:underline">{selectedMember.email}</a></dd>
                      </div>
                    </div>
                  ) : null}
                  {selectedMember.phone ? (
                    <div className="flex items-center gap-3 py-3">
                      <PhoneIcon className="h-5 w-5 shrink-0 text-brand-blue" />
                      <div>
                        <dt className="text-[10px] font-bold uppercase text-slate-500">Phone</dt>
                        <dd><a href={`tel:${selectedMember.phone}`} className="text-sm font-semibold text-slate-800 hover:text-brand-blue hover:underline">{selectedMember.phone}</a></dd>
                      </div>
                    </div>
                  ) : null}
                  {formatMemberSince(selectedMember.memberSince) ? (
                    <div className="flex items-center gap-3 py-3">
                      <CalendarDaysIcon className="h-5 w-5 shrink-0 text-brand-blue" />
                      <div>
                        <dt className="text-[10px] font-bold uppercase text-slate-500">Serving since</dt>
                        <dd className="text-sm font-semibold text-slate-800">{formatMemberSince(selectedMember.memberSince)}</dd>
                      </div>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </div>
  );
};

export default AboutPage;
