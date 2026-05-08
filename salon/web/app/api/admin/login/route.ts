import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: string } | null;
  const password = body?.password ?? '';

  const expected = process.env.ADMIN_PASSWORD;
  const token = process.env.ADMIN_TOKEN;

  if (!expected || !token) {
    return NextResponse.json(
      { ok: false, reason: 'env_missing' },
      { status: 500 },
    );
  }

  if (password !== expected) {
    // Petit délai pour limiter le brute force naïf
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ok: false, reason: 'bad_password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set('muse_admin', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 jours
  });
  return res;
}
