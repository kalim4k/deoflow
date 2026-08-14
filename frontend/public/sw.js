/**
 * Service worker Deoflow.
 *
 * Deux raisons d'exister, dans cet ordre :
 *   1. Chrome n'affiche l'invite d'installation que si un service worker est
 *      enregistré et écoute `fetch`. Sans ce fichier, pas d'application
 *      installable — quelle que soit la qualité du manifeste.
 *   2. La cible est sur 4G instable. Une page « hors ligne » vaut mieux que le
 *      dinosaure du navigateur.
 *
 * ═══ CE QU'IL NE FAUT JAMAIS METTRE EN CACHE ═══
 *
 * Deoflow manipule de l'argent réel et des sessions authentifiées.
 *
 *   • `/api/**` — JAMAIS. Un solde de crédits, une liste de retraits ou une
 *     réponse d'authentification servis depuis le cache afficheraient un
 *     montant faux avec l'autorité d'un montant vrai. Pire : le cache d'un
 *     service worker est partagé par ORIGINE, pas par utilisateur. Sur un
 *     téléphone prêté, une réponse mise en cache pour un compte serait servie
 *     au suivant.
 *
 *   • Le HTML des pages connectées — JAMAIS, pour la même raison.
 *
 * On ne met donc en cache que deux choses, toutes deux publiques et immuables :
 * les fichiers de build `/_next/static/**` (leur nom contient une empreinte du
 * contenu, ils ne changent jamais sous un même nom) et les icônes.
 *
 * Changer VERSION purge tous les anciens caches à la prochaine activation.
 */
const VERSION = 'v1';
const STATIC_CACHE = `deoflow-static-${VERSION}`;
const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // `reload` court-circuite le cache HTTP : sans ça, une version périmée de
      // la page hors ligne pourrait être figée pour toute la durée du worker.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
      // Prend la main sans attendre la fermeture des onglets ouverts.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('deoflow-') && k !== STATIC_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Ressources publiques et immuables — les seules qu'on ait le droit de garder. */
function isImmutableAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Une requête non-GET ne se met pas en cache, et surtout ne se rejoue pas.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ressources d'autres domaines : on laisse passer sans y toucher.
  if (url.origin !== self.location.origin) return;

  // Barrière explicite. Elle est redondante avec `isImmutableAsset` ci-dessous,
  // et c'est volontaire : la règle « jamais l'API » doit être lisible sans
  // avoir à dérouler le reste du fichier.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations : le réseau d'abord, toujours. On ne sert du cache que si le
  // réseau a échoué, et uniquement la page hors ligne — jamais une page
  // authentifiée mémorisée.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(STATIC_CACHE);
          const fallback = await cache.match(OFFLINE_URL);
          return (
            fallback ??
            new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } })
          );
        }
      })(),
    );
    return;
  }

  if (!isImmutableAsset(url)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;

      const response = await fetch(request);
      // `response.ok` seul laisserait passer les réponses opaques (status 0),
      // qu'on stockerait sans jamais pouvoir vérifier leur contenu.
      if (response.status === 200 && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })(),
  );
});
