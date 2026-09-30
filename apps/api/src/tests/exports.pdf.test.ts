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