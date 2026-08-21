import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth/session';

/**
 * Gates the whole app behind a valid session.
 *
 * Runs on the edge runtime, so it can only verify the cookie signature — it
 * cannot hit the database. Whether the user still exists and is active is
 * re-checked in currentUser() on the node side. Treat this as a cheap first
 * filter, not the authorisation boundary.
 */
const PUBLIC_PATHS = ['/signin', '/api/auth/login', '/api/auth/logout'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }

  const userId = await readSessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (userId) return NextResponse.next();

  // APIs get a 401 they can handle; page loads get bounced to sign-in with a
  // return path so the user lands where they were headed.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/signin';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
