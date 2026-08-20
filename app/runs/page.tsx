'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Run } from '@/lib/types';

/** C4a — Recorded run. Two separate progress phases. Design doc §7.1–7.2. */
export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;

    async function tick() {
      const res = await fetch('/api/runs', { cache: 'no-store' });
      const { data } = await res.json();
      if (!alive) return;
      setRuns(data);
      setLoaded(true);

      // Poll each in-flight run. A background worker should take this over
      // once runs need to finish with the tab closed.
      await Promise.all(
        (data as Run[])
          .filter((r) => r.status === 'processing')
          .map((r) => fetch(`/api/runs/${r.id}`, { cache: 'no-store' })),
      );
    }

    tick();
    const iv = setInterval(tick, 2000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const active = runs.filter((r) => r.status === 'processing' || r.status === 'uploading');
  const recent = runs.filter((r) => !active.includes(r));

  return (
    <div className="p-6">
      <header className="mb-5">
        <h1 className="text-lg font-semibold">Runs</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Analysis happens in the background. You can close this page and come back.
        </p>
      </header>

      {!loaded && <p className="text-sm text-neutral-400">Loading…</p>}
      {loaded && runs.length === 0 && (
        <p className="text-sm text-neutral-500">
          No runs yet. Start one from <Link href="/use-cases" className="underline">Use Cases</Link>.
        </p>
      )}

      {active.map((r) => (
        <div key={r.id} className="rounded-xl border-2 border-blue-600 p-4 mb-3 bg-white dark:bg-neutral-900">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-semibold text-sm">{r.sourceName}</div>
              <div className="text-[11px] font-mono text-neutral-400 mt-0.5">
                {r.useCaseName} · {r.mode}
              </div>
            </div>
            <span className="rounded bg-blue-50 dark:bg-blue-950 px-2 py-0.5 text-[9px] font-mono uppercase text-blue-700 dark:text-blue-300">
              {r.status}
            </span>
          </div>

          <Phase label="1 · Upload"   value={r.uploadPercent}   note="complete" done />
          <Phase label="2 · Analysis" value={r.analysisPercent} note={`${r.analysisPercent}%`} />

          <p className="text-[11px] text-neutral-400 mt-3">
            You will be notified when this finishes. Safe to leave this page.
          </p>
        </div>
      ))}

      {recent.length > 0 && (
        <>
          <div className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 mt-6 mb-1.5">
            Recent
          </div>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
            {recent.map((r) => (
              <Link
                key={r.id}
                href={`/runs/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <StatusChip status={r.status} />
                <span className="flex-1 truncate">{r.sourceName}</span>
                <span className="text-[11px] font-mono text-neutral-400">{r.useCaseName}</span>
                <span className="text-[11px] font-mono text-neutral-400">
                  {r.status === 'complete' ? `${r.incidentCount} incidents` : r.errorMessage ?? ''}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Phase({ label, value, note, done }: { label: string; value: number; note: string; done?: boolean }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="flex justify-between text-[11px] mb-1">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-neutral-500">{note}</span>
      </div>
      <div className="h-1.5 rounded bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
        <div
          className={`h-full rounded ${done ? 'bg-emerald-600' : 'bg-blue-600'}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: Run['status'] }) {
  const map: Record<string, string> = {
    complete: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    failed:   'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
    queued:   'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  };
  return (
    <span className={`rounded px-2 py-0.5 text-[9px] font-mono uppercase ${map[status] ?? 'bg-neutral-100 text-neutral-500'}`}>
      {status}
    </span>
  );
}
