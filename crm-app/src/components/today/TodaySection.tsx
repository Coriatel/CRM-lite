interface TodaySectionProps {
  title: string;
  meta?: string;
  children: React.ReactNode;
}

export function TodaySection({ title, meta, children }: TodaySectionProps) {
  return (
    <section className="today-section" aria-label={title}>
      <header className="today-section__header">
        <h2 className="today-section__title">▾ {title}</h2>
        {meta ? <span className="today-section__meta">{meta}</span> : null}
      </header>
      {children}
    </section>
  );
}
