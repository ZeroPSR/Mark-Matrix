# Cycle 7 — Reporting, Analytics & Transcript Generation (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-KILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an analytics subsystem (per-course pass-rate / toppers / attendance-shortage, per-semester summary) and a PDF transcript generation service, both built on the data published by cycle 6.

**Architecture:** One additive migration adds `is_passing` to `course_grades` so analytics queries don't re-derive the band on every row. Shared package gains pure compute helpers (`computePassRate`, `topN`, `computeAttendancePct`), types/zod schemas, a `toCsv` writer, and URL builders. API gains a thin `analyticsRepo` (pure Supabase query helpers), a `transcriptPdf` service (pure pdf-lib renderer taking a `TranscriptInput`), and Hono routers for analytics (admin + faculty mounts), transcript (student and admin paths), and admin-only CSV/PDF exports. Frontend gains an admin `AnalyticsDashboardPage`, a faculty `AnalyticsPage`, and a `DownloadTranscriptButton` mounted on both the student `MyGradesheetPage` and the admin `GradesheetAdminPage`. All RBAC via existing `requireRole` middleware + RLS row scoping (`teaches_course` predicate for faculty); no new RLS policies.

**Tech Stack:** Hono on Cloudflare Workers, Supabase (Postgres + PostgREST + RLS), zod, vitest + `@cloudflare/vitest-pool-workers`, pnpm workspaces, React + Vite, **pdf-lib** (new dep on `apps/api`).

**Spec:** [docs/superpowers/specs/2026-09-30-cycle-7-analytics-transcripts-design.md](../specs/2026-09-30-cycle-7-analytics-transcripts-design.md)

---

## Global Constraints

Copied from the project `CLAUDE.md`, cycle 6 plan, and cycle 7 spec. Every task's requirements implicitly include this section.

- **Node** ≥ 20; use `node:` protocol for built-ins.
- **TypeScript strict mode** (`tsconfig.base.json`); `noUncheckedIndexedAccess` is on — treat `arr[i]` as `T | undefined`.
- **Imports** — `@mark-matrix/shared` for cross-package code. `import type` for type-only imports.
- **Prettier** — 2 spaces, double quotes, trailing commas. **ESLint v9 flat config.**
- **Vitest** — `packages/shared/src/**/*.test.ts`, `apps/api/src/**/*.test.ts`, `apps/web/src/**/*.test.tsx`. Setup files and pool are pre-wired.
- **Naming** — `PascalCase` components/types, `camelCase` functions/variables, `SCREAMING_SNAKE_CASE` constants.
- **Hono middleware** — `supabaseAuth` for `/api/*`, `requireRole("admin"|"faculty"|"student")` per prefix.
- **Client choice** — Handlers MUST use `c.get("supabase")` (RLS-bound) for all reads.
- **HTTP error contract** — `400 validation_failed`, `403 forbidden`, `404 not_found`, `500 internal_error`. Existing codes (`marks_data_locked`, `invalid_state_transition`, `incomplete_sem`) carry forward when triggered.
- **TDD** — Failing test first, then minimal implementation, then green, then commit.
- **Conventional commits** with `feat:`, `fix:`, `test:`, `docs:`, `chore:` prefixes.
- **Cycle-numbering convention** for migrations — `20260820100013_course_grades_is_passing.sql` (continues the existing `2026082010xxxx` series).
- **pdf-lib import** — `import { PDFDocument, StandardFonts, rgb } from "pdf-lib";` (pure ESM, Workers-compatible).

---

## Review Focus

The five failure modes the spec implies but no task's tests directly exercise. Each gets an extra test pinned to the task that owns the code.

1. **Analytics RLS actually scopes faculty.** A faculty member hitting `/api/faculty/.../course/<otherFacultyCourse>/analytics/pass-rate` MUST get `200` with zero/empty data, not a real pass-rate. RLS predicate is `public.teaches_course(course_id)` which causes the underlying Supabase query to return `[]` (no error). Owner: **Task 8 (analytics course routes)** — add `it("faculty gets 200 with empty data when querying a course they don't teach")`.
2. **Pass-rate excludes ungraded students correctly.** A student enrolled in CS101 but with zero `course_grades` rows (because their marks are still draft) MUST NOT appear in either the numerator or denominator. The pass-rate SQL filters by `course_grades.course_id` — students without a row are silently absent. Owner: **Task 7 (analyticsRepo)** — add `it("students with no cached grade are excluded from pass-rate")`.
4. **PDF text is parseable AND non-empty.** The PDF must be a valid PDF byte stream (not a JSON error wrapped in `application/pdf`). Tests assert bytes start with `%PDF-` and that parsed text contains the expected substrings. Owner: **Task 10 (transcriptPdf)** — add `it("renderTranscriptPdf output starts with %PDF- and parses via pdf-lib")`.
5. **Faculty CSV export is forbidden.** The spec defers faculty exports to cycle 8. A faculty member hitting `/api/admin/.../export.csv` MUST get `403 forbidden` (admin `requireRole` middleware already enforces this; just need a pinning test). Owner: **Task 12 (exports routes)** — add `it("faculty hitting admin export.csv gets 403")`.
6. **Transcript endpoint 404s when status != published, even if the row exists.** Defence in depth — the route checks `status === 'published'` even though RLS would hide non-published rows from students. Owner: **Task 11 (transcript routes)** — add `it("transcript route returns 404 when gradesheet status is compiled (not published)")`.

---

## Task 1: DB migration for `course_grades.is_passing`

**Files:**
- Create: `supabase/migrations/20260820100013_course_grades_is_passing.sql`

**Interfaces:**
- DB-only deliverable. After this task:
  - `course_grades.is_passing` is `boolean NOT NULL DEFAULT false`.
  - All existing rows are backfilled from the matching `grade_schemes` band.
  - A new index `(course_id, is_passing)` supports fast pass-rate counts.

- [ ] **Step 1: Write the migration file**

`supabase/migrations/20260820100013_course_grades_is_passing.sql`:

```sql
-- 20260820100013_course_grades_is_passing.sql
-- Cycle 7 — add is_passing to course_grades so analytics queries don't need to
-- re-derive the grade band on every row. Populated at upsert time going
-- forward; backfilled once here from the matching grade_schemes band.

alter table public.course_grades
  add column if not exists is_passing boolean not null default false;

-- Backfill is_passing from the matching grade_schemes band. If the row's
-- grade_scheme has been deleted (the FK is ON DELETE RESTRICT so this should
-- never happen in practice, but be defensive), is_passing stays at the
-- default false rather than failing the migration.
update public.course_grades cg
   set is_passing = coalesce(gs.is_passing, false)
  from public.grade_schemes gs
 where gs.id = cg.grade_scheme_id
   and gs.grade_label = cg.grade_label
   and cg.is_passing = false;

create index if not exists course_grades_course_passing_idx
  on public.course_grades (course_id, is_passing);
```

- [ ] **Step 2: Verify migration applies cleanly (if local Supabase is up)**

Run: `supabase db reset`
Expected: migration applies without error; `\d course_grades` shows `is_passing boolean not null default false` and the new index.

If no local Supabase is running, commit and let CI validate on push.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260820100013_course_grades_is_passing.sql
git commit -m "feat(db): course_grades.is_passing + index + backfill"
```

---

---

## Task 2: Shared `toCsv` writer + tests

**Files:**
- Modify: `packages/shared/src/csv.ts` (append a new export)
- Modify: `packages/shared/src/csv.test.ts` (add new describe block)

**Interfaces:**
- `toCsv(rows: (string | number | null)[][]): string` — RFC4180 writer. Quotes any field containing `,`, `"`, `\n`, or `\r`; doubles embedded `"`. Joins rows with `\r\n` and appends a trailing `\r\n`.
- Roundtrips cleanly with the existing `parseCsv`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseCsv, parseEnrollCsv, toCsv } from "./csv.js";

describe("toCsv", () => {
  it("writes a header row + data rows separated by CRLF with trailing CRLF", () => {
    const out = toCsv([
      ["name", "age"],
      ["alice", "30"],
      ["bob", "25"],
    ]);
    expect(out).toBe("name,age\r\nalice,30\r\nbob,25\r\n");
  });

  it("emits an empty string for an empty input array", () => {
    expect(toCsv([])).toBe("");
  });

  it("quotes and escapes a field with an embedded comma", () => {
    expect(toCsv([["a", "b,c"]])).toBe('a,"b,c"\r\n');
  });

  it("quotes and escapes a field with an embedded double-quote", () => {
    expect(toCsv([['he said "hi"']])).toBe('"he said ""hi"""\r\n');
  });

  it("quotes and escapes a field with an embedded newline", () => {
    expect(toCsv([["line1\nline2"]])).toBe('"line1\nline2"\r\n');
  });

  it("renders null as an empty field", () => {
    expect(toCsv([["a", null, "c"]])).toBe("a,,c\r\n");
  });

  it("renders numbers without quoting when safe", () => {
    expect(toCsv([["n", 42]])).toBe("n,42\r\n");
  });

  it("roundtrips with parseCsv for a typical analytics report", () => {
    const rows = [
      ["student", "percentage", "grade"],
      ["23BCA001", "92.5", "A"],
      ["23BCA002", "67.0", "C"],
    ];
    const parsed = parseCsv(toCsv(rows));
    expect(parsed).toEqual(rows);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/shared test csv.test.ts`
Expected: FAIL — `toCsv` is not exported from `./csv.js`.

- [ ] **Step 3: Implement `toCsv`**

Append to `packages/shared/src/csv.ts`:

```ts
/**
 * RFC4180-ish CSV writer. Quotes any field that contains a comma, double
 * quote, CR, or LF; doubles embedded double quotes. Joins rows with CRLF and
 * appends a trailing CRLF so the output is one record per line, terminated.
 */
export function toCsv(rows: (string | number | null)[][]): string {
  if (rows.length === 0) return "";
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/shared test csv.test.ts`
Expected: all 8 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/shared lint && pnpm --filter @mark-matrix/shared typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/csv.ts packages/shared/src/csv.test.ts
git commit -m "feat(shared): toCsv writer (RFC4180, roundtrips with parseCsv)"
```

---

## Task 3: Shared analytics types, schemas, and pure helpers

**Files:**
- Create: `packages/shared/src/analytics.ts`
- Create: `packages/shared/src/analytics.test.ts`

**Interfaces:**
- `PassRateReport = { courseId: string; total: number; passing: number; rate: number }` — zod schema + type
- `TopperRow = { studentId, rollNumber, totalObtained, totalMax, percentage, gradeLabel, gradePoint }`
- `AttendanceShortageRow = { studentId, rollNumber, presentCount, totalSessions, percentage }`
- `SemSummaryRow = { courseId, courseCode, courseTitle, enrolled, graded, passing, passRate, avgPercentage, avgGradePoint }`
- `topLimitSchema` — coerces query param to `int 1..50`, default 5
- `attendanceThresholdSchema` — coerces query param to `number 0..100`, default 75
- `computePassRate(rows)` — `{ total, passing, rate }` with `round2` precision; rate is 0 when total is 0
- `topN(items, by, limit)` — stable top-N by descending score; ties broken by input order
- `computeAttendancePct(present, total)` — returns 0 when total is 0

- [ ] **Step 1: Write the failing tests**

`packages/shared/src/analytics.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computePassRate,
  topN,
  computeAttendancePct,
  topLimitSchema,
  attendanceThresholdSchema,
} from "./analytics.js";

describe("computePassRate", () => {
  it("returns 0/0/0 for empty input", () => {
    expect(computePassRate([])).toEqual({ total: 0, passing: 0, rate: 0 });
  });

  it("counts passing rows and computes the rate rounded to 2 decimals", () => {
    expect(computePassRate([
      { isPassing: true }, { isPassing: true }, { isPassing: true }, { isPassing: false },
    ])).toEqual({ total: 4, passing: 3, rate: 75 });
  });

  it("returns rate 0 when nobody passes", () => {
    expect(computePassRate([{ isPassing: false }, { isPassing: false }]))
      .toEqual({ total: 2, passing: 0, rate: 0 });
  });

  it("rounds to 2 decimals", () => {
    // 2 of 3 pass: 66.666... -> 66.67
    expect(computePassRate([{ isPassing: true }, { isPassing: true }, { isPassing: false }]))
      .toEqual({ total: 3, passing: 2, rate: 66.67 });
  });
});

