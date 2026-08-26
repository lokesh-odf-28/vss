'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UseCase, UseCaseInput, UseCaseEventInput, Severity } from '@/lib/types';

/**
 * C2 — Create / edit use case. Design doc §6.
 *
 * The critical constraint from the design doc: this must never read like a
 * prompt editor. No "prompt", "model" or "AI" anywhere in the copy — a
 * warehouse supervisor fills this in using words they already use at work.
 * Internally these five sections map straight onto the four VSS subsystems
 * (design doc §2); Alert rules (D3) are out of scope for this cut — event
 * severity, captured here, is what D3 will consume later.
 */

const EMPTY: UseCaseInput = {
  name: '',
  icon: '🎥',
  description: '',
  scenario: '',
  objectsOfInterest: [],
  events: [],
  recordedPrompt: '',
  recordedSystemPrompt: '',
  livePrompt: '',
  liveSystemPrompt: '',
  verificationCriteria: '',
  supportsRecorded: true,
  supportsLive: false,
};

function toInput(uc: UseCase): UseCaseInput {
  return {
    name: uc.name,
    icon: uc.icon,
    description: uc.description,
    scenario: uc.scenario,
    objectsOfInterest: uc.objectsOfInterest,
    events: uc.events,
    recordedPrompt: uc.recordedPrompt,
    recordedSystemPrompt: uc.recordedSystemPrompt,
    livePrompt: uc.livePrompt,
    liveSystemPrompt: uc.liveSystemPrompt,
    verificationCriteria: uc.verificationCriteria,
    supportsRecorded: uc.supportsRecorded,
    supportsLive: uc.supportsLive,
  };
}

export default function UseCaseForm({ existing }: { existing?: UseCase }) {
  const router = useRouter();
  const [form, setForm] = useState<UseCaseInput>(existing ? toInput(existing) : EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof UseCaseInput>(key: K, value: UseCaseInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // A row left over from an unused "add event" click has no label and
      // no code — drop it rather than making the user delete it by hand or
      // bouncing off the server's "every event needs a name" check for
      // something they never meant to fill in.
      const payload: UseCaseInput = {
        ...form,
        events: form.events.filter((e) => e.label.trim() || e.code.trim()),
      };
      const url = existing ? `/api/use-cases/${existing.id}` : '/api/use-cases';
      const res = await fetch(url, {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'save failed');
      router.push('/use-cases');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950 px-4 py-2.5 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <Section n={1} title="Identity">
        <div className="flex gap-3">
          <Field label="Icon" className="w-20">
            <input
              className="input text-center text-lg"
              value={form.icon}
              maxLength={2}
              onChange={(e) => set('icon', e.target.value)}
            />
          </Field>
          <Field label="Name" className="flex-1">
            <input
              className="input"
              value={form.name}
              placeholder="e.g. Warehouse Safety"
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Description">
          <input
            className="input"
            value={form.description}
            placeholder="One line — shown on the use case card"
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
      </Section>

      <Section n={2} title="Scene" hint="What the camera sees">
        <Field label="What is the camera looking at?" hint="One plain sentence — everything else is judged against this.">
          <textarea
            className="input min-h-[64px]"
            value={form.scenario}
            placeholder="A warehouse floor with forklifts, pallet stacks and personnel moving between loading bays."
            onChange={(e) => set('scenario', e.target.value)}
          />
        </Field>
        <Field label="Objects that matter">
          <TagInput
            values={form.objectsOfInterest}
            placeholder="e.g. forklift, worker, helmet"
            onChange={(v) => set('objectsOfInterest', v)}
          />
        </Field>
        <Field label="Events to flag, and how serious">
          <EventEditor events={form.events} onChange={(v) => set('events', v)} />
        </Field>
      </Section>

      <Section n={3} title="Recorded behaviour" hint="For uploaded video">
        <Field label="What should a summary emphasise?">
          <textarea
            className="input min-h-[52px]"
            value={form.recordedPrompt}
            placeholder="Summarize any safety-relevant events, with timestamps."
            onChange={(e) => set('recordedPrompt', e.target.value)}
          />
        </Field>
        <Field label="Anything else it should always keep in mind?" hint="Optional — a standing instruction, not a one-off request.">
          <textarea
            className="input min-h-[52px]"
            value={form.recordedSystemPrompt}
            placeholder="You are a safety compliance monitor for a warehouse floor…"
            onChange={(e) => set('recordedSystemPrompt', e.target.value)}
          />
        </Field>
      </Section>

      <Section n={4} title="Live behaviour" hint="For a live camera feed">
        <Toggle
          label="Support live monitoring for this use case"
          checked={form.supportsLive}
          onChange={(v) => set('supportsLive', v)}
        />
        {form.supportsLive && (
          <>
            <Field label="What should it narrate as it happens?">
              <textarea
                className="input min-h-[52px]"
                value={form.livePrompt}
                placeholder="Narrate movement near the loading bays and call out proximity between vehicles and people."
                onChange={(e) => set('livePrompt', e.target.value)}
              />
            </Field>
            <Field label="Standing instruction for live mode" hint="Optional">
              <textarea
                className="input min-h-[52px]"
                value={form.liveSystemPrompt}
                onChange={(e) => set('liveSystemPrompt', e.target.value)}
              />
            </Field>
          </>
        )}
        <Toggle
          label="Support recorded (uploaded video) analysis"
          checked={form.supportsRecorded}
          onChange={(v) => set('supportsRecorded', v)}
        />
      </Section>

      <Section n={5} title="Verification" hint="What counts as a real detection">
        <Field label="When should a flagged event be treated as confirmed?">
          <textarea
            className="input min-h-[52px]"
            value={form.verificationCriteria}
            placeholder="Confirm only if a worker is clearly visible in frame and the hazard is unobstructed."
            onChange={(e) => set('verificationCriteria', e.target.value)}
          />
        </Field>
        <p className="text-xs text-neutral-400 mt-1">
          Alert rules (which cameras page someone, and how urgently) are configured separately,
          per camera — coming in a later screen. This severity list is what feeds that.
        </p>
      </Section>

      <div className="flex gap-2 mt-6">
        <button
          onClick={save}
          disabled={saving || !form.name.trim()}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50 disabled:hover:bg-blue-700"
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Create use case'}
        </button>
        <button
          onClick={() => router.push('/use-cases')}
          className="rounded-md border border-neutral-200 dark:border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"
        >
          Cancel
        </button>
      </div>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid rgb(212 212 212 / 1);
          border-radius: 6px;
          padding: 8px 11px;
          font-size: 13px;
          background: transparent;
        }
        .dark .input { border-color: rgb(64 64 64 / 1); }
        .input:focus { outline: 2px solid rgb(29 78 216); outline-offset: -1px; }

        /* These come after the base .input rule on purpose: same specificity
           as a Tailwind width utility, so whichever loads later in the
           cascade wins — and that used to be .input's width:100%, which made
           the severity <select> swallow the row and left the name <input>
           at its flex-basis of 0. Declaring the widths here, after .input,
           guarantees these win regardless of stylesheet load order. */
        .event-name { font-size: 14px; width: auto; }
        .event-severity { width: 108px; flex: 0 0 auto; }
      `}</style>
    </div>
  );
}

// ── layout helpers ──────────────────────────────────────────────────────

function Section({
  n, title, hint, children,
}: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-2.5 flex items-baseline justify-between">
        <div className="flex items-baseline gap-2.5">
          <span className="font-mono text-[10px] text-neutral-400">{n}</span>
          <span className="text-sm font-semibold">{title}</span>
        </div>
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      <div className="p-4 space-y-3.5 bg-white dark:bg-neutral-950">{children}</div>
    </div>
  );
}

function Field({
  label, hint, className, children,
}: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold mb-1">{label}</label>
      {hint && <p className="text-[11px] text-neutral-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-8 h-[18px] rounded-full relative transition-colors ${
          checked ? 'bg-blue-600' : 'bg-neutral-200 dark:bg-neutral-700'
        }`}
      >
        <span
          className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </button>
      {label}
    </label>
  );
}

