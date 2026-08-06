import { resolveWhen } from './datetime.js';

// Mercredi 5 août 2026, 10h00 Abidjan (= UTC).
const NOW = new Date('2026-08-05T10:00:00.000Z');

const cases: Array<[string, unknown, string | null]> = [
  ['demain à 14h', { kind: 'relative', day_offset: 1, hour: 14, minute: 0 }, '2026-08-06T14:00:00.000Z'],
  ['aujourd\'hui 16h', { kind: 'relative', day_offset: 0, hour: 16 }, '2026-08-05T16:00:00.000Z'],
  ['lundi matin', { kind: 'relative', weekday: 'lundi', daypart: 'matin' }, '2026-08-10T09:00:00.000Z'],
  ['mercredi 18h (= aujourd\'hui, pas encore passé)', { kind: 'relative', weekday: 'mercredi', hour: 18 }, '2026-08-05T18:00:00.000Z'],
  ['mercredi 8h (= déjà passé → semaine prochaine)', { kind: 'relative', weekday: 'mercredi', hour: 8 }, '2026-08-12T08:00:00.000Z'],
  ['le 12 août 9h30', { kind: 'absolute', date: '2026-08-12', hour: 9, minute: 30 }, '2026-08-12T09:30:00.000Z'],
  ['après-demain soir', { kind: 'relative', day_offset: 2, daypart: 'soir' }, '2026-08-07T18:00:00.000Z'],
  // --- doivent être rejetés ---
  ['dans 3 jours (sans heure)', { kind: 'relative', day_offset: 3 }, null],
  ['rien', null, null],
  ['hier 14h (passé)', { kind: 'relative', day_offset: 0, hour: 2 }, null],
  ['date impossible', { kind: 'absolute', date: '2026-02-31', hour: 10 }, null],
  ['trop loin (LLM qui délire)', { kind: 'absolute', date: '2027-06-01', hour: 10 }, null],
  ['heure invalide', { kind: 'relative', day_offset: 1, hour: 99 }, null],
  ['jour inconnu', { kind: 'relative', weekday: 'lundu', hour: 10 }, null],
  ['kind manquant', { day_offset: 1, hour: 14 }, null],
];

let fail = 0;
for (const [label, when, expected] of cases) {
  const got = resolveWhen(when as never, NOW);
  const ok = got === expected;
  if (!ok) fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}\n     attendu ${expected}\n     obtenu  ${got}`);
}
console.log(fail === 0 ? '\nTous les cas passent.' : `\n${fail} échec(s).`);
process.exit(fail === 0 ? 0 : 1);
