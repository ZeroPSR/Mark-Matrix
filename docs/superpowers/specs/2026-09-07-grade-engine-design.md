# Cycle 5 — Grade Computation Engine (Design)

**Date:** 2026-09-07
**Status:** Approved for planning
**Depends on:** Cycle 1 (auth + RBAC), Cycle 2 (academic structure),
Cycle 4 (marks), `docs/superpowers/specs/2026-08-20-cycle-2-academic-structure-design.md`,
`supabase/migrations/20260820100009_marks.sql`

---

## 1. Goal

Convert per-exam marks into per-course grades, then aggregate into SGPA
(per semester) and CGPA (cumulative), against an admin-configurable
grading scheme. The grade a student was awarded must not silently change
because an admin later edits the scheme.

Three things make this cycle load-bearing rather than another CRUD pass:

1. **It introduces the second snapshot pattern.** Marks already snapshot
   `max_marks` from `course_exam_types`. This cycle snapshots
   `grade_scheme_id` (and the resolved label/point) onto a new
   `course_grades` table.
2. **It is the first derived-data cache in the system.** `course_grades`
   is the first row that is *computed from other tables* and then read
   back. The cache lifecycle (lazy population, invalidate-on-resubmit)
   has to be defined here because SGPA/CGPA compute against it.
3. **It closes the `marks → grade → SGPA → CGPA` pipeline end-to-end**,
   so students finally have something to look at in `MyMarksPage`.

---

## 2. Decisions

Each was settled explicitly during brainstorming; the rationale is
recorded so a later cycle does not silently reverse one.

| # | Decision | Rationale |
|---|---|---|
| G1 | **Per-course rollup, not per-exam_type.** One grade per (course, student). | A course with mid-sem + end-sem rows conceptually yields one letter grade, not two. SGPA is naturally defined per-course. The grade point that feeds SGPA is unambiguous. |
| G2 | **Weighted by `courses.credits`.** SGPA = Σ(point × credits) / Σ(credits). | `courses.credits` already exists (integer 1–10, NOT NULL from cycle 2) precisely because cycle 6 was anticipated. Standard academic convention. |
| G3 | **Snapshot lives in a new `course_grades` table** with `grade_scheme_id` FK. Snapshot is the *resolved* `grade_label` + `grade_point`, not the full scheme JSON. | Reusing `marks` would either couple grades to exam_type granularity (G1) or duplicate `marks` for two purposes. A dedicated table keeps the snapshot lifecycle (lazy write, invalidate-on-resubmit) in one place. Storing the resolved values means past results are stable even if the scheme row itself is deleted later — but the FK is kept for traceability ("which scheme produced this grade?"). |
| G4 | **Course-scoped schemes override program-scoped.** Lookup order: course match → program match → 422 `no_grade_scheme`. Within a scope, if multiple `scheme_group`s exist, the most recently updated one wins (ties broken by `id`). | Lets admin carve out exceptions for individual courses (e.g. project courses, audit courses) without redefining the whole program. Course scope is the inner, more specific ring. "Most recently updated" picks the active scheme if admin forgot to delete an obsolete one. |
| G5 | **One "scheme" = one `scheme_group` + multiple bands.** Bands share a group name (e.g. `"FYUGC 2024"`) and a scope/course-or-program anchor. | Lets admin describe a whole scheme in one read (`WHERE scheme_group = $1`) and create/update/delete the bands together. Each band is its own row because its `min_marks`/`max_marks`/`grade_point` are independent data. |
| G6 | **`course_grades` is computed lazily on first read after submit.** Cached rows are deleted by trigger when marks transition `draft → submitted` for that course. Subsequent reads hit the cache. | Matches the "snapshot is preserved" requirement: the first read after submit captures the current scheme; later reads return that row even if the scheme has been edited. Resubmitting after a faculty correction recomputes, because the trigger deletes the cache. |
| G7 | **Faculty can read CGPA, not just SGPA.** All three role prefixes see `/sem/:s/score/sgpa` and `/score/cgpa`. | Confirmed during brainstorming. Faculty advising benefits from longitudinal view. Cost is zero — same handler. |
| G8 | **Pure compute lives in `packages/shared/src/grades.ts`.** No DB access. | The boundary test requirements (boundaries, hand-calculated SGPA sample, known CGPA values) are all about pure logic. Keeping them out of the API layer lets Vitest exercise them in milliseconds with no Supabase mock. The API layer does scheme lookup and persistence; the shared layer does the math. |
| G9 | **Admin CRUD = API routes only.** Web UI for managing schemes is deferred, mirroring how `course_exam_types` management UI is deferred in the marks module's `FUTURE_WORK.md`. | Avoids scope creep into React form work for what is fundamentally a one-time-per-program setup. Web UI can be added later without schema changes. |
| G10 | **`computeSgpa` returns 0 for empty input**; `computeCgpa` returns 0 for empty input. Both throw `GradeInputError` for negative or NaN inputs and for SGPA when any course lacks a credit. | Empty is a legitimate state ("student has no submitted marks yet"); zero is the right answer. Missing-credit is an invariant violation that callers must be told about. |

