# Architecture

How this application is put together, and why the boundaries sit where they do.

**Companion document:** [`TECH-STACK.md`](./TECH-STACK.md) — what each technology is and why it was chosen.
**Product spec:** [`../VSS-Design-Document.md`](../VSS-Design-Document.md)

---

## 1. The big picture

Three separate systems. This repository is only the middle one.

```mermaid
flowchart LR
    B["<b>Browser</b><br/>React UI"]
    A["<b>This app</b><br/>Next.js + Postgres<br/><i>video-intelligence</i>"]
    V["<b>NVIDIA VSS</b><br/>LVS · VST · RTVI<br/><i>GPU, deployed separately</i>"]

    B <-->|"HTTPS · session cookie"| A
    A -->|"REST · prompts &amp; job polling"| V
    B -.->|"chunked upload<br/>(not built yet)"| V
```

**Why the app never proxies video:** a 2 GB file through a Next.js route handler
is slow, memory-hungry and hits body-size limits. NVIDIA's own UI uploads
browser → VST directly, so we follow that. The app only ever handles *metadata*.

**Consequence to plan for:** VST must be reachable from the user's browser, not
just from the server. If VSS sits behind a firewall, that is a networking task.

---

## 2. Where code runs

This is the distinction that matters most day to day. Getting it wrong is the
easiest way to leak a secret or crash the build.

| Layer | Runtime | Can it reach the DB? | Holds secrets? |
|---|---|---|---|
| Server components, route handlers | Node | ✅ yes | ✅ yes |
| `middleware.ts` | **Edge** | ❌ **no** | signing key only |
| `'use client'` components | Browser | ❌ no | ❌ **never** |

### Server (Node)

```
lib/store/postgres.ts     DB credentials
lib/vss/client.ts         NVIDIA_API_KEY
lib/auth/password.ts      node:crypto — would crash on edge
app/api/**/route.ts       every route handler
app/**/page.tsx           except app/runs/page.tsx
components/AppShell.tsx   async, calls currentUser()
```

### Edge

```
middleware.ts             signature check only, no DB
```

### Client (browser)

```
components/IncidentTimeline.tsx   useState
components/UseCaseForm.tsx
components/RunLauncher.tsx
components/SignInForm.tsx
components/SignOutButton.tsx
app/runs/page.tsx                 polling loop
```

> **The rule:** never import `lib/store`, `lib/vss/client` or
> `lib/auth/password` into a `'use client'` file. Server components fetch data
> and pass it **down as props** — that is how `IncidentTimeline` receives its
> incidents without ever touching the database.

---

## 3. The two swap points

Both follow the same shape: an interface, two implementations, one switch. This
is what let the entire app get built before any GPU existed.

```mermaid
flowchart TD
    subgraph S["lib/store"]
        SI["index.ts<br/><i>DATABASE_URL set?</i>"]
        SI -->|no| SM["memory.ts<br/>zero setup"]
        SI -->|yes| SP["postgres.ts<br/>real SQL"]
    end
    subgraph V["lib/vss"]
        VI["index.ts<br/><i>USE_MOCK_VSS?</i>"]
        VI -->|true| VM["mock.ts<br/>no GPU needed"]
        VI -->|false| VC["client.ts<br/>real LVS"]
    end
```

Nothing else in the app knows which side is active. Flipping either is a
one-line `.env.local` change with **zero code edits**.

---

## 4. Request flows

### Signing in

```mermaid
sequenceDiagram
    participant B as Browser
    participant M as middleware (edge)
    participant R as /api/auth/login (node)
    participant DB as Postgres

    B->>M: GET /use-cases
    M-->>B: 307 → /signin?next=/use-cases
    B->>R: POST email + password
    R->>DB: getUserByEmail
    R->>R: scrypt verify (constant-time)
    R-->>B: Set-Cookie vi_session (HttpOnly)
    B->>M: GET /use-cases (with cookie)
    M->>M: verify HMAC signature
    M-->>B: allow → page renders
```

The session cookie is `userId.expiresAt.signature`. **The expiry is inside the
signed payload**, so it cannot be extended client-side — verified by test.

Two layers, deliberately:

- **Middleware** rejects anyone without a valid signature. Cheap, runs on edge, cannot check the database.
- **`currentUser()`** re-reads on the Node side and confirms the user still exists and is `active`. A disabled user's cookie passes middleware but fails here.

