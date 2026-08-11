'use client';
import { useEffect } from 'react';

/**
 * Enregistre le service worker à l'ouverture de l'administration.
 *
 * Il ne l'était jusqu'ici que par la bannière de notifications : une caisse
 * dont personne n'a activé les alertes n'avait donc aucun cache, et se serait
 * retrouvée avec un écran blanc à la première coupure — c'est-à-dire
 * exactement au moment où on compte sur elle.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // En développement, le cache masquerait les modifications de code.
    if (process.env.NODE_ENV !== 'production') return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* pas de service worker : la caisse fonctionne, sans le hors-ligne */
    });
  }, []);

  return null;
}
