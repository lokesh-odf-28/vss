# Video Intelligence

Use-case driven video analysis on top of NVIDIA VSS.
Design reference: [`../VSS-Design-Document.md`](../VSS-Design-Document.md)
Deeper docs: [`ARCHITECTURE.md`](./ARCHITECTURE.md) (how it's put together) ·
[`TECH-STACK.md`](./TECH-STACK.md) (what's used and why)

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Works immediately — **no GPU, no VSS deployment, no database, no SMTP
account required.** Everything has a zero-setup fallback:

| Real thing | Fallback when unconfigured | Switch |
|---|---|---|
| VSS (LVS/RTVI) | `lib/vss/mock.ts` — realistic mocked responses, incl. `summarization.progressing → completion` | `USE_MOCK_VSS` |
| Postgres | `lib/store/memory.ts` — in-memory store | `DATABASE_URL` set or unset |
| SMTP | `lib/mail/console.ts` — OTP codes printed to the server log instead of emailed | `SMTP_HOST` set or unset |

So on a fresh clone: sign up, grab the OTP from the terminal running
`npm run dev` (not your inbox), verify, sign in, create a use case, and run
it against the mock — all before touching Postgres or VSS.

## Structure

```
app/
  api/
    auth/             login · logout · signup/start · signup/verify ·
                       forgot-password · reset-password
    use-cases/        CRUD against the store
    runs/              POST starts a run, GET /[id] polls VSS
    sources/           list
    vss/health/        is the backend mocked or live?
  use-cases/          C1 library · C2 new/edit · C3 source + mode picker (run/)
  runs/               C4a run list with two-phase progress · C5 detail
  signin/ signup/ forgot-password/
components/           'use client' unless it's a form wrapper around a server page
lib/
  types.ts            domain types, mirror db/schema.sql
  auth/                password (scrypt) · session (Web Crypto, edge-safe) · otp
  mail/                console ⇄ SMTP switch
  store/               memory ⇄ Postgres switch, org-scoped on every read/write
  seed.ts              starter use-case profiles (warehouse, sport)
  vss/
    index.ts           the mock ⇄ real switch
    mock.ts             fake LVS + RTVI, recorded and live paths
    client.ts           real LVS + RTVI client (server-only, holds API keys)
    types.ts             wire types mirrored from the OpenAPI spec
db/
  schema.sql           Postgres schema for all entities
  migrations/           001_auth.sql, 002_otp_challenge.sql, 003_drop_unused_tables.sql
middleware.ts          edge route gate (session cookie check only, no DB)
```

## Auth

Sign-up is two-step and OTP-verified: submit org name + email + password,
receive a 6-digit code (email or server log — see the fallback table above),
verify it, land signed in. Forgot/reset password follows the same OTP
pattern. Codes expire after 10 minutes and lock out after 5 wrong attempts.

**One login per organization, permanently — not a phase-one shortcut.**
There is no concept of a team member or an invite: `organization` and
`app_user` are created together at sign-up, 1:1, and every use case, source,
run and incident is scoped to that `orgId` from the session. A different
org's data 404s rather than 403s, so its existence can't be probed either.
See [TECH-STACK.md §6](./TECH-STACK.md#6-auth--hand-rolled-deliberately) for
the full reasoning.

**To send real email** instead of logging codes to the console, add to
`.env.local`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=<app password>
SMTP_FROM=you@example.com        # optional, defaults to SMTP_USER
```

Works with any standard SMTP endpoint (Gmail, Office 365, Amazon SES's SMTP
interface, etc.) — it's Nodemailer against `SMTP_HOST`, not a provider SDK.
If a code never arrives, check spam first: the server logs
`[mail] sent to ... — messageId=...` on success, which means the SMTP server
accepted the message — inbox delivery is a separate, later step it doesn't
control.

## Going live against real VSS

```bash
# .env.local
USE_MOCK_VSS=false
LVS_URL=http://<your-vss-host>:38111     # recorded runs + live captioning
RTVI_URL=http://<your-vss-host>:8100     # live camera registration
```

Nothing else changes — every caller goes through `lib/vss`. Recorded and live
are genuinely different API shapes (async job+poll vs. a register → caption →
blocking-poll handshake across two services) — see
[TECH-STACK.md §7](./TECH-STACK.md#7-nvidia-vss--the-ai-engine) if that's
surprising.

## Postgres

You already have PostgreSQL 18 + pgAdmin 4 installed, so no Docker is needed.

**1. Start the server** (needs your admin password — one time):

```bash
sudo launchctl load /Library/LaunchDaemons/postgresql-18.plist
```

**2. Create the DB, apply schema + seed:**

```bash
npm run db:setup      # prompts for the 'postgres' superuser password
```

**3. Point the app at it** — add to `.env.local`:

```
DATABASE_URL=postgres://vi:vi@localhost:5432/video_intelligence
```

Restart `npm run dev`. Confirm with `curl localhost:3000/api/vss/health`:

```json
{ "vss": "mock", "store": "postgres" }
```

### pgAdmin connection

| Field | Value |
|---|---|
| Host | `localhost` |
| Port | `5432` |
| Database | `video_intelligence` |
| Username | `vi` |
| Password | `vi` |

Seeded so there is something to look at: 1 org, 1 site, 3 cameras, 2 use cases
with 8 events, 4 alert rules, 1 completed run, 4 incidents.

Useful scripts: `npm run db:psql` (shell), `npm run db:reset` (wipe + reseed).

## Two rules that are expensive to break

1. **Upload never goes through this server.** The browser uploads chunks
   straight to VST using the `nvstreamer-*` protocol, then calls our API with
   the returned sensor id. A 2 GB file through a route handler will not work.
2. **Incidents are not children of a run.** `incident.run_id` is nullable on
   purpose — search, map and the incidents explorer all query incidents by
   source and time, without a run. Do not add `NOT NULL`.

## Not built yet

- **C4b — the live-session screen.** The live client/mock layer underneath it
  (camera registration, start captioning, `stream_summarize` polling, stop)
  is built and tested; the UI that drives it is not.
- **Video upload.** `uploadPercent: 100` on a run is a placeholder — nothing
  is actually uploaded yet.
- **Alert Bridge integration** (Zone D: real-time alerting) — deferred as a
  separate milestone; it's a third, separately-deployed VSS service.
- **Everything else in Zone D** — search, map, sources management, reports.
- **A background worker.** Runs only progress while a browser tab polls;
  closing the tab mid-run leaves it `processing` forever.
- **Tests.** Every check so far — the concurrency race, org isolation, the
  auth/OTP flows — was run by hand and verified once, not automated.
