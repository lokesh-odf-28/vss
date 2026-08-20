import { NextRequest, NextResponse } from 'next/server';
import { getRun, updateRun } from '@/lib/store';
import { vss, isProgressing, mockProgress, useMock } from '@/lib/vss';

export const dynamic = 'force-dynamic';

/**
 * Poll a run. The client hits this on an interval while status is 'processing'.
 *
 * Note the two phases stay separate: uploadPercent is set by the browser during
 * chunked upload, analysisPercent comes from LVS. Never merge them.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const run = await getRun(params.id);
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
    const done = await updateRun(run.id, {
      status: 'complete',
      analysisPercent: 100,
      summary,
      finishedAt: new Date().toISOString(),
      // TODO: parse incidents out of the summary / captions and persist them
      // to the incident table. Incidents are NOT children of this run.
      incidentCount: 5,
    });
    return NextResponse.json({ data: done });
  } catch (e) {
    const failed = await updateRun(run.id, {
      status: 'failed',
      errorMessage: (e as Error).message,
      finishedAt: new Date().toISOString(),
    });
    return NextResponse.json({ data: failed });
  }
}
