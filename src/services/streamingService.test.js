import { getStreamingEmbedUrl, isYouTubeSource, resolveStreamingLive, validateStreamingSource } from './streamingService';

jest.mock('./contentApiService', () => ({ __esModule: true, default: {} }));

describe('streaming source selection', () => {
  test('recognizes channels and YouTube URLs without matching other hostnames', () => {
    expect(isYouTubeSource('@ExampleGurdwara')).toBe(true);
    expect(isYouTubeSource('Example Gurdwara')).toBe(true);
    expect(isYouTubeSource('https://www.youtube.com/@ExampleGurdwara')).toBe(true);
    expect(isYouTubeSource('https://youtube.com.example.org/player')).toBe(false);
    expect(isYouTubeSource('https://example.org/player?label=youtube.com')).toBe(false);
  });

  test('preserves custom player URL unchanged', async () => {
    const source = 'https://example.org/player?broadcast=123&autoplay=false#live';
    expect(getStreamingEmbedUrl(source)).toBe(source);
    expect(await resolveStreamingLive(source)).toEqual(expect.objectContaining({ embedUrl: source, watchUrl: source, available: false, reason: 'custom_player' }));
  });

  // eslint-disable-next-line no-script-url -- exercise rejection of a dangerous protocol string.
  test.each(['javascript:alert(1)', 'rtmp://example.org/private-key', 'https://user:password@example.org/player', 'https://example.org/stream-overlay?on=1'])('rejects invalid public player source %s', (source) => {
    expect(validateStreamingSource(source)).not.toBe(true);
    expect(getStreamingEmbedUrl(source)).toBe('');
  });
});