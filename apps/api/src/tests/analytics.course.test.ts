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
    // The same param names the real app mounts this with — see
    // apps/api/src/index.ts. A test that mounts it differently hides a
    // mismatch between the handler and the mount.
    "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/analytics",
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