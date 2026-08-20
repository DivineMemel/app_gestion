// Définition centrale des rôles et permissions — partagée par l'UI (filtrage
// du menu, garde de route) ET le serveur (/api/admin/db, /api/admin/rpc,
// /api/admin/upload), qui constitue la vraie barrière de sécurité.
//
// Règle : masquer un bouton n'est pas une protection. Toute règle appliquée
// côté client doit exister ici et être revérifiée côté serveur.

export type Role = 'patron' | 'gerant' | 'vendeur' | 'magasinier';

/**
 * Une personne porte UN OU PLUSIEURS rôles, et ses droits en sont l'UNION.
 *
 * Dans une quincaillerie de quartier, celui qui tient la caisse le matin
 * réceptionne les camions l'après-midi. Avec un rôle unique il fallait choisir
 * entre le priver d'un écran dont il a besoin, ou lui donner « gérant » et donc
 * les marges. Un vendeur+magasinier fait les deux métiers sans jamais voir un
 * prix d'achat : aucun de ses deux rôles ne le permet, l'union non plus.
 *
 * Toutes les fonctions ci-dessous prennent donc un TABLEAU. Le pluriel est dans
 * le nom des paramètres pour que l'oubli se voie à la relecture.
 */
export type Roles = readonly Role[];

/** Étiquette d'affichage quand une personne porte plusieurs rôles. */
export function roleLabels(roles: Roles): string {
  return roles.map((r) => ROLE_LABELS[r]).join(' · ');
}

/**
 * Rôle « principal », pour les cas où il n'y a la place que d'un mot.
 * Même règle que la colonne dérivée `team_members.role` en base.
 */
export function rolePrincipal(roles: Roles): Role {
  if (roles.includes('patron')) return 'patron';
  if (roles.includes('gerant')) return 'gerant';
  if (roles.includes('vendeur')) return 'vendeur';
  return 'magasinier';
}

export const ROLES: Role[] = ['patron', 'gerant', 'vendeur', 'magasinier'];

export const ROLE_LABELS: Record<Role, string> = {
  patron: 'Patron',
  gerant: 'Gérant',
  vendeur: 'Vendeur',
  magasinier: 'Magasinier',
};

export const ROLE_HINTS: Record<Role, string> = {
  patron: 'Accès total, y compris comptes, marges et réglages.',
  gerant: 'Tout le quotidien, sauf la gestion des comptes et les réglages.',
  vendeur: 'Caisse, clients, devis et commandes. Ne voit ni prix d’achat ni marge.',
  magasinier: 'Stock, produits et réceptions fournisseurs. Pas d’accès à la caisse.',
};

export type ModuleKey =
  | 'dashboard'
  | 'caisse'
  | 'ventes'
  | 'commandes'
  | 'devis'
  | 'clients'
  | 'produits'
  | 'stock'
  | 'fournisseurs'
  | 'achats'
  | 'appro'
  | 'inventaire'
  | 'depenses'
  | 'comptabilite'
  | 'comptes'
  | 'journal'
  | 'parametres';

// Pages visibles (et donc accessibles) par rôle.
const MODULE_VIEW: Record<ModuleKey, Role[]> = {
  dashboard: ['patron', 'gerant', 'vendeur', 'magasinier'],
  caisse: ['patron', 'gerant', 'vendeur'],
  ventes: ['patron', 'gerant', 'vendeur'],
  commandes: ['patron', 'gerant', 'vendeur'],
  devis: ['patron', 'gerant', 'vendeur'],
  clients: ['patron', 'gerant', 'vendeur'],
  // Le vendeur doit pouvoir chercher un article et son prix au comptoir.
  produits: ['patron', 'gerant', 'vendeur', 'magasinier'],
  stock: ['patron', 'gerant', 'magasinier'],
  fournisseurs: ['patron', 'gerant', 'magasinier'],
  achats: ['patron', 'gerant', 'magasinier'],
  appro: ['patron', 'gerant', 'magasinier'],
  inventaire: ['patron', 'gerant', 'magasinier'],
  depenses: ['patron', 'gerant'],
  comptabilite: ['patron', 'gerant'],
  comptes: ['patron'],
  // Le journal d'audit répond à « qui a fait ça ? ». C'est une question de
  // patron, et la réponse cite nommément des employés.
  journal: ['patron'],
  parametres: ['patron'],
};

