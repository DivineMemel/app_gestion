import { db } from './db.js';
import { sendPushToAll } from './push.js';

const CHECK_INTERVAL_MS = 60_000;

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
  // Recap du matin : entre 7h00 et 7h05 heure locale serveur
  if (now.getHours() !== 7 || now.getMinutes() >= 5) return;

  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

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
