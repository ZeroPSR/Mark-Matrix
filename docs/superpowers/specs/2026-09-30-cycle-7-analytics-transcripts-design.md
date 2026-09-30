# Cycle 7 — Reporting, Analytics & Transcript Generation (Design Spec)

**Status:** Draft, awaiting review.
**Branch context:** main; cycle 6 (results-approval, gradesheets, scores) just shipped.
**Goal:** Add an analytics subsystem (per-course and per-semester) and a PDF transcript service, both built on the data published by cycle 6.

---

## 1. Scope

**In scope:**
- 4 new analytics endpoints (pass-rate, toppers, attendance-shortage, sem summary)
- PDF generation for student transcripts using `pdf-lib`
- Admin-only CSV export of any analytics report
- Admin-only PDF export of any student's transcript
- React analytics dashboard for admin (cross-semester) and faculty (their courses)
- React "Download Transcript" button on the student gradesheet view
- Tests for all of the above, including RBAC scoping for faculty

**Out of scope (deferred to later cycles):**
- Bulk transcript generation across multiple semesters / batch-level reports
- Email delivery of transcripts (still uses the console-log notification stub from cycle 6)
- Customizable PDF layouts / institution branding (the default is fixed)
- Charts beyond simple tables in the first cut (a follow-up cycle may add recharts)

---

## 2. Data Layer

### 2.1 Schema migration: `course_grades.is_passing`

A small additive migration extends `course_grades` so analytics can compute pass-rate without re-deriving the band on every query.

**File:** `supabase/migrations/20260820100013_course_grades_is_passing.sql`

```sql
-- 20260820100013_course_grades_is_passing.sql
-- Cycle 7 — add is_passing to course_grades so analytics queries don't need to
-- re-derive the grade band on every row. Populated at upsert time.

alter table public.course_grades
  add column if not exists is_passing boolean not null default false;

-- Backfill is_passing from the matching grade_schemes band. If a row's
-- grade_scheme has been deleted (cascade), the band lookup fails; we default
-- such rows to false to keep the migration idempotent.
update public.course_grades cg
   set is_passing = coalesce(gs.is_passing, false)
  from public.grade_schemes gs
 where gs.id = cg.grade_scheme_id
   and gs.grade_label = cg.grade_label
   and cg.is_passing = false;

create index course_grades_course_passing_idx
  on public.course_grades (course_id, is_passing);
```

The cycle-5 `courseGradesRepo.upsertCourseGrade` and the cycle-5 `grades/core.ts` callsite that resolves a given batch are updated to pass `is_passing` from `deriveGrade(...)`. After lock+compile, all `course_grades` rows carry the resolved `is_passing` value.

### 2.2 What the migration does **not** change

No RLS changes. No new tables. No data deletion. Existing analytics queries continue to work; only the new column is added.

---

## 3. Shared Package Additions (`packages/shared`)

### 3.1 `packages/shared/src/analytics.ts`

Pure types and zod schemas for analytics reports. No DB, no I/O.

```ts
import { z } from "zod";

export const passRateReportSchema = z.object({
  courseId: z.string().uuid(),
  total: z.number().int().min(0),
  passing: z.number().int().min(0),
  rate: z.number().min(0).max(100),
});
export type PassRateReport = z.infer<typeof passRateReportSchema>;

export const topperRowSchema = z.object({
  studentId: z.string().uuid(),
  rollNumber: z.string(),
  totalObtained: z.number(),
  totalMax: z.number(),
  percentage: z.number(),
  gradeLabel: z.string(),
  gradePoint: z.number(),
});
export type TopperRow = z.infer<typeof topperRowSchema>;

export const attendanceShortageRowSchema = z.object({
  studentId: z.string().uuid(),
  rollNumber: z.string(),
  presentCount: z.number().int().min(0),
  totalSessions: z.number().int().min(0),
  percentage: z.number().min(0).max(100),
});
export type AttendanceShortageRow = z.infer<typeof attendanceShortageRowSchema>;

export const semSummaryRowSchema = z.object({
  courseId: z.string().uuid(),
  courseCode: z.string(),
  courseTitle: z.string(),
  enrolled: z.number().int().min(0),
  graded: z.number().int().min(0),
  passing: z.number().int().min(0),
  passRate: z.number().min(0).max(100),
  avgPercentage: z.number().min(0).max(100),
  avgGradePoint: z.number().min(0).max(10),
});
export type SemSummaryRow = z.infer<typeof semSummaryRowSchema>;

export const topLimitSchema = z.coerce.number().int().min(1).max(50).default(5);
export const attendanceThresholdSchema = z.coerce.number().min(0).max(100).default(75);
```

