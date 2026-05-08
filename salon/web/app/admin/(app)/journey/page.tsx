'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Phone,
  MessageCircle,
  Calendar,
  Star,
  Cake,
  RotateCw,
  XCircle,
  UserPlus,
} from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type { Client, ClientEvent } from '@/lib/types';

type AtRisk = {
  id: string;
  name: string;
  phone: string;
  last_visit_at: string | null;
  days_since_last_visit: number;
  total_spent_xof: number;
  visits_count: number;
};

const EVENT_LABEL: Record<ClientEvent['type'], string> = {
  created: 'Inscription',
  first_visit: '1ʳᵉ visite',
  visit: 'Visite',
  review: 'Avis laissé',
  follow_up: 'Relance',
  birthday_wish: 'Anniversaire',
  lost: 'Perdue',
};

function eventIcon(type: ClientEvent['type']) {
  switch (type) {
    case 'created':
      return UserPlus;
    case 'first_visit':
    case 'visit':
      return Calendar;
    case 'review':
      return Star;
    case 'follow_up':
      return RotateCw;
    case 'birthday_wish':
      return Cake;
    case 'lost':
      return XCircle;
  }
}

function relative(iso: string) {
  const days = Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days === 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an${Math.floor(days / 365) > 1 ? 's' : ''}`;
}

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

export default function JourneyPage() {
  const [atRisk, setAtRisk] = useState<AtRisk[]>([]);
  const [events, setEvents] = useState<ClientEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  async function load() {
    const [{ data: r }, { data: e }, { data: c }] = await Promise.all([
      supabase.from('clients_at_risk').select('*'),
      supabase
        .from('client_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('clients').select('*'),
    ]);
    setAtRisk((r as AtRisk[]) || []);
    setEvents((e as ClientEvent[]) || []);
    setClients((c as Client[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('journey-admin'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_events' },
        load,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );

  const acquisitionStats = useMemo(() => {
    const counts = new Map<string, number>();
    clients.forEach((c) => {
      const key = c.acquisition_source ?? 'inconnue';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    const total = clients.length || 1;
    return Array.from(counts.entries())
      .map(([source, n]) => ({
        source,
        n,
        pct: Math.round((n / total) * 100),
      }))
      .sort((a, b) => b.n - a.n);
  }, [clients]);

  async function logFollowUp(clientId: string) {
    await supabase.from('client_events').insert({
      client_id: clientId,
      type: 'follow_up',
      source: 'manual',
      notes: 'Relance manuelle',
    });
  }

  return (
    <div className="space-y-12 stagger">
      <PageHeader
        eyebrow="Relations"
        title="Parcours"
        italic="client"
        description="Du first mile au last mile. Acquisitions, fidélisation, clientes à relancer."
      />

      {/* Acquisitions */}
      <section>
        <div className="eyebrow mb-4">Sources d&rsquo;acquisition</div>
        {acquisitionStats.length === 0 ? (
          <div
            className="border border-dashed py-10 text-center text-[13px]"
            style={{
              borderColor: 'rgb(var(--line))',
              color: 'rgb(var(--muted))',
            }}
          >
            Aucune cliente enregistrée pour le moment.
          </div>
        ) : (
          <div className="space-y-3">
            {acquisitionStats.map((s) => (
              <div key={s.source} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="capitalize">{s.source.replace('_', ' ')}</span>
                  <span
                    className="tabular-nums"
                    style={{ color: 'rgb(var(--ink-soft))' }}
                  >
                    {s.n} cliente{s.n > 1 ? 's' : ''}
                    <span
                      className="ml-2 text-[11px]"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      {s.pct}%
                    </span>
                  </span>
                </div>
                <div
                  className="h-px overflow-hidden"
                  style={{ background: 'rgb(var(--surface-2))' }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${s.pct}%`,
                      background: 'rgb(var(--ink))',
                      transition: 'width 600ms ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* À relancer */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <div className="eyebrow">À relancer</div>
          <span
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'rgb(var(--muted))' }}
          >
            90 à 180 j sans visite
          </span>
        </div>

        {atRisk.length === 0 ? (
          <div
            className="border border-dashed py-10 text-center text-[13px]"
            style={{
              borderColor: 'rgb(var(--line))',
              color: 'rgb(var(--muted))',
            }}
          >
            Personne à relancer pour le moment ✦
          </div>
        ) : (
          <div className="grid gap-px bg-[rgb(var(--line))]">
            {atRisk.map((c) => {
              const phoneClean = c.phone.replace(/[^\d+]/g, '');
              const wa = `https://wa.me/${phoneClean.replace(/^\+/, '')}`;
              return (
                <div
                  key={c.id}
                  className="bg-[rgb(var(--bg))] flex flex-wrap items-center gap-4 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <AlertCircle
                        className="h-3.5 w-3.5"
                        strokeWidth={1.5}
                        style={{ color: '#a52a2a' }}
                      />
                      <span className="font-display text-[17px] font-medium tracking-tight">
                        {c.name}
                      </span>
                    </div>
                    <div
                      className="mt-1 text-[11px] uppercase tracking-[0.18em]"
                      style={{ color: 'rgb(var(--muted))' }}
                    >
                      Vue il y a {c.days_since_last_visit} jours · {c.visits_count}{' '}
                      visite{c.visits_count > 1 ? 's' : ''} · {fmt(c.total_spent_xof)}{' '}
                      FCFA cumulés
                    </div>
                  </div>
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer noopener"
                    onClick={() => logFollowUp(c.id)}
                    className="inline-flex items-center gap-2 border px-3 py-2 text-[11px] uppercase tracking-[0.24em] hover:bg-[rgb(var(--surface-2))]"
                    style={{ borderColor: 'rgb(var(--line))' }}
                  >
                    <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
                    WhatsApp
                  </a>
                  <a
                    href={`tel:${phoneClean}`}
                    onClick={() => logFollowUp(c.id)}
                    aria-label="Appeler"
                    className="border h-9 w-9 grid place-items-center hover:bg-[rgb(var(--surface-2))]"
                    style={{ borderColor: 'rgb(var(--line))' }}
                  >
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Timeline événements */}
      <section>
        <div className="eyebrow mb-4">Activité récente</div>
        {events.length === 0 ? (
          <div
            className="border border-dashed py-10 text-center text-[13px]"
            style={{
              borderColor: 'rgb(var(--line))',
              color: 'rgb(var(--muted))',
            }}
          >
            Pas encore d&rsquo;évènement. Les ventes, premières visites et relances
            apparaîtront ici.
          </div>
        ) : (
          <ol className="space-y-0">
            {events.map((ev, i) => {
              const Icon = eventIcon(ev.type);
              const c = clientById.get(ev.client_id);
              return (
                <li key={ev.id} className="flex gap-4 py-3">
                  <div className="flex flex-col items-center pt-1">
                    <span
                      className="grid h-7 w-7 place-items-center rounded-full"
                      style={{ background: 'rgb(var(--surface-2))' }}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                    </span>
                    {i !== events.length - 1 && (
                      <span
                        className="mt-1 w-px flex-1"
                        style={{ background: 'rgb(var(--line))' }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-2">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] font-medium">
                        {EVENT_LABEL[ev.type]}
                      </span>
                      {c && (
                        <span
                          className="text-[12px]"
                          style={{ color: 'rgb(var(--ink-soft))' }}
                        >
                          · {c.name}
                        </span>
                      )}
                      <span
                        className="ml-auto text-[10px] uppercase tracking-[0.24em]"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        {relative(ev.created_at)}
                      </span>
                    </div>
                    {ev.notes && (
                      <p
                        className="mt-1 text-[12px]"
                        style={{ color: 'rgb(var(--ink-soft))' }}
                      >
                        {ev.notes}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
