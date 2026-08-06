import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifyPassword } from '@/lib/auth-server';
import { signSession } from '@/lib/session';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 jours
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';

  const masterPassword = process.env.ADMIN_PASSWORD;
  const token = process.env.ADMIN_TOKEN;
  if (!masterPassword || !token) {
    return NextResponse.json(
      { ok: false, reason: 'ADMIN_PASSWORD ou ADMIN_TOKEN manquant.' },
      { status: 500 },
    );
  }

  // 1) Mot de passe maître → patron (bootstrap, email ignoré).
  if (password === masterPassword) {
    const res = NextResponse.json({ ok: true, role: 'patron' });
    res.cookies.set('qc_admin', token, COOKIE_OPTS);
    return res;
  }

  // 2) Compte membre.
  if (email) {
    const { data } = await supabaseAdmin()
      .from('team_members')
      .select('id, password_hash, role, status')
      .eq('email', email)
      .maybeSingle();

    if (data && verifyPassword(password, data.password_hash)) {
      if (data.status === 'pending') {
        return NextResponse.json({ ok: false, reason: 'pending' }, { status: 403 });
      }
      if (data.status !== 'active') {
        return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 403 });
      }
      const res = NextResponse.json({ ok: true, role: data.role });
      res.cookies.set('qc_session', await signSession(data.id, token), COOKIE_OPTS);
      return res;
    }
  }

  // Délai léger anti-bruteforce.
  await new Promise((r) => setTimeout(r, 500));
  return NextResponse.json({ ok: false, reason: 'bad_credentials' }, { status: 401 });
}
