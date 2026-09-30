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
    expect(rows).toHaveLength(3);
  });

  it("Review Focus 5 — faculty hitting admin export.csv gets 403", async () => {
    const supabase = makeMockSupabase();
    const app = mountAsFaculty(supabase);
    const res = await app.request(`${BASE}/course/c1/analytics/pass-rate/export.csv`);
    expect(res.status).toBe(403);
  });
});