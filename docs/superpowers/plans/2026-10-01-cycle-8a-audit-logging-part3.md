# Cycle 8a — Audit Logging Implementation Plan (Part 3: Tasks 8–12)

**Plan files:**
- [Part 1: Tasks 1–3 — schema, helper, RLS tests](./2026-10-01-cycle-8a-audit-logging-part1.md)
- [Part 2: Tasks 4–7 — attendance, marks, marksLifecycle, gradesheets audit](./2026-10-01-cycle-8a-audit-logging-part2.md)
- [Part 3 (this file): Tasks 8–12 — enrollments, facultyAssignments, users, gradeSchemes, final pass](./2026-10-01-cycle-8a-audit-logging-part3.md)

**Spec:** [docs/superpowers/specs/2026-10-01-cycle-8a-audit-logging-design.md](../specs/2026-10-01-cycle-8a-audit-logging-design.md)

**Test mock pattern:** Tasks 8–11 use the same `makeAuditMockSupabase` helper from [Part 2](./2026-10-01-cycle-8a-audit-logging-part2.md) (`apps/api/src/tests/helpers/auditMock.ts`). Each test mounts its route under the appropriate role middleware, makes the API call, and asserts the captured `rpc("audit_log_write", ...)` calls match the expected audit emission.

---

## Task 8: Enrollments audit — `create`, `delete`, and bulk enroll

**Files:**
- Modify: `apps/api/src/routes/admin/enrollments.ts`
- Modify: `apps/api/src/routes/admin/bulkEnroll.ts`
- Create: `apps/api/src/tests/audit.enrollments.test.ts`

**Interfaces:**
- Consumes: `recordAudit` from Task 2.
- Produces: per-enrollment audit emission on `POST /` (single), `DELETE /:id`, and `POST /` of bulkEnroll (one per successful insert).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/tests/audit.enrollments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminEnrollmentsRoute } from "../routes/admin/enrollments.js";
import { adminBulkEnrollRoute } from "../routes/admin/bulkEnroll.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient, route: Hono<AppEnv>, path: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route(path, route);
  return app;
}

const ENROLLMENTS_URL = "/api/admin/enrollments";
const BULK_ENROLL_URL = "/api/admin/bulk-enroll";

describe("enrollments audit", () => {
  it("POST / emits create audit with the new row snapshot", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "e1", student_id: "s1", batch_id: "b1", program_id: "p1", sem_id: "s1", enrollment_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase, adminEnrollmentsRoute, ENROLLMENTS_URL);
    const res = await app.request(ENROLLMENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentId: "s1", semId: "s1" }),
    });
    expect(res.status).toBe(201);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "create",
      p_entity: "enrollment",
      p_entity_id: "e1",
    });
    expect(auditCalls[0]!.args["p_old_value"]).toBeNull();
    expect(auditCalls[0]!.args["p_new_value"]).toMatchObject({ id: "e1", student_id: "s1" });
  });

  it("DELETE /:id emits delete audit with oldValue snapshot", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "e1", student_id: "s1", batch_id: "b1", program_id: "p1", sem_id: "s1", enrollment_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase, adminEnrollmentsRoute, ENROLLMENTS_URL);
    const res = await app.request(`${ENROLLMENTS_URL}/e1`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "delete",
      p_entity: "enrollment",
      p_entity_id: "e1",
    });
    expect(auditCalls[0]!.args["p_new_value"]).toBeNull();
  });

  it("DELETE /:id with not_found emits no audit rows", async () => {
    const { supabase, calls } = makeAuditMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(supabase, adminEnrollmentsRoute, ENROLLMENTS_URL);
    // The current route returns 204 on success; on no-match it still returns 204 with no data.
    // Audit must NOT fire in this case. (Note: with empty data, audit must not be emitted.)
    const res = await app.request(`${ENROLLMENTS_URL}/nonexistent`, { method: "DELETE" });
    expect([204, 404]).toContain(res.status);
    // The mock's select returns empty; the handler should not emit an audit row
    // for a delete that didn't actually delete anything.
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(0);
  });

  it("bulkEnroll emits create audit per successfully inserted row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [
          { id: "e1", student_id: "s1", batch_id: "b1", program_id: "p1", sem_id: "s1", enrollment_date: "2026-09-30" },
          { id: "e2", student_id: "s2", batch_id: "b1", program_id: "p1", sem_id: "s1", enrollment_date: "2026-09-30" },
        ],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase, adminBulkEnrollRoute, BULK_ENROLL_URL);
    const res = await app.request(BULK_ENROLL_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ semId: "s1", csv: "roll1\nroll2" }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    // Two enrollments → two audit rows
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls.every((c) => c.args["p_action"] === "create")).toBe(true);
    expect(auditCalls.every((c) => c.args["p_entity"] === "enrollment")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test audit.enrollments.test.ts`
Expected: FAIL — no `rpc` calls.

- [ ] **Step 3: Instrument `admin/enrollments.ts`**

Add the import at the top:

```ts
import { recordAudit } from "../../lib/auditLog.js";
```

Modify the `POST /` handler. After the successful insert and before `return c.json(...)`:

```ts
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Cycle 8a: emit create audit with the new row as newValue.
  await recordAudit(supabase, {
    action: "create",
    entity: "enrollment",
    entityId: (data as unknown as { id: string }).id,
    oldValue: null,
    newValue: data,
  });
  return c.json({ data: fromRow(data as unknown as Row) }, 201);
```

Modify the `DELETE /:id` handler. The current code does `.delete().eq("id", id)` without checking if a row was actually deleted. To emit audit only on successful deletion, fetch before, attempt the delete, and only emit audit if the delete affected 1 row:

```ts
  .delete("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    // Cycle 8a: fetch before for oldValue; only emit audit on real delete.
    const { data: before } = await supabase
      .from("student_enrollments")
      .select("id, student_id, batch_id, program_id, sem_id, enrollment_date")
      .eq("id", id)
      .maybeSingle();
    if (!before) {
      return c.json({ error: "not_found" }, 404);
    }
    const { error } = await supabase
      .from("student_enrollments")
      .delete()
      .eq("id", id);
    if (error) {
      const m = mapPgError(error, { hasDependents: true });
      return c.json(m.body, m.status);
    }
    // Cycle 8a: emit delete audit with the prior row snapshot.
    await recordAudit(supabase, {
      action: "delete",
      entity: "enrollment",
      entityId: id,
      oldValue: before,
      newValue: null,
    });
    return c.body(null, 204);
  });
