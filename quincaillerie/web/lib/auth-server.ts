import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase-server';
import { verifySession } from '@/lib/session';
import type { Role } from '@/lib/permissions';

// ⚠️ Serveur uniquement (node:crypto + service_role). À ne jamais importer
// depuis le middleware edge ni un composant client.

export type Member = { id: string; name: string; role: Role };

/** Identifiant du patron « maître » : ce n'est pas un uuid, donc jamais une FK. */
export const MASTER_ID = 'owner-master';

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
 * Résout le membre courant à partir des cookies.
 * - `qc_admin` == ADMIN_TOKEN → patron « maître » (bootstrap, jamais bloqué,
 *   même sans aucun compte en base).
 * - `qc_session` signé → membre de l'équipe (statut revérifié à chaque appel,
 *   c'est ce qui rend la révocation immédiate).
 */
export async function resolveMember(
  masterCookie?: string,
  sessionCookie?: string,
): Promise<Member | null> {
  const secret = process.env.ADMIN_TOKEN;
  if (secret && masterCookie && masterCookie === secret) {
    return { id: MASTER_ID, name: 'Patron', role: 'patron' };
  }
  if (!secret || !sessionCookie) return null;

  const id = await verifySession(sessionCookie, secret);
  if (!id) return null;

  const { data } = await supabaseAdmin()
    .from('team_members')
    .select('id, name, role, status')
    .eq('id', id)
    .maybeSingle();

  if (!data || data.status !== 'active') return null;
  return { id: data.id, name: data.name, role: data.role as Role };
}

/**
 * `sold_by` / `created_by` référencent team_members(id). Le patron maître n'a
 * pas de ligne en base : on écrit null plutôt que de casser la contrainte.
 */
export function memberFk(member: Member): string | null {
  return member.id === MASTER_ID ? null : member.id;
}
