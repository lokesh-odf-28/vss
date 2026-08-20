import { NextRequest, NextResponse } from 'next/server';
import { listRuns, createRun, getUseCase, getSource } from '@/lib/store';
import { vss } from '@/lib/vss';
import type { Run } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ data: await listRuns() });
}

/**
 * Start a recorded run.
 *
 * The browser has already uploaded the video straight to VST and holds the
 * resulting sensor id — this route does NOT receive the file. It only hands
 * LVS the prompts from the selected use case and records the job.
 */
export async function POST(req: NextRequest) {
  const { useCaseId, sourceId, mode = 'recorded' } = await req.json();

  const [useCase, source] = await Promise.all([
    getUseCase(useCaseId),
    getSource(sourceId),
  ]);
  if (!useCase) return NextResponse.json({ error: 'unknown use case' }, { status: 400 });
  if (!source) return NextResponse.json({ error: 'unknown source' }, { status: 400 });

  let externalJobId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const accepted = await vss.summarize({
      id: source.vstSensorId ?? source.id,
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

  await createRun(run);
  return NextResponse.json({ data: run }, { status: 201 });
}
