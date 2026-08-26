'use client';
import { useCallback, useEffect, useState } from 'react';
import { X, Phone, ShoppingBag, Check } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { useFiltres } from '@/lib/filtres';
import { FiltrePeriode } from '@/components/admin/FiltrePeriode';
import { filtrerInstants, libellePeriode, type Periode } from '@/lib/periode';

const RACCOURCIS: Periode[] = ['jour', 'semaine', 'mois', 'tout'];
import { dateTime, qty as fmtQty, xof } from '@/lib/format';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  type DocItem,
  type Order,
  type OrderStatus,
  type PaymentMethod,
} from '@/lib/types';

const CLASSE: Record<OrderStatus, string> = {
  nouvelle: 'badge badge-accent',
  confirmee: 'badge badge-warn',
  prete: 'badge badge-ok',
  retiree: 'badge',
  annulee: 'badge badge-danger',
};

// Enchaînement du comptoir : on confirme qu'on a la marchandise, on prépare,
// puis le client vient retirer — et c'est le retrait qui crée la vente.
const SUIVANT: Partial<Record<OrderStatus, { vers: OrderStatus; libelle: string }>> = {
  nouvelle: { vers: 'confirmee', libelle: 'Confirmer' },
  confirmee: { vers: 'prete', libelle: 'Marquer prête' },
};

const FILTRES: (OrderStatus | 'toutes')[] = [
  'nouvelle',
  'confirmee',
  'prete',
  'retiree',
  'toutes',
];

const MOYENS: PaymentMethod[] = ['especes', 'mobile_money', 'virement', 'cheque'];

