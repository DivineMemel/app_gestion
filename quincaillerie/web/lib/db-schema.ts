/**
 * Description du schéma exposé par /api/admin/db — colonnes lisibles,
 * jointures autorisées, colonnes protégées.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * La passerelle transmettait la chaîne `select` telle quelle à PostgREST. Or
 * PostgREST y résout les jointures par clé étrangère. Un vendeur pouvait donc
 * demander `push_subscriptions?select=*,team_members(*)` et récupérer les
 * empreintes de mot de passe de toute l'équipe — ou contourner le masquage des
 * coûts avec `sale_items?select=*,products(cost_price_xof)`, puisque le
 * nettoyage ne portait que sur le premier niveau.
 *
 * La règle est donc inversée : rien ne passe qui ne soit explicitement décrit
 * ici. Une colonne ajoutée en base et oubliée dans ce fichier sera invisible —
 * c'est voulu, l'oubli doit se voir à l'écran plutôt que fuiter en silence.
 */

import type { Role, Roles } from '@/lib/permissions';

// ---- Colonnes lisibles, table par table -----------------------------------

export const TABLE_COLUMNS: Record<string, readonly string[]> = {
  categories: ['id', 'name', 'slug', 'description', 'image_url', 'position', 'active', 'created_at'],
  products: [
    'id', 'sku', 'barcode', 'name', 'description', 'category_id', 'image_url',
    'base_unit', 'stock_qty', 'min_stock', 'cost_price_xof', 'active', 'published',
    'low_stock_alerted_at', 'is_service', 'slug', 'created_at', 'updated_at',
  ],
  product_units: ['id', 'product_id', 'label', 'factor', 'price_xof', 'is_default', 'position'],
  customers: [
    'id', 'name', 'phone', 'email', 'address', 'kind', 'credit_limit_xof',
    'notes', 'created_at', 'updated_at',
  ],
  suppliers: ['id', 'name', 'phone', 'email', 'address', 'notes', 'active', 'created_at'],
  purchase_orders: [
    'id', 'number', 'supplier_id', 'status', 'total_xof', 'note',
    'ordered_at', 'received_at', 'created_by', 'created_at',
  ],
  purchase_order_items: [
    'id', 'purchase_order_id', 'product_id', 'qty_base', 'qty_received_base', 'unit_cost_xof',
  ],
  sales: [
    'id', 'number', 'customer_id', 'subtotal_xof', 'discount_xof', 'total_xof',
    'paid_xof', 'payment_method', 'status', 'channel', 'note', 'sold_by',
    'sold_at', 'created_at', 'client_ref', 'captured_offline', 'synced_at',
  ],
  sale_items: [
    'id', 'sale_id', 'product_id', 'product_name', 'unit_label', 'unit_factor',
    'qty', 'unit_price_xof', 'line_total_xof', 'cost_price_xof',
  ],
  payments: ['id', 'customer_id', 'sale_id', 'amount_xof', 'method', 'note', 'received_by', 'paid_at'],
  quotes: [
    'id', 'number', 'customer_id', 'customer_name', 'customer_phone', 'subtotal_xof',
    'discount_xof', 'total_xof', 'status', 'valid_until', 'note',
    'converted_sale_id', 'created_by', 'created_at',
  ],
  quote_items: [
    'id', 'quote_id', 'product_id', 'product_name', 'unit_label', 'unit_factor',
    'qty', 'unit_price_xof', 'line_total_xof',
  ],
  orders: [
    'id', 'number', 'customer_id', 'customer_name', 'customer_phone', 'customer_email',
    'total_xof', 'status', 'note', 'converted_sale_id', 'created_at', 'updated_at',
  ],
  order_items: [
    'id', 'order_id', 'product_id', 'product_name', 'unit_label', 'unit_factor',
    'qty', 'unit_price_xof', 'line_total_xof',
  ],
  stock_movements: [
    'id', 'product_id', 'qty_base', 'kind', 'ref_table', 'ref_id', 'note',
    'created_by', 'created_at',
  ],
  supply_entries: [
    'id', 'number', 'supplier_id', 'purchase_order_id', 'status', 'note',
    'received_at', 'valued_at', 'created_by', 'valued_by', 'created_at',
  ],
  supply_entry_items: ['id', 'supply_entry_id', 'product_id', 'qty_base', 'unit_cost_xof', 'note'],
  stock_counts: [
    'id', 'number', 'status', 'category_id', 'note', 'started_by',
    'validated_by', 'validated_at', 'created_at',
  ],
  stock_count_items: ['id', 'stock_count_id', 'product_id', 'qty_theorique', 'qty_comptee', 'note'],
  expense_categories: ['id', 'name', 'active'],
  expenses: [
    'id', 'category_id', 'label', 'amount_xof', 'method', 'spent_on', 'note',
    'created_by', 'created_at',
  ],
  shop_settings: [
    'id', 'name', 'tagline', 'phone', 'whatsapp', 'email', 'address', 'logo_url',
    'invoice_footer', 'allow_negative_stock', 'enforce_credit_limit',
    'default_min_stock', 'online_orders_open', 'updated_at',
  ],
  // `password_hash` est absent : une empreinte n'a aucune raison de quitter le
  // serveur, même pour le patron.
  team_members: ['id', 'name', 'email', 'role', 'roles', 'status', 'phone', 'created_at'],
  audit_log: [
    'id', 'member_id', 'member_name', 'member_role', 'action', 'table_name',
    'filters', 'changes', 'row_ids', 'ok', 'error', 'at',
  ],

  // ---- Vues (lecture seule) ----
  v_low_stock: [
    'id', 'sku', 'name', 'base_unit', 'stock_qty', 'min_stock',
    'low_stock_alerted_at', 'category_name',
  ],
  v_customer_balances: [
    'id', 'name', 'phone', 'kind', 'credit_limit_xof', 'total_achete_xof',
    'total_regle_xof', 'solde_xof', 'derniere_vente',
  ],
  v_monthly_pnl: [
    'mois', 'chiffre_xof', 'cout_marchandises_xof', 'marge_brute_xof',
    'depenses_xof', 'resultat_xof',
  ],
  v_top_products: ['product_id', 'product_name', 'qty_base_vendue', 'chiffre_xof', 'nb_ventes'],
  v_appro_a_valoriser: ['id', 'number', 'received_at', 'supplier_name', 'nb_lignes', 'qty_totale'],
  v_stock_negatif: [
    'id', 'sku', 'name', 'base_unit', 'stock_qty', 'category_name',
    'derniere_vente_hors_ligne',
  ],
};

