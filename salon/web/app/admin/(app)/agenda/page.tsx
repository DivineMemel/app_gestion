'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  X,
  Check,
  CalendarX2,
  MessageCircle,
} from 'lucide-react';
import { supabase, uniqueChannel } from '@/lib/supabase';
import { PageHeader } from '@/components/admin/PageHeader';
import type {
  Appointment,
  Client,
  Service,
  Sector,
  Staff,
} from '@/lib/types';

const DAY_NAMES_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HOURS_START = 8;
const HOURS_END = 21;
const HOUR_HEIGHT = 64;

type ViewMode = 'week' | 'day';

const STATUS_COLORS: Record<Appointment['status'], string> = {
  pending: '#a87623',
  confirmed: '#3a2f24',
  completed: '#6b6356',
  cancelled: '#a52a2a',
  no_show: '#a52a2a',
};

const STATUS_LABELS: Record<Appointment['status'], string> = {
  pending: 'À confirmer',
  confirmed: 'Confirmé',
  completed: 'Terminé',
  cancelled: 'Annulé',
  no_show: 'Absente',
};

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
  return a.toDateString() === b.toDateString();
}
function localISO(d: Date) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 16);
}

type NewAppt = {
  client_id: string;
  service_id: string;
  staff_id: string;
  scheduled_at: string;
  notes: string;
};

type ConflictMap = Map<string, number>;

