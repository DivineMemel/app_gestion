'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import {
  abidjanMonthRange,
  abidjanToday,
  dateShort,
  monthLabel,
  xof,
} from '@/lib/format';
import { PAYMENT_LABELS, type Expense, type PaymentMethod } from '@/lib/types';

type Poste = { id: string; name: string; active: boolean };
type Periode = 'mois' | 'mois_dernier' | 'tout';

const MOYENS: Exclude<PaymentMethod, 'credit'>[] = [
  'especes',
  'mobile_money',
  'virement',
  'cheque',
];

export default function DepensesPage() {
  const peutEcrire = useCanWrite('depenses');

  const [depenses, setDepenses] = useState<Expense[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [periode, setPeriode] = useState<Periode>('mois');
  const [posteFiltre, setPosteFiltre] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: '',
    amount_xof: '',
    category_id: '',
    method: 'especes' as Exclude<PaymentMethod, 'credit'>,
    spent_on: abidjanToday(),
    note: '',
  });

  const bornes = useMemo(() => {
    if (periode === 'tout') return null;
    const ref = new Date();
    if (periode === 'mois_dernier') {
      ref.setUTCMonth(ref.getUTCMonth() - 1);
    }
    const { start, end } = abidjanMonthRange(ref);
    return { debut: start.slice(0, 10), fin: end.slice(0, 10), ref: start };
  }, [periode]);

  const load = useCallback(async () => {
    let q = db
      .from('expenses')
      .select(
        'id, category_id, label, amount_xof, method, spent_on, note, expense_categories(name)',
      )
      .order('spent_on', { ascending: false })
      .limit(300);

    // `spent_on` est une colonne `date` : on compare à des dates nues, pas à
    // des timestamps, sinon le dernier jour du mois saute.
    if (bornes) q = q.gte('spent_on', bornes.debut).lte('spent_on', bornes.fin);
    if (posteFiltre) q = q.eq('category_id', posteFiltre);

    const [d, c] = await Promise.all([
      q,
      db.from('expense_categories').select('*').order('name'),
    ]);

    setErreur(d.error?.message ?? c.error?.message ?? null);
    setDepenses((d.data ?? []) as Expense[]);
    setPostes((c.data ?? []) as Poste[]);
    setChargement(false);
  }, [bornes, posteFiltre]);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('depenses'))
      .on('postgres_changes', { table: 'expenses' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const total = depenses.reduce((s, d) => s + d.amount_xof, 0);

  // Répartition par poste : c'est ce qu'on regarde en premier pour savoir où
  // part l'argent.
  const parPoste = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of depenses) {
      const nom = d.expense_categories?.name ?? 'Sans poste';
      m.set(nom, (m.get(nom) ?? 0) + d.amount_xof);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [depenses]);

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!peutEcrire) return;
    const montant = Number(form.amount_xof.replace(/\D/g, ''));
    if (!montant) {
      setErreur('Montant invalide.');
      return;
    }

    setBusy(true);
    setErreur(null);
    const { error } = await db.from('expenses').insert({
      label: form.label.trim(),
      amount_xof: montant,
      category_id: form.category_id || null,
      method: form.method,
      spent_on: form.spent_on,
      note: form.note.trim() || null,
    });
    setBusy(false);

    if (error) {
      setErreur(error.message);
      return;
    }
    setForm((f) => ({ ...f, label: '', amount_xof: '', note: '' }));
    setOuvert(false);
    load();
  }

  async function supprimer(d: Expense) {
    if (!window.confirm(`Supprimer « ${d.label} » (${xof(d.amount_xof)}) ?`)) return;
    const { error } = await db.from('expenses').delete().eq('id', d.id);
    if (error) setErreur(error.message);
    else load();
  }

  return (
    <>
      <PageHeader
        title="Dépenses"
        subtitle={`${depenses.length} dépense${depenses.length > 1 ? 's' : ''} · ${xof(total)}`}
        actions={
          <>
            <div className="flex gap-1">
              {(['mois', 'mois_dernier', 'tout'] as Periode[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriode(p)}
                  className={periode === p ? 'btn-primary' : 'btn-outline'}
                >
                  {p === 'mois'
                    ? 'Ce mois'
                    : p === 'mois_dernier'
                      ? 'Mois dernier'
                      : 'Tout'}
                </button>
              ))}
            </div>
            {peutEcrire && (
              <button onClick={() => setOuvert(true)} className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nouvelle dépense
              </button>
            )}
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

      {bornes && (
        <p className="mb-4 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
          {monthLabel(bornes.ref)}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="surface tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Libellé</th>
                <th>Poste</th>
                <th>Moyen</th>
                <th className="num">Montant</th>
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
              ) : depenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                    Aucune dépense sur cette période.
                  </td>
                </tr>
              ) : (
                depenses.map((d) => (
                  <tr key={d.id}>
                    <td style={{ color: 'rgb(var(--muted))' }}>{dateShort(d.spent_on)}</td>
                    <td>
                      <div className="font-medium">{d.label}</div>
                      {d.note && (
                        <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                          {d.note}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge">
                        {d.expense_categories?.name ?? 'Sans poste'}
                      </span>
                    </td>
                    <td style={{ color: 'rgb(var(--muted))' }}>
                      {PAYMENT_LABELS[d.method]}
                    </td>
                    <td className="num font-semibold">{xof(d.amount_xof)}</td>
                    <td className="num">
                      {peutEcrire && (
                        <button onClick={() => supprimer(d)} className="btn-ghost">
                          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside>
          <h2 className="eyebrow mb-2">Par poste</h2>
          <div className="surface">
            <div className="p-3">
              <select
                className="select"
                value={posteFiltre}
                onChange={(e) => setPosteFiltre(e.target.value)}
              >
                <option value="">Tous les postes</option>
                {postes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            {parPoste.length === 0 ? (
              <p className="px-4 pb-4 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                Rien à répartir.
              </p>
            ) : (
              <ul className="border-t" style={{ borderColor: 'rgb(var(--line))' }}>
                {parPoste.map(([nom, montant]) => {
                  const part = total > 0 ? (montant / total) * 100 : 0;
                  return (
                    <li
                      key={nom}
                      className="border-b px-4 py-2.5 last:border-b-0"
                      style={{ borderColor: 'rgb(var(--line))' }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px]">{nom}</span>
                        <span className="tnum text-[13px] font-semibold">
                          {xof(montant)}
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-1"
                        style={{ background: 'rgb(var(--surface-2))' }}
                      >
                        <div
                          className="h-full"
                          style={{
                            width: `${part}%`,
                            background: 'rgb(var(--orange))',
                          }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ---------- Saisie ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4">
          <form onSubmit={enregistrer} className="surface mt-10 w-full max-w-md">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Nouvelle dépense</span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Libellé</label>
                <input
                  className="input"
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="Carburant camionnette, loyer août…"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Montant (F)</label>
                <input
                  className="input input-lg"
                  inputMode="numeric"
                  value={form.amount_xof}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount_xof: e.target.value.replace(/\D/g, '') }))
                  }
                  required
                />
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.spent_on}
                  onChange={(e) => setForm((f) => ({ ...f, spent_on: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Poste</label>
                <select
                  className="select"
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                >
                  <option value="">—</option>
                  {postes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Moyen</label>
                <select
                  className="select"
                  value={form.method}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      method: e.target.value as Exclude<PaymentMethod, 'credit'>,
                    }))
                  }
                >
                  {MOYENS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label">Note</label>
                <input
                  className="input"
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setOuvert(false)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
