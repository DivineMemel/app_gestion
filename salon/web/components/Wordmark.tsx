import Link from 'next/link';

/**
 * Wordmark MUSE l'atelier — typo Bodoni serif large + sous-titre sans-serif espacé.
 * Si `logoUrl` est fourni (logo uploadé en admin), on affiche l'image à la place.
 */
export function Wordmark({
  size = 'md',
  href = '/',
  logoUrl = null,
}: {
  size?: 'sm' | 'md' | 'lg';
  href?: string | null;
  logoUrl?: string | null;
}) {
  const sizes = {
    sm: { muse: 'text-xl', tag: 'text-[8px] tracking-[0.32em]', logo: 'h-7' },
    md: { muse: 'text-3xl md:text-4xl', tag: 'text-[10px] md:text-[11px] tracking-[0.32em]', logo: 'h-9 md:h-10' },
    lg: { muse: 'text-6xl md:text-7xl', tag: 'text-[12px] md:text-[14px] tracking-[0.4em]', logo: 'h-16 md:h-20' },
  } as const;

  const inner = logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={logoUrl} alt="Logo" className={`${sizes[size].logo} w-auto object-contain`} />
  ) : (
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
