import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { studentGradesheetRoute } from "../routes/student/gradesheet.js";

type DbRow = {
  id: string;
  sem_id: string;
  student_id: string;
  status: "draft" | "compiled" | "locked" | "published";
  sgpa: string | number | null;
  total_credits: string | number | null;
  course_count: number | null;
  compiled_at: string | null;
  compiled_by: string | null;
  locked_by: string | null;
  locked_at: string | null;
  published_by: string | null;
  published_at: string | null;
  unlock_reason: string | null;
  unlocked_by: string | null;
  unlocked_at: string | null;
};

function makeMockSupabase(opts: {
  row?: DbRow | null;
  // When set, throws a PGRST116-style not-found error.
  notFound?: boolean;
} = {}): { client: SupabaseClient } {
  const row = opts.row ?? null;
  const builder = (_table: string): unknown => {
    const b: Record<string, unknown> = {
      select() {
        return b;
      },
      eq() {
        return b;
      },
      async maybeSingle() {
        if (opts.notFound) {
          return Promise.resolve({
            data: null,
            error: { code: "PGRST116", message: "not found" },
          });
        }
        return Promise.resolve({ data: row, error: null });
      },
    };
    return b;
  };
  return { client: { from: (t: string) => builder(t) } as unknown as SupabaseClient };
}

function mountAsStudent(
  supabase: SupabaseClient,
  userId = "student-1",
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/student/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", "student");
    await next();
  });
  app.route(
    "/api/student/batch/:batchId/program/:programId/sem/:semId/gradesheet",
    studentGradesheetRoute,
  );
  return app;
}

const URL = "/api/student/batch/b1/program/p1/sem/s1/gradesheet";

describe("student gradesheet read", () => {
  beforeEach(() => {});

  it("returns 200 with the gradesheet when status=published", async () => {
    const publishedRow: DbRow = {
      id: "g1",
      sem_id: "s1",
      student_id: "student-1",
      status: "published",
      sgpa: "8.50",
      total_credits: "16",
      course_count: 4,
      compiled_at: "2026-09-29T00:00:00Z",
      compiled_by: "admin-1",
      locked_by: "admin-1",
      locked_at: "2026-09-29T00:00:00Z",
      published_by: "admin-1",
      published_at: "2026-09-29T00:00:00Z",
      unlock_reason: null,
      unlocked_by: null,
      unlocked_at: null,
    };
    const { client } = makeMockSupabase({ row: publishedRow });
    const app = mountAsStudent(client);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        status: string;
        sgpa: number;
        totalCredits: number;
        courseCount: number;
      };
    };
    expect(body.data.status).toBe("published");
    expect(body.data.sgpa).toBe(8.5);
    expect(body.data.totalCredits).toBe(16);
    expect(body.data.courseCount).toBe(4);
  });

  it("returns 404 when the gradesheet row is not found (e.g. pre-publish)", async () => {
    const { client } = makeMockSupabase({ notFound: true });
    const app = mountAsStudent(client);
    const res = await app.request(URL);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the row exists but status != published (RLS-equivalent at API layer)", async () => {
    // The API additionally checks status before returning — even though RLS
    // would normally hide the row, we guard here as defence in depth.
    const compiledRow: DbRow = {
      id: "g1",
      sem_id: "s1",
      student_id: "student-1",
      status: "compiled",
      sgpa: "8.50",
      total_credits: "16",
      course_count: 4,
      compiled_at: null,
      compiled_by: null,
      locked_by: null,
      locked_at: null,
      published_by: null,
      published_at: null,
      unlock_reason: null,
      unlocked_by: null,
      unlocked_at: null,
    };
    const { client } = makeMockSupabase({ row: compiledRow });
    const app = mountAsStudent(client);
    const res = await app.request(URL);
    expect(res.status).toBe(404);
  });
});