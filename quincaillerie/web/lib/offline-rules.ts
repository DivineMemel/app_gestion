/**
 * Règles de décision du rejeu hors ligne.
 *
 * Isolées ici, sans aucune dépendance : ni DOM, ni IndexedDB, ni client
 * Supabase. C'est ce qui permet de les tester pour de vrai plutôt que d'en
 * réécrire une copie dans le fichier de tests — un doublon qui aurait dérivé
 * à la première correction.
 */

/** Au-delà, on cesse de croire que la panne est passagère. */
export const ESSAIS_MAX = 5;

/**
 * Ce message vient-il d'un refus du serveur, ou d'une panne de réseau ?
 *
 * La distinction commande tout le comportement : une panne se réessaie
 * indéfiniment, un refus doit s'arrêter et se voir. Se tromper dans un sens
 * perd une recette ; dans l'autre, on rejoue en boucle une vente fautive et le
 * problème reste invisible.
 */
export function estUnRefus(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes('connexion perdue')) return false;
  if (m.includes('failed to fetch')) return false;
  if (m.includes('networkerror')) return false;
  if (m.includes('load failed')) return false; // Safari, sur coupure
  // Se règle en se reconnectant : bloquer obligerait à ressaisir une vente
  // pourtant déjà encaissée au comptoir.
  if (m.includes('session expirée')) return false;
  return true;
}

export type Suite = 'bloquer' | 'reessayer';

/**
 * Que faire d'une vente dont l'envoi vient d'échouer ?
 *
 * `essais` est le compteur APRÈS incrément.
 */
export function suiteADonner(message: string, essais: number): Suite {
  if (estUnRefus(message)) return 'bloquer';
  if (essais >= ESSAIS_MAX) return 'bloquer';
  return 'reessayer';
}

/** Ordre de rejeu : celui du tiroir-caisse, pas celui de l'enregistrement. */
export function ordreDeRejeu<T extends { sold_at: string }>(file: T[]): T[] {
  return [...file].sort((a, b) => a.sold_at.localeCompare(b.sold_at));
}
