// Arithmétique de dates pour Abidjan (UTC+0, jamais de DST).
//
// Tout est calculé en UTC via les accesseurs `getUTC*` : le worker donne donc
// le même résultat quel que soit le fuseau de la machine hôte. Avant, le
// scheduler lisait l'heure locale du serveur — ça ne marchait que parce que
// Render tourne en UTC, par coïncidence, pas par construction.

export const TZ = 'Africa/Abidjan';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** Au-delà, une date extraite d'un message est considérée aberrante. */
const MAX_AHEAD_DAYS = 120;
/**
 * Tolérance passé : couvre le délai entre l'envoi du message et son traitement
 * (« aujourd'hui 14h » classé à 14h05 reste valide), rien de plus. Au-delà,
 * « mardi 8h » reçu un mardi à 10h désigne mardi prochain, pas ce matin.
 */
const PAST_TOLERANCE_MS = 15 * 60_000;

export type DayPart = 'matin' | 'apres_midi' | 'soir';

/**
 * Ce que le modèle a le droit de renvoyer : une *description* de ce que dit le
 * message, jamais une date calculée. Le calcul se fait ici, en TypeScript.
 */
export type WhenSpec = {
  kind?: 'relative' | 'absolute' | null;
  day_offset?: number | null; // 0 = aujourd'hui, 1 = demain…
  weekday?: string | null; // 'lundi'…'dimanche'
  date?: string | null; // 'YYYY-MM-DD' si le message donne une date explicite
  hour?: number | null;
  minute?: number | null;
  daypart?: DayPart | null;
};

const DAYPART_HOUR: Record<DayPart, number> = {
  matin: 9,
  apres_midi: 14,
  soir: 18,
};

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

/** Heure d'Abidjan (0-23) — identique à l'heure UTC. */
export function abidjanHour(d: Date): number {
  return d.getUTCHours();
}

export function startOfAbidjanDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function endOfAbidjanDay(d: Date): Date {
  return new Date(startOfAbidjanDay(d).getTime() + DAY_MS - 1);
}

export function fmtAbidjanTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

export function abidjanNowLabel(now: Date): string {
  return now.toLocaleString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

function toInt(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : null;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/**
 * Transforme la description du modèle en instant précis, ou `null` si le
 * message est trop ambigu pour en tirer un RDV.
 *
 * Mieux vaut aucun RDV qu'un RDV faux : un agenda qui invente des rendez-vous
 * n'est plus consulté.
 */
export function resolveWhen(when: WhenSpec | null | undefined, now: Date): string | null {
  if (!when || (when.kind !== 'relative' && when.kind !== 'absolute')) return null;

  // --- heure -------------------------------------------------------------
  let hour = toInt(when.hour);
  let minute = toInt(when.minute) ?? 0;
  if (hour === null) {
    const dp = when.daypart;
    if (dp && dp in DAYPART_HOUR) {
      hour = DAYPART_HOUR[dp];
      minute = 0;
    }
  }
  // Ni heure ni moment de la journée → trop vague pour créer un RDV.
  if (hour === null || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  // --- jour --------------------------------------------------------------
  const today = startOfAbidjanDay(now);
  let base: Date | null = null;
  let weekdayFallback = false;

  if (when.kind === 'absolute') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(when.date ?? '');
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    base = new Date(Date.UTC(y, mo - 1, d));
    // Rejette les dates impossibles (31 février…) que Date.UTC reporte.
    if (base.getUTCMonth() !== mo - 1 || base.getUTCDate() !== d) return null;
  } else if (when.weekday) {
    const target = WEEKDAYS[when.weekday.trim().toLowerCase()];
    if (target === undefined) return null;
    base = addDays(today, (target - today.getUTCDay() + 7) % 7);
    weekdayFallback = true; // « lundi » un lundi : peut vouloir dire aujourd'hui
  } else {
    const off = toInt(when.day_offset);
    if (off === null || off < 0 || off > MAX_AHEAD_DAYS) return null;
    base = addDays(today, off);
  }

  let at = new Date(base.getTime() + hour * HOUR_MS + minute * 60_000);

  // « mardi à 14h » dit un mardi à 16h → c'est mardi prochain.
  if (weekdayFallback && at.getTime() < now.getTime() - PAST_TOLERANCE_MS) {
    at = addDays(at, 7);
  }

  const diff = at.getTime() - now.getTime();
  if (diff < -PAST_TOLERANCE_MS) return null;
  if (diff > MAX_AHEAD_DAYS * DAY_MS) return null;

  return at.toISOString();
}
