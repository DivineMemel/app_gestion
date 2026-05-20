'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/admin-db';
import { PageHeader } from '@/components/admin/PageHeader';
import { ImageUpload } from '@/components/admin/ImageUpload';
import type { Staff } from '@/lib/types';

type Form = {
  id?: string;
  name: string;
  role: string;
  bio: string;
  color: string;
  photo_url: string;
};

const EMPTY: Form = {
  name: '',
  role: '',
  bio: '',
  color: '#c8932a',
  photo_url: '',
};

export default function EquipePage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Form | null>(null);

  async function load() {
    const { data } = await supabase
      .from('staff')
      .select('*')
      .order('display_order', { ascending: true });
    setStaff((data as Staff[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('staff-admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function save(f: Form) {
    const payload = {
      name: f.name.trim(),
      role: f.role.trim() || null,
      bio: f.bio.trim() || null,
      color: f.color || '#c8932a',
      photo_url: f.photo_url || null,
    };
    if (!payload.name) return;
    if (f.id) {
      await supabase.from('staff').update(payload).eq('id', f.id);
    } else {
      await supabase.from('staff').insert({ ...payload, display_order: staff.length });
    }
    setEditing(null);
  }

  async function toggleActive(s: Staff) {
    await supabase.from('staff').update({ active: !s.active }).eq('id', s.id);
  }

  async function remove(s: Staff) {
    if (!confirm(`Retirer ${s.name} de l'équipe ?`)) return;
    await supabase.from('staff').delete().eq('id', s.id);
  }

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Vitrine"
        title="Équipe &"
        italic="stylistes"
        description="Les visages de la maison. Visibles sur le site public et sélectionnables à la caisse et à l'agenda."
        right={
          <button onClick={() => setEditing({ ...EMPTY })} className="btn-primary">
            <Plus className="h-3.5 w-3.5" />
            Ajouter un membre
          </button>
        }
      />

      {editing && (
        <StaffForm
          form={editing}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading && <div className="text-sm text-muted">Chargement…</div>}

      {!loading && staff.length === 0 && (
        <div className="surface px-6 py-12 text-center text-sm text-muted">
          Aucun membre. Ajoute la première personne de l&rsquo;équipe.
        </div>
      )}

      <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-2 lg:grid-cols-3">
        {staff.map((s) => (
          <div key={s.id} className="bg-[rgb(var(--bg))] p-6">
            <div className="flex items-start gap-4">
              <div
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border"
                style={{ borderColor: 'rgb(var(--line))', background: 'rgb(var(--surface-2))' }}
              >
                {s.photo_url ? (
                  <Image src={s.photo_url} alt={s.name} fill sizes="64px" className="object-cover" />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center font-display text-xl"
                    style={{ color: s.color }}
                  >
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-xl font-medium tracking-tight truncate">
                    {s.name}
                  </h3>
                  {!s.active && <span className="chip surface-2 text-muted">Off</span>}
                </div>
                {s.role && (
                  <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                    {s.role}
                  </div>
                )}
                {s.bio && (
                  <p className="mt-2 text-[12px] leading-relaxed" style={{ color: 'rgb(var(--ink-soft))' }}>
                    {s.bio}
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() =>
                  setEditing({
                    id: s.id,
                    name: s.name,
                    role: s.role ?? '',
                    bio: s.bio ?? '',
                    color: s.color,
                    photo_url: s.photo_url ?? '',
                  })
                }
                className="btn-ghost text-[11px]"
              >
                <Edit2 className="h-3.5 w-3.5" />
                Éditer
              </button>
              <button onClick={() => toggleActive(s)} className="btn-ghost text-[11px]">
                {s.active ? 'Désactiver' : 'Activer'}
              </button>
              <button onClick={() => remove(s)} className="btn-ghost text-[11px] ml-auto text-red-700">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffForm({
  form,
  onSave,
  onCancel,
}: {
  form: Form;
  onSave: (f: Form) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState<Form>(form);
  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (data.name.trim()) onSave(data);
      }}
      className="surface p-6 md:p-8 space-y-5"
    >
      <div className="eyebrow">{form.id ? 'Éditer le membre' : 'Nouveau membre'}</div>

      <ImageUpload
        label="Photo"
        folder="staff"
        rounded
        aspect="aspect-square"
        value={data.photo_url || null}
        onChange={(url) => set('photo_url', url ?? '')}
      />

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nom">
          <input
            className="input"
            value={data.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Rôle">
          <input
            className="input"
            value={data.role}
            onChange={(e) => set('role', e.target.value)}
            placeholder="ex. Coloriste senior"
          />
        </Field>
      </div>

      <Field label="Bio (optionnel)">
        <textarea
          className="input resize-none"
          rows={2}
          value={data.bio}
          onChange={(e) => set('bio', e.target.value)}
        />
      </Field>

      <Field label="Couleur d'accent">
        <input
          type="color"
          className="h-10 w-20 cursor-pointer border-0 bg-transparent p-0"
          value={data.color}
          onChange={(e) => set('color', e.target.value)}
        />
      </Field>

      <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: 'rgb(var(--line))' }}>
        <button type="submit" className="btn-primary">
          {form.id ? 'Enregistrer' : 'Ajouter'}
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
