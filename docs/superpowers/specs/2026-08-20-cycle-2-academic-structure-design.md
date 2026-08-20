# Cycle 2 — Academic Structure Management (Design)

**Date:** 2026-08-20
**Status:** Approved for planning
**Depends on:** Cycle 1 (auth + RBAC), `docs/superpowers/specs/2026-08-18-cycle-1-auth-rbac-design.md`

---

## 1. Goal

Admin defines the `batch → program → sem → course` hierarchy that every later
cycle hangs off, assigns faculty to courses, and enrolls students. Cycle 1 left
the repo at "auth + RBAC + scaffold": the only table is `profiles`, and the only
domain route is `GET /api/admin/users`. Everything in this document is new.

Two things make this cycle load-bearing rather than merely CRUD:

1. **Faculty read-scope originates here.** `faculty_assignments` is what grants a
   faculty member access to a course. Attendance (cycle 3) and marks entry
   (cycle 4) inherit that scope rather than defining their own.
2. **Course credits originate here.** SGPA/CGPA (cycle 6) is unimplementable
   without them, so `courses.credits` is `NOT NULL` from the start rather than
   backfilled later.

---

## 2. Decisions

Each was settled explicitly during brainstorming; the rationale is recorded so a
later cycle does not silently reverse one.

| # | Decision | Rationale |
|---|---|---|
| D1 | **Strict tree.** `programs.batch_id` FK — a program is a per-batch instance ("BCA 2023"), not a shared catalog entry. | Matches `CLAUDE.md`'s hierarchy and the `/batch/:b/program/:p/sem/:s` URL shape exactly. Every ancestor is derivable by walking FKs. Cost: program name/code repeats per batch, accepted. |
| D2 | **Composite FKs, not triggers,** enforce that `student_enrollments`' `(batch_id, program_id, sem_id)` tuple is internally consistent. | Makes a mismatched tuple *unrepresentable* rather than merely rejected. No procedural code to maintain or forget. |
| D3 | **Role-satellite tables** — `student_profiles`, `faculty_profiles`, `admin_profiles` keyed on `user_id`, holding role-specific columns. `profiles` keeps `name`/`role`. | Roll numbers belong to students only; bolting `roll_number` onto `profiles` would leave it NULL for two of three roles. |
| D4 | **Satellites hold no `role` column.** Their FK is `user_id → profiles(user_id)` alone. Role correctness is enforced by a `BEFORE INSERT OR UPDATE` trigger on each satellite that reads `profiles.role` and raises on mismatch. | Keeps the satellite tables free of a constant, non-data column. Costs procedural code in place of a declarative constraint — see §4.1. |
| D5 | **Satellites carry no `created_at`/`updated_at`.** | `profiles` already owns the row lifecycle; duplicating invites drift. |
| D6 | **CSV bulk enroll matches on `roll_number`.** Unknown roll number is a per-row error; no account is ever created. | User provisioning stays a cycle-1 concern. Bulk enroll is not an invite endpoint. |
| D7 | **zod** for all request and CSV-row validation; becomes the first runtime dependency of `packages/shared`. | One schema definition serves API validation, CSV row validation, and TypeScript types via `z.infer`. |
| D8 | **`ON DELETE RESTRICT` everywhere**; deleting a parent with children returns `409`. | Safest default for academic records. No soft-delete flag, which would complicate every query, every RLS policy, and every unique index. |
| D9 | **Hand-rolled CSV parser** in `packages/shared`, not `papaparse`. | ~60 lines, fully unit-testable, and living in `shared` lets the web app pre-validate before upload while the API re-validates authoritatively. |
| D10 | **All handlers use the RLS-bound per-request client** (`c.get("supabase")`). The service-role client stays unused. | Makes RLS genuinely load-bearing and therefore genuinely tested; `requireRole` becomes defence-in-depth rather than the only gate. |

---

## 3. Migrations

Four files under `supabase/migrations/`, applied in order. Timestamps continue
cycle 1's `20260818100000`–`20260818100002` sequence.

