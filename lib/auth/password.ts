import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Password hashing with scrypt from node's stdlib — no native dependency to
 * compile, and scrypt is memory-hard so it resists GPU cracking better than
 * plain PBKDF2.
 *
 * NODE RUNTIME ONLY. Never import this into middleware (edge runtime has no
 * node:crypto). Verification happens in the login route handler, which is
 * node, so that is fine.
 */

const scryptAsync = promisify(scrypt) as (
  password: string, salt: Buffer, keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scryptAsync(plain, Buffer.from(saltB64, 'base64'), expected.length);

  // constant-time — a length mismatch alone must not short-circuit early
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
