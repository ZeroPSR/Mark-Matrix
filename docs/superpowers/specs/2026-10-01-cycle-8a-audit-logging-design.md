# Cycle 8a — Audit Logging Foundation (Design Spec)

**Status:** Draft, awaiting review.
**Branch context:** `main`; cycle 7 (analytics + transcripts) just shipped. Cycle 8 is the production-readiness cycle, broken into 8a (this), 8b (security hardening + admin audit UI), 8c (production deploy + monitoring).
**Goal:** Add a tamper-evident audit log that records every security-sensitive write in the system, so post-hoc review can answer "who changed what, when, from what to what" for any state-changing action.

---

## 1. Scope

**In scope:**

- A new `audit_log` table that stores one row per state-changing action, with full before/after snapshots.
- A `SECURITY DEFINER` Postgres function `audit_log_write(...)` as the single entry point for inserting audit rows. The API never inserts into `audit_log` directly.
- A TypeScript helper `recordAudit(supabase, params)` in `apps/api/src/lib/auditLog.ts` that wraps the RPC.
- RLS on `audit_log`: admin can `SELECT`; no role can `INSERT/UPDATE/DELETE` (writes go through the definer function).
- Instrumentation of 22 sensitive write paths across 7 route files.
- Best-effort semantics: an audit-insert failure is logged to stderr but never fails the data write.
- 9 new test files covering helper unit tests, `audit_log` RLS, and per-handler audit emission.

**Out of scope (deferred to later cycles):**

- The admin browse/filter UI for `audit_log` — **cycle 8b**.
- Cross-role access matrix sweep, rate limiting, RLS re-verification — **cycle 8b**.
- Production deployment, monitoring hooks, rollback plan — **cycle 8c**.
- Capturing IP / user-agent / request ID in audit rows — future, schema can grow a `metadata jsonb` column without breaking existing rows.
- A higher-order `withAudit(...)` wrapper to reduce caller boilerplate — only worth adding if the 3-line caller pattern proves painful in practice.
- Auditing `course_exam_type` writes — there are no production write endpoints yet (tests insert directly). Helper types include the entity so it works when endpoints land.

---

## 2. Data Layer

### 2.1 New migration: `audit_log` table + RLS + helper function

**File:** `supabase/migrations/20261001000000_audit_log.sql`

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

### 2.2 What the migration does **not** change

- No existing tables or policies are modified.
- No data backfill is needed.
- `course_exam_type` is intentionally absent from the `entity` CHECK constraint; we'll widen the constraint when production write endpoints land.

---

## 3. Helper Module: `apps/api/src/lib/auditLog.ts`

A single export `recordAudit` plus the type unions. Best-effort: an RPC failure is logged to `console.error` and swallowed, so it never propagates to the caller or fails the surrounding data write.

