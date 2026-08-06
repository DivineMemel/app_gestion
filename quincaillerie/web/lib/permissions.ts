// Définition centrale des rôles et permissions — partagée par l'UI (filtrage
// du menu, garde de route) ET le serveur (/api/admin/db, /api/admin/rpc,
// /api/admin/upload), qui constitue la vraie barrière de sécurité.
//
// Règle : masquer un bouton n'est pas une protection. Toute règle appliquée
// côté client doit exister ici et être revérifiée côté serveur.

export type Role = 'patron' | 'gerant' | 'vendeur' | 'magasinier';

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
  parametres: ['patron'],
};

export function canView(role: Role, m: ModuleKey): boolean {
  return MODULE_VIEW[m].includes(role);
}

export function canWriteModule(role: Role, m: ModuleKey): boolean {
  return MODULE_WRITE[m].includes(role);
}

/**
 * Prix d'achat, coût des marchandises et marge : réservés à ceux qui pilotent
 * la boutique. Le serveur retire ces colonnes des réponses pour les autres.
 */
export function canSeeCosts(role: Role): boolean {
  return role === 'patron' || role === 'gerant';
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
    parametres: 'parametres',
  };
  return seg ? (map[seg] ?? null) : 'dashboard';
}

// ---- Règles d'accès aux tables (barrière serveur de /api/admin/db) ---------
// read 'any' = tout membre actif ; sinon liste de rôles. write = liste.
type TableRule = { read: Role[] | 'any'; write: Role[] };

const ALL: Role[] = ['patron', 'gerant', 'vendeur', 'magasinier'];
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

  // Finances.
  expenses: { read: PILOTES, write: PILOTES },
  expense_categories: { read: PILOTES, write: PILOTES },

  // Administration.
  shop_settings: { read: 'any', write: ['patron'] },
  team_members: { read: ['patron'], write: ['patron'] },
  push_subscriptions: { read: ALL, write: ALL },

  // Vues (lecture seule).
  v_low_stock: { read: 'any', write: [] },
  v_customer_balances: { read: COMPTOIR, write: [] },
  v_monthly_pnl: { read: PILOTES, write: [] },
  v_top_products: { read: PILOTES, write: [] },
};

export function canReadTable(role: Role, table: string): boolean {
  const r = TABLE_RULES[table];
  if (!r) return false;
  return r.read === 'any' || r.read.includes(role);
}

export function canWriteTable(role: Role, table: string): boolean {
  const r = TABLE_RULES[table];
  if (!r) return false;
  return r.write.includes(role);
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

export function canCallRpc(role: Role, fn: string): boolean {
  return RPC_RULES[fn]?.includes(role) ?? false;
}

// ---- Upload : dossier du bucket → module → droit d'écriture ---------------
export const FOLDER_MODULE: Record<string, ModuleKey> = {
  logo: 'parametres',
  categories: 'produits',
  products: 'produits',
};
