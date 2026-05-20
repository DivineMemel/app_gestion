import { supabaseAdmin } from '@/lib/supabase-server';
import type {
  SalonSettings,
  Sector,
  Service,
  Staff,
  GalleryImage,
} from '@/lib/types';

export type StorefrontData = {
  settings: SalonSettings | null;
  sectors: Sector[];
  services: Service[];
  staff: Staff[];
  gallery: GalleryImage[];
};

/**
 * Lecture serveur (service_role) de tout ce qu'affiche la vitrine publique.
 * La clé anon n'a aucun accès — d'où ce passage par service_role, comme les
 * routes /api/booking/*. Tolérant aux tables manquantes (ex: gallery_images
 * avant l'exécution de la migration 004) : renvoie des listes vides.
 */
export async function getStorefrontData(): Promise<StorefrontData> {
  const db = supabaseAdmin();
  const [settings, sectors, services, staff, gallery] = await Promise.all([
    db.from('salon_settings').select('*').eq('id', 1).maybeSingle(),
    db.from('sectors').select('*').eq('active', true).order('display_order', { ascending: true }),
    db.from('services').select('*').eq('active', true).order('display_order', { ascending: true }),
    db.from('staff').select('*').eq('active', true).order('display_order', { ascending: true }),
    db.from('gallery_images').select('*').eq('active', true).order('display_order', { ascending: true }),
  ]);

  return {
    settings: (settings.data as SalonSettings | null) ?? null,
    sectors: (sectors.data as Sector[] | null) ?? [],
    services: (services.data as Service[] | null) ?? [],
    staff: (staff.data as Staff[] | null) ?? [],
    gallery: (gallery.data as GalleryImage[] | null) ?? [],
  };
}
