import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember } from '@/lib/auth-server';
import { canReadTable, canWriteTable, canSeeCosts } from '@/lib/permissions';
import { TABLE_COLUMNS, WRITABLE_TABLES, buildSelect, validateWrite } from '@/lib/db-schema';
import { logAudit } from '@/lib/audit';

// Modèle de sécurité : la RLS est verrouillée partout et la clé publique n'a
// aucun accès. Tout le CRUD admin transite par ici, en service_role, derrière
// un cookie httpOnly — et chaque requête est revalidée par rôle.
//
// Trois barrières, dans cet ordre :
//   1. la table est-elle exposée, et ce rôle y a-t-il droit ?
//   2. les COLONNES demandées sont-elles déclarées dans lib/db-schema.ts ?
//      La chaîne `select` est réécrite à partir de cette liste, jamais
//      transmise telle quelle : PostgREST y résout les jointures par clé
//      étrangère, et une jointure non contrôlée fait sortir n'importe quelle
//      colonne de n'importe quelle table voisine.
//   3. toute mutation est journalisée dans audit_log.

const READABLE = new Set<string>(Object.keys(TABLE_COLUMNS));
const WRITABLE = new Set<string>(WRITABLE_TABLES);
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'ilike', 'is']);
const ACTIONS = new Set(['select', 'insert', 'update', 'delete', 'upsert']);

/**
 * Plafond de lignes, pour qu'une requête sans `limit` ne puisse pas ramener
 * une table entière. Volontairement haut : au-delà, ce n'est plus un garde-fou
 * mais une troncature silencieuse, et un catalogue amputé au comptoir est un
 * bien pire défaut qu'une réponse volumineuse. Toute troncature effective est
 * signalée dans les logs serveur — un plafond muet finit toujours par se faire
 * passer pour « il n'y a que ça ».
 */
const LIMITE_MAX = 10_000;

type Body = Record<string, unknown>;

function fail(message: string, status: number) {
  return NextResponse.json({ data: null, error: { message } }, { status });
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
    ? canWriteTable(member.roles, table)
    : canReadTable(member.roles, table);
  if (!allowed) return fail('Ton rôle ne permet pas cette opération.', 403);

  const filters = Array.isArray(body.filters) ? body.filters : [];
  // Garde-fou : jamais d'update/delete sans filtre — un bug côté client
  // toucherait sinon la table entière.
  if ((action === 'update' || action === 'delete') && filters.length === 0) {
    return fail('Modification sans filtre refusée.', 400);
  }

  // Colonnes écrites : seulement celles déclarées, et aucune réservée à un
  // rôle supérieur (le plafond d'ardoise, les prix d'achat).
  if (action !== 'delete' && isWrite) {
    const verdict = validateWrite(table, body.values, member.roles);
    if (!verdict.ok) return fail(verdict.message, 403);
  }

  const voitLesCouts = canSeeCosts(member.roles);
  const selectDemande =
    typeof body.select === 'string' && body.select.trim().length > 0 ? body.select : '*';
  const returning = body.returning === true;

  // La sélection est réécrite en liste explicite : `*` est développé à partir
  // des colonnes déclarées, les coûts sont retirés pour qui n'y a pas droit, et
  // les jointures sont vérifiées une par une.
  const select = buildSelect(table, selectDemande, member.roles, voitLesCouts, canReadTable);
  if (!select.ok) return fail(select.message, 400);

  const admin = supabaseAdmin();
  type Row = Record<string, unknown>;
  const values = body.values as Row | Row[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any;

  if (action === 'select') {
    q = admin.from(table).select(select.select);
  } else if (action === 'insert') {
    q = admin.from(table).insert(values);
    if (returning) q = q.select(select.select);
  } else if (action === 'upsert') {
    q = admin.from(table).upsert(values);
    if (returning) q = q.select(select.select);
  } else if (action === 'update') {
    q = admin.from(table).update(values);
    if (returning) q = q.select(select.select);
  } else {
    q = admin.from(table).delete();
  }

  const colonnesFiltrables = TABLE_COLUMNS[table] ?? [];
  for (const f of filters as Array<Record<string, unknown>>) {
    if (!f || typeof f.column !== 'string' || typeof f.op !== 'string') continue;
    if (!OPS.has(f.op)) continue;
    // Filtrer sur une colonne non déclarée permettrait de deviner son contenu
    // par recoupement (« existe-t-il une ligne où password_hash commence par… »).
    if (!colonnesFiltrables.includes(f.column)) {
      return fail(`Filtre sur colonne inconnue : ${table}.${f.column}`, 400);
    }
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
    if (!colonnesFiltrables.includes(o.column)) continue;
    q = q.order(o.column, {
      ascending: o.ascending !== false,
      nullsFirst: typeof o.nullsFirst === 'boolean' ? o.nullsFirst : undefined,
    });
  }

  const limite = typeof body.limit === 'number' ? Math.min(body.limit, LIMITE_MAX) : LIMITE_MAX;
  if (body.single !== true && body.maybeSingle !== true) q = q.limit(limite);
  if (body.single === true) q = q.single();
  else if (body.maybeSingle === true) q = q.maybeSingle();

  const { data, error } = await q;

  if (!error && Array.isArray(data) && data.length >= LIMITE_MAX) {
    console.warn(
      `[db] ${table} : ${data.length} lignes — plafond atteint, la réponse est probablement tronquée. Pagine cette requête.`,
    );
  }

  if (isWrite) {
    void logAudit(admin, member, {
      action,
      table,
      filters: filters.length > 0 ? filters : null,
      values: action === 'delete' ? null : body.values,
      data,
      ok: !error,
      error: error ? error.message : null,
    });
  }

  return NextResponse.json({
    data: data ?? null,
    error: error ? { message: error.message } : null,
  });
}
