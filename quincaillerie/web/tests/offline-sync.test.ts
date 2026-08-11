import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tests du rejeu des ventes hors ligne.
 *
 * On ne teste pas IndexedDB (il n'existe pas sous Node) mais la LOGIQUE de
 * décision, qui est la partie où une erreur coûte de l'argent : rejouer trop
 * peu perd une recette, rejouer une vente refusée en boucle masque un vrai
 * problème, et confondre une panne réseau avec un refus fait les deux à la
 * fois.
 *
 * Les RÈGLES viennent du vrai module (`lib/offline-rules.ts`), pas d'une copie :
 * elles ont été isolées là précisément pour être testables sans navigateur.
 * Seule la boucle de rejeu est rejouée ici, faute d'IndexedDB sous Node.
 */

import { estUnRefus, suiteADonner, ordreDeRejeu, ESSAIS_MAX } from '../lib/offline-rules.ts';

// ---- Doublures ------------------------------------------------------------

type Vente = {
  client_ref: string;
  sold_at: string;
  payload: Record<string, unknown>;
  essais: number;
  derniere_erreur: string | null;
  bloquee: boolean;
};

let file: Vente[] = [];
let reponses: Array<{ error: { message: string } | null }> = [];
let appels: string[] = [];

function vente(ref: string, sold_at: string, extra: Partial<Vente> = {}): Vente {
  return {
    client_ref: ref,
    sold_at,
    payload: { client_ref: ref },
    essais: 0,
    derniere_erreur: null,
    bloquee: false,
    ...extra,
  };
}

// Même boucle que `synchroniser()` dans lib/offline-sync.ts, mais sur une file
// en mémoire : les décisions, elles, viennent du vrai module.
async function synchroniser() {
  let envoyees = 0;
  const aRejouer = ordreDeRejeu(file);

  for (const v of aRejouer) {
    if (v.bloquee) continue;

    appels.push(v.client_ref);
    const { error } = reponses.shift() ?? { error: null };

    if (!error) {
      file = file.filter((x) => x.client_ref !== v.client_ref);
      envoyees++;
      continue;
    }

    v.essais += 1;
    v.derniere_erreur = error.message;

    if (suiteADonner(error.message, v.essais) === 'bloquer') {
      v.bloquee = true;
      continue;
    }
    break;
  }

  return {
    envoyees,
    bloquees: file.filter((v) => v.bloquee).length,
    restantes: file.length,
  };
}

beforeEach(() => {
  file = [];
  reponses = [];
  appels = [];
});

// ---- Tests ----------------------------------------------------------------

describe('rejeu de la file hors ligne', () => {
  test('une vente acceptée quitte la file', async () => {
    file = [vente('a', '2026-08-10T09:00:00Z')];
    reponses = [{ error: null }];

    const r = await synchroniser();
    assert.equal(r.envoyees, 1);
    assert.equal(r.restantes, 0);
  });

  test('les ventes partent dans l’ordre du tiroir-caisse', async () => {
    // Enregistrées dans le désordre, rejouées dans l'ordre chronologique :
    // c'est ce qui rend l'historique lisible après une panne.
    file = [
      vente('midi', '2026-08-10T12:00:00Z'),
      vente('matin', '2026-08-10T08:00:00Z'),
      vente('soir', '2026-08-10T18:00:00Z'),
    ];
    reponses = [{ error: null }, { error: null }, { error: null }];

    await synchroniser();
    assert.deepEqual(appels, ['matin', 'midi', 'soir']);
  });

  test('une panne réseau interrompt le rejeu sans rien bloquer', async () => {
    // Insister sur les suivantes échouerait autant de fois et casserait
    // l'ordre chronologique.
    file = [
      vente('a', '2026-08-10T08:00:00Z'),
      vente('b', '2026-08-10T09:00:00Z'),
      vente('c', '2026-08-10T10:00:00Z'),
    ];
    reponses = [{ error: null }, { error: { message: 'Connexion perdue.' } }];

    const r = await synchroniser();
    assert.equal(r.envoyees, 1);
    assert.equal(r.restantes, 2);
    assert.equal(r.bloquees, 0, 'une coupure ne bloque aucune vente');
    assert.deepEqual(appels, ['a', 'b'], 'on s’arrête à la première coupure');
  });

  test('une vente rejouée après coupure repart au tour suivant', async () => {
    file = [vente('a', '2026-08-10T08:00:00Z')];
    reponses = [{ error: { message: 'Connexion perdue.' } }];
    await synchroniser();
    assert.equal(file.length, 1);
    assert.equal(file[0]!.essais, 1);
    assert.equal(file[0]!.bloquee, false);

    reponses = [{ error: null }];
    const r = await synchroniser();
    assert.equal(r.envoyees, 1);
    assert.equal(r.restantes, 0);
  });

  test('un refus du serveur bloque la vente immédiatement', async () => {
    // « Produit introuvable » ne s'arrangera jamais tout seul : le rejouer en
    // boucle masquerait le problème au lieu de le signaler.
    file = [vente('a', '2026-08-10T08:00:00Z')];
    reponses = [{ error: { message: 'Produit introuvable : 123' } }];

    const r = await synchroniser();
    assert.equal(r.bloquees, 1);
    assert.equal(r.envoyees, 0);
    assert.equal(file[0]!.derniere_erreur, 'Produit introuvable : 123');
  });

  test('une vente bloquée n’est plus rejouée', async () => {
    file = [vente('a', '2026-08-10T08:00:00Z', { bloquee: true })];
    reponses = [{ error: null }];

    const r = await synchroniser();
    assert.deepEqual(appels, [], 'aucun appel pour une vente bloquée');
    assert.equal(r.envoyees, 0);
    assert.equal(r.bloquees, 1);
  });

  test('une vente bloquée ne retient pas les suivantes', async () => {
    // Sinon une seule vente en faute gèlerait toute la recette de la journée.
    file = [
      vente('cassee', '2026-08-10T08:00:00Z', { bloquee: true }),
      vente('bonne', '2026-08-10T09:00:00Z'),
    ];
    reponses = [{ error: null }];

    const r = await synchroniser();
    assert.deepEqual(appels, ['bonne']);
    assert.equal(r.envoyees, 1);
    assert.equal(r.restantes, 1);
  });

  test('une coupure qui s’éternise finit par bloquer la vente', async () => {
    file = [vente('a', '2026-08-10T08:00:00Z', { essais: ESSAIS_MAX - 1 })];
    reponses = [{ error: { message: 'Connexion perdue.' } }];

    const r = await synchroniser();
    assert.equal(r.bloquees, 1, 'au-delà du seuil, on cesse de croire au passager');
  });

  test('une session expirée n’est pas un refus', async () => {
    // Le vendeur se reconnecte et la vente repart. La bloquer obligerait à
    // ressaisir une vente déjà encaissée.
    file = [vente('a', '2026-08-10T08:00:00Z')];
    reponses = [{ error: { message: 'Session expirée, reconnecte-toi.' } }];

    const r = await synchroniser();
    assert.equal(r.bloquees, 0);
    assert.equal(r.restantes, 1);
  });
});

describe('classement des erreurs', () => {
  test('les pannes réseau sont réessayables', () => {
    for (const m of [
      'Connexion perdue.',
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Session expirée, reconnecte-toi.',
    ]) {
      assert.equal(estUnRefus(m), false, m);
    }
  });

  test('les refus métier ne le sont pas', () => {
    for (const m of [
      'Produit introuvable : 123',
      'Vente vide : aucune ligne.',
      'Vente à crédit impossible hors ligne : le plafond d’ardoise ne peut pas être vérifié.',
      'Ton rôle ne permet pas cette opération.',
    ]) {
      assert.equal(estUnRefus(m), true, m);
    }
  });
});
