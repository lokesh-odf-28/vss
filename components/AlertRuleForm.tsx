'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UseCase, Source } from '@/lib/types';

/** Creates one alert rule: use case event + camera. No delete-anywhere gap
 * this time — see components/AlertRuleRow.tsx for toggle/delete. */
export default function AlertRuleForm({
  useCases, sources,
}: { useCases: UseCase[]; sources: Source[] }) {
  const router = useRouter();
  const [useCaseId, setUseCaseId] = useState('');
  const [eventId, setEventId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const useCase = useCases.find((u) => u.id === useCaseId) ?? null;

  async function create() {
    if (!useCaseId || !eventId || !sourceId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/alert-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useCaseId, useCaseEventId: eventId, sourceId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'could not create rule');
      setUseCaseId('');
      setEventId('');
      setSourceId('');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4">
      <p className="text-xs font-semibold mb-3">New alert rule</p>
      {error && (
        <div className="mb-3 rounded-lg bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="arSelect"
          value={useCaseId}
          onChange={(e) => { setUseCaseId(e.target.value); setEventId(''); }}
        >
          <option value="">Use case…</option>
          {useCases.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <span className="text-neutral-400 text-xs">›</span>
        <select
          className="arSelect"
          value={eventId}
          disabled={!useCase}
          onChange={(e) => setEventId(e.target.value)}
        >
          <option value="">Event…</option>
          {useCase?.events.map((ev) => <option key={ev.id} value={ev.id}>{ev.label}</option>)}
        </select>
        <span className="text-neutral-400 text-xs">›</span>
        <select
          className="arSelect"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          <option value="">Camera…</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button
          onClick={create}
          disabled={busy || !useCaseId || !eventId || !sourceId}
          className="rounded-md bg-blue-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 disabled:hover:bg-blue-700"
        >
          {busy ? 'Adding…' : '＋ Add rule'}
        </button>
      </div>

      <style jsx global>{`
        .arSelect {
          border: 1px solid rgb(212 212 212 / 1);
          border-radius: 6px;
          padding: 7px 9px;
          font-size: 13px;
          background: transparent;
        }
        .dark .arSelect { border-color: rgb(64 64 64 / 1); }
        .arSelect:focus { outline: 2px solid rgb(29 78 216); outline-offset: -1px; }
      `}</style>
    </div>
  );
}
