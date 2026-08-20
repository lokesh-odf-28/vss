import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRun } from '@/lib/store';

export const dynamic = 'force-dynamic';

/** C5 — Results. The timeline is the hero, not the player. Design doc §6. */
export default async function RunDetailPage({ params }: { params: { id: string } }) {
  const run = await getRun(params.id);
  if (!run) notFound();


  
  return (
    <div className="p-6">
      <Link href="/runs" className="text-xs text-neutral-500 underline">← Runs</Link>

      <header className="mt-3 mb-5">
        <h1 className="text-lg font-semibold">{run.sourceName}</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          {run.useCaseName} · {run.status}
          {run.status === 'complete' && ` · ${run.incidentCount} incidents found`}
        </p>
      </header>

      {run.status === 'failed' && (
        <div className="rounded-lg bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          <strong>Analysis failed.</strong> {run.errorMessage}
        </div>
      )}

      {run.summary && (
        <div className="rounded-lg bg-neutral-100 dark:bg-neutral-900 p-4 text-sm leading-relaxed mb-5">
          <strong>Summary.</strong> {run.summary}
        </div>
      )}

      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center">
        <p className="text-sm text-neutral-500">Incident timeline and player go here.</p>
        <p className="text-xs text-neutral-400 mt-2 font-mono">
          TODO: parse incidents from LVS captions, render clickable timestamps that seek the player
        </p>
      </div>
    </div>
  );
}
