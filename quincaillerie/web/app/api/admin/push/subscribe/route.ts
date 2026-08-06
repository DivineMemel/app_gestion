import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { resolveMember, memberFk } from '@/lib/auth-server';

type Sub = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
  if (!member) return NextResponse.json({ error: 'Session expirée.' }, { status: 401 });

  const sub = (await req.json().catch(() => null)) as Sub | null;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: 'Abonnement invalide.' }, { status: 400 });
  }

  // `endpoint` est unique : réactiver les notifications sur un appareil déjà
  // connu met simplement à jour ses clés au lieu de dupliquer la ligne.
  const { error } = await supabaseAdmin().from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      member_id: memberFk(member),
      label: member.name,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
