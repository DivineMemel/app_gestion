'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wordmark } from '@/components/Wordmark';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') || '/admin';

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      router.replace(next);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(
        data?.reason === 'env_missing'
          ? "Configuration manquante côté serveur (ADMIN_PASSWORD / ADMIN_TOKEN)."
          : 'Mot de passe incorrect.',
      );
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Wordmark size="md" href="/" />
        </div>

        <form onSubmit={submit} className="mt-12 surface p-8 md:p-10 space-y-6">
          <div className="text-center">
            <div className="eyebrow justify-center">Admin</div>
            <h1 className="font-display mt-4 text-2xl font-medium tracking-tight">
              Accès au tableau de bord
            </h1>
          </div>

          <div>
            <label
              className="block mb-2 text-[10px] uppercase tracking-[0.24em]"
              style={{ color: 'rgb(var(--muted))' }}
            >
              Mot de passe
            </label>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
            />
          </div>

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
            disabled={busy || !password}
            className="btn-primary w-full disabled:opacity-50"
          >
            {busy ? 'Vérification…' : 'Entrer'}
          </button>
        </form>
      </div>
    </div>
  );
}
