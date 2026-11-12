import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const fallbackContent = {
  eyebrow: 'Waheguru Ji Ka Khalsa, Waheguru Ji Ki Fateh',
  title: 'Your Gurdwara',
  description: 'Daily hukamnama, samagams, seva, and community support in one place.',
  slideIntervalSeconds: 5,
  slides: [
    {
      image:
        'https://assets.cdn.filesafe.space/b9aAKZlXnebGhQoRLosa/media/654583d092b8570d5a8c5f1a.png',
      eyebrow: 'Weekly Diwan',
      title: 'Sunday Samagam',
      description: 'Sukhmani Sahib, Kirtan, Katha, and Ardaas with Langar sewa',
      primaryCtaLabel: 'View Sunday Program',
      primaryCtaPath: '/events',
      secondaryCtaLabel: 'Register for Seva',
      secondaryCtaPath: '/seva',
      contentLinkLabel: 'Read daily hukamnama',
      contentLinkPath: '/hukamnama'
    }
  ]
};

const findNextAvailableSlide = (currentIndex, slideCount, failedIndexes) => {
  for (let offset = 1; offset <= slideCount; offset += 1) {
    const candidateIndex = (currentIndex + offset) % slideCount;
    if (!failedIndexes.includes(candidateIndex)) {
      return candidateIndex;
    }
  }

  return currentIndex;
};

