import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-server';

export async function GET() {
  const db = supabaseAdmin();
  const [{ data: sectors }, { data: services }] = await Promise.all([
    db.from('sectors').select('id, slug, name, description, icon, display_order').eq('active', true).order('display_order'),
    db.from('services').select('id, slug, name, description, price_xof, duration_min, sector_id, category_id, display_order').eq('active', true).order('display_order'),
  ]);
  return NextResponse.json({ sectors: sectors || [], services: services || [] });
}
