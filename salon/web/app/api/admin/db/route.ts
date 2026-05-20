import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

// Modèle de sécurité : la RLS est activée partout et la clé anon n'a aucun
// accès. Tout le CRUD admin transite par cette route, exécutée en service_role
// et protégée par le cookie httpOnly `muse_admin` (même secret que le middleware).

const TABLES = [
  'sectors',
  'categories',
  'services',
  'products',
  'sales',
  'sale_items',
  'clients',
  'appointments',
  'expenses',
  'expense_categories',
  'salon_settings',
  'staff',
  'client_events',
  'gallery_images',
] as const;

const VIEWS = ['monthly_pnl', 'clients_at_risk'] as const;

const WRITABLE = new Set<string>(TABLES);
const READABLE = new Set<string>([...TABLES, ...VIEWS]);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']);
const ACTIONS = new Set(['select', 'insert', 'update', 'delete', 'upsert']);

type Body = {
  table?: unknown;
  action?: unknown;
  values?: unknown;
  select?: unknown;
  filters?: unknown;
  order?: unknown;
  limit?: unknown;
  single?: unknown;
  returning?: unknown;
};

function fail(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
}

export async function POST(req: NextRequest) {
  const expected = process.env.ADMIN_TOKEN;
  const got = req.cookies.get('muse_admin')?.value;
  if (!expected || got !== expected) return fail('unauthorized', 401);

  let body: Body | null = null;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = null;
  }
  if (!body || typeof body.table !== 'string' || typeof body.action !== 'string') {
    return fail('bad_request', 400);
  }

  const table = body.table;
  const action = body.action;
  const isWrite = action !== 'select';

  if (!ACTIONS.has(action)) return fail(`unknown_action:${action}`, 400);
  if (isWrite && !WRITABLE.has(table)) return fail(`table_not_writable:${table}`, 403);
  if (!isWrite && !READABLE.has(table)) return fail(`table_not_readable:${table}`, 403);

  const filters = Array.isArray(body.filters) ? body.filters : [];
  // Garde-fou : jamais d'update/delete sans filtre — éviterait de toucher
  // l'intégralité de la table sur un bug client.
  if ((action === 'update' || action === 'delete') && filters.length === 0) {
    return fail('refused_unfiltered_mutation', 400);
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
  } else {
    q = admin.from(table).delete();
  }

  for (const f of filters as Array<Record<string, unknown>>) {
    if (!f || typeof f.column !== 'string' || typeof f.op !== 'string') continue;
    if (!OPS.has(f.op)) continue;
    q = q[f.op](f.column, f.value);
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

  const { data, error } = await q;
  return NextResponse.json({
    data: data ?? null,
    error: error ? { message: error.message } : null,
  });
}
