import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifySession, sessionSecret, MASTER_ID } from '@/lib/session';
import type { Role } from '@/lib/permissions';

// ⚠️ Serveur uniquement (node:crypto + service_role). À ne jamais importer
// depuis le middleware edge ni un composant client.

/**
 * Le membre connecté. `roles` est un tableau : une personne peut tenir la
 * caisse ET le dépôt, ses droits sont l'union des deux.
 */
export type Member = { id: string; name: string; roles: Role[] };

export { MASTER_ID };

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const test = scryptSync(password, salt, expected.length);
  return expected.length === test.length && timingSafeEqual(expected, test);
}

/**
 * Comparaison de deux chaînes en temps constant.
 *
 * Le mot de passe maître était comparé avec `===`, qui s'arrête au premier
 * caractère différent : le temps de réponse renseigne alors sur la longueur du
 * préfixe correct. C'est exploitable, et il n'y a aucune raison de s'en
 * remettre à la chance quand la parade tient en trois lignes.
 */
export function safeEqual(a: string, b: string): boolean {
  // On compare les empreintes, pas les chaînes : `timingSafeEqual` exige des
  // longueurs égales, et traiter le cas « longueurs différentes » à part
  // remplacerait la fuite sur le contenu par une fuite sur la longueur. Deux
  // SHA-256 font toujours 32 octets, quel que soit ce qu'on y a mis.
  const ha = createHash('sha256').update(a, 'utf8').digest();
  const hb = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Lit un membre actif, que la migration 009 soit passée ou non.
 *
 * POURQUOI CE REPLI EXISTE
 *
 * Le code et la base ne se déploient pas au même instant : le code part sur
 * Vercel en deux minutes, les migrations se passent à la main dans le SQL
 * editor. Entre les deux, `team_members.roles` n'existe pas encore — et une
 * colonne absente fait échouer la requête ENTIÈRE côté PostgREST, pas
 * seulement cette colonne.
 *
 * Sans ce repli, déployer avant de migrer déconnecterait tout le monde, patron
 * compris, sans autre issue que le mot de passe de secours. Avec lui, l'ordre
 * des deux opérations n'a plus d'importance.
 *
 * À supprimer une fois la migration 009 passée partout — c'est une béquille de
 * transition, pas une fonctionnalité.
 */
async function lireMembre(id: string): Promise<Member | null> {
  const admin = supabaseAdmin();

  const avecRoles = await admin
    .from('team_members')
    .select('id, name, roles, status')
    .eq('id', id)
    .maybeSingle();

  if (!avecRoles.error) {
    const d = avecRoles.data;
    if (!d || d.status !== 'active') return null;
    const roles = (d.roles as Role[] | null) ?? [];
    return {
      id: d.id,
      name: d.name,
      roles: roles.length > 0 ? roles : ['vendeur'],
    };
  }

  // Base pas encore migrée : on retombe sur la colonne au singulier.
  const avecRole = await admin
    .from('team_members')
    .select('id, name, role, status')
    .eq('id', id)
    .maybeSingle();

  const d = avecRole.data;
  if (!d || d.status !== 'active') return null;
  return { id: d.id, name: d.name, roles: [d.role as Role] };
}

/**
 * Résout le membre courant à partir des cookies.
 *
 * Les deux cookies portent désormais un JETON SIGNÉ, jamais un secret en
 * clair : `qc_admin` contient une session au nom du patron maître, `qc_session`
 * une session de membre. Le statut du membre est relu en base à chaque appel —
 * c'est ce qui rend une révocation immédiate plutôt que différée de 30 jours.
 */
export async function resolveMember(
  masterCookie?: string,
  sessionCookie?: string,
): Promise<Member | null> {
  const secret = sessionSecret();
  if (!secret) return null;

  for (const brut of [masterCookie, sessionCookie]) {
    if (!brut) continue;
    const id = await verifySession(brut, secret);
    if (!id) continue;

    if (id === MASTER_ID) {
      return { id: MASTER_ID, name: 'Patron', roles: ['patron'] };
    }

    const membre = await lireMembre(id);
    if (membre) return membre;
  }

  return null;
}

/**
 * `sold_by` / `created_by` référencent team_members(id). Le patron maître n'a
 * pas de ligne en base : on écrit null plutôt que de casser la contrainte.
 */
export function memberFk(member: Member): string | null {
  return member.id === MASTER_ID ? null : member.id;
}
