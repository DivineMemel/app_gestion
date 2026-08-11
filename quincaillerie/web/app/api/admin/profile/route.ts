import { NextRequest, NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import {
  hashPassword,
  resolveMember,
  verifyPassword,
  MASTER_ID,
} from '@/lib/auth-server';
import { verifierBlocage, enregistrerEchec, effacerEchecs } from '@/lib/throttle';
import { logAudit } from '@/lib/audit';

// Profil personnel : chacun modifie le sien, personne d'autre.
//
// Cette route existe parce que `team_members` est en écriture réservée au
// patron dans /api/admin/db — un vendeur ne pouvait donc même pas changer son
// propre mot de passe. Plutôt que d'ouvrir la table à tous, on expose ce
// chemin étroit qui n'agit QUE sur la ligne de l'appelant.
//
// Ce qui n'est volontairement PAS modifiable ici :
//   · le rôle et le statut — sinon un vendeur se nommerait patron ;
//   · l'e-mail, qui est l'identifiant de connexion : le changer soi-même
//     ouvre la porte aux collisions et aux verrouillages de compte.

function refus(reason: string, status: number) {
  return NextResponse.json({ ok: false, reason }, { status });
}

async function membreCourant(req: NextRequest) {
  return resolveMember(
    req.cookies.get('qc_admin')?.value,
    req.cookies.get('qc_session')?.value,
  );
}

export async function GET(req: NextRequest) {
  const membre = await membreCourant(req);
  if (!membre) return refus('Session expirée.', 401);

  if (membre.id === MASTER_ID) {
    return NextResponse.json({ ok: true, master: true, profile: null });
  }
  if (!isSupabaseConfigured()) return refus('Base non configurée.', 503);

  const { data } = await supabaseAdmin()
    .from('team_members')
    .select('id, name, email, phone, role, roles, status, created_at')
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
      'Tu es connecté avec le mot de passe de secours, qui n’a pas de profil. Ouvre-toi un vrai compte patron depuis Comptes.',
      400,
    );
  }
  if (!isSupabaseConfigured()) return refus('Base non configurée.', 503);

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
  // ouverte sur le comptoir ne doit pas permettre à un passant de verrouiller
  // le compte de son titulaire.
  if (body.password) {
    if (body.password.length < 6) {
      return refus('Nouveau mot de passe : 6 caractères minimum.', 400);
    }
    if (!body.current_password) {
      return refus('Saisis ton mot de passe actuel pour le changer.', 400);
    }

    // Même frein qu'à la connexion. Une session laissée ouverte au comptoir
    // permettait sinon d'essayer le mot de passe actuel en boucle, et donc de
    // verrouiller le compte de son titulaire en le changeant.
    const cle = `profil:${membre.id}`;
    const verdict = await verifierBlocage(null, cle);
    if (verdict.bloque) {
      return NextResponse.json(
        { ok: false, reason: 'throttled', secondes: verdict.secondes },
        { status: 429 },
      );
    }

    const { data: courant } = await supabaseAdmin()
      .from('team_members')
      .select('password_hash')
      .eq('id', membre.id)
      .maybeSingle();

    if (!courant || !verifyPassword(body.current_password, courant.password_hash)) {
      await enregistrerEchec(null, cle);
      return refus('Mot de passe actuel incorrect.', 403);
    }
    await effacerEchecs(null, cle);
    patch.password_hash = hashPassword(body.password);
  }

  if (Object.keys(patch).length === 0) {
    return refus('Rien à modifier.', 400);
  }

  // Le filtre sur l'id de l'appelant est la garantie qu'on ne touche que soi.
  const { data, error } = await supabaseAdmin()
    .from('team_members')
    .update(patch)
    .eq('id', membre.id)
    .select('id, name, email, phone, role, roles, status')
    .single();

  // On journalise le GESTE, pas le secret : `changes` ne dit jamais quel mot de
  // passe a été choisi, seulement qu'il l'a été.
  void logAudit(supabaseAdmin(), membre, {
    action: 'update',
    table: 'team_members',
    filters: [{ op: 'eq', column: 'id', value: membre.id }],
    values: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.password_hash !== undefined ? { password_hash: 'modifié' } : {}),
    },
    data,
    ok: !error,
    error: error ? error.message : null,
  });

  if (error) return refus(error.message, 500);
  return NextResponse.json({ ok: true, profile: data });
}
