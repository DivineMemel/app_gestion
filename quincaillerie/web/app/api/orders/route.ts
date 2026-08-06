import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import { notifyOrder } from '@/lib/notify';

// Commande passée depuis la vitrine. Route publique : tout ce qui vient du
// navigateur est traité comme hostile.
//
// Deux règles importantes :
//  1. Les PRIX sont relus en base. Le client envoie des identifiants et des
//     quantités, jamais des montants — sinon n'importe qui commande un sac de
//     ciment à 1 F en modifiant la requête.
//  2. Le STOCK n'est pas décrémenté. Une commande est une intention de retrait ;
//     c'est la vente encaissée au comptoir qui sortira la marchandise.

type Payload = {
  customer: { name?: string; phone?: string; email?: string | null };
  note?: string | null;
  items?: Array<{ product_id?: string; unit_label?: string; qty?: number }>;
};

function refus(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return refus('Base de données non configurée sur ce déploiement.', 503);
  }

  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return refus('Requête invalide.');
  }

  const nom = body.customer?.name?.trim() ?? '';
  const tel = body.customer?.phone?.replace(/\s+/g, '') ?? '';
  const email = body.customer?.email?.trim() || null;
  const items = Array.isArray(body.items) ? body.items : [];

  if (nom.length < 2) return refus('Indiquez votre nom.');
  if (tel.length < 8) return refus('Indiquez un numéro de téléphone valide.');
  if (items.length === 0) return refus('Votre panier est vide.');
  if (items.length > 100) return refus('Trop d’articles dans une seule commande.');

  const db = supabaseAdmin();

  const { data: settings } = await db
    .from('shop_settings')
    .select('online_orders_open')
    .eq('id', 1)
    .maybeSingle();
  if (settings && settings.online_orders_open === false) {
    return refus('Les commandes en ligne sont momentanément fermées.', 503);
  }

  // Relecture des produits et de leurs unités : seule source de vérité pour
  // les prix et pour ce qui est réellement publié.
  const ids = [...new Set(items.map((i) => i.product_id).filter(Boolean))] as string[];
  const { data: produits, error: prodErr } = await db
    .from('products')
    .select('id, name, active, published, product_units(label, factor, price_xof)')
    .in('id', ids);
  if (prodErr) return refus('Catalogue indisponible.', 500);

  type Prod = {
    id: string;
    name: string;
    active: boolean;
    published: boolean;
    product_units: { label: string; factor: number; price_xof: number }[];
  };
  const parId = new Map((produits ?? []).map((p) => [p.id, p as Prod]));

  const lignes: Array<{
    product_id: string;
    product_name: string;
    unit_label: string;
    unit_factor: number;
    qty: number;
    unit_price_xof: number;
    line_total_xof: number;
  }> = [];
  let total = 0;

  for (const item of items) {
    const p = item.product_id ? parId.get(item.product_id) : undefined;
    if (!p || !p.active || !p.published) {
      return refus('Un article de votre panier n’est plus disponible.');
    }
    const unite = p.product_units.find((u) => u.label === item.unit_label);
    if (!unite) return refus(`Conditionnement inconnu pour ${p.name}.`);

    const qte = Number(item.qty);
    if (!Number.isFinite(qte) || qte <= 0 || qte > 10_000) {
      return refus(`Quantité invalide pour ${p.name}.`);
    }

    const ligne = Math.round(qte * Number(unite.price_xof));
    total += ligne;
    lignes.push({
      product_id: p.id,
      product_name: p.name,
      unit_label: unite.label,
      unit_factor: Number(unite.factor),
      qty: qte,
      unit_price_xof: Number(unite.price_xof),
      line_total_xof: ligne,
    });
  }

  const { data: commande, error: cmdErr } = await db
    .from('orders')
    .insert({
      customer_name: nom,
      customer_phone: tel,
      customer_email: email,
      total_xof: total,
      note: body.note?.trim() || null,
      status: 'nouvelle',
    })
    .select('id, number, total_xof')
    .single();

  if (cmdErr || !commande) return refus('Enregistrement impossible.', 500);

  const { error: itemsErr } = await db
    .from('order_items')
    .insert(lignes.map((l) => ({ ...l, order_id: commande.id })));

  if (itemsErr) {
    // Une commande sans lignes n'a aucun sens : on la retire plutôt que de
    // laisser un bon vide côté comptoir.
    await db.from('orders').delete().eq('id', commande.id);
    return refus('Enregistrement impossible.', 500);
  }

  notifyOrder({
    id: commande.id,
    number: commande.number,
    customer_name: nom,
    total_xof: commande.total_xof,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    order: { number: commande.number, total_xof: commande.total_xof },
  });
}
