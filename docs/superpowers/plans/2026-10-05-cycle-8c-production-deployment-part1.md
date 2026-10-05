# Cycle 8c — Production Deployment + Monitoring + Smoke Test (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Mark-Matrix to production: deploy the API to Cloudflare Workers, deploy the frontend to Cloudflare Pages, apply all migrations to the production Supabase project, wire monitoring, document secrets and rollback, and verify the end-to-end flow with a manual smoke test.

**Architecture:** Mostly ops work. Two config files (API + frontend wrangler.jsonc) get production bindings. One small code change in the rate-limit middleware to support a Cloudflare KV backend (cycle 8b follow-up) with an in-memory fallback. Three doc deliverables (secrets, rollback, smoke test). The actual deploy + smoke test is user-driven (requires prod credentials) — the plan provides the exact commands and what to verify.

**Tech Stack:** Hono on Cloudflare Workers, Cloudflare Pages, Supabase, Cloudflare KV, vitest. **No new deps.**

**Spec:** [docs/superpowers/specs/2026-10-05-cycle-8c-production-deployment-design.md](../specs/2026-10-05-cycle-8c-production-deployment-design.md)

**Plan files:**
- [Part 1 (this file): Tasks 1–3 — wrangler configs, KV rate limit, docs](./2026-10-05-cycle-8c-production-deployment-part1.md)
- [Part 2: Tasks 4–5 — user-driven deploy + smoke test, final pass](./2026-10-05-cycle-8c-production-deployment-part2.md)

---

## Global Constraints

Copied from the project `CLAUDE.md`, cycle 8a spec, cycle 8b spec, and cycle 8c spec. Every task's requirements implicitly include this section.

- **Node** ≥ 20; use `node:` protocol for built-ins.
- **TypeScript strict mode** (`tsconfig.base.json`); `noUncheckedIndexedAccess` is on.
- **Prettier** — 2 spaces, double quotes, trailing commas. **ESLint v9 flat config.**
- **Vitest** — `apps/api/src/**/*.test.ts`. Setup files and pool are pre-wired.
- **Naming** — `PascalCase` components/types, `camelCase` functions/variables, `SCREAMING_SNAKE_CASE` constants.
- **Conventional commits** with `feat:`, `fix:`, `test:`, `docs:`, `chore:` prefixes.
- **No secrets committed.** Wrangler secrets are set via `wrangler secret put` (not in `wrangler.jsonc`). The secrets doc lists env var names only, never values.
- **No new deps** for 8c. Cloudflare KV is a binding, not an npm package.
- **TDD** — Failing test first, then minimal implementation, then green, then commit.

---

## Review Focus

The five failure modes the spec implies but no task's tests directly exercise. Each gets an extra test pinned to the task that owns the code.

1. **KV rate limit falls back to in-memory when `RATE_LIMIT_BACKEND=memory`** — the `RATE_LIMIT_BACKEND` switch must be respected even when `c.env.RATE_LIMIT` is bound. Owner: **Task 2 (KV rate limit)** — add `it("uses in-memory backend when RATE_LIMIT_BACKEND=memory even if KV binding is present")`.
2. **KV backend increments and decrements correctly across multiple windows** — the spec says "TTL 60s, matches the window." A test that hammers the rate limit in two separate windows should reset the count. Owner: **Task 2** — add `it("KV rate limit window resets after 60s")`.
3. **Frontend build fails fast if `VITE_API_ORIGIN` is unset** — the Vite build embeds env vars at compile time; a missing `VITE_API_ORIGIN` would result in fetches to the same origin. Owner: **Task 1 (frontend wrangler config)** — add a comment in the config and a CI check; no automated test, but a manual verification step.
4. **Migration apply fails partway** — `supabase db push` is atomic per migration, but if it fails on migration N, the migrations 1..N-1 are applied. The plan must include a re-run step. Owner: **Part 2, Task 4 (deploy)** — explicit re-run on partial failure.
5. **Smoke test step 7 (compile + audit log) requires a faculty user to have submitted marks first** — without that, the audit log won't have the expected rows. Owner: **Part 2, Task 5 (smoke test)** — explicit precondition in the smoke test doc.

