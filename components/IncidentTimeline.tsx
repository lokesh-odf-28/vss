'use client';

import { useState } from 'react';
import type { Incident } from '@/lib/types';

/**
 * The core interaction from the design doc: hours of footage reduced to a
 * handful of clickable moments. Selecting a row is what a real player would
 * seek to — there is no <video> element yet because nothing has actually
 * been uploaded (see the upload gap), so selection is shown but inert.
 */
export default function IncidentTimeline({ incidents }: { incidents: Incident[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  if (incidents.length === 0) {
    // A clean run is a good outcome, not an empty screen. Design doc §6.
    return (
      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-8 text-center">
        <p className="text-sm font-medium">No incidents found</p>
        <p className="text-xs text-neutral-500 mt-1">
          The footage was analysed and nothing matched this use case.
        </p>
      </div>
    );
  }

  const counts = incidents.reduce<Record<string, number>>((acc, i) => {
    acc[i.severity] = (acc[i.severity] ?? 0) + 1;
    return acc;
  }, {});

  const shown = severityFilter === 'all'
    ? incidents
    : incidents.filter((i) => i.severity === severityFilter);

  const maxOffset = Math.max(...incidents.map((i) => i.offsetMs), 1);

  return (
    <div>
      {/* scrub bar — position and colour carry severity at a glance */}
      <div className="relative h-8 mb-4">
        <div className="absolute inset-x-0 top-3 h-1.5 rounded bg-neutral-200 dark:bg-neutral-800" />
        {incidents.map((i) => (
          <button
            key={i.id}
            onClick={() => setSelectedId(i.id)}
            title={`${formatOffset(i.offsetMs)} — ${i.description}`}
            style={{ left: `${(i.offsetMs / maxOffset) * 96}%` }}
            className={`absolute top-1.5 w-1 h-4 rounded-sm transition-transform ${dotColor(i.severity)} ${
              selectedId === i.id ? 'scale-y-150' : ''
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <FilterChip label={`All ${incidents.length}`} active={severityFilter === 'all'}
          onClick={() => setSeverityFilter('all')} />
        {(['high', 'medium', 'low'] as const).map((s) =>
          counts[s] ? (
            <FilterChip key={s} label={`${s} ${counts[s]}`} active={severityFilter === s}
              onClick={() => setSeverityFilter(s)} />
          ) : null,
        )}
      </div>

      <ul className="rounded-xl border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
        {shown.map((i) => (
          <li key={i.id}>
            <button
              onClick={() => setSelectedId(i.id)}
              className={`w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 ${
                selectedId === i.id ? 'bg-blue-50 dark:bg-blue-950' : ''
              }`}
            >
              <span className="font-mono text-xs text-blue-700 dark:text-blue-400 pt-0.5 w-16 shrink-0">
                {formatOffset(i.offsetMs)}
              </span>
              <SeverityChip severity={i.severity} />
              <span className="flex-1 text-sm">{i.description}</span>
              <VerdictChip verdict={i.verdict} />
            </button>
          </li>
        ))}
      </ul>

      <p className="text-[11px] text-neutral-400 mt-2">
        Timestamps will seek the player once video upload is wired up.
      </p>
    </div>
  );
}

function formatOffset(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function dotColor(severity: string): string {
  return severity === 'high' ? 'bg-red-600'
    : severity === 'medium' ? 'bg-amber-500'
    : severity === 'low' ? 'bg-emerald-600'
    : 'bg-neutral-400';
}

function SeverityChip({ severity }: { severity: string }) {
  const cls = severity === 'high'
    ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
    : severity === 'medium'
    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300';
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-mono uppercase ${cls}`}>
      {severity}
    </span>
  );
}

function VerdictChip({ verdict }: { verdict: string }) {
  if (verdict === 'unverified') {
    return <span className="shrink-0 text-[9px] font-mono uppercase text-neutral-400">unverified</span>;
  }
  const cls = verdict === 'confirmed' ? 'text-emerald-600' : 'text-neutral-400 line-through';
  return <span className={`shrink-0 text-[9px] font-mono uppercase ${cls}`}>{verdict}</span>;
}

function FilterChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[10px] font-mono uppercase border ${
        active
          ? 'border-neutral-900 dark:border-neutral-100 font-semibold'
          : 'border-neutral-200 dark:border-neutral-800 text-neutral-500'
      }`}
    >
      {label}
    </button>
  );
}
