# Mark-Matrix
### Cycle-Based Execution Plan (Cycle 0–8) with Agent Prompts

This plan breaks the Mark-Matrix build into 9 cycles. **Cycle 0** sets up the agent harness (Claude Code) and pre-development scaffolding. **Cycles 1–8** deliver the actual product, each split into a **Development phase** and a **Testing phase**, with a ready-to-use prompt for the coding agent.

Stack reminder: React (Cloudflare Pages/Workers) · Hono (Cloudflare Workers) · Supabase (Postgres, Auth, Session, RLS).

---

## Cycle 0 — Agent Harness & Pre-Development Setup

**Goal:** Get Claude Code operating in a clean, well-scaffolded repo before any feature work starts.

### Setup tasks
- Initialize monorepo structure: `/apps/web` (React), `/apps/api` (Hono on Workers), `/packages/shared` (types, constants)
- Configure Cloudflare Workers project (wrangler.jsonc) for the Hono API
- Configure Cloudflare Pages/Workers deployment for the React frontend
- Create Supabase project; store connection details as environment secrets (never committed)
- Set up `CLAUDE.md` / project instructions file describing conventions, folder layout, and the data hierarchy (batch/program/sem/course)
- Set up linting/formatting (ESLint, Prettier), TypeScript config, and a basic CI workflow (lint + typecheck + test on push)
- Set up test runner (e.g., Vitest) for both API and frontend
- Create empty Postgres migration folder + migration tool (e.g., Supabase CLI migrations)
- Define `.env.example` for both apps

### Testing phase
- Verify `wrangler dev` runs the Hono API locally and returns a health-check route (`GET /health`)
- Verify the React app builds and dev-serves locally
- Verify CI pipeline runs successfully on an empty commit
- Verify Supabase connection from a local script (simple `SELECT 1`)

### Agent Prompt — Cycle 0
```
You are setting up the initial repository and tooling for "Mark-Matrix", an
online result processing system. Stack: React frontend deployed on Cloudflare
Pages/Workers, Hono API on Cloudflare Workers, Supabase (Postgres) for DB,
Auth, and Sessions.

Tasks:
1. Scaffold a monorepo with /apps/web (React + TypeScript), /apps/api
   (Hono + TypeScript, Cloudflare Workers via wrangler), and /packages/shared
   for shared types/constants.
2. Configure wrangler.jsonc for the API worker and set up a Cloudflare
   Pages/Workers config for the React app.
3. Add a GET /health route to the API returning { status: "ok" }.
4. Set up ESLint, Prettier, and TypeScript strict mode across the monorepo.
5. Add Vitest for both apps with one placeholder passing test each.
6. Create a CI workflow (GitHub Actions) that runs lint, typecheck, and tests
   on every push/PR.
7. Create a CLAUDE.md documenting: folder structure, coding conventions, the
   data hierarchy (batch/program/sem/course/{attendance,marks} and
   batch/program/sem/{gradesheet, score/{sgpa,cgpa}}), and the three roles
   (Admin, Faculty, Student).
8. Add .env.example files for both apps listing required Supabase keys
   (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) without real
   values.
9. Write a short script (scripts/check-db.ts) that connects to Supabase using
   env vars and runs a trivial query to confirm connectivity.

Do not implement any product features yet. Confirm each step works locally
(dev server boots, tests pass, CI config is valid) before finishing.
```

---

## Cycle 1 — Auth, Sessions & RBAC Foundation

**Goal:** Every subsequent cycle depends on knowing who the user is and what they're allowed to do.

### Development
- Configure Supabase Auth (email/password login) for Admin, Faculty, Student
- Create `users`/`profiles` table with `role` column, linked to Supabase Auth user id
- Implement session verification middleware in Hono (reads Supabase session/JWT)
- Implement role-based route guard middleware (Admin-only, Faculty-only, Student-only, any-authenticated)
- Build baseline RLS policies on the `profiles` table (users can read their own profile; Admin reads all)
- Build basic React auth flow: login page, session context/provider, protected route wrapper, role-based navigation shell

### Testing
- Unit tests for the Hono auth middleware (valid session, expired session, missing session, wrong role)
- Integration test: login as each role and confirm correct dashboard shell loads
- RLS test: a Student querying `profiles` cannot read another student's row directly via Supabase client
- Negative test: Faculty hitting an Admin-only route receives 403

