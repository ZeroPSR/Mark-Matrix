# Marks Module — Future Work

Captured at end of the initial implementation cycle (2026-09-07). Not part of the
shipped module — deferred to later cycles.

## Admin approval workflow (the second half of draft → submitted)

The current cycle implements `draft → submitted`. Submitted marks await admin
approval; the user spec says that "for now, submitted just means faculty can no
longer edit them." A future cycle will add the approval step.

What needs to change:

1. **Schema** — add two columns to `marks`:
   - `approved_by uuid references public.profiles(user_id)`
   - `approved_at timestamptz`
   And add a new enum value `approved` to `public.marks_status`:
   ```sql
   alter type public.marks_status add value 'approved';
   ```
   (Postgres requires this in its own transaction, outside a migration `BEGIN`.)

2. **Lock trigger** — extend `marks_lock_when_submitted` so that once
   `status = 'approved'`, no column (including status itself) can change. The
   admin's approve action would happen on `status = 'submitted'` and the
   trigger should allow that transition only.

3. **RLS** — add an admin-only UPDATE policy that allows flipping
   `submitted → approved` and setting `approved_by`/`approved_at`. Faculty's
   `marks_faculty_update` should add a status guard of its own so that even
   if the trigger is bypassed, RLS refuses.

4. **API** — new admin endpoint `POST .../marks/approve` mirroring
   `submitCourse`. Faculty gets a 403 if they hit it.

5. **Frontend** — admin roster page gets an "Approve" button gated by
   `status === 'submitted'`. Faculty page shows a "submitted, awaiting admin
   approval" banner that switches to "approved" once that flips.

## `course_exam_types` admin UI

The migration allows admin-only writes, but there's no UI to manage exam
types yet. Faculty and students depend on admin seeding exam types via SQL.

What needs to change:

- New admin page at `/admin/courses/:courseId/exam-types` (or extend the
  existing course CRUD).
- Form to add/remove exam types with their `max_marks`. Removing an exam
  type that has marks rows should be blocked (existing marks would violate
  the FK).
- The `course_exam_types` admin policy (`is_admin()` for all) is already in
  place; only the UI is missing.

## RLS test runs

`apps/api/src/tests/marks.rbac.test.ts` is skipped without
`SUPABASE_TEST_RLS=1`. To run it:

```bash
SUPABASE_TEST_URL=... \
SUPABASE_TEST_SERVICE_ROLE_KEY=... \
SUPABASE_TEST_RLS=1 \
pnpm --filter @mark-matrix/api test
```

The tests cover all 5 user-spec scenarios (rejection of marks above max,
submitted-row PATCH denial, scoped reads, CSV bulk mixed rows, unassigned-
course writes rejected).

## Max-marks snapshot rationale

`marks.max_marks` is intentionally a **snapshot**, not a live FK lookup
to `course_exam_types.max_marks`. The application code copies
`course_exam_types.max_marks` into `marks.max_marks` on insert/upsert,
and the lock trigger additionally blocks any change to `marks.max_marks`
once submitted. This means historical marks retain their original cap even
if an admin later edits `course_exam_types.max_marks`. If a future cycle
needs to retroactively recompute historical marks against a new cap, that
should be a deliberate, audited migration — not silent re-validation.

## CSV bulk endpoint notes

The `/marks/bulk` endpoint uses the same per-row pattern as
`/admin/enrollments/bulk`: parse, resolve `roll_number → student_id`,
validate against the course's roster (via `student_enrollments.sem_id`),
then upsert. Reasons returned are stable strings (`unknown_exam_type`,
`exceeds_max`, `no_such_student`, `not_in_roster`, `invalid_marks`,
`validation_failed`). The faculty UI renders these verbatim in an
expandable `<details>` table after upload.