### 3.1 `20260820100000_role_profiles.sql`

```sql
create table public.student_profiles (
  user_id        uuid primary key
                 references public.profiles(user_id) on delete cascade,
  roll_number    text not null unique,
  admission_year integer not null check (admission_year between 2000 and 3000)
);

create table public.faculty_profiles (
  user_id       uuid primary key
                references public.profiles(user_id) on delete cascade,
  employee_code text not null unique,
  department    text,
  designation   text
);

create table public.admin_profiles (
  user_id       uuid primary key
                references public.profiles(user_id) on delete cascade,
  employee_code text not null unique,
  designation   text
);
```

Role correctness is enforced by a single parameterized trigger function reused
across all three tables, rather than three near-identical ones:

```sql
create or replace function public.assert_profile_role()
returns trigger language plpgsql
security definer set search_path = public as $$
declare
  v_expected public.user_role := tg_argv[0]::public.user_role;
  v_actual   public.user_role;
begin
  select role into v_actual
    from public.profiles
   where user_id = new.user_id;

  if v_actual is null then
    raise exception 'no profile exists for user %', new.user_id
      using errcode = '23503';
  end if;

  if v_actual <> v_expected then
    raise exception 'user % has role %, expected %',
      new.user_id, v_actual, v_expected
      using errcode = '23514';
  end if;

  return new;
end $$;

create trigger student_profiles_role_check
  before insert or update of user_id on public.student_profiles
  for each row execute function public.assert_profile_role('student');
```

`faculty_profiles` and `admin_profiles` get the equivalent trigger with
`'faculty'` / `'admin'`.

Three details that matter:

- The trigger fires on **`INSERT` *and* `UPDATE OF user_id`**. Insert-only would
  let a row be repointed at a user of the wrong role afterwards.
- It is `security definer` because it reads `profiles`, which has RLS enabled.
- The raised `errcode`s are chosen to land on the existing error contract:
  `23503` and `23514` already map to `409` in §5.1, so no new error handling is
  required.

The satellite-side trigger guards only one direction. A second trigger on
`profiles` guards the other — changing a user's role while a satellite row still
exists:

```sql
create or replace function public.block_role_change_with_satellite()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and (exists (select 1 from public.student_profiles where user_id = old.user_id)
       or exists (select 1 from public.faculty_profiles where user_id = old.user_id)
       or exists (select 1 from public.admin_profiles   where user_id = old.user_id))
  then
    raise exception
      'cannot change role for % while a role profile exists', old.user_id
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger profiles_block_role_change
  before update of role on public.profiles
  for each row execute function public.block_role_change_with_satellite();
```

Promotion and demotion therefore become: delete the satellite row, change the
role, create the new satellite row — which is why the satellite resources in §5
expose `DELETE`.

RLS for all three follows cycle 1's `profiles` template — own-row `SELECT`, plus
`ALL` for admin:

```sql
alter table public.student_profiles enable row level security;

create policy student_profiles_select_own on public.student_profiles
  for select using (user_id = auth.uid());

create policy student_profiles_admin_all on public.student_profiles
  for all using (public.is_admin()) with check (public.is_admin());
```

**Roll-number normalization:** `roll_number` is stored as entered but normalized
to uppercase and trimmed by the zod schema before it reaches the database, so
`unique` behaves case-insensitively in practice without needing `citext`.

### 3.2 `20260820100001_academic_structure.sql`

A shared `updated_at` trigger is defined here with `create or replace` so it is
safe regardless of whether cycle 1 already introduced one:

```sql
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create table public.batches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  start_year integer not null check (start_year between 2000 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.programs (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.batches(id) on delete restrict,
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, code),
  unique (id, batch_id)          -- FK target for semesters
);
create index programs_batch_id_idx on public.programs (batch_id);

create table public.semesters (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete restrict,
  number     integer not null check (number between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, number),
  unique (id, program_id)        -- FK target for student_enrollments
);
create index semesters_program_id_idx on public.semesters (program_id);

create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semesters(id) on delete restrict,
  code        text not null,
  title       text not null,
  credits     integer not null check (credits between 1 and 10),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (semester_id, code),
  unique (id, semester_id)       -- FK target for later cycles (marks, attendance)
);
create index courses_semester_id_idx on public.courses (semester_id);
```

