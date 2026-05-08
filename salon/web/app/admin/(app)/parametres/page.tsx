'use client';
import { useEffect, useState } from 'react';
import { Save, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { SalonSettings } from '@/lib/types';

const DAYS = [
  { key: 'lundi', label: 'Lundi' },
  { key: 'mardi', label: 'Mardi' },
  { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi', label: 'Jeudi' },
  { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi', label: 'Samedi' },
  { key: 'dimanche', label: 'Dimanche' },
] as const;

type Hours = SalonSettings['opening_hours'];

export default function ParametresPage() {
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('salon_settings')
        .select('*')
        .eq('id', 1)
        .single();
      setSettings(data as SalonSettings);
    })();
  }, []);

  if (!settings) {
    return (
      <div
        className="py-20 text-center text-[13px]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        Chargement…
      </div>
    );
  }

  const s = settings;

  const update = <K extends keyof SalonSettings>(k: K, v: SalonSettings[K]) =>
    setSettings({ ...s, [k]: v });

  function setDay(day: string, open: string | null, close: string | null) {
    const next: Hours = { ...s.opening_hours };
    if (!open || !close) delete next[day];
    else next[day] = { open, close };
    update('opening_hours', next);
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from('salon_settings')
      .update({
        name: s.name,
        tagline: s.tagline,
        address: s.address,
        phone: s.phone,
        email: s.email,
        whatsapp: s.whatsapp,
        instagram: s.instagram,
        facebook: s.facebook,
        tiktok: s.tiktok,
        opening_hours: s.opening_hours,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);
    setSaving(false);
    if (!error) {
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2400);
    } else {
      alert('Erreur enregistrement : ' + error.message);
    }
  }

  return (
    <div className="space-y-12 stagger">
      <PageHeader
        eyebrow="Configuration"
        title="Paramètres"
        italic="—"
        description="Identité du salon, coordonnées, horaires et réseaux. Visible côté storefront."
        right={
          <button onClick={save} disabled={saving} className="btn-primary">
            {savedAt ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Enregistré
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </>
            )}
          </button>
        }
      />

      {/* Identité */}
      <Section title="Identité">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom du salon">
            <input
              className="input"
              value={settings.name ?? ''}
              onChange={(e) => update('name', e.target.value)}
            />
          </Field>
          <Field label="Tagline">
            <input
              className="input"
              value={settings.tagline ?? ''}
              onChange={(e) => update('tagline', e.target.value)}
              placeholder="ex. Coiffure & Onglerie · Abidjan"
            />
          </Field>
          <Field label="Adresse" full>
            <input
              className="input"
              value={settings.address ?? ''}
              onChange={(e) => update('address', e.target.value)}
              placeholder="Cocody, Riviera Palmeraie…"
            />
          </Field>
        </div>
      </Section>

      {/* Contact */}
      <Section title="Contact">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Téléphone">
            <input
              className="input"
              value={settings.phone ?? ''}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+225 07 XX XX XX XX"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className="input"
              value={settings.whatsapp ?? ''}
              onChange={(e) => update('whatsapp', e.target.value)}
              placeholder="+225 07 XX XX XX XX"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className="input"
              value={settings.email ?? ''}
              onChange={(e) => update('email', e.target.value)}
            />
          </Field>
        </div>
      </Section>

      {/* Réseaux */}
      <Section title="Réseaux sociaux">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Instagram">
            <input
              className="input"
              value={settings.instagram ?? ''}
              onChange={(e) => update('instagram', e.target.value)}
              placeholder="@muse.atelier"
            />
          </Field>
          <Field label="Facebook">
            <input
              className="input"
              value={settings.facebook ?? ''}
              onChange={(e) => update('facebook', e.target.value)}
            />
          </Field>
          <Field label="TikTok">
            <input
              className="input"
              value={settings.tiktok ?? ''}
              onChange={(e) => update('tiktok', e.target.value)}
              placeholder="@muse.atelier"
            />
          </Field>
        </div>
      </Section>

      {/* Horaires */}
      <Section
        title="Horaires d'ouverture"
        note="Laisse vide les jours de fermeture. Format 24h (ex. 09:00, 19:30)."
      >
        <div className="grid gap-px bg-[rgb(var(--line))]">
          {DAYS.map((d) => {
            const h = settings.opening_hours[d.key] ?? null;
            const isClosed = !h;
            return (
              <div
                key={d.key}
                className="bg-[rgb(var(--bg))] grid items-center gap-3 px-5 py-3"
                style={{ gridTemplateColumns: '8rem 1fr 1fr 6rem' }}
              >
                <span className="text-[13px]">{d.label}</span>
                <input
                  type="time"
                  className="input"
                  value={h?.open ?? ''}
                  onChange={(e) =>
                    setDay(d.key, e.target.value || null, h?.close ?? null)
                  }
                  disabled={isClosed}
                />
                <input
                  type="time"
                  className="input"
                  value={h?.close ?? ''}
                  onChange={(e) =>
                    setDay(d.key, h?.open ?? null, e.target.value || null)
                  }
                  disabled={isClosed}
                />
                <button
                  onClick={() =>
                    isClosed ? setDay(d.key, '09:00', '19:00') : setDay(d.key, null, null)
                  }
                  className="text-[10px] uppercase tracking-[0.24em] underline-anim"
                  style={{
                    color: isClosed ? 'rgb(var(--muted))' : 'rgb(var(--ink))',
                  }}
                >
                  {isClosed ? 'Ouvrir' : 'Fermé'}
                </button>
              </div>
            );
          })}
        </div>
      </Section>

      <div className="flex items-center gap-4 pt-2">
        <button onClick={save} disabled={saving} className="btn-primary">
          {savedAt ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Enregistré
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </>
          )}
        </button>
        {settings.updated_at && (
          <span
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            Dernière maj :{' '}
            {new Date(settings.updated_at).toLocaleString('fr-FR')}
          </span>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <div className="eyebrow">{title}</div>
        {note && (
          <span
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span
        className="block mb-2 text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
