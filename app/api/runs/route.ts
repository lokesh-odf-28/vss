import { NextRequest, NextResponse } from 'next/server';
import { listRuns, createRun, getUseCase, getSource } from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { vss } from '@/lib/vss';
import type { Run, RunMode } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await requireUser();
    return NextResponse.json({ data: await listRuns(ctx.orgId) });
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }
}

/**
 * Start a run.
 *
 * The browser has already uploaded any video straight to VST and holds the
 * resulting sensor id — this route does NOT receive the file. It only hands
 * LVS the prompts from the selected use case and records the job.
 *
 * getUseCase/getSource below are org-scoped, so a useCaseId or sourceId that
 * belongs to a different organization comes back null and hits the same
 * "unknown use case"/"unknown source" 400 as one that does not exist —
 * that is also what stops a run ever being created against another org's
 * camera or use case, not a separate check.
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }

  const { useCaseId, sourceId, mode } = (await req.json()) as {
    useCaseId?: string; sourceId?: string; mode?: RunMode;
  };

  if (mode !== 'recorded' && mode !== 'live') {
    return NextResponse.json({ error: "mode must be 'recorded' or 'live'" }, { status: 400 });
  }

  const [useCase, source] = await Promise.all([
    getUseCase(useCaseId ?? '', ctx.orgId),
    getSource(sourceId ?? '', ctx.orgId),
  ]);
  if (!useCase) return NextResponse.json({ error: 'unknown use case' }, { status: 400 });
  if (!source) return NextResponse.json({ error: 'unknown source' }, { status: 400 });

  if (mode === 'recorded' && !useCase.supportsRecorded) {
    return NextResponse.json(
      { error: `"${useCase.name}" is not configured for recorded analysis` }, { status: 400 });
  }
  if (mode === 'live' && !useCase.supportsLive) {
    return NextResponse.json(
      { error: `"${useCase.name}" is not configured for live monitoring` }, { status: 400 });
  }
  if (mode === 'live' && source.kind !== 'camera') {
    return NextResponse.json(
      { error: 'Live monitoring needs a camera, not an uploaded file' }, { status: 400 });
  }
  if (mode === 'live' && source.status !== 'online') {
    return NextResponse.json(
      { error: `${source.name} is ${source.status} — live monitoring needs an online camera` },
      { status: 400 });
  }

  // Live streaming needs LVS /v1/stream_summarize plus the RTVI service, and
  // a session screen (C4b) to render the caption feed into. None of that
  // exists yet, so fail loudly here rather than quietly running a recorded
  // summarize under a 'live' label.
  if (mode === 'live') {
    return NextResponse.json(
      { error: 'Live monitoring is not wired up yet — recorded analysis only for now' },
      { status: 501 });
  }

  let externalJobId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const accepted = await vss.summarize({
      id: source.vstSensorId ?? source.id,
      // Mode picks the prompt set. Design doc §2: one use case, four
      // subsystems — recorded and live are configured separately.
      prompt: useCase.recordedPrompt,
      system_prompt: useCase.recordedSystemPrompt,
      scenario: useCase.scenario,
      objects_of_interest: useCase.objectsOfInterest,
      event_types: useCase.events.map((e) => e.code),
    });
    externalJobId = accepted.id;
  } catch (e) {
    errorMessage = (e as Error).message;
  }

  const run: Run = {
    id: `run-${Math.random().toString(36).slice(2, 10)}`,
    useCaseId: useCase.id,
    useCaseName: useCase.name,
    sourceId: source.id,
    sourceName: source.name,
    mode,
    status: errorMessage ? 'failed' : 'processing',
    uploadPercent: 100,        // upload already finished, browser → VST
    analysisPercent: 0,
    externalJobId,
    summary: null,
    errorMessage,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    incidentCount: 0,
  };

  const created = await createRun(run);
  return NextResponse.json({ data: created }, { status: 201 });
}