A `set_updated_at` `BEFORE UPDATE` trigger is attached to all four tables.

The `unique (id, <parent>)` constraints look redundant beside the primary key.
They are not decorative: PostgreSQL requires a unique constraint on the exact
referenced column list for a composite foreign key to target it.

### 3.3 `20260820100002_assignments_enrollments.sql`

```sql
create table public.faculty_assignments (
  id            uuid primary key default gen_random_uuid(),
  faculty_id    uuid not null
                references public.faculty_profiles(user_id) on delete restrict,
  course_id     uuid not null
                references public.courses(id) on delete restrict,
  assigned_date timestamptz not null default now(),
  unique (faculty_id, course_id)
);
create index faculty_assignments_course_id_idx  on public.faculty_assignments (course_id);
create index faculty_assignments_faculty_id_idx on public.faculty_assignments (faculty_id);

create table public.student_enrollments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null
                  references public.student_profiles(user_id) on delete restrict,
  batch_id        uuid not null,
  program_id      uuid not null,
  sem_id          uuid not null,
  enrollment_date timestamptz not null default now(),
  unique (student_id, sem_id),
  foreign key (sem_id, program_id)
    references public.semesters(id, program_id) on delete restrict,
  foreign key (program_id, batch_id)
    references public.programs(id, batch_id) on delete restrict
);
create index student_enrollments_student_id_idx on public.student_enrollments (student_id);
create index student_enrollments_sem_id_idx     on public.student_enrollments (sem_id);
```

`batch_id`, `program_id` and `sem_id` have no single-column FKs; the two
composite FKs cover referential integrity transitively and additionally
guarantee the tuple is mutually consistent.

**Three of the five required test scenarios are satisfied by constraints, not
application code:**

| Requirement | Enforced by |
|---|---|
| Duplicate enrollment rejected | `unique (student_id, sem_id)` → `23505` |
| Assigning faculty to a non-existent course fails cleanly | `course_id` FK → `23503` |
| A non-faculty user cannot be assigned | `faculty_id` → `faculty_profiles` FK → `23503` |

### 3.4 `20260820100003_academic_rls.sql`

Helper functions mirror cycle 1's `is_admin()` exactly: `stable`,
`security definer`, `set search_path = public`, `revoke ... from public`,
`grant execute ... to authenticated`.

They **must** be `security definer`. A policy on `courses` that reads
`faculty_assignments` directly would recurse into that table's own policies;
a definer function bypasses RLS and terminates.

```sql
create or replace function public.teaches_course(p_course_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.faculty_assignments fa
    where fa.course_id = p_course_id
      and fa.faculty_id = auth.uid()
  );
$$;
```

Full helper set:

- `teaches_course(uuid)`
- `teaches_any_in_semester(uuid)` — joins `faculty_assignments → courses`
- `teaches_any_in_program(uuid)` — joins through `semesters`
- `teaches_any_in_batch(uuid)` — joins through `programs`
- `is_enrolled_in_sem(uuid)`, `is_enrolled_in_program(uuid)`, `is_enrolled_in_batch(uuid)`

**Policy matrix** (policies are OR-ed, so one per role per table):

| Table | Admin | Faculty | Student |
|---|---|---|---|
| `batches` | `ALL` via `is_admin()` | `SELECT` via `teaches_any_in_batch(id)` | `SELECT` via `is_enrolled_in_batch(id)` |
| `programs` | `ALL` | `SELECT` via `teaches_any_in_program(id)` | `SELECT` via `is_enrolled_in_program(id)` |
| `semesters` | `ALL` | `SELECT` via `teaches_any_in_semester(id)` | `SELECT` via `is_enrolled_in_sem(id)` |
| `courses` | `ALL` | `SELECT` via `teaches_course(id)` | — none — |
| `faculty_assignments` | `ALL` | `SELECT` where `faculty_id = auth.uid()` | — none — |
| `student_enrollments` | `ALL` | — none — | `SELECT` where `student_id = auth.uid()` |
| `*_profiles` | `ALL` | `SELECT` own | `SELECT` own |

