/**
 * Adresse publique du site.
 *
 * Tout ce qui est absolu en SEO — balise canonique, sitemap, images Open
 * Graph — doit pointer vers le domaine final. Le jour où MUSE prend un vrai
 * domaine, une seule variable change : NEXT_PUBLIC_SITE_URL.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/$/, '');

export const abs = (chemin: string) =>
  `${SITE_URL}${chemin.startsWith('/') ? chemin : `/${chemin}`}`;
