'use client';
import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { Service, Sector, Category } from '@/lib/types';

type Form = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  price_xof: number;
  duration_min: number;
  sector_id: string;
  category_id: string;
};

const EMPTY: Form = {
  slug: '',
  name: '',
  description: '',
  price_xof: 0,
  duration_min: 60,
  sector_id: '',
  category_id: '',
};

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Form | null>(null);
  const [filter, setFilter] = useState<string | 'all'>('all');

  async function load() {
    const [{ data: s }, { data: sec }, { data: c }] = await Promise.all([
      supabase.from('services').select('*').order('display_order', { ascending: true }),
      supabase.from('sectors').select('*').eq('active', true).order('display_order'),
      supabase.from('categories').select('*').eq('active', true).order('display_order'),
    ]);
    setServices((s as Service[]) || []);
    setSectors((sec as Sector[]) || []);
    setCategories((c as Category[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('services-admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(
    () => (filter === 'all' ? services : services.filter((s) => s.sector_id === filter)),
    [services, filter],
  );

  const sectorById = useMemo(() => new Map(sectors.map((s) => [s.id, s])), [sectors]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  async function save(form: Form) {
    const slug = form.slug.trim().toLowerCase().replace(/\s+/g, '_');
    const payload = {
      slug,
      name: form.name.trim(),
      description: form.description.trim() || null,
      price_xof: Number(form.price_xof) || 0,
      duration_min: Number(form.duration_min) || 60,
      sector_id: form.sector_id || null,
      category_id: form.category_id || null,
      active: true,
    };
    if (form.id) {
      await supabase.from('services').update(payload).eq('id', form.id);
    } else {
      await supabase.from('services').insert({ ...payload, display_order: services.length });
    }
    setEditing(null);
  }

  async function remove(s: Service) {
    if (!confirm(`Supprimer le service "${s.name}" ?`)) return;
    await supabase.from('services').delete().eq('id', s.id);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Catalogue"
        title="Services &"
        italic="prestations"
        description="Toutes tes prestations, classées par secteur. Chaque service est rattaché à une catégorie."
        right={
          <button onClick={() => setEditing({ ...EMPTY })} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Nouveau service
          </button>
        }
      />

      {/* Filtres par secteur */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition-all ${
            filter === 'all'
              ? 'bg-[rgb(var(--ink))] text-[rgb(var(--bg))]'
              : 'border border-[rgb(var(--line-strong))] text-[rgb(var(--ink-soft))] hover:border-[rgb(var(--ink))]'
          }`}
        >
          Tous · {services.length}
        </button>
        {sectors.map((sec) => {
          const count = services.filter((s) => s.sector_id === sec.id).length;
          return (
            <button
              key={sec.id}
              onClick={() => setFilter(sec.id)}
              className={`px-4 py-2 text-[11px] uppercase tracking-[0.24em] transition-all ${
                filter === sec.id
                  ? 'bg-[rgb(var(--ink))] text-[rgb(var(--bg))]'
                  : 'border border-[rgb(var(--line-strong))] text-[rgb(var(--ink-soft))] hover:border-[rgb(var(--ink))]'
              }`}
            >
              {sec.name} · {count}
            </button>
          );
        })}
      </div>

      {editing && (
        <ServiceForm
          form={editing}
          sectors={sectors}
          categories={categories}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading && <div className="text-sm text-muted">Chargement…</div>}

      {!loading && filtered.length === 0 && (
        <div className="surface px-6 py-12 text-center text-sm text-muted">
          Aucun service. Crée le premier.
        </div>
      )}

      <ul className="divide-y" style={{ borderColor: 'rgb(var(--line))' }}>
        {filtered.map((s, i) => {
          const sec = s.sector_id ? sectorById.get(s.sector_id) : null;
          const cat = s.category_id ? catById.get(s.category_id) : null;
          return (
            <li
              key={s.id}
              className="grid grid-cols-12 items-baseline gap-4 border-t py-5"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="section-number col-span-2 md:col-span-1">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="col-span-10 md:col-span-5">
                <div className="font-display text-xl font-medium tracking-tight md:text-2xl">
                  {s.name}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.18em]" style={{ color: 'rgb(var(--muted))' }}>
                  {sec && <span>{sec.name}</span>}
                  {cat && (
                    <>
                      <span>·</span>
                      <span>{cat.name}</span>
                    </>
                  )}
                  {!s.active && (
                    <>
                      <span>·</span>
                      <span className="text-red-700">Inactif</span>
                    </>
                  )}
                </div>
              </div>
              <div className="col-span-4 md:col-span-2 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                {s.duration_min} min
              </div>
              <div className="col-span-4 md:col-span-2 text-right md:text-left">
                <span className="font-display text-lg tabular-nums">{fmt(s.price_xof)}</span>{' '}
                <span className="text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
                  FCFA
                </span>
              </div>
              <div className="col-span-4 md:col-span-2 flex items-center justify-end gap-2">
                <button
                  onClick={() =>
                    setEditing({
                      id: s.id,
                      slug: s.slug,
                      name: s.name,
                      description: s.description || '',
                      price_xof: s.price_xof,
                      duration_min: s.duration_min,
                      sector_id: s.sector_id || '',
                      category_id: s.category_id || '',
                    })
                  }
                  className="btn-ghost text-[11px]"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(s)} className="btn-ghost text-[11px] text-red-700">
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

function ServiceForm({
  form,
  sectors,
  categories,
  onSave,
  onCancel,
}: {
  form: Form;
  sectors: Sector[];
  categories: Category[];
  onSave: (f: Form) => Promise<void>;
  onCancel: () => void;
}) {
  const [data, setData] = useState<Form>(form);
  const cats = categories.filter((c) => c.sector_id === data.sector_id && c.kind === 'service');

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data.name.trim()) return;
    await onSave(data);
  }

  return (
    <form onSubmit={submit} className="surface p-6 md:p-8 space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nom">
          <input value={data.name} onChange={(e) => set('name', e.target.value)} className="input" autoFocus />
        </Field>
        <Field label="Slug (auto si vide)">
          <input
            value={data.slug}
            onChange={(e) => set('slug', e.target.value)}
            placeholder={data.name.toLowerCase().replace(/\s+/g, '_').slice(0, 30)}
            className="input"
          />
        </Field>
        <Field label="Secteur">
          <select
            value={data.sector_id}
            onChange={(e) => {
              set('sector_id', e.target.value);
              set('category_id', ''); // reset cat
            }}
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
        <Field label="Catégorie">
          <select
            value={data.category_id}
            onChange={(e) => set('category_id', e.target.value)}
            className="input bg-[rgb(var(--surface))]"
            disabled={!data.sector_id}
          >
            <option value="">— Aucune —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prix (FCFA)">
          <input
            type="number"
            min={0}
            step={500}
            value={data.price_xof}
            onChange={(e) => set('price_xof', Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Durée (minutes)">
          <input
            type="number"
            min={15}
            step={15}
            value={data.duration_min}
            onChange={(e) => set('duration_min', Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>
      <Field label="Description">
        <textarea
          value={data.description}
          onChange={(e) => set('description', e.target.value)}
          rows={2}
          className="input resize-none"
        />
      </Field>
      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgb(var(--line))' }}>
        <button type="submit" className="btn-primary">
          {form.id ? 'Enregistrer' : 'Créer'}
        </button>
        <button type="button" onClick={onCancel} className="btn-outline">
          Annuler
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
