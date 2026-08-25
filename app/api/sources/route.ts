import { NextResponse } from 'next/server';
import { listSources } from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireUser();
    return NextResponse.json({ data: await listSources(ctx.orgId) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }
}
