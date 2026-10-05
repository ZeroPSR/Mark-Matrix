# Cycle 8c — Production Deployment + Monitoring + Smoke Test (Design Spec)

**Status:** Draft, awaiting review.
**Branch context:** `main`; cycles 8a (audit logging) and 8b (security hardening + admin audit-log UI) just shipped. 8c is the final cycle of the cycle-8 trilogy — production deployment.
**Goal:** Ship Mark-Matrix to production: deploy the API to Cloudflare Workers, deploy the frontend to Cloudflare Pages, apply all migrations to the production Supabase project, wire monitoring, document secrets and rollback, and verify the end-to-end flow with a manual smoke test.

---

## 1. Scope

**In scope:**

- Cloudflare Workers config for `apps/api` (env vars, KV namespace binding, custom domain, observability, logpush).
- Cloudflare Pages config for `apps/web` (production target, `VITE_API_ORIGIN` baked into the build, custom domain).
- Migrations: all 17 (cycles 1-7 + 8a) applied to the production Supabase project via `supabase db push --include-all`.
- Secrets setup doc at `docs/superpowers/deploy/2026-10-05-cycle-8c-secrets.md` — every env var named, with where it's set and how. No actual values in the doc.
- Rollback plan at `docs/superpowers/deploy/2026-10-05-cycle-8c-rollback.md` — three scenarios: API only, DB only, full.
- Monitoring: Cloudflare Workers Analytics Engine (built-in), Logpush (built-in), Supabase dashboard (built-in). No new code.
- Smoke test at `docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md` — 12 manual end-to-end steps with pass/fail checkboxes.
- KV-backed rate limiting (cycle 8b follow-up): replaces the in-memory `hono-rate-limiter` with a KV-backed store. `RATE_LIMIT_BACKEND=kv|memory` env var for rollback.

**Out of scope (deferred to future cycles):**

