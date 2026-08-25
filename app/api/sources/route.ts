import { NextResponse } from 'next/server';
import { listSources, createSource } from '@/lib/store';
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

/**
 * Registers an "upload" source from a file name only — no bytes cross this
 * route. Real chunked upload to VST is a separate, not-yet-built path (see
 * README's "two rules" — the browser would talk to VST directly).
 */
export async function POST(req: Request) {
  try {
    const ctx = await requireUser();
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const source = await createSource(ctx.orgId, name);
    return NextResponse.json({ data: source }, { status: 201 });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }
}
