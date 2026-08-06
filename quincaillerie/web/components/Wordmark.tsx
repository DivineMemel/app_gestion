import Link from 'next/link';

/**
 * Marque NADAL SERVICES.
 *
 * Le sigle reprend les trois éléments du logo : l'engrenage orange, les
 * bâtiments bleus, la virgule qui les souligne. Dessiné en SVG plutôt
 * qu'importé en image — il reste net à toutes les tailles et suit le thème
 * clair/sombre. Un vrai fichier logo peut le remplacer via Paramètres.
 */
function Sigle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden role="presentation">
      {/* engrenage */}
      <g fill="rgb(var(--orange))">
        <path d="M24 3.5l3.2 2.1 3.7-1 1.9 3.3 3.8.6.3 3.8 3.3 2-1.3 3.6 2.4 3-2.4 3 1.3 3.6-3.3 2-.3 3.8-3.8.6-1.9 3.3-3.7-1L24 40.5l-3.2-2.1-3.7 1-1.9-3.3-3.8-.6-.3-3.8-3.3-2 1.3-3.6-2.4-3 2.4-3-1.3-3.6 3.3-2 .3-3.8 3.8-.6 1.9-3.3 3.7 1L24 3.5z" />
      </g>
      {/* évidement central */}
      <circle cx="24" cy="22" r="12.4" fill="rgb(var(--surface))" />
      {/* bâtiments */}
      <g fill="rgb(var(--accent))">
        <rect x="17" y="16" width="5.4" height="13" />
        <rect x="23.6" y="12" width="6" height="17" />
        <rect x="30.8" y="18" width="4.4" height="11" />
      </g>
      {/* virgule */}
      <path
        d="M12 31c6 5 18 6.5 27 1.5-7 7-21 7.5-27-1.5z"
        fill="rgb(var(--accent))"
      />
    </svg>
  );
}

export function Wordmark({
  size = 'md',
  href,
  name,
}: {
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  /** Nom personnalisé (Paramètres). Absent → le lettrage de la charte. */
  name?: string;
}) {
  const scale = {
    sm: { mark: 'h-7 w-7', text: 'text-[15px]' },
    md: { mark: 'h-9 w-9', text: 'text-xl' },
    lg: { mark: 'h-14 w-14', text: 'text-3xl' },
  }[size];

  // Le nom vient des réglages : s'il correspond encore à la marque, on rend le
  // lettrage bicolore de la charte plutôt qu'un texte plat.
  const estMarque = !name || name.trim().toUpperCase() === 'NADAL SERVICES';

  const lettrage = estMarque ? (
    <>
      <span style={{ color: 'rgb(var(--accent))' }}>NADAL</span>
      <span style={{ color: 'rgb(var(--orange))' }}> SERVICES</span>
    </>
  ) : (
    <span style={{ color: 'rgb(var(--accent))' }}>{name}</span>
  );

  const inner = (
    <span className="inline-flex items-center gap-2">
      <Sigle className={scale.mark} />
      <span
        className={`font-display font-semibold uppercase tracking-industrial ${scale.text}`}
      >
        {lettrage}
      </span>
    </span>
  );

  return href ? (
    <Link href={href} className="inline-flex">
      {inner}
    </Link>
  ) : (
    inner
  );
}