### 3.2 `packages/shared/src/analytics.ts` — pure compute helpers

```ts
export function computePassRate(rows: { isPassing: boolean }[]): PassRateReport {
  const total = rows.length;
  const passing = rows.filter((r) => r.isPassing).length;
  const rate = total === 0 ? 0 : round2((passing / total) * 100);
  return { total, passing, rate };
}

/** Stable top-N by descending score; ties keep input order. */
export function topN<T>(items: T[], by: (t: T) => number, limit: number): T[] {
  const indexed = items.map((item, i) => ({ item, score: by(item), i }));
  indexed.sort((a, b) => (b.score - a.score) || (a.i - b.i));
  return indexed.slice(0, limit).map((x) => x.item);
}

export function computeAttendancePct(present: number, total: number): number {
  if (total === 0) return 0;
  return round2((present / total) * 100);
}
```

### 3.3 `packages/shared/src/csv.ts` — add `toCsv` writer

RFC4180-ish writer, paired with the existing `parseCsv`.

```ts
export function toCsv(rows: (string | number | null)[][]): string {
  const escape = (v: string | number | null): string => {
    if (v === null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return rows.map((row) => row.map(escape).join(",")).join("\r\n") + "\r\n";
}
```

`index.ts` re-exports everything from `./analytics.js`.

### 3.4 `packages/shared/src/routes.ts` — URL builders

```ts
// Cycle 7 — analytics + transcript route builders.
analyticsPassRate: (
  role: "admin" | "faculty",
  batchId: string, programId: string, semId: string, courseId: string,
): string => `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/analytics/pass-rate`,

analyticsToppers: (
  role: "admin" | "faculty",
  batchId: string, programId: string, semId: string, courseId: string,
): string => `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/analytics/toppers`,

analyticsAttendanceShortage: (
  role: "admin" | "faculty",
  batchId: string, programId: string, semId: string, courseId: string,
): string => `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/analytics/attendance-shortage`,

analyticsSemSummary: (
  role: "admin",
  batchId: string, programId: string, semId: string,
): string => `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/analytics/summary`,

studentTranscript: (
  role: "student" | "admin",
  batchId: string, programId: string, semId: string,
  studentId?: string, // admin-only path
): string => studentId
    ? `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/student/${studentId}/transcript`
    : `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/transcript`,
```

---

## 4. API Layer

### 4.1 `apps/api/src/lib/analyticsRepo.ts`

Pure functions that accept a `SupabaseClient` and return typed results. No Hono coupling.

```ts
export async function getPassRateForCourse(supabase, courseId): Promise<PassRateReport>
export async function getToppersForCourse(supabase, courseId, limit): Promise<TopperRow[]>
export async function getAttendanceShortageForCourse(supabase, courseId, threshold): Promise<AttendanceShortageRow[]>
export async function getSemSummary(supabase, semId): Promise<SemSummaryRow[]>
```

**Query shapes:**

- **Pass-rate** — `SELECT is_passing FROM course_grades WHERE course_id = $1`. Map via `computePassRate`. If the course has zero graded students, return `{ total: 0, passing: 0, rate: 0 }`.
- **Toppers** — `SELECT student_id, total_obtained, total_max, percentage, grade_label, grade_point FROM course_grades JOIN student_profiles ON … WHERE course_id = $1 ORDER BY grade_point DESC`. Map roll_numbers via a second `student_profiles` query (or join in one query if Supabase supports it; if not, two queries — the first keys by id, the second fetches the matching profiles in one IN-clause call).
- **Attendance-shortage** — `SELECT student_id, status FROM attendance WHERE course_id = $1`. Aggregate in JS: per student count `present + late` (late counts as present for attendance %), and total session count = `COUNT(DISTINCT session_date)` per course. Filter to students whose percentage < threshold and `totalSessions > 0`. Fetch roll_numbers same as toppers. The student list is the set of students with at least one attendance row.
- **Sem summary** — for each course in sem: enrolled count from `student_enrollments JOIN courses ON courses.semester_id = sem_id`, graded count from `course_grades WHERE course_id IN (...)`, passing count from same filtered by `is_passing=true`. avg percentage / grade_point: `AVG(percentage)`, `AVG(grade_point)`. Single SQL query with a `GROUP BY course_id`.