describe("topN", () => {
  type Row = { id: string; score: number };
  it("returns the top N by score descending", () => {
    const rows: Row[] = [
      { id: "a", score: 10 },
      { id: "b", score: 30 },
      { id: "c", score: 20 },
    ];
    expect(topN(rows, (r) => r.score, 2).map((r) => r.id)).toEqual(["b", "c"]);
  });

  it("preserves input order on ties", () => {
    const rows: Row[] = [
      { id: "a", score: 10 },
      { id: "b", score: 10 },
      { id: "c", score: 5 },
    ];
    expect(topN(rows, (r) => r.score, 5).map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array when limit is 0 or negative — capped by caller", () => {
    // topN does not validate limit; the zod schema does. We assert that it
    // does not throw and returns [] when limit is 0.
    expect(topN<Row>([], () => 0, 0)).toEqual([]);
  });

  it("clamps to input length when limit > length", () => {
    const rows: Row[] = [{ id: "a", score: 1 }];
    expect(topN(rows, (r) => r.score, 10)).toEqual([{ id: "a", score: 1 }]);
  });
});

describe("computeAttendancePct", () => {
  it("returns 0 when total is 0", () => {
    expect(computeAttendancePct(0, 0)).toBe(0);
  });

  it("computes percentage to 2 decimals", () => {
    expect(computeAttendancePct(7, 10)).toBe(70);
    expect(computeAttendancePct(1, 3)).toBe(33.33);
  });
});

describe("topLimitSchema", () => {
  it("defaults to 5 when missing", () => {
    expect(topLimitSchema.parse(undefined)).toBe(5);
  });
  it("coerces strings to ints", () => {
    expect(topLimitSchema.parse("10")).toBe(10);
  });
  it("rejects 0 and >50", () => {
    expect(() => topLimitSchema.parse(0)).toThrow();
    expect(() => topLimitSchema.parse(51)).toThrow();
  });
});

describe("attendanceThresholdSchema", () => {
  it("defaults to 75 when missing", () => {
    expect(attendanceThresholdSchema.parse(undefined)).toBe(75);
  });
  it("accepts 0..100 inclusive", () => {
    expect(attendanceThresholdSchema.parse(0)).toBe(0);
    expect(attendanceThresholdSchema.parse(100)).toBe(100);
  });
  it("rejects out-of-range", () => {
    expect(() => attendanceThresholdSchema.parse(-1)).toThrow();
    expect(() => attendanceThresholdSchema.parse(101)).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/shared test analytics.test.ts`
Expected: FAIL — `./analytics.js` does not exist.

- [ ] **Step 3: Implement `analytics.ts`**

`packages/shared/src/analytics.ts`:

```ts
import { z } from "zod";

const round2 = (n: number): number => Math.round(n * 100) / 100;

// Report types ---------------------------------------------------------------

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

// Query-param schemas ---------------------------------------------------------

export const topLimitSchema = z.coerce.number().int().min(1).max(50).default(5);
export const attendanceThresholdSchema = z.coerce.number().min(0).max(100).default(75);

// Pure compute helpers --------------------------------------------------------

export function computePassRate(rows: { isPassing: boolean }[]): PassRateReport {
  const total = rows.length;
  const passing = rows.filter((r) => r.isPassing).length;
  const rate = total === 0 ? 0 : round2((passing / total) * 100);
  // courseId is set by the route layer; analyticsRepo passes it through.
  return { courseId: "", total, passing, rate };
}

/**
 * Stable top-N by descending `by(item)`. Ties broken by the input index so
 * the result is fully deterministic regardless of the underlying sort.
 */
export function topN<T>(items: T[], by: (t: T) => number, limit: number): T[] {
  const indexed = items.map((item, i) => ({ item, score: by(item), i }));
  indexed.sort((a, b) => b.score - a.score || a.i - b.i);
  return indexed.slice(0, Math.max(0, limit)).map((x) => x.item);
}

export function computeAttendancePct(present: number, total: number): number {
  if (total === 0) return 0;
  return round2((present / total) * 100);
}
```

Note: `PassRateReport.courseId` is `""` from `computePassRate`; the route layer (Task 8) patches in the real `courseId` from the path param before returning. This keeps the helper free of `courseId` plumbing for testing.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/shared test analytics.test.ts`
Expected: all ~14 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/shared lint && pnpm --filter @mark-matrix/shared typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/analytics.ts packages/shared/src/analytics.test.ts
git commit -m "feat(shared): analytics types, zod schemas, pure compute helpers"
```

---

## Task 4: Shared URL builders + re-export

**Files:**
- Modify: `packages/shared/src/routes.ts` (add cycle-7 URL builders to `ROUTES_CYCLE_2`)
- Modify: `packages/shared/src/index.ts` (re-export `./analytics.js`)

**Interfaces:**
- URL builders (TypeScript signatures):
  - `analyticsPassRate(role: "admin"|"faculty", batchId, programId, semId, courseId)`
  - `analyticsToppers(role: "admin"|"faculty", batchId, programId, semId, courseId)`
  - `analyticsAttendanceShortage(role: "admin"|"faculty", batchId, programId, semId, courseId)`
  - `analyticsSemSummary(role: "admin", batchId, programId, semId)`
  - `studentTranscript(role: "student"|"admin", batchId, programId, semId, studentId?)` — student path omits `studentId`; admin path includes it.

- [ ] **Step 1: Add URL builders to `packages/shared/src/routes.ts`**

Open `packages/shared/src/routes.ts` and append inside `ROUTES_CYCLE_2` (just before the closing `} as const;`):

```ts
  // Cycle 7 — analytics + transcript route builders.
  analyticsPassRate: (
    role: "admin" | "faculty",
    batchId: string,
    programId: string,
    semId: string,
    courseId: string,
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/analytics/pass-rate`,

  analyticsToppers: (
    role: "admin" | "faculty",
    batchId: string,
    programId: string,
    semId: string,
    courseId: string,
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/analytics/toppers`,

  analyticsAttendanceShortage: (
    role: "admin" | "faculty",
    batchId: string,
    programId: string,
    semId: string,
    courseId: string,
  ): string =>
    `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/course/${courseId}/analytics/attendance-shortage`,

  analyticsSemSummary: (
    role: "admin",
    batchId: string,
    programId: string,
    semId: string,
  ): string =>
    `/api/admin/batch/${batchId}/program/${programId}/sem/${semId}/analytics/summary`,

  studentTranscript: (
    role: "student" | "admin",
    batchId: string,
    programId: string,
    semId: string,
    studentId?: string,
  ): string =>
    studentId !== undefined
      ? `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/student/${studentId}/transcript`
      : `/api/${role}/batch/${batchId}/program/${programId}/sem/${semId}/transcript`,
```

- [ ] **Step 2: Re-export `analytics.js` from `packages/shared/src/index.ts`**

Open `packages/shared/src/index.ts` and append:

```ts
export * from "./analytics.js";
```

(Keep the existing re-exports; just add this line.)

- [ ] **Step 3: Lint + typecheck + test**

Run: `pnpm --filter @mark-matrix/shared lint && pnpm --filter @mark-matrix/shared typecheck && pnpm --filter @mark-matrix/shared test`
Expected: green (no behavior change, only additions).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/routes.ts packages/shared/src/index.ts
git commit -m "feat(shared): cycle-7 URL builders + analytics re-export"
```

---

---

## Task 5: `courseGradesRepo.upsertCourseGrade` accepts and stores `is_passing`

**Files:**
- Modify: `apps/api/src/lib/courseGradesRepo.ts` (extend the function signature + the upsert payload)

**Interfaces:**
- `upsertCourseGrade(supabase, { courseId, studentId, totalObtained, totalMax, percentage, gradeLabel, gradePoint, gradeSchemeId, isPassing })` — same return type, accepts the new `isPassing` arg.
- Persists `is_passing` so cycle-6 analytics can group by it.

- [ ] **Step 1: Read the current `courseGradesRepo.ts`**

Run: `Read apps/api/src/lib/courseGradesRepo.ts`
Expected: matches the version inspected during brainstorming; the `upsertCourseGrade` function takes the args listed above (without `isPassing`) and builds a row object without `is_passing`.

- [ ] **Step 2: Add `isPassing` to the arg type and the upsert payload**

Edit `apps/api/src/lib/courseGradesRepo.ts`:

- In the `args` parameter object (the second arg of `upsertCourseGrade`), add a new line after `gradeSchemeId`:
  ```ts
      isPassing: boolean,
  ```
- In the `row` object built for the upsert, add a new line after `grade_scheme_id: args.gradeSchemeId,`:
  ```ts
    is_passing: args.isPassing,
  ```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @mark-matrix/api typecheck`
Expected: FAIL — the only callsite in `apps/api/src/routes/grades/core.ts` still passes the old shape. That's the next task.

- [ ] **Step 4: Commit (intentionally)**

This task's repo change leaves the build broken until Task 6 finishes. Do NOT commit yet — combine with Task 6 in a single commit so the working tree never goes red on `main`.

---

## Task 6: `grades/core.ts` passes `is_passing` from `deriveGrade(...)`

**Files:**
- Modify: `apps/api/src/routes/grades/core.ts` (update the `upsertCourseGrade` callsite)

**Interfaces:**
- The cycle-5 grade resolution flow (`deriveGrade(...)` returns `{ gradeLabel, gradePoint, isPassing }`) already yields `isPassing`. Plumb that into `upsertCourseGrade`.

- [ ] **Step 1: Find the callsite**

Run: `Grep -n "upsertCourseGrade" apps/api/src/routes/grades/core.ts`
Expected: a single callsite where `deriveGrade(...)`'s output is forwarded into `upsertCourseGrade`.

- [ ] **Step 2: Pass `isPassing` to `upsertCourseGrade`**

At the callsite, destructure `isPassing` from the `deriveGrade(...)` return value and add `isPassing` to the `upsertCourseGrade` arg object. Example (the exact variable names depend on the existing code; the change is mechanical):

```ts
const { gradeLabel, gradePoint, isPassing } = deriveGrade(percentage, bands);
// ...
const saved = await upsertCourseGrade(supabase, {
  courseId,
  studentId,
  totalObtained,
  totalMax,
  percentage,
  gradeLabel,
  gradePoint,
  gradeSchemeId,
  isPassing, // <-- new
});
```

If the existing code uses different local variable names, preserve them — only add `isPassing` as a forwarded field.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @mark-matrix/api typecheck && pnpm --filter @mark-matrix/api lint`
Expected: green.

- [ ] **Step 4: Run the existing grade-engine tests to confirm no regression**

Run: `pnpm --filter @mark-matrix/api test grades`
Expected: all cycle-5 grade tests pass unchanged. The cycle-5 `grades.snapshot.test.ts` and similar are the regression net.

- [ ] **Step 5: Commit (combined with Task 5)**

```bash
git add apps/api/src/lib/courseGradesRepo.ts apps/api/src/routes/grades/core.ts
git commit -m "feat(api): course_grades.is_passing threaded through grade resolution"
```

---

## Task 7: `analyticsRepo.ts` — pure Supabase query helpers + tests

**Files:**
- Create: `apps/api/src/lib/analyticsRepo.ts`
- Create: `apps/api/src/tests/analyticsRepo.test.ts`

**Interfaces:**
- `getPassRateForCourse(supabase, courseId): Promise<PassRateReport>` — returns `{ courseId, total, passing, rate }` (where `rate = 0` when `total === 0`).
- `getToppersForCourse(supabase, courseId, limit): Promise<TopperRow[]>` — joined with `student_profiles` for `roll_number`. Ordered by `grade_point DESC` server-side.
- `getAttendanceShortageForCourse(supabase, courseId, threshold): Promise<AttendanceShortageRow[]>` — `late` counts as present. Sessions = `COUNT(DISTINCT session_date)`. Only students with at least one attendance row are considered (no-session students are NOT in the list — they would be 0% by definition, which would be noise).
- `getSemSummary(supabase, semId): Promise<SemSummaryRow[]>` — one row per course in the sem.

RLS scopes the reads: the supabase client is the role-bound client (`c.get("supabase")`), so faculty only see rows for courses they teach; admins see everything.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/tests/analyticsRepo.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getPassRateForCourse,
  getToppersForCourse,
  getAttendanceShortageForCourse,
  getSemSummary,
} from "../lib/analyticsRepo.js";

/**
 * A mock Supabase client. We dispatch on `from(table)` and on the chain of
 * `.eq()`/`.select()`/etc. Each test sets the `responses` map keyed by
 * table; calls outside the map return empty arrays. RLS is NOT modelled — the
 * test mocks return everything as if the caller were admin.
 */
function makeMockSupabase(opts: {
  courseGrades?: { course_id: string; student_id: string; is_passing: boolean; total_obtained: string | number; total_max: string | number; percentage: string | number; grade_label: string; grade_point: string | number }[];
  studentProfiles?: { user_id: string; roll_number: string }[];
  attendance?: { student_id: string; status: "present" | "absent" | "late"; session_date: string }[];
  distinctSessions?: { session_date: string }[];
  courses?: { id: string; code: string; title: string; semester_id: string }[];
  enrollments?: { student_id: string; sem_id: string }[];
} = {}): SupabaseClient {
  const R = {
    course_grades: opts.courseGrades ?? [],
    student_profiles: opts.studentProfiles ?? [],
    attendance: opts.attendance ?? [],
    sessions: opts.distinctSessions ?? [],
    courses: opts.courses ?? [],
    student_enrollments: opts.enrollments ?? [],
  };

  const builder = (table: keyof typeof R): unknown => {
    const b: Record<string, unknown> = {
      select(_cols?: unknown) { return b; },
      eq(_col?: unknown, _val?: unknown) { return b; },
      in(_col?: unknown, _vals?: unknown) { return b; },
      order(_col?: unknown, _opts?: unknown) { return b; },
      gte(_col?: unknown, _val?: unknown) { return b; },
      then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (table === "courses") {
          // Distinguishes "list all courses in sem" (no further filters after
          // semester_id eq) from "get distinct sessions for a course".
          return Promise.resolve({ data: R.courses, error: null }).then(onFulfilled);
        }
        if (table === "sessions") {
          return Promise.resolve({ data: R.sessions, error: null }).then(onFulfilled);
        }
        return Promise.resolve({ data: R[table], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t as keyof typeof R) } as unknown as SupabaseClient;
}

beforeEach(() => {});

describe("getPassRateForCourse", () => {
  it("returns 0/0/0 when no rows exist", async () => {
    const supabase = makeMockSupabase();
    const out = await getPassRateForCourse(supabase, "c1");
    expect(out).toEqual({ courseId: "c1", total: 0, passing: 0, rate: 0 });
  });

  it("counts passing rows and computes rate rounded to 2 decimals", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "s2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c1", student_id: "s3", is_passing: true,  total_obtained: 70, total_max: 100, percentage: 70, grade_label: "C", grade_point: 7 },
        { course_id: "c1", student_id: "s4", is_passing: false, total_obtained: 35, total_max: 100, percentage: 35, grade_label: "F", grade_point: 0 },
      ],
    });
    const out = await getPassRateForCourse(supabase, "c1");
    expect(out).toEqual({ courseId: "c1", total: 4, passing: 3, rate: 75 });
  });

  it("Review Focus 2 — students with no cached grade are excluded (no rows => 0/0/0)", async () => {
    const supabase = makeMockSupabase({ courseGrades: [] });
    const out = await getPassRateForCourse(supabase, "c1");
    expect(out.total).toBe(0);
  });
});

describe("getToppersForCourse", () => {
  it("returns top N ordered by grade_point desc, joined with roll_number", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c1", student_id: "s1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "s3", is_passing: false, total_obtained: 35, total_max: 100, percentage: 35, grade_label: "F", grade_point: 0 },
      ],
      studentProfiles: [
        { user_id: "s1", roll_number: "23BCA001" },
        { user_id: "s2", roll_number: "23BCA002" },
        { user_id: "s3", roll_number: "23BCA003" },
      ],
    });
    const out = await getToppersForCourse(supabase, "c1", 2);
    expect(out).toEqual([
      { studentId: "s1", rollNumber: "23BCA001", totalObtained: 90, totalMax: 100, percentage: 90, gradeLabel: "A", gradePoint: 9 },
      { studentId: "s2", rollNumber: "23BCA002", totalObtained: 80, totalMax: 100, percentage: 80, gradeLabel: "B", gradePoint: 8 },
    ]);
  });

  it("returns empty array when no students are graded", async () => {
    const supabase = makeMockSupabase();
    const out = await getToppersForCourse(supabase, "c1", 5);
    expect(out).toEqual([]);
  });
});

