'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Wordmark } from '@/components/Wordmark';

// Le serveur dit lequel des deux champs est faux : l'écran le répète, et
// propose la sortie qui correspond — créer un accès si l'adresse est inconnue,
// un lien par mail si c'est le mot de passe qui manque.
const REASONS: Record<string, string> = {
  pending: 'Ton compte attend la validation du patron.',
  disabled: 'Ce compte a été désactivé.',
  unknown_email: 'Aucun compte avec cet e-mail.',
  bad_password: 'Mot de passe incorrect.',
  email_manquant:
    'E-mail manquant. Saisis ton e-mail — ou, pour l’accès de secours, le mot de passe patron seul.',
  // Ancien motif : un déploiement peut encore le renvoyer le temps d'une mise à jour.
  bad_credentials: 'E-mail ou mot de passe incorrect.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [motif, setMotif] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMotif(null);
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
      if (json?.reason === 'throttled') {
        const s = Number(json?.secondes) || 60;
        const minutes = Math.ceil(s / 60);
        setError(
          `Trop de tentatives. Réessaie dans ${
            minutes > 1 ? `${minutes} minutes` : `${s} secondes`
          }.`,
        );
        return;
      }
      setMotif(json?.reason ?? null);
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
        <div className="mt-4 text-sm" style={{ color: 'rgb(var(--danger))' }}>
          <p>{error}</p>
          {motif === 'unknown_email' && (
            <p className="mt-1">
              Vérifie l’adresse, ou{' '}
              <Link href="/admin/register" className="font-semibold underline">
                demande un accès
              </Link>
              .
            </p>
          )}
          {motif === 'bad_password' && (
            <p className="mt-1">
              <Link
                href={`/admin/mot-de-passe-oublie?email=${encodeURIComponent(email)}`}
                className="font-semibold underline"
              >
                Recevoir un lien par e-mail
              </Link>{' '}
              pour en choisir un nouveau.
            </p>
          )}
        </div>
      )}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>

      <p className="mt-4 text-center text-[13px]">
        <Link
          href={
            email
              ? `/admin/mot-de-passe-oublie?email=${encodeURIComponent(email)}`
              : '/admin/mot-de-passe-oublie'
          }
          className="underline"
          style={{ color: 'rgb(var(--muted))' }}
        >
          Mot de passe oublié ?
        </Link>
      </p>

      <p className="mt-3 text-center text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
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
