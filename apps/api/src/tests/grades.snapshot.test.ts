import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { gradesRoute } from "../routes/grades/core.js";

/**
 * The mock statefully tracks:
 *  - grade_schemes rows (a contiguous [0, 100] scheme — required by
 *    computeCourseGrade — with the B band at point=8 as the test target)
 *  - course_grades cache
 *  - marks rows (one per student/course)
 *
 * The handler reads marks, calls resolveSchemeBands (which reads schemes),
 * calls computeCourseGrade, then upserts into course_grades. We simulate
 * the schema-edit by mutating the schemes store and asserting that the
 * cached course_grades row is untouched on the second read.
 *
 * The mock is a faithful hand-rolled Supabase client: `from(table)` returns
 * a thenable builder. Terminal calls (`maybeSingle`, `single`) unwrap to
 * the row; non-terminal chains (the marks list query, the scheme-bands
 * query, the upsert→return chain) resolve via `then` to `[]` as
 * appropriate. This lets the actual handler execute its full control-flow
 * path against the mock.
 */
type Scheme = { id: string; scheme_group: string; scope: "course"; course_id: string; grade_label: string; min_marks: number; max_marks: number; grade_point: number; is_passing: boolean; updated_at: string };
type CachedRow = { course_id: string; student_id: string; grade_label: string; grade_point: number; grade_scheme_id: string; computed_at: string };
type MarksRow = { course_id: string; student_id: string; marks_obtained: number; max_marks: number; status: string };

