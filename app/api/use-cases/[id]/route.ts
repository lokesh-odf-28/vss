import { NextRequest, NextResponse } from 'next/server';
import { getUseCase, saveUseCase } from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import type { UseCaseInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await requireUser();
    const uc = await getUseCase(params.id, ctx.orgId);
    if (!uc) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ data: uc });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }

  const input = (await req.json()) as UseCaseInput;

  if (!input.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!input.supportsRecorded && !input.supportsLive) {
    return NextResponse.json({ error: 'must support at least one mode' }, { status: 400 });
  }

  // Same response whether the id belongs to someone else's org or does not
  // exist at all — an id must not be usable to probe what other
  // organizations have.
  const saved = await saveUseCase(params.id, ctx.orgId, input);
  if (!saved) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ data: saved });
}