export default function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState<Date>(() => new Date());

  const [selected, setSelected] = useState<Appointment | null>(null);
  const [creating, setCreating] = useState<NewAppt | null>(null);
  const [creatingError, setCreatingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const start = startOfWeek(anchor);
    const startISO = (
      view === 'day'
        ? new Date(anchor.toDateString())
        : addDays(start, -1)
    ).toISOString();
    const endISO = (
      view === 'day' ? addDays(anchor, 1) : addDays(start, 8)
    ).toISOString();

    const [
      { data: app },
      { data: cls },
      { data: svcs },
      { data: secs },
      { data: stf },
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('*')
        .gte('scheduled_at', startISO)
        .lte('scheduled_at', endISO)
        .order('scheduled_at'),
      supabase.from('clients').select('*').order('name'),
      supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('display_order'),
      supabase
        .from('sectors')
        .select('*')
        .eq('active', true)
        .order('display_order'),
      supabase
        .from('staff')
        .select('*')
        .eq('active', true)
        .order('display_order'),
    ]);

    setAppointments((app as Appointment[]) || []);
    setClients((cls as Client[]) || []);
    setServices((svcs as Service[]) || []);
    setSectors((secs as Sector[]) || []);
    setStaff((stf as Staff[]) || []);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(uniqueChannel('agenda'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments' },
        load,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor.getTime(), view]);

  const clientById = useMemo(
    () => new Map(clients.map((c) => [c.id, c])),
    [clients],
  );
  const serviceById = useMemo(
    () => new Map(services.map((s) => [s.id, s])),
    [services],
  );
  const sectorById = useMemo(
    () => new Map(sectors.map((s) => [s.id, s])),
    [sectors],
  );
  const staffById = useMemo(
    () => new Map(staff.map((s) => [s.id, s])),
    [staff],
  );

  const days = useMemo(() => {
    if (view === 'day') return [new Date(anchor.toDateString())];
    return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  }, [anchor, view]);

  const apptsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const a of appointments) {
      const k = new Date(a.scheduled_at).toDateString();
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return map;
  }, [appointments]);

  // Détection de conflits : pour chaque jour, RDV non annulés qui se chevauchent
  const conflicts: ConflictMap = useMemo(() => {
    const map: ConflictMap = new Map();
    for (const items of apptsByDay.values()) {
      const live = items.filter(
        (a) => a.status !== 'cancelled' && a.status !== 'no_show',
      );
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) {
          const a = live[i];
          const b = live[j];
          const aStart = new Date(a.scheduled_at).getTime();
          const aEnd = aStart + a.duration_min * 60_000;
          const bStart = new Date(b.scheduled_at).getTime();
          const bEnd = bStart + b.duration_min * 60_000;
          if (aStart < bEnd && bStart < aEnd) {
            map.set(a.id, (map.get(a.id) ?? 0) + 1);
            map.set(b.id, (map.get(b.id) ?? 0) + 1);
          }
        }
      }
    }
    return map;
  }, [apptsByDay]);

  const today = new Date();
  const monthLabel = anchor.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  const conflictCount = conflicts.size;

  async function setStatus(a: Appointment, status: Appointment['status']) {
    await supabase.from('appointments').update({ status }).eq('id', a.id);
    setSelected(null);
  }
  async function deleteApp(a: Appointment) {
    if (!confirm('Supprimer ce rendez-vous ?')) return;
    await supabase.from('appointments').delete().eq('id', a.id);
    setSelected(null);
  }

  function handleSlotClick(day: Date, hourMinute: number) {
    const slot = new Date(day);
    slot.setHours(0, hourMinute, 0, 0);
    setCreatingError(null);
    setCreating({
      client_id: '',
      service_id: services[0]?.id ?? '',
      staff_id: '',
      scheduled_at: localISO(slot),
      notes: '',
    });
  }

  async function submitNewAppointment() {
    if (!creating) return;
    setCreatingError(null);
    if (
      !creating.client_id ||
      !creating.service_id ||
      !creating.scheduled_at
    ) {
      setCreatingError('Choisis une cliente, un service et une date.');
      return;
    }
    const svc = serviceById.get(creating.service_id);
    if (!svc) {
      setCreatingError('Service introuvable.');
      return;
    }
    const start = new Date(creating.scheduled_at);
    if (Number.isNaN(start.getTime())) {
      setCreatingError('Date invalide.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('appointments').insert({
      client_id: creating.client_id,
      service_id: creating.service_id,
      staff_id: creating.staff_id || null,
      scheduled_at: start.toISOString(),
      duration_min: svc.duration_min,
      price_xof: svc.price_xof,
      status: 'confirmed',
      source: 'admin',
      notes: creating.notes.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setCreatingError(error.message);
      return;
    }
    setCreating(null);
  }

  return (
    <div className="space-y-8 stagger">
      <PageHeader
        eyebrow="Activité"
        title="Agenda"
        description="Vue de la semaine et du jour. Les RDV créés depuis le site web apparaissent automatiquement."
        right={
          <div className="flex flex-wrap items-center gap-2">
            {/* View switcher */}
            <div
              className="inline-flex border"
              style={{ borderColor: 'rgb(var(--line))' }}
            >
              <button
                onClick={() => setView('week')}
                className="px-3 py-1.5 text-[10px] uppercase tracking-[0.24em]"
                style={{
                  background:
                    view === 'week' ? 'rgb(var(--ink))' : 'transparent',
                  color:
                    view === 'week' ? 'rgb(var(--bg))' : 'rgb(var(--ink))',
                }}
              >
                Semaine
              </button>
              <button
                onClick={() => setView('day')}
                className="px-3 py-1.5 text-[10px] uppercase tracking-[0.24em] border-l"
                style={{
                  borderColor: 'rgb(var(--line))',
                  background:
                    view === 'day' ? 'rgb(var(--ink))' : 'transparent',
                  color: view === 'day' ? 'rgb(var(--bg))' : 'rgb(var(--ink))',
                }}
              >
                Jour
              </button>
            </div>

            <span
              className="ml-2 text-[12px] capitalize"
              style={{ color: 'rgb(var(--muted))' }}
            >
              {monthLabel}
            </span>
            <button
              onClick={() =>
                setAnchor(addDays(anchor, view === 'day' ? -1 : -7))
              }
              className="btn-ghost h-9 w-9 p-0"
              aria-label="Précédent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setAnchor(new Date())}
              className="btn-ghost text-[11px]"
            >
              Aujourd&rsquo;hui
            </button>
            <button
              onClick={() =>
                setAnchor(addDays(anchor, view === 'day' ? 1 : 7))
              }
              className="btn-ghost h-9 w-9 p-0"
              aria-label="Suivant"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() =>
                handleSlotClick(new Date(anchor.toDateString()), 10 * 60)
              }
              className="btn-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Nouveau RDV
            </button>
          </div>
        }
      />

      {conflictCount > 0 && (
        <div
          className="border-l-2 px-4 py-3 flex items-center gap-3 text-[13px]"
          style={{
            borderColor: '#a52a2a',
            background: 'rgb(var(--surface-2))',
            color: 'rgb(var(--ink))',
          }}
        >
          <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />
          <span>
            <strong>
              {conflictCount} chevauchement{conflictCount > 1 ? 's' : ''}
            </strong>{' '}
            détecté{conflictCount > 1 ? 's' : ''} cette{' '}
            {view === 'day' ? 'journée' : 'semaine'}. Repère les RDV cerclés en
            rouge ↓
          </span>
        </div>
      )}

      <div className="surface overflow-hidden">
        {/* Day header */}
        <div
          className="grid border-b"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
            borderColor: 'rgb(var(--line))',
          }}
        >
          <div />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            const dayName =
              view === 'day'
                ? d.toLocaleDateString('fr-FR', { weekday: 'long' })
                : DAY_NAMES_SHORT[i];
            return (
              <div
                key={i}
                className="border-l py-3 text-center"
                style={{
                  borderColor: 'rgb(var(--line))',
                  background: isToday ? 'rgb(var(--surface-2))' : 'transparent',
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-[0.24em] capitalize"
                  style={{ color: 'rgb(var(--muted))' }}
                >
                  {dayName}
                </div>
                <div className="font-display text-xl font-medium tabular-nums">
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `48px repeat(${days.length}, minmax(0, 1fr))`,
          }}
        >
          {/* Hours column */}
          <div>
            {Array.from(
              { length: HOURS_END - HOURS_START },
              (_, i) => HOURS_START + i,
            ).map((h) => (
              <div
                key={h}
                className="border-b pr-2 pt-1 text-right text-[10px] uppercase tracking-[0.18em] tabular-nums"
                style={{
                  height: HOUR_HEIGHT,
                  borderColor: 'rgb(var(--line))',
                  color: 'rgb(var(--muted))',
                }}
              >
                {String(h).padStart(2, '0')}h
              </div>
            ))}
          </div>

          {days.map((d, dayIdx) => {
            const items = apptsByDay.get(d.toDateString()) || [];
            const isToday = sameDay(d, today);
            return (
              <div
                key={dayIdx}
                className="relative border-l"
                style={{
                  borderColor: 'rgb(var(--line))',
                  background: isToday ? 'rgba(58,47,36,0.03)' : 'transparent',
                }}
              >
                {Array.from(
                  { length: HOURS_END - HOURS_START },
                  (_, i) => HOURS_START + i,
                ).map((h) => (
                  <div key={h}>
                    <button
                      onClick={() => handleSlotClick(d, h * 60)}
                      className="block w-full transition-colors hover:bg-[rgba(58,47,36,0.04)]"
                      style={{ height: HOUR_HEIGHT / 2 }}
                      aria-label={`Créer un RDV à ${String(h).padStart(2, '0')}:00`}
                    />
                    <button
                      onClick={() => handleSlotClick(d, h * 60 + 30)}
                      className="block w-full border-b transition-colors hover:bg-[rgba(58,47,36,0.04)]"
                      style={{
                        height: HOUR_HEIGHT / 2,
                        borderColor: 'rgb(var(--line))',
                      }}
                      aria-label={`Créer un RDV à ${String(h).padStart(2, '0')}:30`}
                    />
                  </div>
                ))}
                {items.map((a) => {
                  const t = new Date(a.scheduled_at);
                  const minutes =
                    (t.getHours() - HOURS_START) * 60 + t.getMinutes();
                  if (
                    minutes < 0 ||
                    minutes >= (HOURS_END - HOURS_START) * 60
                  )
                    return null;
                  const top = (minutes / 60) * HOUR_HEIGHT;
                  const height = Math.max(
                    24,
                    ((a.duration_min || 60) / 60) * HOUR_HEIGHT - 2,
                  );
                  const svc = serviceById.get(a.service_id);
                  const sec = svc?.sector_id
                    ? sectorById.get(svc.sector_id)
                    : null;
                  const client = clientById.get(a.client_id);
                  const color = STATUS_COLORS[a.status];
                  const dimmed =
                    a.status === 'cancelled' || a.status === 'no_show';
                  const hasConflict = conflicts.has(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(a);
                      }}
                      className={`absolute left-1 right-1 overflow-hidden text-left transition-all hover:z-10 ${
                        dimmed ? 'opacity-50 line-through' : ''
                      }`}
                      style={{
                        top,
                        height,
                        background: 'rgb(var(--surface))',
                        borderLeft: `3px solid ${color}`,
                        boxShadow: hasConflict
                          ? '0 0 0 1.5px #a52a2a inset'
                          : dimmed
                            ? 'none'
                            : '0 1px 2px rgba(10,8,7,0.06)',
                      }}
                    >
                      <div className="px-2 py-1">
                        <div
                          className="flex items-baseline gap-1 font-mono text-[9px] tabular-nums"
                          style={{ color: 'rgb(var(--muted))' }}
                        >
                          {hasConflict && (
                            <AlertTriangle
                              className="h-2.5 w-2.5"
                              strokeWidth={2}
                              style={{ color: '#a52a2a' }}
                            />
                          )}
                          {t.toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <div
                          className="truncate text-[11px] font-medium"
                          style={{ color: 'rgb(var(--ink))' }}
                        >
                          {svc?.name || 'Service'}
                        </div>
                        {height > 50 && client && (
                          <div
                            className="truncate text-[10px]"
                            style={{ color: 'rgb(var(--muted))' }}
                          >
                            {client.name}
                          </div>
                        )}
                        {height > 70 && sec && (
                          <div
                            className="truncate text-[9px] uppercase tracking-[0.18em] mt-0.5"
                            style={{ color: 'rgb(var(--muted))' }}
                          >
                            {sec.name}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {appointments.length === 0 && (
        <div
          className="border border-dashed py-12 text-center text-[13px]"
          style={{
            borderColor: 'rgb(var(--line))',
            color: 'rgb(var(--muted))',
          }}
        >
          <CalendarX2 className="mx-auto mb-3 h-5 w-5" strokeWidth={1.5} />
          Aucun rendez-vous sur cette période. Clique sur un créneau libre pour
          en créer un.
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <AppointmentModal
          appointment={selected}
          client={clientById.get(selected.client_id)}
          service={serviceById.get(selected.service_id)}
          staff={
            selected.staff_id ? staffById.get(selected.staff_id) : undefined
          }
          conflict={conflicts.has(selected.id)}
          onClose={() => setSelected(null)}
          onSetStatus={(s) => setStatus(selected, s)}
          onDelete={() => deleteApp(selected)}
        />
      )}

      {/* Create modal */}
      {creating && (
        <CreateAppointmentModal
          form={creating}
          clients={clients}
          services={services}
          sectors={sectors}
          staff={staff}
          submitting={submitting}
          error={creatingError}
          onChange={setCreating}
          onClose={() => {
            setCreating(null);
            setCreatingError(null);
          }}
          onSubmit={submitNewAppointment}
        />
      )}
    </div>
  );
}

function AppointmentModal({
  appointment,
  client,
  service,
  staff,
  conflict,
  onClose,
  onSetStatus,
  onDelete,
}: {
  appointment: Appointment;
  client?: Client;
  service?: Service;
  staff?: Staff;
  conflict?: boolean;
  onClose: () => void;
  onSetStatus: (s: Appointment['status']) => void;
  onDelete: () => void;
}) {
  const t = new Date(appointment.scheduled_at);
  const phoneClean = client?.phone.replace(/[^\d]/g, '');

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface w-full max-w-md p-6 md:p-8"
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">Rendez-vous</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="opacity-50 hover:opacity-100"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {conflict && (
          <div
            className="mt-3 border-l-2 px-3 py-2 flex items-center gap-2 text-[12px]"
            style={{
              borderColor: '#a52a2a',
              background: 'rgb(var(--surface-2))',
            }}
          >
            <AlertTriangle
              className="h-3.5 w-3.5"
              strokeWidth={1.5}
              style={{ color: '#a52a2a' }}
            />
            Ce RDV chevauche un autre — vérifie l&rsquo;agenda.
          </div>
        )}

        <h2 className="font-display mt-4 text-3xl font-medium tracking-tight">
          {service?.name || 'Service'}
        </h2>
        <div
          className="mt-2 text-[12px] uppercase tracking-[0.18em] capitalize"
          style={{ color: 'rgb(var(--muted))' }}
        >
          {t.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
          })}{' '}
          ·{' '}
          {t.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>

        <div
          className="mt-6 space-y-3 border-t pt-5"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <Row label="Cliente">
            {client ? (
              <span>
                {client.name}{' '}
                <span style={{ color: 'rgb(var(--muted))' }}>
                  · {client.phone}
                </span>
              </span>
            ) : (
              '—'
            )}
          </Row>
          <Row label="Durée">{appointment.duration_min} min</Row>
          {staff && <Row label="Avec">{staff.name}</Row>}
          <Row label="Source">
            {appointment.source === 'public' ? 'Site web' : 'Admin'}
          </Row>
          {appointment.notes && <Row label="Notes">{appointment.notes}</Row>}
        </div>

        <div
          className="mt-6 border-t pt-5"
          style={{ borderColor: 'rgb(var(--line))' }}
        >
          <div
            className="text-[10px] uppercase tracking-[0.24em] mb-3"
            style={{ color: 'rgb(var(--muted))' }}
          >
            Statut · {STATUS_LABELS[appointment.status]}
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                'pending',
                'confirmed',
                'completed',
                'cancelled',
                'no_show',
              ] as const
            ).map((s) => (
              <button
                key={s}
                onClick={() => onSetStatus(s)}
                disabled={appointment.status === s}
                className="px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] border transition-colors disabled:opacity-50"
                style={{
                  borderColor:
                    appointment.status === s
                      ? 'rgb(var(--ink))'
                      : 'rgb(var(--line))',
                  background:
                    appointment.status === s
                      ? 'rgb(var(--ink))'
                      : 'transparent',
                  color:
                    appointment.status === s
                      ? 'rgb(var(--bg))'
                      : 'rgb(var(--ink))',
                }}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {phoneClean && (
            <a
              href={`https://wa.me/${phoneClean}`}
              target="_blank"
              rel="noreferrer"
              className="btn-outline text-[11px]"
            >
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
              WhatsApp
            </a>
          )}
          {appointment.status === 'pending' && (
            <button
              onClick={() => onSetStatus('confirmed')}
              className="btn-primary text-[11px]"
            >
              <Check className="h-3.5 w-3.5" strokeWidth={1.5} />
              Confirmer
            </button>
          )}
          <button
            onClick={onDelete}
            className="btn-ghost text-[11px] ml-auto"
            style={{ color: '#a52a2a' }}
          >
            Supprimer
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAppointmentModal({
  form,
  clients,
  services,
  sectors,
  staff,
  submitting,
  error,
  onChange,
  onClose,
  onSubmit,
}: {
  form: NewAppt;
  clients: Client[];
  services: Service[];
  sectors: Sector[];
  staff: Staff[];
  submitting: boolean;
  error: string | null;
  onChange: (f: NewAppt) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const sectorById = new Map(sectors.map((s) => [s.id, s]));

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="surface w-full max-w-lg p-6 md:p-8"
      >
        <div className="flex items-center justify-between">
          <div className="eyebrow">Nouveau rendez-vous</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="opacity-50 hover:opacity-100"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="mt-5 space-y-4"
        >
          <Field label="Cliente" required>
            <select
              className="input"
              value={form.client_id}
              onChange={(e) => onChange({ ...form, client_id: e.target.value })}
              required
            >
              <option value="">— Choisir une cliente —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </select>
            {clients.length === 0 && (
              <div
                className="mt-2 text-[11px]"
                style={{ color: 'rgb(var(--muted))' }}
              >
                Aucune cliente enregistrée. Va sur{' '}
                <a href="/admin/clients" className="underline-anim">
                  /admin/clients
                </a>{' '}
                pour en créer.
              </div>
            )}
          </Field>

          <Field label="Service" required>
            <select
              className="input"
              value={form.service_id}
              onChange={(e) =>
                onChange({ ...form, service_id: e.target.value })
              }
              required
            >
              {services.map((s) => {
                const sec = s.sector_id ? sectorById.get(s.sector_id) : null;
                return (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {sec ? ` · ${sec.name}` : ''} ·{' '}
                    {new Intl.NumberFormat('fr-FR').format(s.price_xof)} FCFA ·{' '}
                    {s.duration_min} min
                  </option>
                );
              })}
            </select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date & heure" required>
              <input
                className="input"
                type="datetime-local"
                value={form.scheduled_at}
                onChange={(e) =>
                  onChange({ ...form, scheduled_at: e.target.value })
                }
                required
              />
            </Field>
            <Field label="Avec (optionnel)">
              <select
                className="input"
                value={form.staff_id}
                onChange={(e) =>
                  onChange({ ...form, staff_id: e.target.value })
                }
              >
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.role ? ` · ${s.role}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Notes (optionnel)">
            <textarea
              className="input min-h-20"
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              rows={2}
            />
          </Field>

          {error && (
            <div
              className="border-l-2 px-3 py-2 text-[12px]"
              style={{
                borderColor: '#a52a2a',
                background: 'rgb(var(--surface-2))',
              }}
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Enregistrement…' : 'Créer le rendez-vous'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost text-[11px]"
            >
              Annuler
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-3 gap-3 text-[13px]">
      <div
        className="text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
      <div className="col-span-2" style={{ color: 'rgb(var(--ink))' }}>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block mb-2 text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
        {required && ' *'}
      </span>
      {children}
    </label>
  );
}