All queries rely on RLS for read scoping (faculty only see courses they teach). The repo does not do role checks — that's the route layer's job.

### 4.2 `apps/api/src/routes/analytics/course.ts`

Hono router with three sub-routes. The mount is per-role:

```ts
// /api/admin/batch/:b/program/:p/sem/:s/course/:c/analytics/{pass-rate,toppers,attendance-shortage}
// /api/faculty/batch/:b/program/:p/sem/:s/course/:c/analytics/{pass-rate,toppers,attendance-shortage}
```

Each handler:
1. Reads `courseId` from path params.
2. For `toppers`: parses `?limit` via `topLimitSchema`. Defaults to 5.
3. For `attendance-shortage`: parses `?threshold` via `attendanceThresholdSchema`. Defaults to 75.
4. Calls the repo with `c.get("supabase")`.
5. Returns the typed response.

Validation failures → `400 validation_failed` with the same `fields[]` shape used elsewhere.

### 4.3 `apps/api/src/routes/analytics/sem.ts`

`GET /api/admin/batch/:b/program/:p/sem/:s/analytics/summary`. Admin only. Calls `getSemSummary(supabase, semId)` and returns `{ courses: SemSummaryRow[] }`.

### 4.4 `apps/api/src/lib/transcriptPdf.ts`

```ts
export interface TranscriptInput {
  institutionName: string;
  student: { fullName: string; rollNumber: string; programName: string; batchLabel: string };
  semester: { number: number; academicYear?: string };
  courses: { code: string; title: string; credits: number; gradeLabel: string; gradePoint: number }[];
  sgpa: number;
  cgpa: number;
  totalCredits: number;
  generatedAt: string; // ISO timestamp
}

export async function renderTranscriptPdf(input: TranscriptInput): Promise<Uint8Array>;
```

Implementation uses `pdf-lib`:
- A4 portrait, Helvetica 11pt.
- Draw header (institution name), "Transcript" title, divider line.
- Draw student block (4 lines: name, roll, program, batch).
- Draw course table (header row + N data rows; column widths pre-sized for A4 portrait).
- Draw summary footer (SGPA, CGPA, total credits).
- Draw "Generated on …" line and a signature line.

Multi-page handling: if `courses.length > 14`, course table overflows to a second page with the same header repeated.

Pure (no network, no DB); takes `TranscriptInput` and returns `Uint8Array`. Tested in isolation in `transcriptPdf.test.ts`.

### 4.5 `apps/api/src/routes/student/transcript.ts`

```ts
// GET /api/student/batch/:b/program/:p/sem/:s/transcript
// GET /api/admin/batch/:b/program/:p/sem/:s/student/:studentId/transcript
```