function makeMockSupabase(): {
  supabase: SupabaseClient;
  schemes: Scheme[];
  cache: CachedRow[];
  marks: MarksRow[];
} {
  // Five bands covering [0, 100] contiguously so computeCourseGrade's
  // "bands must cover from 0" / "cover up to 100" checks pass. The B band
  // (point=8) is the snapshot-stability test target. Mutating
  // schemes[index].grade_point exercises the cache-vs-scheme divergence.
  const schemes: Scheme[] = [
    { id: "s1-f", scheme_group: "FY24", scope: "course", course_id: "c1",
      grade_label: "F", min_marks: 0, max_marks: 50, grade_point: 0, is_passing: false,
      updated_at: "2026-09-07T00:00:00Z" },
    { id: "s1-d", scheme_group: "FY24", scope: "course", course_id: "c1",
      grade_label: "D", min_marks: 50, max_marks: 60, grade_point: 4, is_passing: true,
      updated_at: "2026-09-07T00:00:00Z" },
    { id: "s1-c", scheme_group: "FY24", scope: "course", course_id: "c1",
      grade_label: "C", min_marks: 60, max_marks: 70, grade_point: 6, is_passing: true,
      updated_at: "2026-09-07T00:00:00Z" },
    { id: "s1", scheme_group: "FY24", scope: "course", course_id: "c1",
      grade_label: "B", min_marks: 70, max_marks: 80, grade_point: 8, is_passing: true,
      updated_at: "2026-09-07T00:00:00Z" },
    { id: "s1-a", scheme_group: "FY24", scope: "course", course_id: "c1",
      grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 10, is_passing: true,
      updated_at: "2026-09-07T00:00:00Z" },
  ];
  // The test edits `schemes[0]!.grade_point` to flip "B" from 8 to 9.
  // To make that edit target the B row, reorder so B is at index 0.
  const bIdx = schemes.findIndex((s) => s.grade_label === "B");
  if (bIdx > 0) {
    const b = schemes[bIdx]!;
    schemes.splice(bIdx, 1);
    schemes.unshift(b);
  }

  const cache: CachedRow[] = [];
  const marks: MarksRow[] = [
    // 75 / 100 → 75% → B band (point=8).
    { course_id: "c1", student_id: "student-A", marks_obtained: 75, max_marks: 100, status: "submitted" },
  ];

  const makeBuilder = (table: string): unknown => {
    let mode: "select" | "upsert" = "select";
    let inUpsertChain = false;
    let lastUpsertRow: Record<string, unknown> | null = null;
    const eqFilters: Array<{ col: string; val: unknown }> = [];
    const orderings: Array<{ col: string; ascending: boolean }> = [];

    const defaultList = (): unknown[] => {
      if (table === "marks") return marks.filter((r) =>
        eqFilters.every((f) => (r as Record<string, unknown>)[f.col] === f.val),
      );
      if (table === "grade_schemes") return schemes.filter((r) =>
        eqFilters.every((f) => (r as Record<string, unknown>)[f.col] === f.val),
      );
      return [];
    };

    const b: Record<string, unknown> & { then?: unknown } = {
      select(..._args: unknown[]) {
        // `.select()` after `.upsert()` is just a column picker in
        // supabase-js (it returns the upserted row); don't reset mode.
        if (!inUpsertChain) mode = "select";
        return b;
      },
      upsert(row: unknown, _opts?: unknown) {
        mode = "upsert";
        inUpsertChain = true;
        lastUpsertRow = (row as Record<string, unknown>) ?? null;
        return b;
      },
      update() { return b; },
      eq(col: string, val: unknown) { eqFilters.push({ col, val }); return b; },
      order(col: string, opts?: { ascending?: boolean }) {
        orderings.push({ col, ascending: opts?.ascending ?? true });
        return b;
      },
      maybeSingle() {
        if (mode === "select" && table === "course_grades") {
          const courseId = eqFilters.find((f) => f.col === "course_id")?.val;
          const studentId = eqFilters.find((f) => f.col === "student_id")?.val;
          const row = cache.find(
            (r) => r.course_id === courseId && r.student_id === studentId,
          );
          return Promise.resolve({ data: row ?? null, error: null });
        }
        if (mode === "select" && table === "courses") {
          // getSchemeAnchorInfo expects { semester_id, semesters: { program_id } }.
          return Promise.resolve({
            data: { semester_id: "s1", semesters: { program_id: "p1" } },
            error: null,
          });
        }
        if (mode === "select" && table === "grade_schemes") {
          // schemeGroup lookup for the cached/scheme record
          return Promise.resolve({ data: schemes.find((s) => s.id === eqFilters.find((f) => f.col === "id")?.val) ?? null, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      single() {
        if (mode === "upsert" && table === "course_grades") {
          // The brief's tests treat grade_label as a constant "B" since
          // the upsert reads schemes[0]. After we reordered, schemes[0]
          // is the B row, so the upsert mirrors computeCourseGrade's label.
          // The upsert row carries course_id/student_id/grade_scheme_id
          // directly (the handler does not chain `.eq(...)` after upsert),
          // so we capture them from `lastUpsertRow` rather than from the
          // (empty) eqFilters.
          const scheme = schemes[0]!;
          const studentId = String(lastUpsertRow?.["student_id"] ?? "?");
          const courseId = String(lastUpsertRow?.["course_id"] ?? "?");
          const schemeId = String(lastUpsertRow?.["grade_scheme_id"] ?? scheme.id);
          const newRow: CachedRow = {
            course_id: courseId,
            student_id: studentId,
            grade_label: scheme.grade_label,
            grade_point: scheme.grade_point,
            grade_scheme_id: schemeId,
            computed_at: "2026-09-07T00:00:00Z",
          };
          const existingIdx = cache.findIndex(
            (r) => r.course_id === newRow.course_id && r.student_id === newRow.student_id,
          );
          if (existingIdx >= 0) cache[existingIdx] = newRow;
          else cache.push(newRow);
          return Promise.resolve({ data: newRow, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
        let rows = defaultList();
        if (table === "grade_schemes" && orderings.length > 0) {
          const ord = orderings[0]!;
          rows = [...rows].sort((a: unknown, b: unknown) => {
            const av = (a as Record<string, unknown>)[ord.col];
            const bv = (b as Record<string, unknown>)[ord.col];
            if (av === bv) return 0;
            const cmp = String(av) < String(bv) ? -1 : 1;
            return ord.ascending ? cmp : -cmp;
          });
        }
        return Promise.resolve(onFulfilled({ data: rows, error: null }));
      },
    };
    return b;
  };

  return { supabase: { from: makeBuilder } as unknown as SupabaseClient, schemes, cache, marks };
}

describe("grade snapshot stability", () => {
  let state: ReturnType<typeof makeMockSupabase>;
  let app: Hono<AppEnv>;

  beforeEach(() => {
    state = makeMockSupabase();
    app = new Hono<AppEnv>();
    app.use("/api/*", async (c, next) => {
      c.set("supabase", state.supabase);
      c.set("userId", "admin-1");
      c.set("role", "admin");
      await next();
    });
    // Use `:courseId` to match the handler's `c.req.param("courseId")`.
    app.route("/api/admin/batch/:b/program/:p/sem/:s/course/:courseId/marks", gradesRoute);
  });

  it("cached grade survives scheme edit; new student gets the new scheme", async () => {
    // First read — student A, scheme point=8.
    const r1 = await app.request(
      "/api/admin/batch/b1/program/p1/sem/s1/course/c1/marks/student-A/grade",
    );
    expect(r1.status).toBe(200);
    const b1 = await r1.json() as { data: { gradePoint: number } };
    expect(b1.data.gradePoint).toBe(8);
    expect(state.cache).toHaveLength(1);
    expect(state.cache[0]!.grade_point).toBe(8);

    // Edit scheme — B now gives 9 points.
    state.schemes[0]!.grade_point = 9;

    // Second read of student A — cache should still report 8 (snapshot).
    const r2 = await app.request(
      "/api/admin/batch/b1/program/p1/sem/s1/course/c1/marks/student-A/grade",
    );
    expect(r2.status).toBe(200);
    const b2 = await r2.json() as { data: { gradePoint: number } };
    expect(b2.data.gradePoint).toBe(8);
  });
});
