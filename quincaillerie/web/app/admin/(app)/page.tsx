'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ScanBarcode,
  Receipt,
  AlertTriangle,
  ShoppingBag,
  Wallet,
  TrendingUp,
  ArrowRight,
} from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useMember } from '@/lib/member';
import { canView, canSeeCosts } from '@/lib/permissions';
import { PageHeader } from '@/components/admin/PageHeader';
import { PushBanner } from '@/components/admin/PushBanner';
import { abidjanDayRange, dateShort, timeShort, xof } from '@/lib/format';
import type { LowStockRow, Sale } from '@/lib/types';

type Stats = {
  caJour: number;
  nbVentes: number;
  encaisseJour: number;
  ardoises: number;
  nbArdoises: number;
  stockBas: LowStockRow[];
  commandes: number;
  margeMois: number | null;
};

const VIDE: Stats = {
  caJour: 0,
  nbVentes: 0,
  encaisseJour: 0,
  ardoises: 0,
  nbArdoises: 0,
  stockBas: [],
  commandes: 0,
  margeMois: null,
};

export default function DashboardPage() {
  const me = useMember();
  const voitFinances = canView(me.role, 'comptabilite');
  const voitCouts = canSeeCosts(me.role);
  const voitComptoir = canView(me.role, 'ventes');

  const [stats, setStats] = useState<Stats>(VIDE);
  const [dernieres, setDernieres] = useState<Sale[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const load = useCallback(async () => {
    const { start, end } = abidjanDayRange();
    const next: Stats = { ...VIDE };
    let firstError: string | null = null;
    const note = (m?: string) => {
      if (m && !firstError) firstError = m;
    };

    // Le magasinier n'a pas accès aux ventes : on ne lance même pas la requête,
    // sinon il verrait un bandeau d'erreur permanent sur son tableau de bord.
    if (voitComptoir) {
      const [ventes, reglements, soldes, cmd] = await Promise.all([
        db
          .from('sales')
          .select('id, number, total_xof, status, sold_at, customers(name, phone)')
          .gte('sold_at', start)
          .lte('sold_at', end)
          .order('sold_at', { ascending: false }),
        db.from('payments').select('amount_xof').gte('paid_at', start).lte('paid_at', end),
        db.from('v_customer_balances').select('solde_xof'),
        db.from('orders').select('id').eq('status', 'nouvelle'),
      ]);

      note(ventes.error?.message);
      note(reglements.error?.message);
      note(soldes.error?.message);
      note(cmd.error?.message);

      const lignes = (ventes.data ?? []) as Sale[];
      const valides = lignes.filter((v) => v.status !== 'annulee');
      next.caJour = valides.reduce((s, v) => s + (v.total_xof ?? 0), 0);
      next.nbVentes = valides.length;
      setDernieres(lignes.slice(0, 6));

      next.encaisseJour = (reglements.data ?? []).reduce(
        (s: number, p: { amount_xof: number }) => s + (p.amount_xof ?? 0),
        0,
      );

      const dus = (soldes.data ?? []).filter(
        (c: { solde_xof: number }) => (c.solde_xof ?? 0) > 0,
      );
      next.ardoises = dus.reduce(
        (s: number, c: { solde_xof: number }) => s + c.solde_xof,
        0,
      );
      next.nbArdoises = dus.length;
      next.commandes = (cmd.data ?? []).length;
    }

    const bas = await db
      .from('v_low_stock')
      .select('id, sku, name, base_unit, stock_qty, min_stock, category_name')
      .limit(6);
    note(bas.error?.message);
    next.stockBas = (bas.data ?? []) as LowStockRow[];

    if (voitFinances && voitCouts) {
      const pnl = await db
        .from('v_monthly_pnl')
        .select('mois, marge_brute_xof')
        .limit(1);
      note(pnl.error?.message);
      const row = (pnl.data ?? [])[0] as { marge_brute_xof: number } | undefined;
      next.margeMois = row?.marge_brute_xof ?? 0;
    }

    setStats(next);
    setErreur(firstError);
    setChargement(false);
  }, [voitComptoir, voitFinances, voitCouts]);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('dashboard'))
      .on('postgres_changes', { table: 'sales' }, load)
      .on('postgres_changes', { table: 'orders' }, load)
      .on('postgres_changes', { table: 'products' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  return (
    <>
      <PageHeader
        title={`Bonjour ${me.name.split(' ')[0]}`}
        subtitle={dateShort(new Date().toISOString())}
        actions={
          canView(me.role, 'caisse') ? (
            <Link href="/admin/caisse" className="btn-primary">
              <ScanBarcode className="h-4 w-4" strokeWidth={2} />
              Nouvelle vente
            </Link>
          ) : null
        }
      />

      <PushBanner />

      {erreur && (
        <div
          className="mb-6 border p-4 text-sm"
          style={{
            borderColor: 'rgb(var(--danger) / 0.4)',
            background: 'rgb(var(--danger) / 0.06)',
            color: 'rgb(var(--danger))',
          }}
        >
          <strong>Lecture partielle.</strong> {erreur}
          <div className="mt-1 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
            Si la migration 001 n’a pas encore été passée dans Supabase, c’est
            attendu — les tables n’existent pas.
          </div>
        </div>
      )}

      {/* ---- Chiffres du jour ---- */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {voitComptoir && (
          <>
            <Stat
              icon={<Receipt className="h-4 w-4" strokeWidth={1.75} />}
              label="Chiffre du jour"
              value={xof(stats.caJour)}
              hint={`${stats.nbVentes} vente${stats.nbVentes > 1 ? 's' : ''}`}
              href="/admin/ventes"
            />
            <Stat
              icon={<Wallet className="h-4 w-4" strokeWidth={1.75} />}
              label="Encaissé aujourd’hui"
              value={xof(stats.encaisseJour)}
              hint="Espèces, mobile money, virements"
            />
            <Stat
              icon={<Wallet className="h-4 w-4" strokeWidth={1.75} />}
              label="Ardoises en cours"
              value={xof(stats.ardoises)}
              hint={`${stats.nbArdoises} client${stats.nbArdoises > 1 ? 's' : ''} à relancer`}
              href="/admin/clients"
              alert={stats.ardoises > 0}
            />
          </>
        )}
        <Stat
          icon={<AlertTriangle className="h-4 w-4" strokeWidth={1.75} />}
          label="Alertes stock"
          value={String(stats.stockBas.length)}
          hint="Articles sous le seuil"
          href="/admin/stock"
          alert={stats.stockBas.length > 0}
        />
        {voitComptoir && (
          <Stat
            icon={<ShoppingBag className="h-4 w-4" strokeWidth={1.75} />}
            label="Commandes en ligne"
            value={String(stats.commandes)}
            hint="À traiter"
            href="/admin/commandes"
            alert={stats.commandes > 0}
          />
        )}
        {stats.margeMois !== null && (
          <Stat
            icon={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
            label="Marge brute du mois"
            value={xof(stats.margeMois)}
            hint="Chiffre − coût des marchandises"
            href="/admin/comptabilite"
          />
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* ---- Stock bas ---- */}
        <section>
          <SectionTitle
            title="À recommander"
            href={canView(me.role, 'stock') ? '/admin/stock' : undefined}
          />
          <div className="surface">
            {chargement ? (
              <Vide texte="Chargement…" />
            ) : stats.stockBas.length === 0 ? (
              <Vide texte="Aucun article sous son seuil. Le dépôt est à jour." />
            ) : (
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Article</th>
                      <th className="num">Restant</th>
                      <th className="num">Seuil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.stockBas.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="font-medium">{p.name}</div>
                          {p.category_name && (
                            <div
                              className="text-[12px]"
                              style={{ color: 'rgb(var(--muted))' }}
                            >
                              {p.category_name}
                            </div>
                          )}
                        </td>
                        <td className="num">
                          <span
                            className={p.stock_qty <= 0 ? 'badge badge-danger' : 'badge badge-warn'}
                          >
                            {p.stock_qty} {p.base_unit}
                          </span>
                        </td>
                        <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                          {p.min_stock}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ---- Dernières ventes ---- */}
        {voitComptoir && (
          <section>
            <SectionTitle title="Dernières ventes" href="/admin/ventes" />
            <div className="surface">
              {chargement ? (
                <Vide texte="Chargement…" />
              ) : dernieres.length === 0 ? (
                <Vide texte="Aucune vente aujourd’hui." />
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Ticket</th>
                        <th>Client</th>
                        <th className="num">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dernieres.map((v) => (
                        <tr key={v.id}>
                          <td>
                            <div className="font-mono text-[13px]">{v.number}</div>
                            <div
                              className="text-[12px]"
                              style={{ color: 'rgb(var(--muted))' }}
                            >
                              {timeShort(v.sold_at)}
                            </div>
                          </td>
                          <td>{v.customers?.name ?? 'Comptoir'}</td>
                          <td className="num">
                            <div className="font-semibold">{xof(v.total_xof)}</div>
                            {v.status !== 'payee' && (
                              <span
                                className={
                                  v.status === 'annulee'
                                    ? 'badge'
                                    : 'badge badge-warn'
                                }
                              >
                                {v.status === 'annulee' ? 'Annulée' : 'Ardoise'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  href,
  alert,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  alert?: boolean;
}) {
  const body = (
    <div
      className="surface h-full p-4 transition-colors"
      style={alert ? { borderColor: 'rgb(var(--accent) / 0.5)' } : undefined}
    >
      <div
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-industrial"
        style={{ color: alert ? 'rgb(var(--accent))' : 'rgb(var(--muted))' }}
      >
        {icon}
        {label}
      </div>
      <div className="tnum mt-2 text-2xl font-semibold">{value}</div>
      {hint && (
        <div className="mt-0.5 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
          {hint}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function SectionTitle({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="eyebrow">{title}</h2>
      {href && (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-[12px] font-semibold"
          style={{ color: 'rgb(var(--accent))' }}
        >
          Tout voir <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      )}
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <p className="p-6 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
      {texte}
    </p>
  );
}
