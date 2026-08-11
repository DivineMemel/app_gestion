import { NextResponse } from 'next/server';
import { isSupabaseConfigured, supabaseAdmin } from '@/lib/supabase-server';
import { verifyPassword, safeEqual, MASTER_ID } from '@/lib/auth-server';
import { signSession, sessionSecret } from '@/lib/session';
import { clientIp, verifierBlocage, enregistrerEchec, effacerEchecs } from '@/lib/throttle';

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 30, // 30 jours
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase() ?? '';
  const password = body?.password ?? '';

  const masterPassword = process.env.ADMIN_PASSWORD;
  const secret = sessionSecret();
  if (!masterPassword || !secret) {
    return NextResponse.json(
      { ok: false, reason: 'ADMIN_PASSWORD ou SESSION_SECRET manquant.' },
      { status: 500 },
    );
  }

  // Frein anti-force brute, avant toute vérification : sinon on offre un
  // oracle gratuit à qui veut essayer des mots de passe en boucle.
  const ip = clientIp(req);
  const verdict = await verifierBlocage(ip, email);
  if (verdict.bloque) {
    return NextResponse.json(
      { ok: false, reason: 'throttled', secondes: verdict.secondes },
      { status: 429 },
    );
  }

  // 1) Mot de passe maître → patron (bootstrap, e-mail ignoré).
  //    Le cookie porte une session SIGNÉE au nom du patron maître, plus le
  //    secret lui-même : le lire ne donne plus la clé de signature.
  if (safeEqual(password, masterPassword)) {
    await effacerEchecs(ip, email);
    const res = NextResponse.json({ ok: true, roles: ['patron'] });
    res.cookies.set('qc_admin', await signSession(MASTER_ID, secret), COOKIE_OPTS);
    return res;
  }

  // 2) Compte membre. Sans base, seul le mot de passe maître fonctionne :
  // on le dit, plutôt que de laisser croire à un mauvais mot de passe.
  if (email && !isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: 'Base de données non configurée sur ce déploiement. Utilise le mot de passe patron.' },
      { status: 503 },
    );
  }
  if (email) {
    // `roles` d'abord, `role` en repli : le code peut être déployé avant que
    // la migration 009 soit passée, et une colonne absente ferait échouer la
    // requête entière — donc empêcherait toute connexion.
    const admin = supabaseAdmin();
    let { data } = await admin
      .from('team_members')
      .select('id, password_hash, roles, status')
      .eq('email', email)
      .maybeSingle();

    if (!data) {
      const legacy = await admin
        .from('team_members')
        .select('id, password_hash, role, status')
        .eq('email', email)
        .maybeSingle();
      if (legacy.data) {
        data = { ...legacy.data, roles: [legacy.data.role] };
      }
    }

    if (data && verifyPassword(password, data.password_hash)) {
      // Un compte en attente ou désactivé n'est pas un échec d'authentification :
      // le compter comme tel bloquerait un employé qui a le bon mot de passe et
      // attend simplement sa validation.
      if (data.status === 'pending') {
        return NextResponse.json({ ok: false, reason: 'pending' }, { status: 403 });
      }
      if (data.status !== 'active') {
        return NextResponse.json({ ok: false, reason: 'disabled' }, { status: 403 });
      }
      await effacerEchecs(ip, email);
      const res = NextResponse.json({ ok: true, roles: data.roles });
      res.cookies.set('qc_session', await signSession(data.id, secret), COOKIE_OPTS);
      return res;
    }
  }

  await enregistrerEchec(ip, email);
  return NextResponse.json({ ok: false, reason: 'bad_credentials' }, { status: 401 });
}
