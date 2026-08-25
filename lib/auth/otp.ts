import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from './password';
import { mailer } from '@/lib/mail';
import {
  createOtpChallenge, getOtpChallenge, incrementOtpAttempts, deleteOtpChallenge,
} from '@/lib/store';
import type { OtpPurpose } from '@/lib/types';

/**
 * 6-digit numeric code. Reuses the same scrypt hashing as account passwords
 * — deliberately slow is fine here too, verification is infrequent by
 * nature, and it avoids a second hashing primitive for what is conceptually
 * the same problem: "does this secret match what we stored."
 */
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;

function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Generates a code, stores its hash (never the code itself), and emails it.
 * `payload` is whatever the challenge needs to carry until verified — the
 * pending signup's org/name/passwordHash, or the reset's userId.
 */
export async function issueOtp(params: {
  purpose: OtpPurpose;
  email: string;
  subject: string;
  bodyPrefix: string; // e.g. "Your verification code is"
  payload?: { orgName?: string; name?: string; passwordHash?: string; userId?: string };
}): Promise<void> {
  const code = generateOtp();
  await createOtpChallenge({
    purpose: params.purpose,
    email: params.email,
    otpHash: await hashPassword(code),
    expiresAt: new Date(Date.now() + OTP_TTL_MS).toISOString(),
    ...params.payload,
  });
  await mailer.send({
    to: params.email,
    subject: params.subject,
    text: `${params.bodyPrefix} ${code}\n\nIt expires in 10 minutes. If you did not request this, you can ignore this email.`,
  });
}

export type OtpCheckResult =
  | { ok: true; orgName?: string; name?: string; passwordHash?: string; userId?: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'wrong_code' };

/** Verifies a code and consumes the challenge on success. Wrong codes
 * increment the attempt counter rather than deleting the challenge, so a
 * mistyped digit does not force requesting a whole new code. */
export async function checkOtp(purpose: OtpPurpose, email: string, code: string): Promise<OtpCheckResult> {
  const row = await getOtpChallenge(purpose, email);
  if (!row) return { ok: false, reason: 'not_found' };

  if (new Date(row.expiresAt).getTime() < Date.now()) {
    await deleteOtpChallenge(purpose, email);
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  const valid = await verifyPassword(code, row.otpHash);
  if (!valid) {
    await incrementOtpAttempts(purpose, email);
    return { ok: false, reason: 'wrong_code' };
  }

  await deleteOtpChallenge(purpose, email);
  return { ok: true, orgName: row.orgName, name: row.name, passwordHash: row.passwordHash, userId: row.userId };
}
