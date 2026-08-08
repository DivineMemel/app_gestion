'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, X, Trash2, PackagePlus } from 'lucide-react';
import { db, uniqueChannel } from '@/lib/admin-db';
import { useCanSeeCosts, useCanWrite } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';
import { qty as fmtQty, slugify, xof } from '@/lib/format';
import type { Category, ProductUnit } from '@/lib/types';

type Ligne = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  base_unit: string;
  stock_qty: number;
  min_stock: number | null;
  cost_price_xof?: number;
  image_url: string | null;
  is_service: boolean;
  active: boolean;
  published: boolean;
  product_units: ProductUnit[];
};

type UniteBrouillon = {
  id?: string;
  label: string;
  factor: string;
  price_xof: string;
  is_default: boolean;
};

const VIDE = {
  sku: '',
  name: '',
  description: '',
  category_id: '',
  base_unit: 'pièce',
  min_stock: '',
  cost_price_xof: '',
  image_url: null as string | null,
  is_service: false,
  active: true,
  published: true,
};

export default function ProduitsPage() {
  const peutEcrire = useCanWrite('produits');
  const voitCouts = useCanSeeCosts();

  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [rayons, setRayons] = useState<Category[]>([]);
  const [recherche, setRecherche] = useState('');
  const [rayonFiltre, setRayonFiltre] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  const [ouvert, setOuvert] = useState(false);
  const [edition, setEdition] = useState<Ligne | null>(null);
  const [form, setForm] = useState({ ...VIDE });
  const [unites, setUnites] = useState<UniteBrouillon[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([
      db
        .from('products')
        .select(
          'id, sku, name, description, category_id, base_unit, stock_qty, min_stock, cost_price_xof, image_url, is_service, active, published, product_units(id, product_id, label, factor, price_xof, is_default, position)',
        )
        .order('name'),
      db.from('categories').select('*').order('position'),
    ]);
    setErreur(p.error?.message ?? c.error?.message ?? null);
    setLignes((p.data ?? []) as Ligne[]);
    setRayons((c.data ?? []) as Category[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('produits'))
      .on('postgres_changes', { table: 'products' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const filtrees = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return lignes.filter((l) => {
      if (rayonFiltre && l.category_id !== rayonFiltre) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) || (l.sku ?? '').toLowerCase().includes(q)
      );
    });
  }, [lignes, recherche, rayonFiltre]);

  function ouvrirNouveau() {
    setEdition(null);
    setForm({ ...VIDE });
    setUnites([{ label: 'pièce', factor: '1', price_xof: '', is_default: true }]);
    setOuvert(true);
  }

  function ouvrirEdition(l: Ligne) {
    setEdition(l);
    setForm({
      sku: l.sku ?? '',
      name: l.name,
      description: l.description ?? '',
      category_id: l.category_id ?? '',
      base_unit: l.base_unit,
      min_stock: l.min_stock == null ? '' : String(l.min_stock),
      cost_price_xof: l.cost_price_xof == null ? '' : String(l.cost_price_xof),
      image_url: l.image_url,
      is_service: l.is_service,
      active: l.active,
      published: l.published,
    });
    setUnites(
      [...(l.product_units ?? [])]
        .sort((a, b) => a.position - b.position || Number(a.factor) - Number(b.factor))
        .map((u) => ({
          id: u.id,
          label: u.label,
          factor: String(u.factor),
          price_xof: String(u.price_xof),
          is_default: u.is_default,
        })),
    );
    setOuvert(true);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!peutEcrire) return;

    const propres = unites
      .map((u) => ({
        ...u,
        label: u.label.trim(),
        factorNum: Number(u.factor.replace(',', '.')),
        prixNum: Number(u.price_xof.replace(/\D/g, '')),
      }))
      .filter((u) => u.label && Number.isFinite(u.factorNum) && u.factorNum > 0);

    if (propres.length === 0) {
      setErreur('Il faut au moins une unité de vente avec son prix.');
      return;
    }
    if (!propres.some((u) => u.is_default)) propres[0].is_default = true;

    setBusy(true);
    setErreur(null);

    const payload: Record<string, unknown> = {
      sku: form.sku.trim() || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      category_id: form.category_id || null,
      base_unit: form.base_unit.trim() || 'pièce',
      min_stock: form.min_stock === '' ? null : Number(form.min_stock),
      image_url: form.image_url,
      is_service: form.is_service,
      // Une prestation n'a pas de seuil d'alerte : elle n'entre pas en réappro.
      active: form.active,
      published: form.published,
    };
    // Le prix d'achat n'est envoyé que si le rôle a le droit d'y toucher —
    // sinon le serveur rejette la requête entière.
    if (voitCouts) {
      payload.cost_price_xof = Number(form.cost_price_xof.replace(/\D/g, '')) || 0;
    }

    let produitId = edition?.id ?? null;

    if (edition) {
      const { error } = await db.from('products').update(payload).eq('id', edition.id);
      if (error) {
        setErreur(error.message);
        setBusy(false);
        return;
      }
    } else {
      const { data, error } = await db
        .from('products')
        .insert(payload)
        .select('id')
        .single();
      if (error || !data) {
        setErreur(error?.message ?? 'Création impossible.');
        setBusy(false);
        return;
      }
      produitId = (data as { id: string }).id;
    }

    if (produitId) {
      // Les unités retirées de la liste doivent disparaître en base.
      const gardees = propres.filter((u) => u.id).map((u) => u.id as string);
      const aSupprimer = (edition?.product_units ?? [])
        .filter((u) => !gardees.includes(u.id))
        .map((u) => u.id);
      for (const id of aSupprimer) {
        await db.from('product_units').delete().eq('id', id);
      }

      for (const [i, u] of propres.entries()) {
        const row = {
          product_id: produitId,
          label: u.label,
          factor: u.factorNum,
          price_xof: u.prixNum,
          is_default: u.is_default,
          position: i,
        };
        const { error } = u.id
          ? await db.from('product_units').update(row).eq('id', u.id)
          : await db.from('product_units').insert(row);
        if (error) {
          setErreur(error.message);
          setBusy(false);
          return;
        }
      }
    }

    setBusy(false);
    setOuvert(false);
    load();
  }

  return (
    <>
      <PageHeader
        title="Produits"
        subtitle={`${lignes.length} référence${lignes.length > 1 ? 's' : ''}`}
        actions={
          peutEcrire ? (
            <button onClick={ouvrirNouveau} className="btn-primary">
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nouvel article
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

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            strokeWidth={1.75}
            style={{ color: 'rgb(var(--muted))' }}
          />
          <input
            className="input pl-10"
            placeholder="Chercher un article ou une référence…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
        <select
          className="select w-auto"
          value={rayonFiltre}
          onChange={(e) => setRayonFiltre(e.target.value)}
        >
          <option value="">Tous les rayons</option>
          {rayons.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Article</th>
              <th>Rayon</th>
              <th className="num">Stock</th>
              <th>Unités de vente</th>
              {voitCouts && <th className="num">Achat</th>}
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
            ) : filtrees.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Aucun article. Commence par créer une référence.
                </td>
              </tr>
            ) : (
              filtrees.map((l) => {
                const rayon = rayons.find((r) => r.id === l.category_id);
                const unites = [...(l.product_units ?? [])].sort(
                  (a, b) => Number(b.is_default) - Number(a.is_default),
                );
                return (
                  <tr key={l.id}>
                    <td>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                        {l.sku && <span className="font-mono">{l.sku}</span>}
                        {l.is_service && (
                          <span className="ml-2 badge badge-accent">Prestation</span>
                        )}
                        {!l.active && <span className="ml-2 badge">Inactif</span>}
                        {l.active && !l.published && (
                          <span className="ml-2 badge">Hors vitrine</span>
                        )}
                      </div>
                    </td>
                    <td style={{ color: 'rgb(var(--muted))' }}>{rayon?.name ?? '—'}</td>
                    <td className="num">
                      {fmtQty(l.stock_qty)}{' '}
                      <span style={{ color: 'rgb(var(--muted))' }}>{l.base_unit}</span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {unites.length === 0 ? (
                          <span className="badge badge-warn">Aucun prix</span>
                        ) : (
                          unites.map((u) => (
                            <span key={u.id} className="badge">
                              {u.label} · {xof(u.price_xof)}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    {voitCouts && (
                      <td className="num" style={{ color: 'rgb(var(--muted))' }}>
                        {l.cost_price_xof ? xof(l.cost_price_xof) : '—'}
                      </td>
                    )}
                    <td className="num">
                      {peutEcrire && (
                        <button onClick={() => ouvrirEdition(l)} className="btn-ghost">
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

      {/* ---------- Formulaire ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form
            onSubmit={enregistrer}
            className="surface mx-auto my-6 w-full max-w-2xl"
          >
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">
                {edition ? 'Modifier l’article' : 'Nouvel article'}
              </span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">Désignation</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((f) => ({
                      ...f,
                      name,
                      // Référence proposée tant qu'on n'y a pas touché.
                      sku: !edition && (!f.sku || f.sku === slugify(f.name).toUpperCase())
                        ? slugify(name).toUpperCase().slice(0, 24)
                        : f.sku,
                    }));
                  }}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="label">Référence (SKU)</label>
                <input
                  className="input font-mono"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                />
              </div>

              <div>
                <label className="label">Rayon</label>
                <select
                  className="select"
                  value={form.category_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category_id: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {rayons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Unité de stock</label>
                <input
                  className="input"
                  value={form.base_unit}
                  onChange={(e) => setForm((f) => ({ ...f, base_unit: e.target.value }))}
                  placeholder="sac, barre, pièce, kg, m³…"
                />
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  L’unité dans laquelle le stock est compté.
                </p>
              </div>

              <div>
                <label className="label">Seuil d’alerte</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={form.min_stock}
                  onChange={(e) => setForm((f) => ({ ...f, min_stock: e.target.value }))}
                  placeholder="défaut des réglages"
                />
              </div>

              {voitCouts && (
                <div>
                  <label className="label">Prix d’achat (F)</label>
                  <input
                    className="input"
                    inputMode="numeric"
                    value={form.cost_price_xof}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        cost_price_xof: e.target.value.replace(/\D/g, ''),
                      }))
                    }
                  />
                  <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                    Par unité de stock. Sert au calcul de marge.
                  </p>
                </div>
              )}

              <div className="sm:col-span-2">
                <ImageUpload
                  label="Photo"
                  folder="products"
                  value={form.image_url}
                  onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
                  aide="Utile pour la vitrine (déco, sanitaire). Inutile sur un sac de ciment."
                />
              </div>

              <label className="flex items-start gap-3 sm:col-span-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.is_service}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, is_service: e.target.checked }))
                  }
                />
                <span>
                  <span className="block text-sm font-medium">
                    Prestation (pas de stock)
                  </span>
                  <span className="block text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                    Pose, forfait d’installation, terrassement, main-d’œuvre. Se
                    vend sans contrôle de stock, n’entre ni dans l’inventaire ni
                    dans les alertes de réappro.
                  </span>
                </span>
              </label>

              <div className="flex items-end gap-4 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Actif en caisse
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.published}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, published: e.target.checked }))
                    }
                  />
                  Visible sur la boutique en ligne
                </label>
              </div>

              {/* ---- Unités de vente ---- */}
              <div className="sm:col-span-2">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label mb-0">Unités de vente & prix</span>
                  <button
                    type="button"
                    className="btn-ghost text-[12px]"
                    onClick={() =>
                      setUnites((u) => [
                        ...u,
                        {
                          label: '',
                          factor: '1',
                          price_xof: '',
                          is_default: u.length === 0,
                        },
                      ])
                    }
                  >
                    <PackagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Ajouter
                  </button>
                </div>

                <p className="mb-2 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Le facteur dit combien d’unités de stock contient l’unité vendue.
                  Ex. « palette » = 40 sacs → facteur 40.
                </p>

                <div className="space-y-2">
                  {unites.map((u, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2">
                      <div className="min-w-32 flex-1">
                        <label className="label">Libellé</label>
                        <input
                          className="input"
                          value={u.label}
                          placeholder="sac, palette, botte…"
                          onChange={(e) =>
                            setUnites((cur) =>
                              cur.map((x, j) =>
                                j === i ? { ...x, label: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="w-24">
                        <label className="label">Facteur</label>
                        <input
                          className="input"
                          inputMode="decimal"
                          value={u.factor}
                          onChange={(e) =>
                            setUnites((cur) =>
                              cur.map((x, j) =>
                                j === i ? { ...x, factor: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <div className="w-32">
                        <label className="label">Prix (F)</label>
                        <input
                          className="input"
                          inputMode="numeric"
                          value={u.price_xof}
                          onChange={(e) =>
                            setUnites((cur) =>
                              cur.map((x, j) =>
                                j === i
                                  ? { ...x, price_xof: e.target.value.replace(/\D/g, '') }
                                  : x,
                              ),
                            )
                          }
                        />
                      </div>
                      <label className="flex items-center gap-1.5 pb-2.5 text-[12px]">
                        <input
                          type="radio"
                          name="unite-defaut"
                          checked={u.is_default}
                          onChange={() =>
                            setUnites((cur) =>
                              cur.map((x, j) => ({ ...x, is_default: j === i })),
                            )
                          }
                        />
                        défaut
                      </label>
                      <button
                        type="button"
                        className="btn-ghost pb-2.5"
                        onClick={() =>
                          setUnites((cur) => cur.filter((_, j) => j !== i))
                        }
                        aria-label="Retirer l’unité"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  ))}
                </div>
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