```

- [ ] **Step 4: Instrument `admin/bulkEnroll.ts`**

Add the import:

```ts
import { recordAudit } from "../../lib/auditLog.js";
```

Modify the `bulk` handler's existing per-row insert loop. After each successful `out.enrolled += 1`, emit an audit row. The current code does:

```ts
for (const r of rows) {
  const userId = byRoll.get(r.rollNumber);
  if (!userId) {
    out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "no_such_student" });
    continue;
  }
  if (alreadyEnrolled.has(userId)) {
    out.errors.push({ row: r.row, rollNumber: r.rollNumber, reason: "already_enrolled" });
    continue;
  }
  const { error: insertErr, data: insertedRow } = await supabase
    .from("student_enrollments")
    .insert({
      student_id: userId,
      sem_id: semId,
      batch_id: batchId,
      program_id: programId,
    })
    .select()
    .single();
  if (insertErr) { /* existing error handling */ continue; }
  out.enrolled += 1;
  alreadyEnrolled.add(userId);
  // Cycle 8a: emit create audit per successfully inserted row.
  await recordAudit(supabase, {
    action: "create",
    entity: "enrollment",
    entityId: (insertedRow as unknown as { id: string }).id,
    oldValue: null,
    newValue: insertedRow,
  });
}
```

(Modify the existing `.insert(...)` to also `.select().single()` so we get the inserted row back. The error handling path already handles the failure case; if `.single()` returns no data, skip the audit.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test audit.enrollments.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Run the existing enrollment tests to verify no regressions**

```bash
pnpm --filter @mark-matrix/api test bulkEnroll
pnpm --filter @mark-matrix/api test enrollments
```
Expected: all existing tests pass.

- [ ] **Step 7: Run lint + typecheck**

```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/admin/enrollments.ts apps/api/src/routes/admin/bulkEnroll.ts apps/api/src/tests/audit.enrollments.test.ts
git commit -m "feat(api): instrument enrollment + bulkEnroll handlers with audit

Cycle 8a. POST / emits create audit per single enrollment; DELETE /:id
emits delete audit only when a row was actually deleted (404 otherwise).
bulkEnroll emits one create audit row per successfully inserted
enrollment.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9: FacultyAssignments audit — `create`, `delete`

**Files:**
- Modify: `apps/api/src/routes/admin/facultyAssignments.ts`
- Create: `apps/api/src/tests/audit.facultyAssignments.test.ts`

