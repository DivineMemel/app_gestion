/**
 * Vocabulaire des unités.
 *
 * Saisir « pièce » à la main sur chaque fiche produit, c'est trente
 * occasions de faute de frappe — et « piece », « Pièce » et « pièce »
 * deviennent trois unités distinctes dans les rapports. Une liste fermée
 * (avec échappatoire) règle les deux problèmes à la fois.
 */

/** Unité dans laquelle le stock est compté. */
export const UNITES_STOCK = [
  'pièce',
  'unité',
  'ensemble',
  'sac',
  'barre',
  'plaque',
  'rouleau',
  'pot',
  'seau',
  'botte',
  'paquet',
  'carton',
  'mètre',
  'm²',
  'm³',
  'kg',
  'litre',
  // Pour les prestations : ce qu'on facture n'est pas toujours un objet.
  'forfait',
  'jour',
  'heure',
] as const;

/**
 * Conditionnements groupés. Le libellé final intègre le facteur —
 * « carton de 12 » — parce que c'est ainsi qu'on en parle au comptoir.
 */
export const CONDITIONNEMENTS = [
  'carton',
  'paquet',
  'palette',
  'botte',
  'boîte',
  'lot',
  'sachet',
  'rouleau',
] as const;

export const AUTRE = '__autre__';

/**
 * Libellés proposés pour une unité de vente, en fonction du facteur.
 *
 * Facteur 1 → on vend à l'unité de stock, rien à composer.
 * Facteur N → on vend groupé, et le libellé porte la quantité.
 */
export function libellesProposes(uniteStock: string, facteur: number): string[] {
  const base = (uniteStock || 'pièce').trim();

  if (!Number.isFinite(facteur) || facteur <= 1) {
    // À l'unité : la valeur juste est l'unité de stock elle-même. On propose
    // quand même quelques alternatives courantes pour les cas de vrac.
    return [...new Set([base, 'pièce', 'unité', 'mètre', 'm²', 'm³', 'kg', 'litre'])];
  }

  const n = Number.isInteger(facteur) ? String(facteur) : String(facteur);
  return CONDITIONNEMENTS.map((c) => `${c} de ${n}`);
}
