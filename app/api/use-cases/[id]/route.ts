import { NextRequest, NextResponse } from 'next/server';
import { getUseCase, saveUseCase } from '@/lib/store';
import type { UseCaseInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const uc = await getUseCase(params.id);
  if (!uc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ data: uc });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const input = (await req.json()) as UseCaseInput;

  if (!input.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  if (!input.supportsRecorded && !input.supportsLive) {
    return NextResponse.json({ error: 'must support at least one mode' }, { status: 400 });
  }

  const saved = await saveUseCase(params.id, input);
  if (!saved) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ data: saved });
}
