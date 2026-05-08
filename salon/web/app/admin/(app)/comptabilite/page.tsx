'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { MonthlyPnL, ExpenseCategory } from '@/lib/types';

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

function monthLabel(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}

type ExpenseRow = {
  category_id: string | null;
  amount_xof: number;
  paid_at: string;
};

export default function ComptabilitePage() {
  const [pnl, setPnl] = useState<MonthlyPnL[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: e }, { data: c }] = await Promise.all([
        supabase
          .from('monthly_pnl')
          .select('*')
          .order('month', { ascending: false })
          .limit(12),
        supabase
          .from('expenses')
          .select('category_id, amount_xof, paid_at')
          .order('paid_at', { ascending: false }),
        supabase.from('expense_categories').select('*').order('display_order'),
      ]);
      setPnl((p as MonthlyPnL[]) || []);
      setExpenses((e as ExpenseRow[]) || []);
      setCats((c as ExpenseCategory[]) || []);
      setLoading(false);
    })();
  }, []);

  const current = pnl[0];
  const previous = pnl[1];

  const trend = useMemo(() => {
    if (!current || !previous) return null;
    const delta = current.profit_xof - previous.profit_xof;
    const pct =
      previous.profit_xof !== 0
        ? Math.round((delta / Math.abs(previous.profit_xof)) * 100)
        : null;
    return { delta, pct };
  }, [current, previous]);

  // Répartition des dépenses du mois courant par catégorie
  const breakdown = useMemo(() => {
    if (!current) return [];
    const monthStart = new Date(current.month);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const inMonth = expenses.filter((e) => {
      const d = new Date(e.paid_at);
      return d >= monthStart && d < monthEnd;
    });
    const total = inMonth.reduce((s, e) => s + e.amount_xof, 0);
    const byCat = new Map<string | null, number>();
    inMonth.forEach((e) => {
      byCat.set(e.category_id, (byCat.get(e.category_id) ?? 0) + e.amount_xof);
    });
    return Array.from(byCat.entries())
      .map(([id, amount]) => ({
        id,
        name: cats.find((c) => c.id === id)?.name ?? 'Sans catégorie',
        amount,
        pct: total > 0 ? Math.round((amount / total) * 100) : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [current, expenses, cats]);

  function exportCsv() {
    const rows = [
      ['Mois', 'Chiffre (FCFA)', 'Dépenses (FCFA)', 'Bénéfice (FCFA)'].join(','),
      ...pnl.map((p) =>
        [
          new Date(p.month).toISOString().slice(0, 7),
          p.revenue_xof,
          p.expenses_xof,
          p.profit_xof,
        ].join(','),
      ),
    ].join('\n');
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `muse-pnl-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Finances"
        title="Comptabilité"
        italic="—"
        description="Vue P&L mensuelle. Bénéfice = chiffre encaissé − dépenses payées."
        right={
          <button
            onClick={exportCsv}
            className="btn-primary"
            disabled={pnl.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        }
      />

      {/* Mois courant — vue grand format */}
      {current ? (
        <section
          className="surface px-8 py-10 md:px-12"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div className="eyebrow">{monthLabel(current.month)}</div>
            {trend && (
              <div
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em]"
                style={{
                  color: trend.delta >= 0 ? '#1f6c3a' : '#a52a2a',
                }}
              >
                {trend.delta >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                )}
                {trend.delta >= 0 ? '+' : ''}
                {fmt(trend.delta)} FCFA vs mois dernier
                {trend.pct !== null && ` (${trend.pct >= 0 ? '+' : ''}${trend.pct}%)`}
              </div>
            )}
          </div>

          <div className="mt-8 grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
            <BigStat
              label="Chiffre encaissé"
              value={fmt(current.revenue_xof)}
              icon={TrendingUp}
            />
            <BigStat
              label="Dépenses payées"
              value={fmt(current.expenses_xof)}
              icon={TrendingDown}
              danger
            />
            <BigStat
              label="Bénéfice net"
              value={fmt(current.profit_xof)}
              accent={current.profit_xof >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* Répartition dépenses par catégorie */}
          {breakdown.length > 0 && (
            <div className="mt-10">
              <div
                className="mb-4 text-[10px] uppercase tracking-[0.24em]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Répartition des dépenses
              </div>
              <div className="space-y-3">
                {breakdown.map((b) => (
                  <div key={b.id ?? 'none'} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span>{b.name}</span>
                      <span className="tabular-nums" style={{ color: 'rgb(var(--ink-soft))' }}>
                        {fmt(b.amount)} FCFA
                        <span
                          className="ml-2 text-[11px]"
                          style={{ color: 'rgb(var(--muted))' }}
                        >
                          {b.pct}%
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-px overflow-hidden"
                      style={{ background: 'rgb(var(--surface-2))' }}
                    >
                      <div
                        className="h-full"
                        style={{
                          width: `${b.pct}%`,
                          background: 'rgb(var(--ink))',
                          transition: 'width 600ms ease',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <div
          className="border border-dashed py-16 text-center text-[13px]"
          style={{
            borderColor: 'rgb(var(--line))',
            color: 'rgb(var(--muted))',
          }}
        >
          {loading
            ? 'Chargement…'
            : "Aucune activité encore. Enregistre une vente ou une dépense pour voir le P&L apparaître."}
        </div>
      )}

      {/* Historique 12 mois */}
      {pnl.length > 1 && (
        <section>
          <div className="eyebrow mb-4">Historique · 12 mois</div>
          <div
            className="grid gap-px bg-[rgb(var(--line))]"
            style={{ gridTemplateColumns: '1fr' }}
          >
            <div
              className="bg-[rgb(var(--bg))] grid gap-2 px-5 py-3 text-[10px] uppercase tracking-[0.24em]"
              style={{
                gridTemplateColumns: '1fr repeat(3, minmax(8rem, auto))',
                color: 'rgb(var(--muted))',
              }}
            >
              <span>Mois</span>
              <span className="text-right">Chiffre</span>
              <span className="text-right">Dépenses</span>
              <span className="text-right">Bénéfice</span>
            </div>
            {pnl.map((p) => (
              <div
                key={p.month}
                className="bg-[rgb(var(--bg))] grid items-center gap-2 px-5 py-3 text-[13px]"
                style={{ gridTemplateColumns: '1fr repeat(3, minmax(8rem, auto))' }}
              >
                <span className="capitalize">{monthLabel(p.month)}</span>
                <span className="text-right tabular-nums">
                  {fmt(p.revenue_xof)}
                </span>
                <span
                  className="text-right tabular-nums"
                  style={{ color: 'rgb(var(--ink-soft))' }}
                >
                  {fmt(p.expenses_xof)}
                </span>
                <span
                  className="text-right tabular-nums font-medium"
                  style={{ color: p.profit_xof >= 0 ? 'rgb(var(--ink))' : '#a52a2a' }}
                >
                  {fmt(p.profit_xof)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type LucideIcon = typeof TrendingUp;

function BigStat({
  label,
  value,
  icon: Icon,
  danger,
  accent,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  danger?: boolean;
  accent?: 'positive' | 'negative';
}) {
  const color =
    accent === 'positive'
      ? '#1f6c3a'
      : accent === 'negative'
        ? '#a52a2a'
        : danger
          ? 'rgb(var(--ink-soft))'
          : 'rgb(var(--ink))';
  return (
    <div className="bg-[rgb(var(--bg))] p-6">
      {Icon && (
        <Icon
          className="h-4 w-4"
          strokeWidth={1.5}
          style={{ color: 'rgb(var(--muted))' }}
        />
      )}
      <div
        className="font-display mt-6 text-3xl font-medium tracking-tight tabular-nums md:text-4xl"
        style={{ color }}
      >
        {value}
        <span
          className="ml-1 text-[12px] uppercase tracking-[0.18em]"
          style={{ color: 'rgb(var(--muted))' }}
        >
          FCFA
        </span>
      </div>
      <div
        className="mt-1 text-[11px] uppercase tracking-[0.2em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
    </div>
  );
}
