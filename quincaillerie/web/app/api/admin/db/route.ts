import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember } from '@/lib/auth-server';
import { canReadTable, canWriteTable, canSeeCosts } from '@/lib/permissions';

// Modèle de sécurité : la RLS est verrouillée partout et la clé publique n'a
// aucun accès. Tout le CRUD admin transite par ici, en service_role, derrière
// un cookie httpOnly — et chaque requête est revalidée par rôle.

const TABLES = [
  'categories',
  'products',
  'product_units',
  'customers',
  'suppliers',
  'purchase_orders',
  'purchase_order_items',
  'sales',
  'sale_items',
  'payments',
  'quotes',
  'quote_items',
  'orders',
  'order_items',
  'stock_movements',
  'supply_entries',
  'supply_entry_items',
  'stock_counts',
  'stock_count_items',
  'expenses',
  'expense_categories',
  'shop_settings',
  'team_members',
  'push_subscriptions',
] as const;

const VIEWS = [
  'v_appro_a_valoriser',
  'v_low_stock',
  'v_customer_balances',
  'v_monthly_pnl',
  'v_top_products',
] as const;

const WRITABLE = new Set<string>(TABLES);
const READABLE = new Set<string>([...TABLES, ...VIEWS]);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'ilike', 'is']);
const ACTIONS = new Set(['select', 'insert', 'update', 'delete', 'upsert']);

/**
 * Colonnes de coût, retirées des réponses pour les rôles qui n'y ont pas
 * droit. Masquer la colonne dans l'UI ne suffirait pas : elle transiterait
 * quand même dans la réponse réseau, lisible en deux clics.
 */
const COST_COLUMNS: Record<string, string[]> = {
  products: ['cost_price_xof'],
  sale_items: ['cost_price_xof'],
  purchase_order_items: ['unit_cost_xof'],
  supply_entry_items: ['unit_cost_xof'],
};

type Body = Record<string, unknown>;

function fail(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

function stripCosts(table: string, data: unknown): unknown {
  const cols = COST_COLUMNS[table];
  if (!cols || data == null) return data;
  const clean = (row: unknown) => {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...(row as Record<string, unknown>) };
    for (const c of cols) delete copy[c];
    return copy;
  };
  return Array.isArray(data) ? data.map(clean) : clean(data);
}

export async function POST(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
  if (!member) return fail('Session expirée, reconnecte-toi.', 401);

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = null;
  }
  if (!body || typeof body.table !== 'string' || typeof body.action !== 'string') {
    return fail('Requête invalide.', 400);
  }

  const table = body.table;
  const action = body.action;
  const isWrite = action !== 'select';

  if (!ACTIONS.has(action)) return fail(`Action inconnue : ${action}`, 400);
  if (isWrite && !WRITABLE.has(table)) return fail(`Table non modifiable : ${table}`, 403);
  if (!isWrite && !READABLE.has(table)) return fail(`Table non lisible : ${table}`, 403);

  const allowed = isWrite
    ? canWriteTable(member.role, table)
    : canReadTable(member.role, table);
  if (!allowed) return fail('Ton rôle ne permet pas cette opération.', 403);

  const filters = Array.isArray(body.filters) ? body.filters : [];
  // Garde-fou : jamais d'update/delete sans filtre — un bug côté client
  // toucherait sinon la table entière.
  if ((action === 'update' || action === 'delete') && filters.length === 0) {
    return fail('Modification sans filtre refusée.', 400);
  }

  // Écrire un coût sans avoir le droit de le lire n'a aucun sens : on refuse.
  if (isWrite && !canSeeCosts(member.role) && COST_COLUMNS[table]) {
    const rows = Array.isArray(body.values) ? body.values : [body.values];
    for (const row of rows) {
      if (row && typeof row === 'object') {
        for (const c of COST_COLUMNS[table]) {
          if (c in (row as Record<string, unknown>)) {
            return fail('Ton rôle ne permet pas de modifier les prix d’achat.', 403);
          }
        }
      }
    }
  }

  const select =
    typeof body.select === 'string' && body.select.length > 0 ? body.select : '*';
  const returning = body.returning === true;

  const admin = supabaseAdmin();
  type Row = Record<string, unknown>;
  const values = body.values as Row | Row[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any;

  if (action === 'select') {
    q = admin.from(table).select(select);
  } else if (action === 'insert') {
    q = admin.from(table).insert(values);
    if (returning) q = q.select(select);
  } else if (action === 'upsert') {
    q = admin.from(table).upsert(values);
    if (returning) q = q.select(select);
  } else if (action === 'update') {
    q = admin.from(table).update(values);
    if (returning) q = q.select(select);
  } else {
    q = admin.from(table).delete();
  }

  for (const f of filters as Array<Record<string, unknown>>) {
    if (!f || typeof f.column !== 'string' || typeof f.op !== 'string') continue;
    if (!OPS.has(f.op)) continue;
    if (f.op === 'in') {
      if (!Array.isArray(f.value)) continue;
      q = q.in(f.column, f.value);
    } else {
      q = q[f.op as 'eq'](f.column, f.value);
    }
  }

  const order = Array.isArray(body.order) ? body.order : [];
  for (const o of order as Array<Record<string, unknown>>) {
    if (!o || typeof o.column !== 'string') continue;
    q = q.order(o.column, {
      ascending: o.ascending !== false,
      nullsFirst: typeof o.nullsFirst === 'boolean' ? o.nullsFirst : undefined,
    });
  }

  if (typeof body.limit === 'number') q = q.limit(body.limit);
  if (body.single === true) q = q.single();
  else if (body.maybeSingle === true) q = q.maybeSingle();

  const { data, error } = await q;

  return NextResponse.json({
    data: canSeeCosts(member.role) ? (data ?? null) : stripCosts(table, data ?? null),
    error: error ? { message: error.message } : null,
  });
}