Two deliberate scope choices, confirmed during brainstorming:

- **Faculty see the ancestors of their assigned courses.** Without this the
  faculty course list cannot display which semester a course belongs to, and
  cycle 3 needs the same scope.
- **Students get no access to `courses`.** The brief specifies enrollment plus
  its parent batch/program/sem, and this design does not widen that. A student
  therefore cannot list their semester's courses until a later cycle opens it.

---

## 4. Security notes

### 4.1 What the role triggers defend against

`faculty_assignments.faculty_id` references `faculty_profiles(user_id)`, and
`teaches_course()` matches on `auth.uid()` alone — it does not check the
caller's role. So a `faculty_profiles` row holding a student's uid is enough to
make that student assignable to courses and grant them faculty-level course
reads while their JWT still says `student`.

Two ways that row could come about, and the trigger that closes each:

| Path | Guard |
|---|---|
| A student's uid is inserted into `faculty_profiles` — mistyped UUID, bug in a picker component | `assert_profile_role('faculty')` on insert/update of `user_id` |
| A genuine faculty member is demoted to student while their satellite row and assignments remain | `block_role_change_with_satellite()` on `profiles` |

This is enforcement by procedural code rather than by a constraint, which is a
deliberate trade (D4): the satellite tables stay free of a constant `role`
column, at the cost of two trigger functions that must be tested directly. §7.2
scenarios 6 and 7 exist for exactly that reason — a trigger that silently stops
firing is invisible without a test that provokes it.

### 4.3 Interaction between `CASCADE` and `RESTRICT`

Satellites cascade from `profiles`, but `faculty_assignments` and
`student_enrollments` reference the satellites with `RESTRICT`. The chain is
therefore: deleting a `profiles` row attempts to cascade into the satellite,
which is blocked if that person still holds assignments or enrollments, and the
entire delete fails. This is the desired behaviour — a faculty member who
teaches courses cannot be deleted out from under them — but it means user
deletion requires unwinding assignments first, and the error surfaces as `409`.

### 4.2 Two-layer enforcement

`requireRole("admin")` at the Hono tier and RLS at the database tier both apply.
Because handlers use the RLS-bound client (D10), removing the middleware would
not by itself grant access — the policies would still reject the write. Tests
assert both layers independently (§7).

---

## 5. API surface

All admin routes sit under the existing `app.use("/api/admin/*", requireRole("admin"))`
guard. Two new guards are added: `app.use("/api/faculty/*", requireRole("faculty"))`
and `app.use("/api/student/*", requireRole("student"))`.

Entity management uses flat resource routes with query-param scoping. The
nested `/batch/:b/program/:p/...` paths described in `CLAUDE.md` are for *leaf
data* (marks, attendance) in later cycles, not for managing the entities.

| Method | Path | Notes |
|---|---|---|
| `GET` `POST` | `/api/admin/batches` | |
| `GET` `PATCH` `DELETE` | `/api/admin/batches/:id` | |
| `GET` `POST` | `/api/admin/programs?batchId=` | |
| `GET` `PATCH` `DELETE` | `/api/admin/programs/:id` | |
| `GET` `POST` | `/api/admin/semesters?programId=` | |
| `GET` `PATCH` `DELETE` | `/api/admin/semesters/:id` | |
| `GET` `POST` | `/api/admin/courses?semesterId=` | |
| `GET` `PATCH` `DELETE` | `/api/admin/courses/:id` | |
| `GET` `POST` | `/api/admin/faculty-assignments?courseId=&facultyId=` | |
| `DELETE` | `/api/admin/faculty-assignments/:id` | |
| `GET` `POST` | `/api/admin/enrollments?semId=&studentId=` | |
| `DELETE` | `/api/admin/enrollments/:id` | |
| `POST` | `/api/admin/enrollments/bulk` | CSV → per-row report |
| `GET` `POST` | `/api/admin/students` · `/faculty` · `/admins` | satellite CRUD; `GET` joins `profiles` for `name` |
| `PATCH` `DELETE` | `/api/admin/students/:userId` · `/faculty/:userId` · `/admins/:userId` | `DELETE` is required by the promotion/demotion flow in §4.1 |
| `PATCH` | `/api/admin/users/:userId` | sets `profiles.role` and `name`; extends cycle 1's `routes/admin/users.ts`. The **only** way to make someone faculty or admin |
| `GET` | `/api/faculty/courses` | RLS does the filtering |
| `GET` | `/api/student/enrollment` | enrollment + batch/program/sem context |

