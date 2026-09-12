import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerJeton,
  empreinteJeton,
  mailReinitialisation,
  TTL_MINUTES,
} from '../lib/reset-password.ts';

describe('jetons de réinitialisation', () => {
  test('deux jetons ne se ressemblent jamais', () => {
    const vus = new Set<string>();
    for (let i = 0; i < 200; i++) vus.add(creerJeton().jeton);
    assert.equal(vus.size, 200);
  });

  test('le jeton passe dans une URL sans encodage', () => {
    for (let i = 0; i < 50; i++) {
      const { jeton } = creerJeton();
      assert.equal(encodeURIComponent(jeton), jeton);
    }
  });

  test('l’empreinte est stable et ne contient pas le jeton', () => {
    const { jeton, empreinte } = creerJeton();
    assert.equal(empreinte, empreinteJeton(jeton));
    assert.match(empreinte, /^[0-9a-f]{64}$/);
    assert.ok(!empreinte.includes(jeton));
  });

  test('un jeton retouché donne une autre empreinte', () => {
    const { jeton, empreinte } = creerJeton();
    const casse = jeton.slice(0, -1) + (jeton.at(-1) === 'a' ? 'b' : 'a');
    assert.notEqual(empreinteJeton(casse), empreinte);
  });

  test('le mail porte le lien, en texte comme en html', () => {
    const lien = 'https://exemple.ci/admin/mot-de-passe?token=AbC-123_xyz';
    const { subject, text, html } = mailReinitialisation('Awa Koné', lien);
    assert.ok(subject.length > 0);
    assert.ok(text.includes(lien));
    assert.ok(html.includes(lien));
    assert.ok(text.includes(String(TTL_MINUTES)));
    // Le prénom seul : « Awa, » et pas « Awa Koné, ».
    assert.ok(text.startsWith('Awa,'));
  });

  test('un nom hostile ne s’injecte pas dans le html', () => {
    const { html } = mailReinitialisation('<script>alert(1)</script>', 'https://x.ci');
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
