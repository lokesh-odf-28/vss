import { NextResponse } from 'next/server';
import { vss, useMock } from '@/lib/vss';
import { storeBackend } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const health = await vss.health();
  return NextResponse.json({
    ...health,
    vss: useMock ? 'mock' : 'live',
    store: storeBackend,
  });
}
