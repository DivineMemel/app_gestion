import { db } from './db.js';
import { sendPushToAll } from './push.js';
import {
  abidjanHour,
  endOfAbidjanDay,
  fmtAbidjanTime as fmtTime,
  startOfAbidjanDay,
} from './datetime.js';

const CHECK_INTERVAL_MS = 60_000;

async function checkUpcomingReminders() {
  const now = new Date();
  const in30min = new Date(now.getTime() + 30 * 60 * 1000);

  // Alertes 30min avant le RDV
  const { data: soon } = await db
    .from('appointments')
    .select('id, title, scheduled_at, address, status')
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', in30min.toISOString())
    .neq('status', 'annule')
    .eq('reminded_30min', false);

  for (const a of soon || []) {
    await sendPushToAll({
      title: `RDV dans 30 min — ${a.title}`,
      body: `${fmtTime(a.scheduled_at)}${a.address ? ` · ${a.address}` : ''}`,
      url: '/calendar',
      tag: `appt-30-${a.id}`,
    });
    await db
      .from('appointments')
      .update({ reminded_30min: true })
      .eq('id', a.id);
    console.log(`[reminder] 30min envoyé pour ${a.title}`);
  }
}

async function checkMorningRecap() {
  const now = new Date();
  // Récap du matin : entre 7h00 et 7h05 heure d'Abidjan (et non l'heure locale
  // du serveur, qui ne tombait juste que parce que Render tourne en UTC).
  if (abidjanHour(now) !== 7 || now.getUTCMinutes() >= 5) return;

  const startOfDay = startOfAbidjanDay(now);
  const endOfDay = endOfAbidjanDay(now);

  const { data: today } = await db
    .from('appointments')
    .select('id, title, scheduled_at')
    .gte('scheduled_at', startOfDay.toISOString())
    .lte('scheduled_at', endOfDay.toISOString())
    .neq('status', 'annule')
    .eq('reminded_morning', false)
    .order('scheduled_at', { ascending: true });

  if (!today?.length) return;

  const list = today.map((a) => `${fmtTime(a.scheduled_at)} ${a.title}`).join(', ');
  await sendPushToAll({
    title: `Aujourd'hui : ${today.length} RDV`,
    body: list,
    url: '/calendar',
    tag: 'morning-recap',
  });

  await db
    .from('appointments')
    .update({ reminded_morning: true })
    .in('id', today.map((a) => a.id));
  console.log(`[reminder] récap matin envoyé (${today.length} RDV)`);
}

export function startScheduler() {
  const tick = async () => {
    try {
      await Promise.all([checkUpcomingReminders(), checkMorningRecap()]);
    } catch (e) {
      console.error('[scheduler] tick failed', e);
    }
  };
  tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  console.log(`[scheduler] running (every ${CHECK_INTERVAL_MS / 1000}s)`);
}
