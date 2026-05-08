import Link from 'next/link';

/**
 * Wordmark MUSE l'atelier — typo Bodoni serif large + sous-titre sans-serif espacé.
 * Inspiré directement du logo officiel.
 */
export function Wordmark({
  size = 'md',
  href = '/',
}: {
  size?: 'sm' | 'md' | 'lg';
  href?: string | null;
}) {
  const sizes = {
    sm: { muse: 'text-xl', tag: 'text-[8px] tracking-[0.32em]' },
    md: { muse: 'text-3xl md:text-4xl', tag: 'text-[10px] md:text-[11px] tracking-[0.32em]' },
    lg: { muse: 'text-6xl md:text-7xl', tag: 'text-[12px] md:text-[14px] tracking-[0.4em]' },
  } as const;

  const inner = (
    <span className="inline-flex flex-col items-center leading-none">
      <span
        className={`font-display font-medium tracking-[0.18em] ${sizes[size].muse}`}
        style={{ color: 'rgb(var(--ink))' }}
      >
        MUSE
      </span>
      <span
        className={`mt-1 font-sans uppercase ${sizes[size].tag}`}
        style={{ color: 'rgb(var(--ink-soft))' }}
      >
        L&rsquo;atelier
      </span>
    </span>
  );

  if (!href) return inner;
  return <Link href={href}>{inner}</Link>;
}
