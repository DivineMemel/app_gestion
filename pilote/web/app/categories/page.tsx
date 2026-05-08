'use client';
import { useEffect, useState } from 'react';
import { Plus, Power, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/lib/types';

const PRESET_COLORS = [
  '#6366f1',
  '#0ea5e9',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#64748b',
];

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    slug: '',
    label: '',
    description: '',
    color: PRESET_COLORS[0],
  });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('created_at', { ascending: true });
    setCategories((data as Category[]) || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const slug = form.slug.trim().toLowerCase().replace(/\s+/g, '_');
    if (!slug || !form.label.trim()) {
      setError('Slug et label requis');
      return;
    }
    const { error: err } = await supabase.from('categories').insert({
      slug,
      label: form.label.trim(),
      description: form.description.trim() || null,
      color: form.color,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setForm({ slug: '', label: '', description: '', color: PRESET_COLORS[0] });
    setShowForm(false);
    load();
  }

  async function toggleActive(c: Category) {
    await supabase.from('categories').update({ active: !c.active }).eq('id', c.id);
    load();
  }

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catégories</h1>
          <p className="text-sm text-muted">
            Personnalise les types de demandes que tu reçois.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="btn-primary"
        >
          <Plus className="h-4 w-4" />
          Ajouter
        </button>
      </header>

      {showForm && (
        <form
          onSubmit={add}
          className="surface space-y-3 rounded-xl p-4 animate-in"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted">Label</label>
              <input
                placeholder="ex: Peinture"
                value={form.label}
                onChange={(e) =>
                  setForm({
                    ...form,
                    label: e.target.value,
                    slug: form.slug || e.target.value.toLowerCase().replace(/\s+/g, '_'),
                  })
                }
                className="input mt-1"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Slug technique</label>
              <input
                placeholder="ex: peinture"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                className="input mt-1 font-mono text-xs"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted">
              Description (aide l'IA à classifier)
            </label>
            <textarea
              placeholder="ex: Travaux de peinture intérieure et extérieure, ravalement de façade…"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="input mt-1 resize-none"
              rows={2}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Couleur</label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-7 w-7 rounded-full transition-transform ${
                    form.color === c ? 'scale-110 ring-2 ring-offset-2 ring-offset-[rgb(var(--surface))]' : ''
                  }`}
                  style={{
                    backgroundColor: c,
                    boxShadow: form.color === c ? `0 0 0 2px ${c}` : 'none',
                  }}
                />
              ))}
            </div>
          </div>
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-300">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setError(null);
              }}
              className="btn-ghost"
            >
              Annuler
            </button>
            <button type="submit" className="btn-primary">
              Créer
            </button>
          </div>
        </form>
      )}

      <ul className="grid gap-2 sm:grid-cols-2">
        {categories.map((c) => (
          <li
            key={c.id}
            className="surface group flex items-start gap-3 rounded-xl p-3 transition-all hover:shadow-sm"
          >
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="truncate font-medium">{c.label}</div>
                <span className="font-mono text-[10px] text-muted">{c.slug}</span>
              </div>
              {c.description && (
                <p className="mt-1 line-clamp-2 text-xs text-muted">
                  {c.description}
                </p>
              )}
            </div>
            <button
              onClick={() => toggleActive(c)}
              className={`shrink-0 rounded-md p-1.5 transition-colors ${
                c.active
                  ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                  : 'text-muted hover:bg-[rgb(var(--surface-2))]'
              }`}
              aria-label={c.active ? 'Désactiver' : 'Activer'}
            >
              <Power className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
