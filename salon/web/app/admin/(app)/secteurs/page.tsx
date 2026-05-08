'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight, Edit2, Check, X } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { Sector, Category } from '@/lib/types';

export default function SecteursPage() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newSector, setNewSector] = useState({ slug: '', name: '', description: '' });

  async function load() {
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from('sectors').select('*').order('display_order', { ascending: true }),
      supabase.from('categories').select('*').order('display_order', { ascending: true }),
    ]);
    setSectors((s as Sector[]) || []);
    setCategories((c as Category[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('sectors-cat'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sectors' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function addSector(e: React.FormEvent) {
    e.preventDefault();
    const slug = newSector.slug.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug || !newSector.name.trim()) return;
    await supabase.from('sectors').insert({
      slug,
      name: newSector.name.trim(),
      description: newSector.description.trim() || null,
      display_order: sectors.length,
    });
    setNewSector({ slug: '', name: '', description: '' });
    setAdding(false);
  }

  async function toggleSectorActive(s: Sector) {
    await supabase.from('sectors').update({ active: !s.active }).eq('id', s.id);
  }

  async function deleteSector(s: Sector) {
    if (!confirm(`Supprimer le secteur "${s.name}" et toutes ses catégories ?`)) return;
    await supabase.from('sectors').delete().eq('id', s.id);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Catalogue"
        title="Secteurs &"
        italic="catégories"
        description="Définis tes verticales métier (Coiffure, Onglerie…) et leurs sous-catégories. Tout le reste s'organise autour."
        right={
          <button onClick={() => setAdding((a) => !a)} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            {adding ? 'Annuler' : 'Nouveau secteur'}
          </button>
        }
      />

      {adding && (
        <form onSubmit={addSector} className="surface p-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="block mb-1 text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
              Slug
            </label>
            <input
              autoFocus
              value={newSector.slug}
              onChange={(e) => setNewSector({ ...newSector, slug: e.target.value })}
              placeholder="ex: soins"
              className="input"
            />
          </div>
          <div>
            <label className="block mb-1 text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
              Nom affiché
            </label>
            <input
              value={newSector.name}
              onChange={(e) => setNewSector({ ...newSector, name: e.target.value })}
              placeholder="ex: Soins du visage"
              className="input"
            />
          </div>
          <div>
            <label className="block mb-1 text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
              Description (optionnel)
            </label>
            <input
              value={newSector.description}
              onChange={(e) => setNewSector({ ...newSector, description: e.target.value })}
              placeholder="ex: Hydrafacial, gommages…"
              className="input"
            />
          </div>
          <div className="md:col-span-3">
            <button type="submit" className="btn-primary">Créer</button>
          </div>
        </form>
      )}

      {loading && <div className="text-sm text-muted">Chargement…</div>}

      {!loading && sectors.length === 0 && (
        <div className="surface px-6 py-12 text-center">
          <p className="text-sm text-muted">Aucun secteur. Crées-en un pour commencer.</p>
        </div>
      )}

      <ul className="space-y-px bg-[rgb(var(--line))]">
        {sectors.map((s) => {
          const cats = categories.filter((c) => c.sector_id === s.id);
          const isOpen = open[s.id] ?? true;
          return (
            <li key={s.id} className="bg-[rgb(var(--bg))]">
              <div className="flex items-start gap-4 p-5 md:p-6">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [s.id]: !isOpen }))}
                  className="mt-1.5"
                  style={{ color: 'rgb(var(--muted))' }}
                  aria-label={isOpen ? 'Fermer' : 'Ouvrir'}
                >
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <h3 className="font-display text-2xl font-medium tracking-tight">
                      {s.name}
                    </h3>
                    <span className="text-[10px] uppercase tracking-[0.24em] font-mono" style={{ color: 'rgb(var(--muted))' }}>
                      {s.slug}
                    </span>
                    {!s.active && (
                      <span className="chip surface-2 text-muted">Inactif</span>
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-1 text-[13px]" style={{ color: 'rgb(var(--ink-soft))' }}>
                      {s.description}
                    </p>
                  )}
                  <div className="mt-1 text-[11px] uppercase tracking-[0.2em]" style={{ color: 'rgb(var(--muted))' }}>
                    {cats.length} catégorie{cats.length > 1 ? 's' : ''}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => toggleSectorActive(s)} className="btn-ghost text-[11px]">
                    {s.active ? 'Désactiver' : 'Activer'}
                  </button>
                  <button onClick={() => deleteSector(s)} className="btn-ghost text-[11px] text-red-700">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t px-5 md:px-6 py-4" style={{ borderColor: 'rgb(var(--line))' }}>
                  <CategoriesEditor sector={s} categories={cats} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function CategoriesEditor({ sector, categories }: { sector: Sector; categories: Category[] }) {
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState({ slug: '', name: '', kind: 'service' as 'service' | 'product' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function addCategory(e: React.FormEvent) {
    e.preventDefault();
    const slug = newCat.slug.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug || !newCat.name.trim()) return;
    await supabase.from('categories').insert({
      sector_id: sector.id,
      slug,
      name: newCat.name.trim(),
      kind: newCat.kind,
      display_order: categories.length,
    });
    setNewCat({ slug: '', name: '', kind: 'service' });
    setAdding(false);
  }

  async function toggleCategoryActive(c: Category) {
    await supabase.from('categories').update({ active: !c.active }).eq('id', c.id);
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`Supprimer la catégorie "${c.name}" ?`)) return;
    await supabase.from('categories').delete().eq('id', c.id);
  }

  async function saveRename(c: Category) {
    if (!editName.trim()) return;
    await supabase.from('categories').update({ name: editName.trim() }).eq('id', c.id);
    setEditing(null);
  }

  const services = categories.filter((c) => c.kind === 'service');
  const products = categories.filter((c) => c.kind === 'product');

  function row(c: Category) {
    return (
      <li
        key={c.id}
        className="flex items-center gap-3 py-2.5 border-t"
        style={{ borderColor: 'rgb(var(--line))' }}
      >
        {editing === c.id ? (
          <>
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="input flex-1 max-w-xs py-1.5"
              onKeyDown={(e) => e.key === 'Enter' && saveRename(c)}
            />
            <button onClick={() => saveRename(c)} className="btn-ghost text-[11px]">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditing(null)} className="btn-ghost text-[11px]">
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="text-[14px] flex-1 truncate" style={{ color: 'rgb(var(--ink))' }}>
              {c.name}
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] font-mono" style={{ color: 'rgb(var(--muted))' }}>
              {c.slug}
            </span>
            {!c.active && <span className="chip surface-2 text-muted">Off</span>}
            <button
              onClick={() => {
                setEditing(c.id);
                setEditName(c.name);
              }}
              className="btn-ghost text-[11px] py-1"
            >
              <Edit2 className="h-3 w-3" />
            </button>
            <button onClick={() => toggleCategoryActive(c)} className="btn-ghost text-[11px] py-1">
              {c.active ? 'Off' : 'On'}
            </button>
            <button onClick={() => deleteCategory(c)} className="btn-ghost text-[11px] py-1 text-red-700">
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </li>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-[10px] uppercase tracking-[0.24em] font-medium" style={{ color: 'rgb(var(--muted))' }}>
              Services
            </h4>
            <span className="text-[10px]" style={{ color: 'rgb(var(--muted))' }}>
              {services.length}
            </span>
          </div>
          {services.length === 0 ? (
            <p className="text-[12px] py-3 text-muted">Aucune catégorie de service.</p>
          ) : (
            <ul>{services.map(row)}</ul>
          )}
        </div>
        <div>
          <div className="flex items-baseline justify-between mb-2">
            <h4 className="text-[10px] uppercase tracking-[0.24em] font-medium" style={{ color: 'rgb(var(--muted))' }}>
              Produits
            </h4>
            <span className="text-[10px]" style={{ color: 'rgb(var(--muted))' }}>
              {products.length}
            </span>
          </div>
          {products.length === 0 ? (
            <p className="text-[12px] py-3 text-muted">Aucune catégorie de produit.</p>
          ) : (
            <ul>{products.map(row)}</ul>
          )}
        </div>
      </div>

      {adding ? (
        <form onSubmit={addCategory} className="surface-2 p-4 grid gap-3 md:grid-cols-4">
          <input
            autoFocus
            value={newCat.slug}
            onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
            placeholder="slug"
            className="input"
          />
          <input
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            placeholder="Nom"
            className="input"
          />
          <select
            value={newCat.kind}
            onChange={(e) => setNewCat({ ...newCat, kind: e.target.value as 'service' | 'product' })}
            className="input bg-[rgb(var(--surface))]"
          >
            <option value="service">Service</option>
            <option value="product">Produit</option>
          </select>
          <div className="flex items-end gap-2">
            <button type="submit" className="btn-primary py-2 px-4 text-[10px]">
              Ajouter
            </button>
            <button type="button" onClick={() => setAdding(false)} className="btn-ghost text-[11px]">
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="text-[11px] uppercase tracking-[0.24em] underline-anim"
          style={{ color: 'rgb(var(--muted))' }}
        >
          + Ajouter une catégorie
        </button>
      )}
    </div>
  );
}
