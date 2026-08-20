'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Starts a recorded run. Source is passed in — ids differ between memory and Postgres. */
export default function RunButton({
  useCaseId,
  sourceId,
}: {
  useCaseId: string;
  sourceId: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!sourceId) return alert('No online source available. Add a camera first (B3).');
    setBusy(true);
    try {
      // TODO (C3): let the user pick source + mode instead of defaulting.
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useCaseId, sourceId, mode: 'recorded' }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push('/runs');
    } catch (e) {
      alert(`Could not start run: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={start}
      disabled={busy || !sourceId}
      title={sourceId ? undefined : 'No online source'}
      className="rounded-md bg-neutral-900 dark:bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-white dark:text-neutral-900 disabled:opacity-40"
    >
      {busy ? '…' : 'Run ▸'}
    </button>
  );
}
