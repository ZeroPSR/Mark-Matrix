# Cycle 8b Security Review

**Date:** 2026-10-05
**Reviewer:** Claude (cycle 8b implementation)
**Scope:** Mark-Matrix API + frontend, post-cycle-8a. Verifies RLS posture against the access matrix, middleware order, and secret-leakage posture.

## 1. RLS Re-Verification Matrix

Access matrix the matrix is checked against (from cycle 8a spec §1 + cycle 1 spec):
- **Admin**: read ✓ write ✓ on every table.
- **Faculty**: read scope = courses they teach (via `faculty_assignments`); write scope = their own courses only.
- **Student**: read scope = their own rows; write = none.

| Table | Admin | Faculty | Student | Source | Verdict |
|-------|-------|---------|---------|--------|---------|
| `profiles` | R ✓ (admin policy) W ✓ (admin policy) | R: own (self) | R: own (self) | 20260818100001_profiles_rls.sql (profiles_select_own, profiles_select_admin) | ✓ matches the cycle 1 matrix (admin sees all; users see themselves; no role escalation because profiles_update_own is dropped in 20260820100004) |
| `student_profiles` | R ✓ W ✓ (admin_all) | R: own | R: own (only students with the same user_id; faculty doesn't read) | 20260820100000_role_profiles.sql (student_profiles_select_own, student_profiles_admin_all) | ✓ |
| `faculty_profiles` | R ✓ W ✓ (admin_all) | R: own | R: own (faculty_profiles_select_own) | 20260820100000_role_profiles.sql | ✓ |
| `admin_profiles` | R ✓ W ✓ (admin_all) | R: own | R: own (admin_profiles_select_own) | 20260820100000_role_profiles.sql | ✓ |
| `batches` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100003_academic_rls.sql | ✓ |
| `programs` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100003_academic_rls.sql | ✓ |
| `semesters` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100003_academic_rls.sql | ✓ |
| `courses` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R: NO policy — student can't read courses | 20260820100003_academic_rls.sql (no courses_student_select) | ⚠ Deviation: students can't see courses directly. They see them indirectly via `marks` / `gradesheets` / `scores`. Acceptable because the data they need is exposed through downstream tables. Document this in cycle 8c if we ever build a student "browse courses" UI. |
| `faculty_assignments` | R ✓ W ✓ (admin_all) | R: own only (faculty_assignments_select_own) | R: NO policy — student can't read | 20260820100003_academic_rls.sql | ✓ — students don't need to see who teaches what. |
| `student_enrollments` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select, 20260820100008) | R: own (select_own) | 20260820100003 + 20260820100008 | ✓ |
| `attendance` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) W: own course (insert/update) | R: own (student_select) | 20260820100007_attendance.sql | ✓ |
| `course_exam_types` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100009_marks.sql | ✓ |
| `marks` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) W: own course (insert/update) | R: own (student_select) | 20260820100009_marks.sql | ✓ |
| `grade_schemes` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100010_grade_schemes.sql | ✓ |
| `course_grades` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100010_grade_schemes.sql | ✓ |
| `gradesheets` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100011_results_approval.sql | ✓ |
| `scores` | R ✓ W ✓ (admin_all) | R ✓ (faculty_select) | R ✓ (student_select) | 20260820100011_results_approval.sql | ✓ |
| `audit_log` (8a) | R ✓ (admin_select) W: only via `audit_log_write` definer fn (no INSERT policy for `authenticated`) | no policy → no SELECT | no policy → no SELECT | 20261001000000_audit_log.sql | ✓ matches spec §1 of cycle 8a. |

**Summary**: 17 tables verified. 1 ⚠ deviation (`courses` has no student SELECT policy — students see courses only through downstream tables). No ✗ violations.

## 2. Middleware Order

**Source:** `apps/api/src/index.ts`.

