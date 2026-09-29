import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { studentGradesheetRoute } from "../routes/student/gradesheet.js";

/**
 * Mock supabase builder. The student gradesheet route does:
 *   .from("gradesheets").select(...).eq("sem_id", ...).eq("student_id", ...).maybeSingle()
 * Every modifier returns the same builder so the chain stays alive, and
 * the terminal `maybeSingle()` resolves to `{ data: row, error: null }` with
 * the configured row.
 */
function makeMockSupabase(row: unknown): SupabaseClient {
  return {
    from: () => ({
      select() {
        return this;
      },
      eq() {
        return this;
      },
      maybeSingle() {
        return Promise.resolve({ data: row, error: null });
      },
    }),
  } as unknown as SupabaseClient;
}

function mount(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/student/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "student-1");
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

function rowWith(status: "draft" | "compiled" | "locked" | "published"): unknown {
  return {
    id: "g1",
    sem_id: "s1",
    student_id: "student-1",
    status,
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
}

describe("student cannot see pre-published gradesheets (spec test 4)", () => {
  it("status=draft → 404", async () => {
    const app = mount(makeMockSupabase(rowWith("draft")));
    const res = await app.request(URL);
    expect(res.status).toBe(404);
  });

  it("status=compiled → 404", async () => {
    const app = mount(makeMockSupabase(rowWith("compiled")));
    const res = await app.request(URL);
    expect(res.status).toBe(404);
  });

  it("status=locked → 404", async () => {
    const app = mount(makeMockSupabase(rowWith("locked")));
    const res = await app.request(URL);
    expect(res.status).toBe(404);
  });

  it("status=published → 200", async () => {
    const app = mount(makeMockSupabase(rowWith("published")));
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { status: string; sgpa: number };
    };
    expect(body.data.status).toBe("published");
    expect(body.data.sgpa).toBe(8.5);
  });
});
