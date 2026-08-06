'use client';
import { useCallback, useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Package, Wallet } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { PageHeader } from '@/components/admin/PageHeader';
import { monthLabel, qty as fmtQty, xof } from '@/lib/format';
import type { MonthlyPnl } from '@/lib/types';

type TopProduit = {
  product_id: string | null;
  product_name: string;
  qty_base_vendue: number;
  chiffre_xof: number;
  nb_ventes: number;
};

export default function ComptabilitePage() {
  const [mois, setMois] = useState<MonthlyPnl[]>([]);
  const [top, setTop] = useState<TopProduit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([
      db.from('v_monthly_pnl').select('*').limit(18),
      db.from('v_top_products').select('*').limit(10),
    ]);
    setErreur(p.error?.message ?? t.error?.message ?? null);
    setMois((p.data ?? []) as MonthlyPnl[]);
    setTop((t.data ?? []) as TopProduit[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('compta'))
      .on('postgres_changes', { table: 'sales' }, load)
      .on('postgres_changes', { table: 'expenses' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const courant = mois[0];
  // Le taux de marge se lit sur le chiffre, pas sur le coût : c'est la part de
  // chaque franc encaissé qui reste après avoir payé la marchandise.
  const tauxMarge =
    courant && courant.chiffre_xof > 0
      ? (courant.marge_brute_xof / courant.chiffre_xof) * 100
      : null;

  return (
    <>
      <PageHeader
        title="Comptabilité"
        subtitle={courant ? monthLabel(courant.mois) : 'Compte d’exploitation mensuel'}
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

      {chargement ? (
        <p className="surface p-10 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Chargement…
        </p>
      ) : mois.length === 0 ? (
        <p className="surface p-10 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Aucun mouvement enregistré pour l’instant. Le compte d’exploitation se
          remplira dès la première vente.
        </p>
      ) : (
        <>
          {/* ---------- Mois courant ---------- */}
          {courant && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Bloc
                icone={<TrendingUp className="h-4 w-4" strokeWidth={1.75} />}
                label="Chiffre d’affaires"
                valeur={xof(courant.chiffre_xof)}
              />
              <Bloc
                icone={<Package className="h-4 w-4" strokeWidth={1.75} />}
                label="Coût des marchandises"
                valeur={xof(courant.cout_marchandises_xof)}
                aide={tauxMarge !== null ? `marge ${tauxMarge.toFixed(0)} %` : undefined}
              />
              <Bloc
                icone={<Wallet className="h-4 w-4" strokeWidth={1.75} />}
                label="Dépenses"
                valeur={xof(courant.depenses_xof)}
              />
              <Bloc
                icone={
                  courant.resultat_xof >= 0 ? (
                    <TrendingUp className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <TrendingDown className="h-4 w-4" strokeWidth={1.75} />
                  )
                }
                label="Résultat"
                valeur={xof(courant.resultat_xof)}
                negatif={courant.resultat_xof < 0}
              />
            </div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
            {/* ---------- Historique ---------- */}
            <section>
              <h2 className="eyebrow mb-2">Par mois</h2>
              <div className="surface tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Mois</th>
                      <th className="num">Chiffre</th>
                      <th className="num">Marchandises</th>
                      <th className="num">Marge brute</th>
                      <th className="num">Dépenses</th>
                      <th className="num">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mois.map((m) => (
                      <tr key={m.mois}>
                        <td className="font-medium">{monthLabel(m.mois)}</td>
                        <td className="num">{xof(m.chiffre_xof)}</td>
                        <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                          {xof(m.cout_marchandises_xof)}
                        </td>
                        <td className="num">{xof(m.marge_brute_xof)}</td>
                        <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                          {xof(m.depenses_xof)}
                        </td>
                        <td
                          className="num font-semibold"
                          style={{
                            color:
                              m.resultat_xof >= 0
                                ? 'rgb(var(--ok))'
                                : 'rgb(var(--danger))',
                          }}
                        >
                          {xof(m.resultat_xof)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                Le coût des marchandises est figé au moment de la vente : changer
                un prix d’achat aujourd’hui ne réécrit pas les mois passés.
              </p>
            </section>

            {/* ---------- Meilleures ventes ---------- */}
            <section>
              <h2 className="eyebrow mb-2">Meilleures ventes · 90 jours</h2>
              <div className="surface">
                {top.length === 0 ? (
                  <p className="p-6 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                    Pas encore de ventes.
                  </p>
                ) : (
                  <ul>
                    {top.map((t, i) => (
                      <li
                        key={`${t.product_id ?? t.product_name}-${i}`}
                        className="flex items-baseline justify-between gap-3 border-b px-4 py-2.5 last:border-b-0"
                        style={{ borderColor: 'rgb(var(--line))' }}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium">
                            {t.product_name}
                          </div>
                          <div
                            className="text-[12px]"
                            style={{ color: 'rgb(var(--muted))' }}
                          >
                            {fmtQty(t.qty_base_vendue)} unités · {t.nb_ventes} vente
                            {t.nb_ventes > 1 ? 's' : ''}
                          </div>
                        </div>
                        <span className="tnum shrink-0 text-[13px] font-semibold">
                          {xof(t.chiffre_xof)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Bloc({
  icone,
  label,
  valeur,
  aide,
  negatif,
}: {
  icone: React.ReactNode;
  label: string;
  valeur: string;
  aide?: string;
  negatif?: boolean;
}) {
  return (
    <div className="surface p-4">
      <div
        className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-industrial"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {icone}
        {label}
      </div>
      <div
        className="tnum mt-2 text-2xl font-semibold"
        style={negatif ? { color: 'rgb(var(--danger))' } : undefined}
      >
        {valeur}
      </div>
      {aide && (
        <div className="mt-0.5 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
          {aide}
        </div>
      )}
    </div>
  );
}
