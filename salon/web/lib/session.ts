// Jetons de session signés (HMAC-SHA256). Volontairement basé sur Web Crypto
// (globalThis.crypto.subtle) pour fonctionner À LA FOIS dans le middleware
// (edge runtime) et dans les route handlers (Node). Ne PAS importer node:crypto
// ici, sinon le middleware edge casse.

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

/** Jeton = `<memberId>.<hmac>`. */
export async function signSession(memberId: string, secret: string): Promise<string> {
  return `${memberId}.${await hmacHex(memberId, secret)}`;
}

/** Renvoie le memberId si la signature est valide, sinon null. */
export async function verifySession(token: string, secret: string): Promise<string | null> {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacHex(id, secret);
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0 ? id : null;
}
