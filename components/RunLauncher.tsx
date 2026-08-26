'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UseCase, Source, RunMode } from '@/lib/types';

/**
 * C3 — Launch a run. Design doc §5.
 *
 * Flip this to false once /v1/stream_summarize, the RTVI service and the
 * C4b session screen exist. The server guards this too (501 in
 * app/api/runs/route.ts) — this constant only controls the UI affordance.
 */
const LIVE_AVAILABLE = false;

export default function RunLauncher({
  useCase,
  sources,
}: {
  useCase: UseCase;
  sources: Source[];
}) {
  const router = useRouter();

  const initialMode: RunMode = useCase.supportsRecorded ? 'recorded' : 'live';
  const [mode, setMode] = useState<RunMode>(initialMode);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sourceList, setSourceList] = useState<Source[]>(sources);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isNvidiaHosted = process.env.NEXT_PUBLIC_VSS_MODE === 'nvidia-hosted';

  /**
   * In nvidia-hosted mode, lib/vss/nvidiaHosted.ts reads the video straight
   * off disk using vstSensorId as the file path — a source registered
   * before switching into this mode only has the mock's fake
   * "mock-upload-*" placeholder there, not a real file. Picking one fails
   * with a real but confusing ffprobe error, so filter it out here instead.
   */
  function hasRealFile(s: Source): boolean {
    return Boolean(s.vstSensorId) && !s.vstSensorId!.startsWith('mock-upload-');
  }

  /** Live needs an online camera; recorded can use any source, except in
   * nvidia-hosted mode where it needs a source with a real file on disk. */
  function eligible(s: Source): boolean {
    if (mode === 'live') return s.kind === 'camera' && s.status === 'online';
    if (isNvidiaHosted && s.kind === 'upload') return hasRealFile(s);
    return true;
  }

  const selected = sourceList.find((s) => s.id === sourceId) ?? null;
  const canStart = Boolean(selected && eligible(selected)) && !busy
    && (mode === 'recorded' ? useCase.supportsRecorded : useCase.supportsLive && LIVE_AVAILABLE);

  /**
   * In nvidia-hosted mode the file's actual bytes are sent to
   * /api/sources/upload and saved server-side, so lib/vss/nvidiaHosted.ts
   * has something real to extract frames from. Otherwise (mock, or real VSS
   * without a VST deployment) only the filename is registered — see
   * lib/store's createSource.
   */
  async function addUploadSource(file: File) {
    setUploadBusy(true);
    setUploadError(null);
    try {
      const useRealUpload = process.env.NEXT_PUBLIC_VSS_MODE === 'nvidia-hosted';
      const res = useRealUpload
        ? await fetch('/api/sources/upload', {
            method: 'POST',
            body: (() => {
              const form = new FormData();
              form.set('file', file);
              form.set('name', file.name);
              return form;
            })(),
          })
        : await fetch('/api/sources', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: file.name }),
          });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'could not add source');
      setSourceList((prev) => [...prev, body.data]);
      setSourceId(body.data.id);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploadBusy(false);
    }
  }

  async function start() {
    if (!sourceId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useCaseId: useCase.id, sourceId, mode }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'could not start run');
      router.push('/runs');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── mode ─────────────────────────────────────────────────────── */}
      <p className="text-xs font-semibold mb-2">Mode</p>
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        <ModeCard
          title="Recorded"
          detail="Analyse a video that already exists"
          active={mode === 'recorded'}
          disabled={!useCase.supportsRecorded}
          disabledReason={`"${useCase.name}" has no recorded instructions`}
          onClick={() => { setMode('recorded'); setSourceId(null); }}
        />
        <ModeCard
          title="Live"
          detail="Watch a camera feed as it happens"
          active={mode === 'live'}
          disabled={!useCase.supportsLive || !LIVE_AVAILABLE}
          disabledReason={
            !useCase.supportsLive
              ? `"${useCase.name}" has no live instructions — add them in Edit`
              : 'Live monitoring is not wired up yet'
          }
          onClick={() => { setMode('live'); setSourceId(null); }}
        />
      </div>

      {/* ── source ───────────────────────────────────────────────────── */}
      <p className="text-xs font-semibold mb-2">Source</p>
      {sourceList.length === 0 && (
        <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center mb-3">
          <p className="text-sm text-neutral-500">No sources yet.</p>
        </div>
      )}
      {mode === 'recorded' && (
        <div className="mb-3">
          <label className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 px-3.5 py-2.5 text-sm cursor-pointer hover:border-neutral-400">
            <span>📁</span>
            <span className="font-medium">{uploadBusy ? 'Adding…' : 'Upload a video'}</span>
            <input
              type="file" accept="video/*" className="hidden" disabled={uploadBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) addUploadSource(file);
                e.target.value = '';
              }}
            />
          </label>
          <p className="text-[11px] text-neutral-400 mt-1">
            {process.env.NEXT_PUBLIC_VSS_MODE === 'nvidia-hosted'
              ? 'Uploads the real file for analysis by a real NVIDIA-hosted model — no VSS deployment involved.'
              : 'No VST deployment is connected yet, so this registers the file as a source for the mock backend — no bytes leave your browser.'}
          </p>
          {uploadError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{uploadError}</p>}
        </div>
      )}
      {sourceList.length > 0 && (
        <div className="space-y-1.5 mb-6">
          {sourceList.map((s) => {
            const ok = eligible(s);
            return (
              <button
                key={s.id}
                type="button"
                disabled={!ok}
                title={!ok && isNvidiaHosted && !hasRealFile(s)
                  ? 'Registered before nvidia-hosted mode was on — no real file on disk. Re-upload it.'
                  : undefined}
                onClick={() => setSourceId(s.id)}
                className={`w-full flex items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left transition-colors ${
                  sourceId === s.id
                    ? 'border-blue-600 ring-1 ring-blue-600'
                    : 'border-neutral-200 dark:border-neutral-800'
                } ${ok ? 'hover:border-neutral-400' : 'opacity-40 cursor-not-allowed'}`}
              >
                <span className="text-sm">{s.kind === 'camera' ? '🎥' : '📁'}</span>
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                <StatusDot status={s.status} />
                <span className="text-[10px] font-mono uppercase text-neutral-400 w-14 text-right">
                  {s.status}
                </span>
              </button>
            );
          })}
          {mode === 'live' && (
            <p className="text-[11px] text-neutral-400 pt-1">
              Live monitoring needs an online camera — uploaded files and offline cameras are unavailable.
            </p>
          )}
          {mode === 'recorded' && isNvidiaHosted && sourceList.some((s) => s.kind === 'upload' && !hasRealFile(s)) && (
            <p className="text-[11px] text-neutral-400 pt-1">
              Greyed-out sources were registered before nvidia-hosted mode was on and have no real file on disk — upload again to use them here.
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={start}
          disabled={!canStart}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Starting…' : `Start ${mode} run`}
        </button>
        <button
          onClick={() => router.push('/use-cases')}
          className="rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ModeCard({
  title, detail, active, disabled, disabledReason, onClick,
}: {
  title: string; detail: string; active: boolean;
  disabled?: boolean; disabledReason?: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        active && !disabled
          ? 'border-blue-600 ring-1 ring-blue-600'
          : 'border-neutral-200 dark:border-neutral-800'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-neutral-400'}`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">
        {disabled ? disabledReason : detail}
      </div>
    </button>
  );
}

function StatusDot({ status }: { status: Source['status'] }) {
  const color =
    status === 'online' ? 'bg-emerald-500'
    : status === 'error' ? 'bg-red-500'
    : 'bg-neutral-300 dark:bg-neutral-600';
  return <span className={`w-1.5 h-1.5 rounded-full ${color}`} />;
}
