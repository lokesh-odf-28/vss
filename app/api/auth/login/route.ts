import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/store';
import { verifyPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { email, password } = (await req.json()) as { email?: string; password?: string };

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  const ok = await verifyPassword(password, user?.passwordHash ?? null);

  // Same message and shape whether the address is unknown, the password is
  // wrong, or the account is disabled — otherwise this endpoint becomes a way
  // to enumerate who has an account.
  if (!user || !ok || user.status !== 'active') {
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
  }

  const { token, maxAge } = await createSessionToken(user.id);
  const res = NextResponse.json({
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,                                   // not readable from JS
    sameSite: 'lax',                                  // survives top-level nav, blocks CSRF
    secure: process.env.NODE_ENV === 'production',    // http is fine on localhost
    path: '/',
    maxAge,
  });
  return res;
}
