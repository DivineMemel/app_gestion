'use client';
import { useEffect, useMemo, useState } from 'react';
import { MessageSquareDashed, Sparkles, Zap } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { MessageCard } from '@/components/MessageCard';
import { PushBanner } from '@/components/PushBanner';
import { TodayBanner } from '@/components/TodayBanner';
import type { Category, Client, MessageRow } from '@/lib/types';

type Filter = 'nouveau' | 'urgent' | 'tous';

export default function InboxPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [filter, setFilter] = useState<Filter>('nouveau');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: msgs }, { data: cats }, { data: cls }] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .order('priority', { ascending: true })
          .order('received_at', { ascending: false })
          .limit(200),
        supabase.from('categories').select('*'),
        supabase.from('clients').select('*'),
      ]);
      if (!active) return;
      setMessages((msgs as MessageRow[]) || []);
      setCategories((cats as Category[]) || []);
      setClients(new Map(((cls as Client[]) || []).map((c) => [c.id, c])));
      setLoading(false);
    })();

    const channel = supabase
      .channel(uniqueChannel('messages-realtime'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => {
            if (payload.eventType === 'INSERT') {
              return [payload.new as MessageRow, ...prev];
            }
            if (payload.eventType === 'UPDATE') {
              return prev.map((m) =>
                m.id === (payload.new as MessageRow).id ? (payload.new as MessageRow) : m,
              );
            }
            if (payload.eventType === 'DELETE') {
              return prev.filter((m) => m.id !== (payload.old as MessageRow).id);
            }
            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  const filtered = useMemo(() => {
    return messages
      .filter((m) => {
        if (filter === 'nouveau' && m.status !== 'nouveau') return false;
        if (filter === 'urgent' && (m.priority > 2 || m.status === 'traite')) return false;
        return true;
      })
      .filter((m) => (categoryFilter ? m.category_id === categoryFilter : true))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      });
  }, [messages, filter, categoryFilter]);

  const counts = {
    nouveau: messages.filter((m) => m.status === 'nouveau').length,
    urgent: messages.filter((m) => m.priority <= 2 && m.status !== 'traite').length,
    tous: messages.length,
  };

  return (
    <div className="space-y-5 stagger">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted">
            {counts.nouveau} message{counts.nouveau > 1 ? 's' : ''} à traiter
          </p>
        </div>
      </header>

      <div className="space-y-2.5">
        <TodayBanner />
        <PushBanner />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: 'nouveau', label: 'Nouveaux', Icon: Sparkles },
              { key: 'urgent', label: 'Urgents', Icon: Zap },
              { key: 'tous', label: 'Tous', Icon: null as any },
            ] as const
          ).map((f) => {
            const active = filter === f.key;
            const Icon = f.Icon;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as Filter)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  active ? 'text-white' : 'glass text-muted hover:text-[rgb(var(--fg))]'
                }`}
                style={
                  active
                    ? {
                        background:
                          'linear-gradient(135deg, rgb(var(--primary)), rgb(168 85 247))',
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px -4px rgba(99,102,241,0.45)',
                      }
                    : undefined
                }
              >
                {Icon && <Icon className="h-3 w-3" />}
                {f.label}
                <span
                  className={`inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-semibold ${
                    active
                      ? 'bg-white/25 text-white'
                      : 'bg-[rgb(var(--primary))]/15 text-[rgb(var(--primary))]'
                  }`}
                >
                  {counts[f.key as keyof typeof counts]}
                </span>
              </button>
            );
          })}
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`chip transition-all ${
                categoryFilter === null
                  ? 'bg-[rgb(var(--fg))] text-[rgb(var(--bg))]'
                  : 'glass text-muted'
              }`}
            >
              Toutes
            </button>
            {categories
              .filter((c) => c.active)
              .map((c) => {
                const isActive = categoryFilter === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setCategoryFilter(isActive ? null : c.id)}
                    className="chip transition-all"
                    style={
                      isActive
                        ? {
                            background: `linear-gradient(135deg, ${c.color}, ${c.color}cc)`,
                            color: 'white',
                            boxShadow: `0 4px 14px -4px ${c.color}80`,
                          }
                        : {
                            background: `${c.color}14`,
                            color: c.color,
                            border: `1px solid ${c.color}35`,
                          }
                    }
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: isActive ? 'white' : c.color }}
                    />
                    {c.label}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-3d h-24 overflow-hidden">
              <div className="shimmer h-full w-full" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card-3d mt-6 grid place-items-center px-6 py-16 text-center">
          <div
            className="halo-primary grid h-14 w-14 place-items-center rounded-2xl text-white float"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #ec4899)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px -6px rgba(99,102,241,0.5)',
            }}
          >
            <MessageSquareDashed className="h-5 w-5" />
          </div>
          <div className="mt-4 text-sm font-semibold">Aucun message</div>
          <p className="mt-1 max-w-xs text-xs text-muted">
            Quand un client écrira sur WhatsApp, il apparaîtra ici, classé et priorisé
            automatiquement.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((m) => (
            <MessageCard
              key={m.id}
              message={m}
              category={m.category_id ? catById.get(m.category_id) : undefined}
              clientName={clients.get(m.client_id)?.name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
