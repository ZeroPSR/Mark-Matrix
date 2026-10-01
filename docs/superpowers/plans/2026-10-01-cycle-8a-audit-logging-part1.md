# Cycle 8a — Audit Logging Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tamper-evident audit log that records every security-sensitive write in the system, with full before/after snapshots, so post-hoc review can answer "who changed what, when, from what to what" for any state-changing action.

**Architecture:** New `audit_log` table + `audit_log_write` SECURITY DEFINER function (single insert entry point); `recordAudit` TypeScript helper that calls the RPC via `supabase.rpc`; 22 write paths across 9 route files instrumented with the 3-line "fetch before → mutate → recordAudit" pattern. RLS allows admin `SELECT` only; no role may `INSERT/UPDATE/DELETE` directly. Best-effort semantics: audit-insert failures are logged via `console.error` but never fail the data write.

**Tech Stack:** Hono on Cloudflare Workers, Supabase (Postgres + PostgREST + RLS), zod, vitest + `@cloudflare/vitest-pool-workers`, pnpm workspaces.

**Spec:** [docs/superpowers/specs/2026-10-01-cycle-8a-audit-logging-design.md](../specs/2026-10-01-cycle-8a-audit-logging-design.md)

**Plan files:**
- [Part 1 (this file): Tasks 1–3 — schema, helper, RLS tests](./2026-10-01-cycle-8a-audit-logging-part1.md)
- [Part 2: Tasks 4–7 — attendance, marks, marksLifecycle, gradesheets audit](./2026-10-01-cycle-8a-audit-logging-part2.md)
- [Part 3: Tasks 8–12 — enrollments, facultyAssignments, users, gradeSchemes, final pass](./2026-10-01-cycle-8a-audit-logging-part3.md)

---

## Global Constraints

Copied from the project `CLAUDE.md`, cycle 7 plan, and cycle 8a spec. Every task's requirements implicitly include this section.

- **Node** ≥ 20; use `node:` protocol for built-ins.
- **TypeScript strict mode** (`tsconfig.base.json`); `noUncheckedIndexedAccess` is on — treat `arr[i]` as `T | undefined`.
- **Imports** — `@mark-matrix/shared` for cross-package code. `import type` for type-only imports.
- **Prettier** — 2 spaces, double quotes, trailing commas. **ESLint v9 flat config.**
- **Vitest** — `apps/api/src/**/*.test.ts`. Setup files and pool are pre-wired.
- **Naming** — `PascalCase` components/types, `camelCase` functions/variables, `SCREAMING_SNAKE_CASE` constants.
- **Hono middleware** — `supabaseAuth` for `/api/*`, `requireRole("admin"|"faculty"|"student")` per prefix. The acting user's `supabase` client is `c.get("supabase")`; `userId` is `c.get("userId")`. Both are RLS-bound.
- **HTTP error contract** — `400 validation_failed`, `403 forbidden`, `404 not_found`, `500 internal_error`. Existing codes (`marks_data_locked`, `invalid_state_transition`, `incomplete_sem`) carry forward when triggered.
- **TDD** — Failing test first, then minimal implementation, then green, then commit.
- **Conventional commits** with `feat:`, `fix:`, `test:`, `docs:`, `chore:` prefixes.
- **Migration filename convention** — `2026MMDDHHMMSS_<short>.sql`. This cycle uses `20261001000000_audit_log.sql` (continues the existing `2026082010xxxx` series chronologically).
- **No new dependencies** — `recordAudit` uses the existing `supabase.rpc(...)` API.

---

## Review Focus

The five failure modes the spec implies but no task's tests directly exercise. Each gets an extra test pinned to the task that owns the code.

1. **`audit_log_write` rejects when `auth.uid()` is null.** If the auth-hook role claim somehow fails and `auth.uid()` returns null, the function MUST raise an exception (not silently insert with `user_id = null`). This is the only identity guarantee in the audit chain. Owner: **Task 1 (migration) — add `expect(...).rejects.toThrow(...)` test to the auditLog.rls.test.ts file in Task 3**.
2. **Helper called with `oldValue: undefined` (not `null`).** The spec says "pass through as JSON null" — verifier must test that both `undefined` and `null` produce JSON `null` in the DB column, not omitted. Owner: **Task 2 (helper) — add `it("converts undefined oldValue/newValue to JSON null")`**.
3. **Best-effort: audit RPC returns 500.** Data write must still succeed; helper must log via `console.error` with structured fields containing `{ action, entity, entity_id, error }`. Owner: **Task 2 (helper) — add `it("does not throw and logs structured error when RPC fails")`**.
4. **Faculty attempting `audit_log` SELECT directly must return zero rows.** RLS denies silently (matches existing cycle-1 `profiles_admin_only_writes` pattern). Owner: **Task 3 (RLS tests) — already in the planned test list**.
5. **Marks lifecycle approve/lock fan-out.** A single approve call touches ~180 rows (60 students × 3 exam types); each MUST produce its own audit row, all with the same `user_id` and within a tight timestamp window. Owner: **Task 6 (marksLifecycle audit) — already in the planned test list**.

