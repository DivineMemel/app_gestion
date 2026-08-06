// Formatage — Abidjan, franc CFA, français.

export const TZ = 'Africa/Abidjan';

// `fr-FR` sépare les milliers par une espace insécable étroite (U+202F) ou
// insécable (U+00A0) selon le moteur. On normalise vers l'espace ordinaire :
// un montant copié vers WhatsApp ou un tableur doit rester propre.
const NBSP = /[  ]/g;

/**
 * Le XOF n'a pas de subdivision : on n'affiche jamais de décimales, et les
 * montants circulent en entiers dans toute l'app.
 */
export function xof(amount: number | null | undefined): string {
  return `${xofPlain(amount)} F`;
}

/** Sans le suffixe, pour les colonnes de tableau déjà titrées « F CFA ». */
export function xofPlain(amount: number | null | undefined): string {
  return Math.round(Number(amount ?? 0))
    .toLocaleString('fr-FR')
    .replace(NBSP, ' ');
}

/** Quantités : 3 et non 3,00 — mais 2,5 reste 2,5. */
export function qty(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return (
    Number.isInteger(v)
      ? String(v)
      : v.toLocaleString('fr-FR', { maximumFractionDigits: 3 })
  ).replace(NBSP, ' ');
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: TZ,
  });
}

export function dateLong(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });
}

export function timeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return `${dateShort(iso)} à ${timeShort(iso)}`;
}

export function monthLabel(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = new Date(iso).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Abidjan est à UTC+0 toute l'année : les accesseurs UTC donnent directement
// l'heure locale, et le résultat ne dépend pas du fuseau de la machine.
const DAY_MS = 86_400_000;

/** Bornes du jour à Abidjan, en ISO, pour filtrer en base. */
export function abidjanDayRange(ref = new Date()): { start: string; end: string } {
  const start = new Date(
    Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()),
  );
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + DAY_MS - 1).toISOString(),
  };
}

/** Bornes du mois courant à Abidjan. */
export function abidjanMonthRange(ref = new Date()): { start: string; end: string } {
  const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1));
  const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1) - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Date du jour à Abidjan au format `YYYY-MM-DD` (colonnes `date`). */
export function abidjanToday(ref = new Date()): string {
  return ref.toISOString().slice(0, 10);
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
