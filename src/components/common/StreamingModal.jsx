import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircleIcon, SpeakerWaveIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { getStreamingEmbedUrl, resolveStreamingLive, isYouTubeSource } from '../../services/streamingService';
import { getYouTubeEmbedUrl } from '../../services/videoService';
import gurdwaraLogo from '../../assets/default-gurdwara.svg';

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

const isLikelyMobileDevice = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  const ua = typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '';
  const compactViewport = window.matchMedia('(max-width: 1024px)').matches;
  return /android|iphone|ipad|ipod|mobile/i.test(ua) || compactViewport;
};

const startPlaybackWithVolume = (iframe, volume = 50) => {
  sendYouTubeCommand(iframe, 'setVolume', [volume]);
  sendYouTubeCommand(iframe, 'unMute');
  sendYouTubeCommand(iframe, 'playVideo');
};

const isPlainYouTubeChannel = (value = '') => {
  const input = String(value || '').trim();
  return Boolean(input && !/^https?:\/\//i.test(input) && !input.includes('/'));
};

const isChannelLikeSource = (value = '') => {
  const input = String(value || '').trim();
  if (!input) {
    return false;
  }

  if (/^@/i.test(input) || /^UC[A-Za-z0-9_-]{20,}$/i.test(input) || isPlainYouTubeChannel(input)) {
    return true;
  }

  return /youtube\.com\/@|youtube\.com\/channel\//i.test(input);
};

const isDirectYouTubeVideoSource = (value = '') => {
  const input = String(value || '').trim();
  if (!input) {
    return false;
  }

  if (input.includes('youtube.com/embed/')) {
    return true;
  }

  return Boolean(
    input.match(/youtu\.be\/[A-Za-z0-9_-]{11}/i)
    || input.match(/[?&]v=[A-Za-z0-9_-]{11}/i)
    || input.match(/youtube\.com\/(shorts|live)\/[A-Za-z0-9_-]{11}/i)
  );
};

const StreamingModal = ({ open, streams = [], initialStreamId = '', onClose }) => {
  const [resolvedLiveEmbed, setResolvedLiveEmbed] = useState('');
  const [isResolvingLive, setIsResolvingLive] = useState(false);
  const [mobileSoundEnabled, setMobileSoundEnabled] = useState(false);
  const [streamFrameNode, setStreamFrameNode] = useState(null);

  const streamItems = useMemo(() => {
    const rawItems = Array.isArray(streams) ? streams : [];
    return rawItems.filter((entry) => entry?.streamUrl).map((entry, index) => ({
      ...entry,
      id: entry.id || `stream-modal-${index}`
    }));
  }, [streams]);

  const selectedStream = useMemo(() => {
    if (streamItems.length === 0) {
      return null;
    }

    return streamItems.find((entry) => entry.id === initialStreamId)
      || streamItems.find((entry) => entry.active)
      || streamItems[0];
  }, [initialStreamId, streamItems]);

  useEffect(() => {
    let mounted = true;
    setResolvedLiveEmbed('');
    setIsResolvingLive(false);
    setMobileSoundEnabled(false);

    const source = String(selectedStream?.streamUrl || '').trim();
    if (!source) {
      return () => {
        mounted = false;
      };
    }

    const youtubeSource = isYouTubeSource(source);
    const channelLikeSource = isChannelLikeSource(source);
    const hasDirectEmbed = youtubeSource
      ? isDirectYouTubeVideoSource(source) && Boolean(getYouTubeEmbedUrl(source))
      : Boolean(getStreamingEmbedUrl(source));

    if (hasDirectEmbed) {
      return () => {
        mounted = false;
      };
    }

    if (!youtubeSource || !channelLikeSource) {
      return () => {
        mounted = false;
      };
    }

    setIsResolvingLive(true);

    resolveStreamingLive(source)
      .then((result) => {
        if (!mounted) {
          return;
        }

        if (result?.available && result?.embedUrl) {
          setResolvedLiveEmbed(String(result.embedUrl));
          setIsResolvingLive(false);
          return;
        }

        const channelId = String(result?.channelId || '').trim();
        if (/^UC[A-Za-z0-9_-]{20,}$/i.test(channelId)) {
          setResolvedLiveEmbed(`https://www.youtube.com/embed/live_stream?channel=${channelId}`);
        }

        setIsResolvingLive(false);
      })
      .catch(() => {
        if (mounted) {
          setResolvedLiveEmbed('');
          setIsResolvingLive(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [selectedStream?.streamUrl]);

  if (!open) {
    return null;
  }

  const sourceUrl = String(selectedStream?.streamUrl || '').trim();
  const youtubeSource = isYouTubeSource(sourceUrl);
  const channelLikeSource = youtubeSource && isChannelLikeSource(sourceUrl);
  const parsedYouTubeEmbedUrl = youtubeSource ? getYouTubeEmbedUrl(sourceUrl) : '';
  const directEmbedUrl = youtubeSource
    ? (isDirectYouTubeVideoSource(sourceUrl) ? parsedYouTubeEmbedUrl : '')
    : getStreamingEmbedUrl(sourceUrl);
  const channelFallbackEmbed = youtubeSource && !isDirectYouTubeVideoSource(sourceUrl)
    ? parsedYouTubeEmbedUrl
    : '';
  const resolvedEmbedUrl = resolvedLiveEmbed || directEmbedUrl || channelFallbackEmbed;
  const mobileDevice = isLikelyMobileDevice();
  const autoplayParams = mobileDevice
    ? 'autoplay=1&playsinline=1&mute=1&muted=1&enablejsapi=1'
    : 'autoplay=1&playsinline=1&enablejsapi=1';
  const canPlay = Boolean(
    selectedStream?.active
    && (channelLikeSource ? (resolvedLiveEmbed || channelFallbackEmbed) : resolvedEmbedUrl)
  );

  const enableMobileSound = () => {
    if (!streamFrameNode) {
      return;
    }
    startPlaybackWithVolume(streamFrameNode, 50);
    window.setTimeout(() => startPlaybackWithVolume(streamFrameNode, 50), 150);
    setMobileSoundEnabled(true);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/70 px-4 py-6"
      onClick={onClose}
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          style={{ maxHeight: 'calc(100vh - 3rem)' }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="absolute right-4 top-4 z-20 rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm transition hover:border-brand-blue hover:text-brand-blue"
            onClick={onClose}
            aria-label="Close streaming modal"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          <div className="flex max-h-[calc(100vh-3rem)] flex-col overflow-y-auto">
            <div className="border-b border-slate-100 px-5 py-4 pr-14">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-blue">Live Stream</p>
                  <h3 className="mt-1 text-xl font-bold text-slate-900">{selectedStream?.title || 'Live Stream'}</h3>
                  <p className="mt-1 text-sm text-slate-600">{selectedStream?.text || 'Playing now in popup'}</p>
                </div>
                <div className="flex items-center justify-start gap-2 pr-12 text-xs">
                  <span className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${selectedStream?.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                    <CheckCircleIcon className="h-4 w-4" />
                    {selectedStream?.active ? 'Active' : 'Inactive'}
                  </span>
                  {youtubeSource && mobileDevice && canPlay && !mobileSoundEnabled ? (
                    <button
                      type="button"
                      onClick={enableMobileSound}
                      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 transition hover:bg-amber-100"
                    >
                      <SpeakerWaveIcon className="h-4 w-4" />
                      Tap for 50% sound
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="bg-slate-950">
              <div className="relative aspect-video w-full">
                {canPlay ? (
                  <>
                    <iframe
                      className="h-full w-full"
                      src={youtubeSource ? `${resolvedEmbedUrl}${resolvedEmbedUrl.includes('?') ? '&' : '?'}${autoplayParams}&origin=${encodeURIComponent(window.location.origin)}` : resolvedEmbedUrl}
                      title={selectedStream?.title || 'Live stream'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                      ref={(iframe) => {
                        setStreamFrameNode(iframe || null);
                        if (!iframe || !youtubeSource) {
                          return;
                        }

                        const onLoad = () => {
                          if (mobileDevice) {
                            sendYouTubeCommand(iframe, 'mute');
                            sendYouTubeCommand(iframe, 'playVideo');
                            return;
                          }

                          startPlaybackWithVolume(iframe, 50);

                          window.setTimeout(() => startPlaybackWithVolume(iframe, 50), 250);
                          window.setTimeout(() => startPlaybackWithVolume(iframe, 50), 1000);
                        };

                        iframe.addEventListener('load', onLoad, { once: true });
                      }}
                    />

                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-white">
                    <div>
                      {isResolvingLive ? (
                        <>
                          <p className="text-lg font-semibold">Loading live stream...</p>
                          <p className="mt-2 text-sm text-slate-300">Please wait while we connect to the channel.</p>
                        </>
                      ) : (
                        <>
                          <div className="flex min-h-[320px] w-full flex-col items-center justify-center bg-brand-blue px-6 py-8 text-center">
                            <img
                              src={gurdwaraLogo}
                              alt="Gurdwara logo"
                              className="h-24 w-24 rounded-full border-2 border-white/75 object-cover shadow-lg"
                            />
                            <p className="mt-5 max-w-lg text-base font-semibold leading-relaxed text-white">
                              We are sorry, but the video is unavailable or streaming is closed. Please check back later.
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            {canPlay ? (
              <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
                {!youtubeSource ? <p className="mb-2">If this provider blocks embedded playback, open its public player below. Use the player's own audio controls.</p> : null}
                <a href={youtubeSource ? (resolvedLiveEmbed || resolvedEmbedUrl) : resolvedEmbedUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue underline">Open stream in a new tab</a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  , document.body);
};

export default StreamingModal;