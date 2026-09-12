import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import { hashPassword } from '@/lib/auth-server';
import { empreinteJeton } from '@/lib/reset-password';
import { clientIp, effacerEchecs } from '@/lib/throttle';
import { logAudit } from '@/lib/audit';

// Consommation d'un lien de réinitialisation.
//
// GET  → le lien est-il encore bon ? Permet d'afficher « lien expiré » à
//        l'ouverture de la page, plutôt qu'après avoir fait saisir deux fois
//        un mot de passe pour rien.
// POST → pose le nouveau mot de passe et referme le lien.
//
// Pas de frein anti-force brute ici, contrairement à la connexion : le jeton
// fait 32 octets d'aléa, il n'y a rien à deviner. Ce qui est plafonné, c'est
// l'ÉMISSION des liens, dans la route `forgot`.

type Ligne = {
  token_hash: string;
  member_id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
};

function refus(reason: string, status: number) {
  return NextResponse.json({ ok: false, reason }, { status });
}

/** `invalid` | `used` | `expired` | null si le lien est bon. */
function motifRefus(ligne: Ligne | null): string | null {
  if (!ligne) return 'invalid';
  if (ligne.used_at) return 'used';
  if (Date.parse(ligne.expires_at) < Date.now()) return 'expired';
  return null;
}

async function lireJeton(jeton: string): Promise<Ligne | null> {
  const { data } = await supabaseAdmin()
    .from('password_resets')
    .select('token_hash, member_id, email, expires_at, used_at')
    .eq('token_hash', empreinteJeton(jeton))
    .maybeSingle();
  return (data as Ligne | null) ?? null;
}

export async function GET(req: Request) {
  const jeton = new URL(req.url).searchParams.get('token') ?? '';
  if (!jeton) return refus('invalid', 400);
  if (!isSupabaseConfigured()) return refus('Base non configurée.', 503);

  const ligne = await lireJeton(jeton);
  const motif = motifRefus(ligne);
  if (motif) return refus(motif, 400);

  const { data: membre } = await supabaseAdmin()
    .from('team_members')
    .select('name, email, status')
    .eq('id', ligne!.member_id)
    .maybeSingle();

  if (!membre || membre.status !== 'active') return refus('disabled', 403);

  return NextResponse.json({ ok: true, name: membre.name, email: membre.email });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    token?: string;
    password?: string;
  } | null;
  const jeton = body?.token ?? '';
  const password = body?.password ?? '';

  if (!jeton) return refus('invalid', 400);
  if (password.length < 6) {
    return refus('Mot de passe : 6 caractères minimum.', 400);
  }
  if (!isSupabaseConfigured()) return refus('Base non configurée.', 503);

  const admin = supabaseAdmin();
  const ligne = await lireJeton(jeton);
  const motif = motifRefus(ligne);
  if (motif) return refus(motif, 400);

  const { data: membre } = await admin
    .from('team_members')
    .select('id, name, email, status')
    .eq('id', ligne!.member_id)
    .maybeSingle();

  if (!membre || membre.status !== 'active') return refus('disabled', 403);

  // On referme le lien AVANT d'écrire le mot de passe, et seulement s'il était
  // encore ouvert : `.is('used_at', null)` rend le geste atomique. Deux clics
  // simultanés sur le même lien (mail ouvert deux fois, préchargement d'un
  // client mail) ne peuvent pas le consommer deux fois.
  const { data: ferme } = await admin
    .from('password_resets')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', ligne!.token_hash)
    .is('used_at', null)
    .select('token_hash');

  if (!ferme || ferme.length === 0) return refus('used', 400);

  const { error } = await admin
    .from('team_members')
    .update({ password_hash: hashPassword(password) })
    .eq('id', membre.id);

  if (error) return refus(error.message, 500);

  // Les compteurs d'échecs de la CONNEXION sont remis à zéro : on arrive
  // presque toujours ici après s'être trompé cinq fois, donc en étant bloqué.
  // Sans cette ligne, le nouveau mot de passe serait le bon et la porte
  // resterait fermée une demi-heure — incompréhensible pour l'utilisateur.
  await effacerEchecs(clientIp(req), membre.email);
  await effacerEchecs(null, `reset:${membre.email}`);

  void logAudit(admin, null, {
    action: 'update',
    actor: 'Mot de passe oublié',
    table: 'team_members',
    filters: [{ op: 'eq', column: 'id', value: membre.id }],
    values: { email: membre.email, password_hash: 'réinitialisé par lien e-mail' },
    ok: true,
    error: null,
  });

  return NextResponse.json({ ok: true, email: membre.email });
}
