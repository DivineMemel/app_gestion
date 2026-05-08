import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

type Payload = {
  service_id: string;
  scheduled_at: string; // ISO
  client: {
    name: string;
    phone: string;
    email?: string | null;
    acquisition_source?: string | null;
  };
  notes?: string | null;
};

function badRequest(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return badRequest('invalid_json');
  }

  const { service_id, scheduled_at, client } = body;
  if (!service_id || !scheduled_at) return badRequest('missing_fields');
  if (!client?.name?.trim() || !client?.phone?.trim()) return badRequest('missing_client');

  const dt = new Date(scheduled_at);
  if (Number.isNaN(dt.getTime())) return badRequest('bad_date');
  if (dt.getTime() < Date.now() - 5 * 60_000) return badRequest('past_date');

  const db = supabaseAdmin();

  // 1. Récupérer le service pour valider et chopper duration + price + sector
  const { data: service, error: serviceErr } = await db
    .from('services')
    .select('id, name, duration_min, price_xof, sector_id, category_id, active')
    .eq('id', service_id)
    .maybeSingle();

  if (serviceErr || !service) return badRequest('service_not_found', 404);
  if (!service.active) return badRequest('service_inactive');

  const phone = client.phone.replace(/\s+/g, '');
  const name = client.name.trim();
  const email = client.email?.trim() || null;

  // 2. Upsert client par phone
  const { data: existingClient } = await db
    .from('clients')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  let clientId: string;
  let isNewClient = false;
  if (existingClient) {
    clientId = existingClient.id as string;
    await db
      .from('clients')
      .update({ name, ...(email ? { email } : {}) })
      .eq('id', clientId);
  } else {
    const { data: created, error: createErr } = await db
      .from('clients')
      .insert({
        name,
        phone,
        email,
        acquisition_source: client.acquisition_source ?? 'site_web',
      })
      .select('id')
      .single();
    if (createErr || !created) return badRequest('client_insert_failed', 500);
    clientId = created.id;
    isNewClient = true;
  }

  // 3. Insérer l'appointment
  const { data: appointment, error: apptErr } = await db
    .from('appointments')
    .insert({
      client_id: clientId,
      service_id: service.id,
      scheduled_at: dt.toISOString(),
      duration_min: service.duration_min,
      status: 'pending',
      source: 'public',
      notes: body.notes?.trim() || null,
      price_xof: service.price_xof,
    })
    .select('id, scheduled_at')
    .single();

  if (apptErr || !appointment) return badRequest('appointment_insert_failed', 500);

  // 4. Journey event
  if (isNewClient) {
    await db.from('client_events').insert({
      client_id: clientId,
      type: 'created',
      source: client.acquisition_source ?? 'site_web',
      notes: `Inscription via /reserver — ${service.name}`,
    });
  }

  return NextResponse.json({
    ok: true,
    appointment: { id: appointment.id, scheduled_at: appointment.scheduled_at },
  });
}
