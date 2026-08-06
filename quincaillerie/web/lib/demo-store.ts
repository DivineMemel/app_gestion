'use client';
import { seed } from '@/lib/demo-data';

/**
 * Moteur de démonstration — remplace Supabase tant qu'aucun projet n'est
 * configuré.
 *
 * Il rejoue en JavaScript les règles que le schéma applique côté Postgres :
 *   · le stock est un grand livre — toute variation passe par un mouvement ;
 *   · une vente encaissée génère toujours un règlement ;
 *   · les vues (stock bas, soldes clients, P&L) sont recalculées à la volée.
 *
 * L'objectif n'est pas de simuler Postgres, mais que le comportement observé à
 * l'écran soit le même avant et après le branchement de Supabase. Les données
 * vivent dans localStorage : une vente encaissée survit au rechargement.
 */

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tables = Record<string, Row[]>;

const CLE = 'qc_demo_v1';

// Relations utilisées par les `select` imbriqués des pages (syntaxe PostgREST).
const RELATIONS: Record<string, Record<string, { table: string; fk: string; many?: boolean }>> = {
  products: {
    product_units: { table: 'product_units', fk: 'product_id', many: true },
    categories: { table: 'categories', fk: 'category_id' },
  },
  sales: { customers: { table: 'customers', fk: 'customer_id' } },
  quotes: { customers: { table: 'customers', fk: 'customer_id' } },
  expenses: { expense_categories: { table: 'expense_categories', fk: 'category_id' } },
  purchase_orders: { suppliers: { table: 'suppliers', fk: 'supplier_id' } },
  purchase_order_items: { products: { table: 'products', fk: 'product_id' } },
  stock_movements: { products: { table: 'products', fk: 'product_id' } },
};

let cache: Tables | null = null;

function charger(): Tables {
  if (cache) return cache;
  if (typeof window === 'undefined') return (cache = seed());
  try {
    const brut = localStorage.getItem(CLE);
    cache = brut ? (JSON.parse(brut) as Tables) : seed();
  } catch {
    cache = seed();
  }
  return cache!;
}

function sauver() {
  if (typeof window === 'undefined' || !cache) return;
  try {
    localStorage.setItem(CLE, JSON.stringify(cache));
  } catch {
    /* quota plein : la session reste utilisable en mémoire */
  }
}

export function reinitialiserDemo() {
  cache = seed();
  sauver();
}