### Agent Prompt — Cycle 1
```
Building on the Cycle 0 scaffold, implement authentication, sessions, and
role-based access control (RBAC) for Mark-Matrix.

Development:
1. Set up Supabase Auth (email/password) and create a `profiles` table
   (user_id FK to auth.users, name, role enum: admin/faculty/student).
2. In the Hono API, add middleware that verifies the Supabase session/JWT on
   incoming requests and attaches { userId, role } to the request context.
3. Add a role-guard middleware factory, e.g. requireRole("admin"), usable on
   any route.
4. Write RLS policies on `profiles`: a user can SELECT their own row; Admin
   can SELECT all rows. Deny writes to `role` from anyone but Admin.
5. In React, build: a login page using Supabase client auth, an AuthContext
   providing the current user + role, a ProtectedRoute wrapper, and a basic
   shell layout that shows different nav items per role (Admin/Faculty/
   Student).

Testing:
1. Unit test the Hono auth middleware for: valid session, expired/invalid
   session, missing Authorization header.
2. Unit test requireRole middleware for allow/deny per role.
3. Write an integration test that logs in as admin/faculty/student (seed
   test users) and asserts each lands on the correct shell.
4. Write an RLS test (via Supabase test client) confirming a student cannot
   read another student's profile row.
5. Write a negative test confirming a faculty user gets 403 on an
   admin-only API route.

Report back with a summary of created files, migrations, and test results.
```

---

## Cycle 2 — Academic Structure Management (Admin)

**Goal:** Admin can define the batch/program/sem/course hierarchy that everything else hangs off.

### Development
- Postgres tables: `batches`, `programs`, `semesters`, `courses`, `faculty_assignments`, `student_enrollments`
- Hono CRUD routes (Admin-only) for batch, program, semester, course
- Route/UI for assigning faculty to a course
- Route/UI for enrolling students into batch/program/sem
- RLS: Admin full access; Faculty can read courses they're assigned to; Student can read their own enrollment
- React Admin pages: manage batches/programs/semesters/courses, assign faculty, enroll students (with bulk CSV enroll option)

### Testing
- CRUD unit tests for each entity (create/read/update/delete, admin-only enforcement)
- Test faculty assignment creates correct read access for that faculty (attempt read before/after assignment)
- Test student enrollment appears correctly under their batch/program/sem
- Edge case: prevent duplicate enrollment, prevent assigning faculty to a non-existent course
- Bulk CSV enroll: test malformed row handling

### Agent Prompt — Cycle 2
```
Implement academic structure management for Mark-Matrix. This is the
Admin-controlled hierarchy everything else depends on: batch → program →
sem → course, plus faculty assignments and student enrollments.

Development:
1. Create Postgres tables (with migrations): batches, programs, semesters,
   courses (FK to semester), faculty_assignments (faculty_id, course_id),
   student_enrollments (student_id, batch_id, program_id, sem_id).
2. Add Hono CRUD routes for batches/programs/semesters/courses, guarded by
   requireRole("admin").
3. Add Hono routes: assign faculty to a course, enroll a student (single +
   bulk CSV), remove assignment/enrollment.
4. Write RLS policies: Admin has full read/write on all these tables;
   Faculty can SELECT courses where they appear in faculty_assignments;
   Student can SELECT their own row in student_enrollments and its parent
   batch/program/sem.
5. In React, build Admin pages to manage the hierarchy (CRUD forms/tables)
   and to assign faculty / enroll students, including a CSV bulk-enroll
   upload with validation feedback.

Testing:
1. CRUD tests for each entity confirming only Admin can create/update/delete.
2. Test that a faculty member can read a course only after being assigned
   to it, and not before.
3. Test that a student's enrollment correctly surfaces their batch/program/
   sem context.
4. Test duplicate enrollment is rejected and assigning faculty to a
   non-existent course_id fails cleanly.
5. Test bulk CSV enroll: valid rows succeed, malformed rows are reported
   without failing the whole batch.

Report created files, migrations, and test results.
```

---

## Cycle 3 — Attendance Tracking Module

**Goal:** Faculty can write attendance per course session; all roles can read per the hierarchy's access rules.

### Development
- Postgres table: `attendance` (student_id, course_id, session_date, status, recorded_by)
- Hono routes under `course/attendance`: faculty POST/PATCH (write, own course only), any role GET (scoped read)
- Auto-compute attendance percentage per student per course (view or computed endpoint)
- RLS: Faculty writes limited to their assigned course; Students read only their own rows; Faculty/Admin read full course roster
- React: Faculty attendance-marking page (per session, per course roster); Student attendance view (own %, session history); Admin/Faculty course roster view

