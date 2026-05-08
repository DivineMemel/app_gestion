export function PageHeader({
  eyebrow,
  title,
  italic,
  description,
  right,
}: {
  eyebrow: string;
  title: string;
  italic?: string;
  description?: string;
  right?: React.ReactNode;
}) {
  return (
    <header
      className="flex flex-wrap items-end justify-between gap-6 border-b pb-8"
      style={{ borderColor: 'rgb(var(--line))' }}
    >
      <div className="max-w-2xl">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="font-display mt-3 text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          {title}
          {italic && (
            <>
              {' '}
              <span className="italic font-normal">{italic}</span>
            </>
          )}
        </h1>
        {description && (
          <p
            className="mt-3 max-w-md text-[14px] leading-relaxed"
            style={{ color: 'rgb(var(--ink-soft))' }}
          >
            {description}
          </p>
        )}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </header>
  );
}
