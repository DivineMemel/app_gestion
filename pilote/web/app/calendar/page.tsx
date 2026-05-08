'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, CalendarPlus } from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { AppointmentDialog } from '@/components/AppointmentDialog';
import type { Appointment, Category, Client } from '@/lib/types';

const DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const HOURS_START = 7;
const HOURS_END = 21;
const HOUR_HEIGHT = 56;

type ViewMode = 'week' | 'day';

export default function CalendarPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [creatingAt, setCreatingAt] = useState<Date | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  async function load() {
    const start = addDays(anchor, -14).toISOString();
    const end = addDays(anchor, 28).toISOString();
    const [{ data: app }, { data: cls }, { data: cats }] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .gte('scheduled_at', start)
        .lte('scheduled_at', end)
        .order('scheduled_at'),
      supabase.from('clients').select('*').order('last_seen_at', { ascending: false }),
      supabase.from('categories').select('*'),
    ]);
    setAppointments((app as Appointment[]) || []);
    setClients((cls as Client[]) || []);
    setCategories((cats as Category[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('cal-realtime'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.getTime()]);

  const days =
    view === 'week'
      ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))
      : [
          (() => {
            const x = new Date(anchor);
            x.setHours(0, 0, 0, 0);
            return x;
          })(),
        ];

  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const d = new Date(a.scheduled_at);
      const key = d.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [appointments]);

  const today = new Date();
  const monthLabel = anchor.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  function shift(direction: -1 | 1) {
    setAnchor(addDays(anchor, view === 'week' ? 7 * direction : direction));
  }

  function openCreate(date?: Date) {
    setEditing(null);
    setCreatingAt(date || null);
    setShowDialog(true);
  }

  function openEdit(a: Appointment) {
    setEditing(a);
    setCreatingAt(null);
    setShowDialog(true);
  }

  return (
    <div className="space-y-5 stagger">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-sm text-muted capitalize">{monthLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="glass inline-flex rounded-xl p-0.5">
            {(['week', 'day'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-all ${
                  view === v
                    ? 'text-white'
                    : 'text-muted hover:text-[rgb(var(--fg))]'
                }`}
                style={
                  view === v
                    ? {
                        background:
                          'linear-gradient(135deg, rgb(var(--primary)), rgb(168 85 247))',
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 14px -4px rgba(99,102,241,0.45)',
                      }
                    : undefined
                }
              >
                {v === 'week' ? 'Semaine' : 'Jour'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="btn-ghost h-9 w-9 p-0">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setAnchor(new Date())} className="btn-ghost">
              Aujourd'hui
            </button>
            <button onClick={() => shift(1)} className="btn-ghost h-9 w-9 p-0">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => openCreate()} className="btn-primary">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Nouveau</span>
          </button>
        </div>
      </header>

      <div className="card-3d overflow-hidden">
        <div
          className="grid border-b border-[rgb(var(--border))] glass-strong"
          style={{
            gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div
                key={i}
                className="relative border-l border-[rgb(var(--border))] py-2 text-center"
              >
                {isToday && (
                  <div
                    className="absolute inset-x-2 top-1.5 bottom-1.5 rounded-lg -z-0"
                    style={{
                      background:
                        'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(236,72,153,0.10))',
                    }}
                  />
                )}
                <div
                  className={`relative text-[10px] uppercase tracking-wide ${
                    isToday ? 'text-[rgb(var(--primary))] font-semibold' : 'text-muted'
                  }`}
                >
                  {view === 'week'
                    ? DAY_NAMES[i]
                    : d.toLocaleDateString('fr-FR', { weekday: 'long' })}
                </div>
                <div
                  className={`relative text-base font-semibold leading-tight ${
                    isToday ? 'text-[rgb(var(--primary))]' : ''
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          <div>
            {Array.from(
              { length: HOURS_END - HOURS_START },
              (_, i) => HOURS_START + i,
            ).map((h) => (
              <div
                key={h}
                className="border-b border-[rgb(var(--border))] pr-1.5 pt-1 text-right text-[10px] text-muted tabular-nums"
                style={{ height: HOUR_HEIGHT }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((d, dayIdx) => {
            const items = apptsByDay.get(d.toDateString()) || [];
            const isToday = sameDay(d, today);
            return (
              <div
                key={dayIdx}
                className="relative border-l border-[rgb(var(--border))]"
                style={
                  isToday
                    ? {
                        background:
                          'linear-gradient(180deg, rgba(99,102,241,0.04), rgba(99,102,241,0.01))',
                      }
                    : undefined
                }
              >
                {Array.from(
                  { length: HOURS_END - HOURS_START },
                  (_, i) => HOURS_START + i,
                ).map((h) => {
                  const slotDate = new Date(d);
                  slotDate.setHours(h, 0, 0, 0);
                  return (
                    <button
                      key={h}
                      onClick={() => openCreate(slotDate)}
                      className="block w-full border-b border-[rgb(var(--border))] transition-colors hover:bg-[rgb(var(--primary))]/8"
                      style={{ height: HOUR_HEIGHT }}
                      aria-label={`Créer un RDV à ${h}h`}
                    />
                  );
                })}
                {items.map((a) => {
                  const t = new Date(a.scheduled_at);
                  const minutes = (t.getHours() - HOURS_START) * 60 + t.getMinutes();
                  if (minutes < 0 || minutes > (HOURS_END - HOURS_START) * 60)
                    return null;
                  const top = (minutes / 60) * HOUR_HEIGHT;
                  const height = Math.max(
                    26,
                    ((a.duration_minutes || 60) / 60) * HOUR_HEIGHT - 4,
                  );
                  const cat = a.category_id
                    ? categories.find((c) => c.id === a.category_id)
                    : null;
                  const client = clients.find((c) => c.id === a.client_id);
                  const dimmed = a.status === 'fait' || a.status === 'annule';
                  const color = cat?.color || '#6366f1';
                  return (
                    <button
                      key={a.id}
                      onClick={() => openEdit(a)}
                      className={`group absolute left-1 right-1 overflow-hidden rounded-lg px-1.5 py-1 text-left text-[10px] leading-tight transition-all hover:scale-[1.02] hover:z-10 ${
                        dimmed ? 'opacity-50' : ''
                      }`}
                      style={{
                        top,
                        height,
                        background: `linear-gradient(135deg, ${color}28 0%, ${color}14 100%)`,
                        borderLeft: `3px solid ${color}`,
                        boxShadow: dimmed
                          ? 'none'
                          : `inset 0 1px 0 ${color}20, 0 4px 14px -4px ${color}50`,
                      }}
                    >
                      <div className="font-mono text-[9px] text-muted tabular-nums">
                        {t.toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                      <div
                        className={`truncate font-semibold ${
                          a.status === 'annule' ? 'line-through' : ''
                        }`}
                        style={{ color }}
                      >
                        {a.title}
                      </div>
                      {client?.name && height > 36 && (
                        <div className="truncate text-muted">{client.name}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {appointments.length === 0 && (
        <div className="card-3d grid place-items-center px-6 py-12 text-center">
          <div
            className="halo-primary grid h-14 w-14 place-items-center rounded-2xl text-white"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #ec4899)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.25), 0 8px 24px -6px rgba(99,102,241,0.5)',
            }}
          >
            <CalendarPlus className="h-5 w-5" />
          </div>
          <div className="mt-4 text-sm font-semibold">Aucun RDV cette semaine</div>
          <p className="mt-1 max-w-sm text-xs text-muted">
            Quand un client demande un RDV par WhatsApp, l'IA extrait la date et
            crée le RDV automatiquement. Tu peux aussi en créer manuellement.
          </p>
        </div>
      )}

      {showDialog && (
        <AppointmentDialog
          appointment={editing}
          defaultDate={creatingAt || undefined}
          categories={categories}
          clients={clients}
          onClose={() => setShowDialog(false)}
        />
      )}
    </div>
  );
}
