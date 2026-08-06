'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Phone, Mail } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateShort, xof } from '@/lib/format';
import {
  PURCHASE_STATUS_LABELS,
  type PurchaseOrder,
  type Supplier,
} from '@/lib/types';

const VIDE = { name: '', phone: '', email: '', address: '', notes: '', active: true };

export default function FournisseursPage() {
  const peutEcrire = useCanWrite('fournisseurs');

  const [liste, setListe] = useState<Supplier[]>([]);
  const [recherche, setRecherche] = useState('');
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [edition, setEdition] = useState<string | null>(null);
  const [form, setForm] = useState({ ...VIDE });
  const [busy, setBusy] = useState(false);

  const [fiche, setFiche] = useState<Supplier | null>(null);
  const [bons, setBons] = useState<PurchaseOrder[] | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await db.from('suppliers').select('*').order('name');
    setErreur(error?.message ?? null);
    setListe((data ?? []) as Supplier[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('fournisseurs'))
      .on('postgres_changes', { table: 'suppliers' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return liste;
    return liste.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone ?? '').includes(q) ||
        (s.email ?? '').toLowerCase().includes(q),
    );
  }, [liste, recherche]);

  function ouvrirNouveau() {
    setEdition(null);
    setForm({ ...VIDE });
    setOuvert(true);
  }

  function ouvrirEdition(s: Supplier) {
    setEdition(s.id);
    setForm({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      notes: s.notes ?? '',
      active: s.active,
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
      notes: form.notes.trim() || null,
      active: form.active,
    };

    const { error } = edition
      ? await db.from('suppliers').update(payload).eq('id', edition)
      : await db.from('suppliers').insert(payload);

    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setOuvert(false);
    load();
  }

  async function ouvrirFiche(s: Supplier) {
    setFiche(s);
    setBons(null);
    const { data } = await db
      .from('purchase_orders')
      .select('id, number, status, total_xof, ordered_at, received_at, created_at')
      .eq('supplier_id', s.id)
      .order('created_at', { ascending: false })
      .limit(30);
    setBons((data ?? []) as PurchaseOrder[]);
  }

  return (
    <>
      <PageHeader
        title="Fournisseurs"
        subtitle={`${liste.length} fournisseur${liste.length > 1 ? 's' : ''}`}
        actions={
          peutEcrire ? (
            <button onClick={ouvrirNouveau} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nouveau fournisseur
            </button>
          ) : null
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
          placeholder="Chercher un fournisseur…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th>Contact</th>
              <th>Adresse</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={4} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : filtres.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Aucun fournisseur enregistré.
                </td>
              </tr>
            ) : (
              filtres.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button
                      onClick={() => ouvrirFiche(s)}
                      className="text-left font-medium hover:underline"
                    >
                      {s.name}
                    </button>
                    {!s.active && <span className="ml-2 badge">Inactif</span>}
                  </td>
                  <td>
                    {s.phone && (
                      <a
                        href={`tel:${s.phone}`}
                        className="flex items-center gap-1 text-[13px]"
                      >
                        <Phone className="h-3 w-3" strokeWidth={1.75} />
                        {s.phone}
                      </a>
                    )}
                    {s.email && (
                      <a
                        href={`mailto:${s.email}`}
                        className="flex items-center gap-1 text-[12px]"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        <Mail className="h-3 w-3" strokeWidth={1.75} />
                        {s.email}
                      </a>
                    )}
                  </td>
                  <td style={{ color: 'rgb(var(--muted))' }}>{s.address ?? '—'}</td>
                  <td className="num">
                    {peutEcrire && (
                      <button onClick={() => ouvrirEdition(s)} className="btn-ghost">
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Formulaire ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form onSubmit={enregistrer} className="surface mx-auto my-6 w-full max-w-lg">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">
                {edition ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
              </span>
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
                />
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
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
                  placeholder="Délais habituels, conditions de paiement…"
                />
              </div>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Fournisseur actif
              </label>
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

      {/* ---------- Historique ---------- */}
      {fiche && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4"
          onClick={() => setFiche(null)}
        >
          <div
            className="surface mt-10 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Bons de commande · {fiche.name}</span>
              <button onClick={() => setFiche(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            {bons === null ? (
              <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Chargement…
              </p>
            ) : bons.length === 0 ? (
              <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Aucun bon de commande pour ce fournisseur.
              </p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Statut</th>
                    <th>Date</th>
                    <th className="num">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {bons.map((b) => (
                    <tr key={b.id}>
                      <td className="font-mono text-[13px]">{b.number}</td>
                      <td>
                        <span className="badge">{PURCHASE_STATUS_LABELS[b.status]}</span>
                      </td>
                      <td style={{ color: 'rgb(var(--muted))' }}>
                        {dateShort(b.received_at ?? b.ordered_at ?? b.created_at)}
                      </td>
                      <td className="num font-medium">{xof(b.total_xof)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  );
}
