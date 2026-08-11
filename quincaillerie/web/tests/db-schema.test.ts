import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildSelect, validateWrite, TABLE_COLUMNS } from '../lib/db-schema.ts';
import { canReadTable, canSeeCosts, type Role } from '../lib/permissions.ts';

// La passerelle /api/admin/db transmettait la chaîne `select` telle quelle à
// PostgREST, qui y résout les jointures par clé étrangère. Ces tests fixent le
// comportement attendu de la liste blanche qui a remplacé ce passe-plat.

const bati = (table: string, select: string, roles: Role[]) =>
  buildSelect(table, select, roles, canSeeCosts(roles), canReadTable);

describe('buildSelect — jointures', () => {
  test('refuse une jointure vers la table des comptes', () => {
    // Le chemin exact de l'escalade d'origine : n'importe quelle table pointant
    // vers team_members ramenait les empreintes de mot de passe.
    for (const source of ['sales', 'payments', 'stock_movements', 'expenses']) {
      const r = bati(source, '*,team_members(*)', ['vendeur']);
      assert.equal(r.ok, false, `${source} → team_members aurait dû être refusé`);
    }
  });

  test('refuse une jointure non déclarée même entre tables anodines', () => {
    const r = bati('customers', '*,suppliers(name)', ['patron']);
    assert.equal(r.ok, false);
  });

  test('accepte les jointures réellement utilisées par l’application', () => {
    const cas: Array<[string, string]> = [
      ['sales', 'id,number,total_xof,customers(name,phone)'],
      ['supply_entry_items', 'id,qty_base,products(name,base_unit)'],
      ['stock_counts', 'id,number,categories(name)'],
      ['purchase_order_items', 'id,qty_base,products(name,base_unit)'],
    ];
    for (const [table, select] of cas) {
      const r = bati(table, select, ['patron']);
      assert.equal(r.ok, true, `${table} : ${select} aurait dû passer`);
    }
  });

  test('refuse une jointure imbriquée', () => {
    const r = bati('sale_items', 'id,products(name,categories(name))', ['patron']);
    assert.equal(r.ok, false);
  });

  test('refuse la syntaxe PostgREST non utilisée par l’application', () => {
    // Alias, indice de clé étrangère, accès JSON, agrégat : autant de chemins
    // par lesquels une colonne sort sans passer par la validation.
    for (const select of [
      'x:password_hash',
      'products!inner(name)',
      'note->>secret',
      'count()',
      'id,,name',
    ]) {
      const r = bati('sale_items', select, ['patron']);
      assert.equal(r.ok, false, `« ${select} » aurait dû être refusé`);
    }
  });

  test('refuse des parenthèses déséquilibrées', () => {
    assert.equal(bati('sales', 'id,customers(name', ['patron']).ok, false);
  });
});

describe('buildSelect — colonnes protégées', () => {
  test('« * » n’expose jamais l’empreinte de mot de passe', () => {
    const r = bati('team_members', '*', ['patron']);
    assert.equal(r.ok, true);
    assert.ok(r.ok && !r.select.includes('password_hash'));
    // Et la colonne n'est même pas déclarée : elle ne peut pas être demandée.
    assert.ok(!TABLE_COLUMNS.team_members.includes('password_hash'));
    assert.equal(bati('team_members', 'id,password_hash', ['patron']).ok, false);
  });

  test('les coûts sont retirés pour le vendeur, au premier niveau', () => {
    const r = bati('products', '*', ['vendeur']);
    assert.equal(r.ok, true);
    assert.ok(r.ok && !r.select.includes('cost_price_xof'));
  });

  test('les coûts sont retirés jusque dans une table jointe', () => {
    // C'était le second contournement : le nettoyage a posteriori ne portait
    // que sur le premier niveau, la jointure passait donc à travers.
    const r = bati('sale_items', 'id,qty,products(name,cost_price_xof)', ['vendeur']);
    assert.equal(r.ok, true);
    assert.ok(r.ok && !r.select.includes('cost_price_xof'));
    assert.ok(r.ok && r.select.includes('products(name)'));
  });

  test('le patron, lui, voit les coûts', () => {
    const r = bati('products', '*', ['patron']);
    assert.ok(r.ok && r.select.includes('cost_price_xof'));
  });

  test('une jointure vers une table interdite au rôle est refusée', () => {
    // Le vendeur n'a pas accès au dépôt : pas de fournisseurs par ricochet.
    // (La table racine, elle, est contrôlée en amont par la route.)
    assert.equal(bati('supply_entries', 'id,suppliers(name)', ['vendeur']).ok, false);
    assert.equal(bati('payments', 'id,sales(number)', ['magasinier']).ok, false);
    // Le même appel passe pour un rôle qui y a droit.
    assert.equal(bati('supply_entries', 'id,suppliers(name)', ['magasinier']).ok, true);
  });

  test('une colonne inexistante est refusée, pas ignorée', () => {
    const r = bati('products', 'id,nom_qui_nexiste_pas', ['patron']);
    assert.equal(r.ok, false);
  });
});

describe('validateWrite', () => {
  test('un vendeur ne peut pas relever le plafond d’ardoise', () => {
    // Sinon appliquer le plafond ne servirait à rien : il suffirait de le
    // relever juste avant d'encaisser à crédit.
    const r = validateWrite('customers', { name: 'Awa', credit_limit_xof: 5_000_000 }, ['vendeur']);
    assert.equal(r.ok, false);
  });

  test('un gérant le peut', () => {
    assert.equal(
      validateWrite('customers', { credit_limit_xof: 500_000 }, ['gerant']).ok,
      true,
    );
  });

  test('un magasinier ne peut pas écrire un prix d’achat', () => {
    assert.equal(validateWrite('products', { cost_price_xof: 1 }, ['magasinier']).ok, false);
  });

  test('une colonne inconnue est refusée', () => {
    assert.equal(validateWrite('products', { colonne_bidon: 1 }, ['patron']).ok, false);
  });

  test('une colonne calculée par la base est refusée à tout le monde', () => {
    // `stock_qty` est le solde du grand livre et `role` est dérivé de `roles` :
    // les écrire à la main les désynchroniserait de ce qui les produit.
    assert.equal(validateWrite('products', { stock_qty: 999 }, ['patron']).ok, false);
    assert.equal(validateWrite('team_members', { role: 'patron' }, ['patron']).ok, false);
    // Mais `roles`, la vraie source, reste modifiable par le patron.
    assert.equal(
      validateWrite('team_members', { roles: ['vendeur', 'magasinier'] }, ['patron']).ok,
      true,
    );
  });

  test('valide chaque ligne d’un insert multiple', () => {
    const r = validateWrite(
      'customers',
      [{ name: 'A' }, { name: 'B', credit_limit_xof: 1 }],
      ['vendeur'],
    );
    assert.equal(r.ok, false);
  });
});