The last two exist so tests 2 and 3 assert through a real endpoint rather than a
raw table read.

### 5.1 Error contract

| Condition | Status | Body |
|---|---|---|
| zod validation failure | `400` | `{ error: "validation_failed", fields: [{path, message}] }` |
| PG `23503` FK violation | `409` | `{ error: "invalid_reference", detail }` |
| PG `23503` on DELETE (has children) | `409` | `{ error: "has_dependents", detail }` |
| PG `23505` unique violation | `409` | `{ error: "duplicate", detail }` |
| Row not found / not visible | `404` | `{ error: "not_found" }` |
| Wrong role | `403` | `{ error: "forbidden" }` (existing middleware) |

RLS invisibility and genuine absence both surface as `404`. This is intentional:
distinguishing them would leak the existence of rows the caller cannot see.

### 5.2 Bulk CSV enroll

Request: `POST /api/admin/enrollments/bulk` with
`{ semId, csv }` — `semId` scopes the whole upload, `csv` is the raw text.

Expected columns: `roll_number` (required). A header row is required, and
columns are located **by header name, matched case-insensitively after
trimming**, so column order does not matter and extra columns are ignored.
`batch_id` and `program_id` are derived server-side from `semId` by walking the
tree, so the CSV cannot introduce an inconsistent tuple.

Processing is **row-independent**: parse → `safeParse` each row → look up
`student_profiles` by normalized roll number → insert. Rows are inserted
individually, not as one statement, so one failure cannot roll back the batch.

Response `200`:

```json
{
  "enrolled": 2,
  "errors": [
    { "row": 4, "rollNumber": "23BCA999", "reason": "no_such_student" },
    { "row": 5, "rollNumber": "23BCA001", "reason": "already_enrolled" },
    { "row": 6, "rollNumber": "",         "reason": "validation_failed" }
  ]
}
```

A malformed row never fails the batch. `row` is the 1-based line number in the
original file including the header, so it maps to what the admin sees in a
spreadsheet.

### 5.3 Role and satellite lifecycle

Satellite rows are **never auto-created** — not at enrollment, not at
assignment. `roll_number` and `employee_code` are `NOT NULL` and cannot be
invented, so a satellite row always means a fully-identified person. This makes
"exists" and "enrollable" the same state, which is what lets bulk CSV enroll
match on roll number without a partial-record fallback.

Cycle 1's `handle_new_user` trigger hardcodes `role = 'student'`, so every user
begins as a student. The order of operations is forced by the two triggers in
§3.1:

| Goal | Sequence |
|---|---|
| Identify a student | `POST /api/admin/students { userId, rollNumber, admissionYear }` |
| Promote to faculty | `PATCH /api/admin/users/:userId { role: "faculty" }` → `POST /api/admin/faculty { userId, employeeCode, … }` |
| Demote / change role with a satellite present | `DELETE /api/admin/{role}/:userId` → `PATCH /api/admin/users/:userId` → `POST` the new satellite |

The middle row is why `PATCH /api/admin/users/:userId` must exist: without it,
`profiles.role` can never become `faculty`, `assert_profile_role('faculty')`
rejects every `faculty_profiles` insert, and `faculty_assignments` is
permanently unpopulated. The third row is why the satellites expose `DELETE` —
`block_role_change_with_satellite()` rejects the `PATCH` otherwise, with the
`409` mapping from §5.1.

