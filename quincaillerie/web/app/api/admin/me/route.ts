import { NextRequest, NextResponse } from 'next/server';
import { resolveMember } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
  if (!member) return NextResponse.json({ member: null }, { status: 401 });
  return NextResponse.json({ member });
}