- Real-time audit-log streaming.
- Audit-log retention policy.
- Custom email alerts for high-risk actions.
- Staging environment (we deploy directly to prod per the user's choice; smoke test runs against prod).
- Automated smoke test (it's a manual run; the existing test suite is the regression net).

---

## 2. Architecture Overview

8c is mostly ops, not code. The shape:

```
                        ┌─────────────────────┐
                        │  Cloudflare Pages    │
                        │  (apps/web)          │
                        │  mark-matrix.example  │
                        │  .com                │
                        └──────────┬───────────┘
                                   │ HTTPS
                                   ▼
                        ┌─────────────────────┐
                        │  Cloudflare Workers  │
                        │  (apps/api)          │
                        │  api.mark-matrix.    │
                        │  example.com         │
                        │  + KV (rate limit)   │
                        └──────────┬───────────┘
                                   │ HTTPS (Supabase JS)
                                   ▼
                        ┌─────────────────────┐
                        │  Supabase (prod)     │
                        │  17 migrations       │
                        │  (cycles 1-7 + 8a)    │
                        └─────────────────────┘
```

**Where 8c lives in the source tree:**

- `apps/api/wrangler.jsonc` — add env, KV binding, custom domain, observability
- `apps/web/wrangler.jsonc` — add production target, `VITE_API_ORIGIN`
- `apps/api/src/middleware/rateLimit.ts` — add KV backend (cycle 8b follow-up)
- `docs/superpowers/deploy/2026-10-05-cycle-8c-secrets.md` — secrets table
- `docs/superpowers/deploy/2026-10-05-cycle-8c-rollback.md` — rollback playbook
- `docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md` — manual smoke checklist

No migrations, no new code in the API or frontend beyond the KV rate-limit backend.

---

## 3. Cloudflare Workers Config (API)

**`apps/api/wrangler.jsonc` changes (additive):**

```jsonc
{
  "name": "mark-matrix-api",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "ENVIRONMENT": "production"
  },
  "kv_namespaces": [
    { "binding": "RATE_LIMIT", "id": "<from-supabase-cli-output>" }
  ],
  "routes": [
    { "pattern": "api.mark-matrix.example.com/*", "zone_name": "mark-matrix.example.com" }
  ],
  "observability": {
    "enabled": true,
    "head_sampling_rate": 1.0
  },
  "logpush": true
}
```

- `vars.ENVIRONMENT = "production"` — API can branch on this (e.g., stricter rate limits).
- `kv_namespaces[0].binding = "RATE_LIMIT"` — exposed in the Worker env as `c.env.RATE_LIMIT`. Used by the rate-limit middleware (cycle 8b follow-up, see §9).
- `routes` — custom domain. The pattern is `${subdomain}.${zone}/*`. You'll provide both.
- `observability.enabled = true` — turns on Workers Analytics Engine (free, 100k events/day).
- `observability.head_sampling_rate = 1.0` — sample every request. For a low-traffic app, 1.0 is fine; for high-traffic, drop to 0.1.
- `logpush: true` — enables the structured log stream. Destination is configured in the Cloudflare dashboard.

**Secrets (set via `wrangler secret put <NAME>` from a trusted machine):**

| Name | Where | Source |
|---|---|---|
| `SUPABASE_URL` | `wrangler secret put` | Production Supabase project URL |
| `SUPABASE_ANON_KEY` | `wrangler secret put` | Anon key from Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | `wrangler secret put` | Service-role key from Supabase dashboard |

These never appear in `wrangler.jsonc` (which is committed). They're set in Cloudflare's secret store and surfaced to the Worker via `c.env.SUPABASE_URL` etc.

---

## 4. Cloudflare Pages Config (Frontend)

**`apps/web/wrangler.jsonc` changes (additive):**

```jsonc
{
  "name": "mark-matrix-web",
  "pages_build_output_dir": "./dist",
  "vars": {
    "VITE_API_ORIGIN": "https://api.mark-matrix.example.com"
  }
}
```

- Production target is implicit when you run `wrangler pages deploy ./dist --project-name mark-matrix-web`.
- `VITE_API_ORIGIN` is a Vite env var (prefix `VITE_` makes it inlined into the build at compile time). All API calls in the frontend resolve against this base URL.

**No secrets on the frontend** — the anon key is designed to be public, and the service-role key is server-side only (verified by the cycle 8b secret scan).

---

## 5. Migrations

The prod Supabase project has 17 migrations to apply:

| File | Cycle |
|---|---|
| `20260818100000_create_profiles.sql` | 1 |
| `20260818100001_profiles_rls.sql` | 1 |
| `20260818100002_auth_hook_role_claim.sql` | 1 |
| `20260820100000_role_profiles.sql` | 2 |
| `20260820100001_academic_structure.sql` | 2 |
| `20260820100002_assignments_enrollments.sql` | 2 |
| `20260820100003_academic_rls.sql` | 2 |
| `20260820100004_profiles_admin_only_writes.sql` | 2 |
| `20260820100005_auth_hook_security_definer.sql` | 2 |
| `20260820100006_sync_role_to_auth_app_metadata.sql` | 2 |
| `20260820100007_attendance.sql` | 2 |
| `20260820100008_faculty_enrollments_read.sql` | 2 |
| `20260820100009_marks.sql` | 2 |
| `20260820100010_grade_schemes.sql` | 5 |
| `20260820100011_results_approval.sql` | 6 |
| `20260820100012_gradesheets_full_lock_trigger.sql` | 6 |
| `20260820100013_course_grades_is_passing.sql` | 7 |
| `20261001000000_audit_log.sql` | 8a |

**Apply via Supabase CLI:**

```bash
# One-time: link the local CLI to the prod project.
# You'll need the project ref (visible in the Supabase dashboard URL).
supabase link --project-ref <prod-project-ref>

# Push all migrations.
supabase db push --include-all
```

`--include-all` is required so the CLI doesn't try to be clever about which migrations are new; it just runs them all. The migrations are idempotent (use `create table if not exists`, `create or replace function`, `drop policy if exists` where relevant), so a partial-previous state is safe to re-apply.

**Order is enforced by the filename timestamp prefix** (`YYYYMMDDhhmmss_*.sql`).

---

## 6. KV-Backed Rate Limit (cycle 8b follow-up)

**`apps/api/src/middleware/rateLimit.ts` updates:**

The current implementation uses an in-memory `Map` (per-isolate state). Replace with a Cloudflare KV store, keeping the in-memory path as a fallback.

**New env var:**
- `RATE_LIMIT_BACKEND` — `"kv"` (default, when `RATE_LIMIT` KV binding is present) or `"memory"` (fallback for local dev / free-tier exhaustion).

**Algorithm (KV backend):**
- Key: `rl:<scope>:<ip>` where `<scope>` is `general` or `bulk`.
- Value: the current count in the window.
- TTL: 60 seconds (matches the window).
- On each request: `INCR` the key. If the result is `<= limit`, allow. Otherwise 429.

**Free-tier consideration:** Cloudflare KV free tier allows 1,000 writes/day. Each request does one write. At a sustained 1 req/sec across the day, we hit 86,400 writes — well over the limit. The `RATE_LIMIT_BACKEND=memory` env var lets you flip to in-memory if you hit the free-tier ceiling. **Recommend paid plan for prod** (Workers Paid includes 1M KV writes/day).

**Mount in `apps/api/src/index.ts`:** no change to the route mounts; the `generalRateLimit` / `bulkRateLimit` exports continue to be the middleware functions, but they now read `RATE_LIMIT_BACKEND` and switch on it.

---

## 7. Secrets Doc

**`docs/superpowers/deploy/2026-10-05-cycle-8c-secrets.md` (NEW):**

A single table. Columns: name, side (api/web/Supabase), sensitive (yes/no), how to set, one-line description. **No actual values.**

| Name | Side | Sensitive | How to set | Description |
|---|---|---|---|---|
| `SUPABASE_URL` | API | yes | `wrangler secret put` | Production Supabase project URL |
| `SUPABASE_ANON_KEY` | API | yes | `wrangler secret put` | Anon key (RLS-bound clients use this) |
| `SUPABASE_SERVICE_ROLE_KEY` | API | yes | `wrangler secret put` | Service-role key (admin-only enrichment) |
| `VITE_API_ORIGIN` | Web | no | `wrangler.jsonc` (committed) | API base URL baked into the build |
| `RATE_LIMIT_BACKEND` | API | no | `wrangler secret put` (or `vars`) | `kv` (default) or `memory` |
| `ENVIRONMENT` | API | no | `wrangler.jsonc` (committed) | `production` |
| `LOGPUSH_TOKEN` | API | yes | `wrangler secret put` | Logpush destination token (if your destination requires one) |

---

## 8. Rollback Plan

**`docs/superpowers/deploy/2026-10-05-cycle-8c-rollback.md` (NEW):**

Three scenarios, in increasing severity.

### 8.1 API-only rollback (most common)

The API is serverless and stateless (no persistent state in the Worker — Supabase is the source of truth). Rolling back is one command:

```bash
wrangler rollback --name mark-matrix-api
```

This rolls the Worker to the previous deploy. Sub-second. No data loss. Use this when the API has a bug but the DB is fine.

### 8.2 DB-only rollback

The 17 migrations are additive; there is no destructive migration in cycles 1-8a. If a migration introduced a problem (none in the current set), the rollback is a new migration that undoes the change. **Never run `supabase db reset` in prod** — that drops the entire database.

The only true destructive change in 8c is dropping the `audit_log` table if the cycle-8a audit logging is the problem. That migration would be:

```sql
drop table if exists public.audit_log;
```

**Warning:** This is irreversible. All audit history is lost. Prefer rolling back the API to a version that doesn't call `audit_log_write` first.

### 8.3 Full rollback

API + DB + secrets revert. Estimated 30-60 minutes, mostly waiting on Cloudflare deploys.

```bash
# 1. Rollback the API.
wrangler rollback --name mark-matrix-api

# 2. (If needed) Drop the audit_log table.
supabase db push --include-all   # with a new migration that drops audit_log
# (Alternative: skip — the API no longer calls audit_log_write after rollback)

# 3. (If needed) Roll back secrets.
wrangler secret put SUPABASE_URL -- < old-url.txt
# ...repeat for each secret...

# 4. Verify with the smoke test.
# Open the frontend, click through the 12 steps.
```

---

## 9. Monitoring

- **Cloudflare Workers Analytics Engine** — automatic once `observability.enabled = true`. Free tier includes 100k events/day. Visible in the Cloudflare dashboard under Workers → Analytics.
- **Cloudflare Logpush** — once `logpush: true`, configure the destination in the Cloudflare dashboard. Options: R2 bucket, Datadog, S3, HTTP endpoint. Cycle 8a already logs structured stderr for audit failures (`[audit_log] insert failed { action, entity, entity_id, error }`); Logpush picks it up.
- **Supabase dashboard** — free monitoring for query performance, connection counts, and row-level changes. Visible in the Supabase dashboard under Database → Query Performance, Logs, etc.

No new code, no new deps.

---

## 10. Smoke Test

**`docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md` (NEW):** a manual checklist of 12 steps. Each step has a pass/fail checkbox. Any failure stops the rollout and triggers a rollback.

| # | Step | Pass criteria |
|---|---|---|
| 1 | Open the deployed frontend URL in a browser. | HTTPS, no console errors, login page loads. |
| 2 | Sign in as a faculty user (pre-seeded in the prod Supabase). | Redirects to dashboard, role badge shows "faculty". |
| 3 | Mark attendance for a course. | Persists across refresh. |
| 4 | Sign in as a different faculty, enter marks for the same course. | Marks appear. |
| 5 | Sign in as admin, open Results Review, click Approve. | Status flips to "approved." |
| 6 | Click Lock. | Status flips to "locked." |
| 7 | Click Compile. | Gradesheet is generated. Open the admin Audit Log page. Verify rows for "update", "submit", "approve", "lock", "compile" appear. |
| 8 | Click Publish. | Status flips to "published." Audit log has a "publish" row. |
| 9 | Sign in as a student, view the transcript. | Published gradesheet shows. |
| 10 | Download the transcript PDF. | Renders with student data. |
| 11 | Try to log in with a wrong password 5 times. | Rate limit kicks in (429). |
| 12 | Try to access `/admin/audit-log` as a faculty user. | 403 forbidden. |

The smoke test is the only verification in 8c. The existing test suite (67 files, 0 failures) is the regression net for the code being deployed.

---

## 11. Test Strategy

8c is mostly ops work. The only test artifact is the smoke-test doc itself (manual). The existing test suite (api 42 + web 16 + shared 9 files, 0 failures) is the regression net.

No new automated tests in 8c. If the smoke test finds a bug, it becomes a follow-up cycle.

---

## 12. File Structure

```
apps/api/
  wrangler.jsonc                              MODIFY (env, KV, route, observability)
  src/middleware/rateLimit.ts                 MODIFY (KV backend, RATE_LIMIT_BACKEND switch)
apps/web/
  wrangler.jsonc                              MODIFY (vars, name, VITE_API_ORIGIN)
docs/superpowers/deploy/
  2026-10-05-cycle-8c-secrets.md              NEW
  2026-10-05-cycle-8c-rollback.md             NEW
  2026-10-05-cycle-8c-smoke-test.md           NEW
```

No migrations, no new code in `apps/api/src/routes/`, `apps/api/src/lib/`, or `apps/web/src/`.

---

## 13. Open Questions / Follow-ups

None for 8c. All of the cycle-8 spec's delivery list is covered:
- ✓ Cloudflare Workers config for the API
- ✓ Cloudflare Pages config for the frontend
- ✓ Migrations applied
- ✓ Secrets setup (documented, no secrets committed)
- ✓ Monitoring hooks
- ✓ Rollback plan
- ✓ Smoke test

Deferred to a future cycle:
- Real-time audit-log streaming.
- Audit-log retention policy.
- Custom email alerts for high-risk actions.
- Staging environment (deferred per the user's choice).
- Automated smoke test.
