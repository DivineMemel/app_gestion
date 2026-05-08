'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon, {
  auth: { persistSession: false },
  realtime: { params: { eventsPerSecond: 5 } },
});

/**
 * Génère un nom de canal unique. À utiliser à la place d'un nom statique
 * pour éviter les conflits en React StrictMode (dev) qui mount/cleanup deux fois.
 */
export function uniqueChannel(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
