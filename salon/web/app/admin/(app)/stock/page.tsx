'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, AlertTriangle, Package } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { Product, Sector, Category } from '@/lib/types';

type Form = {
  id?: string;
  name: string;
  sku: string;
  brand: string;
  price_xof: number;
  cost_xof: number;
  stock: number;
  low_stock_threshold: number;
  sector_id: string;
  category_id: string;
};

const EMPTY: Form = {
  name: '',
  sku: '',
  brand: '',
  price_xof: 0,
  cost_xof: 0,
  stock: 0,
  low_stock_threshold: 5,
  sector_id: '',
  category_id: '',
};

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Form | null>(null);
  const [filter, setFilter] = useState<'all' | 'low' | string>('all');

  async function load() {
    const [{ data: p }, { data: s }, { data: c }] = await Promise.all([
      supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('name'),
      supabase.from('sectors').select('*').eq('active', true).order('display_order'),
      supabase
        .from('categories')
        .select('*')
        .eq('kind', 'product')
        .eq('active', true)
        .order('display_order'),
    ]);
    setProducts((p as Product[]) || []);
    setSectors((s as Sector[]) || []);
    setCategories((c as Category[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('stock-admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const stats = useMemo(() => {
    const totalValue = products.reduce((s, p) => s + p.stock * p.price_xof, 0);
    const lowStock = products.filter((p) => p.stock <= p.low_stock_threshold);
    return { count: products.length, totalValue, low: lowStock.length };
  }, [products]);

  const filtered = useMemo(() => {
    if (filter === 'all') return products;
    if (filter === 'low')
      return products.filter((p) => p.stock <= p.low_stock_threshold);
    return products.filter((p) => p.sector_id === filter);
  }, [products, filter]);

  async function save(f: Form) {
    const payload = {
      name: f.name.trim(),
      sku: f.sku.trim() || null,
      brand: f.brand.trim() || null,
      price_xof: f.price_xof,
      cost_xof: f.cost_xof,
      stock: f.stock,
      low_stock_threshold: f.low_stock_threshold,
      sector_id: f.sector_id || null,
      category_id: f.category_id || null,
    };
    if (f.id) {
      await supabase.from('products').update(payload).eq('id', f.id);
    } else {
      await supabase.from('products').insert(payload);
    }
    setEditing(null);
  }

  async function remove(p: Product) {
    if (!confirm(`Retirer "${p.name}" du stock ?`)) return;
    await supabase.from('products').update({ active: false }).eq('id', p.id);
  }

  async function adjust(p: Product, delta: number) {
    await supabase
      .from('products')
      .update({ stock: Math.max(0, p.stock + delta) })
      .eq('id', p.id);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Catalogue"
        title="Stock &"
        italic="produits"
        description="Inventaire des produits revendus et utilisés en cabine. Alerte automatique sous le seuil."
        right={
          <button onClick={() => setEditing(EMPTY)} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Ajouter un produit
          </button>
        }
      />

      <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
        <Stat label="Références actives" value={String(stats.count)} />
        <Stat label="Valeur du stock" value={`${fmt(stats.totalValue)} FCFA`} />
        <Stat
          label="Sous le seuil"
          value={String(stats.low)}
          note={stats.low > 0 ? 'à reconstituer' : 'tout est OK'}
          danger={stats.low > 0}
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterPill active={filter === 'all'} onClick={() => setFilter('all')}>
          Tous
        </FilterPill>
        <FilterPill
          active={filter === 'low'}
          onClick={() => setFilter('low')}
          badge={stats.low > 0 ? stats.low : undefined}
        >
          Faible stock
        </FilterPill>
        {sectors.map((s) => (
          <FilterPill
            key={s.id}
            active={filter === s.id}
            onClick={() => setFilter(s.id)}
          >
            {s.name}
          </FilterPill>
        ))}
      </div>

      {/* Form modale (inline) */}
      {editing && (
        <ProductForm
          form={editing}
          sectors={sectors}
          categories={categories}
          onChange={setEditing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {/* Liste */}
      {filtered.length === 0 ? (
        <div
          className="border border-dashed py-16 text-center text-[13px]"
          style={{
            borderColor: 'rgb(var(--line))',
            color: 'rgb(var(--muted))',
          }}
        >
          <Package className="mx-auto mb-3 h-5 w-5" strokeWidth={1.5} />
          {filter === 'all'
            ? 'Aucun produit pour le moment.'
            : 'Aucun produit pour ce filtre.'}
        </div>
      ) : (
        <div
          className="grid gap-px bg-[rgb(var(--line))]"
          style={{ gridTemplateColumns: '1fr' }}
        >
          {filtered.map((p) => {
            const low = p.stock <= p.low_stock_threshold;
            const sector = p.sector_id ? sectorById.get(p.sector_id) : null;
            const cat = p.category_id ? catById.get(p.category_id) : null;
            return (
              <div
                key={p.id}
                className="bg-[rgb(var(--bg))] flex flex-wrap items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[17px] font-medium tracking-tight">
                      {p.name}
                    </span>
                    {low && (
                      <AlertTriangle
                        className="h-3.5 w-3.5"
                        strokeWidth={1.5}
                        style={{ color: '#a52a2a' }}
                      />
                    )}
                  </div>
                  <div
                    className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em]"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    {p.brand && <span>{p.brand}</span>}
                    {sector && <span>· {sector.name}</span>}
                    {cat && <span>· {cat.name}</span>}
                    {p.sku && <span>· {p.sku}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adjust(p, -1)}
                    aria-label="Retirer 1"
                    className="border h-7 w-7 text-[13px] tabular-nums hover:bg-[rgb(var(--surface-2))]"
                    style={{ borderColor: 'rgb(var(--line))' }}
                  >
                    −
                  </button>
                  <span
                    className="font-display tabular-nums w-10 text-center text-[18px]"
                    style={{ color: low ? '#a52a2a' : 'rgb(var(--ink))' }}
                  >
                    {p.stock}
                  </span>
                  <button
                    onClick={() => adjust(p, +1)}
                    aria-label="Ajouter 1"
                    className="border h-7 w-7 text-[13px] tabular-nums hover:bg-[rgb(var(--surface-2))]"
                    style={{ borderColor: 'rgb(var(--line))' }}
                  >
                    +
                  </button>
                </div>

                <div
                  className="font-display text-[15px] tabular-nums w-28 text-right"
                  style={{ color: 'rgb(var(--ink))' }}
                >
                  {fmt(p.price_xof)}
                  <span
                    className="ml-1 text-[10px] uppercase tracking-[0.18em]"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    FCFA
                  </span>
                </div>

                <button
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      name: p.name,
                      sku: p.sku ?? '',
                      brand: p.brand ?? '',
                      price_xof: p.price_xof,
                      cost_xof: p.cost_xof,
                      stock: p.stock,
                      low_stock_threshold: p.low_stock_threshold,
                      sector_id: p.sector_id ?? '',
                      category_id: p.category_id ?? '',
                    })
                  }
                  className="text-[11px] uppercase tracking-[0.24em] underline-anim"
                >
                  Éditer
                </button>
                <button
                  onClick={() => remove(p)}
                  aria-label="Supprimer"
                  className="opacity-50 hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  danger,
}: {
  label: string;
  value: string;
  note?: string;
  danger?: boolean;
}) {
  return (
    <div className="bg-[rgb(var(--bg))] p-6">
      <div
        className="font-display text-3xl font-medium tracking-tight tabular-nums"
        style={{ color: danger ? '#a52a2a' : 'rgb(var(--ink))' }}
      >
        {value}
      </div>
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

function FilterPill({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="border px-3 py-1.5 text-[11px] uppercase tracking-[0.24em] transition-colors"
      style={{
        borderColor: 'rgb(var(--line))',
        background: active ? 'rgb(var(--ink))' : 'transparent',
        color: active ? 'rgb(var(--bg))' : 'rgb(var(--ink))',
      }}
    >
      {children}
      {badge !== undefined && (
        <span
          className="ml-2 px-1.5 py-0.5 rounded-full text-[9px]"
          style={{
            background: active ? 'rgba(255,255,255,0.2)' : 'rgb(var(--surface-2))',
            color: active ? 'rgb(var(--bg))' : 'rgb(var(--ink))',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function ProductForm({
  form,
  sectors,
  categories,
  onChange,
  onSave,
  onCancel,
}: {
  form: Form;
  sectors: Sector[];
  categories: Category[];
  onChange: (f: Form) => void;
  onSave: (f: Form) => void;
  onCancel: () => void;
}) {
  const cats = form.sector_id
    ? categories.filter((c) => c.sector_id === form.sector_id)
    : categories;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className="surface space-y-5 p-6"
    >
      <div className="eyebrow">{form.id ? 'Éditer' : 'Nouveau produit'}</div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom" required>
          <input
            className="input"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="Marque">
          <input
            className="input"
            value={form.brand}
            onChange={(e) => onChange({ ...form, brand: e.target.value })}
          />
        </Field>

        <Field label="Secteur">
          <select
            className="input"
            value={form.sector_id}
            onChange={(e) =>
              onChange({ ...form, sector_id: e.target.value, category_id: '' })
            }
          >
            <option value="">—</option>
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Catégorie">
          <select
            className="input"
            value={form.category_id}
            onChange={(e) => onChange({ ...form, category_id: e.target.value })}
            disabled={!form.sector_id}
          >
            <option value="">—</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prix vente (FCFA)" required>
          <input
            type="number"
            className="input"
            value={form.price_xof}
            onChange={(e) =>
              onChange({ ...form, price_xof: parseInt(e.target.value || '0', 10) })
            }
            required
            min={0}
          />
        </Field>
        <Field label="Prix achat (FCFA)">
          <input
            type="number"
            className="input"
            value={form.cost_xof}
            onChange={(e) =>
              onChange({ ...form, cost_xof: parseInt(e.target.value || '0', 10) })
            }
            min={0}
          />
        </Field>

        <Field label="Stock actuel" required>
          <input
            type="number"
            className="input"
            value={form.stock}
            onChange={(e) =>
              onChange({ ...form, stock: parseInt(e.target.value || '0', 10) })
            }
            required
            min={0}
          />
        </Field>
        <Field label="Seuil d'alerte">
          <input
            type="number"
            className="input"
            value={form.low_stock_threshold}
            onChange={(e) =>
              onChange({
                ...form,
                low_stock_threshold: parseInt(e.target.value || '0', 10),
              })
            }
            min={0}
          />
        </Field>

        <Field label="SKU (optionnel)">
          <input
            className="input"
            value={form.sku}
            onChange={(e) => onChange({ ...form, sku: e.target.value })}
            placeholder="ex. SH-OLA-250"
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" className="btn-primary">
          Enregistrer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] uppercase tracking-[0.24em] underline-anim"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block mb-2 text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
        {required && ' *'}
      </span>
      {children}
    </label>
  );
}
