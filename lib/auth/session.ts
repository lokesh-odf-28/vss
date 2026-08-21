/**
 * Signed session cookie: `userId.expiresAt.signature`.
 *
 * Uses Web Crypto (not node:crypto) so the same code runs in edge middleware
 * and in node route handlers. The cookie carries no secrets — just a user id
 * and expiry, HMAC-signed so it cannot be forged or extended client-side.
 *
 * This is deliberately simple: no refresh tokens, no server-side session
 * table, no revocation. Sufficient for a single-tenant internal tool; revisit
 * before anything public-facing.
 */

export const SESSION_COOKIE = 'vi_session';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return s;
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function b64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString('base64url');
}

export async function createSessionToken(userId: string): Promise<{ token: string; maxAge: number }> {
  const expiresAt = Date.now() + TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), new TextEncoder().encode(payload));
  return { token: `${payload}.${b64url(sig)}`, maxAge: Math.floor(TTL_MS / 1000) };
}

/** Returns the userId, or null if missing / malformed / tampered / expired. */
export async function readSessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;

  // userId is a UUID and expiresAt is digits — neither contains '.', so a
  // strict 3-part split is safe.
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;

  const expiresAt = Number(expStr);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return null;

  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(),
    Buffer.from(sig, 'base64url'),
    new TextEncoder().encode(`${userId}.${expStr}`),
  );
  return valid ? userId : null;
}
