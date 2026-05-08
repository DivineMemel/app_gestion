import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

const SLOT_GRANULARITY_MIN = 30;

// Heures par défaut si salon_settings.opening_hours est vide ou invalide.
// Mappées par nom de jour FR (cohérent avec /admin/parametres).
const DEFAULT_HOURS: Record<string, { open: string; close: string } | null> = {
  lundi: { open: '09:00', close: '19:00' },
  mardi: { open: '09:00', close: '19:00' },
  mercredi: { open: '09:00', close: '19:00' },
  jeudi: { open: '09:00', close: '19:00' },
  vendredi: { open: '09:00', close: '19:00' },
  samedi: { open: '09:00', close: '20:00' },
  dimanche: null,
};

const DOW_TO_NAME = [
  'dimanche',
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
] as const;

function parseHHMM(s: string): number | null {
  const [hh, mm] = s.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

/**
 * GET /api/booking/slots?service_id=...&from=YYYY-MM-DD&days=14
 * Renvoie les créneaux dispos sur `days` jours, en lisant les
 * horaires depuis salon_settings.opening_hours (fallback DEFAULT_HOURS),
 * en évitant les RDV non annulés qui chevaucheraient.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get('service_id');
  const days = Math.max(1, Math.min(60, Number(url.searchParams.get('days') || '14')));
  const fromParam = url.searchParams.get('from');

  if (!serviceId) {
    return NextResponse.json({ error: 'missing service_id' }, { status: 400 });
  }

  const db = supabaseAdmin();

  const [{ data: service }, { data: settings }] = await Promise.all([
    db.from('services').select('id, duration_min').eq('id', serviceId).maybeSingle(),
    db.from('salon_settings').select('opening_hours').eq('id', 1).maybeSingle(),
  ]);

  if (!service) return NextResponse.json({ error: 'service_not_found' }, { status: 404 });

  // Construire la table d'horaires utilisable, avec fallback
  const raw = (settings?.opening_hours ?? {}) as Record<
    string,
    { open?: string; close?: string } | null | undefined
  >;
  const hasAny = Object.values(raw).some(
    (v) => v && typeof v === 'object' && v.open && v.close,
  );
  const hoursTable: Record<string, { open: string; close: string } | null> = hasAny
    ? Object.fromEntries(
        Object.keys(DEFAULT_HOURS).map((day) => {
          const v = raw[day];
          return [
            day,
            v && v.open && v.close ? { open: v.open, close: v.close } : null,
          ];
        }),
      )
    : DEFAULT_HOURS;

  const start = fromParam ? new Date(fromParam + 'T00:00:00') : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);

  const { data: appts } = await db
    .from('appointments')
    .select('scheduled_at, duration_min, status')
    .gte('scheduled_at', start.toISOString())
    .lte('scheduled_at', end.toISOString())
    .neq('status', 'cancelled');

  const busy = (appts || []).map((a) => {
    const s = new Date(a.scheduled_at).getTime();
    const e = s + (a.duration_min || 60) * 60_000;
    return [s, e] as const;
  });

  const duration = service.duration_min || 60;
  const out: { date: string; slots: string[] }[] = [];
  const now = Date.now();

  for (let d = 0; d < days; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const dayName = DOW_TO_NAME[day.getDay()];
    const hh = hoursTable[dayName];
    if (!hh) {
      out.push({ date: day.toISOString().slice(0, 10), slots: [] });
      continue;
    }
    const openMin = parseHHMM(hh.open);
    const closeMin = parseHHMM(hh.close);
    if (openMin === null || closeMin === null || closeMin <= openMin) {
      out.push({ date: day.toISOString().slice(0, 10), slots: [] });
      continue;
    }
    const slots: string[] = [];
    for (let m = openMin; m + duration <= closeMin; m += SLOT_GRANULARITY_MIN) {
      const slot = new Date(day);
      slot.setHours(0, m, 0, 0);
      const slotMs = slot.getTime();
      const slotEnd = slotMs + duration * 60_000;
      // pas dans le passé (avec marge 30 min)
      if (slotMs < now + 30 * 60_000) continue;
      // pas de chevauchement
      const overlap = busy.some(([bs, be]) => slotMs < be && slotEnd > bs);
      if (overlap) continue;
      slots.push(slot.toISOString());
    }
    out.push({ date: day.toISOString().slice(0, 10), slots });
  }

  return NextResponse.json({ days: out });
}
