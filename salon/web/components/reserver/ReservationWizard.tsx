'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  CalendarDays,
  Sparkles,
} from 'lucide-react';
import type { Service, Sector } from '@/lib/types';

type Step = 'service' | 'slot' | 'client' | 'done';

type ServicesPayload = {
  sectors: Sector[];
  services: Service[];
};

type SlotsPayload = {
  days: { date: string; slots: string[] }[];
};

type AcquisitionSource =
  | 'instagram'
  | 'facebook'
  | 'tiktok'
  | 'google'
  | 'walk_in'
  | 'referral'
  | 'whatsapp'
  | 'site_web'
  | 'autre';

const ACQUISITION_OPTIONS: { value: AcquisitionSource; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google' },
  { value: 'referral', label: 'Bouche à oreille' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'walk_in', label: 'En passant' },
  { value: 'autre', label: 'Autre' },
];

function fmt(xof: number) {
  return new Intl.NumberFormat('fr-FR').format(xof);
}

function fmtDate(iso: string) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ReservationWizard() {
  const [step, setStep] = useState<Step>('service');
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [service, setService] = useState<Service | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<AcquisitionSource>('site_web');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ id: string; scheduled_at: string } | null>(
    null,
  );

  // Load catalog
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/booking/services');
        const data: ServicesPayload = await r.json();
        setSectors(data.sectors || []);
        setServices(data.services || []);
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-12">
      <Stepper step={step} />

      {step === 'service' && (
        <ServiceStep
          sectors={sectors}
          services={services}
          loading={loadingCatalog}
          selected={service}
          onSelect={(s) => {
            setService(s);
            setSlot(null);
            setStep('slot');
          }}
        />
      )}

      {step === 'slot' && service && (
        <SlotStep
          service={service}
          selected={slot}
          onBack={() => setStep('service')}
          onSelect={(iso) => {
            setSlot(iso);
            setStep('client');
          }}
        />
      )}

      {step === 'client' && service && slot && (
        <ClientStep
          service={service}
          slot={slot}
          name={name}
          phone={phone}
          email={email}
          source={source}
          notes={notes}
          submitting={submitting}
          error={submitError}
          onChange={{
            setName,
            setPhone,
            setEmail,
            setSource,
            setNotes,
          }}
          onBack={() => setStep('slot')}
          onSubmit={async () => {
            setSubmitting(true);
            setSubmitError(null);
            try {
              const r = await fetch('/api/booking', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  service_id: service.id,
                  scheduled_at: slot,
                  client: {
                    name: name.trim(),
                    phone: phone.trim(),
                    email: email.trim() || null,
                    acquisition_source: source,
                  },
                  notes: notes.trim() || null,
                }),
              });
              const data = await r.json();
              if (!r.ok || !data.ok) {
                setSubmitError(
                  data?.reason === 'past_date'
                    ? 'Ce créneau est passé, choisis-en un autre.'
                    : data?.reason === 'service_inactive'
                      ? 'Cette prestation n’est plus disponible.'
                      : 'La réservation n’a pas pu aboutir. Réessayez ou contactez-nous par WhatsApp.',
                );
                return;
              }
              setConfirmation(data.appointment);
              setStep('done');
            } catch {
              setSubmitError('Connexion impossible — réessayez.');
            } finally {
              setSubmitting(false);
            }
          }}
        />
      )}

      {step === 'done' && confirmation && service && (
        <DoneStep
          appointment={confirmation}
          service={service}
          name={name}
          phone={phone}
          onReset={() => {
            setStep('service');
            setService(null);
            setSlot(null);
            setName('');
            setPhone('');
            setEmail('');
            setNotes('');
            setSource('site_web');
            setConfirmation(null);
          }}
        />
      )}
    </div>
  );
}

/* ─────────── Stepper ─────────── */

const STEP_ORDER: Step[] = ['service', 'slot', 'client', 'done'];
const STEP_LABEL: Record<Step, string> = {
  service: 'Prestation',
  slot: 'Créneau',
  client: 'Coordonnées',
  done: 'Confirmation',
};

