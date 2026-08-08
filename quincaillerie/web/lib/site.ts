/**
 * Adresse publique du site.
 *
 * Tout ce qui est absolu en SEO — balise canonique, sitemap, images Open
 * Graph — doit pointer vers le domaine final. Le jour où NADAL prend un vrai
 * domaine, une seule variable change : NEXT_PUBLIC_SITE_URL. Rien à réécrire
 * dans le code.
 *
 * VERCEL_PROJECT_PRODUCTION_URL est injectée par Vercel et vaut l'alias de
 * production, pas l'URL du déploiement — c'est bien celle qu'on veut.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3002')
).replace(/\/$/, '');

export const abs = (chemin: string) =>
  `${SITE_URL}${chemin.startsWith('/') ? chemin : `/${chemin}`}`;
