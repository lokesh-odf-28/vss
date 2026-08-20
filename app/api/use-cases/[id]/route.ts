import { NextRequest, NextResponse } from 'next/server';
import { getUseCase, saveUseCase } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const uc = await getUseCase(params.id);
  if (!uc) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ data: uc });
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const existing = await getUseCase(params.id);
  if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const body = await req.json();
  const saved = await saveUseCase({ ...existing, ...body, id: params.id });
  return NextResponse.json({ data: saved });
}
