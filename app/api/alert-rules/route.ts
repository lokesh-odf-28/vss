import { NextRequest, NextResponse } from 'next/server';
import { listAlertRules, createAlertRule } from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import type { AlertRuleInput } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireUser();
    return NextResponse.json({ data: await listAlertRules(ctx.orgId) });
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
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }

  const input = (await req.json()) as AlertRuleInput;
  if (!input.useCaseId || !input.useCaseEventId || !input.sourceId) {
    return NextResponse.json({ error: 'Use case, event and camera are all required' }, { status: 400 });
  }

  const result = await createAlertRule(input, ctx.orgId);
  if (result === 'invalid') {
    return NextResponse.json({ error: 'Unknown use case, event, or camera' }, { status: 400 });
  }
  if (result === 'duplicate') {
    return NextResponse.json({ error: 'A rule for this event and camera already exists' }, { status: 409 });
  }
  return NextResponse.json({ data: result }, { status: 201 });
}