// Capacité d'écriture par module (pour griser l'UI ; le serveur reste maître).
const MODULE_WRITE: Record<ModuleKey, Role[]> = {
  dashboard: [],
  caisse: ['patron', 'gerant', 'vendeur'],
  // Encaisser oui, annuler non : une annulation contre-passe le stock.
  ventes: ['patron', 'gerant'],
  commandes: ['patron', 'gerant', 'vendeur'],
  devis: ['patron', 'gerant', 'vendeur'],
  clients: ['patron', 'gerant', 'vendeur'],
  produits: ['patron', 'gerant', 'magasinier'],
  stock: ['patron', 'gerant', 'magasinier'],
  fournisseurs: ['patron', 'gerant', 'magasinier'],
  achats: ['patron', 'gerant', 'magasinier'],
  appro: ['patron', 'gerant', 'magasinier'],
  inventaire: ['patron', 'gerant', 'magasinier'],
  depenses: ['patron', 'gerant'],
  comptabilite: [],
  comptes: ['patron'],
  // Un audit qu'on peut corriger n'est pas un audit.
  journal: [],
  parametres: ['patron'],
};

export function canView(roles: Roles, m: ModuleKey): boolean {
  return roles.some((r) => MODULE_VIEW[m].includes(r));
}

export function canWriteModule(roles: Roles, m: ModuleKey): boolean {
  return roles.some((r) => MODULE_WRITE[m].includes(r));
}

/**
 * Prix d'achat, coût des marchandises et marge : réservés à ceux qui pilotent
 * la boutique. Le serveur retire ces colonnes des réponses pour les autres.
 */
export function canSeeCosts(roles: Roles): boolean {
  return roles.some((r) => r === 'patron' || r === 'gerant');
}

export function moduleForPath(pathname: string): ModuleKey | null {
  if (pathname === '/admin') return 'dashboard';
  const seg = pathname.split('/')[2];
  const map: Record<string, ModuleKey> = {
    caisse: 'caisse',
    ventes: 'ventes',
    commandes: 'commandes',
    devis: 'devis',
    clients: 'clients',
    produits: 'produits',
    stock: 'stock',
    fournisseurs: 'fournisseurs',
    achats: 'achats',
    appro: 'appro',
    inventaire: 'inventaire',
    depenses: 'depenses',
    comptabilite: 'comptabilite',
    comptes: 'comptes',
    journal: 'journal',
    parametres: 'parametres',
  };
  return seg ? (map[seg] ?? null) : 'dashboard';
}

// ---- Règles d'accès aux tables (barrière serveur de /api/admin/db) ---------
// read 'any' = tout membre actif ; sinon liste de rôles. write = liste.
type TableRule = { read: Role[] | 'any'; write: Role[] };

const PILOTES: Role[] = ['patron', 'gerant'];
const COMPTOIR: Role[] = ['patron', 'gerant', 'vendeur'];
const DEPOT: Role[] = ['patron', 'gerant', 'magasinier'];