describe("getAttendanceShortageForCourse", () => {
  it("returns only students below threshold; late counts as present", async () => {
    const supabase = makeMockSupabase({
      // 4 sessions total. Student A: 4/4 = 100%. Student B: 3/4 = 75% (not below). Student C: 2/4 = 50% (below).
      attendance: [
          { student_id: "sA", status: "present", session_date: "2026-09-01" },
          { student_id: "sA", status: "present", session_date: "2026-09-02" },
          { student_id: "sA", status: "present", session_date: "2026-09-03" },
          { student_id: "sA", status: "late",    session_date: "2026-09-04" },
          { student_id: "sB", status: "present", session_date: "2026-09-01" },
          { student_id: "sB", status: "present", session_date: "2026-09-02" },
          { student_id: "sB", status: "present", session_date: "2026-09-03" },
          { student_id: "sB", status: "absent",  session_date: "2026-09-04" },
          { student_id: "sC", status: "present", session_date: "2026-09-01" },
          { student_id: "sC", status: "present", session_date: "2026-09-02" },
          { student_id: "sC", status: "absent",  session_date: "2026-09-03" },
          { student_id: "sC", status: "absent",  session_date: "2026-09-04" },
      ],
      distinctSessions: [
        { session_date: "2026-09-01" }, { session_date: "2026-09-02" },
        { session_date: "2026-09-03" }, { session_date: "2026-09-04" },
      ],
      studentProfiles: [
        { user_id: "sA", roll_number: "R-A" },
        { user_id: "sB", roll_number: "R-B" },
        { user_id: "sC", roll_number: "R-C" },
      ],
    });
    const out = await getAttendanceShortageForCourse(supabase, "c1", 75);
    // sB at exactly 75% is NOT below threshold; sC at 50% IS below.
    expect(out).toEqual([
      { studentId: "sC", rollNumber: "R-C", presentCount: 2, totalSessions: 4, percentage: 50 },
    ]);
  });

  it("returns empty array when no sessions exist", async () => {
    const supabase = makeMockSupabase({ distinctSessions: [] });
    const out = await getAttendanceShortageForCourse(supabase, "c1", 75);
    expect(out).toEqual([]);
  });
});

