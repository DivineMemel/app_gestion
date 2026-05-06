'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MessageCard } from '@/components/MessageCard';
import { PushBanner } from '@/components/PushBanner';
import { TodayBanner } from '@/components/TodayBanner';
import type { Category, Client, MessageRow } from '@/lib/types';

type Filter = 'nouveau' | 'tous';

export default function InboxPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [clients, setClients] = useState<Map<string, Client>>(new Map());
  const [filter, setFilter] = useState<Filter>('nouveau');
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
      .channel('messages-realtime')
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

  const catById = new Map(categories.map((c) => [c.id, c]));
  const filtered = messages
    .filter((m) => (filter === 'nouveau' ? m.status === 'nouveau' : true))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
    });

  const counts = {
    nouveau: messages.filter((m) => m.status === 'nouveau').length,
    tous: messages.length,
  };

  return (
    <div className="space-y-3">
      <TodayBanner />
      <PushBanner />
      <div className="flex gap-2">
        {(['nouveau', 'tous'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-sm ${
              filter === f
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-200 dark:bg-slate-800'
            }`}
          >
            {f === 'nouveau' ? 'Nouveaux' : 'Tous'} ({counts[f]})
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-slate-500">Chargement…</div>}
      {!loading && filtered.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-12">
          Aucun message pour l'instant. Vérifiez la{' '}
          <a href="/setup" className="underline">
            connexion WhatsApp
          </a>
          .
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((m) => (
          <MessageCard
            key={m.id}
            message={m}
            category={m.category_id ? catById.get(m.category_id) : undefined}
            clientName={clients.get(m.client_id)?.name}
          />
        ))}
      </div>
    </div>
  );
}