**Interfaces:**
- Consumes: `recordAudit` from Task 2.
- Produces: per-faculty-assignment audit emission on `POST /` and `DELETE /:id`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/tests/audit.facultyAssignments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminFacultyAssignmentsRoute } from "../routes/admin/facultyAssignments.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/faculty-assignments", adminFacultyAssignmentsRoute);
  return app;
}

const URL = "/api/admin/faculty-assignments";

describe("faculty assignments audit", () => {
  it("POST / emits create audit with the new assignment row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "fa1", faculty_id: "f1", course_id: "c1", assigned_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ facultyId: "f1", courseId: "c1" }),
    });
    expect(res.status).toBe(201);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "create",
      p_entity: "faculty_assignment",
      p_entity_id: "fa1",
    });
  });

  it("DELETE /:id emits delete audit only on real deletion", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "fa1", faculty_id: "f1", course_id: "c1", assigned_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/fa1`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "delete",
      p_entity: "faculty_assignment",
      p_entity_id: "fa1",
    });
    expect(auditCalls[0]!.args["p_new_value"]).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test audit.facultyAssignments.test.ts`
Expected: FAIL — no `rpc` calls.

- [ ] **Step 3: Instrument `admin/facultyAssignments.ts`**

Add the import:

```ts
import { recordAudit } from "../../lib/auditLog.js";
```

Modify `POST /` to emit audit after success:

```ts
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Cycle 8a: emit create audit.
  await recordAudit(supabase, {
    action: "create",
    entity: "faculty_assignment",
    entityId: (data as unknown as { id: string }).id,
    oldValue: null,
    newValue: data,
  });
  return c.json({ data: fromRow(data as unknown as Row) }, 201);
```

Modify `DELETE /:id` to fetch before and only emit audit on real deletion:

```ts
  .delete("/:id", async (c) => {
    const supabase = c.get("supabase");
    const id = c.req.param("id");
    // Cycle 8a: fetch before.
    const { data: before } = await supabase
      .from("faculty_assignments")
      .select("id, faculty_id, course_id, assigned_date")
      .eq("id", id)
      .maybeSingle();
    if (!before) return c.json({ error: "not_found" }, 404);
    const { error } = await supabase
      .from("faculty_assignments")
      .delete()
      .eq("id", id);
    if (error) {
      const m = mapPgError(error, { hasDependents: true });
      return c.json(m.body, m.status);
    }
    // Cycle 8a: emit delete audit.
    await recordAudit(supabase, {
      action: "delete",
      entity: "faculty_assignment",
      entityId: id,
      oldValue: before,
      newValue: null,
    });
    return c.body(null, 204);
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test audit.facultyAssignments.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Run lint + typecheck**

```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/facultyAssignments.ts apps/api/src/tests/audit.facultyAssignments.test.ts
git commit -m "feat(api): instrument faculty assignments with audit

Cycle 8a. POST / emits create audit; DELETE /:id fetches before and
emits delete audit only when the row was actually deleted.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 10: Users audit — `patch` (role/name change)

**Files:**
- Modify: `apps/api/src/routes/admin/users.ts`
- Create: `apps/api/src/tests/audit.users.test.ts`

**Interfaces:**
- Consumes: `recordAudit` from Task 2.
- Produces: update audit emission on `PATCH /:userId` keyed by `userId`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/tests/audit.users.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminUsersRoute } from "../routes/admin/users.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/users", adminUsersRoute);
  return app;
}

const URL = "/api/admin/users";

