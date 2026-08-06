'use client';

/**
 * Remplaçant « drop-in » du client Supabase, réservé aux pages admin.
 *
 * Toutes les requêtes passent par /api/admin/db (route serveur authentifiée par
 * cookie httpOnly) qui exécute en service_role. La RLS reste donc verrouillée
 * et la clé publique exposée au navigateur n'a aucun accès à la base.
 *
 * L'API reproduit le sous-ensemble de supabase-js dont les pages ont besoin :
 *   .from(t).select()/.insert()/.update()/.delete()/.upsert()
 *   filtres .eq/.neq/.gt/.gte/.lt/.lte/.in/.ilike/.is
 *   .order() .limit() .single() .maybeSingle()
 *   .rpc(fn, args)
 *
 * `channel()`/`removeChannel()` remplacent le temps réel : après chaque
 * mutation réussie les pages abonnées à la table refetchent immédiatement, et
 * un poll lent capte ce qui a été créé ailleurs (commande passée depuis la
 * vitrine, vente encaissée sur un autre poste).
 */

import { executer, executerRpc } from '@/lib/demo-store';

/**
 * Sans projet Supabase configuré, l'app bascule sur le moteur de
 * démonstration : mêmes écrans, mêmes règles, données dans le navigateur.
 * Renseigner NEXT_PUBLIC_SUPABASE_URL suffit à repasser en base réelle.
 */
export const MODE_DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

type OrderOpts = { ascending?: boolean; nullsFirst?: boolean };
type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'ilike' | 'is';
type Filter = { op: FilterOp; column: string; value: unknown };
type OrderSpec = { column: string; ascending: boolean; nullsFirst?: boolean };
type Action = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result<T = any> = { data: T; error: { message: string } | null };

/** Un poste de caisse doit voir vite une commande tombée du site. */
const POLL_MS = 15_000;

// ---- registre des « channels » actifs (remplacement realtime) -------------
type Reg = { table: string; cb: () => void };
type Entry = { regs: Reg[]; timer: ReturnType<typeof setInterval> };
const liveChannels = new Set<Entry>();

function fireRegs(regs: Reg[], table?: string) {
  const fired = new Set<() => void>();
  for (const r of regs) {
    if (table && r.table !== table) continue;
    if (fired.has(r.cb)) continue;
    fired.add(r.cb);
    try {
      r.cb();
    } catch {
      /* un échec de refetch ne doit pas casser les autres */
    }
  }
}

function notifyTable(table: string) {
  for (const entry of liveChannels) fireRegs(entry.regs, table);
}

/** Une mutation via RPC touche plusieurs tables : on les réveille toutes. */
const RPC_TOUCHES: Record<string, string[]> = {
  create_sale: ['sales', 'sale_items', 'payments', 'products', 'stock_movements'],
  cancel_sale: ['sales', 'payments', 'products', 'stock_movements'],
  receive_purchase_order: ['purchase_orders', 'products', 'stock_movements'],
  convert_order_to_sale: [
    'orders',
    'sales',
    'customers',
    'payments',
    'products',
    'stock_movements',
  ],
  convert_quote_to_sale: ['quotes', 'sales', 'payments', 'products', 'stock_movements'],
};

async function post(path: string, body: unknown): Promise<Result> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { data: null, error: { message: 'Connexion perdue.' } };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    /* corps vide ou non-JSON */
  }

  if (!res.ok) {
    return {
      data: null,
      error: { message: json?.error?.message ?? `Erreur ${res.status}` },
    };
  }
  return { data: json?.data ?? null, error: json?.error ?? null };
}

