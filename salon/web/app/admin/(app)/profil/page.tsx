'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { PageHeader } from '@/components/admin/PageHeader';
import { ROLE_LABELS, type Role } from '@/lib/permissions';

type Profil = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  status: string;
  created_at?: string;
};

export default function ProfilPage() {
  const [profil, setProfil] = useState<Profil | null>(null);
  const [master, setMaster] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [ident, setIdent] = useState({ name: '', phone: '' });
  const [mdp, setMdp] = useState({ current_password: '', password: '', confirm: '' });

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/profile');
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErreur(json?.reason ?? 'Profil indisponible.');
      } else {
        setMaster(Boolean(json.master));
        setProfil(json.profile);
        if (json.profile) {
          setIdent({ name: json.profile.name ?? '', phone: json.profile.phone ?? '' });
        }
      }
    } catch {
      setErreur('Connexion perdue.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function envoyer(patch: Record<string, unknown>, message: string) {
    setBusy(true);
    setErreur(null);
    setOk(null);
    try {
      const res = await fetch('/api/admin/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErreur(json?.reason ?? 'Modification impossible.');
        return false;
      }
      setProfil(json.profile);
      setOk(message);
      setTimeout(() => setOk(null), 3000);
      return true;
    } catch {
      setErreur('Connexion perdue.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function enregistrerIdentite(e: React.FormEvent) {
    e.preventDefault();
    await envoyer({ name: ident.name, phone: ident.phone }, 'Profil mis à jour.');
  }

  async function changerMotDePasse(e: React.FormEvent) {
    e.preventDefault();
    if (mdp.password !== mdp.confirm) {
      setErreur('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    const fait = await envoyer(
      { password: mdp.password, current_password: mdp.current_password },
      'Mot de passe changé.',
    );
    if (fait) setMdp({ current_password: '', password: '', confirm: '' });
  }

  if (chargement) {
    return (
      <>
        <PageHeader eyebrow="Compte" title="Mon" italic="profil" />
        <p className="surface p-10 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Chargement…
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Compte"
        title="Mon"
        italic="profil"
        description={
          profil
            ? `Connectée en tant que ${ROLE_LABELS[profil.role]}.`
            : undefined
        }
      />

      <div className="mt-10" />

      {erreur && (
        <div
          className="mb-6 border p-4 text-sm"
          style={{ borderColor: 'rgb(var(--line-strong))', color: '#a52a2a' }}
        >
          {erreur}
        </div>
      )}
      {ok && (
        <div
          className="mb-6 flex items-center gap-2 border p-4 text-sm"
          style={{ borderColor: 'rgb(var(--line-strong))' }}
        >
          <Check className="h-4 w-4" strokeWidth={1.5} />
          {ok}
        </div>
      )}

      {master ? (
        <div className="surface max-w-2xl p-8">
          <span className="eyebrow">Accès de secours</span>
          <p className="mt-4 text-sm" style={{ color: 'rgb(var(--ink-soft))' }}>
            Tu es connectée avec le <strong>mot de passe maître</strong>, défini
            dans les variables d’environnement. Ce n’est pas un compte : il n’a
            ni profil, ni nom, ni historique.
          </p>
          <p className="mt-3 text-sm" style={{ color: 'rgb(var(--ink-soft))' }}>
            Ouvre-toi un vrai compte propriétaire depuis la page Comptes et
            utilise-le au quotidien — garde le mot de passe maître pour les cas
            où tu serais bloquée dehors.
          </p>
        </div>
      ) : (
        <div className="grid max-w-4xl gap-8 lg:grid-cols-2">
          {/* ---------- Identité ---------- */}
          <form onSubmit={enregistrerIdentite} className="surface p-7">
            <span className="eyebrow">Mes informations</span>

            <div className="mt-6 space-y-5">
              <div>
                <label
                  className="mb-1 block text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  Nom complet
                </label>
                <input
                  className="input"
                  value={ident.name}
                  onChange={(e) => setIdent((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  Téléphone
                </label>
                <input
                  className="input"
                  value={ident.phone}
                  onChange={(e) => setIdent((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+225 …"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  E-mail de connexion
                </label>
                <input className="input" value={profil?.email ?? ''} disabled />
                <p className="mt-2 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  C’est ton identifiant : seule la propriétaire peut le changer,
                  depuis Comptes.
                </p>
              </div>
            </div>

            <button type="submit" className="btn-primary mt-7 w-full" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>

          {/* ---------- Mot de passe ---------- */}
          <form onSubmit={changerMotDePasse} className="surface p-7">
            <span className="eyebrow">Changer mon mot de passe</span>

            <div className="mt-6 space-y-5">
              <div>
                <label
                  className="mb-1 block text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  Mot de passe actuel
                </label>
                <input
                  type="password"
                  className="input"
                  value={mdp.current_password}
                  onChange={(e) =>
                    setMdp((f) => ({ ...f, current_password: e.target.value }))
                  }
                  autoComplete="current-password"
                  required
                />
                <p className="mt-2 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Demandé pour qu’une session laissée ouverte au salon ne
                  permette à personne de te verrouiller dehors.
                </p>
              </div>

              <div>
                <label
                  className="mb-1 block text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  className="input"
                  value={mdp.password}
                  onChange={(e) => setMdp((f) => ({ ...f, password: e.target.value }))}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  Confirmer
                </label>
                <input
                  type="password"
                  className="input"
                  value={mdp.confirm}
                  onChange={(e) => setMdp((f) => ({ ...f, confirm: e.target.value }))}
                  minLength={6}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn-outline mt-7 w-full" disabled={busy}>
              <KeyRound className="h-3.5 w-3.5" strokeWidth={1.5} />
              {busy ? 'Changement…' : 'Changer'}
            </button>
          </form>

          {profil && (
            <div className="surface p-7 lg:col-span-2">
              <span className="eyebrow">{ROLE_LABELS[profil.role]}</span>
              <p className="mt-3 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                Ton rôle est attribué par la propriétaire : tu ne peux pas le
                modifier toi-même.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
