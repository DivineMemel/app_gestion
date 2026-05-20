import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { hashPassword } from '@/lib/auth-server';
import { ROLES, type Role } from '@/lib/permissions';

// Inscription publique : crée un compte en `pending`. Aucun accès tant que le
// propriétaire ne l'a pas validé (page Comptes).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  } | null;

  const name = body?.name?.trim() ?? '';
  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';
  const role = (body?.role ?? 'employee') as Role;

  if (name.length < 2 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) {
    return NextResponse.json({ ok: false, reason: 'invalid_input' }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ ok: false, reason: 'invalid_role' }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { error } = await admin.from('team_members').insert({
    name,
    email,
    password_hash: hashPassword(password),
    role,
    status: 'pending',
  });

  if (error) {
    // 23505 = violation d'unicité (email déjà pris)
    const code = (error as { code?: string }).code;
    if (code === '23505') {
      return NextResponse.json({ ok: false, reason: 'email_taken' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
