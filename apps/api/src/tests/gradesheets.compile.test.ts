import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGradesheetsRoute } from "../routes/admin/gradesheets.js";

/**
 * The compile route queries four tables: courses, marks, student_enrollments,
 * course_grades, and gradesheets. The mock dispatches on table name and
 * exposes a `configure(opts)` so each test can pick the response shape.
 */
function makeMockSupabase(opts: {
  courses?: { id: string; code: string; semester_id: string; credits: number }[];
  marksNotLockedCounts?: Record<string, number>; // courseId -> count of non-locked rows
  enrollments?: { student_id: string }[];
  courseGrades?: { course_id: string; grade_point: number; courses: { semester_id: string } }[];
} = {}): { client: SupabaseClient; calls: { from: string[] } } {
  const courses = opts.courses ?? [
    { id: "c1", code: "CS101", semester_id: "s1", credits: 4 },
    { id: "c2", code: "CS102", semester_id: "s1", credits: 3 },
  ];
  const marksNotLockedCounts = opts.marksNotLockedCounts ?? {};
  const enrollments = opts.enrollments ?? [
    { student_id: "student-1" },
    { student_id: "student-2" },
  ];
  const courseGrades = opts.courseGrades ?? [
    { course_id: "c1", grade_point: 9, courses: { semester_id: "s1" } },
    { course_id: "c2", grade_point: 8, courses: { semester_id: "s1" } },
  ];
  const calls = { from: [] as string[] };

  const builder = (table: string): unknown => {
    calls.from.push(table);
    const eqFilters: { col: string; val: unknown }[] = [];
    const b: Record<string, unknown> = {
      select() {
        return b;
      },
      eq(col: string, val: unknown) {
        eqFilters.push({ col, val });
        return b;
      },
      neq() {
        return b;
      },
      upsert() {
        return Promise.resolve({ data: null, error: null });
      },
      order() {
        return b;
      },
      in() {
        return b;
      },
      async then<T, R>(
        onFulfilled: (v: unknown) => T,
        onRejected?: (e: unknown) => R,
      ): Promise<T | R> {
        if (table === "courses") {
          return Promise.resolve({ data: courses, error: null }).then(onFulfilled, onRejected);
        }
        if (table === "marks" && eqFilters.some((f) => f.col === "course_id")) {
          const id = eqFilters.find((f) => f.col === "course_id")!.val as string;
          const n = marksNotLockedCounts[id] ?? 0;
          // count mode: select("id", { count: "exact", head: true })
          if (n > 0) {
            return Promise.resolve({ count: n, error: null }).then(onFulfilled, onRejected);
          }
          return Promise.resolve({ count: 0, error: null }).then(onFulfilled, onRejected);
        }
        if (table === "student_enrollments") {
          return Promise.resolve({ data: enrollments, error: null }).then(onFulfilled, onRejected);
        }
        if (table === "course_grades") {
          return Promise.resolve({ data: courseGrades, error: null }).then(onFulfilled, onRejected);
        }
        if (table === "gradesheets") {
          // Recompute CGPA path: pulls compiled+locked+published rows.
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }
        if (table === "scores") {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      },
    };
    return b;
  };
  return { client: { from: (t: string) => builder(t) } as unknown as SupabaseClient, calls };
}

function mountAsAdmin(supabase: SupabaseClient, userId = "admin-1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", "admin");
    await next();
  });
  app.route(
    "/api/admin/batch/:batchId/program/:programId/sem/:semId/gradesheet",
    adminGradesheetsRoute,
  );
  return app;
}

const URL = "/api/admin/batch/b1/program/p1/sem/s1/gradesheet";

describe("gradesheets compile", () => {
  beforeEach(() => {});

  it("returns 422 incomplete_sem when at least one course has non-locked marks", async () => {
    const { client } = makeMockSupabase({ marksNotLockedCounts: { c2: 3 } });
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/compile`, { method: "POST", body: "{}" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as {
      error: string;
      incompleteCourses: { courseId: string; courseCode: string }[];
    };
    expect(body.error).toBe("incomplete_sem");
    expect(body.incompleteCourses.some((c) => c.courseId === "c2" && c.courseCode === "CS102")).toBe(true);
  });

  it("returns 200 with compiled=2 when every course's marks are locked", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/compile`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      compiled: number;
      incompleteCourses: unknown[];
      students: {
        studentId: string;
        sgpa: number;
        courseCount: number;
        totalCredits: number;
      }[];
    };
    expect(body.compiled).toBe(2);
    expect(body.incompleteCourses).toHaveLength(0);
    expect(body.students).toHaveLength(2);
    // credits 4 + 3 = 7; grade points 9 + 8 = 17; sgpa = 17/7 = 2.43 (rounded)
    expect(body.students[0]!.totalCredits).toBe(7);
    expect(body.students[0]!.courseCount).toBe(2);
  });

  it("compile is idempotent — running twice does not duplicate rows (upsert on sem_id,student_id)", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const r1 = await app.request(`${URL}/compile`, { method: "POST", body: "{}" });
    expect(r1.status).toBe(200);
    const r2 = await app.request(`${URL}/compile`, { method: "POST", body: "{}" });
    expect(r2.status).toBe(200);
    const body2 = (await r2.json()) as { compiled: number; students: unknown[] };
    expect(body2.compiled).toBe(2);
    expect(body2.students).toHaveLength(2); // not 4
  });
});