Algorithm:
1. Resolve the target `(semId, studentId)`. For the student route, `studentId` is from the path. For the admin route, `studentId` is from the path; the caller is admin.
2. Fetch the gradesheet row from `gradesheets` filtered by `(semId, studentId)`. If `status !== 'published'`, return `404 not_found` (the cycle-6 contract — student can't see unpublished).
3. RLS also gates: student's RLS policy allows read only when `status='published'`. Defence in depth — if the row is missing OR status is not 'published', return 404.
4. Fetch `course_grades` for this student where `courses.semester_id = semId`. Compute `totalCredits` via a JOIN to `courses.credits`.
5. Fetch `scores` for this student's `(program_id)` to get `cgpa`.
6. Fetch student profile (full_name, roll_number) and program/batch labels.
7. Build `TranscriptInput` and call `renderTranscriptPdf`.
8. Return `application/pdf` with `Content-Disposition: attachment; filename="transcript-<roll>-<semNumber>.pdf"`.

Faculty does NOT have a transcript route — only students see their own, and admins can fetch any.

### 4.6 `apps/api/src/routes/admin/exports.ts`

Thin wrappers that call into the existing analytics/transcript logic and return a stream with the right Content-Type.

```ts
GET /api/admin/.../course/:c/analytics/pass-rate/export.csv          → text/csv
GET /api/admin/.../course/:c/analytics/toppers/export.csv?limit=N    → text/csv
GET /api/admin/.../course/:c/analytics/attendance-shortage/export.csv?threshold=75 → text/csv
GET /api/admin/.../sem/:s/analytics/summary/export.csv               → text/csv
GET /api/admin/.../student/:studentId/transcript/export.pdf?semId=…  → application/pdf
```

Each handler shares one helper `csvResponse(filename, rows)` that uses `toCsv` and sets `Content-Type: text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="…"`.

PDF export reuses `renderTranscriptPdf` from the student/admin route; the admin can target any `studentId`.

### 4.7 Mount in `apps/api/src/index.ts`

```ts
// Course-scoped analytics (admin + faculty)
app.route("/api/admin/batch/:b/program/:p/sem/:s/course/:c/analytics", analyticsCourseRoute);
app.route("/api/faculty/batch/:b/program/:p/sem/:s/course/:c/analytics", analyticsCourseRoute);

// Sem-scoped summary (admin only)
app.route("/api/admin/batch/:b/program/:p/sem/:s/analytics", analyticsSemRoute);

// Transcript (student and admin)
app.route("/api/student/batch/:b/program/:p/sem/:s", studentTranscriptRoute);
app.route("/api/admin/batch/:b/program/:p/sem/:s/student/:studentId/transcript", adminTranscriptRoute);

// Admin exports (CSV + PDF download paths live alongside the source analytics routes)
app.route("/api/admin/batch/:b/program/:p/sem/:s", adminExportsRoute);
```

The existing `requireRole("admin"|"faculty"|"student")` middlewares already gate the prefixes; no new middleware.

---

## 5. Frontend Layer

### 5.1 `apps/web/src/pages/admin/AnalyticsDashboardPage.tsx`

Layout:
- Top: semester selector (batch / program / semester dropdowns — same pattern as `GradesheetAdminPage`).
- Below: a cross-course summary table (course code | enrolled | graded | passing | pass rate | avg grade point).
- Below: tab strip with three tabs — "Pass rate", "Toppers", "Attendance shortage". Each tab shows a table for the **clicked course** from the summary above (default: first course).
- Each table has a "Download CSV" button that links to the admin export endpoint.

### 5.2 `apps/web/src/pages/faculty/AnalyticsPage.tsx`

Layout:
- Top: list of courses the faculty teaches.
- Click a course → per-course panels for the three tabs above (no Sem Summary tab — admin only).
- All panels are read-only. **No "Download CSV" buttons on this page in cycle 7** — CSV exports are admin-only. Adding faculty exports is on the cycle-8 backlog.

The faculty page reads from the faculty's own `/api/faculty/.../analytics/...` endpoints (which return the same data scoped to the faculty's courses via RLS).

### 5.3 `apps/web/src/components/DownloadTranscriptButton.tsx`

A small button that:
1. Disabled when the gradesheet is `null` (not yet published).
2. On click: `fetch(transcriptUrl, { headers: auth })` → `response.blob()` → triggers download via a hidden `<a download>` element.
3. Shows a brief "Downloading…" state.

