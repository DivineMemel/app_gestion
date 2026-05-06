import {
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WAMessage,
  isJidUser,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import { db } from './db.js';
import { useSupabaseAuthState } from './auth-state.js';
import { classify } from './classifier.js';

const logger = pino({ level: 'warn' });

async function setStatus(patch: {
  qr_code?: string | null;
  connected?: boolean;
  phone?: string | null;
}) {
  await db
    .from('whatsapp_status')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', 1);
}

async function upsertClient(jid: string, pushName?: string) {
  const { data: existing } = await db
    .from('clients')
    .select('id')
    .eq('phone', jid)
    .maybeSingle();

  if (existing) {
    await db
      .from('clients')
      .update({
        last_seen_at: new Date().toISOString(),
        ...(pushName ? { name: pushName } : {}),
      })
      .eq('id', existing.id);
    return existing.id as string;
  }
  const { data: created } = await db
    .from('clients')
    .insert({ phone: jid, name: pushName ?? null })
    .select('id')
    .single();
  return created!.id as string;
}

function extractText(msg: WAMessage): { text: string; hasMedia: boolean; mediaType?: string } {
  const m = msg.message;
  if (!m) return { text: '', hasMedia: false };
  if (m.conversation) return { text: m.conversation, hasMedia: false };
  if (m.extendedTextMessage?.text)
    return { text: m.extendedTextMessage.text, hasMedia: false };
  if (m.imageMessage)
    return {
      text: m.imageMessage.caption || '',
      hasMedia: true,
      mediaType: 'image',
    };
  if (m.videoMessage)
    return {
      text: m.videoMessage.caption || '',
      hasMedia: true,
      mediaType: 'video',
    };
  if (m.audioMessage) return { text: '', hasMedia: true, mediaType: 'audio' };
  if (m.documentMessage)
    return {
      text: m.documentMessage.caption || m.documentMessage.fileName || '',
      hasMedia: true,
      mediaType: 'document',
    };
  return { text: '', hasMedia: false };
}

async function handleIncoming(msg: WAMessage) {
  if (msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || !isJidUser(jid)) return; // ignorer groupes / status

  const { text, hasMedia, mediaType } = extractText(msg);
  if (!text && !hasMedia) return;

  const clientId = await upsertClient(jid, msg.pushName ?? undefined);

  let classification;
  try {
    classification = await classify(text, hasMedia);
  } catch (e) {
    console.error('classification failed', e);
    classification = {
      category_slug: 'autre',
      intent: 'autre' as const,
      priority: 3 as const,
      summary: '',
    };
  }

  const { data: cat } = await db
    .from('categories')
    .select('id')
    .eq('slug', classification.category_slug)
    .maybeSingle();

  await db.from('messages').upsert(
    {
      wa_message_id: msg.key.id,
      client_id: clientId,
      from_phone: jid,
      body: text,
      has_media: hasMedia,
      media_type: mediaType ?? null,
      category_id: cat?.id ?? null,
      intent: classification.intent,
      priority: classification.priority,
      ai_summary: classification.summary,
      received_at: new Date(Number(msg.messageTimestamp) * 1000).toISOString(),
    },
    { onConflict: 'wa_message_id' },
  );

  console.log(
    `[msg] ${jid} | ${classification.category_slug} | p${classification.priority} | ${classification.summary}`,
  );
}

export async function startWhatsApp() {
  const { state, saveCreds } = await useSupabaseAuthState();
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Eric Gestion', 'Chrome', '1.0'],
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await qrcode.toDataURL(qr);
      await setStatus({ qr_code: dataUrl, connected: false });
      console.log('[qr] new QR code stored — scan from /setup');
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0]?.split('@')[0];
      await setStatus({ qr_code: null, connected: true, phone: phone ?? null });
      console.log(`[wa] connected as ${phone}`);
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[wa] disconnected (code=${code}), reconnect=${shouldReconnect}`);
      await setStatus({ connected: false });
      if (shouldReconnect) {
        setTimeout(() => startWhatsApp(), 2000);
      } else {
        // logout: clear stored creds
        await db.from('wa_auth_state').delete().neq('key', '');
        await setStatus({ qr_code: null, connected: false, phone: null });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      try {
        await handleIncoming(m);
      } catch (e) {
        console.error('handle message failed', e);
      }
    }
  });
}