Bootstrap remains outside the API: `scripts/seed-admin.ts` promotes the first
admin using the service-role key, since no admin exists yet to authorize the
`PATCH`.

---

## 6. Code layout

### 6.1 `packages/shared` — new runtime dependency `zod`

| File | Contents |
|---|---|
| `src/schemas/academic.ts` | create/update schemas for batches, programs, semesters, courses, assignments, enrollments; types via `z.infer` |
| `src/schemas/profiles.ts` | create/update schemas for the three satellites; `rollNumber` normalization (`trim().toUpperCase()`) |
| `src/csv.ts` | `parseCsv(text): string[][]` — RFC4180-ish: quoted fields, embedded commas/newlines, CRLF; and `parseEnrollCsv(text)` returning `{ rows, errors }` |
| `src/index.ts` | re-exports; `API_ROUTES` gains the paths in §5 |

### 6.2 `apps/api/src`

| File | Contents |
|---|---|
| `lib/pgErrors.ts` | maps PostgREST/PG error codes to the §5.1 contract |
| `lib/crudFactory.ts` | builds the five standard handlers from `{ table, createSchema, updateSchema, scopeColumn }` |
| `routes/admin/batches.ts` · `programs.ts` · `semesters.ts` · `courses.ts` | thin — each configures the factory |
| `routes/admin/facultyAssignments.ts` | |
| `routes/admin/enrollments.ts` | single + `DELETE` |
| `routes/admin/bulkEnroll.ts` | §5.2 |
| `routes/admin/roleProfiles.ts` | the three satellite resources |
| `routes/admin/users.ts` | **extended** — cycle 1's `GET` gains `PATCH /:userId` for `role`/`name` (§5.3) |
| `routes/faculty/courses.ts` | |
| `routes/student/enrollment.ts` | |
| `index.ts` | wiring + the two new `requireRole` guards |

The factory is justified by 4 entities × 5 handlers = 20 near-identical
handlers. It stays deliberately simple: no hooks, no generics beyond the schema
types, and the non-uniform routes (assignments, enrollments, bulk) are written
out longhand rather than bent to fit it.

### 6.3 `apps/web/src`

| File | Contents |
|---|---|
| `lib/api.ts` | fetch wrapper; attaches the Supabase access token, base `VITE_API_ORIGIN`, throws typed errors |
| `lib/useResource.ts` | small `useState`/`useEffect` hook — no react-query, no axios |
| `pages/admin/AcademicStructurePage.tsx` | drill-down master-detail: batches → programs → semesters → courses |
| `pages/admin/UsersPage.tsx` | **replaces `UsersPlaceholder`** — lists users, changes role, creates/edits/deletes the role satellite. Without this the UI cannot produce a faculty member, so assignment has nobody to assign |
| `pages/admin/components/EntityPanel.tsx` | one reusable column: list + inline create/edit form + delete |
| `pages/admin/AssignmentsPage.tsx` | pick course, pick faculty, list/remove |
| `pages/admin/EnrollmentsPage.tsx` | single enroll + CSV upload |
| `pages/admin/components/CsvEnrollUpload.tsx` | file drop → client-side parse/validate preview → submit → server report |
| `pages/faculty/FacultyCoursesPage.tsx` | replaces the placeholder; demonstrates the RLS scope |
| `App.tsx`, `shell/navConfig.ts`, `styles.css` | routes, nav entries, new BEM-ish classes |

No UI library, no Tailwind, no form library — consistent with the existing
hand-written CSS and `useState` forms.

### 6.4 Scripts

`scripts/seed-test-users.ts` is extended to create satellite rows for the
existing `admin.test` / `faculty.test` / `student.test` users, so local dev has
a usable roll number and employee code.

---

## 7. Testing

### 7.1 Ungated — run on plain `pnpm test`, no credentials