function Stepper({ step }: { step: Step }) {
  const idx = STEP_ORDER.indexOf(step);
  return (
    <ol className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em]">
      {STEP_ORDER.map((s, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className="grid h-6 w-6 place-items-center rounded-full border tabular-nums"
              style={{
                borderColor: active || done ? 'rgb(var(--ink))' : 'rgb(var(--line))',
                background: active ? 'rgb(var(--ink))' : 'transparent',
                color: active ? 'rgb(var(--bg))' : 'rgb(var(--ink-soft))',
              }}
            >
              {done ? <Check className="h-3 w-3" strokeWidth={2} /> : i + 1}
            </span>
            <span
              style={{
                color: active ? 'rgb(var(--ink))' : 'rgb(var(--muted))',
              }}
            >
              {STEP_LABEL[s]}
            </span>
            {i < STEP_ORDER.length - 1 && (
              <span
                aria-hidden
                className="mx-2 h-px w-6"
                style={{ background: 'rgb(var(--line))' }}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────── Step 1 — service ─────────── */

function ServiceStep({
  sectors,
  services,
  loading,
  selected,
  onSelect,
}: {
  sectors: Sector[];
  services: Service[];
  loading: boolean;
  selected: Service | null;
  onSelect: (s: Service) => void;
}) {
  const grouped = useMemo(() => {
    const sectorById = new Map(sectors.map((s) => [s.id, s]));
    const byId = new Map<string, Service[]>();
    services.forEach((s) => {
      const k = s.sector_id ?? 'other';
      if (!byId.has(k)) byId.set(k, []);
      byId.get(k)!.push(s);
    });
    return Array.from(byId.entries()).map(([id, list]) => ({
      sector: sectorById.get(id) ?? {
        id: 'other',
        name: 'Autres',
        slug: 'other',
        description: null,
        icon: null,
        cover_image_url: null,
        active: true,
        display_order: 99,
      },
      services: list,
    }));
  }, [sectors, services]);

  if (loading) {
    return (
      <div
        className="py-16 text-center text-[13px]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        Chargement des prestations…
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div
        className="border border-dashed py-12 text-center text-[13px]"
        style={{ borderColor: 'rgb(var(--line))', color: 'rgb(var(--muted))' }}
      >
        Aucune prestation disponible pour le moment.
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {grouped.map((g) => (
        <div key={g.sector.id}>
          <div className="eyebrow mb-4">{g.sector.name}</div>
          <div className="grid gap-px bg-[rgb(var(--line))] sm:grid-cols-2">
            {g.services.map((s) => {
              const isSel = selected?.id === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className="bg-[rgb(var(--bg))] text-left px-5 py-5 transition-colors hover:bg-[rgb(var(--surface-2))]"
                  style={
                    isSel
                      ? { background: 'rgb(var(--surface-2))' }
                      : undefined
                  }
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-display text-[18px] font-medium tracking-tight">
                      {s.name}
                    </span>
                    <span className="font-display tabular-nums text-[16px]">
                      {fmt(s.price_xof)}
                      <span
                        className="ml-1 text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: 'rgb(var(--muted))' }}
                      >
                        FCFA
                      </span>
                    </span>
                  </div>
                  {s.description && (
                    <p
                      className="mt-1.5 text-[13px] leading-relaxed line-clamp-2"
                      style={{ color: 'rgb(var(--ink-soft))' }}
                    >
                      {s.description}
                    </p>
                  )}
                  <div
                    className="mt-3 flex items-center gap-1 text-[11px] uppercase tracking-[0.2em]"
                    style={{ color: 'rgb(var(--muted))' }}
                  >
                    <Clock className="h-3 w-3" strokeWidth={1.5} />
                    {s.duration_min} min
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────── Step 2 — slot ─────────── */

function SlotStep({
  service,
  selected,
  onBack,
  onSelect,
}: {
  service: Service;
  selected: string | null;
  onBack: () => void;
  onSelect: (iso: string) => void;
}) {
  const [days, setDays] = useState<SlotsPayload['days']>([]);
  const [loading, setLoading] = useState(true);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const r = await fetch(
        `/api/booking/slots?service_id=${service.id}&days=14`,
      );
      const data: SlotsPayload = await r.json();
      const ds = data.days || [];
      setDays(ds);
      const firstWithSlots = ds.find((d) => d.slots.length > 0);
      setActiveDate(firstWithSlots?.date ?? ds[0]?.date ?? null);
      setLoading(false);
    })();
  }, [service.id]);

  const dayObj = days.find((d) => d.date === activeDate);

  return (
    <div className="space-y-8">
      <div className="surface px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">Prestation choisie</div>
          <div className="mt-1 font-display text-[18px] font-medium tracking-tight">
            {service.name}
          </div>
        </div>
        <div
          className="text-[11px] uppercase tracking-[0.2em] tabular-nums"
          style={{ color: 'rgb(var(--muted))' }}
        >
          {service.duration_min} min · {fmt(service.price_xof)} FCFA
        </div>
        <button onClick={onBack} className="btn-ghost text-[11px]">
          <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
          Changer
        </button>
      </div>

      <div className="eyebrow">
        <CalendarDays className="h-3.5 w-3.5 inline-block mr-2 align-text-bottom" strokeWidth={1.5} />
        14 prochains jours
      </div>

      {loading ? (
        <div
          className="py-12 text-center text-[13px]"
          style={{ color: 'rgb(var(--muted))' }}
        >
          Chargement des disponibilités…
        </div>
      ) : (
        <>
          {/* Bandeau jours */}
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {days.map((d) => {
              const date = new Date(d.date + 'T00:00:00');
              const closed = d.slots.length === 0;
              const isActive = d.date === activeDate;
              return (
                <button
                  key={d.date}
                  onClick={() => !closed && setActiveDate(d.date)}
                  disabled={closed}
                  className="border min-w-[72px] py-3 text-center transition-colors disabled:opacity-40"
                  style={{
                    borderColor: isActive
                      ? 'rgb(var(--ink))'
                      : 'rgb(var(--line))',
                    background: isActive ? 'rgb(var(--ink))' : 'transparent',
                    color: isActive ? 'rgb(var(--bg))' : 'rgb(var(--ink))',
                  }}
                >
                  <div className="text-[10px] uppercase tracking-[0.2em]">
                    {date.toLocaleDateString('fr-FR', { weekday: 'short' })}
                  </div>
                  <div className="font-display tabular-nums text-2xl font-medium mt-1">
                    {date.getDate()}
                  </div>
                  <div
                    className="text-[9px] uppercase tracking-[0.18em] mt-0.5"
                    style={{
                      color: isActive
                        ? 'rgb(var(--bg))'
                        : closed
                          ? 'rgb(var(--muted))'
                          : 'rgb(var(--muted))',
                    }}
                  >
                    {closed ? 'fermé' : `${d.slots.length} dispo`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Slots du jour actif */}
          {dayObj ? (
            dayObj.slots.length === 0 ? (
              <div
                className="border border-dashed py-12 text-center text-[13px]"
                style={{
                  borderColor: 'rgb(var(--line))',
                  color: 'rgb(var(--muted))',
                }}
              >
                Aucun créneau disponible ce jour-là.
              </div>
            ) : (
              <div>
                <div
                  className="mb-3 text-[12px] capitalize"
                  style={{ color: 'rgb(var(--ink-soft))' }}
                >
                  {fmtDate(dayObj.date)}
                </div>
                <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6">
                  {dayObj.slots.map((iso) => {
                    const isSel = selected === iso;
                    return (
                      <button
                        key={iso}
                        onClick={() => onSelect(iso)}
                        className="border py-2.5 text-[14px] tabular-nums transition-colors hover:border-[rgb(var(--ink))]"
                        style={{
                          borderColor: isSel
                            ? 'rgb(var(--ink))'
                            : 'rgb(var(--line))',
                          background: isSel ? 'rgb(var(--ink))' : 'transparent',
                          color: isSel ? 'rgb(var(--bg))' : 'rgb(var(--ink))',
                        }}
                      >
                        {fmtTime(iso)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}

/* ─────────── Step 3 — coordonnées cliente ─────────── */

function ClientStep({
  service,
  slot,
  name,
  phone,
  email,
  source,
  notes,
  submitting,
  error,
  onChange,
  onBack,
  onSubmit,
}: {
  service: Service;
  slot: string;
  name: string;
  phone: string;
  email: string;
  source: AcquisitionSource;
  notes: string;
  submitting: boolean;
  error: string | null;
  onChange: {
    setName: (v: string) => void;
    setPhone: (v: string) => void;
    setEmail: (v: string) => void;
    setSource: (v: AcquisitionSource) => void;
    setNotes: (v: string) => void;
  };
  onBack: () => void;
  onSubmit: () => void;
}) {
  const slotDate = new Date(slot);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      <div className="surface px-5 py-4">
        <div className="eyebrow mb-2">Récapitulatif</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Recap label="Prestation" value={service.name} />
          <Recap
            label="Tarif"
            value={`${fmt(service.price_xof)} FCFA · ${service.duration_min} min`}
          />
          <Recap
            label="Date"
            value={slotDate.toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
          />
          <Recap label="Heure" value={fmtTime(slot)} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Votre nom" required>
          <input
            className="input"
            value={name}
            onChange={(e) => onChange.setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Prénom Nom"
          />
        </Field>
        <Field label="Téléphone (WhatsApp si possible)" required>
          <input
            className="input"
            value={phone}
            onChange={(e) => onChange.setPhone(e.target.value)}
            required
            type="tel"
            autoComplete="tel"
            placeholder="+225 07 00 00 00 00"
          />
        </Field>
        <Field label="Email (optionnel)">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => onChange.setEmail(e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Comment nous avez-vous connues ?">
          <select
            className="input"
            value={source}
            onChange={(e) => onChange.setSource(e.target.value as AcquisitionSource)}
          >
            {ACQUISITION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Précisions (allergies, longueur, attente…)" full>
          <textarea
            className="input min-h-24"
            value={notes}
            onChange={(e) => onChange.setNotes(e.target.value)}
            rows={3}
            placeholder="Tout ce qui peut nous aider à vous accueillir au mieux."
          />
        </Field>
      </div>

      {error && (
        <div
          className="border-l-2 px-4 py-3 text-[12px]"
          style={{
            borderColor: '#a52a2a',
            background: 'rgb(var(--surface-2))',
            color: 'rgb(var(--ink))',
          }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={submitting || !name.trim() || !phone.trim()}
          className="btn-primary"
        >
          {submitting ? 'Envoi…' : 'Confirmer la réservation'}
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button type="button" onClick={onBack} className="btn-ghost text-[11px]">
          <ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
          Changer le créneau
        </button>
      </div>
    </form>
  );
}

/* ─────────── Step 4 — confirmation ─────────── */

function DoneStep({
  appointment,
  service,
  name,
  phone,
  onReset,
}: {
  appointment: { id: string; scheduled_at: string };
  service: Service;
  name: string;
  phone: string;
  onReset: () => void;
}) {
  const dt = new Date(appointment.scheduled_at);
  const phoneClean = phone.replace(/[^\d+]/g, '');
  const wa = `https://wa.me/22500000000?text=${encodeURIComponent(
    `Bonjour, je viens de réserver "${service.name}" le ${dt.toLocaleDateString(
      'fr-FR',
    )} à ${dt.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })} (réf ${appointment.id.slice(0, 8)})`,
  )}`;

  return (
    <div className="surface px-8 py-12 md:px-12 md:py-16 text-center space-y-6">
      <div
        className="mx-auto grid h-12 w-12 place-items-center rounded-full"
        style={{ background: 'rgb(var(--surface-2))' }}
      >
        <Sparkles className="h-5 w-5" strokeWidth={1.5} />
      </div>
      <div>
        <div className="eyebrow justify-center">Réservation confirmée</div>
        <h2 className="font-display mt-4 text-3xl font-medium tracking-tight md:text-4xl">
          À très bientôt, <span className="italic font-normal">{name.split(' ')[0]}</span>.
        </h2>
        <p
          className="mx-auto mt-4 max-w-md text-[14px] leading-relaxed"
          style={{ color: 'rgb(var(--ink-soft))' }}
        >
          Votre rendez-vous pour <strong>{service.name}</strong> est noté pour le{' '}
          <strong className="capitalize">
            {dt.toLocaleDateString('fr-FR', {
              weekday: 'long',
              day: '2-digit',
              month: 'long',
            })}
          </strong>{' '}
          à <strong>{fmtTime(appointment.scheduled_at)}</strong>. Nous vous
          enverrons une confirmation WhatsApp au {phoneClean}.
        </p>
      </div>

      <div className="hairline mx-auto max-w-xs" />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <a href={wa} target="_blank" rel="noreferrer" className="btn-primary">
          Nous écrire sur WhatsApp
        </a>
        <button onClick={onReset} className="btn-ghost text-[11px]">
          Réserver autre chose
        </button>
      </div>

      <p
        className="text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        Réf · {appointment.id.slice(0, 8)}
      </p>
    </div>
  );
}

/* ─────────── helpers ─────────── */

function Field({
  label,
  required,
  children,
  full,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
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

function Recap({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-[0.24em]"
        style={{ color: 'rgb(var(--muted))' }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[14px] capitalize"
        style={{ color: 'rgb(var(--ink))' }}
      >
        {value}
      </div>
    </div>
  );
}