const uid = () =>
  `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ---------------------------------------------------------------------------
// Vues calculées
// ---------------------------------------------------------------------------

function vue(nom: string, t: Tables): Row[] {
  const params = t.shop_settings[0] ?? { default_min_stock: 5 };

  if (nom === 'v_low_stock') {
    const enrichis: Row[] = t.products
      .filter((p) => p.active)
      .map((p) => ({
        ...p,
        min_stock: p.min_stock ?? params.default_min_stock,
        category_name: t.categories.find((c) => c.id === p.category_id)?.name ?? null,
      }));
    return enrichis
      .filter((p) => Number(p.stock_qty) <= Number(p.min_stock))
      // Le plus en retard sur son seuil remonte en premier.
      .sort(
        (a, b) =>
          Number(a.stock_qty) - Number(a.min_stock) -
          (Number(b.stock_qty) - Number(b.min_stock)),
      );
  }

  if (nom === 'v_customer_balances') {
    return t.customers.map((c) => {
      const ventes = t.sales.filter(
        (s) => s.customer_id === c.id && s.status !== 'annulee',
      );
      const achete = ventes.reduce((s, v) => s + Number(v.total_xof), 0);
      const regle = t.payments
        .filter((p) => p.customer_id === c.id)
        .reduce((s, p) => s + Number(p.amount_xof), 0);
      const derniere = ventes
        .map((v) => v.sold_at as string)
        .sort()
        .pop();
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        kind: c.kind,
        credit_limit_xof: c.credit_limit_xof,
        total_achete_xof: achete,
        total_regle_xof: regle,
        solde_xof: achete - regle,
        derniere_vente: derniere ?? null,
      };
    });
  }

  if (nom === 'v_monthly_pnl') {
    const mois = new Map<string, { ca: number; cout: number; dep: number }>();
    const clef = (iso: string) => `${iso.slice(0, 7)}-01`;

    for (const v of t.sales) {
      if (v.status === 'annulee') continue;
      const m = clef(v.sold_at);
      const e = mois.get(m) ?? { ca: 0, cout: 0, dep: 0 };
      e.ca += Number(v.total_xof);
      for (const it of t.sale_items.filter((i) => i.sale_id === v.id)) {
        e.cout += Number(it.qty) * Number(it.unit_factor) * Number(it.cost_price_xof ?? 0);
      }
      mois.set(m, e);
    }
    for (const d of t.expenses) {
      const m = clef(d.spent_on);
      const e = mois.get(m) ?? { ca: 0, cout: 0, dep: 0 };
      e.dep += Number(d.amount_xof);
      mois.set(m, e);
    }

    return [...mois.entries()]
      .map(([m, e]) => ({
        mois: m,
        chiffre_xof: Math.round(e.ca),
        cout_marchandises_xof: Math.round(e.cout),
        marge_brute_xof: Math.round(e.ca - e.cout),
        depenses_xof: Math.round(e.dep),
        resultat_xof: Math.round(e.ca - e.cout - e.dep),
      }))
      .sort((a, b) => (a.mois < b.mois ? 1 : -1));
  }

  if (nom === 'v_top_products') {
    const limite = Date.now() - 90 * 86_400_000;
    const par = new Map<string, Row>();
    for (const v of t.sales) {
      if (v.status === 'annulee' || new Date(v.sold_at).getTime() < limite) continue;
      for (const it of t.sale_items.filter((i) => i.sale_id === v.id)) {
        const k = it.product_name as string;
        const e = par.get(k) ?? {
          product_id: it.product_id,
          product_name: k,
          qty_base_vendue: 0,
          chiffre_xof: 0,
          nb_ventes: 0,
        };
        e.qty_base_vendue += Number(it.qty) * Number(it.unit_factor);
        e.chiffre_xof += Number(it.line_total_xof);
        e.nb_ventes += 1;
        par.set(k, e);
      }
    }
    return [...par.values()].sort((a, b) => b.chiffre_xof - a.chiffre_xof);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------

type Filtre = { op: string; column: string; value: unknown };

function applique(rows: Row[], filtres: Filtre[]): Row[] {
  return rows.filter((r) =>
    filtres.every((f) => {
      const v = r[f.column];
      switch (f.op) {
        case 'eq': return String(v) === String(f.value);
        case 'neq': return String(v) !== String(f.value);
        case 'gt': return v > (f.value as never);
        case 'gte': return v >= (f.value as never);
        case 'lt': return v < (f.value as never);
        case 'lte': return v <= (f.value as never);
        case 'in': return (f.value as unknown[]).map(String).includes(String(v));
        case 'is': return f.value === null ? v == null : v === f.value;
        case 'ilike': {
          const motif = String(f.value).replace(/%/g, '').toLowerCase();
          return String(v ?? '').toLowerCase().includes(motif);
        }
        default: return true;
      }
    }),
  );
}

/** Attache les relations demandées dans le `select` (ex. `customers(name)`). */
function joindre(table: string, rows: Row[], select: string, t: Tables): Row[] {
  const rels = RELATIONS[table];
  if (!rels) return rows;
  const demandes = Object.keys(rels).filter((nom) =>
    new RegExp(`(^|[\\s,])${nom}\\s*\\(`).test(select),
  );
  if (demandes.length === 0) return rows;

  return rows.map((r) => {
    const copie = { ...r };
    for (const nom of demandes) {
      const rel = rels[nom];
      copie[nom] = rel.many
        ? t[rel.table].filter((x) => x[rel.fk] === r.id)
        : (t[rel.table].find((x) => x.id === r[rel.fk]) ?? null);
    }
    return copie;
  });
}

export type DemoRequete = {
  table: string;
  action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  values?: unknown;
  select?: string | null;
  filters?: Filtre[];
  order?: { column: string; ascending: boolean }[];
  limit?: number | null;
  single?: boolean;
  maybeSingle?: boolean;
  returning?: boolean;
};

export function executer(q: DemoRequete): { data: unknown; error: { message: string } | null } {
  const t = charger();
  const filtres = q.filters ?? [];

  // ---- lecture ----
  if (q.action === 'select') {
    let rows = q.table.startsWith('v_') ? vue(q.table, t) : (t[q.table] ?? []);
    rows = applique(rows, filtres);

    for (const o of [...(q.order ?? [])].reverse()) {
      rows = [...rows].sort((a, b) => {
        const av = a[o.column];
        const bv = b[o.column];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av > bv ? 1 : av < bv ? -1 : 0;
        return o.ascending ? cmp : -cmp;
      });
    }

    if (typeof q.limit === 'number') rows = rows.slice(0, q.limit);
    rows = joindre(q.table, rows, q.select ?? '*', t);

    if (q.single) {
      if (rows.length !== 1) {
        return { data: null, error: { message: 'Aucune ligne correspondante.' } };
      }
      return { data: rows[0], error: null };
    }
    if (q.maybeSingle) return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  // ---- écriture ----
  if (!t[q.table]) t[q.table] = [];
  const table = t[q.table];

  if (q.action === 'insert' || q.action === 'upsert') {
    const entrees = (Array.isArray(q.values) ? q.values : [q.values]) as Row[];
    const crees: Row[] = [];
    for (const e of entrees) {
      const ligne: Row = { id: e.id ?? uid(), created_at: new Date().toISOString(), ...e };
      const i = table.findIndex((r) => r.id === ligne.id);
      if (i >= 0 && q.action === 'upsert') table[i] = { ...table[i], ...ligne };
      else table.push(ligne);
      crees.push(ligne);
      if (q.table === 'stock_movements') appliquerMouvement(t, ligne);
    }
    sauver();
    const out = joindre(q.table, crees, q.select ?? '*', t);
    return { data: q.single || q.maybeSingle ? out[0] : out, error: null };
  }

  if (q.action === 'update') {
    const cibles = applique(table, filtres);
    for (const c of cibles) Object.assign(c, q.values as Row);
    sauver();
    const out = joindre(q.table, cibles, q.select ?? '*', t);
    return { data: q.single || q.maybeSingle ? (out[0] ?? null) : out, error: null };
  }

  if (q.action === 'delete') {
    const cibles = applique(table, filtres);
    const ids = new Set(cibles.map((c) => c.id));
    t[q.table] = table.filter((r) => !ids.has(r.id));
    // Contre-passe : supprimer un mouvement rembobine le solde, comme le
    // trigger `guard_stock_movement` en base.
    if (q.table === 'stock_movements') {
      for (const c of cibles) appliquerMouvement(t, c, -1);
    }
    sauver();
    return { data: null, error: null };
  }

  return { data: null, error: { message: `Action inconnue : ${q.action}` } };
}

function appliquerMouvement(t: Tables, mv: Row, sens = 1) {
  const p = t.products.find((x) => x.id === mv.product_id);
  if (p) p.stock_qty = Number(p.stock_qty) + sens * Number(mv.qty_base);
}

// ---------------------------------------------------------------------------
// RPC — mêmes règles métier que les fonctions Postgres
// ---------------------------------------------------------------------------

function numero(t: Tables, table: string, prefixe: string, pad: number) {
  const an = new Date().getFullYear();
  const n = (t[table]?.length ?? 0) + 1;
  return `${prefixe}-${an}-${String(n).padStart(pad, '0')}`;
}

function creerVente(t: Tables, p: Row): { data: unknown; error: { message: string } | null } {
  const items = (p.items ?? []) as Row[];
  if (items.length === 0) return { data: null, error: { message: 'Vente vide : aucune ligne.' } };

  const negatifOk = Boolean(t.shop_settings[0]?.allow_negative_stock);
  const id = uid();
  const num = numero(t, 'sales', 'V', 5);
  const maintenant = new Date().toISOString();

  let sousTotal = 0;
  const lignes: Row[] = [];
  const mouvements: Row[] = [];

  for (const it of items) {
    const prod = t.products.find((x) => x.id === it.product_id);
    if (!prod) return { data: null, error: { message: 'Produit introuvable.' } };

    const qte = Number(it.qty);
    const facteur = Number(it.unit_factor ?? 1);
    const prix = Number(it.unit_price_xof);
    if (!(qte > 0)) {
      return { data: null, error: { message: `Quantité invalide pour ${prod.name}.` } };
    }

    const base = qte * facteur;
    if (!negatifOk && Number(prod.stock_qty) < base) {
      return {
        data: null,
        error: {
          message: `Stock insuffisant pour ${prod.name} : ${prod.stock_qty} ${prod.base_unit} disponibles, ${base} demandées.`,
        },
      };
    }

    const ligne = Math.round(qte * prix);
    sousTotal += ligne;
    lignes.push({
      id: uid(), sale_id: id, product_id: prod.id, product_name: prod.name,
      unit_label: it.unit_label ?? prod.base_unit, unit_factor: facteur,
      qty: qte, unit_price_xof: prix, line_total_xof: ligne,
      cost_price_xof: Number(prod.cost_price_xof ?? 0),
    });
    mouvements.push({
      id: uid(), product_id: prod.id, qty_base: -base, kind: 'vente',
      ref_table: 'sales', ref_id: id, note: num, created_by: null, created_at: maintenant,
    });
  }

  const remise = Number(p.discount_xof ?? 0);
  const total = Math.max(sousTotal - remise, 0);
  const paye = Math.min(Number(p.paid_xof ?? 0), total);
  const statut = paye >= total ? 'payee' : paye > 0 ? 'partielle' : 'credit';

  if (statut !== 'payee' && !p.customer_id) {
    return { data: null, error: { message: 'Vente à crédit impossible sans client identifié.' } };
  }

  t.sales.push({
    id, number: num, customer_id: p.customer_id ?? null,
    subtotal_xof: sousTotal, discount_xof: remise, total_xof: total, paid_xof: paye,
    payment_method: p.payment_method ?? 'especes', status: statut,
    channel: p.channel ?? 'comptoir', note: p.note ?? null, sold_by: null,
    sold_at: maintenant, created_at: maintenant,
  });
  t.sale_items.push(...lignes);
  for (const mv of mouvements) {
    t.stock_movements.push(mv);
    appliquerMouvement(t, mv);
  }
  if (paye > 0) {
    t.payments.push({
      id: uid(), customer_id: p.customer_id ?? null, sale_id: id, amount_xof: paye,
      method: p.payment_method === 'credit' ? 'especes' : (p.payment_method ?? 'especes'),
      note: `Encaissement ${num}`, received_by: null, paid_at: maintenant,
    });
  }

  sauver();
  return {
    data: { id, number: num, subtotal_xof: sousTotal, total_xof: total, paid_xof: paye, status: statut },
    error: null,
  };
}

/**
 * Commande passée depuis la vitrine, en mode démo.
 *
 * Écrit dans le même magasin que l'admin : la commande apparaît donc
 * immédiatement dans /admin/commandes, comme elle le ferait en base. Les prix
 * sont relus dans le catalogue local, jamais pris dans le panier — c'est la
 * règle appliquée par /api/orders côté serveur.
 */
export function creerCommandeDemo(payload: {
  customer: { name: string; phone: string; email?: string | null };
  note?: string | null;
  items: { product_id: string; unit_label: string; qty: number }[];
}): { ok: boolean; reason?: string; order?: { number: string; total_xof: number } } {
  const t = charger();
  const nom = payload.customer.name?.trim() ?? '';
  const tel = payload.customer.phone?.replace(/\s+/g, '') ?? '';

  if (nom.length < 2) return { ok: false, reason: 'Indiquez votre nom.' };
  if (tel.length < 8) return { ok: false, reason: 'Indiquez un numéro valide.' };
  if (!payload.items?.length) return { ok: false, reason: 'Votre panier est vide.' };
  if (!t.shop_settings[0]?.online_orders_open) {
    return { ok: false, reason: 'Les commandes en ligne sont momentanément fermées.' };
  }

  const id = uid();
  const num = numero(t, 'orders', 'C', 4);
  const lignes: Row[] = [];
  let total = 0;

  for (const it of payload.items) {
    const p = t.products.find((x) => x.id === it.product_id);
    if (!p || !p.active || !p.published) {
      return { ok: false, reason: 'Un article de votre panier n’est plus disponible.' };
    }
    const u = t.product_units.find(
      (x) => x.product_id === p.id && x.label === it.unit_label,
    );
    if (!u) return { ok: false, reason: `Conditionnement inconnu pour ${p.name}.` };

    const qte = Number(it.qty);
    if (!(qte > 0)) return { ok: false, reason: `Quantité invalide pour ${p.name}.` };

    const ligne = Math.round(qte * Number(u.price_xof));
    total += ligne;
    lignes.push({
      id: uid(), order_id: id, product_id: p.id, product_name: p.name,
      unit_label: u.label, unit_factor: Number(u.factor), qty: qte,
      unit_price_xof: Number(u.price_xof), line_total_xof: ligne,
    });
  }

  const maintenant = new Date().toISOString();
  t.orders.push({
    id, number: num, customer_id: null, customer_name: nom, customer_phone: tel,
    customer_email: payload.customer.email ?? null, total_xof: total,
    status: 'nouvelle', note: payload.note?.trim() || null,
    converted_sale_id: null, created_at: maintenant, updated_at: maintenant,
  });
  t.order_items.push(...lignes);
  sauver();

  return { ok: true, order: { number: num, total_xof: total } };
}

export function executerRpc(
  fn: string,
  args: Record<string, unknown>,
): { data: unknown; error: { message: string } | null } {
  const t = charger();

  if (fn === 'create_sale') return creerVente(t, (args.p ?? {}) as Row);

  if (fn === 'cancel_sale') {
    const v = t.sales.find((s) => s.id === args.p_sale_id);
    if (!v) return { data: null, error: { message: 'Vente introuvable.' } };
    if (v.status === 'annulee') return { data: null, error: null };

    for (const it of t.sale_items.filter((i) => i.sale_id === v.id)) {
      const mv = {
        id: uid(), product_id: it.product_id, qty_base: Number(it.qty) * Number(it.unit_factor),
        kind: 'retour', ref_table: 'sales', ref_id: v.id, note: `Annulation ${v.number}`,
        created_by: null, created_at: new Date().toISOString(),
      };
      t.stock_movements.push(mv);
      appliquerMouvement(t, mv);
    }
    t.payments = t.payments.filter((p) => p.sale_id !== v.id);
    v.status = 'annulee';
    v.paid_xof = 0;
    sauver();
    return { data: null, error: null };
  }

  if (fn === 'receive_purchase_order') {
    const bc = t.purchase_orders.find((b) => b.id === args.p_po_id);
    if (!bc) return { data: null, error: { message: 'Bon de commande introuvable.' } };
    if (bc.status === 'recu') return { data: null, error: null };

    for (const it of t.purchase_order_items.filter((i) => i.purchase_order_id === bc.id)) {
      const reste = Number(it.qty_base) - Number(it.qty_received_base);
      if (reste <= 0) continue;
      const mv = {
        id: uid(), product_id: it.product_id, qty_base: reste, kind: 'reception',
        ref_table: 'purchase_orders', ref_id: bc.id, note: `Réception ${bc.number}`,
        created_by: null, created_at: new Date().toISOString(),
      };
      t.stock_movements.push(mv);
      appliquerMouvement(t, mv);
      it.qty_received_base = it.qty_base;
      if (Number(it.unit_cost_xof) > 0) {
        const p = t.products.find((x) => x.id === it.product_id);
        if (p) p.cost_price_xof = Number(it.unit_cost_xof);
      }
    }
    bc.status = 'recu';
    bc.received_at = new Date().toISOString();
    sauver();
    return { data: null, error: null };
  }

  if (fn === 'convert_order_to_sale') {
    const o = t.orders.find((x) => x.id === args.p_order_id);
    if (!o) return { data: null, error: { message: 'Commande introuvable.' } };
    if (o.converted_sale_id) {
      return { data: null, error: { message: `La commande ${o.number} a déjà été convertie.` } };
    }

    let clientId = o.customer_id as string | null;
    if (!clientId) {
      const connu = t.customers.find((c) => c.phone === o.customer_phone);
      if (connu) clientId = connu.id;
      else {
        clientId = uid();
        t.customers.push({
          id: clientId, name: o.customer_name, phone: o.customer_phone,
          email: o.customer_email ?? null, address: null, kind: 'particulier',
          credit_limit_xof: 0, notes: null,
          created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        });
      }
    }

    const res = creerVente(t, {
      customer_id: clientId,
      discount_xof: 0,
      paid_xof: args.p_paid_xof ?? 0,
      payment_method: args.p_method ?? 'especes',
      channel: 'en_ligne',
      note: `Retrait commande ${o.number}`,
      items: t.order_items
        .filter((i) => i.order_id === o.id)
        .map((i) => ({
          product_id: i.product_id, unit_label: i.unit_label,
          unit_factor: i.unit_factor, qty: i.qty, unit_price_xof: i.unit_price_xof,
        })),
    });
    if (res.error) return res;

    o.status = 'retiree';
    o.converted_sale_id = (res.data as Row).id;
    o.customer_id = clientId;
    sauver();
    return res;
  }

  if (fn === 'convert_quote_to_sale') {
    const d = t.quotes.find((x) => x.id === args.p_quote_id);
    if (!d) return { data: null, error: { message: 'Devis introuvable.' } };
    if (d.converted_sale_id) {
      return { data: null, error: { message: `Le devis ${d.number} a déjà été converti.` } };
    }

    const res = creerVente(t, {
      customer_id: d.customer_id,
      discount_xof: d.discount_xof,
      paid_xof: args.p_paid_xof ?? 0,
      payment_method: args.p_method ?? 'especes',
      channel: 'comptoir',
      note: `Devis ${d.number}`,
      items: t.quote_items
        .filter((i) => i.quote_id === d.id)
        .map((i) => ({
          product_id: i.product_id, unit_label: i.unit_label,
          unit_factor: i.unit_factor, qty: i.qty, unit_price_xof: i.unit_price_xof,
        })),
    });
    if (res.error) return res;

    d.status = 'converti';
    d.converted_sale_id = (res.data as Row).id;
    sauver();
    return res;
  }

  return { data: null, error: { message: `Fonction inconnue : ${fn}` } };
}
