import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import { hashPassword } from '@/lib/auth-server';
import { ROLES, type Role } from '@/lib/permissions';

// Inscription : crée un compte en `pending`. Aucun accès tant que le patron ne
// l'a pas validé depuis la page Comptes — un employé ne s'auto-autorise pas.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    phone?: string;
  } | null;

  const name = body?.name?.trim() ?? '';
  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';
  const role = (body?.role ?? 'vendeur') as Role;

  if (name.length < 2) {
    return NextResponse.json({ ok: false, reason: 'Nom trop court.' }, { status: 400 });
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ ok: false, reason: 'E-mail invalide.' }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { ok: false, reason: 'Mot de passe : 6 caractères minimum.' },
      { status: 400 },
    );
  }
  // Un compte ne peut pas naître patron : ce rôle se donne depuis la page Comptes.
  if (!ROLES.includes(role) || role === 'patron') {
    return NextResponse.json({ ok: false, reason: 'Rôle invalide.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin().from('team_members').insert({
    name,
    email,
    phone: body?.phone?.trim() || null,
    password_hash: hashPassword(password),
    role,
    status: 'pending',
  });

  if (error) {
    // 23505 = violation d'unicité (e-mail déjà pris)
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { ok: false, reason: 'Cet e-mail est déjà utilisé.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
