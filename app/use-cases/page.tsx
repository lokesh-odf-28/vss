import Link from 'next/link';
import { listUseCases, listSources } from '@/lib/store';
import RunButton from '@/components/RunButton';

export const dynamic = 'force-dynamic';

/** C1 — Use Case Library. The home screen. Design doc §6. */
export default async function UseCasesPage() {
  const [useCases, sources] = await Promise.all([listUseCases(), listSources()]);
  const defaultSourceId = sources.find((s) => s.status === 'online')?.id ?? null;

  return (
    <div className="p-6">
      <header className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-lg font-semibold">Use Cases</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            What you want the cameras to watch for. Each one runs on recorded video or a live feed.
          </p>
        </div>
        <Link
          href="/use-cases/new"
          className="rounded-md bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white"
        >
          ＋ New use case
        </Link>
      </header>

      {useCases.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {useCases.map((uc) => (
            <div
              key={uc.id}
              className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 bg-white dark:bg-neutral-900"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{uc.icon}</span>
                <span className="font-semibold text-sm">{uc.name}</span>
              </div>
              <p className="text-xs text-neutral-500 mt-1.5 min-h-[34px] leading-relaxed">
                {uc.description}
              </p>

              <div className="flex gap-1.5 mt-2">
                {uc.supportsRecorded && <Badge tone="blue">recorded</Badge>}
                {uc.supportsLive && <Badge tone="amber">live</Badge>}
              </div>

              <div className="flex items-end justify-between mt-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <div className="text-[10px] font-mono text-neutral-400 leading-relaxed">
                  {uc.alertRuleCount} alert rules
                  <br />
                  {uc.lastRunAt ? `last run ${new Date(uc.lastRunAt).toLocaleDateString()}` : 'never run'}
                </div>
                <div className="flex gap-1.5">
                  <Link
                    href={`/use-cases/${uc.id}/edit`}
                    className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs"
                  >
                    Edit
                  </Link>
                  <RunButton useCaseId={uc.id} sourceId={defaultSourceId} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: 'blue' | 'amber'; children: React.ReactNode }) {
  const cls =
    tone === 'blue'
      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

/** Design doc §6: the empty state is the real first-run experience. */
function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center">
      <p className="text-sm text-neutral-500">
        No use cases yet. Start from a template rather than a blank page.
      </p>
      <p className="text-xs text-neutral-400 mt-2 font-mono">TODO: offer 3–4 starter templates here</p>
    </div>
  );
}
