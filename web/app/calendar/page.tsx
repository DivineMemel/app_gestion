'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Appointment, Client } from '@/lib/types';

function groupByDay(items: Appointment[]) {
  const map = new Map<string, Appointment[]>();
  for (const a of items) {
    const key = new Date(a.scheduled_at).toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return [...map.entries()];
}

export default function CalendarPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Map<string, Client>>(new Map());

  async function load() {
    const now = new Date().toISOString();
    const [{ data: app }, { data: cls }] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .gte('scheduled_at', now)
        .order('scheduled_at', { ascending: true }),
      supabase.from('clients').select('*'),
    ]);
    setAppointments((app as Appointment[]) || []);
    setClients(new Map(((cls as Client[]) || []).map((c) => [c.id, c])));
  }

  useEffect(() => {
    load();
    const channel = supabase
      .channel('appointments-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const grouped = groupByDay(appointments);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Agenda</h1>

      {appointments.length === 0 && (
        <div className="text-sm text-slate-500 text-center py-12">
          Aucun RDV planifié. Crée-en depuis un message dans l'inbox.
        </div>
      )}

      {grouped.map(([day, items]) => (
        <div key={day}>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">{day}</div>
          <ul className="space-y-2">
            {items.map((a) => {
              const client = clients.get(a.client_id);
              const phone = client?.phone.replace('@s.whatsapp.net', '');
              const time = new Date(a.scheduled_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <li
                  key={a.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 bg-white dark:bg-slate-900"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono">{time}</span>
                    <span className="font-medium">{a.title}</span>
                    <span
                      className={`ml-auto text-xs px-2 py-0.5 rounded-full ${
                        a.status === 'confirme'
                          ? 'bg-emerald-100 text-emerald-700'
                          : a.status === 'fait'
                          ? 'bg-slate-200 text-slate-600'
                          : a.status === 'annule'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    {client?.name || phone}
                  </div>
                  {a.address && (
                    <div className="text-xs text-slate-500 mt-1">📍 {a.address}</div>
                  )}
                  {a.notes && <div className="text-xs text-slate-500 mt-1">{a.notes}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
