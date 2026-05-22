import type { Client } from './types';

// Segmentation « cycle de vie » d'une cliente, calculée à partir de la
// récence (last_visit_at), de l'ancienneté de la 1ʳᵉ visite (first_visit_at)
// et de la fréquence (visits_count). Aucune donnée supplémentaire requise.

export type SegmentKey =
  | 'nouveau'
  | 'reguliere'
  | 'fidele'
  | 'endormie'
  | 'perdue'
  | 'prospect';

export type SegmentMeta = {
  key: SegmentKey;
  label: string;
  color: string; // couleur d'accent (texte + bordure du badge)
  hint: string; // règle de calcul, lisible
};

export const SEGMENTS: Record<SegmentKey, SegmentMeta> = {
  nouveau: {
    key: 'nouveau',
    label: 'Nouvelle',
    color: '#1f6c3a',
    hint: '1ʳᵉ visite il y a moins de 30 j',
  },
  fidele: {
    key: 'fidele',
    label: 'Fidèle',
    color: '#9a7b4f',
    hint: '5 visites ou plus, encore active',
  },
  reguliere: {
    key: 'reguliere',
    label: 'Régulière',
    color: '#5a5550',
    hint: 'Vue il y a moins de 60 j',
  },
  endormie: {
    key: 'endormie',
    label: 'Endormie',
    color: '#b06f1a',
    hint: 'Entre 60 et 180 j sans visite — à relancer',
  },
  perdue: {
    key: 'perdue',
    label: 'Perdue',
    color: '#a52a2a',
    hint: 'Plus de 180 j sans visite',
  },
  prospect: {
    key: 'prospect',
    label: 'Prospect',
    color: '#8a8580',
    hint: 'Inscrite, pas encore venue',
  },
};

// Ordre d'affichage des filtres / de la légende
export const SEGMENT_ORDER: SegmentKey[] = [
  'nouveau',
  'reguliere',
  'fidele',
  'endormie',
  'perdue',
  'prospect',
];

const DAY = 1000 * 60 * 60 * 24;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

// Renvoie un segment unique et déterministe par cliente (priorité descendante).
export function clientSegment(c: Client): SegmentKey {
  // Jamais venue : inscrite mais sans visite enregistrée
  if (!c.last_visit_at) return 'prospect';

  const since = daysSince(c.last_visit_at) ?? Infinity;
  const firstSince = daysSince(c.first_visit_at);

  // Nouvelle : première visite récente (prime sur tout le reste)
  if (firstSince !== null && firstSince <= 30) return 'nouveau';
  // Perdue : longue inactivité (au-delà de la fenêtre de relance du Parcours)
  if (since > 180) return 'perdue';
  // Endormie : inactivité moyenne, à relancer (aligné sur clients_at_risk)
  if (since > 60) return 'endormie';
  // Fidèle : récurrente et encore active
  if (c.visits_count >= 5) return 'fidele';
  // Régulière : active par défaut
  return 'reguliere';
}
