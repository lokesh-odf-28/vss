'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Entry point for deleting a use case from C1. No delete path existed
 * anywhere before this — the API route is app/api/use-cases/[id]/route.ts. */
export default function DeleteUseCaseButton({
  useCaseId, useCaseName,
}: { useCaseId: string; useCaseName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete "${useCaseName}"? This also deletes its runs and can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'delete failed');
      }
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 disabled:opacity-50"
    >
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
