import { NextRequest, NextResponse } from 'next/server';
import { updateUserPassword, getUserById } from '@/lib/store';
import { hashPassword } from '@/lib/auth/password';
import { checkOtp } from '@/lib/auth/otp';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const REASON_MESSAGE: Record<string, string> = {
  not_found: 'No reset in progress for this email — request a new code',
  expired: 'That code has expired — request a new one',
  too_many_attempts: 'Too many incorrect attempts — request a new code',
  wrong_code: 'Incorrect code',
};

export async function POST(req: NextRequest) {
  const { email, code, password } = (await req.json()) as {
    email?: string; code?: string; password?: string;
  };
  if (!email || !code) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const result = await checkOtp('reset', email, code);
  if (!result.ok) {
    return NextResponse.json({ error: REASON_MESSAGE[result.reason] }, { status: 400 });
  }

  const user = await getUserById(result.userId!);
  if (!user || user.status !== 'active') {
    return NextResponse.json({ error: 'This account is no longer available' }, { status: 400 });
  }

  await updateUserPassword(user.id, await hashPassword(password));

  // Reset implies you now hold the account — sign the new session in
  // immediately rather than sending them back through sign-in.
  const { token, maxAge } = await createSessionToken(user.id);
  const res = NextResponse.json({ data: { ok: true } });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return res;
}
