import { q, withTransaction } from '../db';
import type {
  UseCase, UseCaseInput, Run, Source, User, UserWithSecret, AuthContext,
  Incident, Severity, SignUpInput, CreateOtpChallengeInput, OtpChallengeRow, OtpPurpose,
} from '../types';
import { slugify } from '../slug';

/**
 * Postgres-backed store. Schema: db/schema.sql
 *
 * ORG SCOPING: every exported read/write that touches use_case, source or run
 * takes an orgId and filters by it — the session's org, never a value the
 * client can supply. A row that exists but belongs to a different org
 * behaves exactly like a row that does not exist (404, not 403) so an id
 * cannot be used to probe what other organizations have.
 *
 * A few `*Raw` helpers below skip that filter deliberately — they are only
 * ever called on an id the caller already proved ownership of earlier in the
 * same request (e.g. completeRunWithIncidents re-reading a run right after
 * updating the row it was just handed). They are not exported.
 */

// ── mappers ──────────────────────────────────────────────────────────────

function toUseCase(r: any, events: any[]): UseCase {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    icon: r.icon ?? '🎥',
    description: r.description ?? '',
    scenario: r.scenario ?? '',
    objectsOfInterest: r.objects_of_interest ?? [],
    events: events
      .filter((e) => e.use_case_id === r.id)
      .map((e) => ({ id: e.id, code: e.code, label: e.label, severity: e.severity })),
    recordedPrompt: r.recorded_prompt ?? '',
    recordedSystemPrompt: r.recorded_system_prompt ?? '',
    livePrompt: r.live_prompt ?? '',
    liveSystemPrompt: r.live_system_prompt ?? '',
    alertPrompt: r.alert_prompt ?? '',
    alertSystemPrompt: r.alert_system_prompt ?? '',
    verificationCriteria: r.verification_criteria ?? '',
    supportsRecorded: r.supports_recorded,
    supportsLive: r.supports_live,
    alertRuleCount: Number(r.alert_rule_count ?? 0),
    lastRunAt: r.last_run_at ? new Date(r.last_run_at).toISOString() : null,
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

function toRun(r: any): Run {
  return {
    id: r.id,
    useCaseId: r.use_case_id,
    useCaseName: r.use_case_name ?? '',
    sourceId: r.source_id,
    sourceName: r.source_name ?? '',
    mode: r.mode,
    status: r.status,
    uploadPercent: r.upload_percent,
    analysisPercent: r.analysis_percent,
    externalJobId: r.external_job_id,
    summary: r.summary,
    errorMessage: r.error_message,
    startedAt: new Date(r.started_at).toISOString(),
    finishedAt: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    incidentCount: Number(r.incident_count ?? 0),
  };
}

function toUser(r: any): User {
  return { id: r.id, orgId: r.org_id, email: r.email, name: r.name, role: r.role, status: r.status };
}

function toIncident(r: any): Incident {
  return {
    id: r.id,
    sourceId: r.source_id,
    runId: r.run_id,
    offsetMs: r.offset_ms === null ? 0 : Number(r.offset_ms),
    eventCode: r.event_code ?? '',
    severity: r.severity,
    description: r.description,
    verdict: r.verdict,
    thumbnailUrl: r.thumbnail_url,
  };
}

const USE_CASE_SELECT = `
  SELECT u.*,
    (SELECT count(*) FROM alert_rule ar WHERE ar.use_case_id = u.id AND ar.enabled) AS alert_rule_count,
    (SELECT max(r.started_at) FROM run r WHERE r.use_case_id = u.id)                AS last_run_at
  FROM use_case u`;

// source has no org_id column directly — it belongs to a site, which belongs
// to an org. Every source query joins through site to scope by org.
const SOURCE_SELECT = `
  SELECT s.* FROM source s JOIN site st ON st.id = s.site_id`;

// run has no org_id column either — it belongs to a use_case, which does.
const RUN_SELECT = `
  SELECT r.*, u.name AS use_case_name, so.name AS source_name,
    (SELECT count(*) FROM incident i WHERE i.run_id = r.id) AS incident_count
  FROM run r
  JOIN use_case u ON u.id = r.use_case_id
  JOIN source   so ON so.id = r.source_id`;

// ── users ────────────────────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<UserWithSecret | null> {
  const rows = await q(`SELECT * FROM app_user WHERE lower(email) = lower($1)`, [email]);
  if (!rows.length) return null;
  return { ...toUser(rows[0]), passwordHash: rows[0].password_hash };
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await q(`SELECT * FROM app_user WHERE id = $1`, [id]);
  return rows.length ? toUser(rows[0]) : null;
}

/**
 * "org = user": one signup call creates both rows in a single transaction,
 * or neither does. Uniqueness is enforced by app_user's UNIQUE(email)
 * constraint — the caller catches the 23505.
 */
