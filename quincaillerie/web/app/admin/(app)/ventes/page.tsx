'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Eye, Ban } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanSeeCosts, useCanWrite, useMember } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { Ticket, type ShopHeader, type TicketData } from '@/components/admin/Ticket';
import {
  abidjanDayRange,
  abidjanMonthRange,
  abidjanToday,
  dateShort,
  qty as fmtQty,
  timeShort,
  xof,
} from '@/lib/format';
import {
  SALE_STATUS_LABELS,
  type PaymentMethod,
  type Sale,
  type SaleItem,
  type SaleStatus,
  type VenteProduitJour,
} from '@/lib/types';

type Periode = 'jour' | 'mois' | 'tout';
type Vue = 'tickets' | 'produits';

/**
 * Plafond de lignes ramenées pour la vue « par produit ».
 *
 * La vue est au grain jour × produit : un mois tient largement dessous, « tout »
 * finit par le dépasser au bout d'une année d'exploitation. Quand c'est le cas
 * on le DIT à l'écran, et on jette la journée la plus ancienne — sinon elle
 * serait comptée à moitié, ce qui est pire qu'absente.
 */
const MAX_LIGNES_PRODUITS = 5_000;

/**
 * Le code part sur Vercel en deux minutes, la migration se passe à la main dans
 * le SQL editor : entre les deux, la vue n'existe pas. Autant le dire en clair
 * plutôt que d'afficher le message de PostgREST, que personne ne sait lire.
 */
