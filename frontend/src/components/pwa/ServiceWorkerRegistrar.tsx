'use client';

import { useEffect } from 'react';

/**
 * Enregistre `/sw.js`. Sans service worker enregistré, Chrome n'affiche jamais
 * l'invite d'installation, quel que soit le manifeste.
 *
 * **Production uniquement.** En développement, un worker qui intercepte les
 * requêtes entre en conflit avec le rechargement à chaud de Turbopack : on
 * finit par déboguer une version du code qui n'est plus celle du disque. C'est
 * une perte de temps mémorable, et elle ne se manifeste pas comme un problème
 * de cache.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    // Après le chargement : l'enregistrement met le réseau en concurrence avec
    // le rendu de la page, et la page passe d'abord.
    const register = () => {
      void navigator.serviceWorker.register('/sw.js').catch(() => {
        // Un échec d'enregistrement dégrade l'installabilité, pas l'application.
        // Rien à signaler à l'utilisateur : il n'y peut rien.
      });
    };

    if (document.readyState === 'complete') register();
    else {
      window.addEventListener('load', register);
      return () => window.removeEventListener('load', register);
    }
    return;
  }, []);

  return null;
}
