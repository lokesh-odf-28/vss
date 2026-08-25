import type {
  UseCase, UseCaseInput, Run, Source, User, UserWithSecret, AuthContext,
  Incident, Severity, SignUpInput, CreateOtpChallengeInput, OtpChallengeRow, OtpPurpose,
} from '../types';
import { slugify } from '../slug';
import { seedUseCases, seedSources } from '../seed';

/**
 * In-memory store so `npm run dev` works with zero setup.
 *
 * ORG SCOPING mirrors postgres.ts: every stored use case, source and run is
 * tagged internally with the org that owns it, and every exported read/write
 * filters on it. Seed fixtures all belong to DEV_ORG_ID so the existing dev
 * login keeps seeing them; anything created via signup gets its own org and
 * starts with nothing, same as it would against Postgres.
 *
 * SWAP POINT: this whole file exists so `npm run dev` needs zero setup.
 * Once DATABASE_URL is set, lib/store/index.ts routes here never run.
 *
 * Note: module state resets on hot reload in dev.
 */

const DEV_ORG_ID = 'org-dev';

type Tagged<T> = T & { _orgId: string };
type OtpChallengeEntry = OtpChallengeRow & { purpose: OtpPurpose };

/**
 * Cached on globalThis, same reasoning as lib/db.ts's pool and
 * lib/vss/mock.ts's job map: Next's dev server does not reliably share a
 * module's top-level state between different route handler files, so
 * without this, e.g. a use case created via one route can be invisible to a
 * read from another. Harmless in production (module state doesn't fragment
 * there) but this store only exists for zero-setup dev in the first place.
 */
declare global {
  // eslint-disable-next-line no-var
  var __vi_mem_state: {
    useCases: Map<string, Tagged<UseCase>>;
    sources: Map<string, Tagged<Source>>;
    runs: Map<string, Tagged<Run>>;
    incidents: Map<string, Incident>;
    otpChallenges: Map<string, OtpChallengeEntry>;
    users: Map<string, UserWithSecret>;
  } | undefined;
}

const memState = globalThis.__vi_mem_state ?? (globalThis.__vi_mem_state = {
  useCases: new Map<string, Tagged<UseCase>>(
    seedUseCases.map((u) => [u.id, { ...u, _orgId: DEV_ORG_ID }]),
  ),
  sources: new Map<string, Tagged<Source>>(
    seedSources.map((s) => [s.id, { ...s, _orgId: DEV_ORG_ID }]),
  ),
  runs: new Map<string, Tagged<Run>>(),
  incidents: new Map<string, Incident>(),
  otpChallenges: new Map<string, OtpChallengeEntry>(),
  users: new Map<string, UserWithSecret>(),
});
const { useCases, sources, runs, incidents, otpChallenges } = memState;
const otpKey = (purpose: OtpPurpose, email: string) => `${purpose}:${email.toLowerCase()}`;

function strip<T extends { _orgId: string }>({ _orgId, ...rest }: T): Omit<T, '_orgId'> {
  return rest;
}

// ── users ────────────────────────────────────────────────────────────────
// One dev fixture (password 'password123', pre-hashed since this module
// initialises synchronously) plus whatever signup adds at runtime.
const devUser: UserWithSecret = {
  id: 'user-dev',
  orgId: DEV_ORG_ID,
  email: 'lokesh@opendatafabric.com',
  name: 'Lokesh',
  role: 'owner',
  status: 'active',
  passwordHash:
    'scrypt$tp+Go5jk7omgbcn1Dj5tkw==$+83kJbhqabMOLfygc1/QknLE1R5SErNYo6Z6mt95sXthqz5KRsdR8XJaIZ/pU/rTzgPT+5xVxQ2UCo+fuDSkIQ==',
};
const users = memState.users;
if (!users.has(devUser.id)) users.set(devUser.id, devUser);

export async function getUserByEmail(email: string): Promise<UserWithSecret | null> {
  const lower = email.toLowerCase();
  return [...users.values()].find((u) => u.email.toLowerCase() === lower) ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const u = users.get(id);
  if (!u) return null;
  const { passwordHash, ...user } = u;
  return user;
}

/** Mirrors postgres.ts: one org + its one user, or neither. */
export async function createOrgAndUser(input: SignUpInput): Promise<User> {
  const id = `user-${Math.random().toString(36).slice(2, 10)}`;
  const orgId = `org-${Math.random().toString(36).slice(2, 10)}`;
  const user: UserWithSecret = {
    id, orgId, email: input.email, name: input.name,
    role: 'owner', status: 'active', passwordHash: input.passwordHash,
  };
  users.set(id, user);
  const { passwordHash, ...safe } = user;
  return safe;
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  const u = users.get(userId);
  if (u) users.set(userId, { ...u, passwordHash });
}

// ── otp challenges ───────────────────────────────────────────────────────

export async function createOtpChallenge(input: CreateOtpChallengeInput): Promise<void> {
  otpChallenges.set(otpKey(input.purpose, input.email), {
    purpose: input.purpose,
    otpHash: input.otpHash,
    attempts: 0,
    expiresAt: input.expiresAt,
    orgName: input.orgName,
    name: input.name,
    passwordHash: input.passwordHash,
    userId: input.userId,
  });
}

export async function getOtpChallenge(purpose: OtpPurpose, email: string): Promise<OtpChallengeRow | null> {
  return otpChallenges.get(otpKey(purpose, email)) ?? null;
}

