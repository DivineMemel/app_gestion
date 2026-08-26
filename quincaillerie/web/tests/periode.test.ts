import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bornesDates, bornesInstants, libellePeriode } from '../lib/periode.ts';

/**
 * Les bornes de période décident de ce qui est compté dans le chiffre du jour
 * et dans celui du mois. Une erreur d'un jour ne se voit pas à l'écran : elle
 * se voit dans un total qui ne tombe pas juste, des semaines plus tard.
 */
describe('bornes de période', () => {
  test('« aujourd’hui » tient sur une seule journée', () => {
    const b = bornesDates('jour')!;
    assert.equal(b.debut, b.fin);
  });

  test('« 7 jours » couvre bien sept journées, aujourd’hui comprise', () => {
    const b = bornesDates('semaine')!;
    const jours =
      (Date.parse(b.fin!) - Date.parse(b.debut!)) / 86_400_000 + 1;
    assert.equal(jours, 7);
  });

  test('« ce mois » commence le 1er et finit dans le même mois', () => {
    const b = bornesDates('mois')!;
    assert.match(b.debut!, /-01$/);
    assert.equal(b.debut!.slice(0, 7), b.fin!.slice(0, 7));
  });

  test('« mois dernier » est le mois d’avant, entier', () => {
    const b = bornesDates('mois_dernier')!;
    const courant = bornesDates('mois')!;
    assert.match(b.debut!, /-01$/);
    assert.equal(b.debut!.slice(0, 7), b.fin!.slice(0, 7));
    assert.ok(b.fin! < courant.debut!, 'le mois dernier doit précéder le mois courant');
    // Passage d'année compris : décembre précède janvier.
    const d = new Date(`${courant.debut}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    assert.equal(b.debut!.slice(0, 7), d.toISOString().slice(0, 7));
  });

  test('« tout » ne filtre rien', () => {
    assert.equal(bornesDates('tout'), null);
    assert.equal(bornesInstants('tout'), null);
  });

  test('une plage libre vide ne filtre rien non plus', () => {
    assert.equal(bornesDates('dates', '', ''), null);
  });

  test('une plage saisie à l’envers est remise dans l’ordre', () => {
    const b = bornesDates('dates', '2026-08-24', '2026-08-12')!;
    assert.deepEqual(b, { debut: '2026-08-12', fin: '2026-08-24' });
  });

  test('une seule borne laisse l’autre côté ouvert', () => {
    assert.deepEqual(bornesDates('dates', '2026-08-12', ''), {
      debut: '2026-08-12',
      fin: null,
    });
    assert.deepEqual(bornesDates('dates', '', '2026-08-12'), {
      debut: null,
      fin: '2026-08-12',
    });
  });

  test('la borne de fin couvre la journée entière', () => {
    // Sans cela, tout ce qui est vendu après minuit du dernier jour disparaît.
    const b = bornesInstants('dates', '2026-08-12', '2026-08-24')!;
    assert.equal(b.start, '2026-08-12T00:00:00.000Z');
    assert.equal(b.end, '2026-08-24T23:59:59.999Z');
  });

  test('le libellé dit la période, pas le raccourci', () => {
    assert.equal(libellePeriode('tout'), 'toutes dates');
    assert.equal(
      libellePeriode('dates', '2026-08-12', '2026-08-24'),
      'du 12/08/26 au 24/08/26',
    );
    assert.equal(libellePeriode('dates', '2026-08-12', '2026-08-12'), 'le 12/08/26');
    assert.equal(libellePeriode('dates', '2026-08-12', ''), 'depuis le 12/08/26');
  });
});
