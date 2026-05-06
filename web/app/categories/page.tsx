'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/lib/types';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    slug: '',
    label: '',
    description: '',
    color: '#6366f1',
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
    setForm({ slug: '', label: '', description: '', color: '#6366f1' });
    load();
  }

  async function toggleActive(c: Category) {
    await supabase.from('categories').update({ active: !c.active }).eq('id', c.id);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Catégories</h1>

      <form
        onSubmit={add}
        className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900"
      >
        <div className="grid grid-cols-2 gap-2">
          <input
            placeholder="Slug (ex: peinture)"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
          />
          <input
            placeholder="Label affiché"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
          />
        </div>
        <textarea
          placeholder="Description (aide pour la classification IA — ex: 'travaux de peinture intérieure et extérieure')"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-sm"
          rows={2}
        />
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={form.color}
            onChange={(e) => setForm({ ...form, color: e.target.value })}
            className="h-9 w-14 rounded"
          />
          <button
            type="submit"
            className="ml-auto px-4 py-2 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-sm"
          >
            Ajouter
          </button>
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </form>

      <ul className="space-y-2">
        {categories.map((c) => (
          <li
            key={c.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900"
          >
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            <div className="flex-1">
              <div className="font-medium">{c.label}</div>
              <div className="text-xs text-slate-500">{c.slug}</div>
              {c.description && (
                <div className="text-xs text-slate-500 mt-1">{c.description}</div>
              )}
            </div>
            <button
              onClick={() => toggleActive(c)}
              className={`text-xs px-2 py-1 rounded ${
                c.active
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {c.active ? 'Active' : 'Inactive'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
