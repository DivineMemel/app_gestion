'use client';
import { useCallback, useEffect, useState } from 'react';
import { Save, Check, ShieldCheck, KeyRound } from 'lucide-react';
import { useMember } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateShort } from '@/lib/format';
import { ROLE_HINTS, ROLE_LABELS } from '@/lib/permissions';

type Profil = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  created_at?: string;
};

export default function ProfilPage() {
  const me = useMember();

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
          setIdent({
            name: json.profile.name ?? '',
            phone: json.profile.phone ?? '',
          });
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
        <PageHeader title="Mon profil" />
        <p className="surface p-10 text-center text-sm" style={{ color: 'rgb(var(--muted))' }}>
          Chargement…
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Mon profil" subtitle={ROLE_LABELS[me.role]} />

      {erreur && (
        <div
          className="mb-4 border p-3 text-sm"
          style={{
            borderColor: 'rgb(var(--danger) / 0.4)',
            background: 'rgb(var(--danger) / 0.06)',
            color: 'rgb(var(--danger))',
          }}
        >
          {erreur}
        </div>
      )}
      {ok && (
        <div
          className="mb-4 flex items-center gap-2 border p-3 text-sm"
          style={{
            borderColor: 'rgb(var(--ok) / 0.4)',
            background: 'rgb(var(--ok) / 0.07)',
            color: 'rgb(var(--ok))',
          }}
        >
          <Check className="h-4 w-4" strokeWidth={2} />
          {ok}
        </div>
      )}

      {master ? (
        <div className="surface max-w-2xl p-6">
          <div
            className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-industrial"
            style={{ color: 'rgb(var(--orange))' }}
          >
            <KeyRound className="h-4 w-4" strokeWidth={1.75} />
            Accès de secours
          </div>
          <p className="mt-3 text-sm" style={{ color: 'rgb(var(--ink-soft))' }}>
            Tu es connecté avec le <strong>mot de passe maître</strong>, défini
            dans les variables d’environnement. Ce n’est pas un compte : il n’a
            ni profil, ni nom, ni historique.
          </p>
          <p className="mt-3 text-sm" style={{ color: 'rgb(var(--ink-soft))' }}>
            Conséquence concrète : <strong>toutes les ventes encaissées ainsi
            n’ont aucun vendeur enregistré.</strong> Ouvre-toi un vrai compte
            patron depuis la page Comptes et utilise-le au quotidien — garde le
            mot de passe maître pour les cas où tu serais bloqué dehors.
          </p>
        </div>
      ) : (
        <div className="grid max-w-4xl gap-5 lg:grid-cols-2">
          {/* ---------- Identité ---------- */}
          <form onSubmit={enregistrerIdentite} className="surface p-5">
            <h2 className="eyebrow mb-4">Mes informations</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Nom complet</label>
                <input
                  className="input"
                  value={ident.name}
                  onChange={(e) => setIdent((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="label">Téléphone</label>
                <input
                  className="input"
                  value={ident.phone}
                  onChange={(e) => setIdent((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+225 …"
                />
              </div>

              <div>
                <label className="label">E-mail de connexion</label>
                <input className="input" value={profil?.email ?? ''} disabled />
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  C’est ton identifiant : seul le patron peut le changer, depuis
                  Comptes.
                </p>
              </div>
            </div>

            <button type="submit" className="btn-primary mt-5" disabled={busy}>
              <Save className="h-4 w-4" strokeWidth={1.75} />
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>

          {/* ---------- Mot de passe ---------- */}
          <form onSubmit={changerMotDePasse} className="surface p-5">
            <h2 className="eyebrow mb-4">Changer mon mot de passe</h2>

            <div className="space-y-4">
              <div>
                <label className="label">Mot de passe actuel</label>
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
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  Demandé pour qu’une session laissée ouverte au comptoir ne
                  permette pas à un passant de te verrouiller dehors.
                </p>
              </div>

              <div>
                <label className="label">Nouveau mot de passe</label>
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
                <label className="label">Confirmer</label>
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

            <button type="submit" className="btn-solid mt-5" disabled={busy}>
              <KeyRound className="h-4 w-4" strokeWidth={1.75} />
              {busy ? 'Changement…' : 'Changer'}
            </button>
          </form>

          {/* ---------- Rôle ---------- */}
          <div className="surface p-5 lg:col-span-2">
            <div className="flex items-center gap-2">
              <ShieldCheck
                className="h-4 w-4"
                strokeWidth={1.75}
                style={{ color: 'rgb(var(--accent))' }}
              />
              <span className="font-semibold">{ROLE_LABELS[me.role]}</span>
              {profil?.created_at && (
                <span className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  · membre depuis le {dateShort(profil.created_at)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
              {ROLE_HINTS[me.role]} Ton rôle est attribué par le patron : tu ne
              peux pas le modifier toi-même.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