### Testing
- Unit tests: faculty can write attendance only for assigned course; write attempt on unassigned course fails
- Test student can read only their own attendance, not classmates'
- Test attendance percentage computation against sample session data
- Test duplicate attendance entry for same student/session is prevented or correctly upserts
- Load-style test: bulk-mark attendance for a full class roster in one request

### Agent Prompt — Cycle 3
```
Implement the attendance tracking module for Mark-Matrix, following the
hierarchy: batch/program/sem/course/attendance. Write access is
faculty-only (their own course); read access is open to all roles per
scoping rules (student sees own, faculty/admin see full roster).

Development:
1. Create Postgres table `attendance` (student_id, course_id, session_date,
   status enum: present/absent/late, recorded_by, created_at).
2. Add Hono routes:
   - POST /batch/:b/program/:p/sem/:s/course/:c/attendance
     (faculty-only, bulk-mark a session for a course roster)
   - PATCH .../attendance/:id (faculty-only, correct an entry)
   - GET .../attendance (role-scoped: student sees own rows, faculty/admin
     see full roster for that course)
   - GET .../attendance/summary (returns per-student attendance %)
3. Write RLS policies enforcing: faculty can write attendance only for
   courses in their faculty_assignments; students can read only their own
   attendance rows; faculty/admin can read all rows for courses they have
   access to.
4. In React, build: a faculty "mark attendance" page (roster + status
   toggles, bulk submit), a student "my attendance" view (% + history), and
   a read-only roster/attendance view for faculty/admin.

Testing:
1. Test faculty can write attendance for an assigned course and cannot for
   an unassigned one (expect 403).
2. Test a student can read only their own attendance rows via the API.
3. Test attendance percentage computation against a known sample dataset.
4. Test that re-marking the same student/session upserts rather than
   duplicating.
5. Test bulk-mark endpoint against a full class roster in a single request
   and verify all rows persist correctly.

Report created files, migrations, and test results.
```

---

## Cycle 4 — Marks Entry Module

**Goal:** Faculty can enter marks per course, with a draft → submitted workflow feeding into Cycle 6's approval step.

### Development
- Postgres table: `marks` (student_id, course_id, exam_type, marks_obtained, entered_by, status: draft/submitted)
- Hono routes under `course/marks`: faculty POST/PATCH (draft-save, submit), scoped GET for all roles
- Validation: marks_obtained within course's max_marks; exam_type must be a defined type
- Bulk marks upload via CSV with row-level validation and error reporting
- RLS: faculty write limited to assigned course and only while status = draft (submitted becomes read-only for faculty, pending Admin action)
- React: Faculty marks entry page (roster + marks input + draft/submit actions, CSV bulk upload); Student/read-only marks view

### Testing
- Test marks entry respects max_marks validation (reject over-limit values)
- Test faculty cannot edit marks after submission (until Admin unlocks — covered further in Cycle 6, but submitted-immutability from faculty side is tested here)
- Test scoped read: student sees only their own marks; faculty sees their course roster
- Test CSV bulk upload: valid rows apply, invalid rows reported without blocking valid ones
- Test unauthorized course (not assigned to faculty) is rejected

### Agent Prompt — Cycle 4
```
Implement the marks entry module for Mark-Matrix, under
batch/program/sem/course/marks. Faculty write marks for their assigned
course with a draft -> submitted workflow (submitted marks await Admin
approval, implemented in a later cycle — for now, submitted just means
faculty can no longer edit them).

Development:
1. Create Postgres table `marks` (student_id, course_id, exam_type,
   marks_obtained, max_marks snapshot, entered_by, status enum:
   draft/submitted, updated_at).
2. Add Hono routes:
   - POST/PATCH .../course/:c/marks (faculty-only, assigned course only,
     allowed while status = draft)
   - POST .../course/:c/marks/submit (faculty-only, flips status to
     submitted, locks further faculty edits)
   - POST .../course/:c/marks/bulk (CSV upload, validate each row, return
     per-row success/error)
   - GET .../course/:c/marks (role-scoped: student sees own, faculty/admin
     see full roster)
3. Validate marks_obtained <= course.max_marks and exam_type is one of the
   course's defined exam types.
4. Write RLS policies: faculty can write only to their assigned course's
   marks and only while status = draft; students can read only their own
   marks rows.
5. In React, build a faculty marks-entry page (roster table, per-student
   input, draft-save/submit actions, CSV bulk upload with error display)
   and a read-only marks view for students.

Testing:
1. Test that entering marks above max_marks is rejected.
2. Test that once status = submitted, faculty PATCH attempts are rejected.
3. Test scoped reads: student sees only their own row; faculty sees their
   course's full roster; a faculty member cannot read another faculty's
   course.
4. Test CSV bulk upload with a mix of valid/invalid rows and confirm error
   reporting matches expectations.
5. Test that writing marks for a course the faculty is not assigned to is
   rejected with 403.

Report created files, migrations, and test results.
```

