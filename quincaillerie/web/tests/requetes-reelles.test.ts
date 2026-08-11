import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildSelect } from '../lib/db-schema.ts';
import { canReadTable, ROLES, canView, moduleForPath, type Role } from '../lib/permissions.ts';

/**
 * Resserrer la passerelle ne sert à rien si ça casse les écrans.
 *
 * Ce test relit le code des pages, en extrait chaque `db.from('x').select('y')`
 * et vérifie que la sélection passe la liste blanche. C'est le garde-fou qui
 * manquait : sans lui, une colonne ajoutée en base et utilisée dans une page
 * mais oubliée dans `db-schema.ts` ne se verrait qu'en production, sous la
 * forme d'un écran vide.
 */

const RACINE = new URL('..', import.meta.url).pathname;

function fichiers(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    if (entree === 'node_modules' || entree === '.next') continue;
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) fichiers(chemin, acc);
    else if (/\.tsx?$/.test(entree)) acc.push(chemin);
  }
  return acc;
}

/**
 * `.from('table')` … `.select('colonnes')`, sauts de ligne compris.
 *
 * Le `(?!\.from\()` est essentiel : sans lui, un `.from()` sans `.select()`
 * s'apparie avec le `.select()` de la requête SUIVANTE, et le test dénonce des
 * colonnes qui n'ont jamais été demandées sur cette table.
 */
const APPEL = /\.from\(\s*'(\w+)'\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*'([^']*)'/g;

type Requete = { fichier: string; table: string; select: string };

function requetes(): Requete[] {
  const out: Requete[] = [];
  for (const f of [...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'components'))]) {
    // Les routes serveur parlent à Supabase en direct (service_role) et ne
    // passent pas par la passerelle : elles ne sont pas concernées.
    if (f.includes('/api/')) continue;
    const source = readFileSync(f, 'utf8');
    for (const m of source.matchAll(APPEL)) {
      out.push({ fichier: f.slice(RACINE.length), table: m[1]!, select: m[3]! });
    }
  }
  return out;
}

describe('les requêtes des pages passent la liste blanche', () => {
  const toutes = requetes();

  test('le relevé trouve bien des requêtes', () => {
    // Sinon le test passerait en ne vérifiant rien du tout.
    assert.ok(toutes.length > 20, `seulement ${toutes.length} requêtes trouvées`);
  });

  test('chaque requête est valide pour le patron', () => {
    const echecs: string[] = [];
    for (const r of toutes) {
      const v = buildSelect(r.table, r.select, ['patron'], true, canReadTable);
      if (!v.ok) echecs.push(`${r.fichier} — ${r.table}.select('${r.select}') : ${v.message}`);
    }
    assert.deepEqual(echecs, []);
  });

  test('chaque requête reste valide pour tout rôle autorisé à voir la page', () => {
    // Un vendeur ouvre la caisse : ses requêtes doivent passer, même amputées
    // des colonnes de coût. Une erreur ici signifie un écran cassé pour ce rôle.
    const echecs: string[] = [];
    for (const r of toutes) {
      const module = moduleForPath(pageDepuisFichier(r.fichier));
      if (!module) continue;
      for (const role of ROLES) {
        if (!canView([role], module)) continue;
        if (!canReadTable([role], r.table)) continue; // refus attendu, pas un bug
        const voitCouts = role === 'patron' || role === 'gerant';
        const v = buildSelect(r.table, r.select, [role as Role], voitCouts, canReadTable);
        if (!v.ok) {
          echecs.push(`${r.fichier} [${role}] — ${r.table}.select('${r.select}') : ${v.message}`);
        }
      }
    }
    assert.deepEqual(echecs, []);
  });
});

/** `app/admin/(app)/caisse/page.tsx` → `/admin/caisse` */
function pageDepuisFichier(fichier: string): string {
  const m = fichier.match(/app\/admin\/\(app\)\/([^/]+)\//);
  if (m) return `/admin/${m[1]}`;
  if (fichier.includes('app/admin/(app)/page.tsx')) return '/admin';
  return '';
}
