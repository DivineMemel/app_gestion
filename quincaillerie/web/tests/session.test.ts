import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession, MASTER_ID } from '../lib/session.ts';

const SECRET = 'un-secret-de-test-suffisamment-long-pour-etre-credible';

describe('jetons de session', () => {
  test('aller-retour', async () => {
    const jeton = await signSession('abc-123', SECRET);
    assert.equal(await verifySession(jeton, SECRET), 'abc-123');
  });

  test('le patron maître passe par le même mécanisme', async () => {
    // C'est le cœur du correctif : le cookie du patron porte une session
    // signée, plus la valeur du secret. Le lire ne donne plus la clé.
    const jeton = await signSession(MASTER_ID, SECRET);
    assert.equal(await verifySession(jeton, SECRET), MASTER_ID);
    assert.ok(!jeton.includes(SECRET));
  });

  test('un autre secret ne valide pas', async () => {
    const jeton = await signSession('abc-123', SECRET);
    assert.equal(await verifySession(jeton, SECRET + 'x'), null);
  });

  test('une signature retouchée est rejetée', async () => {
    const jeton = await signSession('abc-123', SECRET);
    const casse = jeton.slice(0, -1) + (jeton.at(-1) === 'a' ? 'b' : 'a');
    assert.equal(await verifySession(casse, SECRET), null);
  });

  test('changer l’identité invalide la signature', async () => {
    const jeton = await signSession('abc-123', SECRET);
    const [, exp, sig] = jeton.split('.');
    assert.equal(await verifySession(`autre-id.${exp}.${sig}`, SECRET), null);
  });

  test('repousser l’expiration invalide la signature', async () => {
    const jeton = await signSession('abc-123', SECRET);
    const [id, , sig] = jeton.split('.');
    const loin = Date.now() + 10 * 365 * 86_400_000;
    assert.equal(await verifySession(`${id}.${loin}.${sig}`, SECRET), null);
  });

  test('un jeton expiré est rejeté', async () => {
    const jeton = await signSession('abc-123', SECRET, -1);
    assert.equal(await verifySession(jeton, SECRET), null);
  });

  test('les entrées malformées ne lèvent pas', async () => {
    for (const brut of ['', '.', 'abc', 'a.b', '...', 'a.b.c.d']) {
      assert.equal(await verifySession(brut, SECRET), null, `« ${brut} »`);
    }
  });
});
