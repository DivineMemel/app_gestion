'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { ROLE_HINTS, ROLE_LABELS, type Role } from '@/lib/permissions';

// Le rôle « patron » est absent : il se donne depuis la page Comptes, jamais
// à l'inscription.
const CHOISISSABLES: Role[] = ['gerant', 'vendeur', 'magasinier'];

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'vendeur' as Role,
  });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) setDone(true);
      else setError(json?.reason ?? 'Inscription impossible.');
    } catch {
      setError('Connexion perdue. Vérifie le réseau.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-5">
        <div className="surface w-full max-w-sm p-7 text-center">
          <Wordmark size="md" />
          <h1 className="title-display mt-6 text-2xl">Demande envoyée</h1>
          <p className="mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
            Ton compte sera actif dès que le patron l’aura validé.
          </p>
          <Link href="/admin/login" className="btn-outline mt-6 w-full">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <form onSubmit={submit} className="surface w-full max-w-sm p-7">
        <Wordmark size="md" />
        <p className="mb-6 mt-3 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Créer un accès à la gestion.
        </p>

        <label className="label">Nom complet</label>
        <input
          className="input mb-4"
          value={form.name}
          onChange={(e) => set('name')(e.target.value)}
          required
        />

        <label className="label">E-mail</label>
        <input
          type="email"
          className="input mb-4"
          value={form.email}
          onChange={(e) => set('email')(e.target.value)}
          required
        />

        <label className="label">Téléphone</label>
        <input
          className="input mb-4"
          value={form.phone}
          onChange={(e) => set('phone')(e.target.value)}
          placeholder="+225 …"
        />

        <label className="label">Poste</label>
        <select
          className="select mb-1.5"
          value={form.role}
          onChange={(e) => set('role')(e.target.value)}
        >
          {CHOISISSABLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <p className="mb-4 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
          {ROLE_HINTS[form.role]}
        </p>

        <label className="label">Mot de passe</label>
        <input
          type="password"
          className="input"
          value={form.password}
          onChange={(e) => set('password')(e.target.value)}
          minLength={6}
          required
        />

        {error && (
          <p className="mt-4 text-sm" style={{ color: 'rgb(var(--danger))' }}>
            {error}
          </p>
        )}

        <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
          {busy ? 'Envoi…' : 'Demander un accès'}
        </button>

        <p className="mt-5 text-center text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
          Déjà un compte ?{' '}
          <Link href="/admin/login" className="font-semibold underline">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  );
}