---

## Cycle 5 — Grade Calculation Engine (SGPA/CGPA)

**Goal:** Turn submitted marks into grades, SGPA, and CGPA using a configurable scheme.

### Development
- Postgres table: `grade_schemes` (grade, min_marks, max_marks, grade_point), scoped per course or program as needed
- Compute service (Hono) that, given a course's marks, derives grade + grade point per student
- Compute service that aggregates a student's course grades within a semester into SGPA
- Compute service that aggregates SGPA across semesters into CGPA
- Admin CRUD for grade schemes
- RLS/access: computed values readable per hierarchy rules (student: own; faculty: their course only; admin: all)

### Testing
- Unit tests for grade derivation against a range of marks values (boundary cases: exact min/max thresholds)
- Unit tests for SGPA calculation against a known multi-course sample
- Unit tests for CGPA calculation across multiple semesters
- Test grade scheme changes don't retroactively alter already-locked results (ties into Cycle 6 locking, but engine should respect a "snapshot scheme" concept)
- Test unauthorized read (student attempting to read another student's SGPA) is denied

### Agent Prompt — Cycle 5
```
Implement the grade calculation engine for Mark-Matrix: converts marks into
grades, then aggregates into SGPA (per semester) and CGPA (cumulative),
using a configurable grading scheme.

Development:
1. Create Postgres table `grade_schemes` (id, scope: course_id or
   program_id, grade label, min_marks, max_marks, grade_point). Add Admin
   CRUD Hono routes for grade schemes.
2. Implement a compute function: given marks_obtained + max_marks + the
   applicable grade_scheme, return { grade, grade_point }.
3. Implement a compute function: given all of a student's course grades
   within a semester (with course credit weights if applicable), return
   SGPA.
4. Implement a compute function: given a student's SGPA across all
   semesters, return CGPA.
5. Expose these via Hono routes:
   - GET .../course/:c/marks/:studentId/grade
   - GET .../sem/:s/score/sgpa (per student)
   - GET .../score/cgpa (per student, across semesters)
   Scope reads per role: student sees own, faculty sees their course scope,
   admin sees all.
6. Design the marks/grade record to snapshot which grade_scheme version was
   used, so future scheme edits don't retroactively change past results.

Testing:
1. Unit test grade derivation across boundary values (exact min_marks,
   exact max_marks, values in between, out-of-range).
2. Unit test SGPA computation against a hand-calculated sample with 4-5
   courses of varying credit weights.
3. Unit test CGPA computation across 2-3 semesters of known SGPA values.
4. Test that editing a grade_scheme does not change previously computed/
   snapshotted grades.
5. Test that a student cannot read another student's SGPA/CGPA via the API.

Report created files, migrations, and test results.
```

---

## Cycle 6 — Admin Approval, Locking & Result Publishing

**Goal:** Centralize the approval/lock workflow with Admin, compiling gradesheets once marks are finalized.

### Development
- Add `status` transitions to `marks` (submitted → approved → locked) and to `gradesheets` (compiled → locked → published)
- Hono routes (Admin-only): approve course marks, lock course marks, compile semester gradesheet, lock gradesheet, publish gradesheet
- Compiling a gradesheet triggers SGPA/CGPA computation (Cycle 5 engine) and stores results in `gradesheets`/`scores`
- Unlock flow (Admin-only): explicit action, required reason, writes an audit entry (ties to Cycle 8 but stub the audit call here)
- Notification stub on publish (email/in-app placeholder, full implementation can be light)
- React: Admin review dashboard — see pending course submissions, approve/lock, compile + lock + publish gradesheets, unlock with reason

### Testing
- Test full lifecycle: faculty submits → admin approves → admin locks → gradesheet compiles → admin locks gradesheet → publish
- Test that locked marks/gradesheets reject any write attempt from anyone but an explicit Admin unlock
- Test unlock requires a reason and is logged
- Test students cannot see a gradesheet before it's published
- Test partial-course scenario: gradesheet compilation blocked/flagged if not all courses in the semester are locked yet

### Agent Prompt — Cycle 6
```
Implement Admin-controlled approval, locking, and publishing for Mark-Matrix.
Admin is the sole authority to approve/lock marks and to compile, lock, and
publish semester gradesheets.

Development:
1. Extend `marks.status` to: draft -> submitted -> approved -> locked. Add
   Hono routes (admin-only): approve course marks (submitted->approved),
   lock course marks (approved->locked).
2. Create `gradesheets` and `scores` tables (from Cycle 5 design) with
   status: draft -> compiled -> locked -> published.
3. Add Hono routes (admin-only):
   - POST .../sem/:s/gradesheet/compile (runs SGPA/CGPA engine for all
     students in that sem, requires all courses' marks to be status=locked;
     otherwise return a clear error listing which courses are incomplete)
   - POST .../sem/:s/gradesheet/lock
   - POST .../sem/:s/gradesheet/publish (makes it visible to students)
   - POST .../course/:c/marks/unlock and .../gradesheet/unlock (admin-only,
     requires a `reason` field in the request body)
4. Ensure RLS/route guards reject ANY write to locked marks or gradesheets
   except through the explicit unlock route.
5. Add a lightweight notification stub (log or placeholder email call) that
   fires on gradesheet publish.
6. In React, build an Admin dashboard: list of pending course submissions
   with approve/lock actions, a semester view to compile/lock/publish
   gradesheets, and an unlock action requiring a reason field.

Testing:
1. End-to-end test of the full lifecycle: submit -> approve -> lock ->
   compile gradesheet -> lock gradesheet -> publish -> student can now read it.
2. Test that write attempts on locked marks/gradesheets are rejected for
   everyone, including faculty and admin's normal write routes (only the
   unlock route works).
3. Test unlock without a reason is rejected; unlock with a reason succeeds
   and is recorded.
4. Test students cannot read a gradesheet before publish (should 403 or
   404, not leak draft data).
5. Test gradesheet compile fails with a clear, actionable error if any
   course in that semester isn't yet locked.

Report created files, migrations, and test results.
```

---

## Cycle 7 — Reporting, Analytics & Transcript Generation

**Goal:** Turn stored data into human-facing reports, analytics dashboards, and downloadable transcripts.

### Development
- Compute endpoints: class performance summary, pass percentage, toppers list, attendance shortage report, faculty/subject-wise analytics
- PDF generation service (from Workers) for individual grade cards / transcripts, built from published gradesheet + score data
- CSV/PDF export endpoints for admin reports
- React: Admin/Faculty analytics dashboards (charts/tables); Student "download my transcript" action

### Testing
- Test each analytics endpoint against a seeded dataset with known expected output (pass %, toppers, attendance shortage list)
- Test PDF transcript generation only works on published gradesheets, and content matches underlying data exactly
- Test export endpoints produce valid, correctly-formatted CSV/PDF
- Access test: faculty analytics scoped to their own courses only; admin sees everything

### Agent Prompt — Cycle 7
```
Implement reporting, analytics, and transcript generation for Mark-Matrix,
built on top of the published gradesheet/score data from Cycle 6.

Development:
1. Add Hono routes for analytics (scoped per role):
   - GET .../course/:c/analytics/pass-rate
   - GET .../course/:c/analytics/toppers
   - GET .../course/:c/analytics/attendance-shortage (below a configurable
     threshold, e.g. <75%)
   - GET .../sem/:s/analytics/summary (admin: cross-course view)
2. Implement a PDF generation service (usable from a Cloudflare Worker) that
   renders a student's grade card/transcript from their published gradesheet
   and score (sgpa/cgpa) data.
3. Add export routes for admin: CSV export of any of the above reports, and
   a PDF export of the transcript.
4. In React, build: an analytics dashboard for admin (cross-course) and
   faculty (their courses only) with tables/charts, and a "Download
   Transcript" button on the student's gradesheet view.

Testing:
1. Seed a known dataset and write tests asserting exact expected output for
   pass-rate, toppers list, and attendance-shortage list.
2. Test transcript PDF generation is blocked for unpublished gradesheets and
   succeeds for published ones, with content verified against source data.
3. Test CSV/PDF export endpoints return correctly formatted, parseable
   output.
4. Test that a faculty member's analytics view only includes their own
   courses, never another faculty's data.

Report created files, migrations, and test results.
```

---

## Cycle 8 — Audit Logging, Security Hardening & Deployment

**Goal:** Close the loop on traceability and security, then ship.

### Development
- Postgres table: `audit_log` (action, entity, entity_id, user_id, timestamp, old_value, new_value)
- Wire audit logging into every write path from Cycles 2–7 (attendance, marks, approve/lock/unlock, gradesheet actions, enrollment/assignment changes)
- Admin audit log viewer with filters (by user, entity, date range)
- Security pass: review all RLS policies end-to-end, review Hono middleware ordering, confirm HTTPS-only, confirm secrets not exposed to the frontend bundle, rate-limit sensitive routes (login, bulk upload)
- Production deployment: Cloudflare Workers (API) + Cloudflare Pages/Workers (frontend), Supabase production project, environment secrets configured
- Basic monitoring/alerting hookup (Cloudflare + Supabase dashboards) and a rollback plan

### Testing
- Test that every sensitive write action produces a corresponding audit_log row with correct before/after values
- Full regression pass across Cycles 1–7's test suites in the production-like (staging) environment
- Security test pass: attempt cross-role access on every route class (student→faculty routes, faculty→admin routes, unauthenticated access)
- Load/smoke test on key endpoints (bulk marks upload, gradesheet compile) under realistic data volume
- Deployment smoke test: fresh environment, run migrations, confirm app boots and core flows work end-to-end

### Agent Prompt — Cycle 8
```
Implement audit logging, complete a security hardening pass, and prepare
Mark-Matrix for production deployment on Cloudflare Workers/Pages + Supabase.

Development:
1. Create `audit_log` table (action, entity, entity_id, user_id, timestamp,
   old_value jsonb, new_value jsonb). Add a small helper used by every
   sensitive write path (attendance write, marks write/submit/approve/lock/
   unlock, gradesheet compile/lock/publish/unlock, enrollment/assignment
   changes) to insert an audit row with before/after state.
2. Add an admin-only Hono route + React page to browse/filter the audit log
   (by user, entity type, date range).
3. Do a full security review pass:
   - Re-verify every RLS policy from Cycles 1-7 against the intended access
     matrix (Admin/Faculty/Student x read/write x each entity).
   - Confirm Hono middleware order enforces auth before any handler logic
     runs.
   - Confirm no Supabase service-role key or other secret is bundled into
     the React frontend.
   - Add basic rate limiting on login and bulk-upload endpoints.
4. Prepare production deployment: Cloudflare Workers config for the API,
   Cloudflare Pages/Workers config for the frontend, a production Supabase
   project with migrations applied, and documented environment secrets
   setup (no secrets committed).
5. Add basic monitoring hooks (Cloudflare Workers logs/analytics, Supabase
   dashboard) and write a short rollback plan in the docs.

Testing:
1. For each sensitive write path, test that an audit_log row is created
   with accurate old/new values.
2. Run the full existing test suite (Cycles 1-7) against a staging
   environment and confirm all pass.
3. Write cross-role access tests hitting every route class to confirm
   proper 401/403 behavior (student on faculty routes, faculty on admin
   routes, unauthenticated on any protected route).
4. Load/smoke test bulk marks upload and gradesheet compile against a
   realistic data volume (e.g., a few hundred students) and confirm
   acceptable response times.
5. Do a clean-environment deployment smoke test: apply migrations, deploy
   both apps, and manually verify login -> attendance -> marks -> approve ->
   lock -> compile -> publish -> transcript download works end-to-end.

Report a final summary: what's deployed, any known issues, and remaining
follow-ups.
```

---

## Cycle Summary Table

| Cycle | Focus | Key Deliverable |
|---|---|---|
| 0 | Agent harness & pre-dev setup | Repo, CI, tooling, empty health-check API/app |
| 1 | Auth, sessions, RBAC | Login, roles, guarded routes/pages |
| 2 | Academic structure | Batch/program/sem/course CRUD, assignments, enrollment |
| 3 | Attendance tracking | Faculty write / all read attendance module |
| 4 | Marks entry | Faculty marks entry with draft/submit workflow |
| 5 | Grade calculation engine | Grade, SGPA, CGPA computation |
| 6 | Admin approval & locking | Approve/lock marks, compile/lock/publish gradesheets |
| 7 | Reporting & transcripts | Analytics dashboards, PDF transcripts, exports |
| 8 | Audit, security, deployment | Full audit trail, hardened & deployed system |
