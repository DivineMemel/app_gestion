import { NextResponse } from 'next/server';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of ['qc_admin', 'qc_session']) {
    res.cookies.set(name, '', { path: '/', maxAge: 0 });
  }
  return res;
}