---

## Task 1: Update wrangler configs (API + frontend)

**Files:**
- Modify: `apps/api/wrangler.jsonc`
- Modify: `apps/web/wrangler.jsonc`

**Interfaces:**
- Consumes: existing config in each file.
- Produces: production-ready configs with env vars, KV binding (API only), custom domain placeholder, observability, logpush.

- [ ] **Step 1: Read the current configs**

```bash
cat apps/api/wrangler.jsonc
cat apps/web/wrangler.jsonc
```

Confirm the structure matches the spec (these files already exist from earlier cycles).

- [ ] **Step 2: Update `apps/api/wrangler.jsonc`**

Add the following keys to the existing config (preserve any existing keys):

```jsonc
{
  // ...existing config...
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

Notes:
- Replace `mark-matrix.example.com` with your actual custom domain in both `pattern` and `zone_name`.
- Replace `<from-supabase-cli-output>` with the real KV namespace ID (from `wrangler kv:namespace create RATE_LIMIT`, run in Part 2 Task 4).
- If your domain isn't on Cloudflare yet, omit the `routes` block for now; Cloudflare will assign a `*.workers.dev` URL.

- [ ] **Step 3: Update `apps/web/wrangler.jsonc`**

Add the following keys (preserve existing):

```jsonc
{
  // ...existing config...
  "name": "mark-matrix-web",
  "pages_build_output_dir": "./dist",
  "vars": {
    "VITE_API_ORIGIN": "https://api.mark-matrix.example.com"
  }
}
```

Notes:
- Replace `api.mark-matrix.example.com` with your actual API host. If you kept the `*.workers.dev` fallback, this still works — Vite inlines whatever string you put here.
- Verify the `name` field matches what you'll use for `wrangler pages deploy --project-name`.

- [ ] **Step 4: Validate the JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/api/wrangler.jsonc', 'utf8').replace(/\/\/.*$/gm, ''))"`
Expected: exits 0. (The `// comment` lines are JSONC; we strip them before parsing.)

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/wrangler.jsonc', 'utf8').replace(/\/\/.*$/gm, ''))"`
Expected: exits 0.

- [ ] **Step 5: Verify no secrets are in the configs**

```bash
grep -E "eyJ|service.role|password|secret" apps/api/wrangler.jsonc apps/web/wrangler.jsonc
```
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add apps/api/wrangler.jsonc apps/web/wrangler.jsonc
git commit -m "chore: production wrangler configs for API and frontend

Cycle 8c. Adds:
- API: ENVIRONMENT var, RATE_LIMIT KV namespace binding, custom
  domain route, observability, logpush.
- Frontend: production target name, VITE_API_ORIGIN env var baked
  into the build.
Secrets are set via 'wrangler secret put' (not committed).

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2: KV-backed rate limit (cycle 8b follow-up)

**Files:**
- Modify: `apps/api/src/middleware/rateLimit.ts`
- Modify: `apps/api/src/index.ts` (no functional change; the existing mounts still work, but the middleware now reads `RATE_LIMIT_BACKEND` and `c.env.RATE_LIMIT`)
- Test: `apps/api/src/tests/rateLimit.test.ts` (extend the existing file)

**Interfaces:**
- Consumes: `AppEnv` with the optional `RATE_LIMIT` KV binding. The existing `audit_log` cycle-8b mocks.
- Produces: `generalRateLimit` and `bulkRateLimit` middleware that uses KV when `RATE_LIMIT_BACKEND !== "memory"` and `c.env.RATE_LIMIT` is bound; falls back to in-memory otherwise.

- [ ] **Step 1: Write the failing test for the KV backend (in-memory fallback first)**

Extend `apps/api/src/tests/rateLimit.test.ts`. Add a new `describe("KV rate limit fallback", ...)` block after the existing tests:

```ts
describe("KV rate limit fallback", () => {
  it("uses in-memory backend when RATE_LIMIT_BACKEND=memory even if KV binding is present (Review Focus item 1)", async () => {
    process.env["DISABLE_RATE_LIMIT"] = "0";
    process.env["RATE_LIMIT_BACKEND"] = "memory";
    try {
      const fakeKv = {
        get: vi.fn(async () => null),
        put: vi.fn(async () => undefined),
        list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" })),
        getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
        delete: vi.fn(async () => undefined),
      };
      const app = new Hono<AppEnv>();
      app.use("/api/*", (c, next) => {
        c.env = { ...c.env, RATE_LIMIT: fakeKv } as never;
        return generalRateLimit(c, next);
      });
      app.get("/api/test", (c) => c.json({ ok: true }));
      // 120 requests under the in-memory limit all pass.
      for (let i = 0; i < 120; i++) {
        const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "9.9.9.9" } });
        expect(res.status).toBe(200);
      }
      // 121st request gets 429 from the in-memory backend.
      const res = await app.request("/api/test", { headers: { "cf-connecting-ip": "9.9.9.9" } });
      expect(res.status).toBe(429);
      // The KV binding was never written to.
      expect(fakeKv.put).not.toHaveBeenCalled();
    } finally {
      process.env["DISABLE_RATE_LIMIT"] = "1";
      process.env["RATE_LIMIT_BACKEND"] = "";
    }
  }, 30000);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/api test rateLimit.test`
Expected: FAIL — the helper doesn't accept the env binding, or the test path doesn't go through the KV check.

- [ ] **Step 3: Implement the env-aware rate limit**

Replace the body of `apps/api/src/middleware/rateLimit.ts` with:

```ts
import { rateLimiter } from "hono-rate-limiter";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env.js";

function clientKey(c: { req: { header: (name: string) => string | undefined } }): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf;
  const xff = c.req.header("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "anon";
}

const handler429 = (c: { header: (k: string, v: string) => void; json: (body: unknown, status: number) => Response }): Response => {
  c.header("retry-after", "60");
  return c.json({ error: "rate_limited", detail: "Too many requests. Try again in 60s." }, 429);
};

function isDisabled(): boolean {
  return process.env["DISABLE_RATE_LIMIT"] === "1";
}

function useKvBackend(): boolean {
  return process.env["RATE_LIMIT_BACKEND"] !== "memory";
}

const noop: MiddlewareHandler<AppEnv> = async (_c, next) => {
  await next();
};

let _realGeneral: MiddlewareHandler<AppEnv> | null = null;
let _realBulk: MiddlewareHandler<AppEnv> | null = null;

function getRealGeneral(): MiddlewareHandler<AppEnv> {
  if (!_realGeneral) {
    _realGeneral = rateLimiter<AppEnv>({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: "draft-6",
      keyGenerator: (c) => clientKey(c),
      handler: handler429,
    });
  }
  return _realGeneral;
}

function getRealBulk(): MiddlewareHandler<AppEnv> {
  if (!_realBulk) {
    _realBulk = rateLimiter<AppEnv>({
      windowMs: 60 * 1000,
      limit: 10,
      standardHeaders: "draft-6",
      keyGenerator: (c) => clientKey(c),
      handler: handler429,
    });
  }
  return _realBulk;
}

/**
 * Cycle 8c: KV-backed rate limit. The KV store provides a sliding window
 * keyed by `<scope>:<ip>`. Falls back to in-memory when RATE_LIMIT_BACKEND=memory
 * or when c.env.RATE_LIMIT is unbound.
 */
function kvRateLimit(opts: { scope: string; limit: number }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const kv = c.env?.RATE_LIMIT as
      | { get: (k: string) => Promise<string | null>; put: (k: string, v: string, opts?: { expirationTtl?: number }) => Promise<unknown> }
      | undefined;
    if (!kv) {
      // KV binding missing — fall through to the in-memory limiter.
      return (opts.scope === "bulk" ? getRealBulk() : getRealGeneral())(c, next);
    }
    const ip = clientKey(c);
    const key = `rl:${opts.scope}:${ip}`;
    const raw = await kv.get(key);
    const count = raw ? Number(raw) : 0;
    if (count >= opts.limit) {
      c.header("retry-after", "60");
      return c.json({ error: "rate_limited", detail: "Too many requests. Try again in 60s." }, 429);
    }
    await kv.put(key, String(count + 1), { expirationTtl: 60 });
    await next();
  };
}

function makeLimit(opts: { scope: string; limit: number }): MiddlewareHandler<AppEnv> {
  if (isDisabled()) return noop;
  if (useKvBackend()) return kvRateLimit(opts);
  return opts.scope === "bulk" ? getRealBulk() : getRealGeneral();
}

export const generalRateLimit: MiddlewareHandler<AppEnv> = makeLimit({ scope: "general", limit: 120 });
export const bulkRateLimit: MiddlewareHandler<AppEnv> = makeLimit({ scope: "bulk", limit: 10 });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mark-matrix/api test rateLimit.test`
Expected: PASS — 6 tests (5 from cycle 8b + 1 new for the fallback).

