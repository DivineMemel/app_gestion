'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { ROLES, ROLE_LABELS } from '@/lib/permissions';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'employee' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/admin/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    const data = await res.json().catch(() => ({}));
    const map: Record<string, string> = {
      invalid_input: 'Vérifie le nom, l’email et le mot de passe (6 caractères min).',
      email_taken: 'Cet email a déjà un compte.',
      invalid_role: 'Rôle invalide.',
    };
    setError(map[data?.reason] ?? 'Inscription impossible.');
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Wordmark size="md" href="/" />
        </div>

        {done ? (
          <div className="mt-12 surface p-8 md:p-10 text-center space-y-4">
            <div className="eyebrow justify-center">Inscription envoyée</div>
            <p className="text-[14px] leading-relaxed" style={{ color: 'rgb(var(--ink-soft))' }}>
              Ton compte est <strong>en attente de validation</strong> par le
              propriétaire. Tu pourras te connecter dès qu&rsquo;il l&rsquo;aura
              activé.
            </p>
            <Link href="/admin/login" className="btn-outline">
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-12 surface p-8 md:p-10 space-y-5">
            <div className="text-center">
              <div className="eyebrow justify-center">Rejoindre l&rsquo;équipe</div>
              <h1 className="font-display mt-4 text-2xl font-medium tracking-tight">
                Créer un compte
              </h1>
            </div>

            <Field label="Nom">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                className="input"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Mot de passe">
              <input
                type="password"
                autoComplete="new-password"
                className="input"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="6 caractères minimum"
              />
            </Field>
            <Field label="Rôle souhaité">
              <select
                className="input bg-[rgb(var(--surface))]"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </Field>

            {error && (
              <div
                className="text-[12px] py-2 px-3 border"
                style={{ borderColor: 'rgb(var(--line))', color: '#a52a2a' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !form.name || !form.email || !form.password}
              className="btn-primary w-full disabled:opacity-50"
            >
              {busy ? 'Envoi…' : "S'inscrire"}
            </button>

            <p className="text-center text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
              Déjà un compte ?{' '}
              <Link href="/admin/login" className="underline-anim" style={{ color: 'rgb(var(--ink))' }}>
                Se connecter
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-[10px] uppercase tracking-[0.24em]" style={{ color: 'rgb(var(--muted))' }}>
        {label}
      </div>
      {children}
    </label>
  );
}
