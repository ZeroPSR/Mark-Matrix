import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { studentTranscriptRoute } from "../routes/student/transcript.js";

type DbRow = {
  id: string;
  sem_id: string;
  student_id: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
  total_credits: string | number | null;
};

function makeMockSupabase(opts: {
  gradesheet?: DbRow | null;
  courseGrades?: { student_id: string; course_id: string; total_obtained: string | number; total_max: string | number; percentage: string | number; grade_label: string; grade_point: string | number; courses: { code: string; title: string; credits: string | number } }[];
  score?: { cgpa: string | number } | null;
  profile?: { roll_number: string; full_name: string } | null;
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