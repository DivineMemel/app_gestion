import { supabaseAdmin } from '@/lib/supabase-server';

/**
 * Frein sur les tentatives de connexion.
 *
 * La route de login se contentait d'un `setTimeout(500)` après un échec. Ça ne
 * freine rien : une attaque lance mille requêtes en parallèle, chacune attend
 * 500 ms dans son coin, et le débit reste intact. Le compteur est donc tenu en
 * base — c'est aussi le seul état partagé fiable quand les fonctions sont
 * réparties sur plusieurs instances.
 *
 * Deux compteurs indépendants :
 *   · par e-mail, contre l'attaque ciblée sur un compte ;
 *   · par adresse IP, contre le balayage d'e-mails depuis une même source.
 */

const SEUIL = 5; // échecs tolérés avant blocage
const PALIER_MS = 60_000; // 1 min, puis 2, 4, 8… plafonné
const BLOCAGE_MAX_MS = 30 * 60_000; // 30 min
const FENETRE_MS = 15 * 60_000; // au-delà, les échecs passés sont oubliés

export type Verdict = { bloque: false } | { bloque: true; secondes: number };

function identifiants(ip: string | null, email: string): string[] {
  const out: string[] = [];
  if (ip) out.push(`ip:${ip}`);
  if (email) out.push(`email:${email}`);
  return out;
}

/** L'adresse d'origine, telle que la voit Vercel derrière son proxy. */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip');
}

/** À appeler AVANT de vérifier le mot de passe. */
export async function verifierBlocage(ip: string | null, email: string): Promise<Verdict> {
  const cles = identifiants(ip, email);
  if (cles.length === 0) return { bloque: false };

  try {
    const { data } = await supabaseAdmin()
      .from('auth_throttle')
      .select('identifier, blocked_until')
      .in('identifier', cles);

    const maintenant = Date.now();
    let plusLoin = 0;
    for (const ligne of data ?? []) {
      const jusqua = ligne.blocked_until ? Date.parse(ligne.blocked_until) : 0;
      if (jusqua > maintenant) plusLoin = Math.max(plusLoin, jusqua);
    }
    if (plusLoin > 0) {
      return { bloque: true, secondes: Math.ceil((plusLoin - maintenant) / 1000) };
    }
  } catch {
    // Compteur indisponible : on laisse passer plutôt que de verrouiller la
    // boutique. Le mot de passe reste exigé — c'est un frein, pas la serrure.
  }
  return { bloque: false };
}

/** À appeler après un échec d'authentification. */
export async function enregistrerEchec(ip: string | null, email: string): Promise<void> {
  const cles = identifiants(ip, email);
  if (cles.length === 0) return;

  try {
    const admin = supabaseAdmin();
    const { data } = await admin
      .from('auth_throttle')
      .select('identifier, failures, last_failure')
      .in('identifier', cles);

    const connus = new Map((data ?? []).map((r) => [r.identifier as string, r]));
    const maintenant = Date.now();

    for (const cle of cles) {
      const precedent = connus.get(cle);
      const perime =
        !precedent || maintenant - Date.parse(precedent.last_failure as string) > FENETRE_MS;
      const echecs = perime ? 1 : (precedent!.failures as number) + 1;

      let blocage: string | null = null;
      if (echecs >= SEUIL) {
        const duree = Math.min(PALIER_MS * 2 ** (echecs - SEUIL), BLOCAGE_MAX_MS);
        blocage = new Date(maintenant + duree).toISOString();
      }

      await admin.from('auth_throttle').upsert(
        {
          identifier: cle,
          failures: echecs,
          blocked_until: blocage,
          last_failure: new Date(maintenant).toISOString(),
        },
        { onConflict: 'identifier' },
      );
    }
  } catch {
    /* idem : le compteur ne doit pas casser la connexion */
  }
}

/** À appeler après une connexion réussie : on repart de zéro. */
export async function effacerEchecs(ip: string | null, email: string): Promise<void> {
  const cles = identifiants(ip, email);
  if (cles.length === 0) return;
  try {
    await supabaseAdmin().from('auth_throttle').delete().in('identifier', cles);
  } catch {
    /* sans conséquence : les compteurs expirent d'eux-mêmes */
  }
}
