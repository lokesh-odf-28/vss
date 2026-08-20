import { NextRequest, NextResponse } from 'next/server';
import { listUseCases, createUseCase } from '@/lib/store';
import type { UseCaseInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: await listUseCases() });
}

export async function POST(req: NextRequest) {
  const input = (await req.json()) as UseCaseInput;

  if (!input.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!input.supportsRecorded && !input.supportsLive) {
    return NextResponse.json({ error: 'must support at least one mode' }, { status: 400 });
  }

  try {
    const created = await createUseCase(input);
    return NextResponse.json({ data: created }, { status: 201 });
  } catch (e: any) {
    // unique_violation on (org_id, slug) — same name already used
    if (e?.code === '23505') {
      return NextResponse.json(
        { error: 'A use case with a similar name already exists' },
        { status: 409 },
      );
    }
    throw e;
  }
}
