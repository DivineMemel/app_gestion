import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import { hashPassword, resolveMember } from '@/lib/auth-server';
import { ROLES, type Role } from '@/lib/permissions';

// Création d'un compte par le patron.
//
// Distincte de /api/admin/register : ici le compte naît `active`, puisque
// c'est le patron lui-même qui l'ouvre. L'auto-inscription, elle, reste en
// `pending` — un employé ne s'autorise pas tout seul.
//
// Le hachage du mot de passe impose le serveur : node:crypto n'existe pas
// côté navigateur, et un mot de passe ne transite jamais en clair vers la base.

export async function POST(req: NextRequest) {
  const patron = await resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
  if (!patron) {
    return NextResponse.json({ ok: false, reason: 'Session expirée.' }, { status: 401 });
  }
  if (patron.role !== 'patron') {
    return NextResponse.json(
      { ok: false, reason: 'Seul le patron peut ouvrir un compte.' },
      { status: 403 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: 'Base de données non configurée sur ce déploiement.' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
    role?: string;
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
  if (!ROLES.includes(role)) {
    return NextResponse.json({ ok: false, reason: 'Rôle invalide.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from('team_members')
    .insert({
      name,
      email,
      phone: body?.phone?.trim() || null,
      password_hash: hashPassword(password),
      role,
      status: 'active',
    })
    .select('id, name, email, role, status, phone, created_at')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json(
        { ok: false, reason: 'Cet e-mail est déjà utilisé.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, member: data });
}
