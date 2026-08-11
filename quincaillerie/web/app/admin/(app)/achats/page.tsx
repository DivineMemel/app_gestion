'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, X, Trash2, PackageCheck, AlertTriangle, Search } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanSeeCosts, useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateShort, qty as fmtQty, xof } from '@/lib/format';
import {
  PURCHASE_STATUS_LABELS,
  type LowStockRow,
  type PurchaseOrder,
  type PurchaseStatus,
  type Supplier,
} from '@/lib/types';

type Article = {
  id: string;
  name: string;
  sku: string | null;
  base_unit: string;
  stock_qty: number;
  cost_price_xof?: number;
};

type LigneBrouillon = {
  product_id: string;
  name: string;
  base_unit: string;
  qty_base: string;
  unit_cost_xof: string;
};

type LigneBon = {
  id: string;
  product_id: string;
  qty_base: number;
  qty_received_base: number;
  unit_cost_xof?: number;
  products?: { name: string; base_unit: string } | null;
};

const CLASSE: Record<PurchaseStatus, string> = {
  brouillon: 'badge',
  commande: 'badge badge-warn',
  recu_partiel: 'badge badge-warn',
  recu: 'badge badge-ok',
  annule: 'badge badge-danger',
};

export default function AchatsPage() {
  const peutEcrire = useCanWrite('achats');
  const voitCouts = useCanSeeCosts();

  const [bons, setBons] = useState<PurchaseOrder[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Supplier[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [manquants, setManquants] = useState<LowStockRow[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [fournisseurId, setFournisseurId] = useState('');
  const [note, setNote] = useState('');
  const [lignes, setLignes] = useState<LigneBrouillon[]>([]);
  const [recherche, setRecherche] = useState('');
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState<PurchaseOrder | null>(null);
  const [lignesBon, setLignesBon] = useState<LigneBon[] | null>(null);

  const load = useCallback(async () => {
    const [b, f, p, m] = await Promise.all([
      db
        .from('purchase_orders')
        .select(
          'id, number, supplier_id, status, total_xof, note, ordered_at, received_at, created_at, suppliers(name)',
        )
        .order('created_at', { ascending: false })
        .limit(100),
      db.from('suppliers').select('*').eq('active', true).order('name'),
      db
        .from('products')
        .select('id, name, sku, base_unit, stock_qty, cost_price_xof')
        .eq('active', true)
        .order('name'),
      db.from('v_low_stock').select('id, sku, name, base_unit, stock_qty, min_stock, category_name'),
    ]);

    setErreur(b.error?.message ?? p.error?.message ?? null);
    setBons((b.data ?? []) as PurchaseOrder[]);
    setFournisseurs((f.data ?? []) as Supplier[]);
    setArticles((p.data ?? []) as Article[]);
    setManquants((m.data ?? []) as LowStockRow[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('achats'))
      .on('postgres_changes', { table: 'purchase_orders' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const dejaLa = new Set(lignes.map((l) => l.product_id));
    return articles
      .filter((a) => !dejaLa.has(a.id))
      .filter(
        (a) =>
          !q ||
          a.name.toLowerCase().includes(q) ||
          (a.sku ?? '').toLowerCase().includes(q),
      )
      .slice(0, 12);
  }, [articles, recherche, lignes]);

  function ouvrirNouveau() {
    setFournisseurId('');
    setNote('');
    setLignes([]);
    setRecherche('');
    setOuvert(true);
  }

  /** Pré-remplit le bon avec ce qui manque : c'est le geste le plus fréquent. */
  function depuisManquants() {
    const parId = new Map(articles.map((a) => [a.id, a]));
    setLignes(
      manquants.map((m) => {
        const a = parId.get(m.id);
        // Objectif : remonter au double du seuil, pour ne pas recommander
        // le même article la semaine suivante.
        const cible = Math.max(m.min_stock * 2 - m.stock_qty, 1);
        return {
          product_id: m.id,
          name: m.name,
          base_unit: m.base_unit,
          qty_base: String(Math.ceil(cible)),
          unit_cost_xof: a?.cost_price_xof ? String(a.cost_price_xof) : '',
        };
      }),
    );
    setOuvert(true);
  }

  function ajouterLigne(a: Article) {
    setLignes((cur) => [
      ...cur,
      {
        product_id: a.id,
        name: a.name,
        base_unit: a.base_unit,
        qty_base: '1',
        unit_cost_xof: a.cost_price_xof ? String(a.cost_price_xof) : '',
      },
    ]);
    setRecherche('');
  }

  const totalBrouillon = lignes.reduce(
    (s, l) =>
      s +
      (Number(l.qty_base.replace(',', '.')) || 0) *
        (Number(l.unit_cost_xof.replace(/\D/g, '')) || 0),
    0,
  );

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!peutEcrire) return;

    // Le prix d'achat n'est envoyé que par qui a le droit de le voir. Envoyer
    // un 0 « par défaut » depuis un compte qui n'y a pas accès faisait refuser
    // toute la requête par le serveur — le bon de commande était impossible à
    // enregistrer, sans que l'écran explique pourquoi.
    const propres = lignes
      .map((l) => ({
        product_id: l.product_id,
        qty_base: Number(l.qty_base.replace(',', '.')),
        ...(voitCouts
          ? { unit_cost_xof: Number(l.unit_cost_xof.replace(/\D/g, '')) || 0 }
          : {}),
      }))
      .filter((l) => Number.isFinite(l.qty_base) && l.qty_base > 0);

    if (propres.length === 0) {
      setErreur('Ajoute au moins une ligne.');
      return;
    }

    setBusy(true);
    setErreur(null);

    const { data, error } = await db
      .from('purchase_orders')
      .insert({
        supplier_id: fournisseurId || null,
        status: 'commande',
        total_xof: Math.round(totalBrouillon),
        note: note.trim() || null,
        ordered_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) {
      setErreur(error?.message ?? 'Création impossible.');
      setBusy(false);
      return;
    }

    const poId = (data as { id: string }).id;
    const { error: itemsErr } = await db
      .from('purchase_order_items')
      .insert(propres.map((l) => ({ ...l, purchase_order_id: poId })));

    if (itemsErr) {
      // Un bon sans ligne n'a aucun sens : on le retire.
      await db.from('purchase_orders').delete().eq('id', poId);
      setErreur(itemsErr.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    setOuvert(false);
    load();
  }

  async function ouvrirDetail(b: PurchaseOrder) {
    setDetail(b);
    setLignesBon(null);
    const { data } = await db
      .from('purchase_order_items')
      .select('id, product_id, qty_base, qty_received_base, unit_cost_xof, products(name, base_unit)')
      .eq('purchase_order_id', b.id);
    setLignesBon((data ?? []) as LigneBon[]);
  }

  /** Réception : entrée en stock + mise à jour du prix d'achat, en une transaction. */
  async function receptionner(b: PurchaseOrder) {
    const ok = window.confirm(
      `Réceptionner ${b.number} ?\n\nLes quantités restantes entrent en stock et le prix d'achat de référence est mis à jour.`,
    );
    if (!ok) return;

    setBusy(true);
    const { error } = await db.rpc('receive_purchase_order', { p_po_id: b.id });
    setBusy(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setDetail(null);
    load();
  }

  return (
    <>
      <PageHeader
        title="Commandes fournisseur"
        subtitle="On commande, puis on réceptionne. Pour la marchandise arrivée sans commande, passe par Arrivages."
        actions={
          peutEcrire ? (
            <>
              {manquants.length > 0 && (
                <button onClick={depuisManquants} className="btn-outline">
                  <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                  Depuis les manquants ({manquants.length})
                </button>
              )}
              <button onClick={ouvrirNouveau} className="btn-primary">
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nouveau bon
              </button>
            </>
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

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>N°</th>
              <th>Fournisseur</th>
              <th>Statut</th>
              <th>Date</th>
              {voitCouts && <th className="num">Montant</th>}
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
            ) : bons.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Aucun bon de commande. Pars des articles manquants pour en créer un.
                </td>
              </tr>
            ) : (
              bons.map((b) => (
                <tr key={b.id}>
                  <td>
                    <button
                      onClick={() => ouvrirDetail(b)}
                      className="font-mono text-[13px] font-medium hover:underline"
                    >
                      {b.number}
                    </button>
                  </td>
                  <td>{b.suppliers?.name ?? '—'}</td>
                  <td>
                    <span className={CLASSE[b.status]}>
                      {PURCHASE_STATUS_LABELS[b.status]}
                    </span>
                  </td>
                  <td style={{ color: 'rgb(var(--muted))' }}>
                    {dateShort(b.received_at ?? b.ordered_at ?? b.created_at)}
                  </td>
                  {voitCouts && <td className="num font-medium">{xof(b.total_xof)}</td>}
                  <td className="num">
                    {peutEcrire && b.status !== 'recu' && b.status !== 'annule' && (
                      <button
                        onClick={() => receptionner(b)}
                        className="btn-ghost"
                        disabled={busy}
                      >
                        <PackageCheck className="h-4 w-4" strokeWidth={1.75} />
                        Réceptionner
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Nouveau bon ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form onSubmit={enregistrer} className="surface mx-auto my-6 w-full max-w-2xl">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Nouveau bon de commande</span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label">Fournisseur</label>
                  <select
                    className="select"
                    value={fournisseurId}
                    onChange={(e) => setFournisseurId(e.target.value)}
                  >
                    <option value="">—</option>
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
                    placeholder="Délai annoncé, transporteur…"
                  />
                </div>
              </div>

              {/* Recherche d'article */}
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
                {recherche && (
                  <div className="mt-1 max-h-48 overflow-y-auto border" style={{ borderColor: 'rgb(var(--line))' }}>
                    {resultats.length === 0 ? (
                      <p className="p-3 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                        Aucun article.
                      </p>
                    ) : (
                      resultats.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => ajouterLigne(a)}
                          className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-[13px] hover:bg-[rgb(var(--surface-2))]"
                          style={{ borderColor: 'rgb(var(--line))' }}
                        >
                          <span>{a.name}</span>
                          <span style={{ color: 'rgb(var(--muted))' }}>
                            {fmtQty(a.stock_qty)} {a.base_unit}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Lignes */}
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
                        <th className="num">Quantité</th>
                        {voitCouts && <th className="num">Prix d’achat</th>}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l, i) => (
                        <tr key={l.product_id}>
                          <td>
                            <div className="text-[13px] font-medium">{l.name}</div>
                            <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                              en {l.base_unit}
                            </div>
                          </td>
                          <td className="num">
                            <input
                              className="input w-24 px-2 py-1 text-right"
                              inputMode="decimal"
                              value={l.qty_base}
                              onChange={(e) =>
                                setLignes((cur) =>
                                  cur.map((x, j) =>
                                    j === i ? { ...x, qty_base: e.target.value } : x,
                                  ),
                                )
                              }
                            />
                          </td>
                          {voitCouts && (
                            <td className="num">
                              <input
                                className="input w-28 px-2 py-1 text-right"
                                inputMode="numeric"
                                value={l.unit_cost_xof}
                                placeholder="0"
                                onChange={(e) =>
                                  setLignes((cur) =>
                                    cur.map((x, j) =>
                                      j === i
                                        ? {
                                            ...x,
                                            unit_cost_xof: e.target.value.replace(/\D/g, ''),
                                          }
                                        : x,
                                    ),
                                  )
                                }
                              />
                            </td>
                          )}
                          <td className="num">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() =>
                                setLignes((cur) => cur.filter((_, j) => j !== i))
                              }
                              aria-label="Retirer"
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

              {voitCouts && lignes.length > 0 && (
                <div className="flex justify-between text-lg font-bold">
                  <span>Total du bon</span>
                  <span className="tnum">{xof(totalBrouillon)}</span>
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
                {busy ? 'Enregistrement…' : 'Créer le bon'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- Détail d'un bon ---------- */}
      {detail && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="surface mx-auto my-6 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <div>
                <div className="font-mono font-semibold">{detail.number}</div>
                <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {detail.suppliers?.name ?? 'Sans fournisseur'} ·{' '}
                  {PURCHASE_STATUS_LABELS[detail.status]}
                </div>
              </div>
              <button onClick={() => setDetail(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            {lignesBon === null ? (
              <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                Chargement…
              </p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th className="num">Commandé</th>
                    <th className="num">Reçu</th>
                  </tr>
                </thead>
                <tbody>
                  {lignesBon.map((l) => (
                    <tr key={l.id}>
                      <td className="text-[13px]">{l.products?.name ?? '—'}</td>
                      <td className="num">
                        {fmtQty(l.qty_base)} {l.products?.base_unit}
                      </td>
                      <td className="num">
                        {l.qty_received_base >= l.qty_base ? (
                          <span className="badge badge-ok">complet</span>
                        ) : (
                          <span style={{ color: 'rgb(var(--muted))' }}>
                            {fmtQty(l.qty_received_base)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {peutEcrire && detail.status !== 'recu' && detail.status !== 'annule' && (
              <div
                className="flex justify-end gap-2 border-t px-5 py-3"
                style={{ borderColor: 'rgb(var(--line))' }}
              >
                <button onClick={() => receptionner(detail)} className="btn-primary" disabled={busy}>
                  <PackageCheck className="h-4 w-4" strokeWidth={1.75} />
                  Réceptionner
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