const TABLE_RULES: Record<string, TableRule> = {
  // Catalogue — consultable par tous, modifiable par le dépôt.
  categories: { read: 'any', write: DEPOT },
  products: { read: 'any', write: DEPOT },
  product_units: { read: 'any', write: DEPOT },

  // Comptoir.
  customers: { read: 'any', write: COMPTOIR },
  sales: { read: COMPTOIR, write: PILOTES },
  sale_items: { read: COMPTOIR, write: PILOTES },
  payments: { read: COMPTOIR, write: COMPTOIR },
  quotes: { read: COMPTOIR, write: COMPTOIR },
  quote_items: { read: COMPTOIR, write: COMPTOIR },
  orders: { read: COMPTOIR, write: COMPTOIR },
  order_items: { read: COMPTOIR, write: COMPTOIR },

  // Dépôt.
  suppliers: { read: DEPOT, write: DEPOT },
  purchase_orders: { read: DEPOT, write: DEPOT },
  purchase_order_items: { read: DEPOT, write: DEPOT },
  stock_movements: { read: 'any', write: DEPOT },
  supply_entries: { read: DEPOT, write: DEPOT },
  supply_entry_items: { read: DEPOT, write: DEPOT },
  stock_counts: { read: DEPOT, write: DEPOT },
  stock_count_items: { read: DEPOT, write: DEPOT },
  v_appro_a_valoriser: { read: PILOTES, write: [] },
  // Ce que les coupures réseau ont coûté en exactitude : à régulariser par le
  // dépôt, c'est son métier.
  v_stock_negatif: { read: DEPOT, write: [] },

  // Finances.
  expenses: { read: PILOTES, write: PILOTES },
  expense_categories: { read: PILOTES, write: PILOTES },

  // Administration.
  shop_settings: { read: 'any', write: ['patron'] },
  team_members: { read: ['patron'], write: ['patron'] },
  // Le journal se lit, ne se corrige pas : un audit modifiable n'est pas un
  // audit. Les abonnements push ne sont volontairement PAS exposés ici — ils
  // ne servent qu'aux routes serveur, et leur clé étrangère vers team_members
  // en faisait un chemin de traverse vers la table des comptes.
  audit_log: { read: ['patron'], write: [] },

  // Vues (lecture seule).
  v_low_stock: { read: 'any', write: [] },
  v_customer_balances: { read: COMPTOIR, write: [] },
  v_monthly_pnl: { read: PILOTES, write: [] },
  v_top_products: { read: PILOTES, write: [] },
  // Lisible par tout le comptoir : les colonnes de marge en sont retirées pour
  // qui n'a pas droit aux coûts (COST_COLUMNS dans lib/db-schema.ts).
  v_ventes_produits: { read: COMPTOIR, write: [] },
};

export function canReadTable(roles: Roles, table: string): boolean {
  const regle = TABLE_RULES[table];
  if (!regle) return false;
  // « any » veut dire « n'importe lequel des quatre rôles », pas « même
  // quelqu'un qui n'en a aucun ». Sans ce garde-fou, un compte sans rôle —
  // interdit en base, mais possible sur une ligne antérieure à la migration
  // 009 — lirait le catalogue, les clients et les mouvements de stock.
  if (roles.length === 0) return false;
  if (regle.read === 'any') return true;
  const permis = regle.read;
  return roles.some((r) => permis.includes(r));
}

export function canWriteTable(roles: Roles, table: string): boolean {
  const regle = TABLE_RULES[table];
  if (!regle) return false;
  return roles.some((r) => regle.write.includes(r));
}

// ---- Fonctions RPC autorisées (barrière de /api/admin/rpc) ----------------
export const RPC_RULES: Record<string, Role[]> = {
  create_sale: COMPTOIR,
  cancel_sale: PILOTES,
  receive_purchase_order: DEPOT,
  // Convertir, c'est encaisser : même droit que la caisse.
  convert_order_to_sale: COMPTOIR,
  convert_quote_to_sale: COMPTOIR,

  // Faire entrer la marchandise : le dépôt.
  post_supply_entry: DEPOT,
  cancel_supply_entry: DEPOT,
  // La valoriser : ceux qui ont le droit de voir les prix d'achat.
  value_supply_entry: PILOTES,

  open_stock_count: DEPOT,
  validate_stock_count: DEPOT,
};

export function canCallRpc(roles: Roles, fn: string): boolean {
  const permis = RPC_RULES[fn];
  if (!permis) return false;
  return roles.some((r) => permis.includes(r));
}

// ---- Upload : dossier du bucket → module → droit d'écriture ---------------
export const FOLDER_MODULE: Record<string, ModuleKey> = {
  logo: 'parametres',
  categories: 'produits',
  products: 'produits',
};
