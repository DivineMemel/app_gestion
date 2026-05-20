// Définition centrale des rôles et permissions — partagée par l'UI (filtrage
// du menu, garde de route) ET le serveur (routes /api/admin/db et upload, qui
// constituent la vraie barrière de sécurité).

export type Role = 'owner' | 'manager' | 'employee';

export const ROLES: Role[] = ['owner', 'manager', 'employee'];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propriétaire',
  manager: 'Gérante',
  employee: 'Employée',
};

export type ModuleKey =
  | 'dashboard'
  | 'agenda'
  | 'ventes'
  | 'clients'
  | 'journey'
  | 'secteurs'
  | 'services'
  | 'stock'
  | 'equipe'
  | 'galerie'
  | 'depenses'
  | 'comptabilite'
  | 'parametres'
  | 'comptes';

// Pages visibles (et donc accessibles) par rôle.
const MODULE_VIEW: Record<ModuleKey, Role[]> = {
  dashboard: ['owner', 'manager', 'employee'],
  agenda: ['owner', 'manager', 'employee'],
  ventes: ['owner', 'manager', 'employee'],
  clients: ['owner', 'manager', 'employee'],
  journey: ['owner', 'manager', 'employee'],
  services: ['owner', 'manager', 'employee'],
  stock: ['owner', 'manager', 'employee'],
  secteurs: ['owner', 'manager'],
  equipe: ['owner', 'manager'],
  galerie: ['owner', 'manager'],
  depenses: ['owner', 'manager'],
  comptabilite: ['owner', 'manager'],
  parametres: ['owner'],
  comptes: ['owner'],
};

// Capacité d'écriture par module (pour griser l'UI ; le serveur reste maître).
const MODULE_WRITE: Record<ModuleKey, Role[]> = {
  dashboard: [],
  agenda: ['owner', 'manager', 'employee'],
  ventes: ['owner', 'manager', 'employee'],
  clients: ['owner', 'manager', 'employee'],
  journey: ['owner', 'manager'],
  services: ['owner', 'manager'],
  stock: ['owner', 'manager'],
  secteurs: ['owner', 'manager'],
  equipe: ['owner', 'manager'],
  galerie: ['owner', 'manager'],
  depenses: ['owner', 'manager'],
  comptabilite: ['owner', 'manager'],
  parametres: ['owner'],
  comptes: ['owner'],
};

export function canView(role: Role, m: ModuleKey): boolean {
  return MODULE_VIEW[m].includes(role);
}

export function canWriteModule(role: Role, m: ModuleKey): boolean {
  return MODULE_WRITE[m].includes(role);
}

export function moduleForPath(pathname: string): ModuleKey | null {
  if (pathname === '/admin') return 'dashboard';
  const seg = pathname.split('/')[2];
  const map: Record<string, ModuleKey> = {
    agenda: 'agenda',
    ventes: 'ventes',
    clients: 'clients',
    journey: 'journey',
    secteurs: 'secteurs',
    services: 'services',
    stock: 'stock',
    equipe: 'equipe',
    galerie: 'galerie',
    depenses: 'depenses',
    comptabilite: 'comptabilite',
    parametres: 'parametres',
    comptes: 'comptes',
  };
  return seg ? (map[seg] ?? null) : 'dashboard';
}

// ---- Règles d'accès aux tables (barrière serveur de /api/admin/db) ----------
// read 'any' = tout membre actif ; sinon liste de rôles. write = liste de rôles.
type TableRule = { read: Role[] | 'any'; write: Role[] };

const TABLE_RULES: Record<string, TableRule> = {
  sectors: { read: 'any', write: ['owner', 'manager'] },
  categories: { read: 'any', write: ['owner', 'manager'] },
  services: { read: 'any', write: ['owner', 'manager'] },
  products: { read: 'any', write: ['owner', 'manager'] },
  staff: { read: 'any', write: ['owner', 'manager'] },
  gallery_images: { read: 'any', write: ['owner', 'manager'] },
  salon_settings: { read: 'any', write: ['owner'] },
  clients: { read: 'any', write: ['owner', 'manager', 'employee'] },
  appointments: { read: 'any', write: ['owner', 'manager', 'employee'] },
  clients_at_risk: { read: 'any', write: [] },
  client_events: { read: 'any', write: ['owner', 'manager'] },
  sales: { read: ['owner', 'manager', 'employee'], write: ['owner', 'manager', 'employee'] },
  sale_items: { read: ['owner', 'manager', 'employee'], write: ['owner', 'manager', 'employee'] },
  expenses: { read: ['owner', 'manager'], write: ['owner', 'manager'] },
  expense_categories: { read: ['owner', 'manager'], write: ['owner', 'manager'] },
  monthly_pnl: { read: ['owner', 'manager'], write: [] },
  team_members: { read: ['owner'], write: ['owner'] },
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

// ---- Upload : dossier du bucket → module → droit d'écriture -----------------
export const FOLDER_MODULE: Record<string, ModuleKey> = {
  logo: 'parametres',
  sectors: 'secteurs',
  services: 'services',
  products: 'stock',
  staff: 'equipe',
  gallery: 'galerie',
};
