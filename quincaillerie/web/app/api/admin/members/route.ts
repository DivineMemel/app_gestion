import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import { hashPassword, resolveMember } from '@/lib/auth-server';
import { ROLES, type Role } from '@/lib/permissions';
import { logAudit } from '@/lib/audit';

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
  if (!patron.roles.includes('patron')) {
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
    roles?: string[];
  } | null;

  const name = body?.name?.trim() ?? '';
  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';
  // Au moins un rôle, et uniquement des rôles connus. Un compte sans rôle
  // serait actif sans rien pouvoir ouvrir.
  const bruts = Array.isArray(body?.roles) ? body!.roles! : [];
  const roles = [...new Set(bruts)].filter((r): r is Role => ROLES.includes(r as Role));

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
  if (roles.length === 0) {
    return NextResponse.json(
      { ok: false, reason: 'Choisis au moins un rôle.' },
      { status: 400 },
    );
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from('team_members')
    .insert({
      name,
      email,
      phone: body?.phone?.trim() || null,
      password_hash: hashPassword(password),
      roles,
      status: 'active',
    })
    .select('id, name, email, role, roles, status, phone, created_at')
    .single();

  // Ouvrir un compte est la décision la plus lourde de l'application : elle
  // donne accès à tout le reste. Elle ne passe pas par /api/admin/db, donc
  // sans cette ligne elle n'apparaîtrait nulle part dans le journal.
  void logAudit(admin, patron, {
    action: 'insert',
    table: 'team_members',
    values: { name, email, roles, status: 'active' },
    data,
    ok: !error,
    error: error ? error.message : null,
  });

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