```
1. cors(*)                          — every request
2. app.use("/api/*", supabaseAuth)   — populates userId, role, supabase
3. app.use("/api/*", generalRateLimit) — cycle 8b; rate limit gate
4. app.get(API_ROUTES.me, …)         — returns userId + role
5. app.use("/api/admin/*", requireRole("admin"))    — gates admin routes
6. admin route mounts (users, batches, …, audit-log)
7. app.use(ROUTES_CYCLE_2.adminBulkEnroll, bulkRateLimit) — cycle 8b
8. app.use("/api/faculty/batch/…/marks/bulk", bulkRateLimit) — cycle 8b
9. app.use("/api/faculty/*", requireRole("faculty")) — gates faculty routes
10. faculty route mounts
11. app.use("/api/admin/*", requireRole("admin")) — second pass for any admin route mounted after faculty
12. additional admin route mounts (attendance, marks, marksLifecycle)
13. app.use("/api/student/*", requireRole("student")) — gates student routes
14. student route mounts
```

**Verdict:** ✓ Auth (`supabaseAuth`) runs before any handler logic. Role guards run before the routes they gate. Rate limits run after auth (so per-IP keying works) but before the routes (so a flood short-circuits before doing DB work). No handler is mounted at a path that bypasses the middleware chain.

## 3. Secret Scan

Three scans run; all clean.

**3a. Web bundle (`apps/web/dist/`):**
```
$ grep -rE "service_role|SUPABASE_SERVICE_ROLE_KEY" apps/web/dist/
(no matches)
```

The cycle 8b service-role helper (`apps/api/src/lib/serviceRoleClient.ts`) is not imported by anything in `apps/web/src/`. The web bundle is clean.

**3b. Web source (`apps/web/src/`):**
```
$ grep -rE "serviceRoleClient|SUPABASE_SERVICE_ROLE_KEY|getServiceRoleClient" apps/web/src/
(no matches)
```

No client-side reference to the service-role helper. The `apps/web` package reads only `VITE_*` / `PUBLIC_*` env vars (verified in 3c).

**3c. Web env var scan (`apps/web/src/`):**
```
$ grep -rE "process\.env\.[A-Z_]+" apps/web/src/ | grep -vE "process\.env\.(VITE_)?(NODE_ENV|PUBLIC_)"
(no matches)
```

No client-side code reads a non-`VITE_*` / non-`PUBLIC_*` env var. The `SUPABASE_*` env vars are server-side only.

**Verdict:** ✓ No secret leakage. Service-role key is server-side only.

## 4. Findings & Follow-ups

| # | Finding | Severity | Action | Owner |
|---|---------|----------|--------|-------|
| 1 | `courses` table has no student SELECT policy | ⚠ Deviation | Document; revisit in cycle 8c if a student "browse courses" UI is built. Acceptable as-is because the data students need is exposed through `marks` / `gradesheets` / `scores`. | future cycle |
| 2 | Rate limit state is in-memory, per-isolate | ⚠ Limitation | Document in 8c deploy notes; KV-backed rate limiting is a cycle-8c hardening item. Cloudflare's typical request distribution is good enough for "basic" per the cycle-8 spec. | cycle 8c |
| 3 | `serviceRoleClient` has no audit logging on its reads | Minor | The service-role client is currently used only for the email merge in `/api/admin/users`. Reading auth.users is a read-only, admin-only operation; no audit row needed. Document; revisit if we add more service-role reads. | future cycle |
| 4 | Bulk-upload rate limit applies to `/api/admin/enrollments/bulk` and the marks bulk route. Other admin write endpoints (PATCH /api/admin/users, PATCH /api/admin/grade-schemes) are not rate-limited beyond the general 120/min. | Minor | Acceptable for 8b — these are admin-only and not brute-force targets. Document; revisit if a future cycle adds public-facing endpoints. | future cycle |
| 5 | `audit_log` is unbounded (no retention) | Minor | Defer to a follow-up cycle. Documented in cycle 8a spec §9. | future cycle |
| 6 | `audit_log` does not capture IP / user-agent / request ID | Minor | Defer. Captured in cycle 8a spec §1. | future cycle |

**Ship-blocking findings: 0.**

**Deferred to cycle 8c:** finding #2 (KV rate limit).

**Deferred to future cycles:** findings #1, #3, #4, #5, #6.