> Middleware alone is **not** the authorisation boundary.

### Running an analysis

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as /api/runs (node)
    participant VSS as LVS
    participant DB as Postgres

    B->>API: POST useCaseId + sourceId + mode
    API->>API: validate mode vs use case & source
    API->>VSS: summarize(prompts from use case)
    VSS-->>API: 202 · summarization.progressing
    API->>DB: INSERT run (status=processing)
    API-->>B: run

    loop every 2s while processing
        B->>API: GET /api/runs/[id]
        API->>VSS: poll(jobId)
        alt still working
            VSS-->>API: summarization.progressing
            API-->>B: analysisPercent
        else finished
            VSS-->>API: summarization.completion
            API->>VSS: detectedIncidents(jobId)
            API->>DB: BEGIN · complete run + insert incidents · COMMIT
            API-->>B: run + incidentCount
        end
    end
```

**Why completion is one transaction:** several tabs may poll simultaneously.
Split across two statements, a losing poll can read the run *after* status flips
but *before* incidents land, and briefly display "0 incidents found". Verified:
six concurrent polls previously returned `[0, 5]`; they now all return `5`.

**Severity is not taken from the model.** VSS reports *what* it saw; the use
case decides *how much it matters*. The route maps `eventCode → severity` from
the use case authored in C2. Unknown codes fall back to `medium` rather than
being dropped, so nothing detected goes silently missing.

---

## 5. Data model

The one rule worth protecting:

```mermaid
erDiagram
    ORGANIZATION ||--o{ APP_USER : has
    ORGANIZATION ||--o{ SITE : has
    ORGANIZATION ||--o{ USE_CASE : owns
    SITE ||--o{ SOURCE : has
    USE_CASE ||--o{ USE_CASE_EVENT : defines
    USE_CASE ||--o{ ALERT_RULE : drives
    USE_CASE ||--o{ RUN : produces
    SOURCE ||--o{ RUN : analysed_in
    SOURCE ||--o{ INCIDENT : detected_on
    RUN |o--o{ INCIDENT : "may have (nullable)"
```

> **`incident.run_id` is nullable on purpose.** Incidents outlive the run that
> produced them and are queried by *source + time*, not by run. Search (D4),
> Map (D6) and the Incidents explorer (D7) all need this. Adding `NOT NULL`
> would block them, and the migration is painful once data exists.

**Severity lives on `use_case_event`, not on `alert_rule`.** That is what lets a
rule say "page for high only" without re-listing every event.

**Events diff by `code`, not array position.** Renaming an event's label keeps
its row id, so an `alert_rule` pointing at it survives the edit. Only genuinely
removed events cascade-delete their rules.

---

## 6. Directory map

```
app/
  api/              route handlers — server only
    auth/           login, logout
    runs/           POST starts a run · GET [id] polls
    use-cases/      CRUD
    sources/        list
    vss/health      is the backend mocked or live?
  use-cases/        C1 library · C2 new/edit · C3 run picker
  runs/             C4a progress list · C5 results
  signin/
components/         'use client' unless noted
lib/
  types.ts          domain types, mirror db/schema.sql
  store/            memory ⇄ postgres swap
  vss/              mock ⇄ real swap
  auth/             password (node only) · session (edge-safe)
  db.ts             pool + withTransaction
db/
  schema.sql        full schema
  seed.sql          dev fixtures
  migrations/       incremental changes
middleware.ts       edge gate
```

---

## 7. Known architectural gaps

Honest list. None of these are bugs — they are things not built yet.

| Gap | Consequence |
|---|---|
| **No background worker** | Runs only progress while a browser tab polls. Close it mid-run and it stays `processing` forever. |
| **No video upload** | `uploadPercent: 100` is a placeholder; nothing is actually uploaded. |
| **`detectedIncidents()` returns `[]` on the real client** | A real VSS run shows a summary with an empty timeline. Real detections must be parsed from captions or read from Elasticsearch. |
| **Live mode returns 501** | `/v1/stream_summarize`, RTVI and the C4b screen do not exist. |
| **No site scoping** | New use cases are created org-wide (`site_id` null). |
| **Single-tenant assumptions** | No org isolation in queries beyond `createUseCase`. |
| **No tests, no CI** | Every check so far has been run by hand. |
