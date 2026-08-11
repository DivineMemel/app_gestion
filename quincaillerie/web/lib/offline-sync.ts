'use client';

import { db } from '@/lib/admin-db';
import { fileAttente, retirer, marquer } from '@/lib/offline-store';
import { ordreDeRejeu, suiteADonner } from '@/lib/offline-rules';

/**
 * Rejeu des ventes encaissées hors ligne.
 *
 * Deux règles gouvernent ce fichier :
 *
 *  1. UNE SEULE VENTE À LA FOIS, dans l'ordre du tiroir-caisse. Les envoyer en
 *     parallèle ferait s'entrelacer les mouvements de stock et rendrait
 *     l'historique illisible le jour où il faut comprendre ce qui s'est passé.
 *
 *  2. ON DISTINGUE LE REFUS DE LA PANNE. Un réseau coupé se réessaie
 *     indéfiniment ; un refus du serveur (« produit introuvable ») ne
 *     s'arrangera jamais tout seul — le rejouer en boucle masquerait le
 *     problème au lieu de le signaler. Ces ventes-là sont mises de côté et
 *     réclament une décision humaine.
 */

export type ResultatSync = {
  envoyees: number;
  bloquees: number;
  restantes: number;
  erreur: string | null;
};

let enCours = false;

export async function synchroniser(): Promise<ResultatSync> {
  if (enCours) return { envoyees: 0, bloquees: 0, restantes: 0, erreur: null };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const file = await fileAttente();
    return {
      envoyees: 0,
      bloquees: file.filter((v) => v.bloquee).length,
      restantes: file.length,
      erreur: null,
    };
  }

  enCours = true;
  let envoyees = 0;
  let erreur: string | null = null;

  try {
    const file = ordreDeRejeu(await fileAttente());

    for (const vente of file) {
      if (vente.bloquee) continue;

      const { error } = await db.rpc('create_sale', { p: vente.payload });

      if (!error) {
        // Succès — y compris quand le serveur répond « déjà enregistrée » :
        // c'est exactement le cas qu'on voulait rendre inoffensif.
        await retirer(vente.client_ref);
        envoyees++;
        continue;
      }

      const essais = vente.essais + 1;

      if (suiteADonner(error.message, essais) === 'bloquer') {
        await marquer(vente.client_ref, {
          essais,
          derniere_erreur: error.message,
          bloquee: true,
        });
        continue;
      }

      // Panne réseau : on s'arrête là et on retentera plus tard. Insister sur
      // les suivantes ne ferait qu'échouer autant de fois, et casserait
      // l'ordre chronologique du rejeu.
      await marquer(vente.client_ref, { essais, derniere_erreur: error.message });
      erreur = error.message;
      break;
    }
  } catch (e) {
    erreur = e instanceof Error ? e.message : 'Synchronisation impossible.';
  } finally {
    enCours = false;
  }

  const reste = await fileAttente();
  return {
    envoyees,
    bloquees: reste.filter((v) => v.bloquee).length,
    restantes: reste.length,
    erreur,
  };
}

/**
 * Déclenche une synchronisation au retour du réseau, au retour dans l'onglet,
 * et à intervalle lent.
 *
 * L'événement `online` seul ne suffit pas : le navigateur l'émet dès qu'une
 * interface réseau existe, pas quand elle porte réellement du trafic. Sur une
 * 3G qui va et vient, c'est la relance périodique qui finit le travail.
 */
export function demarrerSync(surResultat: (r: ResultatSync) => void): () => void {
  let vivant = true;

  const lancer = () => {
    if (!vivant) return;
    void synchroniser().then((r) => {
      if (vivant) surResultat(r);
    });
  };

  const auRetourOnglet = () => {
    if (document.visibilityState === 'visible') lancer();
  };

  window.addEventListener('online', lancer);
  document.addEventListener('visibilitychange', auRetourOnglet);
  const minuteur = setInterval(lancer, 30_000);
  lancer();

  return () => {
    vivant = false;
    window.removeEventListener('online', lancer);
    document.removeEventListener('visibilitychange', auRetourOnglet);
    clearInterval(minuteur);
  };
}
