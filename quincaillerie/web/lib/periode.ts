// Périodes d'analyse — vocabulaire commun à tous les écrans datés.
//
// Chaque page calculait ses bornes dans son coin : « ce mois » n'y avait pas
// tout à fait le même sens, et une plage libre demandait de réécrire trois fois
// la même arithmétique de dates. Tout passe désormais par ici.
//
// Abidjan est à UTC+0 toute l'année : une date nue `YYYY-MM-DD` désigne donc la
// même journée pour l'utilisateur et pour Postgres, et les instants se
// fabriquent en collant simplement les heures extrêmes à ces dates.

// Import relatif, et non `@/lib/format` : ce module est couvert par
// `npm test`, et `node --test` ne résout pas l'alias du tsconfig. Le reste du
// code garde l'alias — seule cette arithmétique de dates a besoin de tourner
// hors de Next.
import { abidjanMonthRange, abidjanToday, dateShort, monthLabel } from './format.ts';

export type Periode = 'jour' | 'semaine' | 'mois' | 'mois_dernier' | 'tout' | 'dates';

export const PERIODE_LABELS: Record<Periode, string> = {
  jour: 'Aujourd’hui',
  semaine: '7 jours',
  mois: 'Ce mois',
  mois_dernier: 'Mois dernier',
  tout: 'Tout',
  dates: 'Dates',
};

/**
 * Bornes en dates nues. `null` = aucun filtre ; une borne `null` = ouverte de
 * ce côté (« depuis le 3 août », sans fin).
 */
export type Bornes = { debut: string | null; fin: string | null } | null;

const JOUR_MS = 86_400_000;

function ilYaDesJours(n: number): string {
  return new Date(Date.now() - n * JOUR_MS).toISOString().slice(0, 10);
}

/** Bornes d'une période, pour une colonne `date` (`spent_on`, `jour`…). */
export function bornesDates(periode: Periode, debut = '', fin = ''): Bornes {
  switch (periode) {
    case 'jour':
      return { debut: abidjanToday(), fin: abidjanToday() };
    // Sept jours glissants, aujourd'hui compris : c'est ainsi qu'on compte une
    // semaine de commerce, pas de lundi à dimanche.
    case 'semaine':
      return { debut: ilYaDesJours(6), fin: abidjanToday() };
    case 'mois': {
      const { start, end } = abidjanMonthRange();
      return { debut: start.slice(0, 10), fin: end.slice(0, 10) };
    }
    case 'mois_dernier': {
      const ref = new Date();
      ref.setUTCDate(1);
      ref.setUTCMonth(ref.getUTCMonth() - 1);
      const { start, end } = abidjanMonthRange(ref);
      return { debut: start.slice(0, 10), fin: end.slice(0, 10) };
    }
    case 'dates': {
      // Une plage vide ne filtre rien : tant que rien n'est saisi, l'écran
      // montre tout plutôt que de se vider sans explication.
      if (!debut && !fin) return null;
      // Saisie à l'envers : on remet les bornes dans l'ordre au lieu de
      // renvoyer un écran vide que personne ne saurait interpréter.
      if (debut && fin && debut > fin) return { debut: fin, fin: debut };
      return { debut: debut || null, fin: fin || null };
    }
    case 'tout':
    default:
      return null;
  }
}

/**
 * Mêmes bornes, en instants ISO, pour les colonnes `timestamptz` (`sold_at`,
 * `created_at`, `at`). La borne de fin couvre la journée entière : s'arrêter à
 * minuit pile perdrait tout ce qui s'est vendu dans la journée.
 */
export function bornesInstants(
  periode: Periode,
  debut = '',
  fin = '',
): { start: string | null; end: string | null } | null {
  const b = bornesDates(periode, debut, fin);
  if (!b) return null;
  return {
    start: b.debut ? `${b.debut}T00:00:00.000Z` : null,
    end: b.fin ? `${b.fin}T23:59:59.999Z` : null,
  };
}

/**
 * Ce que l'écran montre réellement, en dates : « Août 2026 », « du 12/08/26 au
 * 24/08/26 ». Le bouton actif dit le raccourci choisi, ce libellé dit la
 * période qu'il désigne — les deux ne se lisent pas au même endroit.
 */
export function libellePeriode(periode: Periode, debut = '', fin = ''): string {
  if (periode === 'tout') return 'toutes dates';
  if (periode === 'mois') return monthLabel(abidjanMonthRange().start);
  if (periode === 'mois_dernier') {
    const b = bornesDates('mois_dernier');
    return monthLabel(b!.debut!);
  }
  const b = bornesDates(periode, debut, fin);
  if (!b) return 'toutes dates';
  if (b.debut && b.fin) {
    return b.debut === b.fin
      ? `le ${dateShort(b.debut)}`
      : `du ${dateShort(b.debut)} au ${dateShort(b.fin)}`;
  }
  return b.debut ? `depuis le ${dateShort(b.debut)}` : `jusqu’au ${dateShort(b.fin!)}`;
}

/**
 * Applique les bornes à une requête sur une colonne `timestamptz`.
 *
 * Le petit détour par une fonction évite la borne sentinelle (« depuis 1970,
 * jusqu'en 2999 ») que chaque page réinventait : sur « Tout », aucune condition
 * n'est ajoutée du tout.
 */
export function filtrerInstants<T extends {
  gte(colonne: string, valeur: unknown): T;
  lte(colonne: string, valeur: unknown): T;
}>(requete: T, colonne: string, periode: Periode, debut = '', fin = ''): T {
  const b = bornesInstants(periode, debut, fin);
  let q = requete;
  if (b?.start) q = q.gte(colonne, b.start);
  if (b?.end) q = q.lte(colonne, b.end);
  return q;
}