export async function incrementOtpAttempts(purpose: OtpPurpose, email: string): Promise<void> {
  const c = otpChallenges.get(otpKey(purpose, email));
  if (c) c.attempts += 1;
}

export async function deleteOtpChallenge(purpose: OtpPurpose, email: string): Promise<void> {
  otpChallenges.delete(otpKey(purpose, email));
}

// ── use cases ────────────────────────────────────────────────────────────

export async function listUseCases(orgId: string): Promise<UseCase[]> {
  return [...useCases.values()]
    .filter((u) => u._orgId === orgId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(strip);
}

export async function getUseCase(id: string, orgId: string): Promise<UseCase | null> {
  const u = useCases.get(id);
  return u && u._orgId === orgId ? strip(u) : null;
}

/**
 * Events are matched by `code`, not array position — a missing id means
 * "new event", a present id means "keep this one" even if its label or
 * severity changed. Anything not resubmitted is dropped. Mirrors the
 * Postgres store's diff so both backends behave identically. See
 * db/schema.sql: alert_rule.use_case_event_id cascades on delete, which is
 * why dropping an event silently removes any alert rules built on it.
 */
export async function saveUseCase(id: string, orgId: string, input: UseCaseInput): Promise<UseCase | null> {
  const existing = useCases.get(id);
  if (!existing || existing._orgId !== orgId) return null;

  const byCode = new Map(existing.events.map((e) => [e.code, e]));
  const events = input.events.map((e) => ({
    id: e.id ?? byCode.get(e.code)?.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`,
    code: e.code,
    label: e.label,
    severity: e.severity,
  }));

  const next: Tagged<UseCase> = {
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
  return strip(next);
}

export async function createUseCase(input: UseCaseInput, ctx: AuthContext): Promise<UseCase> {
  const id = `uc-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const uc: Tagged<UseCase> = {
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
    _orgId: ctx.orgId,
  };
  useCases.set(id, uc);
  return strip(uc);
}

// ── sources ──────────────────────────────────────────────────────────────

export async function listSources(orgId: string): Promise<Source[]> {
  return [...sources.values()].filter((s) => s._orgId === orgId).map(strip);
}

export async function getSource(id: string, orgId: string): Promise<Source | null> {
  const s = sources.get(id);
  return s && s._orgId === orgId ? strip(s) : null;
}

/** Mirrors postgres.ts: registers an "upload" source with no real VST behind it. */
export async function createSource(orgId: string, name: string): Promise<Source> {
  const id = `src-${Math.random().toString(36).slice(2, 10)}`;
  const s: Tagged<Source> = {
    id, name, kind: 'upload', status: 'online',
    vstSensorId: `mock-upload-${Math.random().toString(36).slice(2, 10)}`,
    _orgId: orgId,
  };
  sources.set(id, s);
  return strip(s);
}

// ── runs ─────────────────────────────────────────────────────────────────

export async function listRuns(orgId: string): Promise<Run[]> {
  return [...runs.values()]
    .filter((r) => r._orgId === orgId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(strip);
}

export async function getRun(id: string, orgId: string): Promise<Run | null> {
  const r = runs.get(id);
  return r && r._orgId === orgId ? strip(r) : null;
}

/**
 * No orgId parameter, deliberately — mirrors postgres.ts. By the time a
 * route can construct a Run, it already resolved useCaseId/sourceId through
 * getUseCase()/getSource() scoped to the caller's org, so the org here is
 * derived from the use case rather than trusted from the caller.
 */
export async function createRun(r: Run): Promise<Run> {
  const owner = useCases.get(r.useCaseId);
  const _orgId = owner?._orgId ?? 'unknown';
  runs.set(r.id, { ...r, _orgId });
  return r;
}

export async function updateRun(id: string, patch: Partial<Run>): Promise<Run | null> {
  const cur = runs.get(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  runs.set(id, next);
  return strip(next);
}

// ── incidents ────────────────────────────────────────────────────────────

export async function listIncidentsByRun(runId: string): Promise<Incident[]> {
  return [...incidents.values()]
    .filter((i) => i.runId === runId)
    .sort((a, b) => a.offsetMs - b.offsetMs);
}

export interface NewIncident {
  sourceId: string;
  runId: string;
  useCaseId: string;
  offsetMs: number;
  eventCode: string;
  severity: Severity;
  description: string;
  objectIds: string[];
}

export async function createIncidents(items: NewIncident[]): Promise<number> {
  for (const i of items) {
    const id = `inc-${Math.random().toString(36).slice(2, 10)}`;
    incidents.set(id, {
      id,
      sourceId: i.sourceId,
      runId: i.runId,
      offsetMs: i.offsetMs,
      eventCode: i.eventCode,
      severity: i.severity,
      description: i.description,
      verdict: 'unverified',
      thumbnailUrl: null,
    });
  }
  return items.length;
}

/** Mirrors the Postgres guard: only the first caller to see a finished job wins. */
export async function completeRunWithIncidents(
  id: string, summary: string, items: Omit<NewIncident, 'runId'>[],
): Promise<Run | null> {
  const cur = runs.get(id);
  if (!cur || cur.status !== 'processing') return null;

  // Single-threaded, so status flip and insert cannot interleave.
  const next: Tagged<Run> = {
    ...cur,
    status: 'complete',
    analysisPercent: 100,
    summary,
    finishedAt: new Date().toISOString(),
    incidentCount: items.length,
  };
  runs.set(id, next);
  await createIncidents(items.map((i) => ({ ...i, runId: id })));
  return strip(next);
}
