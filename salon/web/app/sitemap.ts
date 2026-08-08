import type { MetadataRoute } from 'next';
import { abs } from '@/lib/site';

export const revalidate = 3600;

// La vitrine MUSE tient en deux pages : la landing éditoriale et la
// réservation. Inutile de gonfler le sitemap avec des ancres — Google les
// suit depuis la page.
export default function sitemap(): MetadataRoute.Sitemap {
  const maintenant = new Date();
  return [
    { url: abs('/'), lastModified: maintenant, changeFrequency: 'weekly', priority: 1 },
    {
      url: abs('/reserver'),
      lastModified: maintenant,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
  ];
}
