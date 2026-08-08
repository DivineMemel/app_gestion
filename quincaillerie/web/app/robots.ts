import type { MetadataRoute } from 'next';
import { abs } from '@/lib/site';

// L'admin et les routes API n'ont rien à faire dans un index public : ce sont
// des pages protégées, les crawler ne produit que des erreurs 307 et gaspille
// le budget d'exploration.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/commander'],
      },
    ],
    sitemap: abs('/sitemap.xml'),
  };
}
