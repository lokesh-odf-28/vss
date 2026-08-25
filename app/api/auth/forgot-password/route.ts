import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/store';
import { issueOtp } from '@/lib/auth/otp';

export const dynamic = 'force-dynamic';

const GENERIC = { data: { ok: true, message: 'If an account exists for that email, a code has been sent.' } };

/**
 * Always the same response whether the address has an account or not, and
 * regardless of account status — same principle as login's identical error
 * for "unknown email" vs "wrong password". Anything else turns this
 * endpoint into a way to enumerate who has signed up.
 */
export async function POST(req: NextRequest) {
  const { email } = (await req.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });

  const user = await getUserByEmail(email);
  if (user && user.status === 'active') {
    await issueOtp({
      purpose: 'reset',
      email,
      subject: 'Reset your password',
      bodyPrefix: 'Your password reset code is',
      payload: { userId: user.id },
    });
  }

  return NextResponse.json(GENERIC);
}
