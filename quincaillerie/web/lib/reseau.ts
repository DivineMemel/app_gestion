'use client';
import { useEffect, useState } from 'react';

/**
 * « Y a-t-il du réseau ? »
 *
 * `navigator.onLine` ment souvent : il dit vrai dès qu'une interface réseau
 * existe, même quand elle ne porte rien — le cas typique du wifi de boutique
 * dont la box a perdu la ligne. On le complète donc par une vérification
 * réelle : un appel court vers notre propre serveur.
 *
 * Le hook démarre en supposant qu'il y a du réseau. Afficher « hors ligne »
 * pendant la seconde de vérification ferait douter le vendeur à chaque
 * ouverture de la caisse, ce qui est pire que l'inverse : une vente lancée
 * alors que le réseau vient de tomber part de toute façon dans la file.
 */

const INTERVALLE_MS = 20_000;

async function verifier(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('/api/admin/me', {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    clearTimeout(minuteur);
    return res.ok;
  } catch {
    return false;
  }
}

export function useReseau(): boolean {
  const [enLigne, setEnLigne] = useState(true);

  useEffect(() => {
    let vivant = true;

    const sonder = async () => {
      const ok = await verifier();
      if (vivant) setEnLigne(ok);
    };

    const perdu = () => setEnLigne(false);

    window.addEventListener('online', sonder);
    window.addEventListener('offline', perdu);
    const minuteur = setInterval(sonder, INTERVALLE_MS);
    sonder();

    return () => {
      vivant = false;
      window.removeEventListener('online', sonder);
      window.removeEventListener('offline', perdu);
      clearInterval(minuteur);
    };
  }, []);

  return enLigne;
}