/** Tables modifiables. Les vues et le journal d'audit n'en sont pas. */
export const WRITABLE_TABLES: readonly string[] = [
  'categories', 'products', 'product_units', 'customers', 'suppliers',
  'purchase_orders', 'purchase_order_items', 'sales', 'sale_items', 'payments',
  'quotes', 'quote_items', 'orders', 'order_items', 'stock_movements',
  'supply_entries', 'supply_entry_items', 'stock_counts', 'stock_count_items',
  'expenses', 'expense_categories', 'shop_settings', 'team_members',
];

/**
 * Jointures autorisées, source → cibles.
 *
 * Volontairement plus étroit que le graphe des clés étrangères : `team_members`
 * n'est cible de personne, alors que six tables y pointent. Afficher « vendu
 * par Awa » se fait en chargeant l'équipe une fois, pas en ouvrant une jointure
 * vers la table des comptes depuis toutes les autres.
 */
export const EMBEDS: Record<string, readonly string[]> = {
  products: ['categories', 'product_units'],
  sales: ['customers'],
  sale_items: ['products'],
  payments: ['customers', 'sales'],
  quotes: ['customers'],
  quote_items: ['products'],
  orders: ['customers'],
  order_items: ['products'],
  purchase_orders: ['suppliers'],
  purchase_order_items: ['products'],
  supply_entries: ['suppliers', 'purchase_orders'],
  supply_entry_items: ['products'],
  stock_counts: ['categories'],
  stock_count_items: ['products'],
  stock_movements: ['products'],
  expenses: ['expense_categories'],
};

/**
 * Colonnes de coût : retirées des réponses pour vendeur et magasinier, à
 * quelque niveau qu'elles apparaissent — y compris dans une table jointe.
 */
