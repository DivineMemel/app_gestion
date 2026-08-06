'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserCheck, UserX, ShieldCheck, UserPlus, X } from 'lucide-react';
import { db, MODE_DEMO, uniqueChannel } from '@/lib/admin-db';
import { useMember } from '@/lib/member';
import { PageHeader } from '@/components/admin/PageHeader';
import { dateShort } from '@/lib/format';
import { ROLE_HINTS, ROLE_LABELS, ROLES, type Role } from '@/lib/permissions';
import type { TeamMember } from '@/lib/types';

const STATUT_CLASSE: Record<TeamMember['status'], string> = {
  pending: 'badge badge-warn',
  active: 'badge badge-ok',
  disabled: 'badge badge-danger',
};

const STATUT_LABEL: Record<TeamMember['status'], string> = {
  pending: 'En attente',
  active: 'Actif',
  disabled: 'Désactivé',
};

const VIDE = { name: '', email: '', phone: '', password: '', role: 'vendeur' as Role };

export default function ComptesPage() {
  const me = useMember();

  const [membres, setMembres] = useState<TeamMember[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [ouvert, setOuvert] = useState(false);
  const [form, setForm] = useState({ ...VIDE });
  const [creation, setCreation] = useState(false);

  const load = useCallback(async () => {
    // `password_hash` n'est jamais sélectionné : il n'a rien à faire dans une
    // réponse envoyée au navigateur, même pour le patron.
    const { data, error } = await db
      .from('team_members')
      .select('id, name, email, role, status, phone, created_at')
      .order('created_at', { ascending: false });
    setErreur(error?.message ?? null);
    setMembres((data ?? []) as TeamMember[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    load();
    const ch = db
      .channel(uniqueChannel('comptes'))
      .on('postgres_changes', { table: 'team_members' }, load)
      .subscribe();
    return () => db.removeChannel(ch);
  }, [load]);

  const patronsActifs = useMemo(
    () => membres.filter((m) => m.role === 'patron' && m.status === 'active'),
    [membres],
  );

  /**
   * Empêche de se retirer la dernière clé de la maison : rétrograder ou
   * désactiver le seul patron actif fermerait à jamais l'accès aux comptes et
   * aux réglages.
   *
   * Le mot de passe maître resterait un filet de secours, mais compter dessus
   * comme mécanisme normal serait un mauvais service à rendre.
   */
  function dernierPatron(m: TeamMember): boolean {
    return (
      m.role === 'patron' &&
      m.status === 'active' &&
      patronsActifs.length <= 1
    );
  }

  async function majMembre(m: TeamMember, patch: Partial<TeamMember>) {
    const perdPatron =
      (patch.role !== undefined && patch.role !== 'patron') ||
      (patch.status !== undefined && patch.status !== 'active');

    if (dernierPatron(m) && perdPatron) {
      setErreur(
        `${m.name} est le seul patron actif. Nomme d’abord un autre patron avant de le rétrograder ou de le désactiver.`,
      );
      return;
    }

    setBusy(m.id);
    setErreur(null);
    const { error } = await db.from('team_members').update(patch).eq('id', m.id);
    setBusy(null);
    if (error) setErreur(error.message);
    else load();
  }

  async function creerMembre(e: React.FormEvent) {
    e.preventDefault();
    setCreation(true);
    setErreur(null);

    // Sans base, le hachage serveur n'est pas joignable : on écrit directement
    // dans le magasin local pour que l'écran reste utilisable en démonstration.
    if (MODE_DEMO) {
      const { error } = await db.from('team_members').insert({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        role: form.role,
        status: 'active',
        password_hash: 'demo',
      });
      setCreation(false);
      if (error) {
        setErreur(error.message);
        return;
      }
      setForm({ ...VIDE });
      setOuvert(false);
      load();
      return;
    }

    try {
      const res = await fetch('/api/admin/members', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setForm({ ...VIDE });
        setOuvert(false);
        load();
      } else {
        setErreur(json?.reason ?? 'Création impossible.');
      }
    } catch {
      setErreur('Connexion perdue.');
    } finally {
      setCreation(false);
    }
  }

  const attente = membres.filter((m) => m.status === 'pending');

  return (
    <>
      <PageHeader
        title="Comptes & rôles"
        subtitle={`${membres.length} compte${membres.length > 1 ? 's' : ''}${
          attente.length ? ` · ${attente.length} en attente` : ''
        }`}
        actions={
          <button onClick={() => setOuvert(true)} className="btn-primary">
            <UserPlus className="h-4 w-4" strokeWidth={2} />
            Ouvrir un compte
          </button>
        }
      />

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

      {attente.length > 0 && (
        <div
          className="mb-6 border p-4"
          style={{
            borderColor: 'rgb(var(--orange) / 0.5)',
            background: 'rgb(var(--orange) / 0.07)',
          }}
        >
          <div className="text-[14px] font-semibold">
            {attente.length} demande{attente.length > 1 ? 's' : ''} d’accès
          </div>
          <p className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
            Un compte en attente ne voit rien tant qu’il n’est pas validé.
          </p>
        </div>
      )}

      <div className="surface tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Membre</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Inscrit</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {chargement ? (
              <tr>
                <td colSpan={5} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Chargement…
                </td>
              </tr>
            ) : membres.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-10 text-center" style={{ color: 'rgb(var(--muted))' }}>
                  Aucun compte. Ouvre-en un pour ton équipe.
                </td>
              </tr>
            ) : (
              membres.map((m) => {
                const verrouille = dernierPatron(m);
                return (
                  <tr key={m.id}>
                    <td>
                      <div className="font-medium">{m.name}</div>
                      <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                        {m.email}
                        {m.phone && ` · ${m.phone}`}
                      </div>
                    </td>
                    <td>
                      <select
                        className="select w-auto py-1.5 text-[13px]"
                        value={m.role}
                        disabled={busy === m.id || verrouille}
                        title={
                          verrouille
                            ? 'Seul patron actif : nomme un autre patron d’abord.'
                            : undefined
                        }
                        onChange={(e) => majMembre(m, { role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={STATUT_CLASSE[m.status]}>
                        {STATUT_LABEL[m.status]}
                      </span>
                    </td>
                    <td style={{ color: 'rgb(var(--muted))' }}>{dateShort(m.created_at)}</td>
                    <td className="num">
                      {m.status !== 'active' ? (
                        <button
                          onClick={() => majMembre(m, { status: 'active' })}
                          className="btn-primary"
                          disabled={busy === m.id}
                        >
                          <UserCheck className="h-4 w-4" strokeWidth={1.75} />
                          Activer
                        </button>
                      ) : (
                        <button
                          onClick={() => majMembre(m, { status: 'disabled' })}
                          className="btn-danger"
                          disabled={busy === m.id || verrouille}
                          title={
                            verrouille ? 'Impossible : c’est le seul patron actif.' : undefined
                          }
                        >
                          <UserX className="h-4 w-4" strokeWidth={1.75} />
                          Désactiver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
        Un changement de rôle ou une désactivation prend effet au chargement
        suivant : le rôle est revérifié en base à chaque requête, pas seulement
        à la connexion.
        {MODE_DEMO && (
          <>
            {' '}
            En démonstration, les comptes créés ici ne permettent pas encore de
            se connecter — l’authentification passe par la base.
          </>
        )}
      </p>

      {/* ---------- Aide-mémoire des rôles ---------- */}
      <section className="mt-8">
        <h2 className="eyebrow mb-2">Ce que voit chaque rôle</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r} className="surface p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck
                  className="h-4 w-4"
                  strokeWidth={1.75}
                  style={{ color: 'rgb(var(--accent))' }}
                />
                <span className="font-semibold">{ROLE_LABELS[r]}</span>
                {me.role === r && <span className="badge badge-accent">toi</span>}
              </div>
              <p className="mt-1.5 text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                {ROLE_HINTS[r]}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Ouvrir un compte ---------- */}
      {ouvert && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4">
          <form onSubmit={creerMembre} className="surface mx-auto my-8 w-full max-w-md">
            <div
              className="flex items-center justify-between border-b px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="eyebrow">Ouvrir un compte</span>
              <button type="button" onClick={() => setOuvert(false)} className="btn-ghost">
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="space-y-4 p-5">
              <p className="text-[13px]" style={{ color: 'rgb(var(--muted))' }}>
                Le compte est actif immédiatement. Communique le mot de passe à
                la personne : elle pourra le garder ou t’en demander un autre.
              </p>

              <div>
                <label className="label">Nom complet</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="label">E-mail</label>
                <input
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="label">Téléphone</label>
                <input
                  className="input"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+225 …"
                />
              </div>

              <div>
                <label className="label">Rôle</label>
                <select
                  className="select"
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[12px]" style={{ color: 'rgb(var(--muted))' }}>
                  {ROLE_HINTS[form.role]}
                </p>
              </div>

              <div>
                <label className="label">Mot de passe provisoire</label>
                <input
                  type="text"
                  className="input font-mono"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  minLength={6}
                  required={!MODE_DEMO}
                  placeholder="6 caractères minimum"
                />
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t px-5 py-3"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button type="button" onClick={() => setOuvert(false)} className="btn-outline">
                Annuler
              </button>
              <button type="submit" className="btn-primary" disabled={creation}>
                {creation ? 'Création…' : 'Ouvrir le compte'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