```ts
// apps/api/src/lib/auditLog.ts
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

**Design decisions captured:**

- `null` for `oldValue` on `create`, `newValue` on `delete`. The DB column is `jsonb` and accepts `null`.
- The helper is the **only** consumer of `audit_log_write`. A future cycle could add a guard (`if (process.env.STRICT_AUDIT) throw`) but not in 8a.
- `user_id` is stamped server-side from `auth.uid()` inside the function; the helper passes only the action/entity/snapshots. Identity spoofing is impossible from the API path.

---

## 4. Handler Integration List

22 write paths across 7 files. For each, the integration is **fetch before → mutate → recordAudit** (3 lines per handler). Where marked "fetch before", an extra `SELECT` is added to capture `oldValue`. Where marked "reuse", the existing handler already fetches the row for another purpose and we capture the snapshot at that point.

| # | File | Handler | Method/Path | Action | Entity | Snapshot strategy |
|---|---|---|---|---|---|---|
| 1 | `attendance/core.ts` | `bulkMark` | POST `/` | `create`/`update` per row | `attendance` | After upsert, the returned rows are `new_value`; for `old_value`, one SELECT first on the conflict keys |
| 2 | `attendance/core.ts` | `patchOne` | PATCH `/:id` | `update` | `attendance` | Fetch before |
| 3 | `marks/core.ts` | `bulkUpsert` | POST `/` | `create`/`update` per row | `marks` | One SELECT keyed on `(course,student,exam)` first to split new vs existing |
| 4 | `marks/core.ts` | `patchOne` | PATCH `/:id` | `update` | `marks` | Reuse existing pre-fetch |
| 5 | `marks/core.ts` | `submitCourse` | POST `/submit` | `submit` per row | `marks` | After status flip, returned rows are `new_value`; `old_value` is the same row with `status='draft'` |
| 6 | `marks/core.ts` | `bulkUpload` | POST `/bulk` | `create`/`update` per row | `marks` | Same split as #3 |
| 7 | `admin/marksLifecycle.ts` | `approve` | POST `/approve` | `approve` per row | `marks` | After status flip, returned rows are `new_value`; `old_value` captured by a SELECT first keyed on `(course, status='submitted')` |
| 8 | `admin/marksLifecycle.ts` | `lock` | POST `/lock` | `lock` per row | `marks` | Same pattern |
| 9 | `admin/marksLifecycle.ts` | `unlock` | POST `/unlock` | `unlock` per row | `marks` | Same pattern |
| 10 | `admin/gradesheets.ts` | `compile` | POST `/compile` | `compile` | `gradesheet` (keyed by `semId`) | One SELECT before; capture the existing `gradesheets` row (or `null` if none) as `old_value`; the post-compile row as `new_value` |
| 11 | `admin/gradesheets.ts` | `lock` | POST `/lock` | `lock` | `gradesheet` | Same pattern |
| 12 | `admin/gradesheets.ts` | `publish` | POST `/publish` | `publish` | `gradesheet` | Same pattern |
| 13 | `admin/gradesheets.ts` | `unlock` | POST `/unlock` | `unlock` | `gradesheet` | Same pattern; `reason` from the request body is included in `new_value.unlock_reason` |
| 14 | `admin/enrollments.ts` | `create` | POST `/` | `create` | `enrollment` | Returned row is `new_value`; `old_value = null` |
| 15 | `admin/enrollments.ts` | `delete` | DELETE `/:id` | `delete` | `enrollment` | Fetch before |
| 16 | `admin/bulkEnroll.ts` | `bulk` | POST `/` | `create` per row | `enrollment` | After each successful insert, the returned row is `new_value` |
| 17 | `admin/facultyAssignments.ts` | `create` | POST `/` | `create` | `faculty_assignment` | Returned row is `new_value`; `old_value = null` |
| 18 | `admin/facultyAssignments.ts` | `delete` | DELETE `/:id` | `delete` | `faculty_assignment` | Fetch before |
| 19 | `admin/users.ts` | `patch` | PATCH `/:userId` | `update` | `user` | Fetch before; `entity_id = userId` |
| 20 | `admin/gradeSchemes.ts` | `create` | POST `/` | `create` | `grade_scheme` | Returned row is `new_value`; `old_value = null` |
| 21 | `admin/gradeSchemes.ts` | `patch` | PATCH `/:id` | `update` | `grade_scheme` | Reuse existing pre-fetch (already done for overlap check) |
| 22 | `admin/gradeSchemes.ts` | `delete` | DELETE `/:id` | `delete` | `grade_scheme` | Fetch before |

### 4.1 Caller pattern (canonical)

```ts
// Fetch before (if not already fetched by handler)
const { data: before } = await supabase
  .from(table)
  .select("*")
  .eq("id", id)
  .single();

// Mutate
const { data: after, error } = await supabase
  .from(table)
  .update(...)
  .eq("id", id)
  .select("*")
  .single();

