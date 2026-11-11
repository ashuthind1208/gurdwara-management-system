import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import Card from '../../components/ui/Card';
import StatusAlert from '../../components/common/StatusAlert';
import useDailyHukamnama from '../../hooks/useDailyHukamnama';
import ledAnnouncementService, { isAnnouncementForScreen, isAnnouncementLive } from '../../services/ledAnnouncementService';
import ledBoardSettingsService, { clampHukamnamaSeconds, clampInterval, clampWelcomeSeconds } from '../../services/ledBoardSettingsService';
import { DEFAULT_HUKAMNAMA_SECONDS, DEFAULT_INTERVAL_SECONDS, DEFAULT_WELCOME_SECONDS, HUKAMNAMA_MAX_SECONDS, HUKAMNAMA_MIN_SECONDS, HUKAMNAMA_PRESETS, INTERVAL_PRESETS, LED_BOARDS, MAX_CUSTOM_SCREENS, MAX_INTERVAL_SECONDS, MIN_INTERVAL_SECONDS, WELCOME_MAX_SECONDS, WELCOME_MIN_SECONDS, WELCOME_PRESETS, buildLedSlides, getLedScreens, slugifyScreenId } from '../../constants/ledBoards';

const SETTINGS_QUERY_KEY = ['led-board-settings'];

const formatDuration = (totalSeconds) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', seconds || (!hours && !minutes) ? `${seconds}s` : ''].filter(Boolean).join(' ');
};

