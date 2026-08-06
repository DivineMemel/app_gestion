import { supabaseAdmin } from '@/lib/supabase-server';
import { seed } from '@/lib/demo-data';
import type { Category, ProductUnit, ShopSettings } from '@/lib/types';

/**
 * Sans projet Supabase, la vitrine sert le catalogue de démonstration.
 * Il s'agit du même jeu de données que l'admin, mais figé : le serveur n'a pas
 * accès au localStorage du navigateur. Une commande passée en démo apparaît
 * quand même dans l'admin — c'est le client qui l'y écrit.
 */
const DEMO = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// Données de la vitrine publique.
//
// La RLS est verrouillée : la clé publique du navigateur ne lit rien. Ces
// helpers tournent donc côté serveur en service_role, et ne sélectionnent que
// ce qui est explicitement publié — jamais les prix d'achat, jamais un article
// gardé en interne.

export type StoreProduct = {
  id: string;
  name: string;
  description: string | null;
  sku: string | null;
  image_url: string | null;
  base_unit: string;
  stock_qty: number;
  category_id: string | null;
  product_units: ProductUnit[];
};

export async function getShop(): Promise<ShopSettings> {
  const fallback = {
    id: 1,
    name: 'NADAL SERVICES',
    tagline: 'Staff · Plomberie · Décoration · Fosse septique',
    phone: null,
    whatsapp: null,
    email: null,
    address: 'Bingerville, nouvelle gare — Abidjan',
    logo_url: null,
    invoice_footer: null,
    allow_negative_stock: false,
    default_min_stock: 5,
    online_orders_open: true,
  } satisfies ShopSettings;

  if (DEMO) return (seed().shop_settings[0] as unknown as ShopSettings) ?? fallback;

  try {
    const { data } = await supabaseAdmin()
      .from('shop_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    return (data as ShopSettings) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function getCategories(): Promise<Category[]> {
  if (DEMO) return seed().categories as unknown as Category[];

  try {
    const { data } = await supabaseAdmin()
      .from('categories')
      .select('*')
      .eq('active', true)
      .order('position');
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
}

export async function getProducts(categoryId?: string): Promise<StoreProduct[]> {
  if (DEMO) {
    const t = seed();
    return (t.products as unknown as StoreProduct[])
      .filter((p) => (p as unknown as { active: boolean; published: boolean }).active)
      .filter((p) => (p as unknown as { published: boolean }).published)
      .filter((p) => !categoryId || p.category_id === categoryId)
      .map((p) => ({
        ...p,
        product_units: (t.product_units as unknown as ProductUnit[]).filter(
          (u) => u.product_id === p.id,
        ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  try {
    let q = supabaseAdmin()
      .from('products')
      .select(
        'id, name, description, sku, image_url, base_unit, stock_qty, category_id, product_units(id, product_id, label, factor, price_xof, is_default, position)',
      )
      .eq('active', true)
      .eq('published', true)
      .order('name');
    if (categoryId) q = q.eq('category_id', categoryId);

    const { data } = await q;
    return (data ?? []) as StoreProduct[];
  } catch {
    return [];
  }
}

/** Prix affiché en vitrine : celui de l'unité par défaut. */
export function prixAffiche(p: StoreProduct): ProductUnit | null {
  const unites = [...(p.product_units ?? [])].sort(
    (a, b) =>
      Number(b.is_default) - Number(a.is_default) ||
      a.position - b.position ||
      Number(a.factor) - Number(b.factor),
  );
  return unites[0] ?? null;
}