---

## 3. Migrations

One new migration: `supabase/migrations/20260820100010_grade_schemes.sql`.

### 3.1 `grade_schemes`

```sql
create type public.grade_scope as enum ('course', 'program');

create table public.grade_schemes (
  id            uuid primary key default gen_random_uuid(),
  scheme_group  text not null,
  scope         public.grade_scope not null,
  course_id     uuid references public.courses(id)   on delete cascade,
  program_id    uuid references public.programs(id)  on delete cascade,
  grade_label   text not null,
  min_marks     numeric(5,2) not null check (min_marks between 0 and 100),
  max_marks     numeric(5,2) not null check (max_marks between 0 and 100),
  grade_point   numeric(4,2) not null check (grade_point between 0 and 10),
  is_passing    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Exactly one of course_id / program_id is set, matching scope.
  check (
    (scope = 'course'  and course_id is not null and program_id is null) or
    (scope = 'program' and program_id is not null and course_id  is null)
  ),
  check (min_marks <= max_marks),
  unique (scheme_group, scope, coalesce(course_id, program_id), grade_label)
);

create index grade_schemes_course_idx  on public.grade_schemes (course_id)  where course_id  is not null;
create index grade_schemes_program_idx on public.grade_schemes (program_id) where program_id is not null;
create index grade_schemes_group_idx   on public.grade_schemes (scheme_group);

create trigger grade_schemes_set_updated_at
  before update on public.grade_schemes
  for each row execute function public.set_updated_at();
```

