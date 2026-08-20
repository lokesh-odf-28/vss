-- Seed data for local development.
-- Deterministic UUIDs so you can re-run this and keep the same ids.
-- Safe to re-run: everything is ON CONFLICT DO NOTHING.

INSERT INTO organization (id, name, website, contact_email) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Acme Logistics', 'https://acme.example', 'ops@acme.example')
ON CONFLICT (id) DO NOTHING;

INSERT INTO app_user (id, org_id, email, name, role, onboarding_status) VALUES
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1',
   'lokesh@acme.example', 'Lokesh', 'owner', 'complete')
ON CONFLICT (id) DO NOTHING;

INSERT INTO site (id, org_id, name, location, timezone) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1',
   'Chennai Plant', 'Chennai, IN', 'Asia/Kolkata')
ON CONFLICT (id) DO NOTHING;

INSERT INTO place (id, site_id, name, latitude, longitude) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1',
   'Loading Dock', 13.0827, 80.2707)
ON CONFLICT (id) DO NOTHING;

INSERT INTO source (id, site_id, place_id, name, kind, rtsp_url, vst_sensor_id, status) VALUES
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1',
   '00000000-0000-0000-0000-0000000000d1', 'loading-dock-cam03', 'camera',
   'rtsp://10.0.0.31/stream', 'vst-cam03', 'online'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1',
   NULL, 'aisle-cam07', 'camera', 'rtsp://10.0.0.37/stream', 'vst-cam07', 'online'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c1',
   NULL, 'bay-b-cam01', 'camera', 'rtsp://10.0.0.11/stream', 'vst-cam01', 'offline')
ON CONFLICT (id) DO NOTHING;

-- ── use cases: all four prompt sets populated ────────────────────────────

INSERT INTO use_case (
  id, org_id, site_id, slug, name, icon, description,
  scenario, objects_of_interest,
  recorded_prompt, recorded_system_prompt,
  live_prompt, live_system_prompt,
  alert_prompt, alert_system_prompt,
  verification_criteria,
  supports_recorded, supports_live, created_by
) VALUES (
  '00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'warehouse-safety', 'Warehouse Safety', '🏭',
  'Forklift proximity, PPE compliance, blocked emergency exits',
  'A warehouse floor with forklifts, pallet stacks and personnel moving between loading bays.',
  ARRAY['forklift','worker','helmet','hi_vis_vest','pallet'],
  'Summarize any safety-relevant events, with timestamps.',
  'You are a safety compliance monitor for a warehouse floor. Flag forklift proximity to workers, missing PPE, and blocked emergency exits.',
  'Narrate movement near the loading bays and call out proximity between vehicles and people.',
  'You are monitoring a live warehouse camera. Report safety-relevant activity as it happens, briefly.',
  'Raise an alert if a forklift comes within 2 metres of a person on foot, or if an emergency exit is obstructed.',
  'You are a real-time safety alerting system for a warehouse.',
  'Confirm only if a worker is clearly visible in frame and the hazard is unobstructed.',
  true, true, '00000000-0000-0000-0000-0000000000b1'
), (
  '00000000-0000-0000-0000-0000000000f2',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-0000000000c1',
  'sport-match-analysis', 'Sport Match Analysis', '⚽',
  'Goals, fouls, offside calls, substitutions',
  'An outdoor football pitch with two teams of players, a referee and a ball.',
  ARRAY['ball','player','referee','goalpost'],
  'Summarize the match, noting goals, fouls and offside decisions with timestamps.',
  'You are a sports analyst reviewing football footage. Identify goals, fouls, offside, and player count on each play.',
  'Commentate on play as it happens, noting possession and shots on target.',
  'You are a live football match commentator. Be concise.',
  'Raise an alert when a goal is scored or a card is issued.',
  'You are a real-time match event detector.',
  'Confirm only if the ball and the relevant players are both visible in frame.',
  true, true, '00000000-0000-0000-0000-0000000000b1'
)
ON CONFLICT (id) DO NOTHING;

-- Severity lives on the event, not the alert rule.
INSERT INTO use_case_event (id, use_case_id, code, label, severity) VALUES
  ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000f1','forklift_proximity','Forklift near worker','high'),
  ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000f1','blocked_exit','Blocked emergency exit','high'),
  ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000f1','ppe_violation','Missing PPE','medium'),
  ('00000000-0000-0000-0000-000000000104','00000000-0000-0000-0000-0000000000f1','spill','Spill on floor','medium'),
  ('00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000f2','goal','Goal scored','high'),
  ('00000000-0000-0000-0000-000000000106','00000000-0000-0000-0000-0000000000f2','foul','Foul','medium'),
  ('00000000-0000-0000-0000-000000000107','00000000-0000-0000-0000-0000000000f2','offside','Offside','medium'),
  ('00000000-0000-0000-0000-000000000108','00000000-0000-0000-0000-0000000000f2','substitution','Substitution','low')
ON CONFLICT (id) DO NOTHING;

-- Alert rules: per event, per camera. Design doc D3.
INSERT INTO alert_rule (id, use_case_id, use_case_event_id, source_id, enabled) VALUES
  ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-0000000000e1', true),
  ('00000000-0000-0000-0000-000000000202','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-0000000000e1', true),
  ('00000000-0000-0000-0000-000000000203','00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-0000000000e2', false),
  ('00000000-0000-0000-0000-000000000204','00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-000000000105','00000000-0000-0000-0000-0000000000e1', true)
ON CONFLICT (id) DO NOTHING;

-- A completed run plus incidents, so pgAdmin has something interesting to show.
INSERT INTO run (id, use_case_id, source_id, mode, status, upload_percent, analysis_percent,
                 external_job_id, summary, started_at, finished_at, created_by) VALUES
  ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-0000000000f1',
   '00000000-0000-0000-0000-0000000000e1','recorded','complete',100,100,'mock-seed-0001',
   'Across the eight-hour shift, three high-severity safety events occurred, all in Bay 4 between 06:40 and 09:05.',
   now() - interval '2 hours', now() - interval '1 hour 40 minutes',
   '00000000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

-- NOTE: run_id is set here, but it is NULLABLE by design. Incidents are queried
-- by source + time for search, map and the incidents explorer. See schema.sql.
INSERT INTO incident (id, source_id, run_id, use_case_id, started_at, offset_ms,
                      event_code, severity, description, object_ids, verdict, verified_at) VALUES
  ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-0000000000f1',
   now() - interval '2 hours', 2520000, 'forklift_proximity','high',
   'Forklift within 1.2 m of unprotected worker — Bay 4', ARRAY['obj-114','obj-119'],'confirmed', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-0000000000f1',
   now() - interval '1 hour 55 minutes', 4500000, 'ppe_violation','medium',
   'Worker without hi-vis vest — Aisle B', ARRAY['obj-207'],'unverified', NULL),
  ('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-0000000000f1',
   now() - interval '1 hour 50 minutes', 10920000, 'blocked_exit','high',
   'Pallet stack blocking emergency exit E2', ARRAY['obj-330'],'confirmed', now() - interval '1 hour'),
  -- An incident with NO run: proves incidents stand alone. Came from a live session.
  ('00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-0000000000e2', NULL,'00000000-0000-0000-0000-0000000000f1',
   now() - interval '20 minutes', NULL, 'ppe_violation','medium',
   'Live alert: worker without helmet near aisle entrance', ARRAY['obj-501'],'rejected', now() - interval '18 minutes')
ON CONFLICT (id) DO NOTHING;
