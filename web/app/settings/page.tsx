'use client';
import { useEffect, useState } from 'react';
import { Save, Sparkles, MessageSquareText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { AppSettings } from '@/lib/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      const s = data as AppSettings | null;
      if (s) {
        setSettings(s);
        setEnabled(s.auto_reply_enabled);
        setMessage(s.auto_reply_message);
        setBusinessName(s.business_name || '');
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from('app_settings').upsert({
      id: 1,
      auto_reply_enabled: enabled,
      auto_reply_message: message,
      business_name: businessName.trim() || null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (!error) {
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
        <p className="text-sm text-muted">Personnalise le comportement de l'assistant.</p>
      </header>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium">Profil business</h2>
            <p className="text-xs text-muted">
              Le nom apparaît dans les notifications et l'auto-réponse.
            </p>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Nom du business</label>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="ex: Déco & Services"
            className="input mt-1"
          />
        </div>
      </section>

      <section className="surface rounded-2xl p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium">Réponse automatique</h2>
            <p className="text-xs text-muted">
              Envoyée une fois aux nouveaux clients dès leur premier message.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled((v) => !v)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              enabled ? 'bg-[rgb(var(--primary))]' : 'bg-[rgb(var(--surface-2))]'
            }`}
            role="switch"
            aria-checked={enabled}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-muted">Message envoyé</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            disabled={!enabled}
            className="input mt-1 resize-none disabled:opacity-50"
            placeholder="Bonjour ! Merci pour votre message…"
          />
          <p className="mt-1 text-[11px] text-muted">
            Astuce : indique tes horaires, services proposés, ou demande des précisions
            (type de prestation, adresse…).
          </p>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        {savedTick && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Enregistré ✓
          </span>
        )}
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="h-4 w-4" />
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