The `unique (scheme_group, scope, coalesce(course_id, program_id), grade_label)`
constraint prevents two bands with the same label in the same scheme-group
under the same scope/anchor, while still allowing bands with overlapping
numeric ranges under *different* labels (the overlap check is the API's
job, since SQL check constraints can't easily express "for any two rows
in the same scheme_group, max < other's min").

### 3.2 `course_grades`

```sql
create table public.course_grades (
  id              uuid primary key default gen_random_uuid(),
  course_id       uuid not null references public.courses(id) on delete cascade,
  student_id      uuid not null references public.student_profiles(user_id) on delete cascade,
  total_obtained  numeric(7,2) not null check (total_obtained >= 0),
  total_max       numeric(7,2) not null check (total_max > 0),
  percentage      numeric(5,2) not null check (percentage between 0 and 100),
  grade_label     text not null,
  grade_point     numeric(4,2) not null check (grade_point between 0 and 10),
  grade_scheme_id uuid not null references public.grade_schemes(id) on delete restrict,
  computed_at     timestamptz not null default now(),
  unique (course_id, student_id)
);

create index course_grades_course_idx  on public.course_grades (course_id);
create index course_grades_student_idx on public.course_grades (student_id);
```

`grade_scheme_id` uses `on delete restrict` rather than `cascade`. The
admin should not be able to silently lose history by deleting a scheme
row. (Cycle 1 has no soft-delete convention; refusing the delete is the
shortest honest answer.)

### 3.3 Cache-invalidation trigger

```sql
create or replace function public.invalidate_course_grades_on_submit()
returns trigger language plpgsql
security definer set search_path = public as $$
begin
  if new.status = 'submitted' and old.status is distinct from 'submitted' then
    delete from public.course_grades where course_id = new.course_id;
  end if;
  return new;
end $$;

create trigger marks_invalidate_course_grades
  after update of status on public.marks
  for each row execute function public.invalidate_course_grades_on_submit();
```

Fires on every `marks.status` transition into `submitted`. Deleting the
cached `course_grades` row means the next GET recomputes — with the
*current* scheme, which may have been edited since the previous cache
write. That's exactly what G6 promises: the snapshot is preserved from
the last computation until the next resubmission.

### 3.4 RLS

`grade_schemes`:
- Admin: full (`for all`).
- Faculty: `for select` using `teaches_course(course_id)` OR
  `(scope = 'program' and program_id in (select semester.program_id ... via courses))`.
  For program-scope schemes, faculty can read schemes for programs they
  have at least one course assignment in. (Implemented as a subquery
  joining `courses` → `semesters` → `program_id` filtered by
  `teaches_course`.)
- Student: `for select` using `exists (... marks where student_id = auth.uid() and course_id = grade_schemes.course_id)` — i.e. they see the scheme that applies to a course they have marks in. For program-scope schemes, the same existence check on any course in that program.

`course_grades`:
- Admin: full.
- Faculty: `for select` using `teaches_course(course_id)`.
- Student: `for select` using `student_id = auth.uid()`.

---

## 4. Shared package

### 4.1 New file: `packages/shared/src/grades.ts`

Pure functions and zod schemas.

```ts
// Compute input shape — what comes from the DB.
export interface GradeBand {
  gradeLabel: string;
  minMarks: number;   // inclusive, 0-100
  maxMarks: number;   // inclusive, 0-100
  gradePoint: number; // 0-10
  isPassing: boolean;
}

export interface CourseMarks {
  marksObtained: number;
  maxMarks: number;
}

export interface CourseCredit {
  courseId: string;
  credits: number;
}

export interface CourseGrade {
  totalObtained: number;
  totalMax: number;
  percentage: number;
  gradeLabel: string;
  gradePoint: number;
  isPassing: boolean;
}

// Errors are values, not exceptions thrown into the runtime.
export class GradeInputError extends Error { code = "grade_input_error"; }
export class GradeOutOfRangeError extends Error { code = "grade_out_of_range"; }
export class GradeMissingSchemeError extends Error { code = "grade_missing_scheme"; }
export class GradeMissingCreditError extends Error { code = "grade_missing_credit"; }

export function deriveGrade(
  percentage: number,
  bands: readonly GradeBand[],
): { gradeLabel: string; gradePoint: number; isPassing: boolean };
//  - throws GradeOutOfRangeError if percentage < 0 or > 100
//  - throws GradeInputError if bands is empty OR if the highest band's max < 100
//    (gaps above the top band are not allowed — admin must cover [0, 100])
//  - throws GradeInputError if bands do not cover [0, 100] contiguously (any gap)
//  - bands ordered by minMarks DESC; first band where percentage >= minMarks wins
//  - "below all bands" (percentage above 100) is impossible by the first rule

export function computeCourseGrade(
  marks: readonly CourseMarks[],
  bands: readonly GradeBand[],
): CourseGrade;
//  - throws GradeInputError if marks is empty
//  - calls deriveGrade(total_pct, bands)
//  - percentage rounded to 2 decimals

export function computeSgpa(
  courseGrades: readonly { courseId: string; gradePoint: number }[],
  credits: ReadonlyMap<string, number>,
): number;
//  - throws GradeInputError on negative/NaN grade points
//  - throws GradeMissingCreditError if any courseId not in credits
//  - returns 0 if courseGrades is empty
//  - returns sum(point*credit) / sum(credit), rounded to 2 decimals

export function computeCgpa(sgpas: readonly number[]): number;
//  - throws GradeInputError on negative or NaN
//  - returns 0 if empty
//  - returns arithmetic mean, rounded to 2 decimals
```

### 4.2 New file: `packages/shared/src/grades.test.ts`

Vitest cases covering the spec's test requirements:

- `deriveGrade`:
  - exact `min_marks` of one band → that band
  - exact `max_marks` of one band → that band
  - value strictly between `min_marks` and `max_marks` of one band → that band
  - boundary between two bands (`X == band1.min_marks` AND `X == band2.max_marks`) → higher band (since bands are ordered by min DESC, the higher band has the higher min)
  - bands with a gap above the top band (e.g. highest band max = 90, no band above) → throws `GradeInputError`
  - value above 100 → `GradeOutOfRangeError`
  - value below 0 → `GradeOutOfRangeError`
  - empty bands array → throws `GradeInputError`
- `computeSgpa`:
  - 5 courses with credits 4, 3, 3, 2, 4 and grade points 9, 8, 7, 10, 6 → hand-calculated value
- `computeCgpa`:
  - 3 semesters with SGPA 8.4, 7.8, 9.1 → mean
- `computeSgpa` empty → 0
- `computeCgpa` empty → 0
- `computeSgpa` with a missing credit → throws `GradeMissingCreditError`

### 4.3 New types and route constants

Append to `packages/shared/src/grades.ts`:

```ts
export const createGradeSchemeSchema = z.object({
  schemeGroup: z.string().trim().min(1).max(120),
  scope: z.enum(["course", "program"]),
  courseId: uuid.optional(),
  programId: uuid.optional(),
  gradeLabel: z.string().trim().min(1).max(20),
  minMarks: z.number().finite().min(0).max(100),
  maxMarks: z.number().finite().min(0).max(100),
  gradePoint: z.number().finite().min(0).max(10),
  isPassing: z.boolean().optional(),
}).refine(v => v.scope === "course" ? v.courseId && !v.programId : v.programId && !v.courseId, {
  message: "scope_and_anchor_mismatch",
});
export type CreateGradeScheme = z.infer<typeof createGradeSchemeSchema>;

export const patchGradeSchemeSchema = z.object({
  gradeLabel: z.string().trim().min(1).max(20).optional(),
  minMarks: z.number().finite().min(0).max(100).optional(),
  maxMarks: z.number().finite().min(0).max(100).optional(),
  gradePoint: z.number().finite().min(0).max(10).optional(),
  isPassing: z.boolean().optional(),
}).refine(v => Object.keys(v).length > 0, { message: "no_fields" });
export type PatchGradeScheme = z.infer<typeof patchGradeSchemeSchema>;

export interface GradeSchemeRow {
  id: string;
  schemeGroup: string;
  scope: "course" | "program";
  courseId: string | null;
  programId: string | null;
  gradeLabel: string;
  minMarks: number;
  maxMarks: number;
  gradePoint: number;
  isPassing: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseGradeRow {
  id: string;
  courseId: string;
  studentId: string;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  gradeLabel: string;
  gradePoint: number;
  gradeSchemeId: string;
  computedAt: string;
}

export interface CourseGradeResponse {
  courseId: string;
  studentId: string;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  gradeLabel: string;
  gradePoint: number;
  gradeSchemeId: string;
  schemeGroup: string;
  computedAt: string;
}

export interface SgpaResponse {
  studentId: string;
  semId: string;
  sgpa: number;
  courseCount: number;
  totalCredits: number;
  asOf: string;
}

export interface CgpaResponse {
  studentId: string;
  programId: string;
  cgpa: number;
  semesterCount: number;
  totalCredits: number;
  asOf: string;
}
```

Append to `packages/shared/src/routes.ts`:

```ts
adminGradeSchemes: "/api/admin/grade-schemes",
adminGradeSchemeById: (id: string) => `/api/admin/grade-schemes/${id}`,
courseGradeUrl: (role, batchId, programId, semId, courseId, studentId) =>
  `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/marks/${studentId}/grade`,
semSgpaUrl: (role, batchId, programId, semId) =>
  `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/score/sgpa`,
cgpaUrl: (role) => `/api/${role}/score/cgpa`,
```

And export everything from `packages/shared/src/index.ts` (already
re-exports `./grades.js` is added in this cycle).

---

## 5. API package

### 5.1 `apps/api/src/routes/admin/gradeSchemes.ts`

CRUD on `grade_schemes`. Mirrors `adminCourses.ts` etc. in cycle 2.

- `GET /` — list, supports `?scope=course&courseId=...` and `?scope=program&programId=...` and `?schemeGroup=...`.
- `POST /` — create one band (validate overlap via `route handler` calling a `checkNoOverlap` shared helper that fetches sibling bands and verifies the new range doesn't overlap).
- `PATCH /:id` — partial update.
- `DELETE /:id` — refuse (`409`) if any `course_grades` row references it. Otherwise delete.

### 5.2 `apps/api/src/routes/grades/core.ts`

Three exports for three mounts, matching the marks module:

```ts
// All three use the same handler set; RLS does the scoping.
export const gradesRoute = new Hono<AppEnv>()
  .get("/:studentId/grade", getCourseGrade);

export const facultyGradesRoute = new Hono<AppEnv>()
  .get("/:studentId/grade", getCourseGrade);

export const studentGradesRoute = new Hono<AppEnv>()
  .get("/:studentId/grade", getCourseGrade)
  // student can also request any studentId only if it's their own; otherwise 404
  // (RLS returns 0 rows, so this is naturally enforced)
```

### 5.3 `apps/api/src/routes/grades/sgpa.ts`

```ts
// GET /api/{admin|faculty|student}/batch/:b/program/:p/sem/:s/score/sgpa?studentId=...
export const sgpaRoute = new Hono<AppEnv>().get("/", getSgpa);

// student route forces studentId = auth.uid(); admin/faculty honour the query param
// if present, else default to auth.uid()
```

The handler:
1. Reads all submitted `marks` rows for the student across the courses in this semester (joined via `student_enrollments`).
2. Groups by `course_id`, computes total percentage per course.
3. For each course with submitted marks, calls `lookupSchemeBands(supabase, course_id)`. **Courses without a resolvable scheme are silently skipped** — excluded from both numerator and denominator. The API does not 422 because partial-semester results are still meaningful; surfacing the skip count lets clients tell the student "5 of 6 courses graded" if they want. `courseCount` in the response is the count of courses that *did* contribute.
4. Calls `computeCourseGrade` then persists the result into `course_grades` (lazy insert).
5. Reads each contributing course's `credits`.
6. Calls `computeSgpa(courseGrades, credits)`.

### 5.4 `apps/api/src/routes/grades/cgpa.ts`

Same shape, `?studentId=...&programId=...`. Iterates every semester in
the program, computes SGPA for each, averages them.

### 5.5 `apps/api/src/lib/gradeSchemeResolver.ts`

Pure DB I/O helper that lives in the API package (not shared) because it
needs Supabase. Returns the bands for the applicable `scheme_group`,
following G4's precedence rule: course-scoped first, then program-scoped,
picking the most recently updated `scheme_group` if multiple exist under
the chosen scope. Output is the full set of bands for that group so
`deriveGrade` can compute against them in one pass.

### 5.6 Wiring in `apps/api/src/index.ts`

```ts
import { adminGradeSchemesRoute } from "./routes/admin/gradeSchemes.js";
import {
  gradesRoute, facultyGradesRoute, studentGradesRoute,
} from "./routes/grades/core.js";
import { sgpaRoute, facultySgpaRoute, studentSgpaRoute } from "./routes/grades/sgpa.js";
import { cgpaRoute, facultyCgpaRoute, studentCgpaRoute } from "./routes/grades/cgpa.js";

// ... under app.use("/api/admin/*", requireRole("admin")) ...
app.route(ROUTES_CYCLE_2.adminGradeSchemes, adminGradeSchemesRoute);
app.route(  // admin grade per (course, student) — sub-route is :studentId/grade
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
  gradesRoute,
);
// similar mounts under /api/faculty/... and /api/student/...
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/score/sgpa",
  sgpaRoute,
);
// similar for faculty and student
app.route("/api/admin/score/cgpa", cgpaRoute);
// similar for faculty and student
```

(We add the cycle 5 entries to the existing `ROUTES_CYCLE_2` export block
in `packages/shared/src/routes.ts` rather than introducing a new
`ROUTES_CYCLE_3` — the cycle numbering is historical, not a contract.)

---

## 6. Tests

### 6.1 Unit (`packages/shared/src/grades.test.ts`)

Per the spec, in this order:

1. `deriveGrade` boundaries — exact min, exact max, mid, out-of-range (×3 below 0, ×3 above 100), value below all bands, value above all bands, empty bands → throws.
2. `computeSgpa` hand-calculated sample with 5 courses of varying credits — published expected value, asserted.
3. `computeCgpa` across 3 known SGPAs — published expected value, asserted.
4. Empty input → 0 for both.
5. `computeSgpa` missing credit → throws `GradeMissingCreditError`.

### 6.2 Integration (`apps/api/src/tests/grades.routes.test.ts`)

- Faculty reads a student's grade in their own course → 200 with `CourseGradeResponse`.
- Faculty reads a student's grade in someone else's course → 403 (RLS-denied).
- Student reads own grade → 200.
- Student reads another student's grade → 403 (RLS-denied; returns no rows).
- Student requests SGPA for another student → 403.
- Student requests CGPA for another student → 403.
- Admin reads any grade → 200.

### 6.3 Snapshot stability (`apps/api/src/tests/grades.snapshot.test.ts`)

- Seed: course with one exam_type, one marks row, one scheme with band `B` for `70 ≤ p ≤ 80`.
- POST marks as faculty, submit.
- GET grade → `{ label: "B", point: 8 }`.
- PATCH the scheme band so `B` now maps `70 ≤ p ≤ 80` to `point = 9`.
- GET grade again → still `{ label: "B", point: 8 }` (snapshot preserved).
- POST a fresh draft mark for a different student, submit.
- GET grade for new student → `{ label: "B", point: 9 }` (new computation uses current scheme).

### 6.4 Admin CRUD RBAC (`apps/api/src/tests/gradeSchemes.rbac.test.ts`)

- Faculty cannot POST a scheme → 403.
- Student cannot GET schemes → 403 (RLS returns nothing or `is_admin()`/`teaches_course` denies).
- Admin can POST, PATCH, DELETE; DELETE on a referenced scheme → 409.

---

## 7. Open questions

None. Brainstorming closed all four design questions (granularity,
weighting, snapshot location, CRUD scope) and the two follow-ups
(faculty CGPA access, recompute-on-resubmit).