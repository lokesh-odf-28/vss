import { q, withTransaction } from '../db';
import type { UseCase, UseCaseInput, Run, Source, User, UserWithSecret, AuthContext } from '../types';
import { slugify } from '../slug';

/** Postgres-backed store. Schema: db/schema.sql */

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

const USE_CASE_SELECT = `
  SELECT u.*,
    (SELECT count(*) FROM alert_rule ar WHERE ar.use_case_id = u.id AND ar.enabled) AS alert_rule_count,
    (SELECT max(r.started_at) FROM run r WHERE r.use_case_id = u.id)                AS last_run_at
  FROM use_case u`;

const RUN_SELECT = `
  SELECT r.*, u.name AS use_case_name, s.name AS source_name,
    (SELECT count(*) FROM incident i WHERE i.run_id = r.id) AS incident_count
  FROM run r
  JOIN use_case u ON u.id = r.use_case_id
  JOIN source   s ON s.id = r.source_id`;

// ── use cases ────────────────────────────────────────────────────────────
// ── users ────────────────────────────────────────────────────────────────

function toUser(r: any): User {
  return { id: r.id, orgId: r.org_id, email: r.email, name: r.name, role: r.role, status: r.status };
}

export async function getUserByEmail(email: string): Promise<UserWithSecret | null> {
  const rows = await q(`SELECT * FROM app_user WHERE lower(email) = lower($1)`, [email]);
  if (!rows.length) return null;
  return { ...toUser(rows[0]), passwordHash: rows[0].password_hash };
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await q(`SELECT * FROM app_user WHERE id = $1`, [id]);
  return rows.length ? toUser(rows[0]) : null;
}

export async function listUseCases(): Promise<UseCase[]> {
  const rows = await q(`${USE_CASE_SELECT} ORDER BY u.name`);
  const events = await q(`SELECT * FROM use_case_event`);
  return rows.map((r) => toUseCase(r, events));
}

export async function getUseCase(id: string): Promise<UseCase | null> {
  const rows = await q(`${USE_CASE_SELECT} WHERE u.id = $1`, [id]);
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
export async function saveUseCase(id: string, input: UseCaseInput): Promise<UseCase | null> {
  const exists = await q(`SELECT 1 FROM use_case WHERE id = $1`, [id]);
  if (!exists.length) return null;

  await withTransaction(async (tx) => {
    await tx(
      `UPDATE use_case SET
         name = $2, icon = $3, description = $4, scenario = $5, objects_of_interest = $6,
         recorded_prompt = $7, recorded_system_prompt = $8,
         live_prompt = $9, live_system_prompt = $10,
         verification_criteria = $11,
         supports_recorded = $12, supports_live = $13,
         updated_at = now()
       WHERE id = $1`,
      [id, input.name, input.icon, input.description, input.scenario, input.objectsOfInterest,
       input.recordedPrompt, input.recordedSystemPrompt, input.livePrompt, input.liveSystemPrompt,
       input.verificationCriteria, input.supportsRecorded, input.supportsLive],
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

  return getUseCase(id);
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

  return (await getUseCase(id))!;
}

// ── sources ──────────────────────────────────────────────────────────────

export async function listSources(): Promise<Source[]> {
  const rows = await q(`SELECT * FROM source ORDER BY name`);
  return rows.map((r) => ({
    id: r.id, name: r.name, kind: r.kind, status: r.status, vstSensorId: r.vst_sensor_id ?? undefined,
  }));
}

export async function getSource(id: string): Promise<Source | null> {
  const rows = await q(`SELECT * FROM source WHERE id = $1`, [id]);
  if (!rows.length) return null;
  const r = rows[0];
  return { id: r.id, name: r.name, kind: r.kind, status: r.status, vstSensorId: r.vst_sensor_id ?? undefined };
}

// ── runs ─────────────────────────────────────────────────────────────────

export async function listRuns(): Promise<Run[]> {
  return (await q(`${RUN_SELECT} ORDER BY r.started_at DESC LIMIT 50`)).map(toRun);
}

export async function getRun(id: string): Promise<Run | null> {
  const rows = await q(`${RUN_SELECT} WHERE r.id = $1`, [id]);
  return rows.length ? toRun(rows[0]) : null;
}

export async function createRun(r: Run): Promise<Run> {
  const rows = await q(
    `INSERT INTO run (use_case_id, source_id, mode, status, upload_percent,
                      analysis_percent, external_job_id, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [r.useCaseId, r.sourceId, r.mode, r.status, r.uploadPercent,
     r.analysisPercent, r.externalJobId, r.errorMessage],
  );
  return (await getRun(rows[0].id))!;
}

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
  return getRun(id);
}
