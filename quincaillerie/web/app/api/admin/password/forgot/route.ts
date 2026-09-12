import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import { envoyerMail, mailerConfigure, mailerManque } from '@/lib/mailer';
import { creerJeton, mailReinitialisation, TTL_MINUTES } from '@/lib/reset-password';
import { clientIp, verifierBlocage, enregistrerEchec } from '@/lib/throttle';
import { logAudit } from '@/lib/audit';
import { abs } from '@/lib/site';

// « Mot de passe oublié » — demande d'un lien de réinitialisation.
//
// CE QU'ON DIT ET CE QU'ON NE DIT PAS
//
// L'usage, sur un site grand public, est de répondre « si ce compte existe, un
// mail est parti » quoi qu'il arrive : ça évite de confirmer qu'une adresse
// est cliente. Ici l'annuaire des comptes, c'est l'équipe de la boutique —
// quatre ou cinq personnes que tout le monde connaît. Cacher qu'une adresse
// existe ne protège rien et coûte cher au comptoir : l'employé qui s'est
// trompé d'adresse attendrait un mail qui ne viendra jamais. On répond donc
// franchement, et c'est le frein ci-dessous qui empêche d'en faire un annuaire.
//
// LE FREIN — compteurs séparés de ceux de la connexion (préfixe `reset:`),
// sinon cinq demandes de lien verrouilleraient la connexion elle-même. Et on
// compte CHAQUE demande, réussie comprise : c'est le nombre de mails envoyés
// qu'on plafonne, pas le nombre d'erreurs.

function refus(reason: string, status: number) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return refus('E-mail invalide.', 400);
  }
  if (!isSupabaseConfigured()) {
    return refus(
      'Base de données non configurée sur ce déploiement : la réinitialisation par mail n’est pas disponible.',
      503,
    );
  }
  if (!mailerConfigure()) {
    return refus(
      `Envoi d’e-mail non configuré : ${mailerManque()} Demande au patron de te poser un mot de passe provisoire depuis Comptes.`,
      503,
    );
  }

  const ip = clientIp(req);
  const cles = [`reset:${email}`, ...(ip ? [`reset-ip:${ip}`] : [])];
  for (const cle of cles) {
    const verdict = await verifierBlocage(null, cle);
    if (verdict.bloque) {
      return NextResponse.json(
        { ok: false, reason: 'throttled', secondes: verdict.secondes },
        { status: 429 },
      );
    }
  }
  for (const cle of cles) await enregistrerEchec(null, cle);

  const admin = supabaseAdmin();
  const { data: membre } = await admin
    .from('team_members')
    .select('id, name, email, status')
    .eq('email', email)
    .maybeSingle();

  if (!membre) return refus('unknown_email', 404);
  if (membre.status === 'pending') return refus('pending', 403);
  if (membre.status !== 'active') return refus('disabled', 403);

  // Une nouvelle demande périme les précédentes : deux liens vivants pour le
  // même compte, c'est une surface d'attaque pour rien.
  await admin
    .from('password_resets')
    .update({ used_at: new Date().toISOString() })
    .eq('member_id', membre.id)
    .is('used_at', null);

  const { jeton, empreinte } = creerJeton();
  const expire = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();

  const { error: erreurInsert } = await admin.from('password_resets').insert({
    token_hash: empreinte,
    member_id: membre.id,
    email,
    expires_at: expire,
    requested_ip: ip,
  });
  if (erreurInsert) return refus(erreurInsert.message, 500);

  const lien = abs(`/admin/mot-de-passe?token=${jeton}`);
  const contenu = mailReinitialisation(membre.name, lien);
  const envoi = await envoyerMail({ to: membre.email, ...contenu });

  // Un mail qui n'est pas parti laisserait un jeton vivant dans la nature sans
  // que personne puisse s'en servir : on le referme tout de suite.
  if (!envoi.ok) {
    await admin
      .from('password_resets')
      .update({ used_at: new Date().toISOString() })
      .eq('token_hash', empreinte);
    console.error('[reset] envoi impossible', envoi.reason);
    return refus(
      'Le mail n’a pas pu partir. Réessaie, ou demande au patron un mot de passe provisoire.',
      502,
    );
  }

  // On journalise la DEMANDE, jamais le jeton : le journal est consultable
  // depuis /admin/journal, il ne doit pas contenir de quoi prendre un compte.
  void logAudit(admin, null, {
    action: 'update',
    actor: 'Mot de passe oublié',
    table: 'password_resets',
    values: { email, demande: 'lien envoyé', expire_dans_min: TTL_MINUTES },
    ok: true,
    error: null,
  });

  return NextResponse.json({ ok: true, email: membre.email });
}
