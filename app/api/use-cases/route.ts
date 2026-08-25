import { NextRequest, NextResponse } from 'next/server';
import { listUseCases, createUseCase } from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import type { UseCaseInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireUser();
    return NextResponse.json({ data: await listUseCases(ctx.orgId) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }
}

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    }
    throw e;
  }

  const input = (await req.json()) as UseCaseInput;

  if (!input.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!input.supportsRecorded && !input.supportsLive) {
    return NextResponse.json({ error: 'must support at least one mode' }, { status: 400 });
  }
  // Catches an abandoned "add event" click before it reaches the DB — an
  // empty or duplicate code would otherwise surface as a raw unique-
  // constraint violation, which the catch below can't tell apart from an
  // actual name conflict.
  if (input.events.some((e) => !e.code.trim() || !e.label.trim())) {
    return NextResponse.json({ error: 'Every event needs a name — remove any empty rows' }, { status: 400 });
  }
  const seenCodes = new Set<string>();
  for (const e of input.events) {
    if (seenCodes.has(e.code)) {
      return NextResponse.json(
        { error: `Two events both resolve to "${e.code}" — make their names distinct` },
        { status: 400 },
      );
    }
    seenCodes.add(e.code);
  }

  try {
    const created = await createUseCase(input, ctx);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e: any) {
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: 'A use case with a similar name already exists' },
        { status: 409 },
      );
    }
    throw e;
  }
}