export default function CommandesPage() {
  const peutEcrire = useCanWrite('commandes');

  const [commandes, setCommandes] = useState<Order[]>([]);
  const [filtres, setFiltres, filtresPrets] = useFiltres('commandes', {
    statut: 'nouvelle',
    periode: 'tout',
    debut: '',
    fin: '',
  });
  const filtre = filtres.statut as OrderStatus | 'toutes';
  const periode = filtres.periode as Periode;
  const { debut, fin } = filtres;
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouverte, setOuverte] = useState<Order | null>(null);
  const [lignes, setLignes] = useState<DocItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const [retrait, setRetrait] = useState<Order | null>(null);
  const [regle, setRegle] = useState('');
  const [moyen, setMoyen] = useState<PaymentMethod>('especes');

  const load = useCallback(async () => {
    let q = db
      .from('orders')
      .select(
        'id, number, customer_id, customer_name, customer_phone, customer_email, total_xof, status, note, converted_sale_id, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(200);
    if (filtre !== 'toutes') q = q.eq('status', filtre);
    q = filtrerInstants(q, 'created_at', periode, debut, fin);

    const { data, error } = await q;
    setErreur(error?.message ?? null);
    setCommandes((data ?? []) as Order[]);
    setChargement(false);
  }, [filtre, periode, debut, fin]);

  useEffect(() => {
    // Charger avant la restauration du filtre, c'est requêter une première
    // sélection pour rien puis la remplacer sous les yeux de l'utilisateur.
    if (!filtresPrets) return;
    load();
    const ch = db
      .channel(uniqueChannel('commandes'))
      .on('postgres_changes', { table: 'orders' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load, filtresPrets]);

  async function ouvrir(c: Order) {
    setOuverte(c);
    setLignes(null);
    const { data } = await db
      .from('order_items')
      .select(
        'id, product_id, product_name, unit_label, unit_factor, qty, unit_price_xof, line_total_xof',
      )
      .eq('order_id', c.id);
    setLignes((data ?? []) as DocItem[]);
  }

  async function changerStatut(c: Order, vers: OrderStatus) {
    setBusy(true);
    const { error } = await db.from('orders').update({ status: vers }).eq('id', c.id);
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setOuverte(null);
    load();
  }

  function ouvrirRetrait(c: Order) {
    setRetrait(c);
    setRegle(String(c.total_xof));
    setMoyen('especes');
  }

  /**
   * Le retrait crée la vente : c'est là que le stock sort réellement. La
   * commande n'était qu'une intention, elle ne bougeait rien.
   */
  async function convertir(e: React.FormEvent) {
    e.preventDefault();
    if (!retrait) return;
    setBusy(true);
    setErreur(null);

    const { error } = await db.rpc('convert_order_to_sale', {
      p_order_id: retrait.id,
      p_paid_xof: Number(regle.replace(/\D/g, '')) || 0,
      p_method: moyen,
    });

    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setRetrait(null);
    setOuverte(null);
    load();
  }

  const nouvelles = commandes.filter((c) => c.status === 'nouvelle').length;

  return (
    <>
      <PageHeader
        title="Commandes en ligne"
        subtitle={`${
          filtre === 'nouvelle'
            ? `${nouvelles} commande${nouvelles > 1 ? 's' : ''} à traiter`
            : `${commandes.length} commande${commandes.length > 1 ? 's' : ''}`
        } · ${libellePeriode(periode, debut, fin)}`}
        actions={
          <div className="flex flex-col gap-2 md:items-end">
            <div className="flex flex-wrap gap-1">
              {FILTRES.map((f) => (
                <button
                  key={f}
                  onClick={() => setFiltres('statut', f)}
                  className={filtre === f ? 'btn-primary' : 'btn-outline'}
                >
                  {f === 'toutes' ? 'Toutes' : ORDER_STATUS_LABELS[f]}
                </button>
              ))}
            </div>
            <FiltrePeriode
              options={RACCOURCIS}
              periode={periode}
              debut={debut}
              fin={fin}
              onPeriode={(p) => setFiltres('periode', p)}
              onDebut={(v) => setFiltres('debut', v)}
              onFin={(v) => setFiltres('fin', v)}
            />
          </div>
        }
      />

      {erreur && (
        <div
          className="mb-4 border p-3 text-sm"
          style={{
            borderColor: 'rgb(var(--danger) / 0.4)',
            background: 'rgb(var(--danger) / 0.06)',
            color: 'rgb(var(--danger))',
          }}
        >
          {erreur}
        </div>
      )}

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>N°</th>
              <th>Client</th>
              <th>Reçue</th>
              <th>Statut</th>
              <th className="num">Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={6} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : commandes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  <ShoppingBag className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} />
                  Aucune commande
                  {filtre !== 'toutes' && ` « ${ORDER_STATUS_LABELS[filtre]} »`}.
                </td>
              </tr>
            ) : (
              commandes.map((c) => {
                const etape = SUIVANT[c.status];
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        onClick={() => ouvrir(c)}
                        className="font-mono text-[13px] font-medium hover:underline"
                      >
                        {c.number}
                      </button>
                    </td>
                    <td>
                      <div className="font-medium">{c.customer_name}</div>
                      <a
                        href={`tel:${c.customer_phone}`}
                        className="flex items-center gap-1 text-[12px]"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        <Phone className="h-3 w-3" strokeWidth={1.75} />
                        {c.customer_phone}
                      </a>
                    </td>
                    <td className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                      {dateTime(c.created_at)}
                    </td>
                    <td>
                      <span className={CLASSE[c.status]}>
                        {ORDER_STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="num font-semibold">{xof(c.total_xof)}</td>
                    <td className="num">
                      {peutEcrire && etape && (
                        <button
                          onClick={() => changerStatut(c, etape.vers)}
                          className="btn-ghost"
                          disabled={busy}
                        >
                          {etape.libelle}
                        </button>
                      )}
                      {peutEcrire && c.status === 'prete' && (
                        <button onClick={() => ouvrirRetrait(c)} className="btn-primary">
                          <Check className="h-4 w-4" strokeWidth={2} />
                          Retrait
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Détail ---------- */}
      {ouverte && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          onClick={() => setOuverte(null)}
        >
          <div
            className="surface mx-auto my-6 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <div>
                <div className="font-mono font-semibold">{ouverte.number}</div>
                <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {ouverte.customer_name} · {ouverte.customer_phone}
                </div>
              </div>
              <button onClick={() => setOuverte(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {ouverte.note && (
              <p
                className="border-b px-5 py-3 text-[13px]"
                style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--ink-soft))' }}
              >
                « {ouverte.note} »
              </p>
            )}

            {lignes === null ? (
              <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Chargement…
              </p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th className="num">Qté</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <div className="text-[13px] font-medium">{l.product_name}</div>
                        <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                          {l.unit_label} · {xof(l.unit_price_xof)}
                        </div>
                      </td>
                      <td className="num">{fmtQty(l.qty)}</td>
                      <td className="num font-medium">{xof(l.line_total_xof)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div
              className="flex items-center justify-between border-t px-5 py-3 text-lg font-bold"
              style={{ borderColor: 'rgb(var(--line-strong))' }}
            >
              <span>Total</span>
              <span className="tnum">{xof(ouverte.total_xof)}</span>
            </div>

            {peutEcrire && ouverte.status !== 'retiree' && ouverte.status !== 'annulee' && (
              <div
                className="flex flex-wrap justify-end gap-2 border-t px-5 py-3"
                style={{ borderColor: 'rgb(var(--line))' }}
              >
                <button
                  onClick={() => changerStatut(ouverte, 'annulee')}
                  className="btn-danger"
                  disabled={busy}
                >
                  Annuler la commande
                </button>
                {SUIVANT[ouverte.status] && (
                  <button
                    onClick={() => changerStatut(ouverte, SUIVANT[ouverte.status]!.vers)}
                    className="btn-outline"
                    disabled={busy}
                  >
                    {SUIVANT[ouverte.status]!.libelle}
                  </button>
                )}
                {ouverte.status === 'prete' && (
                  <button onClick={() => ouvrirRetrait(ouverte)} className="btn-primary">
                    Encaisser le retrait
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- Retrait → vente ---------- */}
      {retrait && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-4">
          <form onSubmit={convertir} className="surface mt-16 w-full max-w-sm">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Retrait · {retrait.number}</span>
              <button type="button" onClick={() => setRetrait(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                Encaisser crée la vente et sort la marchandise du stock. La fiche
                de {retrait.customer_name} est créée si son numéro est inconnu.
              </p>

              <div className="flex justify-between text-lg font-bold">
                <span>À régler</span>
                <span className="tnum">{xof(retrait.total_xof)}</span>
              </div>

              <div>
                <label className="label">Montant réglé (F)</label>
                <input
                  className="input input-lg"
                  inputMode="numeric"
                  value={regle}
                  onChange={(e) => setRegle(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Un montant inférieur bascule le reste sur l’ardoise du client.
                </p>
              </div>

              <div>
                <label className="label">Moyen de paiement</label>
                <select
                  className="select"
                  value={moyen}
                  onChange={(e) => setMoyen(e.target.value as PaymentMethod)}
                >
                  {MOYENS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setRetrait(null)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Encaissement…' : 'Encaisser et sortir le stock'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
