import type { MetadataRoute } from 'next';
import { abs } from '@/lib/site';

// L'admin et les routes API n'ont rien à faire dans un index public.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/admin/', '/api/'] }],
    sitemap: abs('/sitemap.xml'),
  };
}