// ── objects-of-interest chip input ───────────────────────────────────────

function TagInput({
  values, placeholder, onChange,
}: { values: string[]; placeholder?: string; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1.5">
      {values.map((v) => (
        <span
          key={v}
          className="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2.5 py-0.5 text-xs"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        placeholder={values.length ? 'add another…' : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
          if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={commit}
        className="flex-1 min-w-[100px] bg-transparent text-xs py-0.5 outline-none"
      />
    </div>
  );
}

// ── events + severity editor ──────────────────────────────────────────

const SEVERITIES: Severity[] = ['low', 'medium', 'high'];

function EventEditor({
  events, onChange,
}: { events: UseCaseEventInput[]; onChange: (v: UseCaseEventInput[]) => void }) {
  function update(i: number, patch: Partial<UseCaseEventInput>) {
    onChange(events.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function remove(i: number) {
    onChange(events.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...events, { code: '', label: '', severity: 'medium' }]);
  }

  return (
    <div className="space-y-1.5">
      {events.map((e, i) => (
        <div key={e.id ?? `new-${i}`} className="flex items-center gap-1.5">
          <input
            className="input event-name flex-1 min-w-0"
            value={e.label}
            placeholder="e.g. Forklift near worker"
            onChange={(ev) => {
              const label = ev.target.value;
              // code is what event_types/alert rules key on — keep it stable
              // and machine-friendly, derived from the label until touched.
              update(i, { label, code: e.code || label.toLowerCase().replace(/[^a-z0-9]+/g, '_') });
            }}
          />
          <select
            className="input event-severity"
            value={e.severity}
            onChange={(ev) => update(i, { severity: ev.target.value as Severity })}
          >
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-neutral-400 hover:text-red-600 px-1.5 text-sm flex-shrink-0"
            aria-label="Remove event"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="text-xs font-medium text-blue-700 dark:text-blue-400 mt-1"
      >
        ＋ add event
      </button>
    </div>
  );
}