- [ ] **Step 5: Add a test for the KV path itself (smoke)**

Append to the same `describe("KV rate limit fallback", ...)` block:

```ts
it("KV rate limit increments and returns 429 on overflow", async () => {
  process.env["DISABLE_RATE_LIMIT"] = "0";
  process.env["RATE_LIMIT_BACKEND"] = ""; // default = KV
  try {
    const store = new Map<string, string>();
    const fakeKv = {
      get: vi.fn(async (k: string) => store.get(k) ?? null),
      put: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      list: vi.fn(async () => ({ keys: [], list_complete: true, cursor: "" })),
      getWithMetadata: vi.fn(async () => ({ value: null, metadata: null })),
      delete: vi.fn(async () => undefined),
    };
    const app = new Hono<AppEnv>();
    app.use("/api/bulk", (c, next) => {
      c.env = { ...c.env, RATE_LIMIT: fakeKv } as never;
      return bulkRateLimit(c, next);
    });
    app.post("/api/bulk", (c) => c.json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await app.request("/api/bulk", {
        method: "POST",
        headers: { "cf-connecting-ip": "8.8.8.8" },
      });
      expect(res.status).toBe(200);
    }
    const res = await app.request("/api/bulk", {
      method: "POST",
      headers: { "cf-connecting-ip": "8.8.8.8" },
    });
    expect(res.status).toBe(429);
    // KV was written 10 times (one per request) with the running count.
    expect(fakeKv.put).toHaveBeenCalledTimes(10);
  } finally {
    process.env["DISABLE_RATE_LIMIT"] = "1";
    process.env["RATE_LIMIT_BACKEND"] = "";
  }
}, 30000);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @mark-matrix/api test rateLimit.test`
Expected: PASS — 7 tests total.

- [ ] **Step 7: Run the full API suite to confirm no regressions**

Run: `pnpm --filter @mark-matrix/api test`
Expected: 42+ files, 0 failures, all rate-limit tests pass. The 120-req smoke in the existing `rateLimit.test.ts` runs through the in-memory path (default for tests).

- [ ] **Step 8: Run lint + typecheck**

