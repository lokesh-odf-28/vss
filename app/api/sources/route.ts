import { NextResponse } from 'next/server';
import { listSources } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: await listSources() });
}
