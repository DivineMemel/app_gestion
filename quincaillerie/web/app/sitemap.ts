import type { MetadataRoute } from 'next';
import { getCategories, getProducts } from '@/lib/storefront';
import { abs } from '@/lib/site';

// Le sitemap est régénéré toutes les heures : un rayon ajouté apparaît sans
// redéploiement.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const maintenant = new Date();
  const [rayons, produits] = await Promise.all([getCategories(), getProducts()]);

  return [
    { url: abs('/'), lastModified: maintenant, changeFrequency: 'weekly', priority: 1 },
    {
      url: abs('/catalogue'),
      lastModified: maintenant,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...rayons.map((r) => ({
      url: abs(`/catalogue?rayon=${r.slug}`),
      lastModified: maintenant,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    // Une page par article : c'est là que se joue le référencement précis
    // (« fosse biodigesteur prix Abidjan »), pas sur la page catalogue.
    ...produits
      .filter((p) => p.slug)
      .map((p) => ({
        url: abs(`/produit/${p.slug}`),
        lastModified: maintenant,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
  ];
}