| File | Covers |
|---|---|
| `packages/shared/src/schemas.test.ts` | every zod schema, valid and invalid; roll-number normalization |
| `packages/shared/src/csv.test.ts` | quoted fields, embedded commas, CRLF, ragged rows, empty file, header-only, BOM |
| `apps/api/src/tests/academic.crud.test.ts` | each entity's five handlers against a mocked Supabase; `409` mapping for `23503`/`23505`; `404` for missing |
| `apps/api/src/tests/academic.rbac.test.ts` | **table-driven**: every mutating route × {faculty, student} → `403`; × missing auth → `401` |
| `apps/api/src/tests/bulkEnroll.test.ts` | valid rows enrolled, malformed rows reported, batch not failed, row numbers correct |
| `apps/web/src/tests/CsvEnrollUpload.test.tsx` | preview of valid/invalid rows; server report rendering |
| `apps/web/src/tests/AcademicStructurePage.test.tsx` | drill-down, create form, delete-blocked `409` message |

`academic.rbac.test.ts` is the answer to test requirement 1 at the API layer;
RLS covers the same ground independently at the database layer.

### 7.2 Gated — `SUPABASE_TEST_RLS=1`, real Supabase

`apps/api/src/tests/rls.academic.test.ts`, following the existing `itIf` +
`beforeAll`-provisioning pattern from `rls.profiles.test.ts` verbatim. Skips
(does not fail) without credentials, so `pnpm test` stays green.

| # | Scenario | Assertion |
|---|---|---|
| 1 | Non-admin writes | faculty and student `INSERT`/`UPDATE`/`DELETE` on all six tables → error |
| 2 | **Faculty read before/after assignment** | read course → 0 rows; insert assignment; read course → 1 row |
| 3 | Student enrollment context | student reads own enrollment and can join to its batch/program/sem; cannot read another student's |
| 4a | Duplicate enrollment | second insert of same `(student, sem)` → `23505` |
| 4b | Bad `course_id` | assignment insert with random UUID → `23503` |
| 4c | Non-faculty assignment | assignment insert with a student's uid → `23503` |
| 5 | Tuple integrity | enrollment with mismatched `(batch, program, sem)` → `23503` |
| 6 | **Wrong-role satellite insert** | a student's uid inserted into `faculty_profiles` → `23514` from `assert_profile_role` |
| 7 | **Role change with satellite** | `update profiles set role` for a user holding a satellite row → `23514` from `block_role_change_with_satellite`; succeeds after the satellite is deleted |

Scenario 2 is the important one: reading **before** the assignment proves the
policy rather than the endpoint. A test that only reads after assignment would
pass even with RLS disabled.

---

## 8. Out of scope

Deferred deliberately, listed so a later cycle does not assume they exist:

- Attendance, marks, gradesheets, SGPA/CGPA (cycles 3–6)
- Audit logging and record locking (cycles 7–8)
- Student access to `courses`
- Faculty **write** access to anything
- Soft delete / archival
- Pagination on list endpoints — all return full result sets, acceptable at
  lab-scale data volumes
- Auto-creating auth users from CSV (D6)
- Cross-batch course reuse / a shared course catalog (D1)

---

## 9. Acceptance criteria

1. `pnpm db:reset` applies all four migrations cleanly on a fresh database.
2. `pnpm lint && pnpm typecheck && pnpm test` passes with no credentials
   configured; all gated tests report as skipped, none fail.
3. `SUPABASE_TEST_RLS=1 pnpm test:rls` passes against a real Supabase, with
   every §7.2 scenario green.
4. An admin can, through the UI alone, create a batch → program → semester →
   course, assign a faculty member, enroll a student, and bulk-enroll from a
   CSV containing both valid and malformed rows, seeing a per-row report.
5. A faculty member sees a course in `/faculty/courses` only after being
   assigned to it.
6. Deleting a parent that still has children returns `409` with a message
   naming what blocks it, and the UI surfaces that message.
7. An admin can take a freshly signed-up user all the way to teaching a course
   — promote to faculty, create the faculty profile, assign a course — using
   only the API/UI. No direct database access or service-role script is needed
   beyond the initial admin bootstrap.