function messageProduits(message: string): string {
  const absente =
    /v_ventes_produits/.test(message) &&
    /(does not exist|schema cache|n'existe pas)/i.test(message);
  return absente
    ? 'Ventes par produit indisponibles : la migration 011 n’est pas encore passée en base.'
    : message;
}

const STATUT_CLASSE: Record<SaleStatus, string> = {
  payee: 'badge badge-ok',
  partielle: 'badge badge-warn',
  credit: 'badge badge-danger',
  annulee: 'badge',
};

/** Un produit sur toute la période, recomposé à partir des lignes du jour. */
type LigneProduit = {
  cle: string;
  product_name: string;
  base_unit: string | null;
  qty: number;
  chiffre: number;
  cout: number;
  marge: number;
  nb_ventes: number;
};

export default function VentesPage() {
  const me = useMember();
  const peutAnnuler = useCanWrite('ventes');
  const voitLesCouts = useCanSeeCosts();

  const [vue, setVue] = useState<Vue>('tickets');
  const [ventes, setVentes] = useState<Sale[]>([]);
  const [produits, setProduits] = useState<VenteProduitJour[]>([]);
  const [tronque, setTronque] = useState<string | null>(null);
  const [shop, setShop] = useState<ShopHeader>({ name: 'NADAL MULTISERVICES' });
  const [periode, setPeriode] = useState<Periode>('jour');
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [busy, setBusy] = useState(false);

  const chargerTickets = useCallback(async () => {
    setChargement(true);
    let q = db
      .from('sales')
      .select(
        'id, number, customer_id, subtotal_xof, discount_xof, total_xof, paid_xof, payment_method, status, channel, note, sold_at, customers(name, phone)',
      )
      .order('sold_at', { ascending: false })
      .limit(300);

    if (periode !== 'tout') {
      const { start, end } =
        periode === 'jour' ? abidjanDayRange() : abidjanMonthRange();
      q = q.gte('sold_at', start).lte('sold_at', end);
    }

    const [v, s] = await Promise.all([
      q,
      db
        .from('shop_settings')
        .select('name, address, phone, invoice_footer')
        .eq('id', 1)
        .maybeSingle(),
    ]);

    setErreur(v.error?.message ?? null);
    setVentes((v.data ?? []) as Sale[]);
    if (s.data) setShop(s.data as ShopHeader);
    setChargement(false);
  }, [periode]);

  /**
   * Les ventes agrégées par produit viennent de `v_ventes_produits`, au grain
   * jour × produit. Le coût et la marge n'y sont présents que pour les rôles
   * qui y ont droit : la passerelle retire ces colonnes pour les autres, et
   * l'écran cesse simplement de les afficher.
   */
  const chargerProduits = useCallback(async () => {
    setChargement(true);
    let q = db
      .from('v_ventes_produits')
      .select(
        'jour, product_id, product_name, base_unit, qty_base, chiffre_xof, cout_xof, marge_xof, nb_ventes',
      )
      .order('jour', { ascending: false })
      .limit(MAX_LIGNES_PRODUITS);

    if (periode !== 'tout') {
      const debut =
        periode === 'jour' ? abidjanToday() : abidjanMonthRange().start.slice(0, 10);
      q = q.gte('jour', debut).lte('jour', abidjanToday());
    }

    const { data, error } = await q;
    let lignes = (data ?? []) as VenteProduitJour[];

    if (lignes.length >= MAX_LIGNES_PRODUITS) {
      const plusAncien = lignes[lignes.length - 1]!.jour;
      lignes = lignes.filter((l) => l.jour !== plusAncien);
      setTronque(lignes[lignes.length - 1]?.jour ?? plusAncien);
    } else {
      setTronque(null);
    }

    setErreur(error ? messageProduits(error.message) : null);
    setProduits(lignes);
    setChargement(false);
  }, [periode]);

  const load = vue === 'tickets' ? chargerTickets : chargerProduits;

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('ventes'))
      .on('postgres_changes', { table: 'sales' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return ventes;
    return ventes.filter(
      (v) =>
        v.number.toLowerCase().includes(q) ||
        (v.customers?.name ?? '').toLowerCase().includes(q),
    );
  }, [ventes, recherche]);

  /** Somme des journées : un même ticket ne peut pas chevaucher deux jours. */
  const parProduit = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const par = new Map<string, LigneProduit>();

    for (const l of produits) {
      if (q && !l.product_name.toLowerCase().includes(q)) continue;
      const cle = l.product_id ?? `nom:${l.product_name}`;
      const e = par.get(cle) ?? {
        cle,
        product_name: l.product_name,
        base_unit: l.base_unit,
        qty: 0,
        chiffre: 0,
        cout: 0,
        marge: 0,
        nb_ventes: 0,
      };
      e.qty += Number(l.qty_base);
      e.chiffre += Number(l.chiffre_xof);
      e.cout += Number(l.cout_xof ?? 0);
      e.marge += Number(l.marge_xof ?? 0);
      e.nb_ventes += Number(l.nb_ventes);
      par.set(cle, e);
    }

    return [...par.values()].sort((a, b) => b.chiffre - a.chiffre);
  }, [produits, recherche]);

  const valides = filtrees.filter((v) => v.status !== 'annulee');
  const total = valides.reduce((s, v) => s + v.total_xof, 0);
  const encaisse = valides.reduce((s, v) => s + v.paid_xof, 0);

  const totalProduits = parProduit.reduce(
    (acc, p) => ({
      chiffre: acc.chiffre + p.chiffre,
      cout: acc.cout + p.cout,
      marge: acc.marge + p.marge,
    }),
    { chiffre: 0, cout: 0, marge: 0 },
  );
  // Le taux de marge se lit sur le chiffre : la part de chaque franc encaissé
  // qui reste une fois la marchandise payée.
  const taux = (marge: number, chiffre: number) =>
    chiffre > 0 ? `${((marge / chiffre) * 100).toFixed(0)} %` : '—';

  const sousTitre =
    vue === 'tickets'
      ? `${valides.length} vente${valides.length > 1 ? 's' : ''} · ${xof(total)} · ${xof(encaisse)} encaissés`
      : `${parProduit.length} produit${parProduit.length > 1 ? 's' : ''} · ${xof(totalProduits.chiffre)}${
          voitLesCouts
            ? ` · marge ${xof(totalProduits.marge)} (${taux(totalProduits.marge, totalProduits.chiffre)})`
            : ''
        }`;

  /** Reconstruit le ticket depuis les lignes stockées, pas depuis le catalogue
   *  actuel : un reçu réimprimé doit montrer les prix du jour de la vente. */
  async function reimprimer(v: Sale) {
    const { data, error } = await db
      .from('sale_items')
      .select('product_name, unit_label, qty, unit_price_xof, line_total_xof')
      .eq('sale_id', v.id);
    if (error) {
      setErreur(error.message);
      return;
    }
    setTicket({
      number: v.number,
      sold_at: v.sold_at,
      customer_name: v.customers?.name ?? null,
      customer_phone: v.customers?.phone ?? null,
      lines: (data ?? []) as SaleItem[],
      subtotal_xof: v.subtotal_xof,
      discount_xof: v.discount_xof,
      total_xof: v.total_xof,
      paid_xof: v.paid_xof,
      payment_method: v.payment_method as PaymentMethod,
      seller: null,
    });
  }

  async function annuler(v: Sale) {
    if (!peutAnnuler) return;
    const ok = window.confirm(
      `Annuler la vente ${v.number} ?\n\nLe stock sera remis et les règlements liés supprimés. Cette opération se voit dans l'historique.`,
    );
    if (!ok) return;

    setBusy(true);
    const { error } = await db.rpc('cancel_sale', { p_sale_id: v.id });
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    load();
  }

  const colonnes = vue === 'tickets' ? 7 : voitLesCouts ? 7 : 4;

  return (
    <>
      <PageHeader
        title="Ventes"
        subtitle={sousTitre}
        actions={
          <>
            <div className="flex gap-1">
              {(['tickets', 'produits'] as Vue[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVue(v)}
                  className={vue === v ? 'btn-solid' : 'btn-outline'}
                >
                  {v === 'tickets' ? 'Par ticket' : 'Par produit'}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {(['jour', 'mois', 'tout'] as Periode[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriode(p)}
                  className={periode === p ? 'btn-primary' : 'btn-outline'}
                >
                  {p === 'jour' ? 'Aujourd’hui' : p === 'mois' ? 'Ce mois' : 'Tout'}
                </button>
              ))}
            </div>
          </>
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

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          strokeWidth={1.75}
          style={{ color: 'rgb(var(--muted))' }}
        />
        <input
          className="input pl-10"
          placeholder={
            vue === 'tickets'
              ? 'Chercher un ticket ou un client…'
              : 'Chercher un produit…'
          }
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            {vue === 'tickets' ? (
              <tr>
                <th>Ticket</th>
                <th>Client</th>
                <th>Statut</th>
                <th className="num">Total</th>
                <th className="num">Réglé</th>
                <th className="num">Reste</th>
                <th></th>
              </tr>
            ) : (
              <tr>
                <th>Produit</th>
                <th className="num">Quantité</th>
                <th className="num">Tickets</th>
                <th className="num">Chiffre</th>
                {voitLesCouts && (
                  <>
                    <th className="num">Coût</th>
                    <th className="num">Marge</th>
                    <th className="num">Taux</th>
                  </>
                )}
              </tr>
            )}
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={colonnes} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : vue === 'tickets' ? (
              filtrees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                    Aucune vente sur cette période.
                  </td>
                </tr>
              ) : (
                filtrees.map((v) => {
                  const reste = Math.max(v.total_xof - v.paid_xof, 0);
                  const annulee = v.status === 'annulee';
                  return (
                    <tr key={v.id} style={annulee ? { opacity: 0.55 } : undefined}>
                      <td>
                        <div className="font-mono text-[13px] font-medium">{v.number}</div>
                        <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                          {timeShort(v.sold_at)}
                          {v.channel === 'en_ligne' && (
                            <span className="ml-1.5 badge">en ligne</span>
                          )}
                        </div>
                      </td>
                      <td>{v.customers?.name ?? 'Comptoir'}</td>
                      <td>
                        <span className={STATUT_CLASSE[v.status]}>
                          {SALE_STATUS_LABELS[v.status]}
                        </span>
                      </td>
                      <td className="num font-semibold">{xof(v.total_xof)}</td>
                      <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                        {xof(v.paid_xof)}
                      </td>
                      <td className="num">
                        {reste > 0 && !annulee ? (
                          <span style={{ color: 'rgb(var(--danger))' }}>{xof(reste)}</span>
                        ) : (
                          <span style={{ color: 'rgb(var(--muted))' }}>—</span>
                        )}
                      </td>
                      <td className="num">
                        <button onClick={() => reimprimer(v)} className="btn-ghost">
                          <Eye className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                        {peutAnnuler && !annulee && (
                          <button
                            onClick={() => annuler(v)}
                            className="btn-ghost"
                            disabled={busy}
                            title="Annuler la vente"
                          >
                            <Ban className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )
            ) : parProduit.length === 0 ? (
              <tr>
                <td colSpan={colonnes} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Aucun produit vendu sur cette période.
                </td>
              </tr>
            ) : (
              <>
                {parProduit.map((p) => (
                  <tr key={p.cle}>
                    <td className="font-medium">{p.product_name}</td>
                    <td className="num">
                      {fmtQty(p.qty)}
                      {p.base_unit && (
                        <span className="ml-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                          {p.base_unit}
                        </span>
                      )}
                    </td>
                    <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                      {p.nb_ventes}
                    </td>
                    <td className="num font-semibold">{xof(p.chiffre)}</td>
                    {voitLesCouts && (
                      <>
                        <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                          {xof(p.cout)}
                        </td>
                        <td
                          className="num font-semibold"
                          style={{
                            color:
                              p.marge >= 0 ? 'rgb(var(--ok))' : 'rgb(var(--danger))',
                          }}
                        >
                          {xof(p.marge)}
                        </td>
                        <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                          {taux(p.marge, p.chiffre)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                <tr>
                  <td className="font-semibold">Total</td>
                  <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                    —
                  </td>
                  <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                    —
                  </td>
                  <td className="num font-semibold">{xof(totalProduits.chiffre)}</td>
                  {voitLesCouts && (
                    <>
                      <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                        {xof(totalProduits.cout)}
                      </td>
                      <td className="num font-semibold">{xof(totalProduits.marge)}</td>
                      <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                        {taux(totalProduits.marge, totalProduits.chiffre)}
                      </td>
                    </>
                  )}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {vue === 'produits' ? (
        <div className="mt-3 space-y-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
          <p>
            Le chiffre par produit est la somme des lignes, avant remise de pied
            de ticket : il peut donc dépasser le total encaissé du même jour.
            {voitLesCouts &&
              ' La marge est calculée sur le prix d’achat figé au moment de la vente.'}
          </p>
          {tronque && (
            <p style={{ color: 'rgb(var(--warn))' }}>
              Historique trop long pour une seule requête : seules les ventes
              depuis le {dateShort(tronque)} sont additionnées ici.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
          Connecté en tant que {me.name}. Une vente annulée reste visible : elle
          n’est jamais supprimée de l’historique.
        </p>
      )}

      {ticket && <Ticket data={ticket} shop={shop} onClose={() => setTicket(null)} />}
    </>
  );
}
