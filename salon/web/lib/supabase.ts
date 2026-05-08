'use client';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 5 } },
});

/**
 * Génère un nom de canal Realtime unique pour éviter les collisions
 * en cas de double-mount (StrictMode) ou hot-reload.
 */
export function uniqueChannel(base: string) {
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
