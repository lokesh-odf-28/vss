import type { UseCase, Run, Source } from '../types';
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

export async function saveUseCase(uc: UseCase): Promise<UseCase> {
  const next = { ...uc, updatedAt: new Date().toISOString() };
  useCases.set(next.id, next);
  return next;
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