export const COST_COLUMNS: Record<string, readonly string[]> = {
  products: ['cost_price_xof'],
  sale_items: ['cost_price_xof'],
  purchase_order_items: ['unit_cost_xof'],
  supply_entry_items: ['unit_cost_xof'],
  v_monthly_pnl: ['cout_marchandises_xof', 'marge_brute_xof', 'resultat_xof'],
};

/**
 * Colonnes lisibles mais JAMAIS modifiables — par personne, quel que soit le
 * rôle. Ce sont des valeurs calculées par la base : les écrire à la main ne
 * ferait pas ce qu'on croit, et casserait l'invariant qui les produit.
 */
export const READONLY_COLUMNS: Record<string, readonly string[]> = {
  // Dérivée de `roles` par déclencheur. L'écrire directement la
  // désynchroniserait des rôles réels jusqu'à la prochaine modification.
  team_members: ['role'],
  // Solde du grand livre, tenu par déclencheur sur stock_movements. Le corriger
  // à la main ferait diverger le stock affiché de son historique — exactement
  // ce que le modèle en grand livre existe pour empêcher.
  products: ['stock_qty'],
};

/**
 * Colonnes qu'un rôle donné n'a pas le droit d'ÉCRIRE, même quand il peut
 * écrire dans la table.
 *
 * Sans cette liste, appliquer le plafond d'ardoise ne servirait à rien : un
 * vendeur peut modifier une fiche client, il lui suffirait de relever le
 * plafond avant d'encaisser à crédit.
 */
export const RESTRICTED_WRITE_COLUMNS: Record<string, Record<string, readonly Role[]>> = {
  customers: { credit_limit_xof: ['patron', 'gerant'] },
  products: { cost_price_xof: ['patron', 'gerant'] },
  purchase_order_items: { unit_cost_xof: ['patron', 'gerant'] },
  supply_entry_items: { unit_cost_xof: ['patron', 'gerant'] },
};

// ---- Analyse et validation de la chaîne `select` ---------------------------

const IDENT = /^[a-z_][a-z0-9_]*$/;

export type SelectNode = { table: string; columns: string[]; embeds: SelectNode[] };

type ParseResult = { ok: true; node: SelectNode } | { ok: false; message: string };

/** Découpe sur les virgules de premier niveau, en respectant les parenthèses. */
function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  if (depth !== 0) throw new Error('parenthèses déséquilibrées');
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Analyse une chaîne `select` en n'acceptant qu'un sous-ensemble strict de la
 * syntaxe PostgREST : des colonnes, et des jointures `table(colonnes)` sur un
 * seul niveau. Pas d'alias, pas de `!hint`, pas d'accès JSON, pas d'agrégat —
 * rien de tout ça n'est utilisé par l'application, et chacun est une façon de
 * faire sortir une colonne par un chemin que la validation n'inspecte pas.
 */
export function parseSelect(table: string, select: string, depth = 0): ParseResult {
  const columns: string[] = [];
  const embeds: SelectNode[] = [];

  let parts: string[];
  try {
    parts = splitTopLevel(select);
  } catch {
    return { ok: false, message: 'Sélection illisible.' };
  }
  if (parts.length === 0) return { ok: false, message: 'Sélection vide.' };

  for (const part of parts) {
    const open = part.indexOf('(');

    if (open === -1) {
      if (part === '*') {
        columns.push('*');
        continue;
      }
      if (!IDENT.test(part)) {
        return { ok: false, message: `Colonne invalide : ${part}` };
      }
      columns.push(part);
      continue;
    }

    if (depth > 0) {
      return { ok: false, message: 'Jointure imbriquée refusée.' };
    }
    if (!part.endsWith(')')) {
      return { ok: false, message: 'Jointure mal formée.' };
    }

    const cible = part.slice(0, open).trim();
    if (!IDENT.test(cible)) {
      return { ok: false, message: `Jointure invalide : ${cible}` };
    }
    if (!(EMBEDS[table] ?? []).includes(cible)) {
      return { ok: false, message: `Jointure non autorisée : ${table} → ${cible}` };
    }

    const inner = parseSelect(cible, part.slice(open + 1, -1), depth + 1);
    if (!inner.ok) return inner;
    embeds.push(inner.node);
  }

  return { ok: true, node: { table, columns, embeds } };
}

