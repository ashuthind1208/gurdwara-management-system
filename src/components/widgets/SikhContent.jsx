import { useQuery } from '@tanstack/react-query';
import sikhWidgetService, { SIKH_WIDGET_SOURCES, sikhWidgetDateKey } from '../../services/sikhWidgetService';

const SourceLink = ({ url, children }) => {
  if (url === '/hukamnama') return <a href={url} className="font-semibold underline">{children}</a>;
  // Links come from the service's fixed sources, never widget configuration or API content.
  const allowed = ['https://api.banidb.com', 'https://sikhri.org', 'https://www.sikhcoalition.org', 'https://www.sikhitothemax.org', 'https://sgpc.net'];
  try {
    const parsed = new URL(url);
    if (!allowed.includes(parsed.origin) || parsed.username || parsed.password) return null;
  } catch { return null; }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand-blue underline underline-offset-4">{children}</a>;
};

export default function SikhContent({ widget, config = {} }) {
  const source = widget?.source;
  const supported = Boolean(source && SIKH_WIDGET_SOURCES[widget?.id] === source);
  const query = useQuery({
    queryKey: ['sikh-widget', widget?.id, source, config, sikhWidgetDateKey()],
    queryFn: () => sikhWidgetService.getContent(source, config),
    enabled: supported,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: source === 'hukamnama' ? 60000 : false
  });
  if (!supported) return <p role="alert">Unsupported Sikh widget source.</p>;
  if (query.isError) return <div role="alert" className="space-y-2">
    <p>Unable to load this source. Previously loaded content is not being shown.</p>
    <button type="button" className="font-semibold underline" onClick={() => query.refetch()}>Try again</button>
  </div>;
  if (query.isPending || query.isFetching) return <p role="status">Loading Sikh content…</p>;
  const data = query.data;
  if (!data) return <p>No content is available for this selection.</p>;
  const hasContent = Boolean(data.lines?.length || data.resources?.length || data.quizQuestion || data.session);
  const checkedDate = data.checkedAt?.slice(0, 10);
  return <section aria-label={data.title} className="min-w-0 space-y-3 break-words">
    <h4 className="font-bold text-slate-900">{data.title}</h4>
    <p className="text-sm text-slate-600">{data.provenance}</p>
    {data.sourceDate ? <p className="text-sm">Source date: <time dateTime={data.sourceDate}>{data.sourceDate}</time></p> : null}
    {source === 'hukamnama' && data.sourceDate !== sikhWidgetDateKey() ? <p role="note" className="text-sm font-semibold text-amber-800">This is not today’s hukamnama. The source returned the date shown above.</p> : null}
    {checkedDate ? <p className="text-xs text-slate-500">{source === 'sikh-resources' ? 'Curated list displayed' : 'Retrieved'}: <time dateTime={data.checkedAt}>{checkedDate}</time>{source === 'scripture' || source === 'nitnem' ? ' · Scripture excerpt, not a daily feed; text may be cached by the recitation service.' : ''}</p> : null}
    {!hasContent ? <p>No content is available for this selection.</p> : null}
    {data.quizQuestion ? <div className="space-y-3 rounded-lg border border-slate-200/70 p-3">
      <p className="font-semibold">{data.quizQuestion.prompt || 'Question unavailable in the selected language.'}</p>
      {data.quizQuestion.promptPunjabi ? <p lang="pa-Guru" className="text-lg">{data.quizQuestion.promptPunjabi}</p> : null}
      {data.quizQuestion.options?.length ? <ol className="list-inside list-decimal space-y-1">{data.quizQuestion.options.map((option, index) => <li key={`${index}-${option}`}>{option}</li>)}</ol> : null}
      <p className="text-xs">Answer hidden · use the learning page to take the quiz.</p>
    </div> : null}
    {data.session ? <div className="space-y-1 rounded-lg border border-emerald-200/70 p-3">
      <p className="font-semibold">{data.session.title || 'Gurbani recitation in progress'}</p>
      {data.session.reciter ? <p>Reciter: {data.session.reciter}</p> : null}
      {data.session.totalLines > 0 ? <p>Line {Math.min(data.session.currentIndex + 1, data.session.totalLines)} of {data.session.totalLines}</p> : null}
      {data.session.startedAt ? <time className="text-xs" dateTime={data.session.startedAt}>Started {data.session.startedAt.slice(0, 10)}</time> : null}
      <p className="text-xs">Live recitation</p>
    </div> : null}
    {data.lines?.length ? <>
      <p className="text-xs text-slate-500">Short excerpt · follow the source link for the full text.</p>
      <ol className="space-y-4">{data.lines.map((line, index) => <li key={index} className="space-y-1">
        <p lang="pa-Guru" className="text-lg leading-relaxed">{line.gurmukhi}</p>
        {line.english ? <p lang="en">{line.english}</p> : <p className="text-sm text-slate-500">English translation unavailable for this line.</p>}
        {line.transliteration ? <p className="text-sm italic text-slate-600">{line.transliteration}</p> : null}
        {line.ang ? <p className="text-xs text-slate-500">Ang {line.ang}</p> : null}
      </li>)}</ol>
    </> : null}
    {data.resources?.length ? <ul className="space-y-3">{data.resources.map((resource) => <li key={resource.url} className="rounded-xl border border-slate-200 p-3">
      <SourceLink url={resource.url}>{resource.title}</SourceLink>
      <p className="mt-1 text-sm">{resource.description}</p>
    </li>)}</ul> : null}
    {data.credits?.length ? <footer className="space-y-1 text-sm">{data.credits.map((credit) => <div key={credit.url}>Source credit: <SourceLink url={credit.url}>{credit.label}</SourceLink></div>)}</footer> : null}
  </section>;
}