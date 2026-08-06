import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember, memberFk } from '@/lib/auth-server';
import { canCallRpc } from '@/lib/permissions';
import { notifySale, notifyLowStock } from '@/lib/notify';

// Opérations qui doivent être atomiques côté base : encaissement, annulation,
// réception fournisseur. Elles touchent plusieurs tables — les faire en
// plusieurs allers-retours laisserait, à la moindre coupure, un stock
// décrémenté sans vente en face.

type Body = { fn?: unknown; args?: unknown };

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
  if (!body || typeof body.fn !== 'string') return fail('Requête invalide.', 400);

  const fn = body.fn;
  if (!canCallRpc(member.role, fn)) {
    return fail('Ton rôle ne permet pas cette opération.', 403);
  }

  const args = (body.args ?? {}) as Record<string, unknown>;
  const admin = supabaseAdmin();
  const me = memberFk(member);

  // L'identité de l'opérateur vient TOUJOURS de la session, jamais du corps de
  // la requête : sinon n'importe qui pourrait signer une vente au nom d'un
  // autre vendeur.
  let payload: Record<string, unknown>;
  if (fn === 'create_sale') {
    const p = (args.p ?? {}) as Record<string, unknown>;
    payload = { p: { ...p, sold_by: me } };
  } else if (fn === 'cancel_sale') {
    payload = { p_sale_id: args.p_sale_id, p_by: me };
  } else if (fn === 'receive_purchase_order') {
    payload = { p_po_id: args.p_po_id, p_by: me };
  } else if (fn === 'convert_order_to_sale') {
    payload = {
      p_order_id: args.p_order_id,
      p_paid_xof: args.p_paid_xof ?? 0,
      p_method: args.p_method ?? 'especes',
      p_by: me,
    };
  } else if (fn === 'convert_quote_to_sale') {
    payload = {
      p_quote_id: args.p_quote_id,
      p_paid_xof: args.p_paid_xof ?? 0,
      p_method: args.p_method ?? 'especes',
      p_by: me,
    };
  } else if (
    fn === 'post_supply_entry' ||
    fn === 'value_supply_entry' ||
    fn === 'cancel_supply_entry'
  ) {
    payload = { p_entry_id: args.p_entry_id, p_by: me };
  } else if (fn === 'open_stock_count') {
    payload = {
      p_category_id: args.p_category_id ?? null,
      p_by: me,
      p_note: args.p_note ?? null,
    };
  } else if (fn === 'validate_stock_count') {
    payload = { p_count_id: args.p_count_id, p_by: me };
  } else {
    return fail('Fonction inconnue.', 400);
  }

  const { data, error } = await admin.rpc(fn, payload);

  if (error) {
    // Les `raise exception` du schéma portent des messages destinés au
    // comptoir (« Stock insuffisant pour Ciment CIMAF : … »). On les remonte
    // tels quels plutôt que de les remplacer par un code technique.
    return fail(error.message, 400);
  }

  // Notifications — hors du chemin critique : une vente encaissée reste
  // encaissée même si l'envoi du push échoue.
  if (fn === 'create_sale' && data) {
    const sale = data as { id?: string; number?: string; total_xof?: number };
    notifySale(sale, member.name).catch(() => {});
    notifyLowStock().catch(() => {});
  }

  return NextResponse.json({ data: data ?? null, error: null });
}