// ---- query builder ---------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class Builder<T = any> implements PromiseLike<Result<T>> {
  private _select?: string;
  private _filters: Filter[] = [];
  private _order: OrderSpec[] = [];
  private _limit?: number;
  private _single = false;
  private _maybe = false;
  private _returning = false;

  constructor(
    private readonly table: string,
    private readonly action: Action,
    private readonly values?: unknown,
  ) {
    if (action === 'select') this._returning = true;
  }

  select(columns = '*') {
    this._select = columns;
    this._returning = true;
    return this;
  }

  private addFilter(op: FilterOp, column: string, value: unknown) {
    this._filters.push({ op, column, value });
    return this;
  }
  eq(c: string, v: unknown) { return this.addFilter('eq', c, v); }
  neq(c: string, v: unknown) { return this.addFilter('neq', c, v); }
  gt(c: string, v: unknown) { return this.addFilter('gt', c, v); }
  gte(c: string, v: unknown) { return this.addFilter('gte', c, v); }
  lt(c: string, v: unknown) { return this.addFilter('lt', c, v); }
  lte(c: string, v: unknown) { return this.addFilter('lte', c, v); }
  in(c: string, v: unknown[]) { return this.addFilter('in', c, v); }
  ilike(c: string, v: string) { return this.addFilter('ilike', c, v); }
  is(c: string, v: null | boolean) { return this.addFilter('is', c, v); }

  order(column: string, opts?: OrderOpts) {
    this._order.push({
      column,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst,
    });
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    this._returning = true;
    return this;
  }

  /** Comme supabase-js : 0 ligne renvoie null au lieu d'une erreur. */
  maybeSingle() {
    this._maybe = true;
    this._returning = true;
    return this;
  }

  private async exec(): Promise<Result<T>> {
    const requete = {
      table: this.table,
      action: this.action,
      values: this.values ?? null,
      select: this._select ?? null,
      filters: this._filters,
      order: this._order,
      limit: this._limit ?? null,
      single: this._single,
      maybeSingle: this._maybe,
      returning: this._returning,
    };

    const out = (MODE_DEMO
      ? (executer(requete as Parameters<typeof executer>[0]) as Result<T>)
      : ((await post('/api/admin/db', requete)) as Result<T>)) as Result<T>;

    if (!out.error && this.action !== 'select') notifyTable(this.table);
    return out;
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

function from(table: string) {
  return {
    select: (columns = '*') => new Builder(table, 'select').select(columns),
    insert: (values: unknown) => new Builder(table, 'insert', values),
    update: (values: unknown) => new Builder(table, 'update', values),
    delete: () => new Builder(table, 'delete'),
    upsert: (values: unknown) => new Builder(table, 'upsert', values),
  };
}

/** Opérations atomiques côté base (encaissement, réception, annulation). */
async function rpc(fn: string, args: Record<string, unknown> = {}): Promise<Result> {
  const out = MODE_DEMO ? executerRpc(fn, args) : await post('/api/admin/rpc', { fn, args });
  if (!out.error) {
    for (const t of RPC_TOUCHES[fn] ?? []) notifyTable(t);
  }
  return out;
}

// ---- shim « realtime » -----------------------------------------------------
type ChannelHandle = {
  on: (
    event: string,
    filter: { table?: string; [k: string]: unknown },
    cb: () => void,
  ) => ChannelHandle;
  subscribe: () => ChannelHandle;
  _entry?: Entry;
};

function channel(_name?: string): ChannelHandle {
  const regs: Reg[] = [];
  const handle: ChannelHandle = {
    on(_event, filter, cb) {
      if (filter?.table) regs.push({ table: filter.table, cb });
      return handle;
    },
    subscribe() {
      const entry: Entry = {
        regs,
        timer: setInterval(() => fireRegs(regs), POLL_MS),
      };
      handle._entry = entry;
      liveChannels.add(entry);
      return handle;
    },
  };
  return handle;
}

function removeChannel(handle?: ChannelHandle) {
  const entry = handle?._entry;
  if (entry) {
    clearInterval(entry.timer);
    liveChannels.delete(entry);
  }
}

export const db = { from, rpc, channel, removeChannel };

export function uniqueChannel(base: string) {
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