describe("users audit", () => {
  it("PATCH /:userId emits update audit with before/after snapshots of role/name", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ user_id: "u-target", name: "Alice Updated", role: "faculty" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/u-target`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "faculty", name: "Alice Updated" }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "update",
      p_entity: "user",
      p_entity_id: "u-target",
    });
    const newVal = auditCalls[0]!.args["p_new_value"] as Record<string, unknown>;
    expect(newVal["role"]).toBe("faculty");
    expect(newVal["name"]).toBe("Alice Updated");
  });

  it("PATCH /:userId with no changes emits no audit row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/u-nonexistent`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "student" }),
    });
    expect(res.status).toBe(404);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test audit.users.test.ts`
Expected: FAIL — no `rpc` calls.

- [ ] **Step 3: Instrument `admin/users.ts`**

Add the import:

```ts
import { recordAudit } from "../../lib/auditLog.js";
```

Modify the `PATCH /:userId` handler. Currently it does `.update(update).eq(...).select("user_id, name, role").maybeSingle()`. Add a fetch before to capture the prior role/name, then audit after success:

```ts
  .patch("/:userId", async (c) => {
    const supabase = c.get("supabase");
    const userId = c.req.param("userId");
    const body = await c.req.json().catch(() => null);
    const parsed = patchRoleSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation_failed", fields: formatZodError(parsed.error) },
        400,
      );
    }
    const update: Record<string, unknown> = {};
    if (parsed.data.role !== undefined) update["role"] = parsed.data.role;
    if (parsed.data.name !== undefined) update["name"] = parsed.data.name;

    // Cycle 8a: fetch before for oldValue.
    const { data: before } = await supabase
      .from(PROFILE_TABLE)
      .select("user_id, name, role")
      .eq("user_id", userId)
      .maybeSingle();

    const { data, error } = await supabase
      .from(PROFILE_TABLE)
      .update(update)
      .eq("user_id", userId)
      .select("user_id, name, role")
      .maybeSingle();
    if (error) {
      const m = mapPgError(error);
      return c.json(m.body, m.status);
    }
    if (!data) return c.json({ error: "not_found" }, 404);

    // Cycle 8a: emit update audit.
    await recordAudit(supabase, {
      action: "update",
      entity: "user",
      entityId: userId,
      oldValue: before,
      newValue: data,
    });

    return c.json({ data });
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test audit.users.test.ts`
Expected: PASS — 2 tests pass.

- [ ] **Step 5: Run lint + typecheck**

```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/admin/users.ts apps/api/src/tests/audit.users.test.ts
git commit -m "feat(api): instrument users PATCH with role/name audit

Cycle 8a. PATCH /:userId fetches the profile before, then emits an
update audit row with oldValue (prior role/name) and newValue
(post-update row). 404 path emits no audit.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 11: GradeSchemes audit — `create`, `patch`, `delete`

**Files:**
- Modify: `apps/api/src/routes/admin/gradeSchemes.ts`
- Create: `apps/api/src/tests/audit.gradeSchemes.test.ts`

**Interfaces:**
- Consumes: `recordAudit` from Task 2.
- Produces: per-grade-scheme audit emission on `POST /`, `PATCH /:id`, `DELETE /:id`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/tests/audit.gradeSchemes.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGradeSchemesRoute } from "../routes/admin/gradeSchemes.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/grade-schemes", adminGradeSchemesRoute);
  return app;
}

const URL = "/api/admin/grade-schemes";

