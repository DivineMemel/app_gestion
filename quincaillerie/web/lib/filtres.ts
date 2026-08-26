'use client';
import { useCallback, useEffect, useState } from 'react';

/**
 * Mémoire des filtres d'un écran, le temps d'une session de travail.
 *
 * POURQUOI
 *
 * Chaque page repartait de ses valeurs par défaut à chaque montage. Un gérant
 * qui regarde les ventes du mois, passe au stock puis revient aux ventes
 * retrouvait « Aujourd'hui » : il devait recliquer à chaque aller-retour, et
 * une bonne partie des « les chiffres ne sont pas les mêmes » vient de là — on
 * compare sans le savoir deux périodes différentes.
 *
 * PORTÉE : `sessionStorage`, volontairement.
 *
 * Le filtre survit à la navigation et au rechargement de l'onglet, pas à la
 * fermeture de l'application. Retrouver « Ce mois » trois jours plus tard, sur
 * un écran qu'on croit voir à jour, serait un piège pire que le reclic.
 *
 * `pret` dit si la lecture du stockage a eu lieu. Les pages attendent ce
 * signal avant de charger : sinon elles lancent une requête sur la valeur par
 * défaut, puis une seconde sur la valeur restaurée — le double appel se voit à
 * l'écran, et à deux postes sur un réseau de quartier il se paie.
 */

const PREFIXE = 'qc_filtres_';

export function useFiltres<T extends Record<string, string>>(
  page: string,
  defauts: T,
): readonly [T, (cle: keyof T, valeur: T[keyof T]) => void, boolean] {
  const [valeurs, setValeurs] = useState<T>(defauts);
  const [pret, setPret] = useState(false);

  // `defauts` est un objet littéral recréé à chaque rendu : le mettre en
  // dépendance relancerait l'effet en boucle. Seule la page compte.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const brut = sessionStorage.getItem(PREFIXE + page);
      if (brut) {
        const lu = JSON.parse(brut) as Record<string, unknown>;
        // On ne restaure que les clés que le code connaît encore, et seulement
        // des chaînes : un filtre retiré depuis, ou une valeur trafiquée dans
        // le stockage, ne doit pas ressortir dans l'état de la page.
        const propres: Partial<T> = {};
        for (const cle of Object.keys(defauts)) {
          const v = lu[cle];
          if (typeof v === 'string') propres[cle as keyof T] = v as T[keyof T];
        }
        setValeurs((actuel) => ({ ...actuel, ...propres }));
      }
    } catch {
      /* stockage indisponible (navigation privée) : les défauts font l'affaire */
    }
    setPret(true);
  }, [page]);

  const definir = useCallback(
    (cle: keyof T, valeur: T[keyof T]) => {
      setValeurs((actuel) => {
        const suivant = { ...actuel, [cle]: valeur };
        try {
          sessionStorage.setItem(PREFIXE + page, JSON.stringify(suivant));
        } catch {
          /* la page reste utilisable, seule la mémoire du filtre est perdue */
        }
        return suivant;
      });
    },
    [page],
  );

  return [valeurs, definir, pret] as const;
}
