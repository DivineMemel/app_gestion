'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Wallet, Phone } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateShort, dateTime, xof } from '@/lib/format';
import type { Customer, CustomerBalance, CustomerKind, Payment, Sale } from '@/lib/types';

const KINDS: { value: CustomerKind; label: string }[] = [
  { value: 'particulier', label: 'Particulier' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'chantier', label: 'Chantier' },
];

const VIDE = {
  name: '',
  phone: '',
  email: '',
  address: '',
  kind: 'particulier' as CustomerKind,
  credit_limit_xof: '',
  notes: '',
};

export default function ClientsPage() {
  const peutEcrire = useCanWrite('clients');

  const [soldes, setSoldes] = useState<CustomerBalance[]>([]);
  const [recherche, setRecherche] = useState('');
  const [ardoisesSeules, setArdoisesSeules] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [form, setForm] = useState({ ...VIDE });
  const [edition, setEdition] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const [busy, setBusy] = useState(false);

  const [fiche, setFiche] = useState<CustomerBalance | null>(null);
  const [achats, setAchats] = useState<Sale[]>([]);
  const [reglements, setReglements] = useState<Payment[]>([]);
  const [montantRegle, setMontantRegle] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await db
      .from('v_customer_balances')
      .select('*')
      .order('solde_xof', { ascending: false });
    setErreur(error?.message ?? null);
    setSoldes((data ?? []) as CustomerBalance[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('clients'))
      .on('postgres_changes', { table: 'customers' }, load)
      .on('postgres_changes', { table: 'sales' }, load)
      .on('postgres_changes', { table: 'payments' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return soldes.filter((c) => {
      if (ardoisesSeules && (c.solde_xof ?? 0) <= 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || (c.phone ?? '').includes(q)
      );
    });
  }, [soldes, recherche, ardoisesSeules]);

  const totalDu = soldes.reduce((s, c) => s + Math.max(c.solde_xof ?? 0, 0), 0);

  function ouvrirNouveau() {
    setEdition(null);
    setForm({ ...VIDE });
    setOuvert(true);
  }

  async function ouvrirEdition(id: string) {
    const { data } = await db.from('customers').select('*').eq('id', id).maybeSingle();
    const c = data as Customer | null;
    if (!c) return;
    setEdition(id);
    setForm({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      address: c.address ?? '',
      kind: c.kind,
      credit_limit_xof: String(c.credit_limit_xof ?? 0),
      notes: c.notes ?? '',
    });
    setOuvert(true);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!peutEcrire) return;
    setBusy(true);
    setErreur(null);

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      kind: form.kind,
      credit_limit_xof: Number(form.credit_limit_xof.replace(/\D/g, '')) || 0,
      notes: form.notes.trim() || null,
    };

    const { error } = edition
      ? await db.from('customers').update(payload).eq('id', edition)
      : await db.from('customers').insert(payload);

    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setOuvert(false);
    load();
  }

  async function ouvrirFiche(c: CustomerBalance) {
    setFiche(c);
    setMontantRegle('');
    setAchats([]);
    setReglements([]);
    const [v, p] = await Promise.all([
      db
        .from('sales')
        .select('id, number, total_xof, paid_xof, status, sold_at')
        .eq('customer_id', c.id)
        .order('sold_at', { ascending: false })
        .limit(30),
      db
        .from('payments')
        .select('id, amount_xof, method, note, paid_at, sale_id, customer_id')
        .eq('customer_id', c.id)
        .order('paid_at', { ascending: false })
        .limit(30),
    ]);
    setAchats((v.data ?? []) as Sale[]);
    setReglements((p.data ?? []) as Payment[]);
  }

  /** Encaisse un acompte sur l'ardoise, sans le rattacher à une vente précise. */
  async function encaisserAcompte(e: React.FormEvent) {
    e.preventDefault();
    if (!fiche) return;
    const montant = Number(montantRegle.replace(/\D/g, ''));
    if (!montant || montant <= 0) return;

    setBusy(true);
    const { error } = await db.from('payments').insert({
      customer_id: fiche.id,
      amount_xof: montant,
      method: 'especes',
      note: 'Règlement ardoise',
    });
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setMontantRegle('');
    await load();
    const maj = (await db
      .from('v_customer_balances')
      .select('*')
      .eq('id', fiche.id)
      .maybeSingle()) as { data: CustomerBalance | null };
    if (maj.data) {
      setFiche(maj.data);
      ouvrirFiche(maj.data);
    }
  }

  return (
    <>
      <PageHeader
        title="Clients & ardoises"
        subtitle={`${soldes.length} clients · ${xof(totalDu)} en attente de règlement`}
        actions={
          <>
            <button
              onClick={() => setArdoisesSeules((v) => !v)}
              className={ardoisesSeules ? 'btn-primary' : 'btn-outline'}
            >
              <Wallet className="h-4 w-4" strokeWidth={1.75} />
              {ardoisesSeules ? 'Tous les clients' : 'Ardoises seules'}
            </button>
            {peutEcrire && (
              <button onClick={ouvrirNouveau} className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nouveau client
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

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
          strokeWidth={1.75}
          style={{ color: 'rgb(var(--muted))' }}
        />
        <input
          className="input pl-10"
          placeholder="Chercher par nom ou téléphone…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Client</th>
              <th>Type</th>
              <th className="num">Acheté</th>
              <th className="num">Réglé</th>
              <th className="num">Solde dû</th>
              <th>Dernier achat</th>
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
            ) : filtres.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  {ardoisesSeules ? 'Aucune ardoise en cours.' : 'Aucun client enregistré.'}
                </td>
              </tr>
            ) : (
              filtres.map((c) => {
                const solde = c.solde_xof ?? 0;
                const depasse =
                  c.credit_limit_xof > 0 && solde > c.credit_limit_xof;
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="text-left font-medium hover:underline"
                        onClick={() => ouvrirFiche(c)}
                      >
                        {c.name}
                      </button>
                      {c.phone && (
                        <div
                          className="flex items-center gap-1 text-[12px]"
                          style={{ color: 'rgb(var(--muted))' }}
                        >
                          <Phone className="h-3 w-3" strokeWidth={1.75} />
                          {c.phone}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge">
                        {KINDS.find((k) => k.value === c.kind)?.label ?? c.kind}
                      </span>
                    </td>
                    <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                      {xof(c.total_achete_xof)}
                    </td>
                    <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                      {xof(c.total_regle_xof)}
                    </td>
                    <td className="num">
                      {solde > 0 ? (
                        <span className={depasse ? 'badge badge-danger' : 'badge badge-warn'}>
                          {xof(solde)}
                        </span>
                      ) : (
                        <span style={{ color: 'rgb(var(--muted))' }}>—</span>
                      )}
                      {depasse && (
                        <div
                          className="mt-0.5 text-[11px]"
                          style={{ color: 'rgb(var(--danger))' }}
                        >
                          plafond {xof(c.credit_limit_xof)} dépassé
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'rgb(var(--muted))' }}>
                      {c.derniere_vente ? dateShort(c.derniere_vente) : '—'}
                    </td>
                    <td className="num">
                      {peutEcrire && (
                        <button onClick={() => ouvrirEdition(c.id)} className="btn-ghost">
                          Modifier
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

      {/* ---------- Formulaire client ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form onSubmit={enregistrer} className="surface mx-auto my-6 w-full max-w-lg">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">{edition ? 'Modifier le client' : 'Nouveau client'}</span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Nom</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Téléphone</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+225 …"
                />
              </div>
              <div>
                <label className="label">Type</label>
                <select
                  className="select"
                  value={form.kind}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, kind: e.target.value as CustomerKind }))
                  }
                >
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Plafond de crédit (F)</label>
                <input
                  className="input"
                  inputMode="numeric"
                  value={form.credit_limit_xof}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      credit_limit_xof: e.target.value.replace(/\D/g, ''),
                    }))
                  }
                  placeholder="0 = pas de crédit"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Adresse</label>
                <input
                  className="input"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea
                  className="input"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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

      {/* ---------- Fiche client ---------- */}
      {fiche && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          onClick={() => setFiche(null)}
        >
          <div
            className="surface mx-auto my-6 w-full max-w-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <div>
                <div className="font-semibold">{fiche.name}</div>
                <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {fiche.phone ?? '—'}
                </div>
              </div>
              <button onClick={() => setFiche(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div
              className="grid grid-cols-3 gap-px border-b"
              style={{ borderColor: 'rgb(var(--line))', background: 'rgb(var(--line))' }}
            >
              <Chiffre label="Acheté" valeur={xof(fiche.total_achete_xof)} />
              <Chiffre label="Réglé" valeur={xof(fiche.total_regle_xof)} />
              <Chiffre
                label="Solde dû"
                valeur={xof(fiche.solde_xof)}
                alerte={(fiche.solde_xof ?? 0) > 0}
              />
            </div>

            {peutEcrire && (fiche.solde_xof ?? 0) > 0 && (
              <form
                onSubmit={encaisserAcompte}
                className="flex flex-wrap items-end gap-2 border-b p-5"
                style={{ borderColor: 'rgb(var(--line))' }}
              >
                <div className="min-w-40 flex-1">
                  <label className="label">Encaisser un règlement (F)</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={montantRegle}
                    onChange={(e) => setMontantRegle(e.target.value.replace(/\D/g, ''))}
                    placeholder={String(fiche.solde_xof)}
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={busy}>
                  Encaisser
                </button>
              </form>
            )}

            <div className="grid gap-5 p-5 sm:grid-cols-2">
              <section>
                <h3 className="eyebrow mb-2">Achats</h3>
                {achats.length === 0 ? (
                  <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
                    Aucun achat.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {achats.map((v) => (
                      <li key={v.id} className="flex justify-between text-[13px]">
                        <span>
                          <span className="font-mono">{v.number}</span>
                          <span
                            className="ml-2"
                            style={{ color: 'rgb(var(--muted))' }}
                          >
                            {dateShort(v.sold_at)}
                          </span>
                        </span>
                        <span className="tnum font-medium">{xof(v.total_xof)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="eyebrow mb-2">Règlements</h3>
                {reglements.length === 0 ? (
                  <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
                    Aucun règlement.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {reglements.map((p) => (
                      <li key={p.id} className="flex justify-between text-[13px]">
                        <span style={{ color: 'rgb(var(--muted))' }}>
                          {dateTime(p.paid_at)}
                        </span>
                        <span className="tnum font-medium" style={{ color: 'rgb(var(--ok))' }}>
                          + {xof(p.amount_xof)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Chiffre({
  label,
  valeur,
  alerte,
}: {
  label: string;
  valeur: string;
  alerte?: boolean;
}) {
  return (
    <div className="p-4" style={{ background: 'rgb(var(--surface))' }}>
      <div
        className="text-[10px] font-bold uppercase tracking-industrial"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
      <div
        className="tnum mt-1 text-lg font-semibold"
        style={alerte ? { color: 'rgb(var(--danger))' } : undefined}
      >
        {valeur}
      </div>
    </div>
  );
}
