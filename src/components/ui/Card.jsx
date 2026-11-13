const Card = ({ children, className = '' }) => {
  return (
    <article data-ui-card className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800 ${className}`}>
      {children}
    </article>
  );
};

export default Card;