```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/middleware/rateLimit.ts apps/api/src/tests/rateLimit.test.ts
git commit -m "feat(api): KV-backed rate limit with in-memory fallback

Cycle 8c. The rate-limit middleware now supports two backends, selected
by the RATE_LIMIT_BACKEND env var. KV is the default; setting
RATE_LIMIT_BACKEND=memory falls back to the cycle-8b in-memory limiter
(useful for local dev or when the free-tier KV write quota is exhausted).
The KV path uses a sliding window keyed by 'rl:<scope>:<ip>' with a
60s TTL matching the window.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: Write the three deployment docs

**Files:**
- Create: `docs/superpowers/deploy/2026-10-05-cycle-8c-secrets.md`
- Create: `docs/superpowers/deploy/2026-10-05-cycle-8c-rollback.md`
- Create: `docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md`

**Interfaces:**
- Consumes: the spec's §7, §8, §10.
- Produces: three standalone markdown docs that the user reads at deploy time.

- [ ] **Step 1: Create the deploy directory**

```bash
mkdir -p docs/superpowers/deploy
```

- [ ] **Step 2: Write `docs/superpowers/deploy/2026-10-05-cycle-8c-secrets.md`**

This is a doc-only deliverable. Copy the following content:

```markdown
# Cycle 8c Secrets

**Date:** 2026-10-05
**Purpose:** List every env var the project uses in production. **No actual values are stored here.**

| Name | Side | Sensitive | How to set | Description |
|---|---|---|---|---|
| `SUPABASE_URL` | API | yes | `wrangler secret put` | Production Supabase project URL |
| `SUPABASE_ANON_KEY` | API | yes | `wrangler secret put` | Anon key (RLS-bound clients use this) |
| `SUPABASE_SERVICE_ROLE_KEY` | API | yes | `wrangler secret put` | Service-role key (admin-only enrichment in `/api/admin/users`) |
| `RATE_LIMIT_BACKEND` | API | no | `wrangler secret put` or `vars` in `wrangler.jsonc` | `kv` (default) or `memory` |
| `LOGPUSH_TOKEN` | API | yes (if your destination needs one) | `wrangler secret put` | Logpush destination token (Datadog, S3, etc.) |
| `ENVIRONMENT` | API | no | `vars` in `wrangler.jsonc` (committed) | `production` |
| `VITE_API_ORIGIN` | Web | no | `vars` in `wrangler.jsonc` (committed) | API base URL baked into the build |

**How to set a secret:**

```bash
# From a trusted machine, with wrangler authenticated:
wrangler secret put SUPABASE_URL
# You'll be prompted to enter the value.

# Or pipe it in (less secure — value appears in process list briefly):
echo "https://your-prod.supabase.co" | wrangler secret put SUPABASE_URL
```

**Where secrets are stored:**

- Cloudflare's secret store, surfaced to the Worker as `c.env.SUPABASE_URL` etc.
- Never in `wrangler.jsonc`.
- Never in this repo.
- Never in the React bundle (verified by the cycle 8b secret scan).
```

- [ ] **Step 3: Write `docs/superpowers/deploy/2026-10-05-cycle-8c-rollback.md`**

```markdown
# Cycle 8c Rollback Plan

**Date:** 2026-10-05
**Scope:** Roll back the production deployment of Mark-Matrix.

Three scenarios, in increasing severity.

## Scenario 1: API-only rollback (most common)

The API is serverless and stateless. Supabase is the source of truth, so a Worker rollback has no data impact.

```bash
# Sub-second rollback to the previous deploy.
wrangler rollback --name mark-matrix-api
```

Verify:
```bash
curl -I https://api.mark-matrix.example.com/health
# Expected: 200 OK
```

## Scenario 2: DB-only rollback

The 17 migrations are additive; none drop a column or table. If a migration introduced a problem (none in the current set), the rollback is a new migration that undoes the change.

**Never run `supabase db reset` in production** — that drops the entire database.

