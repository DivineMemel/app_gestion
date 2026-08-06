'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, X, Trash2, Search, PackagePlus, Coins, CheckCircle2, Ban,
} from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanSeeCosts, useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateTime, qty as fmtQty, xof } from '@/lib/format';
import type { Supplier } from '@/lib/types';

type Article = { id: string; name: string; sku: string | null; base_unit: string };

type Arrivage = {
  id: string;
  number: string;
  supplier_id: string | null;
  status: 'brouillon' | 'saisi' | 'valorise' | 'annule';
  note: string | null;
  received_at: string | null;
  valued_at: string | null;
  created_at: string;
  suppliers?: { name: string } | null;
};

type LigneArrivage = {
  id: string;
  supply_entry_id: string;
  product_id: string;
  qty_base: number;
  unit_cost_xof?: number | null;
  note: string | null;
  products?: { name: string; base_unit: string } | null;
};

type Brouillon = { product_id: string; name: string; base_unit: string; qty: string; note: string };

const CLASSE: Record<Arrivage['status'], string> = {
  brouillon: 'badge',
  saisi: 'badge badge-warn',
  valorise: 'badge badge-ok',
  annule: 'badge badge-danger',
};

const LIBELLE: Record<Arrivage['status'], string> = {
  brouillon: 'Brouillon',
  saisi: 'À valoriser',
  valorise: 'Valorisé',
  annule: 'Annulé',
};

