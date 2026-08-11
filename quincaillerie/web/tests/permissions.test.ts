import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES,
  canReadTable,
  canWriteTable,
  canCallRpc,
  canSeeCosts,
  canView,
  RPC_RULES,
  rolePrincipal,
  roleLabels,
  type Role,
} from '../lib/permissions.ts';
import { TABLE_COLUMNS, WRITABLE_TABLES, COST_COLUMNS } from '../lib/db-schema.ts';

// Ces tests décrivent les frontières entre rôles telles qu'elles doivent
// tenir, et surtout ils font échouer la construction quand une table est
// ajoutée d'un côté sans l'être de l'autre — l'oubli classique qui laisse une
// table exposée sans règle, ou une règle sur une table qui n'existe plus.

describe('cohérence entre les règles et le schéma exposé', () => {
  test('toute table modifiable est décrite dans db-schema', () => {
    for (const t of WRITABLE_TABLES) {
      assert.ok(TABLE_COLUMNS[t], `${t} est modifiable mais n’a pas de colonnes déclarées`);
    }
  });

  test('toute table décrite a une règle d’accès pour au moins un rôle', () => {
    for (const t of Object.keys(TABLE_COLUMNS)) {
      const lisible = ROLES.some((r) => canReadTable([r], t));
      assert.ok(lisible, `${t} n’est lisible par personne : règle manquante ?`);
    }
  });

  test('aucune règle ne porte sur une table qui n’est plus exposée', () => {
    for (const t of WRITABLE_TABLES) {
      const inscriptible = ROLES.some((r) => canWriteTable([r], t));
      assert.ok(inscriptible, `${t} est déclarée modifiable mais aucun rôle ne peut y écrire`);
    }
  });

  test('les colonnes de coût déclarées existent réellement', () => {
    for (const [table, cols] of Object.entries(COST_COLUMNS)) {
      for (const c of cols) {
        assert.ok(
          (TABLE_COLUMNS[table] ?? []).includes(c),
          `${table}.${c} est protégée mais n’existe pas`,
        );
      }
    }
  });
});

describe('frontières entre rôles', () => {
  test('seul le patron lit les comptes et le journal d’audit', () => {
    for (const r of ROLES) {
      const attendu = r === 'patron';
      assert.equal(canReadTable([r], 'team_members'), attendu, `team_members / ${r}`);
      assert.equal(canReadTable([r], 'audit_log'), attendu, `audit_log / ${r}`);
    }
  });

  test('le journal d’audit n’est modifiable par personne', () => {
    // Un audit qu’on peut corriger n’est pas un audit.
    for (const r of ROLES) {
      assert.equal(canWriteTable([r], 'audit_log'), false, `audit_log / ${r}`);
    }
  });

  test('les abonnements push ne sont plus exposés à la passerelle', () => {
    // Leur clé étrangère vers team_members en faisait un chemin de traverse.
    assert.equal(TABLE_COLUMNS.push_subscriptions, undefined);
    for (const r of ROLES) {
      assert.equal(canReadTable([r], 'push_subscriptions'), false);
    }
  });

  test('seuls patron et gérant voient les coûts', () => {
    assert.equal(canSeeCosts(['patron']), true);
    assert.equal(canSeeCosts(['gerant']), true);
    assert.equal(canSeeCosts(['vendeur']), false);
    assert.equal(canSeeCosts(['magasinier']), false);
  });

  test('le magasinier n’encaisse pas, le vendeur n’annule pas', () => {
    assert.equal(canCallRpc(['magasinier'], 'create_sale'), false);
    assert.equal(canView(['magasinier'], 'caisse'), false);
    // Annuler contre-passe le stock : c'est une décision de gérant.
    assert.equal(canCallRpc(['vendeur'], 'cancel_sale'), false);
    assert.equal(canCallRpc(['gerant'], 'cancel_sale'), true);
  });

  test('convertir un devis ou une commande, c’est encaisser', () => {
    // Ces deux fonctions délèguent à create_sale : leurs droits doivent suivre.
    for (const fn of ['convert_quote_to_sale', 'convert_order_to_sale']) {
      assert.deepEqual(RPC_RULES[fn], RPC_RULES.create_sale, fn);
    }
  });

  test('valoriser un arrivage suppose de voir les prix d’achat', () => {
    for (const r of ROLES) {
      if (canCallRpc([r], 'value_supply_entry')) {
        assert.ok(canSeeCosts([r]), `${r} peut valoriser sans voir les coûts`);
      }
    }
  });

  test('aucune fonction RPC n’est ouverte à tout le monde par défaut', () => {
    for (const [fn, roles] of Object.entries(RPC_RULES)) {
      assert.ok(roles.length > 0, `${fn} n’est appelable par personne`);
      assert.ok(roles.length < ROLES.length, `${fn} est ouverte à tous les rôles`);
    }
  });

  test('une fonction non déclarée n’est appelable par personne', () => {
    for (const r of ROLES) {
      assert.equal(canCallRpc([r], 'drop_everything'), false);
      assert.equal(canReadTable([r as Role], 'pg_shadow'), false);
    }
  });
});

