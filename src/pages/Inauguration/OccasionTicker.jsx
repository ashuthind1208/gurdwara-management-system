import { useEffect, useRef, useState } from 'react';
import './OccasionTicker.css';

const OccasionTicker = ({ occasion, draft = false }) => {
  const [paused, setPaused] = useState(false);
  const copyRef = useRef(null);
  const windowRef = useRef(null);
  const [loop, setLoop] = useState({ repeats: 1, distance: 1800 });
  useEffect(() => {
    const measure = () => {
      const itemWidth = copyRef.current?.getBoundingClientRect().width;
      const viewportWidth = windowRef.current?.getBoundingClientRect().width;
      if (!itemWidth || !viewportWidth) return;
      const repeats = Math.max(1, Math.ceil(viewportWidth / itemWidth) + 1);
      const distance = itemWidth * repeats;
      setLoop((current) => current.repeats === repeats && current.distance === distance ? current : { repeats, distance });
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (copyRef.current) observer?.observe(copyRef.current);
    if (windowRef.current) observer?.observe(windowRef.current);
    return () => observer?.disconnect();
  }, [occasion.speed, occasion.contentEnglish, occasion.contentPunjabi, occasion.fontSize]);
  const english = occasion.contentEnglish.replace(/\s+/g, ' ').trim();
  const punjabi = occasion.contentPunjabi.replace(/\s+/g, ' ').trim();
  const details = <>
    {english ? <span lang="en">{english}</span> : null}
    {english && punjabi ? <span aria-hidden="true">✦</span> : null}
    {punjabi ? <span lang="pa" className="font-gurmukhi">{punjabi}</span> : null}
    <span aria-hidden="true">✦</span>
  </>;
  return <section aria-label="Special occasion ticker" className={`occasion-ticker ${draft ? 'occasion-ticker-draft' : 'occasion-ticker-fixed'}`} style={{ backgroundColor: occasion.backgroundColor, color: occasion.textColor, fontSize: occasion.fontSize, height: `calc(${occasion.height}px + env(safe-area-inset-bottom, 0px))`, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
    <button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume occasion ticker' : 'Pause occasion ticker'} aria-pressed={paused} className="shrink-0 rounded border border-current px-2 py-1 text-xs">{paused ? 'Resume' : 'Pause'}</button>
    <div ref={windowRef} className={`occasion-ticker-window ${paused ? 'occasion-ticker-paused' : ''}`}>
      <div className="occasion-ticker-track" style={{ animationDuration: `${loop.distance / occasion.speed}s`, '--ticker-loop-distance': `${loop.distance}px` }}>
        <div className="occasion-ticker-group">
          {Array.from({ length: loop.repeats }, (_, index) => <div key={index} ref={index === 0 ? copyRef : undefined} aria-hidden={index > 0 ? true : undefined} className="occasion-ticker-copy">{details}</div>)}
        </div>
        <div aria-hidden="true" inert={true} className="occasion-ticker-group">
          {Array.from({ length: loop.repeats }, (_, index) => <div key={index} className="occasion-ticker-copy">{details}</div>)}
        </div>
      </div>
    </div>
  </section>;
};

export default OccasionTicker;