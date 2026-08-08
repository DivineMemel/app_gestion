import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';
import {
  hashPassword,
  resolveMember,
  verifyPassword,
  MASTER_ID,
} from '@/lib/auth-server';

// Profil personnel : chacune modifie le sien, personne d'autre.
//
// `team_members` est en écriture réservée au propriétaire dans /api/admin/db —
// une employée ne pouvait donc même pas changer son mot de passe. Plutôt que
// d'ouvrir la table, on expose ce chemin étroit qui n'agit QUE sur la ligne de
// l'appelante.
//
// Ce qui n'est volontairement PAS modifiable ici :
//   · le rôle et le statut — sinon une employée se nommerait propriétaire ;
//   · l'e-mail, identifiant de connexion : le changer soi-même ouvre la porte
//     aux collisions et aux comptes verrouillés dehors.

function refus(reason: string, status: number) {
  return NextResponse.json({ ok: false, reason }, { status });
}

async function membreCourant(req: NextRequest) {
  return resolveMember(
    req.cookies.get('muse_admin')?.value,
    req.cookies.get('muse_session')?.value,
  );
}

export async function GET(req: NextRequest) {
  const membre = await membreCourant(req);
  if (!membre) return refus('Session expirée.', 401);

  if (membre.id === MASTER_ID) {
    return NextResponse.json({ ok: true, master: true, profile: null });
  }

  const { data } = await supabaseAdmin()
    .from('team_members')
    .select('id, name, email, phone, role, status, created_at')
    .eq('id', membre.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, master: false, profile: data ?? null });
}

export async function PATCH(req: NextRequest) {
  const membre = await membreCourant(req);
  if (!membre) return refus('Session expirée.', 401);

  // Le mot de passe maître est un accès de secours défini par variable
  // d'environnement : il ne correspond à aucune ligne en base.
  if (membre.id === MASTER_ID) {
    return refus(
      'Tu es connectée avec le mot de passe de secours, qui n’a pas de profil. Ouvre-toi un vrai compte propriétaire depuis Comptes.',
      400,
    );
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    phone?: string;
    password?: string;
    current_password?: string;
  } | null;
  if (!body) return refus('Requête invalide.', 400);

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const nom = body.name.trim();
    if (nom.length < 2) return refus('Nom trop court.', 400);
    patch.name = nom;
  }
  if (body.phone !== undefined) {
    patch.phone = body.phone.trim() || null;
  }

  // Changer de mot de passe exige de connaître l'actuel : une session laissée
  // ouverte au salon ne doit pas permettre à quelqu'un de verrouiller le
  // compte de sa titulaire.
  if (body.password) {
    if (body.password.length < 6) {
      return refus('Nouveau mot de passe : 6 caractères minimum.', 400);
    }
    if (!body.current_password) {
      return refus('Saisis ton mot de passe actuel pour le changer.', 400);
    }

    const { data: courant } = await supabaseAdmin()
      .from('team_members')
      .select('password_hash')
      .eq('id', membre.id)
      .maybeSingle();

    if (!courant || !verifyPassword(body.current_password, courant.password_hash)) {
      await new Promise((r) => setTimeout(r, 500));
      return refus('Mot de passe actuel incorrect.', 403);
    }
    patch.password_hash = hashPassword(body.password);
  }

  if (Object.keys(patch).length === 0) return refus('Rien à modifier.', 400);

  // Le filtre sur l'id de l'appelante est la garantie qu'on ne touche que soi.
  const { data, error } = await supabaseAdmin()
    .from('team_members')
    .update(patch)
    .eq('id', membre.id)
    .select('id, name, email, phone, role, status')
    .single();

  if (error) return refus(error.message, 500);
  return NextResponse.json({ ok: true, profile: data });
}
