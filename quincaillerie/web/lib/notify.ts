import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-server';
import { xof } from '@/lib/format';

// Notifications push — serveur uniquement.
//
// Aucun envoi n'est bloquant : une vente encaissée reste encaissée même si le
// push part en erreur. Tous les appels sont donc à faire en « fire and forget »
// avec un .catch(), jamais dans le chemin critique de l'encaissement.

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';

let configured = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!configured) return; // clés VAPID absentes → fonctionnalité simplement inactive

  const db = supabaseAdmin();
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');
  if (!subs?.length) return;

  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
        );
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 : l'abonnement est mort (app désinstallée, navigateur purgé).
        // On le supprime, sinon la table se remplit d'endpoints fantômes.
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('[push] échec', code, (e as Error)?.message);
        }
      }
    }),
  );
}

/** « Vente V-2026-00042 — 45 000 F par Awa ». */
export async function notifySale(
  sale: { id?: string; number?: string; total_xof?: number },
  byName: string,
): Promise<void> {
  await sendPushToAll({
    title: `Vente ${sale.number ?? ''} — ${xof(sale.total_xof ?? 0)}`,
    body: `Encaissée par ${byName}`,
    url: sale.id ? `/admin/ventes?v=${sale.id}` : '/admin/ventes',
    tag: `sale-${sale.id ?? sale.number ?? 'x'}`,
  });
}

export async function notifyOrder(order: {
  id?: string;
  number?: string;
  customer_name?: string;
  total_xof?: number;
}): Promise<void> {
  await sendPushToAll({
    title: `Commande en ligne ${order.number ?? ''}`,
    body: `${order.customer_name ?? 'Client'} — ${xof(order.total_xof ?? 0)}`,
    url: '/admin/commandes',
    tag: `order-${order.id ?? order.number ?? 'x'}`,
  });
}

/**
 * Alerte les produits qui viennent de passer sous leur seuil, une seule fois
 * par descente. Sans ce garde, chaque vente d'un article déjà bas renverrait
 * la même alerte et le patron finirait par couper les notifications.
 */
export async function notifyLowStock(): Promise<void> {
  const db = supabaseAdmin();

  const { data: low } = await db
    .from('v_low_stock')
    .select('id, name, stock_qty, base_unit, min_stock, low_stock_alerted_at');
  if (!low) return;

  // Réarmement : tout produit marqué comme alerté mais qui n'est plus sous le
  // seuil (réception, correction d'inventaire) redevient alertable.
  const lowIds = new Set(low.map((p) => p.id as string));
  const { data: flagged } = await db
    .from('products')
    .select('id')
    .not('low_stock_alerted_at', 'is', null);
  const toReset = (flagged ?? [])
    .map((p) => p.id as string)
    .filter((id) => !lowIds.has(id));
  if (toReset.length) {
    await db
      .from('products')
      .update({ low_stock_alerted_at: null })
      .in('id', toReset);
  }

  const fresh = low.filter((p) => !p.low_stock_alerted_at);
  if (!fresh.length) return;

  await db
    .from('products')
    .update({ low_stock_alerted_at: new Date().toISOString() })
    .in('id', fresh.map((p) => p.id as string));

  if (fresh.length === 1) {
    const p = fresh[0];
    await sendPushToAll({
      title: `Stock bas — ${p.name}`,
      body: `Il reste ${p.stock_qty} ${p.base_unit} (seuil ${p.min_stock}).`,
      url: '/admin/stock',
      tag: `low-${p.id}`,
    });
  } else {
    await sendPushToAll({
      title: `${fresh.length} articles sous le seuil`,
      body: fresh.map((p) => p.name).slice(0, 4).join(', '),
      url: '/admin/stock',
      tag: 'low-batch',
    });
  }
}