Mounted on `MyGradesheetPage` and on the admin `GradesheetAdminPage` (so admin can also download any student's PDF).

### 5.4 Routes / Nav

`App.tsx`:
```ts
<Route path="admin/analytics/:batchId/:programId/:semId" element={...} />
<Route path="faculty/analytics" element={...} />
```

`navConfig.ts`:
- Admin: add `Analytics` → `/admin/analytics/b1/p1/s1` (placeholder, b1/p1/s1 already used elsewhere)
- Faculty: add `Analytics` → `/faculty/analytics`

---

## 6. Testing Strategy

### 6.1 Unit (no DB)
- `packages/shared/src/analytics.test.ts` — `computePassRate`, `topN`, `computeAttendancePct`, threshold/limit schemas
- `packages/shared/src/csv.test.ts` — add `toCsv` roundtrip with `parseCsv` + quoting/embedded newline/escaped quote cases
- `apps/api/src/lib/transcriptPdf.test.ts` — `renderTranscriptPdf` returns bytes; `pdf-lib` parses the bytes; parsed PDF contains "Mark-Matrix", "Transcript", student roll, course code, "SGPA", "CGPA"

### 6.2 Integration (route tests with mocked Supabase)
- `apps/api/src/tests/analytics.course.test.ts` — pass-rate, toppers, attendance-shortage happy + edge (zero graded students, zero sessions)
- `apps/api/src/tests/analytics.sem.test.ts` — sem summary happy path with multiple courses
- `apps/api/src/tests/analytics.faculty.rbac.test.ts` — faculty A cannot see faculty B's course analytics (mock `teaches_course` to return false)
- `apps/api/src/tests/transcript.routes.test.ts` — student blocked when unpublished (404), admin can fetch any, content verified via `renderTranscriptPdf` roundtrip
- `apps/api/src/tests/exports.csv.test.ts` — `text/csv` body parseable; headers correct; `Content-Disposition` set
- `apps/api/src/tests/exports.pdf.test.ts` — `application/pdf` body parses via `pdf-lib`; contains expected text

### 6.3 Seeded dataset for known-output tests

A test helper `seedAnalyticsFixture(supabase)` sets up:
- 1 program, 1 batch, 1 semester, 2 courses (CS101 4 credits, CS102 3 credits)
- 4 students enrolled in both courses
- Marks locked for all (4 students × 2 courses × 2 exam types = 16 marks rows)
- Grade schemes with default bands (A 90-100 / B 80-89 / …)
- Attendance: CS101 has 12 sessions for each of the 4 students, mix of present/absent/late

Expected outputs (pinned):
- **Pass rate** for CS101: 3 of 4 students pass (one fails with 35%), `{ total: 4, passing: 3, rate: 75 }`
- **Toppers** for CS101: ranked by grade_point desc — student-roll-1, student-roll-2, student-roll-3, student-roll-4; default limit=5 returns all 4
- **Attendance shortage** for CS101 with threshold=75: list of students whose `present+late / total_sessions < 0.75`. Computed against the seeded mix.
- **Sem summary**: 2 rows (CS101, CS102) with their aggregate stats.

The fixture writes only via the test mock; it does not require a live Supabase. The route tests use a mock client that returns these rows.

### 6.4 Frontend tests
- `apps/web/src/tests/AnalyticsDashboardPage.test.tsx` — semester selector renders; tab navigation works; table renders rows; CSV link has correct href
- `apps/web/src/tests/AnalyticsPage.test.tsx` — faculty course list renders; clicking a course shows panels; no download buttons
- `apps/web/src/tests/DownloadTranscriptButton.test.tsx` — disabled when gradesheet null; click triggers fetch + download

---

## 7. File Structure (Cycle 7)

### Created in `supabase/migrations/`
- `20260820100013_course_grades_is_passing.sql` — add `is_passing` column + index + backfill

### Created in `packages/shared/src/`
- `analytics.ts` — types, zod schemas, pure compute helpers
- `analytics.test.ts` — unit tests for the helpers
- (add to `csv.ts`) — `toCsv` writer
- (add to `csv.test.ts`) — `toCsv` roundtrip + edge cases
- (add to `routes.ts`) — cycle-7 URL builders
- (add to `index.ts`) — re-export `analytics.js`

### Created in `apps/api/src/`
- `lib/analyticsRepo.ts` — pure Supabase query helpers
- `lib/transcriptPdf.ts` — pdf-lib renderer
- `routes/analytics/course.ts` — pass-rate / toppers / attendance-shortage
- `routes/analytics/sem.ts` — sem summary
- `routes/student/transcript.ts` — student + admin transcript routes
- `routes/admin/exports.ts` — CSV + PDF export routes
- `tests/analytics.course.test.ts`
- `tests/analytics.sem.test.ts`
- `tests/analytics.faculty.rbac.test.ts`
- `tests/transcript.routes.test.ts`
- `tests/exports.csv.test.ts`
- `tests/exports.pdf.test.ts`
- `tests/transcriptPdf.test.ts`

### Modified in `apps/api/src/`
- `lib/courseGradesRepo.ts` — accept + store `is_passing`
- `routes/grades/core.ts` (cycle-5) — pass `is_passing` from `deriveGrade(...)` when upserting
- `index.ts` — mount the new routers

### Created in `apps/web/src/`
- `pages/admin/AnalyticsDashboardPage.tsx`
- `pages/faculty/AnalyticsPage.tsx`
- `components/DownloadTranscriptButton.tsx`
- `tests/AnalyticsDashboardPage.test.tsx`
- `tests/AnalyticsPage.test.tsx`
- `tests/DownloadTranscriptButton.test.tsx`

### Modified in `apps/web/src/`
- `App.tsx` — add the three new routes
- `shell/navConfig.ts` — add admin + faculty "Analytics" nav items
- `pages/student/MyGradesheetPage.tsx` — mount `<DownloadTranscriptButton>`
- `pages/admin/GradesheetAdminPage.tsx` — mount `<DownloadTranscriptButton>` per student row

### Root `package.json`
- Add `pdf-lib` as a dependency of `apps/api`.

---

## 8. Conventions (carried over)

- **TDD** — failing test first, then minimal impl, then green, then commit.
- **Conventional commits** — `feat(db):`, `feat(shared):`, `feat(api):`, `feat(web):`, `test(api):`, `fix(api):`, `chore:`.
- **HTTP error contract** — `400 validation_failed`, `403 forbidden`, `404 not_found`, `500 internal_error`.
- **Migration naming** — continues the `2026082010xxxx` series.
- **RBAC** — Hono middleware enforces role; RLS enforces row scoping (analytics read uses RLS via the role-bound supabase client; no RLS changes needed).
- **Linting / typecheck / test** — every cycle ends with `pnpm lint && pnpm typecheck && pnpm test` green.

---

## 9. Out of Scope / Deferred

- Faculty CSV exports (admin-only in cycle 7)
- Charts (recharts or similar) in the dashboard
- Email delivery of transcripts
- Bulk transcript generation
- Customizable PDF layouts
- Audit logging of downloads (notification stub may grow in cycle 8)

---

## 10. TDD Execution Order

1. `supabase/migrations/20260820100013_course_grades_is_passing.sql` (no test; checked in)
2. `packages/shared/src/csv.ts` — add `toCsv` + tests
3. `packages/shared/src/analytics.ts` — schemas + pure helpers + tests
4. `packages/shared/src/routes.ts` — add URL builders
5. `packages/shared/src/index.ts` — re-export
6. `apps/api/src/lib/courseGradesRepo.ts` — accept `is_passing`
7. `apps/api/src/routes/grades/core.ts` — pass `is_passing`
8. `apps/api/src/lib/analyticsRepo.ts` + tests (uses seeded fixture)
9. `apps/api/src/routes/analytics/course.ts` + tests
10. `apps/api/src/routes/analytics/sem.ts` + tests
11. `apps/api/src/lib/transcriptPdf.ts` + tests
12. `apps/api/src/routes/student/transcript.ts` + tests
13. `apps/api/src/routes/admin/exports.ts` + tests
14. `apps/api/src/index.ts` — mount routers
15. `apps/web/src/pages/admin/AnalyticsDashboardPage.tsx` + tests
16. `apps/web/src/pages/faculty/AnalyticsPage.tsx` + tests
17. `apps/web/src/components/DownloadTranscriptButton.tsx` + tests
18. `apps/web/src/App.tsx` + `navConfig.ts` — wire routes
19. `apps/web/src/pages/student/MyGradesheetPage.tsx` + `pages/admin/GradesheetAdminPage.tsx` — mount button
20. Final `pnpm lint && pnpm typecheck && pnpm test` across the workspace

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `pdf-lib` bundle size affects Worker cold-start | `pdf-lib` is ~600KB minified. Acceptable for a cold-start of ~150ms. Cache via Cloudflare's edge if it becomes an issue. |
| Analytics queries are slow on large courses | The `(course_id, is_passing)` index keeps pass-rate O(log N). For very large courses, an aggregate count via SQL would help — defer to cycle 8. |
| `teaches_course` RLS predicate is the only faculty scoping | This is already the convention. No new RLS policies needed; relies on the existing `teaches_course` SQL function. |
| Transcript PDF text extraction in tests is fragile | Tests assert on a small set of substrings ("Mark-Matrix", "SGPA", student roll, course code) rather than exact layout. |
| Faculty route mounts overlap with cycle-5 grade route mounts | Different prefix paths (`/analytics/...` vs `/marks/...`), no conflict. Verified during mount in step 14. |