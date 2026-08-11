/* Service worker — NADAL MULTISERVICES.

   Deux rôles, volontairement séparés dans ce fichier :

     1. les alertes push (nouvelle vente, stock bas) ;
     2. la mise en cache STRICTEMENT limitée à la caisse, pour qu'elle
        s'ouvre quand le réseau est tombé.

   Le parti pris d'origine — « aucune mise en cache, une quincaillerie a besoin
   de stock et de prix justes » — reste juste pour tout le reste de
   l'administration : le stock, la comptabilité et les devis affichés depuis le
   cache d'hier seraient faux sans le dire. La caisse est l'exception, parce
   qu'elle est le seul écran dont l'indisponibilité arrête la boutique. Elle
   affiche d'ailleurs en permanence la date de sa dernière synchronisation.

   Ce qui n'est JAMAIS mis en cache : tout ce qui commence par /api. Servir une
   réponse d'hier à une requête de vente ou de stock serait pire qu'une erreur
   réseau — ce serait une erreur silencieuse.
*/

const VERSION = 'v1';
const CACHE_STATIQUE = `nadal-static-${VERSION}`;
const CACHE_PAGES = `nadal-pages-${VERSION}`;
const CACHE_IMAGES = `nadal-images-${VERSION}`;

/* Plafond du cache d'images. Un catalogue de plusieurs centaines d'articles
   photographiés remplirait sinon le stockage de la tablette sans jamais rien
   libérer. On évince les plus anciennes entrées — approximation grossière,
   mais l'ordre d'insertion d'un Cache suit l'ordre d'usage réel : les articles
   qu'on affiche souvent sont réécrits, donc remis en fin de file. */
const MAX_IMAGES = 400;

// Seules ces pages sont servies depuis le cache en cas de coupure.
const PAGES_HORS_LIGNE = ['/admin/caisse'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge des versions précédentes : sans ça, un déploiement laisse du
      // JavaScript périmé servi indéfiniment depuis le cache.
      const noms = await caches.keys();
      await Promise.all(
        noms
          .filter((n) => n.startsWith('nadal-') && !n.endsWith(VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Déconnexion : on efface les PAGES mises en cache, parce qu'elles contiennent
 * la coquille rendue au nom de l'utilisateur précédent.
 *
 * On garde en revanche le JavaScript et les PHOTOS DU CATALOGUE. Ce ne sont pas
 * des données confidentielles — les mêmes photos et les mêmes prix sont publics
 * sur la vitrine — et les effacer aurait un coût réel : un vendeur qui ferme sa
 * session le soir retrouverait le lendemain matin, si le réseau est tombé, une
 * caisse sans images et sans catalogue. C'est exactement le moment où elle doit
 * marcher.
 */
self.addEventListener('message', (event) => {
  if (event.data === 'purge-session') {
    event.waitUntil(caches.delete(CACHE_PAGES));
  }
  if (event.data === 'purge-tout') {
    event.waitUntil(
      caches.keys().then((noms) =>
        Promise.all(noms.filter((n) => n.startsWith('nadal-')).map((n) => caches.delete(n))),
      ),
    );
  }
});

/** Range une réponse en limitant la taille du cache. */
async function rangerAvecPlafond(nomCache, requete, reponse, plafond) {
  const cache = await caches.open(nomCache);
  await cache.put(requete, reponse);
  const cles = await cache.keys();
  if (cles.length > plafond) {
    await Promise.all(cles.slice(0, cles.length - plafond).map((c) => cache.delete(c)));
  }
}

function estPageHorsLigne(url) {
  return PAGES_HORS_LIGNE.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // On ne touche qu'aux lectures de notre propre origine.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Jamais d'API en cache. Une réponse périmée sur un stock ou une vente ne
  // ressemble pas à une panne : elle ressemble à la vérité.
  if (url.pathname.startsWith('/api/')) return;

  // Ressources versionnées par Next : le nom contient déjà l'empreinte du
  // contenu, donc le cache ne peut pas être périmé. Cache d'abord.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copie = res.clone();
              caches.open(CACHE_STATIQUE).then((c) => c.put(req, copie));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // PHOTOS DU CATALOGUE.
  //
  // Elles vivent dans Supabase Storage, donc sur une autre origine — mais
  // `next/image` les fait transiter par /_next/image, qui est chez nous. Sans
  // cette branche, elles n'étaient mises en cache nulle part : la caisse
  // s'ouvrait hors ligne avec des cadres vides, alors qu'au comptoir la photo
  // est souvent ce qui permet de reconnaître un article plus vite que son nom.
  //
  // Cache d'abord, sans crainte de périmer : un remplacement d'image donne un
  // nouveau nom de fichier (chaque envoi tire un identifiant aléatoire), donc
  // une nouvelle URL. Une image en cache ne peut pas devenir la mauvaise.
  if (url.pathname === '/_next/image') {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req)
            .then((res) => {
              if (res.ok) {
                const copie = res.clone();
                rangerAvecPlafond(CACHE_IMAGES, req, copie, MAX_IMAGES);
              }
              return res;
            })
            // Pas de photo, pas de drame : la fiche article reste vendable.
            .catch(() => new Response('', { status: 504 })),
      ),
    );
    return;
  }

  // Icônes et manifeste : même logique, sans quoi la caisse s'ouvre nue.
  if (/\.(png|svg|ico|webmanifest|json)$/.test(url.pathname) && !url.pathname.startsWith('/admin')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).catch(() => hit)),
    );
    return;
  }

  // Page de caisse : réseau d'abord, cache en secours. Jamais l'inverse — un
  // vendeur doit voir les prix du jour dès que la connexion le permet.
  if (req.mode === 'navigate' && estPageHorsLigne(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copie = res.clone();
            caches.open(CACHE_PAGES).then((c) => c.put(req, copie));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req, { ignoreSearch: true });
          if (hit) return hit;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Hors ligne</title>' +
              '<body style="font-family:system-ui;padding:2rem;line-height:1.5">' +
              '<h1>Caisse indisponible</h1>' +
              '<p>Cet appareil n’a pas encore ouvert la caisse avec du réseau, ' +
              'elle ne peut donc pas être servie hors ligne.</p>' +
              '<p>Reconnecte-toi au réseau, ouvre la caisse une fois, ' +
              'et elle restera disponible ensuite.</p>',
            { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 },
          );
        }),
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'NADAL MULTISERVICES', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'NADAL MULTISERVICES';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: { url: payload.url || '/admin' },
      badge: '/icon-192.png',
      icon: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Réutilise un onglet déjà ouvert sur l'app plutôt que d'en empiler un
      // nouveau à chaque notification.
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