---

## Task 1: Migration — `audit_log` table, RLS, and `audit_log_write` function

**Files:**
- Create: `supabase/migrations/20261001000000_audit_log.sql`

**Interfaces:**
- Consumes: existing `public.profiles` table (created in `20260818100000_create_profiles.sql`) for the RLS role check.
- Produces: `public.audit_log` table, `public.audit_log_write(...)` function callable from any `authenticated` user via `supabase.rpc("audit_log_write", {...})`.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20261001000000_audit_log.sql` with the following content (copied verbatim from spec §2.1):

```sql
-- 20261001000000_audit_log.sql
-- Cycle 8a — audit_log table + audit_log_write SECURITY DEFINER function + RLS.
--
-- Design notes:
--   - `entity_id` is text (not uuid) because some entities (semesters, courses)
--     use uuid but we want a single column that handles every entity type,
--     including composite keys if we ever need them.
--   - Writes only happen via the SECURITY DEFINER function. RLS denies INSERT
--     to authenticated/anon so the API cannot bypass the function.
--   - `user_id` is stamped server-side from auth.uid() inside the function so
--     callers cannot spoof identity.
--   - Indexes match the cycle-8b admin browse UI query patterns.

create table if not exists public.audit_log (
  id          bigserial primary key,
  action      text        not null,
  entity      text        not null,
  entity_id   text        not null,
  user_id     uuid        not null references auth.users(id),
  created_at  timestamptz not null default now(),
  old_value   jsonb,
  new_value   jsonb,
  constraint audit_log_action_check check (action in (
    'create', 'update', 'delete',
    'submit', 'approve', 'lock', 'unlock',
    'compile', 'publish'
  )),
  constraint audit_log_entity_check check (entity in (
    'attendance', 'marks', 'gradesheet', 'enrollment',
    'faculty_assignment', 'user', 'grade_scheme'
  ))
);

create index if not exists audit_log_entity_idx
  on public.audit_log (entity, entity_id, created_at desc);

create index if not exists audit_log_user_idx
  on public.audit_log (user_id, created_at desc);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;

-- Only admins may read. The role check reads auth.uid()'s profile via the
-- existing helper (see migration 20260820100004_profiles_admin_only_writes.sql
-- for the established pattern).
create policy "audit_log_admin_select"
  on public.audit_log
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy for authenticated/anon. Writes only happen
-- via the SECURITY DEFINER function below, which runs as the table owner.

