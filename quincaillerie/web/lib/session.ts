// Jetons de session signés (HMAC-SHA256).
//
// Volontairement basé sur Web Crypto (globalThis.crypto.subtle) pour tourner À
// LA FOIS dans le middleware (runtime edge) et dans les route handlers (Node).
// Ne PAS importer node:crypto ici, sinon le middleware edge casse.

const enc = new TextEncoder();

async function hmacHex(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Jeton = `<memberId>.<expiration>.<hmac>`. */
export async function signSession(
  memberId: string,
  secret: string,
  ttlDays = 30,
): Promise<string> {
  const exp = Date.now() + ttlDays * 86_400_000;
  const payload = `${memberId}.${exp}`;
  return `${payload}.${await hmacHex(payload, secret)}`;
}

/**
 * Renvoie le memberId si la signature est valide ET le jeton non expiré,
 * sinon null.
 */
export async function verifySession(
  token: string,
  secret: string,
): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(payload, secret);

  // Comparaison à temps constant.
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;

  const sep = payload.lastIndexOf('.');
  if (sep <= 0) return null;
  const id = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!Number.isFinite(exp) || Date.now() > exp) return null;

  return id;
}