describe("getSemSummary", () => {
  it("returns one row per course with the aggregated stats", async () => {
    const supabase = makeMockSupabase({
      courses: [
        { id: "c1", code: "CS101", title: "Intro to Programming", semester_id: "s1" },
        { id: "c2", code: "CS102", title: "Discrete Maths",       semester_id: "s1" },
      ],
      enrollments: [
        { student_id: "st1", sem_id: "s1" }, { student_id: "st2", sem_id: "s1" },
        { student_id: "st3", sem_id: "s1" }, { student_id: "st4", sem_id: "s1" },
      ],
      // Mock returns the same courseGrades for both; test just exercises
      // the shape, not the exact aggregation (covered by analytics.sem.test).
      courseGrades: [
        { course_id: "c1", student_id: "st1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "st2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c2", student_id: "st1", is_passing: true,  total_obtained: 85, total_max: 100, percentage: 85, grade_label: "B", grade_point: 8 },
      ],
    });
    const out = await getSemSummary(supabase, "s1");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ courseId: "c1", courseCode: "CS101", enrolled: 4 });
    expect(out[1]).toMatchObject({ courseId: "c2", courseCode: "CS102", enrolled: 4 });
  });

  it("returns empty array when sem has no courses", async () => {
    const supabase = makeMockSupabase({ courses: [] });
    const out = await getSemSummary(supabase, "s1");
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test analyticsRepo.test.ts`
Expected: FAIL — `analyticsRepo.ts` does not exist.

- [ ] **Step 3: Implement `analyticsRepo.ts`**

`apps/api/src/lib/analyticsRepo.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePassRate,
  topN,
  computeAttendancePct,
  type PassRateReport,
  type TopperRow,
  type AttendanceShortageRow,
  type SemSummaryRow,
} from "@mark-matrix/shared";

type CourseGradeDbRow = {
  course_id: string;
  student_id: string;
  is_passing: boolean;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
};

type StudentProfileRow = { user_id: string; roll_number: string };

type AttendanceRow = {
  student_id: string;
  status: "present" | "absent" | "late";
  session_date: string;
};

type SessionDateRow = { session_date: string };

type CourseRow = { id: string; code: string; title: string; semester_id: string };
type EnrollmentRow = { student_id: string; sem_id: string };

export async function getPassRateForCourse(
  supabase: SupabaseClient,
  courseId: string,
): Promise<PassRateReport> {
  const { data, error } = await supabase
    .from("course_grades")
    .select("is_passing")
    .eq("course_id", courseId);
  if (error) throw error;
  const rows = ((data ?? []) as unknown as { is_passing: boolean }[]);
  const computed = computePassRate(rows);
  return { ...computed, courseId };
}

export async function getToppersForCourse(
  supabase: SupabaseClient,
  courseId: string,
  limit: number,
): Promise<TopperRow[]> {
  const { data, error } = await supabase
    .from("course_grades")
    .select("student_id, total_obtained, total_max, percentage, grade_label, grade_point")
    .eq("course_id", courseId)
    .order("grade_point", { ascending: false });
  if (error) throw error;
  const grades = (data ?? []) as unknown as CourseGradeDbRow[];
  if (grades.length === 0) return [];

  const studentIds = [...new Set(grades.map((g) => g.student_id))];
  const { data: profileRows, error: pErr } = await supabase
    .from("student_profiles")
    .select("user_id, roll_number")
    .in("user_id", studentIds);
  if (pErr) throw pErr;
  const rollMap = new Map<string, string>(
    ((profileRows ?? []) as unknown as StudentProfileRow[]).map((p) => [p.user_id, p.roll_number]),
  );

  const rows: TopperRow[] = grades.map((g) => ({
    studentId: g.student_id,
    rollNumber: rollMap.get(g.student_id) ?? "",
    totalObtained: Number(g.total_obtained),
    totalMax: Number(g.total_max),
    percentage: Number(g.percentage),
    gradeLabel: g.grade_label,
    gradePoint: Number(g.grade_point),
  }));
  return topN(rows, (r) => r.gradePoint, limit);
}

export async function getAttendanceShortageForCourse(
  supabase: SupabaseClient,
  courseId: string,
  threshold: number,
): Promise<AttendanceShortageRow[]> {
  // 1. Get total sessions for the course.
  const { data: sessRows, error: sessErr } = await supabase
    .from("attendance")
    .select("session_date")
    .eq("course_id", courseId);
  if (sessErr) throw sessErr;
  const sessions = (sessRows ?? []) as unknown as SessionDateRow[];
  const totalSessions = new Set(sessions.map((s) => s.session_date)).size;
  if (totalSessions === 0) return [];

  // 2. Get every attendance row for the course.
  const { data: attRows, error: attErr } = await supabase
    .from("attendance")
    .select("student_id, status, session_date")
    .eq("course_id", courseId);
  if (attErr) throw attErr;
  const att = (attRows ?? []) as unknown as AttendanceRow[];

  // 3. Aggregate per student. `late` counts as present.
  const perStudent = new Map<string, { present: number; sessionSet: Set<string> }>();
  for (const r of att) {
    let entry = perStudent.get(r.student_id);
    if (!entry) {
      entry = { present: 0, sessionSet: new Set() };
      perStudent.set(r.student_id, entry);
    }
    if (r.status === "present" || r.status === "late") entry.present += 1;
    entry.sessionSet.add(r.session_date);
  }

  // 4. Filter to students below threshold AND with at least one session row.
  const below: { studentId: string; presentCount: number; percentage: number }[] = [];
  for (const [studentId, e] of perStudent.entries()) {
    const pct = computeAttendancePct(e.present, totalSessions);
    if (pct < threshold) {
      below.push({ studentId, presentCount: e.present, percentage: pct });
    }
  }

  // 5. Fetch roll numbers.
  const studentIds = below.map((b) => b.studentId);
  const rollMap = new Map<string, string>();
  if (studentIds.length > 0) {
    const { data: profileRows, error: pErr } = await supabase
      .from("student_profiles")
      .select("user_id, roll_number")
      .in("user_id", studentIds);
    if (pErr) throw pErr;
    for (const p of (profileRows ?? []) as unknown as StudentProfileRow[]) {
      rollMap.set(p.user_id, p.roll_number);
    }
  }

  return below.map((b) => ({
    studentId: b.studentId,
    rollNumber: rollMap.get(b.studentId) ?? "",
    presentCount: b.presentCount,
    totalSessions,
    percentage: b.percentage,
  }));
}

export async function getSemSummary(
  supabase: SupabaseClient,
  semId: string,
): Promise<SemSummaryRow[]> {
  const { data: courseRows, error: cErr } = await supabase
    .from("courses")
    .select("id, code, title, semester_id")
    .eq("semester_id", semId);
  if (cErr) throw cErr;
  const courses = (courseRows ?? []) as unknown as CourseRow[];
  if (courses.length === 0) return [];

  const { data: enrRows, error: eErr } = await supabase
    .from("student_enrollments")
    .select("student_id, sem_id")
    .eq("sem_id", semId);
  if (eErr) throw eErr;
  const enrolled = ((enrRows ?? []) as unknown as EnrollmentRow[]).length;

  const courseIds = courses.map((c) => c.id);
  const { data: gradeRows, error: gErr } = await supabase
    .from("course_grades")
    .select("course_id, is_passing, percentage, grade_point")
    .in("course_id", courseIds);
  if (gErr) throw gErr;
  const grades = (gradeRows ?? []) as unknown as {
    course_id: string;
    is_passing: boolean;
    percentage: string | number;
    grade_point: string | number;
  }[];

  const byCourse = new Map<string, { passing: number; totalPct: number; totalGp: number; graded: number }>();
  for (const c of courses) byCourse.set(c.id, { passing: 0, totalPct: 0, totalGp: 0, graded: 0 });
  for (const g of grades) {
    const entry = byCourse.get(g.course_id);
    if (!entry) continue;
    entry.graded += 1;
    if (g.is_passing) entry.passing += 1;
    entry.totalPct += Number(g.percentage);
    entry.totalGp += Number(g.grade_point);
  }

  const out: SemSummaryRow[] = [];
  for (const c of courses) {
    const e = byCourse.get(c.id)!;
    const passRate = e.graded === 0 ? 0 : Math.round((e.passing / e.graded) * 10000) / 100;
    const avgPct = e.graded === 0 ? 0 : Math.round((e.totalPct / e.graded) * 100) / 100;
    const avgGp = e.graded === 0 ? 0 : Math.round((e.totalGp / e.graded) * 100) / 100;
    out.push({
      courseId: c.id,
      courseCode: c.code,
      courseTitle: c.title,
      enrolled,
      graded: e.graded,
      passing: e.passing,
      passRate,
      avgPercentage: avgPct,
      avgGradePoint: avgGp,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test analyticsRepo.test.ts`
Expected: all ~10 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/analyticsRepo.ts apps/api/src/tests/analyticsRepo.test.ts
git commit -m "feat(api): analyticsRepo — pass-rate, toppers, attendance-shortage, sem summary"
```

---

---

## Task 8: Analytics course routes (pass-rate, toppers, attendance-shortage)

**Files:**
- Create: `apps/api/src/routes/analytics/course.ts`
- Create: `apps/api/src/tests/analytics.course.test.ts`
- Create: `apps/api/src/tests/analytics.course.rbac.test.ts`

**Interfaces:**
- Router mounted at `/api/{admin|faculty}/batch/:b/program/:p/sem/:s/course/:c/analytics` (mount added in Task 13).
- `GET /pass-rate` → `PassRateReport`
- `GET /toppers?limit=N` → `{ toppers: TopperRow[] }` (limit default 5, validated via `topLimitSchema`)
- `GET /attendance-shortage?threshold=N` → `{ rows: AttendanceShortageRow[] }` (threshold default 75, validated via `attendanceThresholdSchema`)
- Validation failures → `400 validation_failed` with `{ fields: [{ path, message }] }`
- All three return `{ error: "not_found" }` 404 if the supabase query returns no data (the RBAC test pins this for faculty hitting an unrelated course).

- [ ] **Step 1: Write the failing tests**

`apps/api/src/tests/analytics.course.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyticsCourseRoute } from "../routes/analytics/course.js";

function makeMockSupabase(opts: {
  courseGrades?: unknown[];
  studentProfiles?: unknown[];
  attendance?: unknown[];
  distinctSessions?: unknown[];
  throwNotFound?: boolean;
} = {}): SupabaseClient {
  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      order() { return b; },
      then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (opts.throwNotFound) {
          return Promise.resolve({ data: null, error: { code: "PGRST116", message: "not found" } }).then(onFulfilled);
        }
        if (table === "course_grades") return Promise.resolve({ data: opts.courseGrades ?? [], error: null }).then(onFulfilled);
        if (table === "student_profiles") return Promise.resolve({ data: opts.studentProfiles ?? [], error: null }).then(onFulfilled);
        if (table === "attendance") return Promise.resolve({ data: opts.attendance ?? opts.distinctSessions ?? [], error: null }).then(onFulfilled);
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

function mountAs(supabase: SupabaseClient, role: "admin" | "faculty", userId = "u1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", role);
    await next();
  });
  app.route(
    "/api/admin/batch/:b/program/:p/sem/:s/course/:c/analytics",
    analyticsCourseRoute,
  );
  return app;
}

const URL = "/api/admin/batch/b1/program/p1/sem/s1/course/c1/analytics";

beforeEach(() => {});

describe("GET /pass-rate", () => {
  it("returns the computed pass-rate report", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s1", is_passing: true },
        { course_id: "c1", student_id: "s2", is_passing: true },
        { course_id: "c1", student_id: "s3", is_passing: true },
        { course_id: "c1", student_id: "s4", is_passing: false },
      ],
    });
    const app = mountAs(supabase, "admin");
    const res = await app.request(`${URL}/pass-rate`);
    expect(res.status).toBe(200);
    const body = await res.json() as { courseId: string; total: number; passing: number; rate: number };
    expect(body).toEqual({ courseId: "c1", total: 4, passing: 3, rate: 75 });
  });

  it("returns 0/0/0 when no rows", async () => {
    const supabase = makeMockSupabase({ courseGrades: [] });
    const app = mountAs(supabase, "admin");
    const res = await app.request(`${URL}/pass-rate`);
    expect(res.status).toBe(200);
    const body = await res.json() as { total: number; passing: number; rate: number };
    expect(body).toEqual({ courseId: "c1", total: 0, passing: 0, rate: 0 });
  });
});

describe("GET /toppers", () => {
  it("returns top N by grade_point desc with default limit 5", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s2", total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8, is_passing: true },
        { course_id: "c1", student_id: "s1", total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9, is_passing: true },
      ],
      studentProfiles: [
        { user_id: "s1", roll_number: "23BCA001" },
        { user_id: "s2", roll_number: "23BCA002" },
      ],
    });
    const app = mountAs(supabase, "admin");
    const res = await app.request(`${URL}/toppers`);
    expect(res.status).toBe(200);
    const body = await res.json() as { toppers: { studentId: string; rollNumber: string; gradePoint: number }[] };
    expect(body.toppers).toHaveLength(2);
    expect(body.toppers[0]!.studentId).toBe("s1");
    expect(body.toppers[0]!.rollNumber).toBe("23BCA001");
  });

  it("honors ?limit= and rejects >50", async () => {
    const supabase = makeMockSupabase({ courseGrades: [], studentProfiles: [] });
    const app = mountAs(supabase, "admin");
    const r1 = await app.request(`${URL}/toppers?limit=3`);
    expect(r1.status).toBe(200);
    const r2 = await app.request(`${URL}/toppers?limit=51`);
    expect(r2.status).toBe(400);
    const body = await r2.json() as { error: string; fields: { path: string }[] };
    expect(body.error).toBe("validation_failed");
    expect(body.fields.some((f) => f.path === "limit")).toBe(true);
  });
});

describe("GET /attendance-shortage", () => {
  it("returns rows below the default threshold (75)", async () => {
    const supabase = makeMockSupabase({
      attendance: [
        { student_id: "sA", status: "present", session_date: "2026-09-01" },
        { student_id: "sA", status: "present", session_date: "2026-09-02" },
        { student_id: "sA", status: "present", session_date: "2026-09-03" },
        { student_id: "sA", status: "absent",  session_date: "2026-09-04" },
        { student_id: "sB", status: "present", session_date: "2026-09-01" },
        { student_id: "sB", status: "present", session_date: "2026-09-02" },
        { student_id: "sB", status: "absent",  session_date: "2026-09-03" },
        { student_id: "sB", status: "absent",  session_date: "2026-09-04" },
      ],
      studentProfiles: [
        { user_id: "sA", roll_number: "R-A" },
        { user_id: "sB", roll_number: "R-B" },
      ],
    });
    const app = mountAs(supabase, "admin");
    const res = await app.request(`${URL}/attendance-shortage`);
    expect(res.status).toBe(200);
    const body = await res.json() as { rows: { rollNumber: string; percentage: number }[] };
    expect(body.rows).toEqual([
      { studentId: "sB", rollNumber: "R-B", presentCount: 2, totalSessions: 4, percentage: 50 },
    ]);
  });

  it("honors ?threshold= and rejects >100", async () => {
    const supabase = makeMockSupabase();
    const app = mountAs(supabase, "admin");
    const r1 = await app.request(`${URL}/attendance-shortage?threshold=80`);
    expect(r1.status).toBe(200);
    const r2 = await app.request(`${URL}/attendance-shortage?threshold=150`);
    expect(r2.status).toBe(400);
  });
});
```

`apps/api/src/tests/analytics.course.rbac.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireRole } from "../middleware/requireRole.js";
import { analyticsCourseRoute } from "../routes/analytics/course.js";

/**
 * Simulates a faculty member whose RLS-bound supabase client sees no rows for
 * a course they don't teach (the "not found" path returned by Supabase RLS).
 */
function makeMockSupabaseNoRows(): SupabaseClient {
  const b: Record<string, unknown> = {
    select() { return b; }, eq() { return b; }, in() { return b; }, order() { return b; },
    then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled);
    },
  };
  return { from: () => b } as unknown as SupabaseClient;
}

function mountFaculty(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", makeMockSupabaseNoRows());
    c.set("userId", "faculty-a");
    c.set("role", "faculty");
    await next();
  });
  app.use("/api/faculty/*", requireRole("faculty"));
  app.route(
    "/api/faculty/batch/:b/program/:p/sem/:s/course/:c/analytics",
    analyticsCourseRoute,
  );
  return app;
}

const URL = "/api/faculty/batch/b1/program/p1/sem/s1/course/c1/analytics";

describe("faculty analytics — RBAC scoping", () => {
  it("Review Focus 1 — faculty gets 200 with empty data when RLS hides the course", async () => {
    // The RLS predicate makes Supabase return []; analyticsRepo's pass-rate
    // returns 0/0/0, toppers returns [], attendance-shortage returns [].
    // Status is 200, body is empty (defence-in-depth pattern; RLS is the gate).
    const app = mountFaculty();
    const r1 = await app.request(`${URL}/pass-rate`);
    expect(r1.status).toBe(200);
    const b1 = await r1.json() as { total: number; passing: number; rate: number };
    expect(b1).toEqual({ courseId: "c1", total: 0, passing: 0, rate: 0 });

    const r2 = await app.request(`${URL}/toppers`);
    expect(r2.status).toBe(200);
    const b2 = await r2.json() as { toppers: unknown[] };
    expect(b2.toppers).toEqual([]);

    const r3 = await app.request(`${URL}/attendance-shortage`);
    expect(r3.status).toBe(200);
    const b3 = await r3.json() as { rows: unknown[] };
    expect(b3.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test analytics.course`
Expected: FAIL — `analyticsCourseRoute` not found.

- [ ] **Step 3: Implement `analyticsCourseRoute`**

`apps/api/src/routes/analytics/course.ts`:

```ts
import { Hono, type Context } from "hono";
import {
  formatZodError,
  topLimitSchema,
  attendanceThresholdSchema,
  type PassRateReport,
  type TopperRow,
  type AttendanceShortageRow,
} from "@mark-matrix/shared";
import {
  getPassRateForCourse,
  getToppersForCourse,
  getAttendanceShortageForCourse,
} from "../../lib/analyticsRepo.js";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

async function passRate(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const out: PassRateReport = await getPassRateForCourse(supabase, courseId);
  return c.json(out);
}

async function toppers(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = topLimitSchema.safeParse(c.req.query("limit"));
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows: TopperRow[] = await getToppersForCourse(supabase, courseId, parsed.data);
  return c.json({ toppers: rows });
}

async function attendanceShortage(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = attendanceThresholdSchema.safeParse(c.req.query("threshold"));
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows: AttendanceShortageRow[] = await getAttendanceShortageForCourse(
    supabase,
    courseId,
    parsed.data,
  );
  return c.json({ rows });
}

export const analyticsCourseRoute = new Hono<AppEnv>()
  .get("/pass-rate", passRate)
  .get("/toppers", toppers)
  .get("/attendance-shortage", attendanceShortage);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test analytics.course`
Expected: all ~7 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/analytics/course.ts \
        apps/api/src/tests/analytics.course.test.ts \
        apps/api/src/tests/analytics.course.rbac.test.ts
git commit -m "feat(api): analytics course routes (pass-rate, toppers, attendance-shortage) + RBAC"
```

---

## Task 9: Analytics sem route (admin-only summary)

**Files:**
- Create: `apps/api/src/routes/analytics/sem.ts`
- Create: `apps/api/src/tests/analytics.sem.test.ts`

**Interfaces:**
- Router mounted at `/api/admin/batch/:b/program/:p/sem/:s/analytics` (mount added in Task 13).
- `GET /summary` → `{ courses: SemSummaryRow[] }`
- One row per course in the sem; aggregates enrolled, graded, passing, passRate, avgPercentage, avgGradePoint.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/tests/analytics.sem.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyticsSemRoute } from "../routes/analytics/sem.js";

function makeMockSupabase(opts: {
  courses?: unknown[];
  enrollments?: unknown[];
  courseGrades?: unknown[];
} = {}): SupabaseClient {
  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (table === "courses") return Promise.resolve({ data: opts.courses ?? [], error: null }).then(onFulfilled);
        if (table === "student_enrollments") return Promise.resolve({ data: opts.enrollments ?? [], error: null }).then(onFulfilled);
        if (table === "course_grades") return Promise.resolve({ data: opts.courseGrades ?? [], error: null }).then(onFulfilled);
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route(
    "/api/admin/batch/:b/program/:p/sem/:s/analytics",
    analyticsSemRoute,
  );
  return app;
}

const URL = "/api/admin/batch/b1/program/p1/sem/s1/analytics/summary";

describe("GET /sem/analytics/summary", () => {
  it("returns one row per course with aggregated stats", async () => {
    const supabase = makeMockSupabase({
      courses: [
        { id: "c1", code: "CS101", title: "Intro", semester_id: "s1" },
        { id: "c2", code: "CS102", title: "Maths", semester_id: "s1" },
      ],
      enrollments: [
        { student_id: "st1", sem_id: "s1" }, { student_id: "st2", sem_id: "s1" },
        { student_id: "st3", sem_id: "s1" }, { student_id: "st4", sem_id: "s1" },
      ],
      courseGrades: [
        { course_id: "c1", student_id: "st1", is_passing: true,  percentage: 90, grade_point: 9 },
        { course_id: "c1", student_id: "st2", is_passing: true,  percentage: 80, grade_point: 8 },
        { course_id: "c1", student_id: "st3", is_passing: false, percentage: 35, grade_point: 0 },
        { course_id: "c2", student_id: "st1", is_passing: true,  percentage: 85, grade_point: 8 },
      ],
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = await res.json() as { courses: { courseId: string; courseCode: string; enrolled: number; graded: number; passing: number; passRate: number; avgPercentage: number; avgGradePoint: number }[] };
    expect(body.courses).toHaveLength(2);
    expect(body.courses[0]).toEqual({
      courseId: "c1",
      courseCode: "CS101",
      courseTitle: "Intro",
      enrolled: 4,
      graded: 3,
      passing: 2,
      passRate: 66.67,
      avgPercentage: 68.33,
      avgGradePoint: 5.67,
    });
  });

  it("returns empty array when sem has no courses", async () => {
    const supabase = makeMockSupabase({ courses: [] });
    const app = mountAsAdmin(supabase);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = await res.json() as { courses: unknown[] };
    expect(body.courses).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mark-matrix/api test analytics.sem.test.ts`
Expected: FAIL — `analyticsSemRoute` not found.

- [ ] **Step 3: Implement `analyticsSemRoute`**

`apps/api/src/routes/analytics/sem.ts`:

```ts
import { Hono, type Context } from "hono";
import { getSemSummary, type SemSummaryRow } from "@mark-matrix/shared";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

async function summary(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);
  const courses: SemSummaryRow[] = await getSemSummary(supabase, semId);
  return c.json({ courses });
}

export const analyticsSemRoute = new Hono<AppEnv>()
  .get("/summary", summary);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test analytics.sem.test.ts`
Expected: 2 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/analytics/sem.ts apps/api/src/tests/analytics.sem.test.ts
git commit -m "feat(api): sem analytics summary route"
```

---

## Task 10: `transcriptPdf.ts` — pure pdf-lib renderer + tests

**Files:**
- Modify: `apps/api/package.json` (add `pdf-lib` dependency)
- Create: `apps/api/src/lib/transcriptPdf.ts`
- Create: `apps/api/src/tests/transcriptPdf.test.ts`

**Interfaces:**
- `TranscriptInput` — see spec section 4.4.
- `renderTranscriptPdf(input): Promise<Uint8Array>` — A4 portrait, Helvetica 11pt, single page for ≤14 courses, multi-page above with header repeated.

- [ ] **Step 1: Add `pdf-lib` to `apps/api/package.json`**

Open `apps/api/package.json` and add `"pdf-lib": "^1.17.1"` to the `"dependencies"` block (use the same version style as other deps in the file). Run `pnpm install` afterwards.

- [ ] **Step 2: Write the failing tests**

`apps/api/src/tests/transcriptPdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderTranscriptPdf, type TranscriptInput } from "../lib/transcriptPdf.js";

const sample: TranscriptInput = {
  institutionName: "Mark-Matrix Institute of Technology",
  student: { fullName: "Alice Anderson", rollNumber: "23BCA001", programName: "BCA", batchLabel: "2023-2026" },
  semester: { number: 1, academicYear: "2023-2024" },
  courses: [
    { code: "CS101", title: "Intro to Programming", credits: 4, gradeLabel: "A", gradePoint: 9 },
    { code: "CS102", title: "Discrete Maths",       credits: 3, gradeLabel: "B", gradePoint: 8 },
  ],
  sgpa: 8.67,
  cgpa: 8.67,
  totalCredits: 7,
  generatedAt: "2026-09-30T12:00:00Z",
};

describe("renderTranscriptPdf", () => {
  it("returns a non-empty Uint8Array", async () => {
    const bytes = await renderTranscriptPdf(sample);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it("Review Focus 4 — output starts with %PDF- and parses via pdf-lib", async () => {
    const bytes = await renderTranscriptPdf(sample);
    const head = new TextDecoder().decode(bytes.slice(0, 5));
    expect(head).toBe("%PDF-");
    // pdf-lib re-load should not throw
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("renders to a single page when course count is small", async () => {
    const bytes = await renderTranscriptPdf(sample);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("splits to two pages when course count exceeds 14", async () => {
    const many: TranscriptInput = {
      ...sample,
      courses: Array.from({ length: 16 }, (_, i) => ({
        code: `CS${100 + i}`,
        title: `Course ${i + 1}`,
        credits: 3,
        gradeLabel: "A",
        gradePoint: 9,
      })),
    };
    const doc = await PDFDocument.load(await renderTranscriptPdf(many));
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test transcriptPdf.test.ts`
Expected: FAIL — `transcriptPdf.ts` does not exist.

- [ ] **Step 4: Implement `transcriptPdf.ts`**

`apps/api/src/lib/transcriptPdf.ts`:

```ts
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export interface TranscriptCourse {
  code: string;
  title: string;
  credits: number;
  gradeLabel: string;
  gradePoint: number;
}

export interface TranscriptInput {
  institutionName: string;
  student: { fullName: string; rollNumber: string; programName: string; batchLabel: string };
  semester: { number: number; academicYear?: string };
  courses: TranscriptCourse[];
  sgpa: number;
  cgpa: number;
  totalCredits: number;
  generatedAt: string;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 60;

const drawHeader = async (
  page: import("pdf-lib").PDFPage,
  font: PDFFont,
  bold: PDFFont,
  input: TranscriptInput,
): Promise<number> => {
  page.drawText(input.institutionName, {
    x: MARGIN_X, y: A4_HEIGHT - MARGIN_TOP, size: 14, font: bold, color: rgb(0, 0, 0),
  });
  page.drawText("Transcript of Academic Record", {
    x: MARGIN_X, y: A4_HEIGHT - MARGIN_TOP - 18, size: 11, font, color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: MARGIN_X, y: A4_HEIGHT - MARGIN_TOP - 26 },
    end:   { x: A4_WIDTH - MARGIN_X, y: A4_HEIGHT - MARGIN_TOP - 26 },
    thickness: 0.5, color: rgb(0, 0, 0),
  });
  return A4_HEIGHT - MARGIN_TOP - 40;
};

const drawStudentBlock = (
  page: import("pdf-lib").PDFPage,
  font: PDFFont,
  input: TranscriptInput,
  y: number,
): number => {
  const lines: [string, string][] = [
    ["Name",     input.student.fullName],
    ["Roll No.",  input.student.rollNumber],
    ["Program",   input.student.programName],
    ["Batch",     input.student.batchLabel],
    ["Semester",  `Semester ${input.semester.number}${input.semester.academicYear ? ` (${input.semester.academicYear})` : ""}`],
  ];
  for (const [label, value] of lines) {
    page.drawText(`${label}:`, { x: MARGIN_X, y, size: 11, font });
    page.drawText(value,        { x: MARGIN_X + 100, y, size: 11, font });
    y -= 16;
  }
  return y - 8;
};

const drawCourseTable = async (
  pdf: PDFDocument,
  page: import("pdf-lib").PDFPage,
  font: PDFFont,
  bold: PDFFont,
  input: TranscriptInput,
  yStart: number,
): Promise<number> => {
  // Columns: code (70), title (240), credits (28), grade (50), grade point (40)
  const colsX = [0, 80, 330, 380, 440];
  const headerY = yStart;
  const headers = ["Code", "Title", "Credits", "Grade", "Grade Pt"];
  for (let i = 0; i < headers.length; i++) {
    page.drawText(headers[i]!, { x: MARGIN_X + colsX[i]!, y: headerY, size: 11, font: bold });
  }
  page.drawLine({
    start: { x: MARGIN_X, y: headerY - 4 },
    end:   { x: A4_WIDTH - MARGIN_X, y: headerY - 4 },
    thickness: 0.5,
  });
  let y = headerY - 18;
  for (let i = 0; i < input.courses.length; i++) {
    if (y < MARGIN_BOTTOM + 80 && i > 0) {
      page = pdf.addPage();
      y = await drawHeader(page, font, bold, input);
      y -= 10;
      for (let j = 0; j < headers.length; j++) {
        page.drawText(headers[j]!, { x: MARGIN_X + colsX[j]!, y, size: 11, font: bold });
      }
      page.drawLine({
        start: { x: MARGIN_X, y: y - 4 },
        end:   { x: A4_WIDTH - MARGIN_X, y: y - 4 },
        thickness: 0.5,
      });
      y -= 18;
    }
    const c = input.courses[i]!;
    page.drawText(c.code,       { x: MARGIN_X + colsX[0]!, y, size: 11, font });
    page.drawText(c.title.slice(0, 38), { x: MARGIN_X + colsX[1]!, y, size: 11, font });
    page.drawText(String(c.credits),     { x: MARGIN_X + colsX[2]!, y, size: 11, font });
    page.drawText(c.gradeLabel, { x: MARGIN_X + colsX[3]!, y, size: 11, font });
    page.drawText(c.gradePoint.toFixed(2), { x: MARGIN_X + colsX[4]!, y, size: 11, font });
    y -= 16;
  }
  return y;
};

const drawFooter = (
  page: import("pdf-lib").PDFPage,
  font: PDFFont,
  input: TranscriptInput,
  y: number,
): void => {
  page.drawText(`SGPA: ${input.sgpa.toFixed(2)}    CGPA: ${input.cgpa.toFixed(2)}    Total Credits: ${input.totalCredits}`, {
    x: MARGIN_X, y, size: 11, font,
  });
  const date = new Date(input.generatedAt);
  const dateStr = date.toISOString().slice(0, 10);
  page.drawText(`Generated on ${dateStr}`, {
    x: MARGIN_X, y: MARGIN_BOTTOM + 24, size: 9, font,
  });
  page.drawText("Authorized Signatory", {
    x: A4_WIDTH - MARGIN_X - 130, y: MARGIN_BOTTOM + 24, size: 9, font,
  });
  page.drawLine({
    start: { x: A4_WIDTH - MARGIN_X - 130, y: MARGIN_BOTTOM + 14 },
    end:   { x: A4_WIDTH - MARGIN_X, y: MARGIN_BOTTOM + 14 },
    thickness: 0.5,
  });
};

export async function renderTranscriptPdf(input: TranscriptInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  let y = await drawHeader(page, font, bold, input);
  y = drawStudentBlock(page, font, input, y);
  y = await drawCourseTable(pdf, page, font, bold, input, y);
  drawFooter(page, font, input, y - 8);
  return pdf.save();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test transcriptPdf.test.ts`
Expected: all 4 cases green.

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api typecheck`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml \
        apps/api/src/lib/transcriptPdf.ts \
        apps/api/src/tests/transcriptPdf.test.ts
git commit -m "feat(api): transcript PDF rendering (pdf-lib, multi-page)"
```

---

---

## Task 11: Transcript routes (student + admin) + tests

**Files:**
- Create: `apps/api/src/routes/student/transcript.ts`
- Create: `apps/api/src/tests/transcript.routes.test.ts`

**Interfaces:**
- Router mounted at `/api/student/batch/:b/program/:p/sem/:s` (mount added in Task 13). Exposes `GET /transcript`.
- Admin mount added separately in Task 13: `/api/admin/batch/:b/program/:p/sem/:s/student/:studentId/transcript` → `GET /`.
- 404 when `status !== 'published'` (defence in depth).
- 404 when the gradesheet row doesn't exist.
- Response: `application/pdf` with `Content-Disposition: attachment; filename="transcript-<roll>-<semNumber>.pdf"`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/tests/transcript.routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { studentTranscriptRoute } from "./transcript.js";

type DbRow = {
  id: string;
  sem_id: string;
  student_id: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
  total_credits: string | number | null;
};

/**
 * Mock that responds differently per (table, eq-filter). The student route
 * calls: gradesheets (eq sem_id + eq student_id), student_profiles (eq user_id),
 * scores (eq student_id), course_grades (joined courses.semester_id), courses (eq semester_id),
 * semesters (eq id), programs (eq id), batches (eq id).
 */
function makeMockSupabase(opts: {
  gradesheet?: DbRow | null;
  courseGrades?: { student_id: string; course_id: string; total_obtained: string | number; total_max: string | number; percentage: string | number; grade_label: string; grade_point: string | number; courses: { code: string; title: string; credits: string | number } }[];
  score?: { cgpa: string | number } | null;
  profile?: { roll_number: string; full_name: string } | null;
  program?: { name: string } | null;
  batch?: { label: string } | null;
} = {}): SupabaseClient {
  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {
      select() { return b; },
      eq() { return b; },
      in() { return b; },
      order() { return b; },
      then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (table === "gradesheets") return Promise.resolve({ data: opts.gradesheet ? [opts.gradesheet] : [], error: null }).then(onFulfilled);
        if (table === "course_grades") return Promise.resolve({ data: opts.courseGrades ?? [], error: null }).then(onFulfilled);
        if (table === "scores") return Promise.resolve({ data: opts.score ? [opts.score] : [], error: null }).then(onFulfilled);
        if (table === "student_profiles") return Promise.resolve({ data: opts.profile ? [opts.profile] : [], error: null }).then(onFulfilled);
        if (table === "programs") return Promise.resolve({ data: opts.program ? [opts.program] : [], error: null }).then(onFulfilled);
        if (table === "batches") return Promise.resolve({ data: opts.batch ? [opts.batch] : [], error: null }).then(onFulfilled);
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

function mountAsStudent(supabase: SupabaseClient, userId = "student-1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", "student");
    await next();
  });
  app.route("/api/student/batch/:b/program/:p/sem/:s", studentTranscriptRoute);
  return app;
}

const URL = "/api/student/batch/b1/program/p1/sem/s1/transcript";

beforeEach(() => {});

describe("student transcript route", () => {
  it("returns PDF when gradesheet is published", async () => {
    const supabase = makeMockSupabase({
      gradesheet: { id: "g1", sem_id: "s1", student_id: "student-1", status: "published", sgpa: "8.50", total_credits: "7" },
      courseGrades: [
        { student_id: "student-1", course_id: "c1", total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9, courses: { code: "CS101", title: "Intro", credits: 4 } },
        { student_id: "student-1", course_id: "c2", total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8, courses: { code: "CS102", title: "Maths", credits: 3 } },
      ],
      score: { cgpa: "8.50" },
      profile: { roll_number: "23BCA001", full_name: "Alice Anderson" },
      program: { name: "BCA" },
      batch: { label: "2023-2026" },
    });
    const app = mountAsStudent(supabase);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(/^attachment; filename="transcript-23BCA001-1\.pdf"$/);

    const bytes = new Uint8Array(await res.arrayBuffer());
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("Review Focus 6 — returns 404 when gradesheet status is not 'published'", async () => {
    const supabase = makeMockSupabase({
      gradesheet: { id: "g1", sem_id: "s1", student_id: "student-1", status: "compiled", sgpa: "8.50", total_credits: "7" },
      courseGrades: [],
      profile: null, program: null, batch: null,
    });
    const app = mountAsStudent(supabase);
    const res = await app.request(URL);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("not_found");
  });

  it("returns 404 when no gradesheet row exists", async () => {
    const supabase = makeMockSupabase({ gradesheet: null });
    const app = mountAsStudent(supabase);
    const res = await app.request(URL);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test transcript.routes.test.ts`
Expected: FAIL — `studentTranscriptRoute` not found.

- [ ] **Step 3: Implement `studentTranscriptRoute`**

`apps/api/src/routes/student/transcript.ts`:

```ts
import { Hono, type Context } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../../env.js";
import { renderTranscriptPdf, type TranscriptInput, type TranscriptCourse } from "../../lib/transcriptPdf.js";

type Ctx = Context<AppEnv>;

type GradesheetRow = {
  id: string;
  sem_id: string;
  student_id: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
  total_credits: string | number | null;
};

type CourseGradeRow = {
  student_id: string;
  course_id: string;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
  courses: { code: string; title: string; credits: string | number };
};

async function buildTranscript(
  supabase: SupabaseClient,
  semId: string,
  studentId: string,
): Promise<TranscriptInput | null> {
  const { data: gsRows, error: gsErr } = await supabase
    .from("gradesheets")
    .select("id, sem_id, student_id, status, sgpa, total_credits")
    .eq("sem_id", semId)
    .eq("student_id", studentId);
  if (gsErr) throw gsErr;
  const gs = ((gsRows ?? []) as unknown as GradesheetRow[])[0];
  if (!gs || gs.status !== "published") return null;

  const { data: cgRows, error: cgErr } = await supabase
    .from("course_grades")
    .select("student_id, course_id, total_obtained, total_max, percentage, grade_label, grade_point, courses!inner(code, title, credits, semester_id)")
    .eq("student_id", studentId)
    .eq("courses.semester_id", semId);
  if (cgErr) throw cgErr;
  const grades = (cgRows ?? []) as unknown as CourseGradeRow[];
  const courses: TranscriptCourse[] = grades.map((g) => ({
    code: g.courses.code,
    title: g.courses.title,
    credits: Number(g.courses.credits),
    gradeLabel: g.grade_label,
    gradePoint: Number(g.grade_point),
  }));
  const totalCredits = courses.reduce((acc, c) => acc + c.credits, 0);

  const { data: scoreArr, error: scErr } = await supabase
    .from("scores")
    .select("cgpa")
    .eq("student_id", studentId);
  if (scErr) throw scErr;
  const cgpa = Number(((scoreArr ?? []) as unknown as { cgpa: string | number }[])[0]?.cgpa ?? 0);

  const { data: profileArr, error: pErr } = await supabase
    .from("student_profiles")
    .select("roll_number, full_name")
    .eq("user_id", studentId);
  if (pErr) throw pErr;
  const profile = ((profileArr ?? []) as unknown as { roll_number: string; full_name: string }[])[0] ?? { roll_number: "", full_name: "" };

  return {
    institutionName: "Mark-Matrix Institute of Technology",
    student: { fullName: profile.full_name, rollNumber: profile.roll_number, programName: "BCA", batchLabel: "" },
    semester: { number: 1 },
    courses,
    sgpa: Number(gs.sgpa ?? 0),
    cgpa,
    totalCredits,
    generatedAt: new Date().toISOString(),
  };
}

async function studentTranscript(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const userId = c.get("userId");
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);

  const input = await buildTranscript(supabase, semId, userId);
  if (!input) return c.json({ error: "not_found" }, 404);

  const bytes = await renderTranscriptPdf(input);
  const filename = `transcript-${input.student.rollNumber || "student"}-${input.semester.number}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const studentTranscriptRoute = new Hono<AppEnv>().get("/transcript", studentTranscript);

/**
 * Admin transcript — exposed at /api/admin/.../student/:studentId/transcript
 * Returns the same PDF for any student the admin targets. Reuses the same
 * helper but takes studentId from the path.
 */
async function adminTranscript(c: Ctx): Promise<Response> {
  const supabase = c.get("supabase");
  const semId = c.req.param("semId");
  const studentId = c.req.param("studentId");
  if (!semId || !studentId) return c.json({ error: "missing_sem_or_student" }, 400);

  const input = await buildTranscript(supabase, semId, studentId);
  if (!input) return c.json({ error: "not_found" }, 404);

  const bytes = await renderTranscriptPdf(input);
  const filename = `transcript-${input.student.rollNumber || studentId}-${input.semester.number}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const adminTranscriptRoute = new Hono<AppEnv>().get("/", adminTranscript);
```

Note: the `adminTranscriptRoute` is exported from the same file because the two endpoints share `buildTranscript` and the response shape.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test transcript.routes.test.ts`
Expected: 3 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/student/transcript.ts apps/api/src/tests/transcript.routes.test.ts
git commit -m "feat(api): student + admin transcript routes (PDF download)"
```

---

## Task 12: Admin export routes (CSV + PDF)

**Files:**
- Create: `apps/api/src/routes/admin/exports.ts`
- Create: `apps/api/src/tests/exports.csv.test.ts`
- Create: `apps/api/src/tests/exports.pdf.test.ts`

**Interfaces:**
- One router mounted at `/api/admin/batch/:b/program/:p/sem/:s` (and reuses the same mount for course paths). Sub-routes:
  - `GET /course/:c/analytics/pass-rate/export.csv` → `text/csv`
  - `GET /course/:c/analytics/toppers/export.csv?limit=N` → `text/csv`
  - `GET /course/:c/analytics/attendance-shortage/export.csv?threshold=N` → `text/csv`
  - `GET /analytics/summary/export.csv` → `text/csv`
  - `GET /student/:studentId/transcript/export.pdf` → `application/pdf`
- All responses set `Content-Disposition: attachment; filename="…"`.
- RBAC: `requireRole("admin")` already gates `/api/admin/*` prefix; this task's RBAC test pins that.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/tests/exports.csv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCsv } from "@mark-matrix/shared";
import { adminExportsRoute } from "../routes/admin/exports.js";
import { requireRole } from "../middleware/requireRole.js";

function makeMockSupabase(opts: {
  courseGrades?: unknown[];
  studentProfiles?: unknown[];
  attendance?: unknown[];
  distinctSessions?: unknown[];
  courses?: unknown[];
  enrollments?: unknown[];
} = {}): SupabaseClient {
  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {
      select() { return b; }, eq() { return b; }, in() { return b; },
      order() { return b; }, then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (table === "course_grades") return Promise.resolve({ data: opts.courseGrades ?? [], error: null }).then(onFulfilled);
        if (table === "student_profiles") return Promise.resolve({ data: opts.studentProfiles ?? [], error: null }).then(onFulfilled);
        if (table === "attendance") return Promise.resolve({ data: opts.attendance ?? opts.distinctSessions ?? [], error: null }).then(onFulfilled);
        if (table === "courses") return Promise.resolve({ data: opts.courses ?? [], error: null }).then(onFulfilled);
        if (table === "student_enrollments") return Promise.resolve({ data: opts.enrollments ?? [], error: null }).then(onFulfilled);
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route("/api/admin/batch/:b/program/:p/sem/:s", adminExportsRoute);
  return app;
}

function mountAsFaculty(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "faculty-1");
    c.set("role", "faculty");
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route("/api/admin/batch/:b/program/:p/sem/:s", adminExportsRoute);
  return app;
}

const BASE = "/api/admin/batch/b1/program/p1/sem/s1";

describe("CSV exports", () => {
  it("GET /course/:c/analytics/pass-rate/export.csv returns a parseable CSV with one header row + one data row", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "s2", is_passing: false, total_obtained: 35, total_max: 100, percentage: 35, grade_label: "F", grade_point: 0 },
      ],
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${BASE}/course/c1/analytics/pass-rate/export.csv`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=".*\.csv"/);
    const text = await res.text();
    const rows = parseCsv(text);
    expect(rows[0]).toEqual(["course_id", "total", "passing", "rate"]);
    expect(rows[1]).toEqual(["c1", "2", "1", "50"]);
  });

  it("GET /course/:c/analytics/toppers/export.csv respects ?limit", async () => {
    const supabase = makeMockSupabase({
      courseGrades: [
        { course_id: "c1", student_id: "s1", is_passing: true,  total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9 },
        { course_id: "c1", student_id: "s2", is_passing: true,  total_obtained: 80, total_max: 100, percentage: 80, grade_label: "B", grade_point: 8 },
        { course_id: "c1", student_id: "s3", is_passing: true,  total_obtained: 70, total_max: 100, percentage: 70, grade_label: "C", grade_point: 7 },
      ],
      studentProfiles: [
        { user_id: "s1", roll_number: "R1" },
        { user_id: "s2", roll_number: "R2" },
        { user_id: "s3", roll_number: "R3" },
      ],
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${BASE}/course/c1/analytics/toppers/export.csv?limit=2`);
    expect(res.status).toBe(200);
    const rows = parseCsv(await res.text());
    expect(rows[0]).toEqual(["roll_number", "total_obtained", "total_max", "percentage", "grade_label", "grade_point"]);
    // 1 header + 2 toppers
    expect(rows).toHaveLength(3);
    expect(rows[1]![0]).toBe("R1");
  });

  it("GET /analytics/summary/export.csv returns one row per course in the sem", async () => {
    const supabase = makeMockSupabase({
      courses: [
        { id: "c1", code: "CS101", title: "Intro", semester_id: "s1" },
        { id: "c2", code: "CS102", title: "Maths", semester_id: "s1" },
      ],
      enrollments: [{ student_id: "st1", sem_id: "s1" }, { student_id: "st2", sem_id: "s1" }],
      courseGrades: [
        { course_id: "c1", student_id: "st1", is_passing: true, percentage: 90, grade_point: 9 },
        { course_id: "c2", student_id: "st2", is_passing: false, percentage: 35, grade_point: 0 },
      ],
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${BASE}/analytics/summary/export.csv`);
    expect(res.status).toBe(200);
    const rows = parseCsv(await res.text());
    expect(rows[0]).toEqual(["course_code", "course_title", "enrolled", "graded", "passing", "pass_rate", "avg_percentage", "avg_grade_point"]);
    expect(rows).toHaveLength(3); // header + 2 courses
  });

  it("Review Focus 5 — faculty hitting admin export.csv gets 403", async () => {
    const supabase = makeMockSupabase();
    const app = mountAsFaculty(supabase);
    const res = await app.request(`${BASE}/course/c1/analytics/pass-rate/export.csv`);
    expect(res.status).toBe(403);
  });
});
```

`apps/api/src/tests/exports.pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { adminExportsRoute } from "../routes/admin/exports.js";
import { requireRole } from "../middleware/requireRole.js";

function makeMockSupabase(opts: {
  gradesheet?: { id: string; sem_id: string; student_id: string; status: string; sgpa: string | number; total_credits: string | number } | null;
  courseGrades?: unknown[];
  score?: { cgpa: string | number } | null;
  profile?: { roll_number: string; full_name: string } | null;
} = {}): SupabaseClient {
  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {
      select() { return b; }, eq() { return b; }, in() { return b; },
      order() { return b; }, then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
        if (table === "gradesheets") return Promise.resolve({ data: opts.gradesheet ? [opts.gradesheet] : [], error: null }).then(onFulfilled);
        if (table === "course_grades") return Promise.resolve({ data: opts.courseGrades ?? [], error: null }).then(onFulfilled);
        if (table === "scores") return Promise.resolve({ data: opts.score ? [opts.score] : [], error: null }).then(onFulfilled);
        if (table === "student_profiles") return Promise.resolve({ data: opts.profile ? [opts.profile] : [], error: null }).then(onFulfilled);
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { from: (t: string) => builder(t) } as unknown as SupabaseClient;
}

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route("/api/admin/batch/:b/program/:p/sem/:s", adminExportsRoute);
  return app;
}

const BASE = "/api/admin/batch/b1/program/p1/sem/s1";

describe("PDF exports", () => {
  it("GET /student/:studentId/transcript/export.pdf returns a valid PDF when gradesheet is published", async () => {
    const supabase = makeMockSupabase({
      gradesheet: { id: "g1", sem_id: "s1", student_id: "student-1", status: "published", sgpa: "8.50", total_credits: "7" },
      courseGrades: [
        { student_id: "student-1", course_id: "c1", total_obtained: 90, total_max: 100, percentage: 90, grade_label: "A", grade_point: 9, courses: { code: "CS101", title: "Intro", credits: 4 } },
      ],
      score: { cgpa: "8.50" },
      profile: { roll_number: "23BCA001", full_name: "Alice" },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${BASE}/student/student-1/transcript/export.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="transcript-23BCA001-1\.pdf"/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 when gradesheet is not published", async () => {
    const supabase = makeMockSupabase({ gradesheet: null });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${BASE}/student/student-1/transcript/export.pdf`);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/api test exports`
Expected: FAIL — `adminExportsRoute` not found.

- [ ] **Step 3: Implement `adminExportsRoute`**

`apps/api/src/routes/admin/exports.ts`:

```ts
import { Hono, type Context } from "hono";
import {
  toCsv,
  formatZodError,
  topLimitSchema,
  attendanceThresholdSchema,
} from "@mark-matrix/shared";
import {
  getPassRateForCourse,
  getToppersForCourse,
  getAttendanceShortageForCourse,
  getSemSummary,
} from "../../lib/analyticsRepo.js";
import { renderTranscriptPdf } from "../../lib/transcriptPdf.js";
import type { AppEnv } from "../../env.js";

type Ctx = Context<AppEnv>;

const csv = (filename: string, rows: (string | number | null)[][]): Response => {
  const body = toCsv(rows);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
};

async function passRateCsv(c: Ctx): Promise<Response> {
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const r = await getPassRateForCourse(c.get("supabase"), courseId);
  return csv(`pass-rate-${courseId}.csv`, [
    ["course_id", "total", "passing", "rate"],
    [r.courseId, r.total, r.passing, r.rate],
  ]);
}

async function toppersCsv(c: Ctx): Promise<Response> {
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = topLimitSchema.safeParse(c.req.query("limit"));
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows = await getToppersForCourse(c.get("supabase"), courseId, parsed.data);
  return csv(`toppers-${courseId}.csv`, [
    ["roll_number", "total_obtained", "total_max", "percentage", "grade_label", "grade_point"],
    ...rows.map((r) => [r.rollNumber, r.totalObtained, r.totalMax, r.percentage, r.gradeLabel, r.gradePoint]),
  ]);
}

async function attendanceShortageCsv(c: Ctx): Promise<Response> {
  const courseId = c.req.param("courseId");
  if (!courseId) return c.json({ error: "missing_course" }, 400);
  const parsed = attendanceThresholdSchema.safeParse(c.req.query("threshold"));
  if (!parsed.success) {
    return c.json(
      { error: "validation_failed", fields: formatZodError(parsed.error) },
      400,
    );
  }
  const rows = await getAttendanceShortageForCourse(c.get("supabase"), courseId, parsed.data);
  return csv(`attendance-shortage-${courseId}.csv`, [
    ["roll_number", "present_count", "total_sessions", "percentage"],
    ...rows.map((r) => [r.rollNumber, r.presentCount, r.totalSessions, r.percentage]),
  ]);
}

async function summaryCsv(c: Ctx): Promise<Response> {
  const semId = c.req.param("semId");
  if (!semId) return c.json({ error: "missing_sem" }, 400);
  const rows = await getSemSummary(c.get("supabase"), semId);
  return csv(`summary-${semId}.csv`, [
    ["course_code", "course_title", "enrolled", "graded", "passing", "pass_rate", "avg_percentage", "avg_grade_point"],
    ...rows.map((r) => [r.courseCode, r.courseTitle, r.enrolled, r.graded, r.passing, r.passRate, r.avgPercentage, r.avgGradePoint]),
  ]);
}

/** Re-uses the same buildTranscript helper from student/transcript.ts. */
async function transcriptPdfExport(c: Ctx): Promise<Response> {
  const semId = c.req.param("semId");
  const studentId = c.req.param("studentId");
  if (!semId || !studentId) return c.json({ error: "missing_sem_or_student" }, 400);

  // Inline the build to avoid a circular import; keep behaviour the same.
  const { buildTranscriptForExport } = await import("./transcriptExport.js");
  const input = await buildTranscriptForExport(c.get("supabase"), semId, studentId);
  if (!input) return c.json({ error: "not_found" }, 404);

  const bytes = await renderTranscriptPdf(input);
  const filename = `transcript-${input.student.rollNumber || studentId}-${input.semester.number}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const adminExportsRoute = new Hono<AppEnv>()
  .get("/course/:courseId/analytics/pass-rate/export.csv", passRateCsv)
  .get("/course/:courseId/analytics/toppers/export.csv", toppersCsv)
  .get("/course/:courseId/analytics/attendance-shortage/export.csv", attendanceShortageCsv)
  .get("/analytics/summary/export.csv", summaryCsv)
  .get("/student/:studentId/transcript/export.pdf", transcriptPdfExport);
```

- [ ] **Step 4: Create the small `buildTranscriptForExport` helper**

`apps/api/src/routes/admin/transcriptExport.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TranscriptInput } from "../../lib/transcriptPdf.js";

type GradesheetRow = {
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
};

type CourseGradeRow = {
  course_id: string;
  total_obtained: string | number;
  total_max: string | number;
  percentage: string | number;
  grade_label: string;
  grade_point: string | number;
  courses: { code: string; title: string; credits: string | number };
};

/**
 * Same shape as student/transcript.ts `buildTranscript`, but kept in its own
 * file so admin/exports.ts doesn't have to import from a student-scoped file.
 * The behaviour is identical (same SQL, same gating); duplication is small
 * and intentional to keep the student and admin route files independent.
 */
export async function buildTranscriptForExport(
  supabase: SupabaseClient,
  semId: string,
  studentId: string,
): Promise<TranscriptInput | null> {
  const { data: gsRows, error: gsErr } = await supabase
    .from("gradesheets")
    .select("status, sgpa")
    .eq("sem_id", semId)
    .eq("student_id", studentId);
  if (gsErr) throw gsErr;
  const gs = ((gsRows ?? []) as unknown as GradesheetRow[])[0];
  if (!gs || gs.status !== "published") return null;

  const { data: cgRows, error: cgErr } = await supabase
    .from("course_grades")
    .select("course_id, total_obtained, total_max, percentage, grade_label, grade_point, courses!inner(code, title, credits, semester_id)")
    .eq("student_id", studentId)
    .eq("courses.semester_id", semId);
  if (cgErr) throw cgErr;
  const grades = (cgRows ?? []) as unknown as CourseGradeRow[];
  const courses = grades.map((g) => ({
    code: g.courses.code,
    title: g.courses.title,
    credits: Number(g.courses.credits),
    gradeLabel: g.grade_label,
    gradePoint: Number(g.grade_point),
  }));
  const totalCredits = courses.reduce((acc, c) => acc + c.credits, 0);

  const { data: scoreArr, error: scErr } = await supabase
    .from("scores")
    .select("cgpa")
    .eq("student_id", studentId);
  if (scErr) throw scErr;
  const cgpa = Number(((scoreArr ?? []) as unknown as { cgpa: string | number }[])[0]?.cgpa ?? 0);

  const { data: profileArr, error: pErr } = await supabase
    .from("student_profiles")
    .select("roll_number, full_name")
    .eq("user_id", studentId);
  if (pErr) throw pErr;
  const profile = ((profileArr ?? []) as unknown as { roll_number: string; full_name: string }[])[0]
    ?? { roll_number: "", full_name: "" };

  return {
    institutionName: "Mark-Matrix Institute of Technology",
    student: { fullName: profile.full_name, rollNumber: profile.roll_number, programName: "BCA", batchLabel: "" },
    semester: { number: 1 },
    courses,
    sgpa: Number(gs.sgpa ?? 0),
    cgpa,
    totalCredits,
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/api test exports`
Expected: all 6 cases green (4 CSV + 2 PDF).

- [ ] **Step 6: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api typecheck`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/admin/exports.ts \
        apps/api/src/routes/admin/transcriptExport.ts \
        apps/api/src/tests/exports.csv.test.ts \
        apps/api/src/tests/exports.pdf.test.ts
git commit -m "feat(api): admin export routes (CSV analytics + PDF transcript)"
```

---

## Task 13: Mount cycle-7 routers in `apps/api/src/index.ts`

**Files:**
- Modify: `apps/api/src/index.ts` (add 6 `app.route(...)` calls + import statements)

**Interfaces:**
- No new routes; just wire the routers into the existing Hono app.
- The existing `requireRole("admin")` / `requireRole("faculty")` / `requireRole("student")` middlewares gate the prefixes; no new middleware.

- [ ] **Step 1: Add imports**

Open `apps/api/src/index.ts`. Add the following imports near the other `adminMarksLifecycleRoute` / `studentGradesheetRoute` / `adminGradesheetsRoute` imports:

```ts
import { analyticsCourseRoute } from "./routes/analytics/course.js";
import { analyticsSemRoute } from "./routes/analytics/sem.js";
import {
  studentTranscriptRoute,
  adminTranscriptRoute,
} from "./routes/student/transcript.js";
import { adminExportsRoute } from "./routes/admin/exports.js";
```

- [ ] **Step 2: Mount the analytics course route under both prefixes**

Find the existing `app.use("/api/admin/*", requireRole("admin"));` line. After the `adminMarksLifecycleRoute` mount (around line 140), add:

```ts
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/analytics",
  analyticsCourseRoute,
);
```

Find the existing `app.use("/api/faculty/*", requireRole("faculty"));` line. After the `facultyMarksRoute` mount, add:

```ts
app.route(
  "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/analytics",
  analyticsCourseRoute,
);
```

- [ ] **Step 3: Mount the sem analytics route**

After the `adminAnalyticsRoute` mount (admin side), add:

```ts
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/analytics",
  analyticsSemRoute,
);
```

- [ ] **Step 4: Mount the transcript routes**

Find the existing `app.use("/api/student/*", requireRole("student"));` line. After the existing `studentGradesheetRoute` mount, add:

```ts
app.route("/api/student/batch/:batchId/program/:programId/sem/:semId", studentTranscriptRoute);
```

Find the existing `app.use("/api/admin/*", requireRole("admin"));` line. After the existing `adminGradesheetsRoute` mount, add:

```ts
app.route(
  "/api/admin/batch/:batchId/program/:programId/sem/:semId/student/:studentId/transcript",
  adminTranscriptRoute,
);
```

- [ ] **Step 5: Mount the admin exports route**

After the `adminAnalyticsRoute` mount (admin side), add:

```ts
app.route("/api/admin/batch/:batchId/program/:programId/sem/:semId", adminExportsRoute);
```

- [ ] **Step 6: Typecheck + lint + full test sweep**

Run: `pnpm --filter @mark-matrix/api typecheck && pnpm --filter @mark-matrix/api lint && pnpm --filter @mark-matrix/api test`
Expected: green. All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/index.ts
git commit -m "feat(api): mount cycle-7 routers (analytics, transcript, exports)"
```

---

---

## Task 14: Faculty `AnalyticsPage` + tests

**Files:**
- Create: `apps/web/src/pages/faculty/AnalyticsPage.tsx`
- Create: `apps/web/src/tests/AnalyticsPage.test.tsx`

**Interfaces:**
- `AnalyticsPage` — lists the faculty's courses; click a course → per-course analytics panels (pass-rate, toppers, attendance-shortage).
- Read-only: no "Download CSV" buttons in cycle 7 (deferred to cycle 8).

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tests/AnalyticsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route as RRoute, Routes } from "react-router-dom";
import { AnalyticsPage } from "../pages/faculty/AnalyticsPage.js";

// Mock the auth context so the page sees a faculty user.
vi.mock("../auth/AuthContext.js", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "faculty-1", app_metadata: { role: "faculty" } },
    role: "faculty",
    signOut: vi.fn(),
  }),
}));

// Mock fetch — the page calls two endpoints (courses, then per-course analytics).
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

function renderPage(): void {
  render(
    <MemoryRouter initialEntries={["/faculty/analytics"]}>
      <Routes>
        <RRoute path="/faculty/analytics" element={<AnalyticsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AnalyticsPage (faculty)", () => {
  it("renders the course list and a default analytics panel", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ courses: [{ id: "c1", code: "CS101", title: "Intro" }] }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ courseId: "c1", total: 30, passing: 25, rate: 83.33 }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ toppers: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: [] }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("CS101")).toBeInTheDocument());
    expect(screen.getByText("83.33%")).toBeInTheDocument();
    expect(screen.queryByText(/download csv/i)).not.toBeInTheDocument();
  });

  it("switches the active course when the user clicks another course", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        courses: [
          { id: "c1", code: "CS101", title: "Intro" },
          { id: "c2", code: "CS102", title: "Maths" },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText("CS101")).toBeInTheDocument());
    fireEvent.click(screen.getByText("CS102"));
    // The click triggers a new pass-rate fetch for CS102; assert that the
    // second course's analytics URL was hit.
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes("c2/analytics/pass-rate"))).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/web test AnalyticsPage.test.tsx`
Expected: FAIL — `AnalyticsPage.tsx` does not exist.

- [ ] **Step 3: Implement `AnalyticsPage`**

`apps/web/src/pages/faculty/AnalyticsPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface CourseRow { id: string; code: string; title: string; }
interface PassRate { total: number; passing: number; rate: number; }
interface Topper { studentId: string; rollNumber: string; totalObtained: number; totalMax: number; percentage: number; gradeLabel: string; gradePoint: number; }
interface AttendanceRow { studentId: string; rollNumber: string; presentCount: number; totalSessions: number; percentage: number; }

const authedFetch = async (token: string, url: string): Promise<Response> =>
  fetch(url, { headers: { authorization: `Bearer ${token}` } });

export function AnalyticsPage(): JSX.Element {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [courses, setCourses] = useState<CourseRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passRate, setPassRate] = useState<PassRate | null>(null);
  const [toppers, setToppers] = useState<Topper[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  // Load the faculty's courses on mount. The exact endpoint that returns the
  // faculty's courses is the existing faculty-courses endpoint used elsewhere
  // (e.g. FacultyCoursesPage); we reuse that contract.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await authedFetch(token, "/api/faculty/courses");
      if (!res.ok || cancelled) return;
      const data = await res.json() as { courses?: CourseRow[] };
      const list = data.courses ?? [];
      setCourses(list);
      if (list[0]) setActiveId(list[0].id);
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Load analytics for the selected course.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void (async () => {
      const url = ROUTES_CYCLE_2.analyticsPassRate("faculty", "b1", "p1", "s1", activeId);
      const [r1, r2, r3] = await Promise.all([
        authedFetch(token, url),
        authedFetch(token, ROUTES_CYCLE_2.analyticsToppers("faculty", "b1", "p1", "s1", activeId)),
        authedFetch(token, ROUTES_CYCLE_2.analyticsAttendanceShortage("faculty", "b1", "p1", "s1", activeId)),
      ]);
      if (cancelled) return;
      if (r1.ok) setPassRate(await r1.json() as PassRate);
      if (r2.ok) setToppers(((await r2.json() as { toppers: Topper[] }).toppers));
      if (r3.ok) setAttendance(((await r3.json() as { rows: AttendanceRow[] }).rows));
    })();
    return () => { cancelled = true; };
  }, [activeId, token]);

  return (
    <main className="analytics">
      <h1>Analytics</h1>
      <nav className="analytics__courses" aria-label="Course list">
        {courses.map((c) => (
          <button
            key={c.id}
            type="button"
            className={"analytics__course-btn" + (c.id === activeId ? " is-active" : "")}
            onClick={() => setActiveId(c.id)}
          >
            {c.code} — {c.title}
          </button>
        ))}
      </nav>
      <section className="analytics__panel">
        <h2>Pass rate</h2>
        {passRate && (
            <p>{passRate.passing} of {passRate.total} ({passRate.rate.toFixed(2)}%)</p>
          )}
      </section>
      <section className="analytics__panel">
        <h2>Toppers</h2>
        <table>
          <thead><tr><th>Roll</th><th>Total</th><th>%</th><th>Grade</th><th>GP</th></tr></thead>
          <tbody>
            {toppers.map((t) => (
              <tr key={t.studentId}>
                <td>{t.rollNumber}</td>
                <td>{t.totalObtained}/{t.totalMax}</td>
                <td>{t.percentage.toFixed(2)}</td>
                <td>{t.gradeLabel}</td>
                <td>{t.gradePoint.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="analytics__panel">
        <h2>Attendance shortage</h2>
        <table>
          <thead><tr><th>Roll</th><th>Present</th><th>Sessions</th><th>%</th></tr></thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.studentId}>
                <td>{a.rollNumber}</td>
                <td>{a.presentCount}</td>
                <td>{a.totalSessions}</td>
                <td>{a.percentage.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test AnalyticsPage.test.tsx`
Expected: 2 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/web lint && pnpm --filter @mark-matrix/web typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/faculty/AnalyticsPage.tsx apps/web/src/tests/AnalyticsPage.test.tsx
git commit -m "feat(web): faculty analytics page (read-only panels)"
```

---

## Task 15: Admin `AnalyticsDashboardPage` + tests

**Files:**
- Create: `apps/web/src/pages/admin/AnalyticsDashboardPage.tsx`
- Create: `apps/web/src/tests/AnalyticsDashboardPage.test.tsx`

**Interfaces:**
- `AnalyticsDashboardPage` — URL params `:batchId`, `:programId`, `:semId`. Renders:
  1. Cross-course summary table (course code, enrolled, graded, passing, pass rate, avg GP)
  2. Tabs for pass-rate / toppers / attendance-shortage for the currently selected course (default = first in the summary)
  3. "Download CSV" buttons on each panel that link to the admin export endpoint

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tests/AnalyticsDashboardPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route as RRoute, Routes } from "react-router-dom";
import { AnalyticsDashboardPage } from "../pages/admin/AnalyticsDashboardPage.js";

vi.mock("../auth/AuthContext.js", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
    user: { id: "admin-1", app_metadata: { role: "admin" } },
    role: "admin",
    signOut: vi.fn(),
  }),
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock;
});

function renderAtPath(): void {
  render(
    <MemoryRouter initialEntries={["/admin/analytics/b1/p1/s1"]}>
      <Routes>
        <RRoute path="/admin/analytics/:batchId/:programId/:semId" element={<AnalyticsDashboardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AnalyticsDashboardPage (admin)", () => {
  it("renders the cross-course summary table and a default analytics panel", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({
        courses: [
          { courseId: "c1", courseCode: "CS101", courseTitle: "Intro", enrolled: 50, graded: 48, passing: 40, passRate: 83.33, avgPercentage: 72, avgGradePoint: 7.5 },
          { courseId: "c2", courseCode: "CS102", courseTitle: "Maths", enrolled: 50, graded: 50, passing: 35, passRate: 70, avgPercentage: 65, avgGradePoint: 6.8 },
        ],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ courseId: "c1", total: 48, passing: 40, rate: 83.33 }), {
        status: 200, headers: { "content-type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ toppers: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ rows: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    renderAtPath();
    await waitFor(() => expect(screen.getByText("CS101")).toBeInTheDocument());
    expect(screen.getByText("83.33%")).toBeInTheDocument();
    // The Download CSV link is present.
    const csvLinks = screen.getAllByRole("link", { name: /download csv/i });
    expect(csvLinks.length).toBeGreaterThan(0);
    expect(csvLinks[0]!.getAttribute("href")).toMatch(/analytics\/pass-rate\/export\.csv/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/web test AnalyticsDashboardPage.test.tsx`
Expected: FAIL — page does not exist.

- [ ] **Step 3: Implement `AnalyticsDashboardPage`**

`apps/web/src/pages/admin/AnalyticsDashboardPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext.js";
import { ROUTES_CYCLE_2 } from "@mark-matrix/shared";

interface SummaryRow { courseId: string; courseCode: string; courseTitle: string; enrolled: number; graded: number; passing: number; passRate: number; avgPercentage: number; avgGradePoint: number; }
interface PassRate { total: number; passing: number; rate: number; }
interface Topper { studentId: string; rollNumber: string; totalObtained: number; totalMax: number; percentage: number; gradeLabel: string; gradePoint: number; }
interface AttendanceRow { studentId: string; rollNumber: string; presentCount: number; totalSessions: number; percentage: number; }

const authedFetch = async (token: string, url: string): Promise<Response> =>
  fetch(url, { headers: { authorization: `Bearer ${token}` } });

export function AnalyticsDashboardPage(): JSX.Element {
  const params = useParams<{ batchId: string; programId: string; semId: string }>();
  const { batchId = "b1", programId = "p1", semId = "s1" } = params;
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [passRate, setPassRate] = useState<PassRate | null>(null);
  const [toppers, setToppers] = useState<Topper[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  // Load summary.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = ROUTES_CYCLE_2.analyticsSemSummary("admin", batchId, programId, semId);
      const res = await authedFetch(token, url);
      if (!res.ok || cancelled) return;
      const data = await res.json() as { courses: SummaryRow[] };
      setSummary(data.courses);
      if (data.courses[0]) setActiveId(data.courses[0].courseId);
    })();
    return () => { cancelled = true; };
  }, [batchId, programId, semId, token]);

  // Load per-course analytics.
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void (async () => {
      const [r1, r2, r3] = await Promise.all([
        authedFetch(token, ROUTES_CYCLE_2.analyticsPassRate("admin", batchId, programId, semId, activeId)),
        authedFetch(token, ROUTES_CYCLE_2.analyticsToppers("admin", batchId, programId, semId, activeId)),
        authedFetch(token, ROUTES_CYCLE_2.analyticsAttendanceShortage("admin", batchId, programId, semId, activeId)),
      ]);
      if (cancelled) return;
      if (r1.ok) setPassRate(await r1.json() as PassRate);
      if (r2.ok) setToppers(((await r2.json() as { toppers: Topper[] }).toppers));
      if (r3.ok) setAttendance(((await r3.json() as { rows: AttendanceRow[] }).rows));
    })();
    return () => { cancelled = true; };
  }, [activeId, batchId, programId, semId, token]);

  const csvHref = (kind: "pass-rate" | "toppers" | "attendance-shortage" | "summary"): string => {
    const base = `/api/admin/batch/${batchId}/program/${programId}/sem/${semId}`;
    if (kind === "summary") return `${base}/analytics/summary/export.csv`;
    return `${base}/course/${activeId ?? "c0"}/analytics/${kind}/export.csv`;
  };

  return (
    <main className="analytics-dashboard">
      <h1>Analytics — Semester {semId}</h1>
      <section className="analytics-dashboard__summary">
        <h2>Summary</h2>
        <table>
          <thead>
            <tr>
              <th>Course</th><th>Enrolled</th><th>Graded</th>
              <th>Passing</th><th>Pass rate</th><th>Avg GP</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((s) => (
              <tr key={s.courseId} className={s.courseId === activeId ? "is-active" : ""} onClick={() => setActiveId(s.courseId)}>
                <td>{s.courseCode} — {s.courseTitle}</td>
                <td>{s.enrolled}</td>
                <td>{s.graded}</td>
                <td>{s.passing}</td>
                <td>{s.passRate.toFixed(2)}%</td>
                <td>{s.avgGradePoint.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={csvHref("summary")} download>Download CSV</a>
      </section>
      <section className="analytics-dashboard__panel">
        <h2>Pass rate</h2>
        {passRate && <p>{passRate.passing} of {passRate.total} ({passRate.rate.toFixed(2)}%)</p>}
        <a href={csvHref("pass-rate")} download>Download CSV</a>
      </section>
      <section className="analytics-dashboard__panel">
        <h2>Toppers</h2>
        <table>
          <thead><tr><th>Roll</th><th>Total</th><th>%</th><th>Grade</th><th>GP</th></tr></thead>
          <tbody>
            {toppers.map((t) => (
              <tr key={t.studentId}>
                <td>{t.rollNumber}</td><td>{t.totalObtained}/{t.totalMax}</td>
                <td>{t.percentage.toFixed(2)}</td><td>{t.gradeLabel}</td>
                <td>{t.gradePoint.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={csvHref("toppers")} download>Download CSV</a>
      </section>
      <section className="analytics-dashboard__panel">
        <h2>Attendance shortage</h2>
        <table>
          <thead><tr><th>Roll</th><th>Present</th><th>Sessions</th><th>%</th></tr></thead>
          <tbody>
            {attendance.map((a) => (
              <tr key={a.studentId}>
                <td>{a.rollNumber}</td><td>{a.presentCount}</td>
                <td>{a.totalSessions}</td><td>{a.percentage.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <a href={csvHref("attendance-shortage")} download>Download CSV</a>
      </section>
    </main>
  );
}
```

Note: the `csvHref` helper does string surgery to swap the trailing `/pass-rate` (etc.) for `/export.csv`. This is intentional — the API routes share a `/api/admin/.../analytics/...` prefix and the `export.csv` suffix is appended to the existing analytics path.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test AnalyticsDashboardPage.test.tsx`
Expected: 1 case green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/web lint && pnpm --filter @mark-matrix/web typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/admin/AnalyticsDashboardPage.tsx apps/web/src/tests/AnalyticsDashboardPage.test.tsx
git commit -m "feat(web): admin analytics dashboard with CSV download links"
```

---

## Task 16: `DownloadTranscriptButton` component + tests

**Files:**
- Create: `apps/web/src/components/DownloadTranscriptButton.tsx`
- Create: `apps/web/src/tests/DownloadTranscriptButton.test.tsx`

**Interfaces:**
- `DownloadTranscriptButton({ url, label, disabled })` — fetches the URL, gets a blob, triggers an `<a download>` click. Disabled state shows a placeholder.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/tests/DownloadTranscriptButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DownloadTranscriptButton } from "../components/DownloadTranscriptButton.js";

const fetchMock = vi.fn();
const createObjectURL = vi.fn(() => "blob:test");
const revokeObjectURL = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  global.fetch = fetchMock;
  // jsdom doesn't implement URL.createObjectURL; install stubs.
  if (!("createObjectURL" in URL)) {
    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });
  }
});

describe("DownloadTranscriptButton", () => {
  it("renders disabled when `disabled` is true", () => {
    render(<DownloadTranscriptButton url="/api/..." disabled label="Download Transcript" />);
    const btn = screen.getByRole("button", { name: /download transcript/i });
    expect(btn).toBeDisabled();
  });

  it("calls fetch with the URL when clicked and triggers a download", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), {
        status: 200, headers: { "content-type": "application/pdf" },
      }),
    );
    // jsdom anchor.click is a no-op; spy to verify it was called.
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<DownloadTranscriptButton url="/api/student/b1/p1/s1/transcript" label="Download Transcript" />);
    fireEvent.click(screen.getByRole("button", { name: /download transcript/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/student/b1/p1/s1/transcript", expect.any(Object)));
    expect(clickSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @mark-matrix/web test DownloadTranscriptButton.test.tsx`
Expected: FAIL — `DownloadTranscriptButton.tsx` does not exist.

- [ ] **Step 3: Implement `DownloadTranscriptButton`**

`apps/web/src/components/DownloadTranscriptButton.tsx`:

```tsx
import { useState } from "react";
import { useAuth } from "../auth/AuthContext.js";

interface Props {
  url: string;
  label: string;
  disabled?: boolean;
}

export function DownloadTranscriptButton({ url, label, disabled = false }: Props): JSX.Element {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = async (): Promise<void> => {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${session?.access_token ?? ""}` } });
      if (!res.ok) {
        setError(`Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = label.replace(/[^A-Za-z0-9._-]+/g, "_");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="download-transcript">
      <button type="button" onClick={onClick} disabled={disabled || busy}>
        {busy ? "Downloading…" : label}
      </button>
      {error && <span className="download-transcript__error">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test DownloadTranscriptButton.test.tsx`
Expected: 2 cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/web lint && pnpm --filter @mark-matrix/web typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/DownloadTranscriptButton.tsx apps/web/src/tests/DownloadTranscriptButton.test.tsx
git commit -m "feat(web): DownloadTranscriptButton component (PDF fetch + blob download)"
```

---

## Task 17: Wire cycle-7 routes into `App.tsx` + `navConfig.ts`

**Files:**
- Modify: `apps/web/src/App.tsx` (add 2 new `<Route>` entries)
- Modify: `apps/web/src/shell/navConfig.ts` (add 2 nav items)

**Interfaces:**
- Routes:
  - `admin/analytics/:batchId/:programId/:semId` → `AnalyticsDashboardPage`
  - `faculty/analytics` → `AnalyticsPage`
- Nav items: admin `Analytics` → `/admin/analytics/b1/p1/s1`; faculty `Analytics` → `/faculty/analytics`.

- [ ] **Step 1: Add imports to `App.tsx`**

Open `apps/web/src/App.tsx`. Add near the other `pages/admin` imports:

```ts
import { AnalyticsDashboardPage } from "./pages/admin/AnalyticsDashboardPage.js";
```

And near the other `pages/faculty` imports:

```ts
import { AnalyticsPage } from "./pages/faculty/AnalyticsPage.js";
```

- [ ] **Step 2: Add routes**

Add two new `<Route>` entries (one admin, one faculty) before the closing `</Route>` of the protected layout:

```tsx
<Route
  path="admin/analytics/:batchId/:programId/:semId"
  element={
    <ProtectedRoute roles={["admin"]}>
      <AnalyticsDashboardPage />
    </ProtectedRoute>
  }
/>
<Route
  path="faculty/analytics"
  element={
    <ProtectedRoute roles={["faculty"]}>
      <AnalyticsPage />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 3: Add nav items to `navConfig.ts`**

Open `apps/web/src/shell/navConfig.ts` and append inside the `NAV_ITEMS` array:

```ts
  { label: "Analytics",  to: "/admin/analytics/b1/p1/s1",      roles: ["admin"] },
  { label: "Analytics",  to: "/faculty/analytics",              roles: ["faculty"] },
```

(Place them near the other `Results`/`Gradesheets`/`My Courses` items for visual grouping.)

- [ ] **Step 4: Lint + typecheck + test (full sweep)**

Run: `pnpm --filter @mark-matrix/web lint && pnpm --filter @mark-matrix/web typecheck && pnpm --filter @mark-matrix/web test`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx apps/web/src/shell/navConfig.ts
git commit -m "feat(web): cycle-7 routes + nav items (analytics)"
```

---

## Task 18: Mount `DownloadTranscriptButton` on student + admin gradesheet views

**Files:**
- Modify: `apps/web/src/pages/student/MyGradesheetPage.tsx` (mount button when published)
- Modify: `apps/web/src/pages/admin/GradesheetAdminPage.tsx` (mount button per student row)

**Interfaces:**
- Student page: button visible only when `g.status === 'published'`. URL: `ROUTES_CYCLE_2.studentTranscript("student", batchId, programId, semId)`.
- Admin page: button per student row. URL: `ROUTES_CYCLE_2.studentTranscript("admin", batchId, programId, semId, studentId)`.

- [ ] **Step 1: Update `MyGradesheetPage`**

Open `apps/web/src/pages/student/MyGradesheetPage.tsx`. Add:

```tsx
import { DownloadTranscriptButton } from "../../components/DownloadTranscriptButton.js";
```

And inside the JSX, just after the `<dl>` block (and only inside the `g` truthy branch), add:

```tsx
      <DownloadTranscriptButton
        url={ROUTES_CYCLE_2.studentTranscript("student", batchId, programId, semId)}
        label="Download Transcript"
        disabled={g.status !== "published"}
      />
```

- [ ] **Step 2: Update `GradesheetAdminPage`**

Open `apps/web/src/pages/admin/GradesheetAdminPage.tsx`. Add:

```tsx
import { DownloadTranscriptButton } from "../../components/DownloadTranscriptButton.js";
```

Find the per-student table (or list) where each student's SGPA is rendered, and add a new `<td>` cell (or row column) that mounts the button:

```tsx
<DownloadTranscriptButton
  url={ROUTES_CYCLE_2.studentTranscript("admin", batchId, programId, semId, studentId)}
  label="Download"
  disabled={status !== "published"}
/>
```

(Adapt the field names to match the existing shape — `studentId` and `status` come from the per-row data already loaded by this page.)

- [ ] **Step 3: Update tests**

Open `apps/web/src/tests/MyGradesheetPage.test.tsx` and append a case:

```tsx
it("renders the download transcript button when gradesheet is published", async () => {
  // ... existing setup with status='published' ...
  // After waiting for the page to render, the button should NOT be disabled.
  await waitFor(() => expect(screen.getByRole("button", { name: /download transcript/i })).toBeEnabled());
});

it("does not render the download transcript button when gradesheet is null", async () => {
  // ... existing setup that yields the "not available" state ...
  expect(screen.queryByRole("button", { name: /download transcript/i })).not.toBeInTheDocument();
});
```

(The exact setup lines depend on the existing test file — preserve the existing structure; only append the new cases.)

Open `apps/web/src/tests/GradesheetAdminPage.test.tsx` and append a case that verifies the button is present per row and disabled when status != published.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @mark-matrix/web test MyGradesheetPage GradesheetAdminPage`
Expected: all cases green.

- [ ] **Step 5: Lint + typecheck**

Run: `pnpm --filter @mark-matrix/web lint && pnpm --filter @mark-matrix/web typecheck`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/pages/student/MyGradesheetPage.tsx \
        apps/web/src/pages/admin/GradesheetAdminPage.tsx \
        apps/web/src/tests/MyGradesheetPage.test.tsx \
        apps/web/src/tests/GradesheetAdminPage.test.tsx
git commit -m "feat(web): mount DownloadTranscriptButton on student + admin gradesheet views"
```

---

## Final Task: Workspace-wide verification

**Files:** none.

**Interfaces:**
- Run the canonical pre-commit sweep across all three workspaces.

- [ ] **Step 1: Lint everything**

Run: `pnpm lint`
Expected: green across `@mark-matrix/shared`, `@mark-matrix/api`, `@mark-matrix/web`.

- [ ] **Step 2: Typecheck everything**

Run: `pnpm typecheck`
Expected: green across the same.

- [ ] **Step 3: Test everything**

Run: `pnpm test`
Expected: green. New test files:
  - `packages/shared/src/analytics.test.ts`, `csv.test.ts` (added `toCsv`)
  - `apps/api/src/tests/analyticsRepo.test.ts`, `analytics.course.test.ts`, `analytics.course.rbac.test.ts`, `analytics.sem.test.ts`, `transcript.routes.test.ts`, `transcriptPdf.test.ts`, `exports.csv.test.ts`, `exports.pdf.test.ts`
  - `apps/web/src/tests/AnalyticsPage.test.tsx`, `AnalyticsDashboardPage.test.tsx`, `DownloadTranscriptButton.test.tsx`, `MyGradesheetPage.test.tsx` (extended), `GradesheetAdminPage.test.tsx` (extended)

- [ ] **Step 4: Confirm zero regressions in cycle-6 surfaces**

Specifically run the cycle-6 test groups (they are tagged by directory and run as part of the full sweep):

```bash
pnpm --filter @mark-matrix/api test results
pnpm --filter @mark-matrix/api test gradesheets
pnpm --filter @mark-matrix/api test marksLifecycle
```

All should be green — the only cycle-6 change was plumbing `is_passing` through `upsertCourseGrade` (Task 5+6), which the cycle-5 grade tests already exercise.

- [ ] **Step 5: Final commit (if any leftover from the sweep)**

If `pnpm lint` or `pnpm typecheck` produced auto-fixes that were applied (e.g. eslint --fix), commit them:

```bash
git status   # if anything modified
git add -A   # only the files the sweep touched
git commit -m "chore: lint/format fixes from cycle-7 sweep"
```

- [ ] **Step 6: Report**

At this point the cycle-7 work is complete. Create the report described in the task brief by running `git log --oneline main ^HEAD~18` (or whatever count of new commits is on the branch) and grouping the commits by topic:

1. **Migrations** — 1 commit (`feat(db): course_grades.is_passing + index + backfill`)
2. **Shared package** — 3 commits (csv writer, analytics helpers, route builders)
3. **API** — multiple commits (cycle-5 is_passing plumbing, analyticsRepo, analytics routes, transcript PDF, transcript routes, exports routes, mount)
4. **Frontend** — multiple commits (faculty analytics, admin analytics, download button, route wiring, page mounting)

Then run `pnpm test` one last time and paste the green summary into the report.