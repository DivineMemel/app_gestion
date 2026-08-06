import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE!;

/**
 * Client Supabase server-only en service_role (bypass RLS).
 *
 * À n'utiliser QUE dans des route handlers / server actions. La RLS est
 * verrouillée sur toutes les tables : c'est le seul chemin d'accès aux
 * données, côté admin comme côté vitrine publique.
 */
/**
 * La base est-elle joignable ?
 *
 * À vérifier AVANT d'appeler `supabaseAdmin()` dans toute route publique :
 * sinon l'exception remonte en 500 au corps vide, le client n'arrive pas à
 * parser la réponse et affiche un message générique qui n'aide personne.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && serviceRole);
}

export function supabaseAdmin() {
  if (!serviceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE manquant');
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
