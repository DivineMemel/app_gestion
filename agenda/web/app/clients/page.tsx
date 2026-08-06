'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, Users as UsersIcon, MessageCircle, Calendar } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Appointment, Client, MessageRow } from '@/lib/types';

type Stats = { messages: number; appointments: number; lastMessage: Date | null };

function initials(name?: string | null, phone?: string) {
  if (name) {
    return name.split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  if (phone) return phone.slice(-2);
  return '?';
}

function timeAgo(d: Date) {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'à l\'instant';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} j`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [stats, setStats] = useState<Map<string, Stats>>(new Map());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: cls }, { data: msgs }, { data: app }] = await Promise.all([
        supabase
          .from('clients')
          .select('*')
          .order('last_seen_at', { ascending: false }),
        supabase.from('messages').select('client_id, received_at'),
        supabase.from('appointments').select('client_id'),
      ]);
      const stat = new Map<string, Stats>();
      for (const m of (msgs as Pick<MessageRow, 'client_id' | 'received_at'>[]) || []) {
        const s = stat.get(m.client_id) || { messages: 0, appointments: 0, lastMessage: null };
        s.messages += 1;
        const d = new Date(m.received_at);
        if (!s.lastMessage || d > s.lastMessage) s.lastMessage = d;
        stat.set(m.client_id, s);
      }
      for (const a of (app as Pick<Appointment, 'client_id'>[]) || []) {
        const s = stat.get(a.client_id) || { messages: 0, appointments: 0, lastMessage: null };
        s.appointments += 1;
        stat.set(a.client_id, s);
      }
      setStats(stat);
      setClients((cls as Client[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q),
    );
  }, [clients, search]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-sm text-muted">
          {clients.length} contact{clients.length > 1 ? 's' : ''} enregistré
          {clients.length > 1 ? 's' : ''}.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par nom ou numéro…"
          className="input pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface h-16 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface grid place-items-center rounded-xl px-6 py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[rgb(var(--surface-2))]">
            <UsersIcon className="h-5 w-5 text-muted" />
          </div>
          <div className="mt-3 text-sm font-medium">Aucun client</div>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Les clients qui écriront sur WhatsApp apparaîtront ici automatiquement.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => {
            const s = stats.get(c.id);
            const phone = c.phone.replace('@s.whatsapp.net', '');
            return (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="surface group flex items-center gap-3 rounded-xl p-3 transition-all hover:shadow-sm"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-semibold text-white">
                    {initials(c.name, phone)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {c.name || `+${phone}`}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      {c.name && <span className="font-mono">+{phone}</span>}
                      {s?.lastMessage && (
                        <span>· vu {timeAgo(s.lastMessage)}</span>
                      )}
                    </div>
                  </div>
                  <div className="hidden gap-3 text-[11px] text-muted sm:flex">
                    {s && (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />
                          {s.messages}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {s.appointments}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
