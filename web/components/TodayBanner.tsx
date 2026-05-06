'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import type { Appointment } from '@/lib/types';

export function TodayBanner() {
  const [today, setToday] = useState<Appointment[]>([]);

  async function load() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from('appointments')
      .select('*')
      .gte('scheduled_at', start.toISOString())
      .lte('scheduled_at', end.toISOString())
      .neq('status', 'annule')
      .order('scheduled_at', { ascending: true });
    setToday((data as Appointment[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel('today-banner')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  if (today.length === 0) return null;

  const next = today.find((a) => new Date(a.scheduled_at) > new Date());
  const time = next
    ? new Date(next.scheduled_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Link
      href="/calendar"
      className="block rounded-xl border border-indigo-200 bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950 px-3 py-2"
    >
      <div className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
        Aujourd'hui · {today.length} RDV
      </div>
      {next && (
        <div className="text-xs text-indigo-700 dark:text-indigo-300">
          Prochain : {time} — {next.title}
        </div>
      )}
    </Link>
  );
}