describe("grade schemes audit", () => {
  it("POST / emits create audit with the new scheme row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "gs1", scheme_group: "default", scope: "course", course_id: "c1", program_id: null, grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 9, is_passing: true, created_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemeGroup: "default", scope: "course", courseId: "c1",
        gradeLabel: "A", minMarks: 80, maxMarks: 100, gradePoint: 9,
      }),
    });
    expect(res.status).toBe(201);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "create",
      p_entity: "grade_scheme",
      p_entity_id: "gs1",
    });
    expect(auditCalls[0]!.args["p_old_value"]).toBeNull();
  });

  it("PATCH /:id emits update audit with before/after snapshots", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "gs1", scheme_group: "default", scope: "course", course_id: "c1", program_id: null, grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 10, is_passing: true, created_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/gs1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gradePoint: 10 }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "update",
      p_entity: "grade_scheme",
      p_entity_id: "gs1",
    });
    expect((auditCalls[0]!.args["p_new_value"] as Record<string, unknown>)["grade_point"]).toBe(10);
  });

  it("DELETE /:id emits delete audit only when dependents allow", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: { data: [], error: null },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/gs1`, { method: "DELETE" });
    // The route returns 200 with { deleted: id } on success; 409 has_dependents if not.
    // With empty dependents count, we expect 200 and one audit row.
    expect([200, 409]).toContain(res.status);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    if (res.status === 200) {
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.args["p_action"]).toBe("delete");
      expect(auditCalls[0]!.args["p_entity"]).toBe("grade_scheme");
      expect(auditCalls[0]!.args["p_entity_id"]).toBe("gs1");
    } else {
      expect(auditCalls).toHaveLength(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test audit.gradeSchemes.test.ts`
Expected: FAIL — no `rpc` calls.

- [ ] **Step 3: Instrument `admin/gradeSchemes.ts`**

Add the import:

```ts
import { recordAudit } from "../../lib/auditLog.js";
```

Modify `createScheme`: after the successful insert and before the success return, add audit emission:

```ts
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Cycle 8a: emit create audit.
  await recordAudit(supabase, {
    action: "create",
    entity: "grade_scheme",
    entityId: (data as unknown as { id: string }).id,
    oldValue: null,
    newValue: data,
  });
  return c.json({ data: fromRow(data as unknown as DbRow) }, 201);
```

Modify `patchScheme`: the existing handler already fetches `existing` for overlap validation. Reuse that as `oldValue`. After the successful update:

```ts
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  if (!data) return c.json({ error: "not_found" }, 404);
  // Cycle 8a: emit update audit. If we fetched `existing` earlier for overlap check, use it.
  // (existing may be null if no overlap check was needed; in that case oldValue is null.)
  await recordAudit(supabase, {
    action: "update",
    entity: "grade_scheme",
    entityId: id,
    oldValue: existing ?? null,
    newValue: data,
  });
  return c.json({ data: fromRow(data as unknown as DbRow) });
```

Modify `deleteScheme`: fetch before and emit audit on success (after the dependents check passes):

```ts
  if ((count ?? 0) > 0) {
    return c.json({ error: "has_dependents", detail: `${count} course_grades reference this scheme` }, 409);
  }
  // Cycle 8a: fetch before for oldValue.
  const { data: before } = await supabase
    .from("grade_schemes")
    .select(SELECT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (!before) return c.json({ error: "not_found" }, 404);
  const { error } = await supabase.from("grade_schemes").delete().eq("id", id);
  if (error) {
    const m = mapPgError(error);
    return c.json(m.body, m.status);
  }
  // Cycle 8a: emit delete audit.
  await recordAudit(supabase, {
    action: "delete",
    entity: "grade_scheme",
    entityId: id,
    oldValue: before,
    newValue: null,
  });
  return c.json({ deleted: id });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test audit.gradeSchemes.test.ts`
Expected: PASS — 3 tests pass.

- [ ] **Step 5: Run the existing gradeSchemes tests to verify no regressions**

```bash
pnpm --filter @mark-matrix/api test gradeSchemes
```
Expected: all existing tests pass.

- [ ] **Step 6: Run lint + typecheck**

```bash
pnpm --filter @mark-matrix/api lint
pnpm --filter @mark-matrix/api typecheck
```
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/gradeSchemes.ts apps/api/src/tests/audit.gradeSchemes.test.ts
git commit -m "feat(api): instrument grade schemes with audit

Cycle 8a. POST / emits create audit; PATCH /:id reuses the overlap-check
fetch as oldValue and emits update audit; DELETE /:id fetches before and
emits delete audit only when the row is actually deleted (after the
has_dependents check passes).

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 12: Final pass — full test suite, lint, typecheck, audit summary

**Files:** none created or modified (final pass task).

- [ ] **Step 1: Run the full API test suite**

Run: `pnpm --filter @mark-matrix/api test`
Expected: all tests pass. The cycle 1–7 suite + the new audit suite (9 new test files).

If any pre-existing test fails, it's a regression — fix the underlying handler or update the test if the change is intentional. Do NOT skip existing tests.

- [ ] **Step 2: Run lint at the repo root**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 3: Run typecheck at the repo root**

Run: `pnpm typecheck`
Expected: clean across all packages.

- [ ] **Step 4: Run the RLS test suite against local dev DB**

Run: `pnpm test:rls`
Expected: all RLS tests pass (existing + the 7 from Task 3).

- [ ] **Step 5: Write a short cycle-8a summary in the changelog / cycle notes**

Append to `docs/superpowers/plans/` a brief retro file `2026-10-01-cycle-8a-retro.md` (or whatever convention the user prefers) covering:
- Number of audit rows emitted per action type in the local dev DB after a smoke run (sanity check that volume is reasonable).
- Any follow-ups surfaced during implementation (e.g., if a real-DB integration test revealed the upsert-split needed adjustment).
- A note that cycle 8b can now build the admin browse/filter UI on top of this foundation.

- [ ] **Step 6: Final commit**

```bash
git add docs/superpowers/plans/2026-10-01-cycle-8a-retro.md
git commit -m "docs: cycle-8a retro and follow-up notes

Cycle 8a complete. 9 new test files (1 helper + 1 RLS + 7 domain),
22 instrumented write paths, audit_log_write SECURITY DEFINER function,
RLS-restricted to admin SELECT. Cycle 8b (admin browse UI) can now
build on this foundation.

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 7: Report completion**

Report back to the user:
- Cycle 8a is complete.
- All tests pass.
- Audit log is now capturing every sensitive write with before/after snapshots.
- Ready to start brainstorming cycle 8b (admin audit-log UI + security hardening).

---

**End of plan.**
