import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getRun, listIncidentsByRun } from '@/lib/store';
import { currentUser } from '@/lib/auth';
import IncidentTimeline from '@/components/IncidentTimeline';

export const dynamic = 'force-dynamic';

/** C5 — Results. The timeline is the hero, not the player. Design doc §6. */
export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const user = await currentUser();
  if (!user) redirect('/signin');
  const run = await getRun(params.id, user.orgId);
  if (!run) notFound();

  const incidents = run.status === 'complete' ? await listIncidentsByRun(run.id) : [];

  return (
    <div className="p-6 animate-fade-in">
      <Link href="/runs" className="text-xs text-neutral-500 underline hover:text-neutral-800 dark:hover:text-neutral-200">← Runs</Link>

      <header className="mt-3 mb-5">
        <h1 className="text-lg font-semibold">{run.sourceName}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {run.useCaseName} · {run.status}
          {run.status === 'complete' && ` · ${run.incidentCount} incidents found`}
          {incidents.some((i) => i.alerted) &&
            ` · ${incidents.filter((i) => i.alerted).length} would have alerted`}
        </p>
      </header>

      {run.status === 'failed' && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          <strong>Analysis failed.</strong> {run.errorMessage}
        </div>
      )}

      {run.status === 'processing' && (
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-4 text-sm text-blue-800 dark:text-blue-200">
          Still analysing — <Link href="/runs" className="underline">watch progress</Link>.
        </div>
      )}

      {run.summary && (
        <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 p-4 text-sm leading-relaxed mb-5">
          <strong>Summary.</strong> {run.summary}
        </div>
      )}

      {run.status === 'complete' && <IncidentTimeline incidents={incidents} />}
    </div>
  );
}
