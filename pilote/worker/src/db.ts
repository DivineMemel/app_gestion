import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !serviceRole) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE are required');
}

export const db = createClient(url, serviceRole, {
  auth: { persistSession: false },
});