describe('plusieurs rôles : les droits s’additionnent', () => {
  const CAISSE_ET_DEPOT: Role[] = ['vendeur', 'magasinier'];

  test('vendeur + magasinier tient la caisse ET reçoit les livraisons', () => {
    // Le cas qui motive toute la fonctionnalité : dans une quincaillerie de
    // quartier, c'est souvent la même personne le matin et l'après-midi.
    assert.equal(canView(['vendeur'], 'stock'), false);
    assert.equal(canView(['magasinier'], 'caisse'), false);

    assert.equal(canView(CAISSE_ET_DEPOT, 'caisse'), true);
    assert.equal(canView(CAISSE_ET_DEPOT, 'stock'), true);
    assert.equal(canCallRpc(CAISSE_ET_DEPOT, 'create_sale'), true);
    assert.equal(canCallRpc(CAISSE_ET_DEPOT, 'receive_purchase_order'), true);
  });

  test('mais additionner deux rôles ne crée aucun droit nouveau', () => {
    // C'est la garantie qui rend la fonctionnalité sûre : l'union ne peut
    // donner que ce qu'au moins un des rôles donnait déjà.
    assert.equal(canSeeCosts(CAISSE_ET_DEPOT), false, 'toujours pas les marges');
    assert.equal(canCallRpc(CAISSE_ET_DEPOT, 'cancel_sale'), false);
    assert.equal(canCallRpc(CAISSE_ET_DEPOT, 'value_supply_entry'), false);
    assert.equal(canView(CAISSE_ET_DEPOT, 'comptabilite'), false);
    assert.equal(canView(CAISSE_ET_DEPOT, 'comptes'), false);
    assert.equal(canReadTable(CAISSE_ET_DEPOT, 'team_members'), false);
    assert.equal(canWriteTable(CAISSE_ET_DEPOT, 'expenses'), false);
  });

  test('l’union n’excède jamais la réunion des rôles pris un par un', () => {
    // Vérification exhaustive plutôt que sur quelques exemples : pour toute
    // paire de rôles et toute table, l'union doit valoir « l'un OU l'autre ».
    for (const a of ROLES) {
      for (const b of ROLES) {
        for (const t of Object.keys(TABLE_COLUMNS)) {
          assert.equal(
            canReadTable([a, b], t),
            canReadTable([a], t) || canReadTable([b], t),
            `lecture ${t} pour ${a}+${b}`,
          );
          assert.equal(
            canWriteTable([a, b], t),
            canWriteTable([a], t) || canWriteTable([b], t),
            `écriture ${t} pour ${a}+${b}`,
          );
        }
        for (const fn of Object.keys(RPC_RULES)) {
          assert.equal(
            canCallRpc([a, b], fn),
            canCallRpc([a], fn) || canCallRpc([b], fn),
            `${fn} pour ${a}+${b}`,
          );
        }
      }
    }
  });

  test('ajouter « patron » donne tout, sans exception', () => {
    for (const t of Object.keys(TABLE_COLUMNS)) {
      assert.equal(canReadTable(['magasinier', 'patron'], t), true, t);
    }
    assert.equal(canSeeCosts(['magasinier', 'patron']), true);
  });

  test('un tableau vide ne donne aucun droit', () => {
    // Une contrainte en base l'interdit, mais si une ligne écrite avant la
    // migration 009 arrivait ici, elle ne doit surtout pas tout ouvrir.
    assert.equal(canReadTable([], 'products'), false);
    assert.equal(canSeeCosts([]), false);
    assert.equal(canCallRpc([], 'create_sale'), false);
    assert.equal(canView([], 'dashboard'), false);
  });

  test('le rôle principal sert d’étiquette, pas de droit', () => {
    assert.equal(rolePrincipal(['magasinier', 'patron']), 'patron');
    assert.equal(rolePrincipal(['magasinier', 'vendeur']), 'vendeur');
    assert.equal(rolePrincipal(['magasinier']), 'magasinier');
    assert.equal(roleLabels(['vendeur', 'magasinier']), 'Vendeur · Magasinier');
  });
});
