'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, X, ArrowDownUp, AlertTriangle, History } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateTime, qty as fmtQty } from '@/lib/format';
import {
  MOVEMENT_LABELS,
  type StockMovement,
  type StockMovementKind,
} from '@/lib/types';

type Article = {
  id: string;
  sku: string | null;
  name: string;
  base_unit: string;
  stock_qty: number;
  min_stock: number | null;
  categories?: { name: string } | null;
};

// Ce que le magasinier corrige à la main. « vente » et « reception » sont
// exclus : ils naissent d'une vente ou d'un bon de commande, jamais d'une
// saisie libre — sinon le stock et les documents divergent.
const MOTIFS: StockMovementKind[] = ['inventaire', 'ajustement', 'casse', 'retour'];

export default function StockPage() {
  const peutEcrire = useCanWrite('stock');

  const [articles, setArticles] = useState<Article[]>([]);
  const [seuilDefaut, setSeuilDefaut] = useState(5);
  const [recherche, setRecherche] = useState('');
  const [basSeulement, setBasSeulement] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [cible, setCible] = useState<Article | null>(null);
  const [motif, setMotif] = useState<StockMovementKind>('inventaire');
  const [valeur, setValeur] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const [historique, setHistorique] = useState<StockMovement[] | null>(null);
  const [articleHisto, setArticleHisto] = useState<Article | null>(null);

  // Ce que les coupures réseau ont coûté en exactitude. Hors ligne, la caisse
  // vend sans pouvoir contrôler le stock : l'écart atterrit ici, et c'est au
  // dépôt de le régulariser.
  const [negatifs, setNegatifs] = useState<
    { id: string; name: string; base_unit: string; stock_qty: number }[]
  >([]);

  const load = useCallback(async () => {
    const [p, s, neg] = await Promise.all([
      db
        .from('products')
        .select(
          'id, sku, name, base_unit, stock_qty, min_stock, categories(name)',
        )
        .eq('active', true)
        .order('name'),
      db.from('shop_settings').select('default_min_stock').eq('id', 1).maybeSingle(),
      db.from('v_stock_negatif').select('id, name, base_unit, stock_qty'),
    ]);
    setErreur(p.error?.message ?? null);
    setArticles((p.data ?? []) as Article[]);
    setNegatifs(
      (neg.data ?? []) as { id: string; name: string; base_unit: string; stock_qty: number }[],
    );
    if (s.data) setSeuilDefaut(Number((s.data as { default_min_stock: number }).default_min_stock));
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('stock'))
      .on('postgres_changes', { table: 'products' }, load)
      .on('postgres_changes', { table: 'stock_movements' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const seuilDe = useCallback(
    (a: Article) => (a.min_stock == null ? seuilDefaut : a.min_stock),
    [seuilDefaut],
  );

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return articles.filter((a) => {
      if (basSeulement && a.stock_qty > seuilDe(a)) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) || (a.sku ?? '').toLowerCase().includes(q)
      );
    });
  }, [articles, recherche, basSeulement, seuilDe]);

  const nbBas = articles.filter((a) => a.stock_qty <= seuilDe(a)).length;

  function ouvrirCorrection(a: Article) {
    setCible(a);
    setMotif('inventaire');
    setValeur('');
    setNote('');
  }

  /**
   * « Inventaire » saisit le stock RÉEL compté ; les autres motifs saisissent
   * un écart. Dans les deux cas on écrit un mouvement signé : le solde reste
   * dérivé du grand livre, jamais réécrit à la main.
   */
  async function appliquer(e: React.FormEvent) {
    e.preventDefault();
    if (!cible || !peutEcrire) return;

    const saisi = Number(valeur.replace(',', '.'));
    if (!Number.isFinite(saisi)) {
      setErreur('Quantité invalide.');
      return;
    }

    const delta =
      motif === 'inventaire'
        ? saisi - cible.stock_qty
        : motif === 'retour'
          ? Math.abs(saisi)
          : -Math.abs(saisi);

    if (delta === 0) {
      setCible(null);
      return;
    }

    setBusy(true);
    setErreur(null);
    const { error } = await db.from('stock_movements').insert({
      product_id: cible.id,
      qty_base: delta,
      kind: motif,
      note: note.trim() || null,
    });
    setBusy(false);

    if (error) {
      setErreur(error.message);
      return;
    }
    setCible(null);
    load();
  }

  async function voirHistorique(a: Article) {
    setArticleHisto(a);
    setHistorique(null);
    const { data, error } = await db
      .from('stock_movements')
      .select('id, product_id, qty_base, kind, ref_table, ref_id, note, created_at')
      .eq('product_id', a.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) setErreur(error.message);
    setHistorique((data ?? []) as StockMovement[]);
  }

  return (
    <>
      <PageHeader
        title="Stock"
        subtitle={`${articles.length} articles actifs · ${nbBas} sous le seuil`}
        actions={
          <button
            onClick={() => setBasSeulement((v) => !v)}
            className={basSeulement ? 'btn-primary' : 'btn-outline'}
          >
            <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
            {basSeulement ? 'Tout afficher' : 'Sous le seuil'}
          </button>
        }
      />

      {negatifs.length > 0 && (
        <div
          className="mb-4 border p-3 text-sm"
          style={{
            borderColor: 'rgb(var(--warn) / 0.5)',
            background: 'rgb(var(--warn) / 0.08)',
          }}
        >
          <strong style={{ color: 'rgb(var(--warn))' }}>
            {negatifs.length} article{negatifs.length > 1 ? 's' : ''} en stock négatif.
          </strong>{' '}
          Une vente hors ligne a sorti plus de marchandise que le stock n’en
          comptait. Compte le rayon et saisis un ajustement : tant que le solde
          est négatif, les alertes de réapprovisionnement sont fausses.
          <ul className="mt-2 space-y-0.5">
            {negatifs.slice(0, 6).map((n) => (
              <li key={n.id} className="tnum">
                {n.name} — {n.stock_qty} {n.base_unit}
              </li>
            ))}
            {negatifs.length > 6 && <li>… et {negatifs.length - 6} autres.</li>}
          </ul>
        </div>
      )}

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
          placeholder="Chercher un article…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
        />
      </div>

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Article</th>
              <th>Rayon</th>
              <th className="num">En stock</th>
              <th className="num">Seuil</th>
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
            ) : filtres.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  {basSeulement ? 'Rien sous le seuil. Le dépôt est à jour.' : 'Aucun article.'}
                </td>
              </tr>
            ) : (
              filtres.map((a) => {
                const seuil = seuilDe(a);
                const bas = a.stock_qty <= seuil;
                const rupture = a.stock_qty <= 0;
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="font-medium">{a.name}</div>
                      {a.sku && (
                        <div
                          className="font-mono text-[12px]"
                          style={{ color: 'rgb(var(--muted))' }}
                        >
                          {a.sku}
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'rgb(var(--muted))' }}>
                      {a.categories?.name ?? '—'}
                    </td>
                    <td className="num">
                      <span
                        className={
                          rupture
                            ? 'badge badge-danger'
                            : bas
                              ? 'badge badge-warn'
                              : 'badge badge-ok'
                        }
                      >
                        {fmtQty(a.stock_qty)} {a.base_unit}
                      </span>
                    </td>
                    <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                      {fmtQty(seuil)}
                    </td>
                    <td className="num">
                      <button onClick={() => voirHistorique(a)} className="btn-ghost">
                        <History className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                      {peutEcrire && (
                        <button onClick={() => ouvrirCorrection(a)} className="btn-ghost">
                          <ArrowDownUp className="h-4 w-4" strokeWidth={1.75} />
                          Corriger
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

      {/* ---------- Correction ---------- */}
      {cible && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4">
          <form onSubmit={appliquer} className="surface mt-10 w-full max-w-sm">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Corriger le stock</span>
              <button type="button" onClick={() => setCible(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <div className="font-medium">{cible.name}</div>
                <div className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                  Actuellement {fmtQty(cible.stock_qty)} {cible.base_unit}
                </div>
              </div>

              <div>
                <label className="label">Motif</label>
                <select
                  className="select"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value as StockMovementKind)}
                >
                  {MOTIFS.map((m) => (
                    <option key={m} value={m}>
                      {MOVEMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">
                  {motif === 'inventaire'
                    ? `Stock réel compté (${cible.base_unit})`
                    : `Quantité (${cible.base_unit})`}
                </label>
                <input
                  className="input input-lg"
                  inputMode="decimal"
                  value={valeur}
                  onChange={(e) => setValeur(e.target.value)}
                  autoFocus
                  required
                />
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {motif === 'inventaire'
                    ? 'Le mouvement enregistré sera l’écart avec le stock actuel.'
                    : motif === 'retour'
                      ? 'Entrée en stock (retour client).'
                      : 'Sortie de stock.'}
                </p>
              </div>

              <div>
                <label className="label">Note</label>
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Facultatif"
                />
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setCible(null)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Appliquer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ---------- Historique ---------- */}
      {articleHisto && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4"
          onClick={() => setArticleHisto(null)}
        >
          <div
            className="surface mt-10 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Mouvements · {articleHisto.name}</span>
              <button onClick={() => setArticleHisto(null)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {historique === null ? (
                <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </p>
              ) : historique.length === 0 ? (
                <p className="p-8 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
                  Aucun mouvement enregistré.
                </p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Motif</th>
                      <th className="num">Qté</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historique.map((m) => (
                      <tr key={m.id}>
                        <td className="text-[13px]">{dateTime(m.created_at)}</td>
                        <td>
                          <span className="badge">{MOVEMENT_LABELS[m.kind]}</span>
                          {m.note && (
                            <div
                              className="mt-0.5 text-[12px]"
                              style={{ color: 'rgb(var(--muted))' }}
                            >
                              {m.note}
                            </div>
                          )}
                        </td>
                        <td
                          className="num font-semibold"
                          style={{
                            color:
                              m.qty_base > 0 ? 'rgb(var(--ok))' : 'rgb(var(--danger))',
                          }}
                        >
                          {m.qty_base > 0 ? '+' : ''}
                          {fmtQty(m.qty_base)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
