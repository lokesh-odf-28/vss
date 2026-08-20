# Video Intelligence

Use-case driven video analysis on top of NVIDIA VSS.
Design reference: [`../VSS-Design-Document.md`](../VSS-Design-Document.md)

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev            # http://localhost:3000
```

Works immediately — **no GPU, no VSS deployment, no database required.**
`USE_MOCK_VSS=true` serves realistic mocked LVS responses, including the
`summarization.progressing → summarization.completion` transition, so the
two-phase progress UI is testable today.

Try it: open **Use Cases → Run ▸**, then watch the analysis bar on **Runs**
fill over 20 seconds and land on a summary.

## Structure

```
app/
  use-cases/         C1  library · C2 editor (todo)
  runs/              C4a run list with two-phase progress · C5 detail
  api/
    use-cases/       CRUD against the store
    runs/            POST starts a run, GET /[id] polls LVS
    vss/health/      is the backend mocked or live?
lib/
  types.ts           domain types, mirror db/schema.sql
  store.ts           in-memory store — SWAP POINT for Postgres
  seed.ts            starter use-case profiles (warehouse, sport)
  vss/
    index.ts         the mock ⇄ real switch
    mock.ts          fake LVS with realistic timing
    client.ts        real LVS client (server-only, holds API keys)
    types.ts         wire types from the OpenAPI spec
db/schema.sql        Postgres schema for all entities
```

## Going live against real VSS

```bash
# .env.local
USE_MOCK_VSS=false
LVS_URL=http://<your-vss-host>:38111
```

Nothing else changes — every caller goes through `lib/vss`.

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

C2 editor · C3 source/mode picker · C4b live sessions · incident parsing ·
everything in Zone D (search, alerts, map, sources, reports) · auth.
