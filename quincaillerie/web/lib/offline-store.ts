'use client';

/**
 * Stockage local de la caisse : catalogue mis de côté et file des ventes en
 * attente.
 *
 * IndexedDB plutôt que localStorage — le catalogue d'une quincaillerie tient
 * mal dans les 5 Mo de localStorage, et surtout localStorage est synchrone :
 * écrire une vente y gèlerait l'écran au moment précis où le vendeur attend
 * son ticket.
 *
 * Aucune dépendance : l'API brute est verbeuse mais on n'en utilise qu'une
 * fraction, et ajouter une bibliothèque pour ça alourdirait le premier
 * chargement de la caisse — celui qui se fait sur une 3G qui tousse.
 */

const BASE = 'nadal-caisse';
const VERSION = 1;

const MAGASIN_FILE = 'file_ventes';
const MAGASIN_CACHE = 'cache';

export type VenteEnAttente = {
  /** Clé d'idempotence : la même vente rejouée ne sera encaissée qu'une fois. */
  client_ref: string;
  /** Heure du comptoir, pas celle de la synchronisation. */
  sold_at: string;
  payload: Record<string, unknown>;
  /** Ce qu'il faut pour réimprimer le ticket sans le réseau. */
  ticket: Record<string, unknown>;
  essais: number;
  derniere_erreur: string | null;
  /** Refus définitif du serveur : inutile de rejouer, il faut une décision. */
  bloquee: boolean;
  cree_le: string;
};

let db: IDBDatabase | null = null;

function ouvrir(): Promise<IDBDatabase> {
  if (db) return Promise.resolve(db);
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const base = req.result;
      if (!base.objectStoreNames.contains(MAGASIN_FILE)) {
        base.createObjectStore(MAGASIN_FILE, { keyPath: 'client_ref' });
      }
      if (!base.objectStoreNames.contains(MAGASIN_CACHE)) {
        base.createObjectStore(MAGASIN_CACHE);
      }
    };
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB inaccessible'));
  });
}

function transaction<T>(
  magasin: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return ouvrir().then(
    (base) =>
      new Promise<T>((resolve, reject) => {
        const tx = base.transaction(magasin, mode);
        const req = action(tx.objectStore(magasin));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Écriture locale impossible'));
      }),
  );
}

// ---- File des ventes -------------------------------------------------------

export async function enfiler(vente: VenteEnAttente): Promise<void> {
  await transaction(MAGASIN_FILE, 'readwrite', (s) => s.put(vente));
}

export async function fileAttente(): Promise<VenteEnAttente[]> {
  try {
    const tout = await transaction<VenteEnAttente[]>(MAGASIN_FILE, 'readonly', (s) =>
      s.getAll() as IDBRequest<VenteEnAttente[]>,
    );
    // Rejouées dans l'ordre où elles ont été encaissées : c'est l'ordre du
    // tiroir-caisse, et c'est celui qui rend l'historique lisible.
    return tout.sort((a, b) => a.sold_at.localeCompare(b.sold_at));
  } catch {
    return [];
  }
}

export async function retirer(client_ref: string): Promise<void> {
  await transaction(MAGASIN_FILE, 'readwrite', (s) => s.delete(client_ref));
}

export async function marquer(
  client_ref: string,
  maj: Partial<Pick<VenteEnAttente, 'essais' | 'derniere_erreur' | 'bloquee'>>,
): Promise<void> {
  const base = await ouvrir();
  await new Promise<void>((resolve, reject) => {
    const tx = base.transaction(MAGASIN_FILE, 'readwrite');
    const magasin = tx.objectStore(MAGASIN_FILE);
    const lecture = magasin.get(client_ref);
    lecture.onsuccess = () => {
      const courant = lecture.result as VenteEnAttente | undefined;
      if (!courant) {
        resolve();
        return;
      }
      magasin.put({ ...courant, ...maj });
      resolve();
    };
    lecture.onerror = () => reject(lecture.error);
  });
}

// ---- Catalogue mis de côté -------------------------------------------------

/**
 * Clés du catalogue mis de côté. Déclarées ici et non dans la page qui les
 * écrit : c'est ce module qui décide à la déconnexion de ce qui part et de ce
 * qui reste, il ne peut pas le faire sur des clés qu'il ne connaît pas.
 */
export const CLE_CATALOGUE = 'caisse:catalogue';
export const CLE_CLIENTS = 'caisse:clients';
export const CLE_SHOP = 'caisse:shop';

export type Instantane<T> = { donnees: T; le: string };

export async function ranger<T>(cle: string, donnees: T): Promise<void> {
  const paquet: Instantane<T> = { donnees, le: new Date().toISOString() };
  await transaction(MAGASIN_CACHE, 'readwrite', (s) => s.put(paquet, cle));
}

export async function reprendre<T>(cle: string): Promise<Instantane<T> | null> {
  try {
    const v = await transaction<Instantane<T> | undefined>(MAGASIN_CACHE, 'readonly', (s) =>
      s.get(cle) as IDBRequest<Instantane<T> | undefined>,
    );
    return v ?? null;
  } catch {
    return null;
  }
}

/**
 * Déconnexion : on efface la LISTE DES CLIENTS, rien d'autre.
 *
 * Trois catégories, trois traitements — et les confondre coûte cher :
 *
 *  · Les CLIENTS sont des données personnelles : noms, téléphones, plafonds
 *    d'ardoise. Un poste de comptoir change de mains, ils partent.
 *
 *  · Le CATALOGUE et les réglages restent. Les mêmes articles aux mêmes prix
 *    sont publics sur la vitrine : les effacer ne protège rien, et coûte
 *    beaucoup — un vendeur qui ferme sa session le soir retrouverait le
 *    lendemain, réseau coupé, une caisse incapable de vendre. C'est
 *    exactement le cas pour lequel tout ce travail existe.
 *
 *  · La FILE DES VENTES n'est jamais touchée. Elle contient de l'argent
 *    encaissé qui n'est pas encore parti au serveur ; l'effacer parce que
 *    quelqu'un s'est déconnecté ferait disparaître des recettes réelles.
 */
export async function purgerDonneesPersonnelles(): Promise<void> {
  try {
    await transaction(MAGASIN_CACHE, 'readwrite', (s) => s.delete(CLE_CLIENTS));
  } catch {
    /* sans conséquence : la liste se recharge à la prochaine ouverture */
  }
}

/** Remise à zéro complète, file comprise. Réservé au dépannage. */
export async function purgerTout(): Promise<void> {
  const base = await ouvrir();
  await new Promise<void>((resolve) => {
    const tx = base.transaction([MAGASIN_FILE, MAGASIN_CACHE], 'readwrite');
    tx.objectStore(MAGASIN_FILE).clear();
    tx.objectStore(MAGASIN_CACHE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Identifiant de vente généré par le poste.
 *
 * Ce n'est PAS un numéro de ticket : `V-2026-00042` reste attribué par la
 * séquence Postgres. Celui-ci est une clé technique, invisible du client, qui
 * sert uniquement à reconnaître une vente déjà reçue.
 */
export function nouvelleReference(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  // Repli pour les navigateurs anciens ou les contextes non sécurisés.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
