'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { Expense, ExpenseCategory, Sector } from '@/lib/types';

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function DepensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  async function load() {
    const [{ data: e }, { data: c }, { data: s }] = await Promise.all([
      supabase.from('expenses').select('*').order('paid_at', { ascending: false }),
      supabase.from('expense_categories').select('*').order('display_order'),
      supabase.from('sectors').select('*').eq('active', true).order('display_order'),
    ]);
    setExpenses((e as Expense[]) || []);
    setCats((c as ExpenseCategory[]) || []);
    setSectors((s as Sector[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('expenses'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthExpenses = expenses.filter((e) => new Date(e.paid_at) >= monthStart);
    const total = expenses.reduce((s, e) => s + e.amount_xof, 0);
    const month = monthExpenses.reduce((s, e) => s + e.amount_xof, 0);
    return { total, month, count: expenses.length, monthCount: monthExpenses.length };
  }, [expenses]);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);

  async function remove(e: Expense) {
    if (!confirm('Supprimer cette dépense ?')) return;
    await supabase.from('expenses').delete().eq('id', e.id);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Finances"
        title="Dépenses"
        description="Toutes les sorties de caisse, classées par catégorie. Imputation par secteur si nécessaire."
        right={
          <button onClick={() => setAdding((a) => !a)} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            {adding ? 'Annuler' : 'Saisir'}
          </button>
        }
      />

      <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
        <Stat label="Ce mois-ci" value={`${fmt(stats.month)} FCFA`} note={`${stats.monthCount} sorties`} />
        <Stat label="Total cumulé" value={`${fmt(stats.total)} FCFA`} note={`${stats.count} sorties`} />
        <Stat
          label="Dernière sortie"
          value={
            expenses[0] ? new Date(expenses[0].paid_at).toLocaleDateString('fr-FR') : '—'
          }
          note={expenses[0] ? `${fmt(expenses[0].amount_xof)} FCFA` : ''}
        />
      </div>

      {adding && <ExpenseForm cats={cats} sectors={sectors} onDone={() => setAdding(false)} />}

      {loading && <div className="text-sm text-muted">Chargement…</div>}
      {!loading && expenses.length === 0 && (
        <div className="surface px-6 py-12 text-center text-sm text-muted">
          Aucune dépense saisie.
        </div>
      )}

      <ul className="divide-y" style={{ borderColor: 'rgb(var(--line))' }}>
        {expenses.map((e) => {
          const cat = e.category_id ? catById.get(e.category_id) : null;
          const sec = e.sector_id ? sectorById.get(e.sector_id) : null;
          const d = new Date(e.paid_at);
          return (
            <li
              key={e.id}
              className="grid grid-cols-12 items-baseline gap-4 border-t py-5"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span
                className="col-span-2 md:col-span-1 text-[10px] uppercase tracking-[0.2em] tabular-nums"
                style={{ color: 'rgb(var(--muted))' }}
              >
                {d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
              </span>
              <div className="col-span-10 md:col-span-6">
                <div className="font-display text-xl font-medium tracking-tight">
                  {e.description}
                </div>
                <div
                  className="mt-1 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  {cat && <span>{cat.name}</span>}
                  {sec && (
                    <>
                      <span>·</span>
                      <span>{sec.name}</span>
                    </>
                  )}
                  <span>·</span>
                  <span>{e.payment_method.replace('_', ' ')}</span>
                </div>
              </div>
              <div className="col-span-8 md:col-span-3 text-right md:text-left">
                <span className="font-display text-xl tabular-nums">{fmt(e.amount_xof)}</span>{' '}
                <span
                  className="text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  FCFA
                </span>
              </div>
              <div className="col-span-4 md:col-span-2 flex items-center justify-end">
                <button onClick={() => remove(e)} className="btn-ghost text-[11px] text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bg-[rgb(var(--bg))] p-6">
      <div className="font-display text-3xl font-medium tracking-tight tabular-nums">{value}</div>
      <div
        className="mt-1 text-[11px] uppercase tracking-[0.2em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
      {note && (
        <div className="mt-1 text-[11px]" style={{ color: 'rgb(var(--muted))' }}>
          {note}
        </div>
      )}
    </div>
  );
}

function ExpenseForm({
  cats,
  sectors,
  onDone,
}: {
  cats: ExpenseCategory[];
  sectors: Sector[];
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    amount_xof: 0,
    description: '',
    category_id: '',
    sector_id: '',
    payment_method: 'cash' as Expense['payment_method'],
    paid_at: todayISO(),
  });
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || form.amount_xof <= 0) return;
    setBusy(true);
    await supabase.from('expenses').insert({
      amount_xof: Math.round(form.amount_xof),
      description: form.description.trim(),
      category_id: form.category_id || null,
      sector_id: form.sector_id || null,
      payment_method: form.payment_method,
      paid_at: new Date(form.paid_at).toISOString(),
    });
    setBusy(false);
    onDone();
  }

  return (
    <form onSubmit={submit} className="surface p-6 md:p-8 space-y-5">
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Montant (FCFA)">
          <input
            type="number"
            min={0}
            step={500}
            autoFocus
            value={form.amount_xof || ''}
            onChange={(e) => setForm({ ...form, amount_xof: Number(e.target.value) })}
            className="input"
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={form.paid_at}
            onChange={(e) => setForm({ ...form, paid_at: e.target.value })}
            className="input"
          />
        </Field>
        <Field label="Paiement">
          <select
            value={form.payment_method}
            onChange={(e) =>
              setForm({ ...form, payment_method: e.target.value as Expense['payment_method'] })
            }
            className="input bg-[rgb(var(--surface))]"
          >
            <option value="cash">Espèces</option>
            <option value="mobile_money">Mobile Money</option>
            <option value="card">Carte</option>
            <option value="transfer">Virement</option>
            <option value="other">Autre</option>
          </select>
        </Field>
      </div>

      <Field label="Description">
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="ex: Achat shampoings, loyer mai…"
          className="input"
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Catégorie">
          <select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            className="input bg-[rgb(var(--surface))]"
          >
            <option value="">— Choisir —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Imputer à un secteur (optionnel)">
          <select
            value={form.sector_id}
            onChange={(e) => setForm({ ...form, sector_id: e.target.value })}
            className="input bg-[rgb(var(--surface))]"
          >
            <option value="">— Aucun —</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgb(var(--line))' }}>
        <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? 'Enregistrement…' : 'Enregistrer la dépense'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div
        className="mb-1 text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
      {children}
    </label>
  );
}
