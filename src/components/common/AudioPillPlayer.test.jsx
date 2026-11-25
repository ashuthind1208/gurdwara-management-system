import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AudioPillPlayer from './AudioPillPlayer';

jest.mock('hls.js', () => ({ __esModule: true, default: { isSupported: () => false } }));

beforeEach(() => {
  jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
});
afterEach(() => jest.restoreAllMocks());

test('attempts autoplay at half volume and pauses on unmount', () => {
  const volume = jest.spyOn(HTMLMediaElement.prototype, 'volume', 'set');
  const { unmount } = render(<AudioPillPlayer label="Darbar Sahib" src="/live.aac" autoPlay initialVolume={0.5} />);
  expect(volume).toHaveBeenCalledWith(0.5);
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  unmount();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
});

test('blocked autoplay offers user-initiated playback without repeated attempts', async () => {
  HTMLMediaElement.prototype.play.mockRejectedValueOnce(new DOMException('Blocked', 'NotAllowedError'));
  render(<AudioPillPlayer label="Darbar Sahib" src="/live.aac" stream autoPlay initialVolume={0.5} />);
  expect(await screen.findByText('Tap Play to listen')).toBeInTheDocument();
  expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Play Darbar Sahib' }));
  await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
});

test('existing players do not autoplay unless explicitly requested', () => {
  render(<AudioPillPlayer label="Other audio" src="/file.mp3" />);
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});