/**
 * Colonnes qu'un rôle a le droit de lire dans une table : tout ce qui est
 * déclaré, moins les coûts s'il n'y a pas droit.
 */
export function readableColumns(table: string, canSeeCosts: boolean): readonly string[] {
  const all = TABLE_COLUMNS[table];
  if (!all) return [];
  if (canSeeCosts) return all;
  const couts = COST_COLUMNS[table];
  if (!couts) return all;
  return all.filter((c) => !couts.includes(c));
}

/**
 * Valide la sélection et la RÉÉCRIT en une liste explicite de colonnes.
 *
 * Réécrire plutôt que laisser passer règle le cas du `*` : il est développé
 * ici, donc une colonne interdite ne peut pas se glisser dans la réponse par
 * ce chemin. C'est aussi ce qui rend le masquage des coûts fiable sans dépendre
 * d'un nettoyage a posteriori.
 */
export function buildSelect(
  table: string,
  select: string,
  roles: Roles,
  canSeeCosts: boolean,
  canReadTable: (roles: Roles, table: string) => boolean,
): { ok: true; select: string } | { ok: false; message: string } {
  const parsed = parseSelect(table, select);
  if (!parsed.ok) return parsed;

  const rendu = (node: SelectNode, estRacine: boolean): string | { erreur: string } => {
    if (!estRacine && !canReadTable(roles, node.table)) {
      return { erreur: `Ton rôle ne permet pas de lire ${node.table}.` };
    }

    const autorisees = readableColumns(node.table, canSeeCosts);
    if (autorisees.length === 0) {
      return { erreur: `Table inconnue : ${node.table}` };
    }

    const cols = node.columns.includes('*')
      ? [...autorisees]
      : node.columns.filter((c) => {
          return autorisees.includes(c);
        });

    // Une colonne demandée mais non autorisée est silencieusement omise
    // quand elle existe (cas d'un coût demandé par un vendeur : la page
    // fonctionne, la donnée n'y est pas) et refusée quand elle n'existe pas
    // du tout (cas d'une faute de frappe ou d'une sonde).
    if (!node.columns.includes('*')) {
      for (const c of node.columns) {
        const connue = (TABLE_COLUMNS[node.table] ?? []).includes(c);
        if (!connue) return { erreur: `Colonne inconnue : ${node.table}.${c}` };
      }
    }

    const morceaux = [...cols];
    for (const e of node.embeds) {
      const sous = rendu(e, false);
      if (typeof sous !== 'string') return sous;
      morceaux.push(`${e.table}(${sous})`);
    }

    if (morceaux.length === 0) return { erreur: 'Sélection vide après filtrage.' };
    return morceaux.join(',');
  };

  const out = rendu(parsed.node, true);
  if (typeof out !== 'string') return { ok: false, message: out.erreur };
  return { ok: true, select: out };
}

/**
 * Valide les colonnes écrites : uniquement des colonnes connues, et aucune
 * colonne réservée à un rôle supérieur.
 */
export function validateWrite(
  table: string,
  values: unknown,
  roles: Roles,
): { ok: true } | { ok: false; message: string } {
  const connues = TABLE_COLUMNS[table];
  if (!connues) return { ok: false, message: `Table inconnue : ${table}` };

  const restrictions = RESTRICTED_WRITE_COLUMNS[table] ?? {};
  const calculees = READONLY_COLUMNS[table] ?? [];
  const lignes = Array.isArray(values) ? values : [values];

  for (const ligne of lignes) {
    if (!ligne || typeof ligne !== 'object') {
      return { ok: false, message: 'Valeurs invalides.' };
    }
    for (const col of Object.keys(ligne as Record<string, unknown>)) {
      if (!connues.includes(col)) {
        return { ok: false, message: `Colonne inconnue ou protégée : ${table}.${col}` };
      }
      if (calculees.includes(col)) {
        return {
          ok: false,
          message: `${table}.${col} est calculée par la base et ne se modifie pas directement.`,
        };
      }
      const permis = restrictions[col];
      if (permis && !roles.some((r) => permis.includes(r))) {
        return { ok: false, message: `Ton rôle ne permet pas de modifier ${col}.` };
      }
    }
  }
  return { ok: true };
}
