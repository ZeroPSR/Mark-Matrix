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