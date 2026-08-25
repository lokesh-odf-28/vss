import { NextRequest, NextResponse } from 'next/server';
import {
  getRun, updateRun, completeRunWithIncidents, getUseCase,
} from '@/lib/store';
import { requireUser, UnauthorizedError } from '@/lib/auth';
import { vss, isProgressing, mockProgress, useMock } from '@/lib/vss';
import type { Severity } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Poll a run. The client hits this on an interval while status is 'processing'.
 *
 * Note the two phases stay separate: uploadPercent is set by the browser during
 * chunked upload, analysisPercent comes from LVS. Never merge them.
 *
 * getRun is org-scoped, so this 404s exactly the same way for "does not
 * exist" and "belongs to a different org" — the only ownership check this
 * route needs. Everything after it (updateRun, completeRunWithIncidents,
 * getUseCase) operates on ids already proven to belong to this org right
 * here, so they do not re-check.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    throw e;
  }

  const run = await getRun(params.id, ctx.orgId);
  if (!run) return NextResponse.json({ error: 'not found' }, { status: 404 });

  if (run.status !== 'processing' || !run.externalJobId) {
    return NextResponse.json({ data: run });
  }

  try {
    const res = await vss.poll(run.externalJobId);

    if (isProgressing(res)) {
      const pct = useMock ? mockProgress(run.externalJobId) : run.analysisPercent;
      return NextResponse.json({ data: await updateRun(run.id, { analysisPercent: pct }) });
    }

    const summary = res.choices[0]?.message?.content ?? '';

    // Gather everything BEFORE the transaction — these are network and DB
    // reads that should not be held open inside it.
    const drafts = await vss.detectedIncidents(run.externalJobId);

    // Severity is authored by the user in C2 and looked up here — the model
    // reports what it saw, the use case decides how much it matters. An event
    // code we do not recognise falls back to medium rather than being
    // dropped, so nothing detected goes silently missing.
    const useCase = await getUseCase(run.useCaseId, ctx.orgId);
    const severityByCode = new Map<string, Severity>(
      (useCase?.events ?? []).map((e) => [e.code, e.severity]),
    );

    // Completing the run and writing its incidents happen together, so no
    // concurrent poll can ever observe a finished run with zero incidents.
    const done = await completeRunWithIncidents(
      run.id,
      summary,
      drafts.map((d) => ({
        sourceId: run.sourceId,
        useCaseId: run.useCaseId,
        offsetMs: d.offsetMs,
        eventCode: d.eventCode,
        severity: severityByCode.get(d.eventCode) ?? 'medium',
        description: d.description,
        objectIds: d.objectIds,
      })),
    );

    // null = another poll won the race; re-read for the consistent result.
    return NextResponse.json({ data: done ?? (await getRun(run.id, ctx.orgId)) });
  } catch (e) {
    const failed = await updateRun(run.id, {
      status: 'failed',
      errorMessage: (e as Error).message,
      finishedAt: new Date().toISOString(),
    });
    return NextResponse.json({ data: failed });
  }
}
