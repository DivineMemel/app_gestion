'use client';
import { useEffect, useState } from 'react';
import { Check, Trash2, ShieldCheck } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/admin-db';
import { PageHeader } from '@/components/admin/PageHeader';
import { ROLES, ROLE_LABELS, type Role } from '@/lib/permissions';
import type { TeamMember } from '@/lib/types';

const STATUS_LABELS: Record<TeamMember['status'], string> = {
  pending: 'En attente',
  active: 'Actif',
  disabled: 'Désactivé',
};

export default function ComptesPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from('team_members')
      .select('id,name,email,role,status,created_at')
      .order('created_at', { ascending: false });
    setMembers((data as TeamMember[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('comptes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function setRole(m: TeamMember, role: Role) {
    await supabase.from('team_members').update({ role }).eq('id', m.id);
  }
  async function setStatus(m: TeamMember, status: TeamMember['status']) {
    await supabase.from('team_members').update({ status }).eq('id', m.id);
  }
  async function remove(m: TeamMember) {
    if (!confirm(`Supprimer le compte de ${m.name} ?`)) return;
    await supabase.from('team_members').delete().eq('id', m.id);
  }

  const pending = members.filter((m) => m.status === 'pending');
  const others = members.filter((m) => m.status !== 'pending');

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Administration"
        title="Comptes &"
        italic="accès"
        description="Valide les inscriptions et attribue les rôles. Le rôle détermine les pages visibles et les actions autorisées."
      />

      {loading && <div className="text-sm text-muted">Chargement…</div>}

      {pending.length > 0 && (
        <section>
          <div className="eyebrow mb-4">En attente de validation</div>
          <div className="grid gap-px bg-[rgb(var(--line))]">
            {pending.map((m) => (
              <div key={m.id} className="bg-[rgb(var(--bg))] flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="font-display text-lg font-medium tracking-tight">{m.name}</div>
                  <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>{m.email}</div>
                </div>
                <select
                  className="input max-w-[10rem] bg-[rgb(var(--surface))]"
                  value={m.role}
                  onChange={(e) => setRole(m, e.target.value as Role)}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                <button onClick={() => setStatus(m, 'active')} className="btn-primary text-[11px]">
                  <Check className="h-3.5 w-3.5" />
                  Valider
                </button>
                <button onClick={() => remove(m)} className="btn-ghost text-[11px] text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="eyebrow mb-4">Membres</div>
        {!loading && others.length === 0 ? (
          <div className="surface px-6 py-12 text-center text-sm text-muted">
            Aucun membre actif. Les comptes validés apparaissent ici.
          </div>
        ) : (
          <div className="grid gap-px bg-[rgb(var(--line))]">
            {others.map((m) => (
              <div key={m.id} className="bg-[rgb(var(--bg))] flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-lg font-medium tracking-tight">{m.name}</span>
                    {m.status === 'disabled' && <span className="chip surface-2 text-muted">Désactivé</span>}
                  </div>
                  <div className="text-[12px]" style={{ color: 'rgb(var(--muted))' }}>{m.email}</div>
                </div>

                <select
                  className="input max-w-[10rem] bg-[rgb(var(--surface))]"
                  value={m.role}
                  onChange={(e) => setRole(m, e.target.value as Role)}
                  disabled={m.status === 'disabled'}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>

                {m.status === 'active' ? (
                  <button onClick={() => setStatus(m, 'disabled')} className="btn-ghost text-[11px]">
                    Désactiver
                  </button>
                ) : (
                  <button onClick={() => setStatus(m, 'active')} className="btn-ghost text-[11px]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Réactiver
                  </button>
                )}
                <button onClick={() => remove(m)} className="btn-ghost text-[11px] text-red-700">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