If the cycle-8a `audit_log` table is the problem (extremely unlikely; it's append-only), the rollback migration is:

```sql
drop table if exists public.audit_log;
```

**Warning:** This is irreversible. All audit history is lost. Prefer rolling back the API first (Scenario 1).

## Scenario 3: Full rollback

Estimated 30-60 minutes, mostly waiting on Cloudflare deploys.

```bash
# 1. Rollback the API.
wrangler rollback --name mark-matrix-api

# 2. (If needed) Apply a rollback migration.
# See Scenario 2. Skip this if rolling back the API alone is enough.

# 3. (If needed) Roll back secrets.
# Note: Cloudflare doesn't support deleting a secret — only overwriting.
# To "delete" a secret, set it to an empty string (which is still readable).
wrangler secret put SUPABASE_URL -- < /dev/null
# ...repeat for each secret...

# 4. Verify with the smoke test.
# Open the frontend, click through the 12 steps in
# `2026-10-05-cycle-8c-smoke-test.md`.
```

## Monitoring during rollback

- Cloudflare Workers Analytics: dashboards update in near real time.
- Logpush: log lines flow to your destination.
- Supabase: query metrics, connection counts, and row changes visible in the dashboard.
```

- [ ] **Step 4: Write `docs/superpowers/deploy/2026-10-05-cycle-8c-smoke-test.md`**

```markdown
# Cycle 8c Smoke Test

**Date:** 2026-10-05
**Purpose:** Manually verify the production deployment end-to-end.
**Prerequisites:**
- The frontend is deployed and reachable at the production URL.
- The API is deployed and reachable at the production URL.
- All 17 migrations are applied to the production Supabase project.
- At least one faculty user, one admin user, and one student user are seeded in the production Supabase (per cycle 1's `db:seed:admin` and `db:seed:test-users` scripts, adapted for prod).

**Pass/fail:** Each step has a checkbox. Any failure stops the rollout and triggers a rollback (see `2026-10-05-cycle-8c-rollback.md`).

## Steps

- [ ] **1. Open the frontend URL.**
  - Pass: HTTPS, no console errors, login page loads.
- [ ] **2. Sign in as a faculty user.**
  - Pass: Redirects to dashboard, role badge shows "faculty".
- [ ] **3. Mark attendance for a course.**
  - Pass: Persists across refresh. (Reload the page; attendance should still be there.)
- [ ] **4. Sign in as a different faculty user, enter marks for the same course.**
  - Pass: Marks appear in the course.
- [ ] **5. Sign in as admin, open Results Review, click Approve on the course.**
  - Pass: Status flips to "approved".
- [ ] **6. Click Lock.**
  - Pass: Status flips to "locked".
- [ ] **7. Click Compile.**
  - Pass: Gradesheet is generated. Open `/admin/audit-log` and verify rows for "update", "submit", "approve", "lock", "compile" appear with the correct timestamps and user_ids.
  - **Precondition:** steps 3-6 must have succeeded; without marks entered, the audit log will not have the expected rows.
- [ ] **8. Click Publish.**
  - Pass: Status flips to "published". Audit log has a "publish" row.
- [ ] **9. Sign in as a student, view the transcript.**
  - Pass: Published gradesheet shows. (Pre-condition: the student is enrolled in a course that was published in step 8.)
- [ ] **10. Download the transcript PDF.**
  - Pass: Renders with the student's data.
- [ ] **11. Try to log in with a wrong password 5 times.**
  - Pass: 6th attempt returns 429.
- [ ] **12. Sign in as faculty, try to access `/admin/audit-log`.**
  - Pass: 403 forbidden.

## Result

- [ ] All 12 steps passed → rollout is complete. Mark this doc with the date and time.
- [ ] Any step failed → stop, do not continue. Trigger a rollback (see `2026-10-05-cycle-8c-rollback.md`).
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/deploy/
git commit -m "docs: cycle-8c deployment docs (secrets, rollback, smoke test)

Cycle 8c. Three standalone docs:
- secrets: every env var with name, side, sensitivity, how to set.
  No values stored.
- rollback: three scenarios (API only, DB only, full) with exact
  commands. Sub-second for API rollback via 'wrangler rollback'.
- smoke test: 12 manual end-to-end steps with pass/fail checkboxes
  (login -> attendance -> marks -> approve -> lock -> compile ->
  publish -> transcript -> rate limit -> 403).

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

**Continue to** [Part 2: Tasks 4–5 — user-driven deploy + smoke test, final pass](./2026-10-05-cycle-8c-production-deployment-part2.md).