create or replace function public.audit_log_write(
  p_action    text,
  p_entity    text,
  p_entity_id text,
  p_old_value jsonb,
  p_new_value jsonb
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then
    raise exception 'audit_log_write: auth.uid() is null';
  end if;

  insert into public.audit_log
    (action, entity, entity_id, user_id, old_value, new_value)
  values
    (p_action, p_entity, p_entity_id, v_uid, p_old_value, p_new_value)
  returning id into v_id;

  return v_id;
end;
$$;

-- Allow authenticated users to call the function (it bypasses RLS internally).
grant execute on function public.audit_log_write(
  text, text, text, jsonb, jsonb
) to authenticated;
```

- [ ] **Step 2: Apply the migration to local dev DB**

Run: `pnpm db:reset`
Expected: Supabase applies all migrations including the new one. Output ends with "Finished supabase db reset" or similar success message. If the reset fails, check that Docker is running (`pnpm db:status`) and that `supabase` CLI is on PATH.

Note: `db:reset` drops and recreates the local DB, so any seed data is lost. For non-destructive apply during development, use `pnpm db:push` instead — but `db:reset` is the canonical way to verify a new migration is idempotent and applies cleanly from scratch.

- [ ] **Step 3: Verify table, function, and policy exist via SQL**

Open a Supabase SQL session (Supabase Studio → SQL editor, or `pnpm exec supabase db psql`) and run:

```sql
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'audit_log';
-- Expected: 1 row

select proname from pg_proc where proname = 'audit_log_write';
-- Expected: 1 row

select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log';
-- Expected: 1 row ('audit_log_admin_select')
```

If any query returns 0 rows, the migration did not apply — re-run Step 2 and inspect Supabase logs.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20261001000000_audit_log.sql
git commit -m "feat(db): add audit_log table + audit_log_write definer function + RLS

Cycle 8a. audit_log captures every security-sensitive write with full
before/after JSONB snapshots. audit_log_write is SECURITY DEFINER; RLS
denies direct INSERT/UPDATE/DELETE so writes only happen via the function.
user_id is stamped from auth.uid() server-side; callers cannot spoof
identity. Indexes match the planned cycle-8b admin browse UI.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2: Helper module — `recordAudit` + unit tests

**Files:**
- Create: `apps/api/src/lib/auditLog.ts`
- Create: `apps/api/src/tests/auditLog.helper.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient` from `@supabase/supabase-js`; the `audit_log_write(...)` RPC created in Task 1.
- Produces: `recordAudit(supabase, params)` exported from `apps/api/src/lib/auditLog.ts`; types `AuditAction`, `AuditEntity`, `AuditParams`.

- [ ] **Step 1: Write the failing test for the happy path**

Create `apps/api/src/tests/auditLog.helper.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { recordAudit } from "../lib/auditLog.js";

describe("recordAudit (happy path)", () => {
  it("calls supabase.rpc with audit_log_write and the expected params", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 42, error: null });
    const supabase = { rpc } as never;

    await recordAudit(supabase, {
      action: "update",
      entity: "attendance",
      entityId: "abc-123",
      oldValue: { status: "absent" },
      newValue: { status: "present" },
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("audit_log_write", {
      p_action: "update",
      p_entity: "attendance",
      p_entity_id: "abc-123",
      p_old_value: { status: "absent" },
      p_new_value: { status: "present" },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @mark-matrix/api test auditLog.helper.test.ts`
Expected: FAIL with `Cannot find module '../lib/auditLog.js'` or similar module-not-found error. This confirms the helper file does not exist yet.

- [ ] **Step 3: Write the helper module with the happy-path implementation only**

Create `apps/api/src/lib/auditLog.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "create" | "update" | "delete"
  | "submit" | "approve" | "lock" | "unlock"
  | "compile" | "publish";

export type AuditEntity =
  | "attendance"
  | "marks"
  | "gradesheet"
  | "enrollment"
  | "faculty_assignment"
  | "user"
  | "grade_scheme";

export interface AuditParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  oldValue?: unknown | null;
  newValue?: unknown | null;
}

export async function recordAudit(
  supabase: SupabaseClient,
  params: AuditParams,
): Promise<void> {
  await supabase.rpc("audit_log_write", {
    p_action: params.action,
    p_entity: params.entity,
    p_entity_id: params.entityId,
    p_old_value: params.oldValue ?? null,
    p_new_value: params.newValue ?? null,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @mark-matrix/api test auditLog.helper.test.ts`
Expected: PASS — 1 test passes.

- [ ] **Step 5: Add the test for best-effort error handling (initially failing)**

Append to `apps/api/src/tests/auditLog.helper.test.ts`:

```ts
describe("recordAudit (best-effort error handling)", () => {
  it("does not throw when RPC returns an error", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "internal error", code: "500" },
    });
    const supabase = { rpc } as never;

    await expect(
      recordAudit(supabase, {
        action: "update",
        entity: "attendance",
        entityId: "abc-123",
        oldValue: null,
        newValue: null,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when RPC throws synchronously", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));
    const supabase = { rpc } as never;

    await expect(
      recordAudit(supabase, {
        action: "create",
        entity: "enrollment",
        entityId: "x",
      }),
    ).resolves.toBeUndefined();
  });

  it("logs a structured error to console.error on failure", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "boom", code: "500" },
    });
    const supabase = { rpc } as never;

    await recordAudit(supabase, {
      action: "lock",
      entity: "marks",
      entityId: "course-x",
      oldValue: { status: "approved" },
      newValue: { status: "locked" },
    });

    expect(errSpy).toHaveBeenCalledTimes(1);
    const call = errSpy.mock.calls[0];
    expect(call?.[0]).toBe("[audit_log] insert failed");
    expect(call?.[1]).toEqual({
      action: "lock",
      entity: "marks",
      entity_id: "course-x",
      error: "boom",
    });

    errSpy.mockRestore();
  });
});
```

- [ ] **Step 6: Run the new tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test auditLog.helper.test.ts`
Expected: 3 new tests FAIL — the current helper throws on RPC errors.

- [ ] **Step 7: Update the helper to swallow errors and log them**

Replace the body of `recordAudit` in `apps/api/src/lib/auditLog.ts`:

```ts
export async function recordAudit(
  supabase: SupabaseClient,
  params: AuditParams,
): Promise<void> {
  try {
    const { error } = await supabase.rpc("audit_log_write", {
      p_action: params.action,
      p_entity: params.entity,
      p_entity_id: params.entityId,
      p_old_value: params.oldValue ?? null,
      p_new_value: params.newValue ?? null,
    });
    if (error) throw error;
  } catch (err) {
    // Best-effort: never throw to the caller. Surface to ops via stderr so
    // cycle-8c's Cloudflare Workers log hook can pick it up.
    console.error("[audit_log] insert failed", {
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
```

- [ ] **Step 8: Add the test for `undefined` → JSON `null` conversion (Review Focus item 2)**

Append to `apps/api/src/tests/auditLog.helper.test.ts`:

```ts
describe("recordAudit (null normalization)", () => {
  it("converts undefined oldValue/newValue to JSON null", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const supabase = { rpc } as never;

    await recordAudit(supabase, {
      action: "create",
      entity: "enrollment",
      entityId: "new-id",
      // oldValue and newValue both omitted → should become JSON null
    });

    expect(rpc).toHaveBeenCalledWith("audit_log_write", {
      p_action: "create",
      p_entity: "enrollment",
      p_entity_id: "new-id",
      p_old_value: null,
      p_new_value: null,
    });
  });
});
```

- [ ] **Step 9: Run the full helper test file to verify all pass**

Run: `pnpm --filter @mark-matrix/api test auditLog.helper.test.ts`
Expected: PASS — 5 tests pass (1 happy path + 3 error handling + 1 null normalization).

- [ ] **Step 10: Run lint + typecheck on the api package**

Run:
```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass with no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/lib/auditLog.ts apps/api/src/tests/auditLog.helper.test.ts
git commit -m "feat(api): recordAudit helper module with best-effort semantics

Cycle 8a. recordAudit(supabase, params) wraps the audit_log_write RPC.
Best-effort: RPC failures are logged via console.error with structured
fields and swallowed so they never propagate to the caller or fail the
surrounding data write. Types AuditAction and AuditEntity are exported
and align with the DB CHECK constraints.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3: RLS tests for `audit_log`

**Files:**
- Create: `apps/api/src/tests/auditLog.rls.test.ts`

**Interfaces:**
- Consumes: `audit_log` table + `audit_log_write` function from Task 1. `setupTestEnv` pattern from existing tests (`apps/api/src/tests/rls.profiles.test.ts`).
- Produces: a test file that runs only when `SUPABASE_TEST_URL`, `SUPABASE_TEST_SERVICE_ROLE_KEY`, `SUPABASE_TEST_RLS=1` are set (same gating as `rls.profiles.test.ts`).

- [ ] **Step 1: Write the test file with all RLS scenarios**

Create `apps/api/src/tests/auditLog.rls.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env["SUPABASE_TEST_URL"];
const serviceKey = process.env["SUPABASE_TEST_SERVICE_ROLE_KEY"];
const enabled = !!url && !!serviceKey && process.env["SUPABASE_TEST_RLS"] === "1";
const itIf = enabled ? it : it.skip;

interface TestUser {
  email: string;
  password: string;
  userId?: string;
  role: "admin" | "faculty" | "student";
}

describe("RLS: audit_log table", () => {
  let admin: SupabaseClient;
  let adminUser: TestUser;
  let facultyUser: TestUser;
  let studentUser: TestUser;
  let auditClient: SupabaseClient; // signed in as adminUser

  beforeAll(async () => {
    if (!enabled) return;
    admin = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    adminUser = { email: "audit-admin@mark-matrix.local", password: "TestPass!1", role: "admin" };
    facultyUser = { email: "audit-faculty@mark-matrix.local", password: "TestPass!1", role: "faculty" };
    studentUser = { email: "audit-student@mark-matrix.local", password: "TestPass!1", role: "student" };

    for (const u of [adminUser, facultyUser, studentUser]) {
      const { data: list } = await admin.auth.admin.listUsers();
      const existing = list.users.find((x) => x.email === u.email);
      if (existing) {
        u.userId = existing.id;
        await admin.from("profiles").update({ role: u.role }).eq("user_id", u.userId);
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email, password: u.password, email_confirm: true,
          email_confirm_redirect_url: undefined,
        });
        if (error || !data.user) throw new Error(`createUser failed for ${u.email}: ${error?.message}`);
        u.userId = data.user.id;
        await admin.from("profiles").insert({ user_id: u.userId, role: u.role, name: u.email });
      }
    }

    auditClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: adminSignInErr } = await auditClient.auth.signInWithPassword({
      email: adminUser.email, password: adminUser.password,
    });
    if (adminSignInErr) throw new Error(`admin signIn failed: ${adminSignInErr.message}`);
  });

  itIf("requires SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY, SUPABASE_TEST_RLS=1", () => {
    expect(url).toBeTruthy();
    expect(serviceKey).toBeTruthy();
    expect(process.env["SUPABASE_TEST_RLS"]).toBe("1");
  });

  itIf("admin can SELECT from audit_log", async () => {
    const { data, error } = await auditClient.from("audit_log").select("id, action, entity").limit(1);
    expect(error).toBeNull();
    // Don't assert data.length — depends on prior test runs.
    expect(Array.isArray(data)).toBe(true);
  });

  itIf("faculty cannot SELECT from audit_log", async () => {
    const facultyClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await facultyClient.auth.signInWithPassword({
      email: facultyUser.email, password: facultyUser.password,
    });
    const { data, error } = await facultyClient.from("audit_log").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  itIf("student cannot SELECT from audit_log", async () => {
    const studentClient = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await studentClient.auth.signInWithPassword({
      email: studentUser.email, password: studentUser.password,
    });
    const { data, error } = await studentClient.from("audit_log").select("id").limit(1);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  itIf("authenticated user cannot INSERT directly into audit_log (RLS denies)", async () => {
    const { error } = await auditClient.from("audit_log").insert({
      action: "create",
      entity: "user",
      entity_id: "fake",
      user_id: adminUser.userId,
    });
    // RLS denial surfaces as either a permission error or zero rows inserted.
    expect(error).not.toBeNull();
  });

  itIf("audit_log_write RPC succeeds for authenticated user and stamps user_id from auth.uid()", async () => {
    const { data, error } = await auditClient.rpc("audit_log_write", {
      p_action: "create",
      p_entity: "user",
      p_entity_id: `rls-test-${Date.now()}`,
      p_old_value: null,
      p_new_value: { hello: "world" },
    });
    expect(error).toBeNull();
    expect(typeof data).toBe("number"); // bigint returned as number

    // Confirm the row was actually inserted with the right user_id.
    const { data: row, error: readErr } = await auditClient
      .from("audit_log")
      .select("user_id, action, entity, new_value")
      .eq("id", data as number)
      .single();
    expect(readErr).toBeNull();
    expect(row?.user_id).toBe(adminUser.userId);
    expect(row?.action).toBe("create");
    expect(row?.entity).toBe("user");
    expect(row?.new_value).toEqual({ hello: "world" });
  });

  itIf("audit_log_write rejects when auth.uid() is null (Review Focus item 1)", async () => {
    // Use the service-role client (auth.uid() is null) to call the RPC.
    const { error } = await admin.rpc("audit_log_write", {
      p_action: "create",
      p_entity: "user",
      p_entity_id: "should-fail",
      p_old_value: null,
      p_new_value: null,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/auth\.uid\(\) is null/);
  });
});
```

- [ ] **Step 2: Run the RLS tests against the local dev DB**

Run:
```bash
pnpm test:rls -- auditLog.rls
```
(The `test:rls` script sets `SUPABASE_TEST_RLS=1` and runs the api test suite; the trailing arg filters to the audit tests.)

If your local Supabase project has a different `SUPABASE_TEST_URL` than the default, set it in `apps/api/.dev.vars` or via shell env before running.

Expected: 7 RLS tests pass (1 env-var check + 6 behavior tests). The env-var check passes trivially when gating is set; the behavior tests depend on Tasks 1 + 2 being complete.

- [ ] **Step 3: Run lint + typecheck on the api package**

Run:
```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass with no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/tests/auditLog.rls.test.ts
git commit -m "test(api): RLS tests for audit_log

Cycle 8a. Verifies:
- admin can SELECT, faculty and student cannot
- authenticated user cannot INSERT directly (RLS denies)
- audit_log_write RPC succeeds for authenticated users and stamps
  user_id from auth.uid()
- audit_log_write rejects when auth.uid() is null (identity spoofing
  protection)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

**Continue to** [Part 2: Tasks 4–7](./2026-10-01-cycle-8a-audit-logging-part2.md) for attendance, marks core, marksLifecycle, and gradesheets audit instrumentation.
