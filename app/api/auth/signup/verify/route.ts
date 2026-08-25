import { NextRequest, NextResponse } from 'next/server';
import { createOrgAndUser, getUserByEmail } from '@/lib/store';
import { checkOtp } from '@/lib/auth/otp';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const REASON_MESSAGE: Record<string, string> = {
  not_found: 'No pending sign-up for this email — start again',
  expired: 'That code has expired — request a new one',
  too_many_attempts: 'Too many incorrect attempts — request a new code',
  wrong_code: 'Incorrect code',
};

export async function POST(req: NextRequest) {
  const { email, code } = (await req.json()) as { email?: string; code?: string };
  if (!email || !code) {
    return NextResponse.json({ error: 'Email and code are required' }, { status: 400 });
  }

  const result = await checkOtp('signup', email, code);
  if (!result.ok) {
    return NextResponse.json({ error: REASON_MESSAGE[result.reason] }, { status: 400 });
  }

  // Race guard: two verifies for the same email cannot both have a valid
  // code (checkOtp deletes on first success), but the account could have
  // been created by a different path in between — belt and suspenders.
  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const user = await createOrgAndUser({
    orgName: result.orgName!,
    name: result.name!,
    email,
    passwordHash: result.passwordHash!,
  });

  const { token, maxAge } = await createSessionToken(user.id);
  const res = NextResponse.json({
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  }, { status: 201 });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });
  return res;
}
