import type { UseCase, UseCaseInput, Run, Source } from '../types';
import { slugify } from '../slug';
import { seedUseCases, seedSources } from '../seed';

/**
 * In-memory store so `npm run dev` works with zero setup.
 *
 * SWAP POINT: replace the bodies below with SQL against db/schema.sql when you
 * are ready for Postgres (`npm run db:up && npm run db:schema`). Every caller
 * goes through this module, so nothing else in the app has to change.
 *
 * Note: module state resets on hot reload in dev. That is fine for a scaffold
 * and is exactly the pain that should push you to Postgres.
 */

const useCases = new Map<string, UseCase>(seedUseCases.map((u) => [u.id, u]));
const sources = new Map<string, Source>(seedSources.map((s) => [s.id, s]));
const runs = new Map<string, Run>();

// ── use cases ────────────────────────────────────────────────────────────
export async function listUseCases(): Promise<UseCase[]> {
  return [...useCases.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUseCase(id: string): Promise<UseCase | null> {
  return useCases.get(id) ?? null;
}

/**
 * Events are matched by `code`, not array position — a missing id means
 * "new event", a present id means "keep this one" even if its label or
 * severity changed. Anything not resubmitted is dropped. Mirrors the
 * Postgres store's diff so both backends behave identically. See
 * db/schema.sql: alert_rule.use_case_event_id cascades on delete, which is
 * why dropping an event silently removes any alert rules built on it.
 */
export async function saveUseCase(id: string, input: UseCaseInput): Promise<UseCase | null> {
  const existing = useCases.get(id);
  if (!existing) return null;

  const byCode = new Map(existing.events.map((e) => [e.code, e]));
  const events = input.events.map((e) => ({
    id: e.id ?? byCode.get(e.code)?.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`,
    code: e.code,
    label: e.label,
    severity: e.severity,
  }));

  const next: UseCase = {
    ...existing,
    name: input.name,
    icon: input.icon,
    description: input.description,
    scenario: input.scenario,
    objectsOfInterest: input.objectsOfInterest,
    events,
    recordedPrompt: input.recordedPrompt,
    recordedSystemPrompt: input.recordedSystemPrompt,
    livePrompt: input.livePrompt,
    liveSystemPrompt: input.liveSystemPrompt,
    verificationCriteria: input.verificationCriteria,
    supportsRecorded: input.supportsRecorded,
    supportsLive: input.supportsLive,
    updatedAt: new Date().toISOString(),
  };
  useCases.set(id, next);
  return next;
}

export async function createUseCase(input: UseCaseInput): Promise<UseCase> {
  const id = `uc-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const uc: UseCase = {
    id,
    slug: slugify(input.name),
    name: input.name,
    icon: input.icon || '🎥',
    description: input.description,
    scenario: input.scenario,
    objectsOfInterest: input.objectsOfInterest,
    events: input.events.map((e) => ({
      id: `evt-${Math.random().toString(36).slice(2, 10)}`,
      code: e.code,
      label: e.label,
      severity: e.severity,
    })),
    recordedPrompt: input.recordedPrompt,
    recordedSystemPrompt: input.recordedSystemPrompt,
    livePrompt: input.livePrompt,
    liveSystemPrompt: input.liveSystemPrompt,
    alertPrompt: '',
    alertSystemPrompt: '',
    verificationCriteria: input.verificationCriteria,
    supportsRecorded: input.supportsRecorded,
    supportsLive: input.supportsLive,
    alertRuleCount: 0,
    lastRunAt: null,
    updatedAt: now,
  };
  useCases.set(id, uc);
  return uc;
}

// ── sources ──────────────────────────────────────────────────────────────
export async function listSources(): Promise<Source[]> {
  return [...sources.values()];
}

export async function getSource(id: string): Promise<Source | null> {
  return sources.get(id) ?? null;
}

// ── runs ─────────────────────────────────────────────────────────────────
export async function listRuns(): Promise<Run[]> {
  return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getRun(id: string): Promise<Run | null> {
  return runs.get(id) ?? null;
}

export async function createRun(r: Run): Promise<Run> {
  runs.set(r.id, r);
  return r;
}

export async function updateRun(id: string, patch: Partial<Run>): Promise<Run | null> {
  const cur = runs.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  runs.set(id, next);
  return next;
}
