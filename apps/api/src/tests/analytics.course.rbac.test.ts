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
    // The same param names the real app mounts this with — see
    // apps/api/src/index.ts. A test that mounts it differently hides a
    // mismatch between the handler and the mount.
    "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/analytics",
    analyticsCourseRoute,
  );
  return app;
}

const URL = "/api/faculty/batch/b1/program/p1/sem/s1/course/c1/analytics";

describe("faculty analytics — RBAC scoping", () => {
  it("Review Focus 1 — faculty gets 200 with empty data when RLS hides the course", async () => {
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