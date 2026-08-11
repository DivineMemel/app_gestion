import type { SupabaseClient } from '@supabase/supabase-js';
import type { Member } from '@/lib/auth-server';

/**
 * Journal d'audit des mutations passées par /api/admin/db.
 *
 * `stock_movements` raconte déjà l'histoire de la marchandise. Il manquait
 * celle des décisions : qui a changé un prix de vente, désactivé un article,
 * relevé un plafond d'ardoise. C'est ce qu'on cherche le jour d'un litige, et
 * c'est précisément ce qu'aucune table ne conservait.
 *
 * L'écriture est hors du chemin critique : une vente enregistrée reste
 * enregistrée même si le journal tombe. L'inverse — refuser l'opération parce
 * que le journal est indisponible — bloquerait la caisse pour une raison que
 * personne au comptoir ne peut comprendre.
 */

const SECRETS = ['password_hash', 'p256dh', 'auth'];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function redact(values: any): unknown {
  if (values == null || typeof values !== 'object') return values ?? null;
  const clean = (row: Record<string, unknown>) => {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      copy[k] = SECRETS.includes(k) ? '***' : v;
    }
    return copy;
  };
  return Array.isArray(values) ? values.map(clean) : clean(values as Record<string, unknown>);
}

/** Identifiants des lignes touchées, quand la réponse les contient. */
function rowIds(data: unknown): string[] | null {
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const ids = rows
    .map((r) => (r && typeof r === 'object' ? (r as Record<string, unknown>).id : null))
    .filter((v): v is string | number => v != null)
    .map(String);
  return ids.length > 0 ? ids : null;
}

export type AuditEntry = {
  action: string;
  table: string;
  filters?: unknown;
  values?: unknown;
  data?: unknown;
  ok: boolean;
  error?: string | null;
};

/**
 * `member` vaut null pour ce qui vient de l'extérieur — une auto-inscription,
 * par exemple. Ces événements-là méritent une trace autant que les autres :
 * c'est même le seul moyen de voir passer une vague de faux comptes.
 */
export async function logAudit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any, any, any>,
  member: Member | null,
  entry: AuditEntry,
): Promise<void> {
  try {
    await admin.from('audit_log').insert({
      member_id: member?.id ?? null,
      member_name: member?.name ?? 'Inscription publique',
      member_role: member?.roles.join(', ') ?? null,
      action: entry.action,
      table_name: entry.table,
      filters: entry.filters ?? null,
      changes: redact(entry.values),
      row_ids: rowIds(entry.data),
      ok: entry.ok,
      error: entry.error ?? null,
    });
  } catch {
    /* le journal ne doit jamais faire échouer l'opération qu'il décrit */
  }
}
