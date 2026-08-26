'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

/** Entry point for deleting a use case from C1. No delete path existed
 * anywhere before this — the API route is app/api/use-cases/[id]/route.ts. */
export default function DeleteUseCaseButton({
  useCaseId, useCaseName,
}: { useCaseId: string; useCaseName: string }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const ok = await confirm({
      title: `Delete "${useCaseName}"?`,
      message: `This also deletes its runs and can't be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/use-cases/${useCaseId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'delete failed');
      }
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={busy}
      className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 disabled:hover:bg-transparent"
    >
      {busy ? 'Deleting…' : 'Delete'}
    </button>
  );
}
