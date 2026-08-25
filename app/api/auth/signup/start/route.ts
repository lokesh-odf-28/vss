import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/store';
import { hashPassword } from '@/lib/auth/password';
import { issueOtp } from '@/lib/auth/otp';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step 1 of signup: validate, hash the password, email a code. No app_user
 * row exists yet — the org/name/passwordHash ride along on the otp_challenge
 * until /verify confirms the code, so an unfinished signup never creates a
 * dangling account. "org = user" (project notes): this is the only path
 * that can ever produce an app_user row.
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

  // Checked here for a fast, friendly error — app_user's UNIQUE(email) is
  // still the real guard at /verify time against the race where two signups
  // for the same address are mid-flight at once.
  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  await issueOtp({
    purpose: 'signup',
    email,
    subject: 'Verify your email',
    bodyPrefix: 'Your verification code is',
    payload: {
      orgName: orgName.trim(),
      name: name.trim(),
      passwordHash: await hashPassword(password),
    },
  });

  return NextResponse.json({ data: { ok: true } });
}
