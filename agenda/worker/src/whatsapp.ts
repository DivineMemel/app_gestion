import {
  default as makeWASocket,
  DisconnectReason,
  fetchLatestBaileysVersion,
  WAMessage,
} from '@whiskeysockets/baileys';

// Accept 1:1 conversations only — both classic (@s.whatsapp.net) and the newer
// pseudonymous LID format (@lid) WhatsApp now uses for DMs. Reject groups,
// broadcasts and status updates.
function isDirectUserJid(jid: string): boolean {
  if (jid.endsWith('@g.us')) return false;
  if (jid.endsWith('@broadcast')) return false;
  if (jid === 'status@broadcast') return false;
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

// One-time debug log so we can confirm which fields Baileys populates for
// LID-format DMs in this account.
let lidStructureLogged = false;

// When WhatsApp delivers a DM with a pseudonymous @lid jid, Baileys exposes the
// real phone-number jid via `senderPn` (and sometimes `participantPn`). Prefer
// the PN so `clients.phone` stays human-readable and stable across formats.
function resolveContactJid(key: WAMessage['key']): string {
  const remote = (key.remoteJid ?? '') as string;
  if (!remote.endsWith('@lid')) return remote;

  if (!lidStructureLogged) {
    console.log('[lid] first LID msg key:', JSON.stringify(key));
    lidStructureLogged = true;
  }
  const k = key as unknown as {
    senderPn?: string;
    participantPn?: string;
  };
  return k.senderPn || k.participantPn || remote;
}

// Clé de contact stockée dans `clients.phone`. On garde le numéro nu
// ('2250700000000') plutôt que le jid complet : le même humain arrivait sinon
// deux fois en base selon que WhatsApp livrait '…@s.whatsapp.net' ou un suffixe
// d'appareil ('…:12@…'). Les jids '@lid' ne sont PAS des numéros de téléphone —
// tant qu'on n'a pas résolu le PN, on conserve le jid brut tel quel pour ne pas
// le confondre avec un vrai numéro.
function normalizeContactKey(jid: string): string {
  if (jid.endsWith('@lid')) return jid;
  const user = jid.split('@')[0]?.split(':')[0] ?? '';
  return user.replace(/\D/g, '') || jid;
}
import { Boom } from '@hapi/boom';
import pino from 'pino';
import qrcode from 'qrcode';
import { db } from './db.js';
import { useSupabaseAuthState } from './auth-state.js';
import { classify, FALLBACK, type Classification } from './classifier.js';

const logger = pino({ level: 'warn' });

type Sock = ReturnType<typeof makeWASocket>;

// --- État de connexion (un seul socket vivant à la fois) --------------------
// `startWhatsApp()` se rappelle lui-même à chaque déconnexion. Sans garde, deux
// événements `close` rapprochés créaient deux sockets qui traitaient chacun
// tous les messages : classifications et RDV en double.
let currentSock: Sock | null = null;
let starting = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelayMs = 2_000;
/** Incrémenté à chaque socket : les handlers d'un socket périmé s'auto-ignorent. */
let generation = 0;

const MAX_RECONNECT_DELAY_MS = 60_000;

function scheduleReconnect() {
  if (reconnectTimer) return; // une reconnexion est déjà programmée
  const delay = reconnectDelayMs;
  console.log(`[wa] reconnexion dans ${delay / 1000}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Ce `catch` est essentiel : sans lui, un échec réseau pendant la
    // reconnexion produisait un rejet non géré → crash du process.
    startWhatsApp().catch((e) => {
      console.error('[wa] reconnexion échouée', e);
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
      scheduleReconnect();
    });
  }, delay);
}

function teardown(sock: Sock | null) {
  if (!sock) return;
  try {
    sock.ev.removeAllListeners('connection.update');
    sock.ev.removeAllListeners('messages.upsert');
    sock.ev.removeAllListeners('creds.update');
    sock.end(undefined);
  } catch {
    /* socket déjà mort : rien à nettoyer */
  }
}

async function setStatus(patch: {
  qr_code?: string | null;
  connected?: boolean;
  phone?: string | null;
  disconnect_requested?: boolean;
}) {
  // Upsert pour garantir que la ligne id=1 existe toujours
  const { error } = await db
    .from('whatsapp_status')
    .upsert(
      { id: 1, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'id' },
    );
  if (error) {
    console.error('[setStatus] DB error:', error.message, error.details || '');
  }
}

function watchDisconnectRequest(sock: ReturnType<typeof makeWASocket>) {
  // Drop any watcher left over from a previous startWhatsApp() call —
  // re-using the same channel name after subscribe() throws.
  for (const ch of db.getChannels()) {
    if (ch.topic === 'realtime:wa-disconnect-watcher') {
      db.removeChannel(ch);
    }
  }
  const channel = db
    .channel('wa-disconnect-watcher')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'whatsapp_status' },
      async (payload) => {
        const next = payload.new as { disconnect_requested?: boolean };
        if (next.disconnect_requested) {
          console.log('[wa] disconnect requested from web');
          await setStatus({ disconnect_requested: false });
          try {
            await sock.logout();
          } catch (e) {
            console.error('[wa] logout error', e);
          }
          await db.from('wa_auth_state').delete().neq('key', '');
          await setStatus({ qr_code: null, connected: false, phone: null });
        }
      },
    )
    .subscribe();
  return channel;
}

async function upsertClient(phoneKey: string, pushName?: string): Promise<{
  id: string;
  autoReplySent: boolean;
}> {
  const { data: existing } = await db
    .from('clients')
    .select('id, auto_reply_sent')
    .eq('phone', phoneKey)
    .maybeSingle();

  if (existing) {
    await db
      .from('clients')
      .update({
        last_seen_at: new Date().toISOString(),
        ...(pushName ? { name: pushName } : {}),
      })
      .eq('id', existing.id);
    return {
      id: existing.id as string,
      autoReplySent: !!(existing as any).auto_reply_sent,
    };
  }
  const { data: created } = await db
    .from('clients')
    .insert({ phone: phoneKey, name: pushName ?? null })
    .select('id')
    .single();
  return { id: created!.id as string, autoReplySent: false };
}

async function maybeSendAutoReply(
  sock: ReturnType<typeof makeWASocket>,
  jid: string,
  clientId: string,
) {
  const { data: settings } = await db
    .from('app_settings')
    .select('auto_reply_enabled, auto_reply_message')
    .eq('id', 1)
    .maybeSingle();
  if (!settings?.auto_reply_enabled || !settings.auto_reply_message) return;
  try {
    await sock.sendMessage(jid, { text: settings.auto_reply_message });
    await db.from('clients').update({ auto_reply_sent: true }).eq('id', clientId);
    console.log(`[auto-reply] sent to ${jid}`);
  } catch (e) {
    console.error('[auto-reply] failed', e);
  }
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

async function handleIncoming(
  msg: WAMessage,
  sock: ReturnType<typeof makeWASocket>,
) {
  const jid = msg.key.remoteJid;
  if (msg.key.fromMe) {
    console.log(`[skip] fromMe=true jid=${jid}`);
    return;
  }
  if (!jid) {
    console.log('[skip] no remoteJid');
    return;
  }
  if (!isDirectUserJid(jid)) {
    console.log(`[skip] not a direct user jid (group/broadcast): ${jid}`);
    return;
  }

  const { text, hasMedia, mediaType } = extractText(msg);
  if (!text && !hasMedia) {
    console.log(`[skip] empty msg from ${jid}`);
    return;
  }

  const contactJid = resolveContactJid(msg.key);
  if (contactJid !== jid) {
    console.log(`[lid→pn] ${jid} resolved to ${contactJid}`);
  }
  const contactKey = normalizeContactKey(contactJid);

  const { id: clientId, autoReplySent } = await upsertClient(
    contactKey,
    msg.pushName ?? undefined,
  );

  let classification: Classification;
  try {
    classification = await classify(text, hasMedia);
  } catch (e) {
    console.error('classification failed', e);
    classification = FALLBACK;
  }

  const { data: cat } = await db
    .from('categories')
    .select('id')
    .eq('slug', classification.category_slug)
    .maybeSingle();

  const { data: insertedMsg, error: msgErr } = await db
    .from('messages')
    .upsert(
      {
        wa_message_id: msg.key.id,
        client_id: clientId,
        from_phone: contactKey,
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
    )
    .select('id')
    .maybeSingle();
  if (msgErr) {
    console.error('[messages] insert error:', msgErr.message, msgErr.details || '');
  }

  // Auto-création du RDV si l'IA a détecté une date.
  //
  // `messages` est dédoublonné par `wa_message_id`, mais pas les RDV : WhatsApp
  // redélivre les mêmes messages à la reconnexion (type 'append'), ce qui créait
  // un RDV de plus à chaque passage. On upsert donc sur `source_message_id`
  // (index unique, migration 006) — et sans id de message, pas de clé de
  // dédoublonnage, donc on s'abstient plutôt que de risquer un doublon.
  if (
    classification.intent === 'rdv' &&
    classification.scheduled_at &&
    classification.rdv_title
  ) {
    if (!insertedMsg?.id) {
      console.warn('[rdv] ignoré : message non enregistré, pas de clé de dédoublonnage');
    } else {
      const { error: apptErr } = await db.from('appointments').upsert(
        {
          client_id: clientId,
          category_id: cat?.id ?? null,
          title: classification.rdv_title,
          address: classification.address,
          scheduled_at: classification.scheduled_at,
          duration_minutes: 60,
          notes: classification.summary,
          status: 'planifie',
          source_message_id: insertedMsg.id,
        },
        { onConflict: 'source_message_id' },
      );
      if (apptErr) {
        console.error('[rdv] upsert error:', apptErr.message, apptErr.details || '');
      } else {
        console.log(
          `[rdv] auto-créé : ${classification.rdv_title} @ ${classification.scheduled_at}`,
        );
      }
    }
  }

  console.log(
    `[msg] ${jid} | ${classification.category_slug} | p${classification.priority} | ${classification.summary}`,
  );

  // Auto-réponse aux nouveaux clients (jamais envoyé avant)
  if (!autoReplySent) {
    await maybeSendAutoReply(sock, jid, clientId);
  }
}

export async function startWhatsApp() {
  // Deux appels concurrents (ex. deux 'close' rapprochés) ne doivent jamais
  // produire deux sockets.
  if (starting) {
    console.log('[wa] démarrage déjà en cours, appel ignoré');
    return;
  }
  starting = true;

  let sock: Sock;
  let myGen: number;
  try {
    teardown(currentSock);
    currentSock = null;

    const { state, saveCreds } = await useSupabaseAuthState();
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['Pilote', 'Chrome', '1.0'],
      syncFullHistory: false,
    });
    myGen = ++generation;
    currentSock = sock;
    sock.ev.on('creds.update', saveCreds);
    watchDisconnectRequest(sock);
  } finally {
    starting = false;
  }

  /** Vrai si ce socket a été remplacé depuis : ses events ne comptent plus. */
  const stale = () => myGen !== generation;

  sock.ev.on('connection.update', async (update) => {
    if (stale()) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const dataUrl = await qrcode.toDataURL(qr);
      await setStatus({ qr_code: dataUrl, connected: false });
      console.log('[qr] new QR code stored — scan from /setup');
    }

    if (connection === 'open') {
      const phone = sock.user?.id?.split(':')[0]?.split('@')[0];
      reconnectDelayMs = 2_000; // connexion saine : on repart d'un backoff neuf
      await setStatus({ qr_code: null, connected: true, phone: phone ?? null });
      console.log(`[wa] connected as ${phone}`);
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(`[wa] disconnected (code=${code}), reconnect=${shouldReconnect}`);
      await setStatus({ connected: false });
      if (shouldReconnect) {
        scheduleReconnect();
      } else {
        // logout: clear stored creds
        teardown(sock);
        currentSock = null;
        await db.from('wa_auth_state').delete().neq('key', '');
        await setStatus({ qr_code: null, connected: false, phone: null });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (stale()) return;
    console.log(`[upsert] type=${type} count=${messages.length}`);
    if (type !== 'notify' && type !== 'append') return;
    for (const m of messages) {
      try {
        await handleIncoming(m, sock);
      } catch (e) {
        console.error('handle message failed', e);
      }
    }
  });
}
