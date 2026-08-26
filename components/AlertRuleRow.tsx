'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AlertRule } from '@/lib/types';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './Toast';

export default function AlertRuleRow({ rule }: { rule: AlertRule }) {
  const router = useRouter();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/alert-rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'could not update rule');
      }
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: 'Delete alert rule?',
      message: `${rule.eventLabel} on ${rule.sourceName} will stop paging anyone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/alert-rules/${rule.id}`, { method: 'DELETE' });
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
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900">
      <span className="flex-1 truncate">
        <span className="font-medium">{rule.useCaseName}</span>
        <span className="text-neutral-400 mx-1.5">›</span>
        {rule.eventLabel}
        <span className="text-neutral-400 mx-1.5">›</span>
        <span className="font-mono text-xs text-neutral-500">{rule.sourceName}</span>
      </span>
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase border transition-colors disabled:opacity-50 ${
          rule.enabled
            ? 'border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950'
            : 'border-neutral-300 dark:border-neutral-700 text-neutral-400 hover:border-neutral-400'
        }`}
      >
        {rule.enabled ? 'on' : 'off'}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="rounded-md border border-neutral-200 dark:border-neutral-700 px-2.5 py-1 text-xs text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50 disabled:hover:bg-transparent"
      >
        Delete
      </button>
    </div>
  );
}
