# Tech Stack

Every technology in this project, what it does, and **why it was chosen over
the alternatives**. Written so someone joining can question the decisions
rather than inherit them blindly.

**Companion document:** [`ARCHITECTURE.md`](./ARCHITECTURE.md) — how the pieces fit together.

---

## At a glance

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.5 |
| UI | React | 18.3.1 |
| Language | TypeScript | 5.5.3 |
| Styling | Tailwind CSS | 3.4.6 |
| Database | PostgreSQL | 18 |
| DB driver | `pg` | 8.12.0 |
| Auth | Hand-rolled — `node:crypto` + Web Crypto | stdlib |
| Email | Nodemailer (SMTP) | 9.0.5 |
| AI engine | NVIDIA VSS *(external)* | — |

**Total runtime dependencies: five.** `next`, `react`, `react-dom`, `pg`,
`nodemailer`. That is deliberate — see [§9](#9-what-we-deliberately-did-not-add).

---

## 1. Next.js 14 — App Router

**What it does:** the whole application. Pages, API routes, server-side
rendering and the edge middleware all come from one framework.

**Why:**

- **One repo, one deploy, one language.** For a team this size, splitting a separate backend service buys package boundaries we do not need yet and costs tooling complexity we would have to learn now.
- **Route handlers give us a server layer for free.** Somewhere has to hold DB credentials and the NVIDIA API key without shipping them to the browser. `app/api/**` does that with no extra process to run.
- **Already proven here.** `IOT-frontend` uses this exact pattern in production, so it is a known quantity for this team rather than a bet.

**Why 14 and not 15:** matches `IOT-frontend` exactly. Fewer surprises beats
newer when the team already knows a version.

**When to revisit:** extract a separate backend when a background worker
appears, a second client (mobile, partner API) appears, or the two halves need
independent deploy cadence. Not before.

---

## 2. React 18 + Server Components

**Why it matters here:** server components query the database *directly*, with
no API round trip and no client-side loading state:

```tsx
// app/use-cases/page.tsx — runs on the server
const useCases = await listUseCases();
```

Only genuinely interactive pieces are marked `'use client'` — six files. That
keeps DB code, secrets and SQL out of the browser bundle **by construction**,
not by convention.

---

## 3. TypeScript

**Why:** the domain has a lot of near-identical shapes — `UseCase` vs
`UseCaseInput`, `User` vs `UserWithSecret`, `Severity` vs `Severity | 'clear'`.

That last pair is the real argument. `UserWithSecret` carries `passwordHash`;
`User` does not. The compiler will not let a password hash reach a client
component. In plain JavaScript that is a code-review question every single time.

Runs in `strict` mode.

---

## 4. Tailwind CSS

**Why:** the manager's brief was explicitly *"no need for perfect UI, we'll
modify later."* Tailwind suits that — styling lives inline with markup, so
changing a screen means editing one file, not hunting a stylesheet.

**Honest trade-off:** the markup gets noisy. With a designer involved and a real
design system, a component library would be the better call. For a first cut
built without designs, this is faster.

**Why not a component library (MUI, shadcn, Chakra):** each brings opinions
about how things should look before there *is* a design. Easier to add one later
than to fight one now.

---

## 5. PostgreSQL 18

**Why Postgres over SQLite/MySQL/Mongo:**

- **Native arrays.** `objects_of_interest text[]` and `object_ids text[]` are first-class — no join table, no JSON blob.
- **`jsonb` for `criteria_met`,** where the shape genuinely is not fixed yet.
- **Real transactions,** which the concurrent-poll fix depends on.
- **`ON CONFLICT (use_case_id, code)`,** which is how event diffing stays correct.
- It is what `IOT-backend` already uses.

**Why not an ORM (Prisma, Drizzle, TypeORM):**

- The schema *is* the design document — `db/schema.sql` carries the reasoning as comments, including why `incident.run_id` is nullable. An ORM schema file would not hold that as legibly.
- Queries here are simple. `USE_CASE_SELECT` uses correlated subqueries for `alert_rule_count` and `last_run_at`; expressing that through an ORM is more work, not less.
- One fewer dependency, one fewer migration tool, one fewer thing to learn.

**Honest trade-off:** hand-written mappers (`toUseCase`, `toRun`, `toIncident`)
convert `snake_case` → `camelCase` manually. An ORM would generate those. If the
schema doubles in size, revisit.

**Local install, not Docker:** PostgreSQL 18 and pgAdmin were already installed
on the machine. `docker-compose.optional.yml` remains for anyone who prefers it.

---

## 6. Auth — hand-rolled, deliberately

The most questionable choice in the stack, so here is the full reasoning.

**What was built:** scrypt password hashing, an HMAC-signed session cookie, edge
middleware gating every route, two-step OTP-verified sign-up, and OTP-based
forgot/reset password. One `otp_challenge` table backs both OTP flows
(`purpose: 'signup' | 'reset'`) rather than two near-identical tables.

**Why not NextAuth / Auth.js / Clerk / Supabase Auth:**

- **The requirement is genuinely small.** Email + password, one session, no OAuth, no magic links, no social login. NextAuth is a lot of dependency weight to solve a problem that is a few hundred lines.
- **We already own the users table.** `app_user` exists with roles and status. Most auth libraries want to own that schema, which means either adopting theirs or writing an adapter.
- **The eventual target is Cognito.** `IOT-frontend` uses a five-state Cognito flow. Adding NextAuth now means migrating off it later — two migrations instead of one.

**Why the specific primitives:**

| Choice | Reason |
|---|---|
| **scrypt** (not bcrypt) | In node's stdlib — no native module to compile. Memory-hard, so resists GPU cracking better than PBKDF2. Also used to hash OTP codes — same primitive, one fewer thing to reason about. |
| **Web Crypto** for session signing (not `node:crypto`) | The *same code* must run in edge middleware and node handlers. `node:crypto` would crash on edge. |
| **Expiry inside the signed payload** | Cannot be extended client-side. Verified by test. |
| **`timingSafeEqual`** | Constant-time comparison; a length mismatch must not short-circuit early. |
| **Identical error for unknown email / wrong password / disabled** | Otherwise login becomes an account-enumeration oracle. |
| **6-digit OTP codes, not clickable email links** | Email scanners / link-preview bots pre-fetch links, which would burn a single-use reset token before the human ever clicks it. A code typed back into the app has no such failure mode. |
| **OTP hashed, never stored in plaintext, 10-minute TTL, 5-attempt cap** | Same reasoning as passwords — a leaked `otp_challenge` row should not be directly usable, and unlimited guesses would make a 6-digit code brute-forceable. |

**"Organization = user":** one `app_user` row per `organization`, created
atomically in the same transaction on sign-up. No invite flow, no team
members, no roles beyond the single owner — this is a permanent product
decision, not a phase-one simplification. Every org-scoped read/write filters
by the `orgId` derived from the session, never from client input; a row
belonging to another org 404s rather than 403s, so existence cannot be probed.

> ⚠️ **Before anything public-facing:** the dev password hash is committed in
> `db/seed.sql` so a fresh `npm run db:setup` produces a working login. Correct
> locally, wrong anywhere else.

---

## 7. NVIDIA VSS — the AI engine

**What it is:** NVIDIA's open-source Video Search and Summarization blueprint.
Vision-language models, RAG, alerting and search across video.

**Why we do not fork it:** it is upstream we want to keep pulling from. Building
inside `video-search-and-summarization/` would turn every `git pull` into a
merge conflict. It is a **deployed dependency reached over HTTP**, not a
codebase we extend.

**Which parts we use:**

| Service | Purpose |
|---|---|
| **LVS** (`video-summarization`) | `/v1/summarize` + poll (recorded), `/v1/generate_captions` + `/v1/stream_summarize` (live) |
| **VST / VIOS** | Video storage, chunked upload |
| **RTVI** (`rt-vlm`) | Live camera registration (`/v1/stream/add`) and teardown — a separate microservice from LVS, not an alternate name for it |
| **Elasticsearch / Milvus** | VSS-side storage for captions and search |
| **Alert Bridge** | Real-time alerting — its own deployed profile, not yet integrated *(deferred, see [ARCHITECTURE.md](./ARCHITECTURE.md))* |

**Recorded and live are genuinely different API shapes, not one endpoint with
a flag.** Recorded (`/v1/summarize`) is async job+poll. Live is a two-call,
two-service handshake: register the camera with RTVI, start captioning on LVS,
then repeatedly call `/v1/stream_summarize` on LVS, which blocks and always
returns `summarization.completion` — there is no live equivalent of
`summarization.progressing`. Getting this shape wrong before writing code
would have meant building against an imagined SSE stream that does not exist.

**Wire types are copied from the OpenAPI spec, not invented.**
`lib/vss/types.ts` mirrors `services/video-summarization/api_spec/openapi.json`.
That is where `summarization.progressing` came from, and where the request
field is confirmed to be `events` (not `event_types` — an earlier version of
this codebase had that wrong on both the recorded and live paths).

---

## 8. The mock layer — the most important decision

`lib/vss/mock.ts` returns the **real** `CompletionResponse` shape for both
paths: the `progressing → completion` transition with realistic timing for
recorded runs, and a stateful live-stream simulation (register → start
captioning → repeated `stream_summarize` polls with a summary that visibly
grows as simulated time passes → stop) that mirrors the real service's error
behavior — calling `stream_summarize` before registering, or after stopping,
throws the same way the real services would.

**Why this shaped everything:** VSS needs a GPU, an NGC key, and a multi-service
Docker stack. Waiting for that would have blocked *all* UI work for weeks.

With the mock, the entire first cut — C1, C2, C3, C4a, C5, auth, and the live
client layer — was built and tested on a laptop with **no GPU**. When real VSS
lands:

```diff
- USE_MOCK_VSS=true
+ USE_MOCK_VSS=false
```

No code changes.

**Where it is honest about limits:** `detectedIncidents()` on the *real* client
returns `[]`, because real VSS does not hand back a structured incident list —
detections must be parsed from captions or read from Elasticsearch. A real run
shows a summary with an empty timeline. That is better than inventing
detections that were never reported.

---

## 8a. The mail layer — the same pattern, a third time

`lib/mail/index.ts` switches on `SMTP_HOST`: unset → `console.ts` (OTP codes
land in the server log, zero setup), set → `smtp.ts` (real send via
Nodemailer). Nothing that calls `mailer.send()` — `issueOtp()` in particular —
knows or cares which is active.

**Why Nodemailer and not a provider SDK (SendGrid, SES SDK, Postmark):**
generic SMTP works with Gmail, Office 365, or any provider's SMTP interface —
including Amazon SES, which exposes one — so switching providers later is a
credentials change, not a code change.

---

## 9. What we deliberately did *not* add

| Not used | Why not | Revisit when |
|---|---|---|
| ORM (Prisma/Drizzle) | Schema is the design doc; queries are simple | Schema doubles |
| NextAuth / Clerk | Requirement (incl. OTP sign-up/reset) is a few hundred lines; Cognito is the real target | Adopting OAuth/SSO |
| Redux / Zustand | Server components + `useState` cover it | Genuine cross-page client state |
| SWR / React Query | One polling loop, ~20 lines | Several polling surfaces |
| Component library | No design system to conform to yet | A designer defines one |
| Docker | Postgres already installed locally | Team needs identical envs |
| Monorepo (Turborepo) | One deployable | A second app appears |
| Testing framework | *(this is a gap, not a decision)* | **Now — see below** |

---

## 10. The one gap I would close first

**There are no automated tests.** Every check so far — the concurrency race, the
seven C3 guards, the fifteen auth cases, event diffing — was run by hand and
verified once.

Those checks were real and they caught real bugs. But they are not repeatable,
so nothing stops a future change from silently breaking them.

The highest-value first test is **not** UI coverage. It is the store layer:
event diffing and the atomic run completion. Both already had bugs, both are
pure functions over a database, and both are cheap to test.

Vitest would be the natural pick — it needs no Babel config and understands
TypeScript out of the box.