export default function ApproPage() {
  const peutSaisir = useCanWrite('appro');
  const peutValoriser = useCanSeeCosts();

  const [arrivages, setArrivages] = useState<Arrivage[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Supplier[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Saisie
  const [ouvert, setOuvert] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [note, setNote] = useState('');
  const [lignes, setLignes] = useState<Brouillon[]>([]);
  const [recherche, setRecherche] = useState('');

  // Valorisation
  const [valorise, setValorise] = useState<Arrivage | null>(null);
  const [lignesVal, setLignesVal] = useState<LigneArrivage[] | null>(null);
  const [couts, setCouts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [a, f, p] = await Promise.all([
      db
        .from('supply_entries')
        .select(
          'id, number, supplier_id, status, note, received_at, valued_at, created_at, suppliers(name)',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      db.from('suppliers').select('*').eq('active', true).order('name'),
      db.from('products').select('id, name, sku, base_unit').eq('active', true).order('name'),
    ]);
    setErreur(a.error?.message ?? null);
    setArrivages((a.data ?? []) as Arrivage[]);
    setFournisseurs((f.data ?? []) as Supplier[]);
    setArticles((p.data ?? []) as Article[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('appro'))
      .on('postgres_changes', { table: 'supply_entries' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const aValoriser = arrivages.filter((a) => a.status === 'saisi').length;

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return [];
    const deja = new Set(lignes.map((l) => l.product_id));
    return articles
      .filter((a) => !deja.has(a.id))
      .filter(
        (a) => a.name.toLowerCase().includes(q) || (a.sku ?? '').toLowerCase().includes(q),
      )
      .slice(0, 10);
  }, [articles, recherche, lignes]);

  function ouvrirSaisie() {
    setFournisseurId('');
    setNote('');
    setLignes([]);
    setRecherche('');
    setOuvert(true);
  }

  /** Crée l'arrivage puis valide immédiatement la saisie : le stock entre. */
  async function enregistrerSaisie(e: React.FormEvent) {
    e.preventDefault();
    const propres = lignes
      .map((l) => ({
        product_id: l.product_id,
        qty_base: Number(l.qty.replace(',', '.')),
        note: l.note.trim() || null,
      }))
      .filter((l) => Number.isFinite(l.qty_base) && l.qty_base > 0);

    if (propres.length === 0) {
      setErreur('Ajoute au moins une ligne avec une quantité.');
      return;
    }

    setBusy(true);
    setErreur(null);

    const { data, error } = await db
      .from('supply_entries')
      .insert({
        supplier_id: fournisseurId || null,
        status: 'brouillon',
        note: note.trim() || null,
      })
      .select('id')
      .single();

    if (error || !data) {
      setErreur(error?.message ?? 'Création impossible.');
      setBusy(false);
      return;
    }

    const id = (data as { id: string }).id;
    const { error: itemsErr } = await db
      .from('supply_entry_items')
      .insert(propres.map((l) => ({ ...l, supply_entry_id: id })));

    if (itemsErr) {
      await db.from('supply_entries').delete().eq('id', id);
      setErreur(itemsErr.message);
      setBusy(false);
      return;
    }

    const { error: postErr } = await db.rpc('post_supply_entry', { p_entry_id: id });
    setBusy(false);
    if (postErr) {
      setErreur(postErr.message);
      return;
    }
    setOuvert(false);
    load();
  }

  async function ouvrirValorisation(a: Arrivage) {
    setValorise(a);
    setLignesVal(null);
    setCouts({});
    const { data, error } = await db
      .from('supply_entry_items')
      .select('id, supply_entry_id, product_id, qty_base, unit_cost_xof, note, products(name, base_unit)')
      .eq('supply_entry_id', a.id);
    if (error) setErreur(error.message);
    const rows = (data ?? []) as LigneArrivage[];
    setLignesVal(rows);
    setCouts(
      Object.fromEntries(
        rows.map((l) => [l.id, l.unit_cost_xof != null ? String(l.unit_cost_xof) : '']),
      ),
    );
  }

  const totalValorisation = (lignesVal ?? []).reduce(
    (s, l) => s + Number(l.qty_base) * (Number(couts[l.id]?.replace(/\D/g, '')) || 0),
    0,
  );

  async function enregistrerValorisation(e: React.FormEvent) {
    e.preventDefault();
    if (!valorise || !lignesVal) return;

    const manquant = lignesVal.find((l) => !couts[l.id]);
    if (manquant) {
      setErreur('Chaque ligne doit avoir un prix d’achat.');
      return;
    }

    setBusy(true);
    setErreur(null);

    for (const l of lignesVal) {
      const { error } = await db
        .from('supply_entry_items')
        .update({ unit_cost_xof: Number(couts[l.id].replace(/\D/g, '')) || 0 })
        .eq('id', l.id);
      if (error) {
        setErreur(error.message);
        setBusy(false);
        return;
      }
    }

    const { error } = await db.rpc('value_supply_entry', { p_entry_id: valorise.id });
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setValorise(null);
    load();
  }

  async function annuler(a: Arrivage) {
    if (
      !window.confirm(
        `Annuler l’arrivage ${a.number} ?\n\nLa marchandise entrée sera contre-passée : le stock revient à son niveau d’avant.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const { error } = await db.rpc('cancel_supply_entry', { p_entry_id: a.id });
    setBusy(false);
    if (error) setErreur(error.message);
    else load();
  }

  return (
    <>
      <PageHeader
        title="Arrivages"
        subtitle={
          aValoriser > 0
            ? `${aValoriser} arrivage${aValoriser > 1 ? 's' : ''} en attente de valorisation`
            : 'Entrées de marchandise'
        }
        actions={
          peutSaisir ? (
            <button onClick={ouvrirSaisie} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2} />
              Saisir un arrivage
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

      <div
        className="mb-5 border p-4 text-[13px]"
        style={{ borderColor: 'rgb(var(--line))', background: 'rgb(var(--surface-2))' }}
      >
        <strong>Deux gestes, deux personnes possibles.</strong> Celui qui reçoit
        compte les quantités — le stock entre aussitôt, la marchandise est là.
        Celui qui connaît le prix payé la valorise ensuite. La même personne peut
        évidemment faire les deux d’affilée.
      </div>

      {aValoriser > 0 && peutValoriser && (
        <div
          className="mb-5 flex flex-wrap items-center gap-3 border p-4"
          style={{
            borderColor: 'rgb(var(--orange) / 0.55)',
            background: 'rgb(var(--orange) / 0.08)',
          }}
        >
          <Coins
            className="h-5 w-5 shrink-0"
            strokeWidth={1.75}
            style={{ color: 'rgb(var(--orange))' }}
          />
          <div className="min-w-0 flex-1 text-[13px]">
            <strong>
              {aValoriser} arrivage{aValoriser > 1 ? 's' : ''} attend
              {aValoriser > 1 ? 'ent' : ''} son prix d’achat.
            </strong>{' '}
            Sans valorisation, la marge de ces articles reste calculée sur
            l’ancien prix.
          </div>
        </div>
      )}

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fournisseur</th>
              <th>Statut</th>
              <th>Reçu le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={5} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : arrivages.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  <PackagePlus className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} />
                  Aucun arrivage. C’est ici qu’on fait entrer la marchandise
                  arrivée sans bon de commande.
                </td>
              </tr>
            ) : (
              arrivages.map((a) => (
                <tr key={a.id}>
                  <td className="font-mono text-[13px] font-medium">{a.number}</td>
                  <td>
                    {a.suppliers?.name ?? '—'}
                    {a.note && (
                      <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                        {a.note}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={CLASSE[a.status]}>{LIBELLE[a.status]}</span>
                  </td>
                  <td style={{ color: 'rgb(var(--muted))' }}>
                    {a.received_at ? dateTime(a.received_at) : '—'}
                  </td>
                  <td className="num">
                    {a.status === 'saisi' && peutValoriser && (
                      <button onClick={() => ouvrirValorisation(a)} className="btn-primary">
                        <Coins className="h-4 w-4" strokeWidth={1.75} />
                        Valoriser
                      </button>
                    )}
                    {a.status === 'valorise' && (
                      <span
                        className="inline-flex items-center gap-1 text-[12px]"
                        style={{ color: 'rgb(var(--ok))' }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        {dateTime(a.valued_at)}
                      </span>
                    )}
                    {peutSaisir && a.status !== 'annule' && (
                      <button
                        onClick={() => annuler(a)}
                        className="btn-ghost"
                        disabled={busy}
                        title="Annuler et contre-passer"
                      >
                        <Ban className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Saisie ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form onSubmit={enregistrerSaisie} className="surface mx-auto my-6 w-full max-w-2xl">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Saisir un arrivage</span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                Compte les quantités reçues. Les prix ne sont pas demandés ici —
                ils seront renseignés à la valorisation.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Fournisseur</label>
                  <select
                    className="select"
                    value={fournisseurId}
                    onChange={(e) => setFournisseurId(e.target.value)}
                  >
                    <option value="">— non précisé —</option>
                    {fournisseurs.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Note</label>
                  <input
                    className="input"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Qui a réceptionné, état du colis…"
                  />
                </div>
              </div>

              <div>
                <label className="label">Ajouter un article</label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                    strokeWidth={1.75}
                    style={{ color: 'rgb(var(--muted))' }}
                  />
                  <input
                    className="input pl-10"
                    placeholder="Nom ou référence…"
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                  />
                </div>
                {resultats.length > 0 && (
                  <div
                    className="mt-1 max-h-48 overflow-y-auto border"
                    style={{ borderColor: 'rgb(var(--line))' }}
                  >
                    {resultats.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setLignes((cur) => [
                            ...cur,
                            {
                              product_id: a.id,
                              name: a.name,
                              base_unit: a.base_unit,
                              qty: '1',
                              note: '',
                            },
                          ]);
                          setRecherche('');
                        }}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-[13px] hover:bg-[rgb(var(--surface-2))]"
                        style={{ borderColor: 'rgb(var(--line))' }}
                      >
                        <span>{a.name}</span>
                        <span style={{ color: 'rgb(var(--muted))' }}>{a.base_unit}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {lignes.length === 0 ? (
                <p className="text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  Aucune ligne pour l’instant.
                </p>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th className="num">Quantité reçue</th>
                        <th>Note</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l, i) => (
                        <tr key={l.product_id}>
                          <td className="text-[13px] font-medium">{l.name}</td>
                          <td className="num">
                            <div className="flex items-center justify-end gap-1.5">
                              <input
                                className="input w-24 px-2 py-1 text-right"
                                inputMode="decimal"
                                value={l.qty}
                                onChange={(e) =>
                                  setLignes((cur) =>
                                    cur.map((x, j) =>
                                      j === i ? { ...x, qty: e.target.value } : x,
                                    ),
                                  )
                                }
                              />
                              <span
                                className="text-[12px]"
                                style={{ color: 'rgb(var(--muted))' }}
                              >
                                {l.base_unit}
                              </span>
                            </div>
                          </td>
                          <td>
                            <input
                              className="input px-2 py-1 text-[13px]"
                              value={l.note}
                              placeholder="facultatif"
                              onChange={(e) =>
                                setLignes((cur) =>
                                  cur.map((x, j) =>
                                    j === i ? { ...x, note: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td className="num">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => setLignes((cur) => cur.filter((_, j) => j !== i))}
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setOuvert(false)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Valider — faire entrer le stock'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- Valorisation ---------- */}
      {valorise && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form
            onSubmit={enregistrerValorisation}
            className="surface mx-auto my-6 w-full max-w-xl"
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <div>
                <span className="eyebrow">Valoriser {valorise.number}</span>
                <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {valorise.suppliers?.name ?? 'Fournisseur non précisé'} ·{' '}
                  {dateTime(valorise.received_at)}
                </div>
              </div>
              <button type="button" onClick={() => setValorise(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {lignesVal === null ? (
              <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Chargement…
              </p>
            ) : (
              <>
                <p
                  className="border-b px-5 py-3 text-[13px]"
                  style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
                >
                  Le prix saisi devient le prix d’achat de référence de l’article,
                  <strong> pour les ventes à venir</strong>. Les ventes déjà
                  passées gardent le coût qu’elles ont figé — sinon les marges des
                  mois clos changeraient toutes seules.
                </p>

                <div className="tbl-wrap">
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th className="num">Reçu</th>
                        <th className="num">Prix d’achat unitaire</th>
                        <th className="num">Total ligne</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignesVal.map((l) => {
                        const cout = Number(couts[l.id]?.replace(/\D/g, '')) || 0;
                        return (
                          <tr key={l.id}>
                            <td>
                              <div className="text-[13px] font-medium">
                                {l.products?.name ?? '—'}
                              </div>
                              {l.note && (
                                <div
                                  className="text-[12px]"
                                  style={{ color: 'rgb(var(--muted))' }}
                                >
                                  {l.note}
                                </div>
                              )}
                            </td>
                            <td className="num">
                              {fmtQty(l.qty_base)} {l.products?.base_unit}
                            </td>
                            <td className="num">
                              <input
                                className="input w-28 px-2 py-1 text-right"
                                inputMode="numeric"
                                value={couts[l.id] ?? ''}
                                placeholder="0"
                                onChange={(e) =>
                                  setCouts((c) => ({
                                    ...c,
                                    [l.id]: e.target.value.replace(/\D/g, ''),
                                  }))
                                }
                              />
                            </td>
                            <td className="num font-medium">
                              {xof(Number(l.qty_base) * cout)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-between px-5 py-4 text-lg font-bold">
                  <span>Valeur de l’arrivage</span>
                  <span className="tnum">{xof(totalValorisation)}</span>
                </div>
              </>
            )}

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setValorise(null)} className="btn-outline">
                Plus tard
              </button>
              <button type="submit" className="btn-primary" disabled={busy || !lignesVal}>
                {busy ? 'Enregistrement…' : 'Valoriser'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