export async function createOrgAndUser(input: SignUpInput): Promise<User> {
  return withTransaction(async (tx) => {
    const org = await tx<{ id: string }>(
      `INSERT INTO organization (name, contact_email) VALUES ($1, $2) RETURNING id`,
      [input.orgName, input.email],
    );
    const orgId = org[0].id;

    const rows = await tx(
      `INSERT INTO app_user (org_id, email, name, role, status, onboarding_status, password_hash)
       VALUES ($1, $2, $3, 'owner', 'active', 'complete', $4)
       RETURNING *`,
      [orgId, input.email, input.name, input.passwordHash],
    );
    return toUser(rows[0]);
  });
}

export async function updateUserPassword(userId: string, passwordHash: string): Promise<void> {
  await q(`UPDATE app_user SET password_hash = $2 WHERE id = $1`, [userId, passwordHash]);
}

// ── otp challenges ───────────────────────────────────────────────────────
// Pure data access only — hashing, expiry policy and attempt limits live in
// lib/auth/otp.ts, same split as passwords (store returns a hash, the route
// or lib/auth compares it).

export async function createOtpChallenge(input: CreateOtpChallengeInput): Promise<void> {
  await q(
    `INSERT INTO otp_challenge (purpose, email, otp_hash, expires_at, org_name, name, password_hash, user_id, attempts)
     VALUES ($1, lower($2), $3, $4, $5, $6, $7, $8, 0)
     ON CONFLICT (email, purpose) DO UPDATE SET
       otp_hash = $3, expires_at = $4, org_name = $5, name = $6,
       password_hash = $7, user_id = $8, attempts = 0, created_at = now()`,
    [input.purpose, input.email, input.otpHash, input.expiresAt,
     input.orgName ?? null, input.name ?? null, input.passwordHash ?? null, input.userId ?? null],
  );
}

export async function getOtpChallenge(purpose: OtpPurpose, email: string): Promise<OtpChallengeRow | null> {
  const rows = await q(
    `SELECT * FROM otp_challenge WHERE email = lower($1) AND purpose = $2`,
    [email, purpose],
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    otpHash: r.otp_hash,
    attempts: r.attempts,
    expiresAt: new Date(r.expires_at).toISOString(),
    orgName: r.org_name ?? undefined,
    name: r.name ?? undefined,
    passwordHash: r.password_hash ?? undefined,
    userId: r.user_id ?? undefined,
  };
}

export async function incrementOtpAttempts(purpose: OtpPurpose, email: string): Promise<void> {
  await q(
    `UPDATE otp_challenge SET attempts = attempts + 1 WHERE email = lower($1) AND purpose = $2`,
    [email, purpose],
  );
}

export async function deleteOtpChallenge(purpose: OtpPurpose, email: string): Promise<void> {
  await q(`DELETE FROM otp_challenge WHERE email = lower($1) AND purpose = $2`, [email, purpose]);
}

// ── use cases ────────────────────────────────────────────────────────────

async function getUseCaseRaw(id: string): Promise<UseCase | null> {
  const rows = await q(`${USE_CASE_SELECT} WHERE u.id = $1`, [id]);
  if (!rows.length) return null;
  const events = await q(`SELECT * FROM use_case_event WHERE use_case_id = $1`, [id]);
  return toUseCase(rows[0], events);
}

export async function listUseCases(orgId: string): Promise<UseCase[]> {
  const rows = await q(`${USE_CASE_SELECT} WHERE u.org_id = $1 ORDER BY u.name`, [orgId]);
  if (!rows.length) return [];
  const events = await q(
    `SELECT * FROM use_case_event WHERE use_case_id = ANY($1::uuid[])`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => toUseCase(r, events));
}

export async function getUseCase(id: string, orgId: string): Promise<UseCase | null> {
  const rows = await q(`${USE_CASE_SELECT} WHERE u.id = $1 AND u.org_id = $2`, [id, orgId]);
  if (!rows.length) return null;
  const events = await q(`SELECT * FROM use_case_event WHERE use_case_id = $1`, [id]);
  return toUseCase(rows[0], events);
}

/**
 * Events are matched by `code` via ON CONFLICT (use_case_id, code) — a
 * present event id from the client is accepted but not what drives the
 * match, the unique constraint is. Anything not resubmitted is deleted,
 * which cascades to alert_rule (schema.sql). One transaction so the use
 * case and its events never end up out of sync on a partial failure.
 */
