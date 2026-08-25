-- Video Intelligence Platform — schema v1
-- Entities follow VSS-Design-Document.md §8
--
-- Design rule enforced here: incidents are NOT children of a run.
-- run_id is nullable and incidents are queried by source + time range,
-- so search (D4), map (D6) and the incidents explorer (D7) work without
-- going through a run. Do not add a NOT NULL to incident.run_id.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── org & people ─────────────────────────────────────────────────────────

CREATE TABLE organization (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  website      text,
  contact_email text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_user (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email             text NOT NULL UNIQUE,
  name              text NOT NULL,
  phone             text,
  role              text NOT NULL DEFAULT 'member'
                    CHECK (role IN ('owner','admin','member','viewer')),
  status            text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','invited','disabled')),
  -- null until an invited user sets one; see db/migrations/001_auth.sql
  password_hash     text,
  onboarding_status text NOT NULL DEFAULT 'pending_org_setup'
                    CHECK (onboarding_status IN
                      ('pending_org_setup','pending_first_source','complete')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name       text NOT NULL,
  location   text,
  timezone   text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Named geographic location, used by the map (D6) and place-scoped queries.
CREATE TABLE place (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id   uuid NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name      text NOT NULL,
  latitude  double precision,
  longitude double precision
);

-- ── video sources ────────────────────────────────────────────────────────

CREATE TABLE source (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  place_id      uuid REFERENCES place(id) ON DELETE SET NULL,
  name          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('camera','upload')),
  rtsp_url      text,              -- cameras only
  vst_sensor_id text,              -- id returned by VST after registration/upload
  status        text NOT NULL DEFAULT 'offline'
                CHECK (status IN ('online','offline','error')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX source_site_idx ON source(site_id);

-- ── use cases: the four prompt sets ──────────────────────────────────────

CREATE TABLE use_case (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id       uuid REFERENCES site(id) ON DELETE CASCADE,  -- null = org-wide
  slug          text NOT NULL,
  name          text NOT NULL,
  icon          text,
  description   text,

  -- §2 Scene — shared across all four subsystems
  scenario            text,
  objects_of_interest text[] NOT NULL DEFAULT '{}',

  -- §2.1 Recorded  → LVS POST /v1/summarize
  recorded_prompt        text,
  recorded_system_prompt text,

  -- §2.2 Live      → LVS POST /v1/stream_summarize
  live_prompt        text,
  live_system_prompt text,

  -- §2.3 Alerts    → Alert Bridge POST /realtime
  alert_prompt        text,
  alert_system_prompt text,

  -- §2.4 Search & verification → CA-RAG
  verification_criteria text,

  supports_recorded boolean NOT NULL DEFAULT true,
  supports_live     boolean NOT NULL DEFAULT false,

  created_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);

-- Severity lives on the EVENT, not on the alert rule. That is what lets a
-- rule say "page for high only" without re-listing every event.
CREATE TABLE use_case_event (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id uuid NOT NULL REFERENCES use_case(id) ON DELETE CASCADE,
  code        text NOT NULL,
  label       text NOT NULL,
  severity    text NOT NULL DEFAULT 'medium'
              CHECK (severity IN ('low','medium','high')),
  UNIQUE (use_case_id, code)
);

-- ── alert rules ──────────────────────────────────────────────────────────

CREATE TABLE alert_rule (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id      uuid NOT NULL REFERENCES use_case(id) ON DELETE CASCADE,
  use_case_event_id uuid NOT NULL REFERENCES use_case_event(id) ON DELETE CASCADE,
  source_id        uuid NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  external_rule_id text,          -- id returned by Alert Bridge /realtime
  enabled          boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (use_case_event_id, source_id)
);

-- ── runs ─────────────────────────────────────────────────────────────────

CREATE TABLE run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  use_case_id     uuid NOT NULL REFERENCES use_case(id) ON DELETE RESTRICT,
  source_id       uuid NOT NULL REFERENCES source(id) ON DELETE RESTRICT,
  mode            text NOT NULL CHECK (mode IN ('recorded','live')),
  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued','uploading','processing','complete','failed')),
  -- two-phase progress: upload is separate from analysis (design doc §7.2)
  upload_percent   int NOT NULL DEFAULT 0,
  analysis_percent int NOT NULL DEFAULT 0,
  external_job_id text,           -- LVS response id / video_id
  summary         text,
  error_message   text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  created_by      uuid REFERENCES app_user(id) ON DELETE SET NULL
);
CREATE INDEX run_use_case_idx ON run(use_case_id);
CREATE INDEX run_status_idx   ON run(status);

-- ── incidents ────────────────────────────────────────────────────────────
-- run_id is intentionally NULLABLE. Incidents outlive the run that produced
-- them and are queried across sources and time. See design doc §8.

CREATE TABLE incident (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid NOT NULL REFERENCES source(id) ON DELETE CASCADE,
  run_id      uuid REFERENCES run(id) ON DELETE SET NULL,
  use_case_id uuid REFERENCES use_case(id) ON DELETE SET NULL,

  started_at  timestamptz NOT NULL,
  ended_at    timestamptz,
  offset_ms   bigint,             -- position within the source video
  event_code  text,
  severity    text NOT NULL DEFAULT 'medium'
              CHECK (severity IN ('low','medium','high','clear')),
  description text NOT NULL,
  object_ids  text[] NOT NULL DEFAULT '{}',
  thumbnail_url text,

  -- verification collapsed onto the incident (1:1 in practice).
  -- Split into its own table if a detection ever needs multiple verdicts.
  verdict       text NOT NULL DEFAULT 'unverified'
                CHECK (verdict IN ('confirmed','rejected','unverified')),
  criteria_met  jsonb,
  verified_at   timestamptz,

  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incident_source_time_idx ON incident(source_id, started_at DESC);
CREATE INDEX incident_run_idx         ON incident(run_id);
CREATE INDEX incident_verdict_idx     ON incident(verdict, severity);

-- ── otp challenges ───────────────────────────────────────────────────────
-- See db/migrations/002_otp_challenge.sql for the full rationale.
CREATE TABLE otp_challenge (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose       text NOT NULL CHECK (purpose IN ('signup', 'reset')),
  email         text NOT NULL,
  otp_hash      text NOT NULL,
  org_name      text,
  name          text,
  password_hash text,
  user_id       uuid REFERENCES app_user(id) ON DELETE CASCADE,
  attempts      int NOT NULL DEFAULT 0,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email, purpose)
);

-- ── reports ──────────────────────────────────────────────────────────────

CREATE TABLE report (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  template     text NOT NULL,
  incident_ids uuid[] NOT NULL DEFAULT '{}',
  file_url     text,
  created_by   uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
