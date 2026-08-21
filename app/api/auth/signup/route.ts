import { NextRequest, NextResponse } from 'next/server';
import { createOrgAndUser } from '@/lib/store';
import { hashPassword } from '@/lib/auth/password';
import { SESSION_COOKIE, createSessionToken } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Org = user (see project notes): this is the only way an app_user row is
 * ever created — there is no separate "create org" step and no invite flow.
 * One call creates both rows in a single transaction or neither does.
 */
export async function POST(req: NextRequest) {
  if (process.env.ALLOW_SIGNUP === 'false') {
    return NextResponse.json({ error: 'Sign-up is currently disabled' }, { status: 403 });
  }

  const { orgName, name, email, password } = (await req.json()) as {
    orgName?: string; name?: string; email?: string; password?: string;
  };

  if (!orgName?.trim() || !name?.trim()) {
    return NextResponse.json({ error: 'Organization and your name are required' }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  try {
    const passwordHash = await hashPassword(password);
    const user = await createOrgAndUser({ orgName: orgName.trim(), name: name.trim(), email, passwordHash });

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
  } catch (e: any) {
    // app_user.email UNIQUE — the pre-check window still allows a race
    if (e?.code === '23505') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }
    throw e;
  }
}