export async function saveUseCase(id: string, orgId: string, input: UseCaseInput): Promise<UseCase | null> {
  const owns = await q(`SELECT 1 FROM use_case WHERE id = $1 AND org_id = $2`, [id, orgId]);
  if (!owns.length) return null;

  await withTransaction(async (tx) => {
    await tx(
      `UPDATE use_case SET
         name = $2, icon = $3, description = $4, scenario = $5, objects_of_interest = $6,
         recorded_prompt = $7, recorded_system_prompt = $8,
         live_prompt = $9, live_system_prompt = $10,
         verification_criteria = $11,
         supports_recorded = $12, supports_live = $13,
         updated_at = now()
       WHERE id = $1 AND org_id = $14`,
      [id, input.name, input.icon, input.description, input.scenario, input.objectsOfInterest,
       input.recordedPrompt, input.recordedSystemPrompt, input.livePrompt, input.liveSystemPrompt,
       input.verificationCriteria, input.supportsRecorded, input.supportsLive, orgId],
    );

    const keepCodes = input.events.map((e) => e.code);
    await tx(
      `DELETE FROM use_case_event WHERE use_case_id = $1 AND NOT (code = ANY($2::text[]))`,
      [id, keepCodes],
    );
    for (const e of input.events) {
      await tx(
        `INSERT INTO use_case_event (use_case_id, code, label, severity)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (use_case_id, code) DO UPDATE SET label = $3, severity = $4`,
        [id, e.code, e.label, e.severity],
      );
    }
  });

  return getUseCaseRaw(id);
}

export async function createUseCase(input: UseCaseInput, ctx: AuthContext): Promise<UseCase> {
  const slug = slugify(input.name);
  const id = await withTransaction(async (tx) => {
    const rows = await tx<{ id: string }>(
      `INSERT INTO use_case (
         org_id, site_id, slug, name, icon, description, scenario, objects_of_interest,
         recorded_prompt, recorded_system_prompt, live_prompt, live_system_prompt,
         verification_criteria, supports_recorded, supports_live
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING id`,
      // site_id null = org-wide. Guessing a site would be worse than
      // leaving it unscoped; B2 can narrow it later.
      [ctx.orgId, null, slug, input.name, input.icon || '🎥', input.description,
       input.scenario, input.objectsOfInterest, input.recordedPrompt, input.recordedSystemPrompt,
       input.livePrompt, input.liveSystemPrompt, input.verificationCriteria,
       input.supportsRecorded, input.supportsLive],
    );
    const newId = rows[0].id;
    for (const e of input.events) {
      await tx(
        `INSERT INTO use_case_event (use_case_id, code, label, severity) VALUES ($1,$2,$3,$4)`,
        [newId, e.code, e.label, e.severity],
      );
    }
    return newId;
  });

  return (await getUseCaseRaw(id))!;
}

// ── sources ──────────────────────────────────────────────────────────────

export async function listSources(orgId: string): Promise<Source[]> {
  const rows = await q(`${SOURCE_SELECT} WHERE st.org_id = $1 ORDER BY s.name`, [orgId]);
  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, status: r.status, vstSensorId: r.vst_sensor_id ?? undefined,
  }));
}

export async function getSource(id: string, orgId: string): Promise<Source | null> {
  const rows = await q(`${SOURCE_SELECT} WHERE s.id = $1 AND st.org_id = $2`, [id, orgId]);
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, kind: r.kind, status: r.status, vstSensorId: r.vst_sensor_id ?? undefined };
}

/**
 * Registers an "upload" source without a real VST deployment behind it —
 * no bytes are sent anywhere, only the file's name is recorded. Lets the
 * recorded-mode flow (C3 → C4a → C5) be exercised end to end against the
 * mock VSS client before real VST upload exists. Swap point: once VST is
 * live, this is where the returned vst_sensor_id would come from the real
 * upload response instead of being invented here.
 *
 * There is no site-management UI (org = user, one implicit site), so the
 * org's first source lazily creates its one site rather than requiring a
 * setup step.
 */
/**
 * vstSensorId defaults to a mock placeholder (no real VST). Pass a real
 * value when there's an actual file behind this source — e.g. a local path
 * from app/api/sources/upload/route.ts for nvidia-hosted mode.
 */
export async function createSource(orgId: string, name: string, vstSensorId?: string): Promise<Source> {
  return withTransaction(async (tx) => {
    const existing = await tx<{ id: string }>(`SELECT id FROM site WHERE org_id = $1 LIMIT 1`, [orgId]);
    const siteId = existing.length
      ? existing[0].id
      : (await tx<{ id: string }>(
          `INSERT INTO site (org_id, name) VALUES ($1, 'Default Site') RETURNING id`,
          [orgId],
        ))[0].id;

    const rows = await tx(
      `INSERT INTO source (site_id, name, kind, vst_sensor_id, status)
       VALUES ($1, $2, 'upload', $3, 'online') RETURNING *`,
      [siteId, name, vstSensorId ?? `mock-upload-${crypto.randomUUID()}`],
    );
    const r = rows[0];
    return { id: r.id, name: r.name, kind: r.kind, status: r.status, vstSensorId: r.vst_sensor_id ?? undefined };
  });
}

