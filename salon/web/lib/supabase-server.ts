import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE!;

/**
 * Client Supabase server-only avec service_role (bypass RLS).
 * À utiliser UNIQUEMENT dans des server actions / route handlers
 * (ex: création de RDV depuis le formulaire public).
 */
export function supabaseAdmin() {
  if (!serviceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE manquant');
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
