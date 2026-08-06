'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Wordmark } from '@/components/Wordmark';

const REASONS: Record<string, string> = {
  pending: 'Ton compte attend la validation du patron.',
  disabled: 'Ce compte a été désactivé.',
  bad_credentials: 'E-mail ou mot de passe incorrect.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      setError(REASONS[json?.reason] ?? json?.reason ?? 'Connexion impossible.');
    } catch {
      setError('Connexion perdue. Vérifie le réseau.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="surface w-full max-w-sm p-7">
      <div className="mb-6">
        <Wordmark size="md" />
        <p className="mt-3 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Accès à la gestion de la boutique.
        </p>
      </div>

      <label className="label" htmlFor="email">
        E-mail
      </label>
      <input
        id="email"
        type="email"
        className="input mb-4"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="prenom@boutique.ci"
        autoComplete="username"
      />

      <label className="label" htmlFor="password">
        Mot de passe
      </label>
      <input
        id="password"
        type="password"
        className="input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'rgb(var(--danger))' }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>

      <p className="mt-5 text-center text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
        Pas encore de compte ?{' '}
        <Link href="/admin/register" className="font-semibold underline">
          Créer un accès
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
