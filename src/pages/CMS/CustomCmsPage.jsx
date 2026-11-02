import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import PageHero from '../../components/common/PageHero';
import Seo from '../../components/common/Seo';
import cmsService from '../../services/cmsService';

const isImage = (value = '') => /\.(png|jpe?g|gif|webp|svg|avif)(\?.*)?$/i.test(String(value || ''));

const CustomCmsPage = () => {
  const { pathname } = useLocation();
  const key = pathname.replace(/^\/+|\/+$/g, '');
  const { data: pages, isLoading, isError } = useQuery({ queryKey: ['cms-pages-public'], queryFn: () => cmsService.getAllPageContent().then((res) => res.data) });
  if (isLoading) return <p role="status" className="p-8 text-center">Loading page…</p>;
  if (isError) return <p role="alert" className="p-8 text-center">Unable to load this page. Please try again.</p>;
  const content = Object.prototype.hasOwnProperty.call(pages || {}, key) && !pages[key]?.deleted ? pages[key] : null;
  if (!content) return <div className="space-y-4 py-12 text-center"><h1 className="text-3xl font-bold">Page not found</h1><p>This page has not been published yet.</p><Link to="/" className="font-bold text-brand-blue">Return home</Link></div>;
  return <div className="space-y-8">
    <Seo title={content.heroTitle || key} description={content.heroDescription || ''} />
    <PageHero title={content.heroTitle || key} description={content.heroDescription || ''} />
    {content.mediaUrl ? isImage(content.mediaUrl) ? <img src={content.mediaUrl} alt={content.heroTitle || ''} className="max-h-96 w-full rounded-xl object-contain" /> : <a href={content.mediaUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand-blue">Open page media</a> : null}
    {content.intro ? <div className="prose max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: content.intro }} /> : null}
    <div className="grid gap-6 md:grid-cols-2">{(content.sections || []).map((section) => <section key={section.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-heading text-2xl font-bold text-brand-blue">{section.title}</h2>
      <div className="prose mt-3 max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: section.body }} />
      {section.mediaUrl ? isImage(section.mediaUrl) ? <img src={section.mediaUrl} alt={section.title || ''} className="mt-4 max-h-80 w-full rounded-lg object-contain" loading="lazy" /> : <a href={section.mediaUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block font-semibold text-brand-blue">Open reference media</a> : null}
    </section>)}</div>
  </div>;
};

export default CustomCmsPage;