if (!error && after) {
  await recordAudit(supabase, {
    action: "update",
    entity: "...",
    entityId: id,
    oldValue: before,
    newValue: after,
  });
}
```

### 4.2 Bulk semantics

Bulk handlers call `recordAudit` **once per affected row** in a loop. One audit row per affected entity, all sharing the same `user_id`, all within a tight timestamp window. The admin UI in cycle 8b can group by `user_id` + minute window to reconstruct bulk operations.

### 4.3 Upsert split (handlers #3, #6)

For handlers that upsert, a single SELECT first keyed on the conflict columns determines which entries are new (`create`) vs existing (`update`). The split is done in TypeScript; both lists then upsert and audit-log separately.

### 4.4 Volume sanity check

- Marks approve/lock/unlock/submit can produce ~180 audit rows per call (60 students × 3 exam types).
- Bulk marks CSV of 200 rows → ~200 audit rows.
- Bulk enroll CSV of 300 students → ~300 audit rows.

All within reason for an append-only audit table with the planned indexes; no batching needed in 8a.

### 4.5 Gradesheet state transitions

Audit fires at the **gradesheet** entity level (one row per semId). We do **not** audit the downstream `course_grades` rows the compiler updates — those are derived state, and the gradesheet row is the source of truth for the state machine.

---

## 5. Error Handling

**Default: best-effort.** The helper never throws. Audit failures are logged via `console.error("[audit_log] insert failed", { ... })` and swallowed. The data write that just succeeded stays committed.

**Why this is acceptable for 8a:**

- The audit log is for post-hoc forensic review, not for blocking writes.
- The user explicitly chose "app-level helper, best-effort" in brainstorming.
- Cycle 8c wires the `console.error` stream into Cloudflare Workers logs so failures are visible in production.

**Out of scope for 8a (deferred):**

- A `STRICT_AUDIT` flag that throws on audit failure for high-stakes paths (e.g., gradesheet lock/publish). The helper accepts no options in 8a; adding the flag is a one-liner later.
- Capturing IP / user-agent / request ID alongside `user_id`. Future: add `metadata jsonb` column.

---

## 6. Testing Strategy

### 6.1 New test files

```
apps/api/src/tests/
├── auditLog.helper.test.ts          # Unit: recordAudit() behavior
├── auditLog.rls.test.ts              # RLS: who can SELECT, who can INSERT
├── audit.attendance.test.ts          # Handlers #1, #2
├── audit.marks.test.ts               # Handlers #3-9
├── audit.gradesheets.test.ts         # Handlers #10-13
├── audit.enrollments.test.ts         # Handlers #14-16
├── audit.facultyAssignments.test.ts  # Handlers #17-18
├── audit.users.test.ts               # Handler #19
└── audit.gradeSchemes.test.ts        # Handlers #20-22
```

### 6.2 `auditLog.helper.test.ts` — unit tests

- `recordAudit` calls `supabase.rpc("audit_log_write", { p_action, p_entity, p_entity_id, p_old_value, p_new_value })` with correct params.
- When RPC returns an error, `recordAudit` does **not** throw.
- When RPC returns an error, `recordAudit` logs to `console.error` with structured fields.
- `null` `oldValue`/`newValue` pass through as JSON `null` (not omitted, not `undefined`).

### 6.3 `auditLog.rls.test.ts` — RLS on `audit_log`

- Student cannot SELECT → empty result.
- Faculty cannot SELECT → empty result.
- Admin can SELECT → rows visible.
- Authenticated user calling `audit_log_write` RPC succeeds and row appears with their `auth.uid()` stamped as `user_id`.
- Direct `INSERT` from authenticated user → rejected by RLS.

### 6.4 Per-domain audit tests (one per handler file)

For each handler, the test pattern is:

```ts
test("audit row created on successful <action>", async () => {
  // arrange: seed data, authenticate as the right role
  // act: call the API endpoint
  // assert: HTTP success
  // assert: audit_log has a row with
  //   - correct action, entity, entity_id
  //   - user_id = the acting user's id
  //   - old_value = row snapshot before (or null for create)
  //   - new_value = row snapshot after (or null for delete)
});

test("no audit row on failed write", async () => {
  // arrange: deliberately violate a precondition
  // act: call expecting failure
  // assert: HTTP error
  // assert: no new audit_log rows from this call
});
```

Plus domain-specific:

- **Bulk handlers** (#1, #3, #5, #6, #7, #8, #9, #16): assert N audit rows for N affected rows, all sharing `user_id`, within a tight timestamp window.
- **Upsert split** (#3, #6): seed existing marks, bulk-upsert a mix, assert existing rows get `update` and new rows get `create`.
- **State machine** (#7-13): for marks approve→lock→unlock and gradesheet compile→lock→publish→unlock, assert the audit log shows the full sequence in order.
- **Bulk failures** (#6, #16): upload CSV with mix of valid + invalid rows, assert audit rows only for the successful ones.

### 6.5 Fixture reuse

The existing test infrastructure (`setupTestEnv` + admin/faculty/student test clients) is reused unchanged. The admin client is reused to read `audit_log` and assert rows in the per-handler tests.

### 6.6 Out-of-scope tests (deferred)

- Cross-role 401/403 sweep — cycle 8b.
- Load/smoke against realistic data volume — cycle 8c.
- Admin browse/filter UI — cycle 8b (no UI in 8a).

---

## 7. Open questions / follow-ups

None for 8a. Items deferred to 8b/8c are listed in §1.
