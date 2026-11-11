import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XMarkIcon } from '@heroicons/react/24/outline';
import PageHero from '../../components/common/PageHero';
import Seo from '../../components/common/Seo';
import Card from '../../components/ui/Card';
import useSeoMeta from '../../hooks/useSeoMeta';
import videoService, { CATEGORIES, getYouTubeEmbedUrl, getYouTubeThumbnail, getFacebookEmbedUrl } from '../../services/videoService';
import { siteConfig } from '../../constants/siteConfig';

const PAGE_SIZE = 9;

const sendYouTubeCommand = (iframe, func, args = []) => {
  if (!iframe?.contentWindow) {
    return;
  }

  iframe.contentWindow.postMessage(
    JSON.stringify({
      event: 'command',
      func,
      args
    }),
    '*'
  );
};

const startPlaybackWithVolume = (iframe, volume = 50) => {
  sendYouTubeCommand(iframe, 'setVolume', [volume]);
  sendYouTubeCommand(iframe, 'unMute');
  sendYouTubeCommand(iframe, 'playVideo');
};

const VideosPage = () => {
  const meta = useSeoMeta('Gurdwara Videos', `Watch recordings of samagams, kirtan, katha, and special events at ${siteConfig.name}.`);
  const [activeCategory, setActiveCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [activeVideo, setActiveVideo] = useState(null);

  const { data: videos = [] } = useQuery({
    queryKey: ['gurdwara-videos'],
    queryFn: () => videoService.getVideos().then((res) => res.data)
  });

  const featured = useMemo(() => videos.filter((v) => v.featured), [videos]);

  const filtered = useMemo(() => {
    const base = activeCategory === 'All' ? videos : videos.filter((v) => v.category === activeCategory);
    return base;
  }, [activeCategory, videos]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visibleVideos = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const usedCategories = useMemo(() => {
    const cats = new Set(videos.map((v) => v.category));
    return ['All', ...CATEGORIES.filter((c) => cats.has(c))];
  }, [videos]);

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);
    setPage(1);
  };

  const getThumb = (video) => video.thumbnailUrl || (video.platform === 'youtube' ? getYouTubeThumbnail(video.videoUrl) : '');
  const getEmbedUrl = (video) => {
    if (video.platform === 'youtube') {
      const base = getYouTubeEmbedUrl(video.videoUrl);
      if (!base) {
        return '';
      }

      const separator = base.includes('?') ? '&' : '?';
      return `${base}${separator}autoplay=1&playsinline=1&enablejsapi=1`;
    }

    return getFacebookEmbedUrl(video.videoUrl);
  };

  return (
    <div className="space-y-8">
      <Seo {...meta} />
      <PageHero
        title="Gurdwara Videos"
        description={`Watch recordings of Sunday samagams, kirtan, katha, and special events at ${siteConfig.name}.`}
      />

      {featured.length > 0 ? (
        <section>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Featured</p>
          <div className="grid gap-4 md:grid-cols-2">
            {featured.slice(0, 2).map((video) => {
              const thumb = getThumb(video);
              return (
                <div key={video.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button type="button" onClick={() => setActiveVideo(video)} className="group relative block aspect-video w-full overflow-hidden bg-slate-900">
                    {thumb ? <img src={thumb} alt={video.title} className="h-full w-full object-cover opacity-80 transition group-hover:opacity-60" /> : <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-900" />}
                  </button>
                  <div className="p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{video.category}</p>
                    <h3 className="mt-1 font-heading text-base font-semibold text-slate-800">{video.title}</h3>
                    {video.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{video.description}</p> : null}
                    <p className="mt-1 text-xs text-slate-500">{video.featuredDate}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap gap-2">
          {usedCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => handleCategoryChange(cat)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${activeCategory === cat ? 'bg-brand-blue text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleVideos.map((video) => {
            const thumb = getThumb(video);

            return (
              <Card key={video.id} className="overflow-hidden p-0">
                <button
                  type="button"
                  onClick={() => setActiveVideo(video)}
                  className="group relative block aspect-video w-full overflow-hidden bg-slate-900"
                >
                  {thumb ? <img src={thumb} alt={video.title} className="h-full w-full object-cover opacity-80 transition group-hover:opacity-60" /> : <div className="h-full w-full bg-gradient-to-br from-slate-700 to-slate-900" />}
                </button>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-blue">{video.category}</p>
                      <h3 className="mt-0.5 font-semibold text-slate-800 leading-snug">{video.title}</h3>
                    </div>
                    <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${video.platform === 'youtube' ? 'border-red-200 bg-red-50 text-red-700' : video.platform === 'facebook' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{video.platform}</span>
                  </div>
                  {video.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-600">{video.description}</p> : null}
                  <p className="mt-1 text-xs text-slate-500">{video.featuredDate}</p>
                </div>
              </Card>
            );
          })}

          {filtered.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500">No videos found for this category.</div>
          ) : null}
        </div>

        {totalPages > 1 ? (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Prev</button>
            <span className="text-sm text-slate-600">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Next</button>
          </div>
        ) : null}
      </section>

      {activeVideo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
          <div className="absolute inset-0 bg-slate-900/70" aria-hidden="true" onClick={() => setActiveVideo(null)} />
          <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="w-full bg-black">
              <div className="mx-auto aspect-[16/9] w-full max-h-[72vh]">
              <iframe
                className="h-full w-full"
                src={getEmbedUrl(activeVideo)}
                title={activeVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                onLoad={(event) => {
                  if (activeVideo?.platform !== 'youtube') {
                    return;
                  }

                  const iframe = event.currentTarget;
                  startPlaybackWithVolume(iframe, 50);
                  window.setTimeout(() => startPlaybackWithVolume(iframe, 50), 250);
                  window.setTimeout(() => startPlaybackWithVolume(iframe, 50), 1000);
                }}
                allowFullScreen
              />
              </div>
            </div>
            <div className="p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-heading text-base font-semibold text-slate-800">{activeVideo.title}</h3>
                  <p className="text-xs text-slate-500">{activeVideo.category} · {activeVideo.featuredDate}</p>
                </div>
                <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setActiveVideo(null)}><XMarkIcon className="h-5 w-5" /></button>
              </div>
              <a
                href={activeVideo.videoUrl}
                target="_blank"
                rel="noreferrer"
                className={`mt-3 inline-flex rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${activeVideo.platform === 'facebook' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-brand-blue hover:bg-blue-700'}`}
              >
                {activeVideo.platform === 'facebook' ? 'Open on Facebook →' : 'Open on YouTube →'}
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default VideosPage;