const HomeHeroBanner = ({ content, actions, topRightSlot, onSlideAction }) => {
  const location = useLocation();
  const isHomeRoute = location.pathname === '/';
  const resolvedContent = content || fallbackContent;
  const slides = useMemo(() => resolvedContent.slides || [], [resolvedContent]);
  const requestedSlideInterval = Number(resolvedContent.slideIntervalSeconds);
  const slideIntervalSeconds = Number.isFinite(requestedSlideInterval)
    ? Math.min(60, Math.max(3, Math.round(requestedSlideInterval)))
    : fallbackContent.slideIntervalSeconds;
  const [index, setIndex] = useState(0);
  const [failedSlideIndexes, setFailedSlideIndexes] = useState([]);

  useEffect(() => {
    if (index >= slides.length && slides.length > 0) {
      setIndex(0);
    }
  }, [index, slides.length]);

  useEffect(() => {
    if (!isHomeRoute || slides.length <= 1) {
      return undefined;
    }

    const rotationTimer = window.setInterval(() => {
      setIndex((prev) => findNextAvailableSlide(prev, slides.length, failedSlideIndexes));
    }, slideIntervalSeconds * 1000);

    return () => window.clearInterval(rotationTimer);
  }, [failedSlideIndexes, isHomeRoute, slideIntervalSeconds, slides.length]);

  const activeSlide = slides[index] || {};
  const activeEyebrow = activeSlide.eyebrow || resolvedContent.eyebrow;
  const activeTitle = activeSlide.title || activeSlide.heading || resolvedContent.title;
  const activeDescription = activeSlide.description || activeSlide.caption || resolvedContent.description;
  const heroSlides = slides.length > 0 ? slides : [fallbackContent.slides[0]];

  const handleSlideImageError = (failedIndex) => {
    const nextFailedIndexes = failedSlideIndexes.includes(failedIndex)
      ? failedSlideIndexes
      : [...failedSlideIndexes, failedIndex];

    setFailedSlideIndexes(nextFailedIndexes);
    if (failedIndex === index) {
      setIndex(findNextAvailableSlide(failedIndex, heroSlides.length, nextFailedIndexes));
    }
  };

  return (
    <section className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden">
      <div className="relative h-[500px] w-full md:h-[600px] lg:h-[680px]">
        <img
          key={`${activeSlide.title || activeSlide.heading || 'hero'}-${index}`}
          src={activeSlide.image || heroSlides[0].image}
          alt={activeSlide.heading || activeSlide.title || 'Hero slide'}
          className="block h-full w-full object-cover md:absolute md:inset-0 md:z-[1] md:opacity-80"
          loading="eager"
          decoding="async"
          style={{ display: 'none' }}
          onLoad={(event) => {
            event.currentTarget.style.display = 'block';
          }}
          onError={() => handleSlideImageError(index)}
        />

        <div data-testid="home-hero-overlay" className="pointer-events-none absolute inset-0 z-[2] bg-black/70" />
      </div>

      {topRightSlot ? (
        <div className="absolute right-4 top-4 z-10 w-[220px] max-w-[calc(100%-2rem)] md:right-6 md:top-6 md:w-[260px]">
          {topRightSlot}
        </div>
      ) : null}

      <div className="absolute inset-0 z-10 text-white">
        <div data-testid="home-hero-content-container" className="mx-auto flex h-full w-full max-w-7xl flex-col items-start justify-end px-4 pb-8 md:px-6 md:pb-12">
          <div data-testid="home-hero-text" className="w-full pl-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-saffron drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">{activeEyebrow}</p>
        <h1 className="mt-3 max-w-3xl font-heading text-3xl font-bold leading-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.85)] md:text-5xl">{activeTitle}</h1>
        <p className="mt-3 max-w-3xl text-sm text-blue-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] md:text-base">{activeDescription}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          {activeSlide.primaryCtaLabel && activeSlide.primaryCtaPath ? (
            <button
              type="button"
              onClick={() => onSlideAction?.(activeSlide.primaryCtaPath)}
              className="inline-flex items-center justify-center rounded-xl bg-[color:var(--theme-button,#0b4ea2)] px-5 py-2.5 font-medium text-white transition hover:bg-[color:var(--theme-button-hover,#f4a300)]"
            >
              {activeSlide.primaryCtaLabel}
            </button>
          ) : null}
          {activeSlide.secondaryCtaLabel && activeSlide.secondaryCtaPath ? (
            <button
              type="button"
              onClick={() => onSlideAction?.(activeSlide.secondaryCtaPath)}
              className="inline-flex items-center justify-center rounded-xl border border-white/70 bg-transparent px-5 py-2.5 font-medium text-white transition hover:bg-white/10"
            >
              {activeSlide.secondaryCtaLabel}
            </button>
          ) : actions}
        </div>
        {(activeSlide.contentLinkLabel && activeSlide.contentLinkPath) || (activeSlide.contentLinkTwoLabel && activeSlide.contentLinkTwoPath) ? (
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-blue-50">
            {activeSlide.contentLinkLabel && activeSlide.contentLinkPath ? (
              <button type="button" onClick={() => onSlideAction?.(activeSlide.contentLinkPath)} className="underline underline-offset-4">
                {activeSlide.contentLinkLabel}
              </button>
            ) : null}
            {activeSlide.contentLinkTwoLabel && activeSlide.contentLinkTwoPath ? (
              <button type="button" onClick={() => onSlideAction?.(activeSlide.contentLinkTwoPath)} className="underline underline-offset-4">
                {activeSlide.contentLinkTwoLabel}
              </button>
            ) : null}
          </div>
        ) : null}
          </div>
        </div>
      </div>

      {isHomeRoute && slides.length > 1 ? (
        <div className="absolute bottom-5 right-5 z-10 flex gap-2 md:bottom-6 md:right-6">
          {slides.map((slide, dotIndex) => failedSlideIndexes.includes(dotIndex) ? null : (
              <button
                key={`${slide.title || slide.heading}-${dotIndex}`}
                onClick={() => setIndex(dotIndex)}
                className={`h-2.5 rounded-full transition ${
                  dotIndex === index ? 'w-7 bg-brand-saffron' : 'w-2.5 bg-white/65'
                }`}
                aria-label={`Show slide ${dotIndex + 1}`}
              />
            ))}
        </div>
      ) : null}
    </section>
  );
};

export default HomeHeroBanner;