const SecondsControl = ({ id, label, value, min, max, presets, onCommit, compact = false }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  return (
    <div className={compact ? 'mr-2 shrink-0 rounded-lg border border-brand-blue/20 bg-blue-50 p-1.5' : ''}>
      {compact ? null : <label htmlFor={id} className="block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</label>}
      <div className={`flex items-center gap-1.5 ${compact ? '' : 'mt-1'}`}>
        <input id={id} aria-label={label} type="number" inputMode="numeric" min={min} max={max} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => onCommit(draft)} onKeyDown={(event) => { if (event.key === 'Enter') onCommit(draft); }} className={`${compact ? 'w-16 px-2 py-1.5' : 'w-24 px-3 py-2'} rounded-lg border border-slate-300 text-sm font-bold text-slate-800 outline-none focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/20`} />
        <div className="flex gap-1" role="group" aria-label={`${label} presets`}>
          {presets.map((preset) => <button key={preset} type="button" onClick={() => onCommit(preset)} aria-pressed={value === preset} className={`rounded-lg border px-2.5 py-2 text-xs font-bold ${value === preset ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>{preset}s</button>)}
        </div>
      </div>
    </div>
  );
};

const LedBoardControlCard = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState({ type: 'success', message: '' });
  const [selectedScreen, setSelectedScreen] = useState('main');
  const [addingScreen, setAddingScreen] = useState(false);
  const [newScreenName, setNewScreenName] = useState('');

  const { data: settings } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: () => ledBoardSettingsService.getSettings().then((response) => response.data)
  });
  const { data: announcements = [] } = useQuery({
    queryKey: ['led-board-announcements'],
    queryFn: () => ledAnnouncementService.getAnnouncements().then((response) => response.data)
  });
  const { hasHukamnama } = useDailyHukamnama();
  const liveAnnouncements = useMemo(() => announcements.filter((entry) => isAnnouncementLive(entry) && isAnnouncementForScreen(entry, 'main')), [announcements]);

  // Changes save immediately and optimistically; the LED screen picks them up on its next refresh.
  const saveMutation = useMutation({
    mutationFn: (next) => ledBoardSettingsService.saveSettings(next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_QUERY_KEY });
      const previous = queryClient.getQueryData(SETTINGS_QUERY_KEY);
      queryClient.setQueryData(SETTINGS_QUERY_KEY, next);
      return { previous };
    },
    onError: (error, _next, context) => {
      if (context?.previous) queryClient.setQueryData(SETTINGS_QUERY_KEY, context.previous);
      setStatus({ type: 'error', message: error.message || 'Unable to save the LED board settings.' });
    },
    onSuccess: () => setStatus({ type: 'success', message: 'Saved. The LED screen updates within about 5 seconds.' })
  });

  const slides = useMemo(
    () => (settings ? buildLedSlides(settings, { liveAnnouncements, hasHukamnama }) : []),
    [settings, liveAnnouncements, hasHukamnama]
  );

  if (!settings) return <Card><p className="text-sm text-slate-600">Loading LED board settings...</p></Card>;

  const save = (patch) => saveMutation.mutate({ ...(queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings), ...patch });
  const toggleBoard = (key) => {
    const current = queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings;
    save({ enabled: { ...current.enabled, [key]: !current.enabled[key] } });
  };
  const durationFor = (key) => settings.slideDurations?.[key]
    || (key === 'hukamnama' ? settings.hukamnamaSeconds || DEFAULT_HUKAMNAMA_SECONDS
      : key === 'welcome' ? settings.welcomeSeconds || settings.intervalSeconds || DEFAULT_WELCOME_SECONDS
        : settings.intervalSeconds || DEFAULT_INTERVAL_SECONDS);
  const presetsFor = (key) => key === 'hukamnama' ? HUKAMNAMA_PRESETS : key === 'welcome' ? WELCOME_PRESETS : INTERVAL_PRESETS;
  const commitSlideDuration = (key, value) => {
    const next = key === 'hukamnama' ? clampHukamnamaSeconds(value)
      : key === 'welcome' ? clampWelcomeSeconds(value) : clampInterval(value);
    const current = queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings;
    if (next === current.slideDurations?.[key]) return;
    const slideDurations = { ...current.slideDurations, [key]: next };
    save({ slideDurations, ...(key === 'hukamnama' ? { hukamnamaSeconds: next } : {}), ...(key === 'welcome' ? { welcomeSeconds: next } : {}) });
  };

  const setScreenPlaylist = (screenId, keys) => {
    const current = queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings;
    const screenPlaylists = { ...(current.screenPlaylists || {}) };
    screenPlaylists[screenId] = [...new Set(keys)];
    save({ screenPlaylists });
  };

  const screens = getLedScreens(settings);
  const selectedScreenInfo = screens.find((screen) => screen.id === selectedScreen) || screens[0];
  const isCustomScreen = (settings.customScreens || []).some((screen) => screen.id === selectedScreen);

  const addScreen = (event) => {
    event.preventDefault();
    const label = newScreenName.trim().slice(0, 60);
    const id = slugifyScreenId(label);
    if (!id) { setStatus({ type: 'error', message: 'Enter a name using letters or numbers.' }); return; }
    if (screens.some((screen) => screen.id === id)) { setStatus({ type: 'error', message: `A screen called "${id}" already exists.` }); return; }
    if ((settings.customScreens || []).length >= MAX_CUSTOM_SCREENS) { setStatus({ type: 'error', message: `You can add up to ${MAX_CUSTOM_SCREENS} custom screens.` }); return; }
    const current = queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings;
    save({ customScreens: [...(current.customScreens || []), { id, label }] });
    setSelectedScreen(id);
    setAddingScreen(false);
    setNewScreenName('');
  };

  const removeScreen = () => {
    if (!window.confirm(`Remove the "${selectedScreenInfo.label}" screen and its playlist?`)) return;
    const current = queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings;
    const screenPlaylists = { ...(current.screenPlaylists || {}) };
    delete screenPlaylists[selectedScreen];
    save({ customScreens: (current.customScreens || []).filter((screen) => screen.id !== selectedScreen), screenPlaylists });
    setSelectedScreen('main');
  };

  const selectedPlaylist = [...(settings.screenPlaylists?.[selectedScreen]
    || LED_BOARDS.filter((board) => settings.enabled[board.key]).map((board) => board.key))];
  if (selectedScreen === 'lobby' && settings.enabled.welcome && !selectedPlaylist.includes('welcome')) selectedPlaylist.push('welcome');

  const cycleSeconds = slides.reduce((total, slide) => total + slide.durationSeconds, 0);

  return (
    <Card className="w-full min-w-0 max-w-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">LED Board Slideshow</h2>
          <p className="mt-1 text-sm text-slate-600">Choose which boards the LED screen plays and how long each stays on screen. Changes apply automatically; nothing needs to be restarted.</p>
        </div>
        <a href={`/led-boards?screen=${selectedScreen}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-brand-blue/30 px-3 py-2 text-sm font-semibold text-brand-blue hover:bg-blue-50"><ArrowTopRightOnSquareIcon className="h-4 w-4" /> Open {selectedScreenInfo.label}</a>
      </div>

      <div className="mt-3"><StatusAlert type={status.type} message={status.message} /></div>

      <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-3 border-b border-slate-100 pb-4">
        <p className="pb-2 text-sm font-semibold text-slate-700" aria-live="polite">
          {slides.length ? `${slides.length} slide${slides.length === 1 ? '' : 's'} · full cycle ${formatDuration(cycleSeconds)}` : 'No slides active. The LED screen shows the Gurdwara logo.'}
        </p>
      </div>

      <ul className="mt-3 grid w-full min-w-0 grid-cols-1 gap-2">
        {LED_BOARDS.map((board) => {
          const Icon = board.icon;
          const enabled = settings.enabled[board.key];
          const note = board.isAnnouncementBoard
            ? (liveAnnouncements.length === 0 ? 'No active announcements; skipped until one is added' : `${liveAnnouncements.length} active announcement${liveAnnouncements.length === 1 ? '' : 's'}, one slide each`)
            : board.key === 'hukamnama' && !hasHukamnama
              ? 'Not posted for today yet; skipped until it is'
              : board.description;
          return (
            <li key={board.key} className="min-w-0 rounded-lg border border-slate-200 px-3 py-2.5">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${board.accent}`}><Icon className="h-5 w-5" /></span>
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">{board.title}</p>
                  <p className="truncate text-xs text-slate-500" title={note}>{note}</p>
                </div>
                <SecondsControl id={`led-${board.key}-seconds`} label={`${board.title} slide duration in seconds`} value={durationFor(board.key)} min={board.key === 'hukamnama' ? HUKAMNAMA_MIN_SECONDS : board.key === 'welcome' ? WELCOME_MIN_SECONDS : MIN_INTERVAL_SECONDS} max={board.key === 'hukamnama' ? HUKAMNAMA_MAX_SECONDS : board.key === 'welcome' ? WELCOME_MAX_SECONDS : MAX_INTERVAL_SECONDS} presets={presetsFor(board.key)} onCommit={(value) => commitSlideDuration(board.key, value)} compact />
                <a href={board.path} target="_blank" rel="noreferrer" className="shrink-0 rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50" title={`Open ${board.title}`} aria-label={`Open ${board.title}`}><ArrowTopRightOnSquareIcon className="h-4 w-4" /></a>
                <button type="button" role="switch" aria-checked={enabled} aria-label={`${board.title} ${enabled ? 'active' : 'inactive'}`} onClick={() => toggleBoard(board.key)} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold text-slate-900">Per-screen playlists</h3><p className="text-xs text-slate-500">Each physical screen opens its own address, e.g. /led-boards?screen=darbar. Pick a screen below, or choose Custom to add your own. Unconfigured screens use the global playlist.</p></div>
          <select aria-label="Select LED screen" value={addingScreen ? '__custom__' : selectedScreen} onChange={(event) => { if (event.target.value === '__custom__') setAddingScreen(true); else { setAddingScreen(false); setSelectedScreen(event.target.value); } }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {screens.map((screen) => <option key={screen.id} value={screen.id}>{screen.label}</option>)}
            <option value="__custom__">Custom screen…</option>
          </select>
        </div>
        {addingScreen ? (
          <form onSubmit={addScreen} className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
            <label className="text-xs font-semibold text-slate-600">Screen name<input value={newScreenName} onChange={(event) => setNewScreenName(event.target.value)} maxLength={60} placeholder="e.g. Youth Room" className="mt-1 block w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
            <button type="submit" disabled={!slugifyScreenId(newScreenName)} className="rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add screen</button>
            <button type="button" onClick={() => { setAddingScreen(false); setNewScreenName(''); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
            {slugifyScreenId(newScreenName) ? <p className="w-full text-xs text-slate-500">Its screen address will be /led-boards?screen={slugifyScreenId(newScreenName)}</p> : null}
          </form>
        ) : null}
        <p className="mt-3 text-xs text-slate-500">Address for this screen: <span className="font-semibold text-slate-700">/led-boards?screen={selectedScreen}</span></p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LED_BOARDS.map((board) => (
            <label key={board.key} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-sm text-slate-700">
              <input type="checkbox" checked={selectedPlaylist.includes(board.key)} disabled={!settings.enabled[board.key] || (board.key === 'welcome' && selectedScreen === 'lobby' && settings.enabled.welcome)} onChange={(event) => setScreenPlaylist(selectedScreen, event.target.checked ? [...selectedPlaylist, board.key] : selectedPlaylist.filter((key) => key !== board.key))} />
              {board.title}{!settings.enabled[board.key] ? <span className="text-xs text-slate-400">(globally off)</span> : board.key === 'welcome' && selectedScreen === 'lobby' ? <span className="text-xs text-slate-500">(lobby welcome)</span> : null}
            </label>
          ))}
        </div>
        <button type="button" onClick={() => {
          const current = queryClient.getQueryData(SETTINGS_QUERY_KEY) || settings;
          const screenPlaylists = { ...(current.screenPlaylists || {}) };
          delete screenPlaylists[selectedScreen];
          save({ screenPlaylists });
        }} className="mt-3 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Use global playlist</button>
        {isCustomScreen ? <button type="button" onClick={removeScreen} className="ml-2 mt-3 rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">Remove this screen</button> : null}
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={settings.festivalBannersEnabled !== false} onChange={(event) => save({ festivalBannersEnabled: event.target.checked })} />
        <span><span className="block font-semibold text-slate-800">Auto-show Gurpurab and Sangrand banners</span><span className="text-xs text-slate-500">Uses the configured Nanakshahi holidays feed. A feed outage does not affect other LED slides.</span></span>
      </label>
    </Card>
  );
};

export default LedBoardControlCard;
