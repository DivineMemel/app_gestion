'use client';

/**
 * Remplaçant « drop-in » du client Supabase anon, réservé à l'admin.
 *
 * Toutes les requêtes passent par /api/admin/db (route serveur authentifiée par
 * le cookie muse_admin) qui exécute en service_role. La RLS reste donc activée
 * et la clé anon publique (exposée au navigateur) n'a aucun accès à la base.
 *
 * L'API publique reproduit le sous-ensemble de supabase-js utilisé par les
 * pages admin : .from(table).select()/.insert()/.update()/.delete()/.upsert(),
 * filtres .eq/.neq/.gt/.gte/.lt/.lte, .order(), .limit(), .single().
 *
 * channel()/removeChannel() remplacent le temps réel : après chaque mutation
 * réussie le callback de la page (load) est rappelé immédiatement, et un poll
 * lent capte les lignes créées ailleurs (ex : réservations du site public).
 */

type OrderOpts = { ascending?: boolean; nullsFirst?: boolean };
type FilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
type Filter = { op: FilterOp; column: string; value: unknown };
type OrderSpec = { column: string; ascending: boolean; nullsFirst?: boolean };
type Action = 'select' | 'insert' | 'update' | 'delete' | 'upsert';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result<T = any> = { data: T; error: { message: string } | null };
// data est volontairement typé `any` (comme supabase-js sur ce chemin) pour
// rester un drop-in : les pages castent ensuite vers leurs types métier.

const POLL_MS = 20_000;

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

// ---- query builder ---------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class Builder<T = any> implements PromiseLike<Result<T>> {
  private _select?: string;
  private _filters: Filter[] = [];
  private _order: OrderSpec[] = [];
  private _limit?: number;
  private _single = false;
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

  private async exec(): Promise<Result<T>> {
    let res: Response;
    try {
      res = await fetch('/api/admin/db', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          table: this.table,
          action: this.action,
          values: this.values ?? null,
          select: this._select ?? null,
          filters: this._filters,
          order: this._order,
          limit: this._limit ?? null,
          single: this._single,
          returning: this._returning,
        }),
      });
    } catch {
      return { data: null as T, error: { message: 'network_error' } };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      /* corps vide ou non-JSON */
    }

    if (!res.ok) {
      const message = json?.error?.message ?? `http_${res.status}`;
      return { data: null as T, error: { message } };
    }

    const out: Result<T> = {
      data: (json?.data ?? null) as T,
      error: json?.error ?? null,
    };
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

export const supabase = { from, channel, removeChannel };

export function uniqueChannel(base: string) {
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