// ── runs ─────────────────────────────────────────────────────────────────

async function getRunRaw(id: string): Promise<Run | null> {
  const rows = await q(`${RUN_SELECT} WHERE r.id = $1`, [id]);
  return rows.length ? toRun(rows[0]) : null;
}

export async function listRuns(orgId: string): Promise<Run[]> {
  return (await q(`${RUN_SELECT} WHERE u.org_id = $1 ORDER BY r.started_at DESC LIMIT 50`, [orgId]))
    .map(toRun);
}

export async function getRun(id: string, orgId: string): Promise<Run | null> {
  const rows = await q(`${RUN_SELECT} WHERE r.id = $1 AND u.org_id = $2`, [id, orgId]);
  return rows.length ? toRun(rows[0]) : null;
}

/**
 * No orgId parameter, deliberately: by the time a route can construct a Run
 * to insert, it has already resolved useCaseId and sourceId through
 * getUseCase()/getSource() scoped to the caller's org — an unowned id would
 * have 400'd before this is ever called.
 */
export async function createRun(r: Run): Promise<Run> {
  const rows = await q(
    `INSERT INTO run (use_case_id, source_id, mode, status, upload_percent,
                      analysis_percent, external_job_id, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [r.useCaseId, r.sourceId, r.mode, r.status, r.uploadPercent,
     r.analysisPercent, r.externalJobId, r.errorMessage],
  );
  return (await getRunRaw(rows[0].id))!;
}

/** Same reasoning as createRun — id is only ever one the caller already owns. */
export async function updateRun(id: string, patch: Partial<Run>): Promise<Run | null> {
  const map: Record<string, string> = {
    status: 'status', uploadPercent: 'upload_percent', analysisPercent: 'analysis_percent',
    externalJobId: 'external_job_id', summary: 'summary', errorMessage: 'error_message',
    finishedAt: 'finished_at',
  };
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [k, v] of Object.entries(patch)) {
    if (!map[k]) continue;              // incidentCount etc. are derived, not stored
    vals.push(v);
    sets.push(`${map[k]} = $${vals.length}`);
  }
  if (sets.length) await q(`UPDATE run SET ${sets.join(', ')} WHERE id = $1`, vals);
  return getRunRaw(id);
}

// ── incidents ────────────────────────────────────────────────────────────

export async function listIncidentsByRun(runId: string): Promise<Incident[]> {
  const rows = await q(
    `SELECT * FROM incident WHERE run_id = $1 ORDER BY offset_ms NULLS LAST, started_at`,
    [runId],
  );
  return rows.map(toIncident);
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
  if (items.length === 0) return 0;
  await withTransaction(async (tx) => {
    for (const i of items) {
      await tx(
        `INSERT INTO incident (source_id, run_id, use_case_id, started_at, offset_ms,
                               event_code, severity, description, object_ids)
         VALUES ($1,$2,$3, now(), $4,$5,$6,$7,$8)`,
        [i.sourceId, i.runId, i.useCaseId, i.offsetMs, i.eventCode,
         i.severity, i.description, i.objectIds],
      );
    }
  });
  return items.length;
}

/**
 * Marks a run complete and writes its incidents in ONE transaction.
 *
 * The runs page polls every 2s and several tabs may poll at once, so two
 * requests can both observe a finished job. The WHERE clause makes exactly
 * one of them win. Doing the insert in the same transaction matters: split
 * across two statements, a losing poll can read the run in the window after
 * status flips but before incidents land, and briefly report "0 incidents".
 *
 * Returns null if another request already completed it. No orgId parameter
 * — same reasoning as createRun/updateRun.
 */
export async function completeRunWithIncidents(
  id: string, summary: string, incidents: Omit<NewIncident, 'runId'>[],
): Promise<Run | null> {
  const won = await withTransaction(async (tx) => {
    const rows = await tx<{ id: string }>(
      `UPDATE run
          SET status = 'complete', analysis_percent = 100, summary = $2, finished_at = now()
        WHERE id = $1 AND status = 'processing'
        RETURNING id`,
      [id, summary],
    );
    if (rows.length === 0) return false;   // someone else got there first

    for (const i of incidents) {
      await tx(
        `INSERT INTO incident (source_id, run_id, use_case_id, started_at, offset_ms,
                               event_code, severity, description, object_ids)
         VALUES ($1,$2,$3, now(), $4,$5,$6,$7,$8)`,
        [i.sourceId, id, i.useCaseId, i.offsetMs, i.eventCode,
         i.severity, i.description, i.objectIds],
      );
    }
    return true;
  });

  return won ? getRunRaw(id) : null;
}
