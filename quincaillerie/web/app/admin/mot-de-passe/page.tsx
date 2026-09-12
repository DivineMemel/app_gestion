'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';

// Choix du nouveau mot de passe, au bout du lien reçu par mail.
//
// Le lien est vérifié À L'OUVERTURE, avant d'afficher le formulaire : mieux
// vaut dire tout de suite « ce lien a expiré » que le dire après avoir fait
// saisir deux fois un mot de passe.

const MOTIFS: Record<string, string> = {
  invalid: 'Ce lien n’est pas valable. Demande-en un nouveau.',
  expired: 'Ce lien a expiré — il ne vaut qu’une heure. Demande-en un nouveau.',
  used: 'Ce lien a déjà servi. Demande-en un nouveau si besoin.',
  disabled: 'Ce compte n’est plus actif. Vois avec le patron.',
};

function Formulaire() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';

  const [etat, setEtat] = useState<'verification' | 'pret' | 'refuse'>('verification');
  const [nom, setNom] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    if (!token) {
      setError(MOTIFS.invalid);
      setEtat('refuse');
      return;
    }
    let vivant = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/password/reset?token=${encodeURIComponent(token)}`,
        );
        const json = await res.json().catch(() => null);
        if (!vivant) return;
        if (res.ok && json?.ok) {
          setNom(json.name ?? '');
          setEtat('pret');
        } else {
          setError(MOTIFS[json?.reason] ?? json?.reason ?? 'Lien inutilisable.');
          setEtat('refuse');
        }
      } catch {
        if (!vivant) return;
        setError('Connexion perdue. Vérifie le réseau.');
        setEtat('refuse');
      }
    })();
    return () => {
      vivant = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmation) {
      setError('Les deux mots de passe ne sont pas identiques.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/password/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setFait(true);
        return;
      }
      setError(MOTIFS[json?.reason] ?? json?.reason ?? 'Changement impossible.');
    } catch {
      setError('Connexion perdue. Vérifie le réseau.');
    } finally {
      setBusy(false);
    }
  }

  if (fait) {
    return (
      <div className="surface w-full max-w-sm p-7 text-center">
        <Wordmark size="md" />
        <h1 className="title-display mt-6 text-2xl">C’est fait</h1>
        <p className="mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Ton mot de passe est changé. Connecte-toi avec le nouveau.
        </p>
        <button
          type="button"
          className="btn-primary mt-6 w-full"
          onClick={() => router.replace('/admin/login')}
        >
          Se connecter
        </button>
      </div>
    );
  }

  if (etat === 'verification') {
    return (
      <div className="surface w-full max-w-sm p-7 text-center">
        <Wordmark size="md" />
        <p className="mt-6 text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Vérification du lien…
        </p>
      </div>
    );
  }

  if (etat === 'refuse') {
    return (
      <div className="surface w-full max-w-sm p-7 text-center">
        <Wordmark size="md" />
        <h1 className="title-display mt-6 text-2xl">Lien inutilisable</h1>
        <p className="mt-2 text-sm" style={{ color: 'rgb(var(--danger))' }}>
          {error}
        </p>
        <Link href="/admin/mot-de-passe-oublie" className="btn-primary mt-6 w-full">
          Demander un nouveau lien
        </Link>
        <Link href="/admin/login" className="btn-outline mt-2 w-full">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="surface w-full max-w-sm p-7">
      <Wordmark size="md" />
      <h1 className="title-display mt-5 text-2xl">Nouveau mot de passe</h1>
      <p className="mb-6 mt-2 text-sm" style={{ color: 'rgb(var(--muted))' }}>
        {nom ? `${nom}, choisis` : 'Choisis'} un mot de passe : 6 caractères
        minimum.
      </p>

      <label className="label" htmlFor="mdp">
        Mot de passe
      </label>
      <input
        id="mdp"
        type="password"
        className="input mb-4"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        autoFocus
        required
      />

      <label className="label" htmlFor="mdp2">
        Répéter le mot de passe
      </label>
      <input
        id="mdp2"
        type="password"
        className="input"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        autoComplete="new-password"
        minLength={6}
        required
      />

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'rgb(var(--danger))' }}>
          {error}
        </p>
      )}

      <button type="submit" className="btn-primary mt-6 w-full" disabled={busy}>
        {busy ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  );
}

export default function NouveauMotDePassePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-5">
      <Suspense fallback={null}>
        <Formulaire />
      </Suspense>
    </div>
  );
}
