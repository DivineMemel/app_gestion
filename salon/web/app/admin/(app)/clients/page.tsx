'use client';
import { useEffect, useMemo, useState } from 'react';
import { Search, MessageCircle, Phone } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { Client } from '@/lib/types';

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

function relativeDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('last_visit_at', { ascending: false, nullsFirst: false });
    setClients((data as Client[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('clients-admin'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q),
    );
  }, [clients, query]);

  const total = clients.length;
  const totalSpent = clients.reduce((sum, c) => sum + (c.total_spent_xof || 0), 0);

  return (
    <div className="space-y-10 stagger">
      <PageHeader
        eyebrow="Relations"
        title="Clients &"
        italic="parcours"
        description="Toutes tes clientes, du first mile au last mile. Trie, filtre, contacte."
      />

      <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-3">
        <Stat label="Clientes enregistrées" value={String(total)} />
        <Stat label="Chiffre cumulé" value={`${fmt(totalSpent)} FCFA`} />
        <Stat
          label="Dernière inscription"
          value={
            clients[0]?.created_at
              ? new Date(clients[0].created_at).toLocaleDateString('fr-FR')
              : '—'
          }
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'rgb(var(--muted))' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher par nom, téléphone, email…"
          className="input pl-7"
        />
      </div>

      {loading && <div className="text-sm text-muted">Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div className="surface px-6 py-12 text-center text-sm text-muted">
          {clients.length === 0 ? 'Aucune cliente enregistrée.' : 'Aucun résultat.'}
        </div>
      )}

      <ul className="divide-y" style={{ borderColor: 'rgb(var(--line))' }}>
        {filtered.map((c, i) => {
          const phoneClean = c.phone.replace(/[^\d]/g, '');
          return (
            <li
              key={c.id}
              className="grid grid-cols-12 items-baseline gap-4 border-t py-5"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <span className="section-number col-span-2 md:col-span-1">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="col-span-10 md:col-span-4">
                <div className="font-display text-xl font-medium tracking-tight">{c.name}</div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.2em] font-mono" style={{ color: 'rgb(var(--muted))' }}>
                  {c.phone}
                </div>
                {c.acquisition_source && (
                  <div className="mt-1 text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgb(var(--muted))' }}>
                    via {c.acquisition_source.replace('_', ' ')}
                  </div>
                )}
              </div>
              <div className="col-span-4 md:col-span-2 text-[12px]" style={{ color: 'rgb(var(--ink-soft))' }}>
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgb(var(--muted))' }}>
                  Visites
                </div>
                {c.visits_count}
              </div>
              <div className="col-span-4 md:col-span-2 text-[12px]" style={{ color: 'rgb(var(--ink-soft))' }}>
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgb(var(--muted))' }}>
                  Dépensé
                </div>
                {fmt(c.total_spent_xof)} FCFA
              </div>
              <div className="col-span-4 md:col-span-2 text-[12px]" style={{ color: 'rgb(var(--ink-soft))' }}>
                <div className="text-[10px] uppercase tracking-[0.2em]" style={{ color: 'rgb(var(--muted))' }}>
                  Dernière visite
                </div>
                {relativeDate(c.last_visit_at)}
              </div>
              <div className="col-span-12 md:col-span-1 flex items-center justify-end gap-1">
                <a
                  href={`tel:${phoneClean}`}
                  className="grid h-9 w-9 place-items-center border transition-colors hover:bg-[rgb(var(--ink))] hover:text-[rgb(var(--bg))]"
                  style={{ borderColor: 'rgb(var(--line-strong))' }}
                  aria-label="Appeler"
                >
                  <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                </a>
                <a
                  href={`https://wa.me/${phoneClean}`}
                  target="_blank"
                  rel="noreferrer"
                  className="grid h-9 w-9 place-items-center border transition-colors hover:bg-[rgb(var(--ink))] hover:text-[rgb(var(--bg))]"
                  style={{ borderColor: 'rgb(var(--line-strong))' }}
                  aria-label="WhatsApp"
                >
                  <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[rgb(var(--bg))] p-6">
      <div className="font-display text-3xl font-medium tracking-tight tabular-nums">{value}</div>
      <div
        className="mt-1 text-[11px] uppercase tracking-[0.2em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
    </div>
  );
}
