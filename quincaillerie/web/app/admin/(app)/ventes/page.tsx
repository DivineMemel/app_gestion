'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Eye, Ban } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite, useMember } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { Ticket, type ShopHeader, type TicketData } from '@/components/admin/Ticket';
import { abidjanDayRange, abidjanMonthRange, dateTime, timeShort, xof } from '@/lib/format';
import {
  SALE_STATUS_LABELS,
  type PaymentMethod,
  type Sale,
  type SaleItem,
  type SaleStatus,
} from '@/lib/types';

type Periode = 'jour' | 'mois' | 'tout';

const STATUT_CLASSE: Record<SaleStatus, string> = {
  payee: 'badge badge-ok',
  partielle: 'badge badge-warn',
  credit: 'badge badge-danger',
  annulee: 'badge',
};

export default function VentesPage() {
  const me = useMember();
  const peutAnnuler = useCanWrite('ventes');

  const [ventes, setVentes] = useState<Sale[]>([]);
  const [shop, setShop] = useState<ShopHeader>({ name: 'NADAL MULTISERVICES' });
  const [periode, setPeriode] = useState<Periode>('jour');
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ticket, setTicket] = useState<TicketData | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
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

  const valides = filtrees.filter((v) => v.status !== 'annulee');
  const total = valides.reduce((s, v) => s + v.total_xof, 0);
  const encaisse = valides.reduce((s, v) => s + v.paid_xof, 0);

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

  return (
    <>
      <PageHeader
        title="Ventes"
        subtitle={`${valides.length} vente${valides.length > 1 ? 's' : ''} · ${xof(total)} · ${xof(encaisse)} encaissés`}
        actions={
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
          placeholder="Chercher un ticket ou un client…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Ticket</th>
              <th>Client</th>
              <th>Statut</th>
              <th className="num">Total</th>
              <th className="num">Réglé</th>
              <th className="num">Reste</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={7} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : filtrees.length === 0 ? (
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
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
        Connecté en tant que {me.name}. Une vente annulée reste visible : elle
        n’est jamais supprimée de l’historique.
      </p>

      {ticket && <Ticket data={ticket} shop={shop} onClose={() => setTicket(null)} />}
    </>
  );
}
