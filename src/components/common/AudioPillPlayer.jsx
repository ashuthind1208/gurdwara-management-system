import { useEffect, useMemo, useRef, useState } from 'react';
import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid';
import Hls from 'hls.js';

const AudioPillPlayer = ({
  label,
  subtitle,
  src,
  startAtSeconds = 0,
  className = '',
  accent = 'light',
  stream = false,
  showProgress = false,
  autoPlay = false,
  initialVolume = 1,
  minimal = false,
  stopSignal = 0
}) => {
  const audioRef = useRef(null);
  const seekAppliedRef = useRef(false);
  const retryTimeoutRef = useRef(null);
  const retryStreamRef = useRef(() => {});
  const playbackRequestedRef = useRef(false);
  const hlsRef = useRef(null);
  const touchPlaybackHandledRef = useRef(false);
  const touchPlaybackTimeoutRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const resolvedSrc = useMemo(() => {
    if (!stream) {
      return src;
    }

    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}t=${Date.now()}`;
  }, [src, stream]);
  const usesHlsJs = stream && /\.m3u8(?:$|\?)/i.test(resolvedSrc) && Hls.isSupported();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !usesHlsJs) {
      return undefined;
    }

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      liveSyncDurationCount: 3
    });
    hlsRef.current = hls;
    hls.attachMedia(audio);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(resolvedSrc));
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) {
        return;
      }
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
        return;
      }
      setHasError(true);
      setIsPlaying(false);
    });

    return () => {
      hlsRef.current = null;
      hls.destroy();
    };
  }, [resolvedSrc, usesHlsJs]);

  useEffect(() => {
    seekAppliedRef.current = false;
  }, [resolvedSrc]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
  }, [stopSignal]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return undefined;
    }

    const tryApplySeek = () => {
      if (seekAppliedRef.current) {
        return;
      }

      const seekTo = Math.max(0, Number(startAtSeconds) || 0);
      if (seekTo <= 0 || Number.isNaN(seekTo)) {
        seekAppliedRef.current = true;
        return;
      }

      try {
        audio.currentTime = seekTo;
      } catch {
        return;
      }

      seekAppliedRef.current = true;
    };

    const clearRetry = () => {
      if (retryTimeoutRef.current) {
        window.clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
    };
    const retryStream = () => {
      if (!stream || !playbackRequestedRef.current || retryTimeoutRef.current) {
        return;
      }
      retryTimeoutRef.current = window.setTimeout(async () => {
        retryTimeoutRef.current = null;
        if (!playbackRequestedRef.current) {
          return;
        }
        if (hlsRef.current) {
          hlsRef.current.startLoad();
        } else {
          audio.load();
        }
        try {
          await audio.play();
        } catch {
          retryStream();
        }
      }, 1800);
    };
    retryStreamRef.current = retryStream;
    const resumeRequestedPlayback = () => {
      if (!stream || !playbackRequestedRef.current || !audio.paused) {
        return;
      }
      audio.play().catch(retryStream);
    };
    const onPlay = () => {
      clearRetry();
      setHasError(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onLoadedMetadata = () => setDuration(Number(audio.duration) || 0);
    const onDurationChange = () => setDuration(Number(audio.duration) || 0);
    const onTimeUpdate = () => setCurrentTime(Number(audio.currentTime) || 0);
    const onError = () => {
      setHasError(true);
      setIsPlaying(false);
      retryStream();
    };
    const onStalled = () => retryStream();

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('error', onError);
    audio.addEventListener('stalled', onStalled);
    audio.addEventListener('loadedmetadata', tryApplySeek);
    audio.addEventListener('loadedmetadata', resumeRequestedPlayback);
    audio.addEventListener('canplay', resumeRequestedPlayback);

    if (audio.readyState >= 1) {
      tryApplySeek();
    }

    return () => {
      audio.pause();
      clearRetry();
      retryStreamRef.current = () => {};
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('stalled', onStalled);
      audio.removeEventListener('loadedmetadata', tryApplySeek);
      audio.removeEventListener('loadedmetadata', resumeRequestedPlayback);
      audio.removeEventListener('canplay', resumeRequestedPlayback);
    };
  }, [startAtSeconds, resolvedSrc, stream]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.volume = Math.min(1, Math.max(0, Number(initialVolume) || 0));
    if (!autoPlay) return undefined;
    let cancelled = false;
    playbackRequestedRef.current = true;
    audio.play().catch(() => {
      if (cancelled) return;
      playbackRequestedRef.current = false;
      setIsPlaying(false);
      setAutoplayBlocked(true);
    });
    return () => { cancelled = true; playbackRequestedRef.current = false; audio.pause(); };
  }, [autoPlay, initialVolume, resolvedSrc]);

  useEffect(() => () => {
    if (touchPlaybackTimeoutRef.current) {
      window.clearTimeout(touchPlaybackTimeoutRef.current);
    }
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    setHasError(false);
    setAutoplayBlocked(false);

    if (audio.paused) {
      playbackRequestedRef.current = true;
      try {
        if (hlsRef.current) {
          hlsRef.current.startLoad();
        } else if (stream && audio.error) {
          audio.load();
        }
        await audio.play();
      } catch (error) {
        setIsPlaying(false);
        if (stream) {
          retryStreamRef.current();
        } else {
          setHasError(true);
        }
      }
      return;
    }

    playbackRequestedRef.current = false;
    if (retryTimeoutRef.current) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    audio.pause();
  };

  const handlePlaybackTouchEnd = (event) => {
    event.preventDefault();
    event.stopPropagation();
    touchPlaybackHandledRef.current = true;
    if (touchPlaybackTimeoutRef.current) {
      window.clearTimeout(touchPlaybackTimeoutRef.current);
    }
    touchPlaybackTimeoutRef.current = window.setTimeout(() => {
      touchPlaybackHandledRef.current = false;
      touchPlaybackTimeoutRef.current = null;
    }, 500);
    togglePlayback();
  };

  const handlePlaybackClick = () => {
    if (touchPlaybackHandledRef.current) {
      touchPlaybackHandledRef.current = false;
      if (touchPlaybackTimeoutRef.current) {
        window.clearTimeout(touchPlaybackTimeoutRef.current);
        touchPlaybackTimeoutRef.current = null;
      }
      return;
    }
    togglePlayback();
  };

  const toneClasses = accent === 'dark'
    ? 'border-white/20 bg-slate-950/35 text-white backdrop-blur-md'
    : 'border-brand-blue/15 bg-white text-slate-900';

  const subtitleClasses = accent === 'dark' ? 'text-blue-100/80' : 'text-slate-500';
  const pulseClasses = isPlaying ? 'bg-green-400 animate-pulse' : accent === 'dark' ? 'bg-white/35' : 'bg-slate-300';
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (currentTime / safeDuration) * 100)) : 0;

  return (
    <div className={`${minimal ? 'text-inherit' : `rounded-2xl border px-3 py-2 shadow-lg ${toneClasses}`} ${className}`}>
      <audio ref={audioRef} preload="none" src={usesHlsJs ? undefined : resolvedSrc} />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onTouchEnd={handlePlaybackTouchEnd}
          onClick={handlePlaybackClick}
          className={`inline-flex ${minimal ? 'h-8 w-8 border border-current' : 'h-10 w-10'} items-center justify-center rounded-full touch-manipulation select-none ${minimal ? '' : accent === 'dark' ? 'bg-white text-brand-blue' : 'bg-brand-blue text-white'}`}
          aria-label={`${isPlaying ? 'Pause' : 'Play'} ${label}`}
        >
          {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </button>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{label}</p>
          {!minimal || hasError || autoplayBlocked ? <p className={`truncate text-xs ${minimal ? '' : subtitleClasses}`}>{hasError ? 'Audio temporarily unavailable' : autoplayBlocked ? 'Tap Play to listen' : subtitle}</p> : null}
        </div>

        {!minimal ? <span className={`ml-auto h-2.5 w-2.5 rounded-full ${pulseClasses}`} /> : null}
      </div>
      {showProgress ? (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-brand-blue transition-all duration-150" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AudioPillPlayer;