'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ArrowRight } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
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
      .channel(uniqueChannel('today-banner'))
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
      className="group relative block overflow-hidden rounded-2xl lift"
      style={{
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 24px -6px rgba(99,102,241,0.45)',
      }}
    >
      {/* Gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, #6366f1 0%, #8b5cf6 45%, #d946ef 100%)',
        }}
      />
      {/* Mesh blobs */}
      <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
      <div className="absolute -bottom-16 left-1/3 h-40 w-40 rounded-full bg-fuchsia-300/30 blur-3xl" />
      {/* Sheen */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          background:
            'linear-gradient(135deg, rgba(255,255,255,0.35) 0%, transparent 35%)',
        }}
      />

      <div className="relative flex items-center gap-3 px-4 py-3 text-white">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur-sm">
          <CalendarClock className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold tracking-tight">
            Aujourd'hui · {today.length} RDV
          </div>
          {next && (
            <div className="text-[11.5px] text-white/85 truncate">
              Prochain : <span className="font-mono font-semibold">{time}</span>
              {' — '}
              {next.title}
            </div>
          )}
        </div>
        <ArrowRight className="h-4 w-4 text-white/85 transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}
