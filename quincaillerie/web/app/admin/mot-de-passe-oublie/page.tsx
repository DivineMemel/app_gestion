'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

// Demande d'un lien de réinitialisation.
//
// L'adresse arrive pré-remplie depuis l'écran de connexion : quelqu'un qui
// vient de se tromper de mot de passe n'a plus qu'un bouton à presser.

const MOTIFS: Record<string, string> = {
  unknown_email: 'Aucun compte avec cet e-mail. Vérifie l’adresse.',
  pending:
    'Ce compte attend encore la validation du patron : il n’y a pas de mot de passe à réinitialiser.',
  disabled: 'Ce compte a été désactivé. Vois avec le patron.',
};

function Formulaire() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [envoye, setEnvoye] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/password/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setEnvoye(json.email ?? email);
        return;
      }
      if (json?.reason === 'throttled') {
        const s = Number(json?.secondes) || 60;
        const minutes = Math.ceil(s / 60);
        setError(
          `Trop de demandes. Réessaie dans ${
            minutes > 1 ? `${minutes} minutes` : `${s} secondes`
          }.`,
        );
        return;
      }
      setError(MOTIFS[json?.reason] ?? json?.reason ?? 'Demande impossible.');
    } catch {
      setError('Connexion perdue. Vérifie le réseau.');
    } finally {
      setBusy(false);
    }
  }

  if (envoye) {
    return (
      <div className="surface w-full max-w-sm p-7 text-center">
        <Wordmark size="md" />
        <h1 className="title-display mt-6 text-2xl">Mail envoyé</h1>
        <p className="mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Un lien vient de partir à <strong>{envoye}</strong>. Il est valable une
          heure et ne sert qu’une fois.
        </p>
        <p className="mt-3 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
          Rien dans la boîte de réception après deux minutes ? Regarde dans les
          spams.
        </p>
        <Link href="/admin/login" className="btn-outline mt-6 w-full">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface w-full max-w-sm p-7">
      <Wordmark size="md" />
      <h1 className="title-display mt-5 text-2xl">Mot de passe oublié</h1>
      <p className="mb-6 mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
        Saisis l’e-mail de ton compte : on t’envoie un lien pour en choisir un
        nouveau.
      </p>

      <label className="label" htmlFor="email">
        E-mail
      </label>
      <input
        id="email"
        type="email"
        className="input"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="prenom@boutique.ci"
        autoComplete="username"
        autoFocus
        required
      />

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'rgb(var(--danger))' }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
        {busy ? 'Envoi…' : 'Envoyer le lien'}
      </button>

      <p className="mt-5 text-center text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
        <Link href="/admin/login" className="font-semibold underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}

export default function MotDePasseOubliePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <Suspense fallback={null}>
        <Formulaire />
      </Suspense>
    </div>
  );
}
