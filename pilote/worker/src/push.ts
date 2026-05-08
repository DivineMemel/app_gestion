import webpush from 'web-push';
import { db } from './db.js';

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:noreply@example.com';

let configured = false;
if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
} else {
  console.warn('[push] VAPID keys missing — push disabled');
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export async function sendPushToAll(payload: PushPayload) {
  if (!configured) return;

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth');

  if (!subs?.length) return;

  const json = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          json,
        );
      } catch (e: any) {
        // 404/410 = subscription expired, supprimer
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('[push] failed', e?.statusCode, e?.message);
        }
      }
    }),
  );
}
