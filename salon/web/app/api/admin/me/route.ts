import { NextRequest, NextResponse } from 'next/server';
import { resolveMember } from '@/lib/auth-server';

export async function GET(req: NextRequest) {
  const member = await resolveMember(
    req.cookies.get('muse_admin')?.value,
    req.cookies.get('muse_session')?.value,
  );
  if (!member) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ name: member.name, role: member.role });
}
