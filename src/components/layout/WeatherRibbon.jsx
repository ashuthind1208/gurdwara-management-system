import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BoltIcon, CloudIcon, CloudArrowDownIcon, MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import weatherService from '../../services/weatherService';

const WeatherGlyph = ({ kind, className = 'h-5 w-5' }) => {
  if (kind === 'sun') return <SunIcon className={className} aria-hidden="true" />;
  if (kind === 'rain' || kind === 'snow') return <CloudArrowDownIcon className={className} aria-hidden="true" />;
  if (kind === 'storm') return <BoltIcon className={className} aria-hidden="true" />;
  return <CloudIcon className={className} aria-hidden="true" />;
};

const formatDay = (date, index) => {
  if (index === 0) return 'Today';
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(parsed);
};

const formatTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(parsed);
};

const WeatherRibbon = ({ address }) => {
  const [isOpen, setIsOpen] = useState(false);
  const query = String(address || '').trim();
  const { data, isPending, isError } = useQuery({
    queryKey: ['gurdwara-weather', query],
    queryFn: ({ signal }) => weatherService.getForAddress(query, { signal }),
    enabled: query.length >= 3,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false
  });

  if (query.length < 3) return null;

  const description = isPending ? 'Loading local weather' : isError ? 'Weather unavailable' : `${data.description}, ${data.temperature} degrees Celsius`;

  return (
    <div
      className="group relative hidden md:block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={`Gurdwara weather: ${description}. View forecast.`}
        aria-expanded={isOpen}
        title="Gurdwara weather"
        className="inline-flex h-7 min-w-[2.75rem] items-center justify-center gap-1 rounded-full px-1.5 text-sm font-bold tabular-nums text-blue-50 transition hover:bg-blue-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <WeatherGlyph kind={data?.icon || 'cloud'} className="h-4 w-4" />
        <span>{isPending ? '—°' : isError ? '—°' : `${data.temperature}°`}</span>
      </button>
      <section
        role="tooltip"
        aria-label="Gurdwara local weather forecast"
        className={`absolute right-0 top-full z-[280] mt-1 w-[min(310px,calc(100vw-1.5rem))] rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-sky-50 p-4 text-left text-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.24)] transition duration-150 ${isOpen ? 'visible translate-y-0 opacity-100' : 'invisible pointer-events-none translate-y-1 opacity-0'}`}
      >
        <span className="absolute -top-2 right-5 h-4 w-4 rotate-45 border-l border-t border-amber-200 bg-amber-50" />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Weather at the Gurdwara</p>
          {isPending ? <p className="mt-3 text-sm text-slate-600">Loading local forecast…</p> : isError ? (
            <p className="mt-3 text-sm text-slate-600">Local weather is temporarily unavailable.</p>
          ) : (
            <>
              <div className="mt-2 flex items-center gap-3 rounded-xl bg-white/80 p-2.5 shadow-sm ring-1 ring-amber-100">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><WeatherGlyph kind={data.icon} className="h-6 w-6" /></span>
                <div>
                  <p className="text-lg font-bold">{data.temperature}°C <span className="text-sm font-medium text-slate-600">{data.description}</span></p>
                  <p className="text-xs text-slate-500">{data.location || address}</p>
                </div>
              </div>
              <ul className="mt-2 divide-y divide-slate-100/80">
                {data.days.map((day, index) => (
                  <li key={day.date} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <span className="w-10 font-semibold text-slate-700">{formatDay(day.date, index)}</span>
                    <span className="flex min-w-0 flex-1 items-center gap-1.5 text-slate-600"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-800"><WeatherGlyph kind={day.icon} className="h-4 w-4" /></span><span className="truncate">{day.description}</span></span>
                    <span className="whitespace-nowrap font-semibold text-slate-700">{day.high ?? '—'}° <span className="font-normal text-slate-500">{day.low ?? '—'}°</span></span>
                  </li>
                ))}
              </ul>
              {data.days[0] ? (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5 rounded-lg bg-amber-100/70 px-2 py-2"><SunIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700" /><span>Sunrise <strong className="text-slate-800">{formatTime(data.days[0].sunrise)}</strong></span></div>
                  <div className="flex items-center gap-1.5 rounded-lg bg-indigo-100/70 px-2 py-2"><MoonIcon aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-700" /><span>Sunset <strong className="text-slate-800">{formatTime(data.days[0].sunset)}</strong></span></div>
                </div>
              ) : null}
              <p className="mt-2 text-[10px] text-slate-400">Forecast by Open-Meteo</p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default WeatherRibbon;
