import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marksRoute } from "../routes/marks/core.js";
import { adminMarksLifecycleRoute } from "../routes/admin/marksLifecycle.js";
import { requireRole } from "../middleware/requireRole.js";

/**
 * Mock supabase that surfaces a configured error from every write call. The
 * DB raises `marks_data_locked` with errcode `P0001` whenever anyone tries to
 * change marks_obtained on a row whose status has advanced past 'draft'. We
 * use this mock to simulate that path without hitting a real database.
 *
 * The builder is thenable and chainable: every modifier returns `b`, and the
 * terminal `await` resolves to the configured error. This mirrors the
 * `thenable builder` pattern used in `marksLifecycle.routes.test.ts`.
 */
function supabaseRaising(code: string, message: string): { client: SupabaseClient } {
  const error = { code, message };
  // The PATCH /marks/:id route does two round-trips: first a SELECT to fetch
  // the existing row, then an UPDATE. The P0001 trigger fires only on the
  // UPDATE, so we let the SELECT succeed and raise the error from the
  // UPDATE's terminal select()/maybeSingle() call.
  let selectCall = 0;
  const b: Record<string, unknown> = {
    select() {
      selectCall++;
      return b;
    },
    eq() {
      return b;
    },
    neq() {
      return b;
    },
    in() {
      return b;
    },
    order() {
      return b;
    },
    upsert() {
      // Marks route chain: .upsert(rows, opts).select(...).
      return {
        select() {
          return Promise.resolve({ data: null, error });
        },
      };
    },
    update() {
      // Marks-lifecycle chain: .update(obj).eq().eq().select("id").await.
      // Return the builder so the chain stays alive.
      return b;
    },
    maybeSingle() {
      // First call is the SELECT before the UPDATE — let it succeed with a
      // synthetic row so the route reaches the UPDATE.
      if (selectCall === 1) {
        return Promise.resolve({
          data: {
            id: "row-1",
            course_id: "c1",
            exam_type: "final",
            max_marks: 100,
          },
          error: null,
        });
      }
      // Second call is the UPDATE's terminal — surface the trigger error.
      return Promise.resolve({ data: null, error });
    },
    then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
      return Promise.resolve({ data: null, error }).then(onFulfilled);
    },
  };
  return { client: { from: () => b } as unknown as SupabaseClient };
}

/**
 * Mock supabase that resolves `update()` calls to a successful no-rows-matched
 * response. Used for the unlock-without-reason test, which exercises the
 * schema-validation branch (400) before the route ever reaches the DB.
 */
function supabaseNoRows(): { client: SupabaseClient } {
  const b: Record<string, unknown> = {
    select() {
      return b;
    },
    eq() {
      return b;
    },
    in() {
      return b;
    },
    order() {
      return b;
    },
    update() {
      // Marks-lifecycle chain stays alive so .eq()/.select() can be called.
      return b;
    },
    then<T>(onFulfilled: (v: unknown) => T): Promise<T> {
      return Promise.resolve({ data: [], error: null }).then(onFulfilled);
    },
  };
  return { client: { from: () => b } as unknown as SupabaseClient };
}

/**
 * Build a Hono app with the marks route + the lifecycle route mounted at the
 * same path. The mount path mirrors Task 9's production wiring so the params
 * named in the route code (`semId`, `courseId`, `id`) line up with the URL
 * captures.
 */
function makeFacultyApp(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "faculty-1");
    c.set("role", "faculty");
    await next();
  });
  app.use("/api/*", requireRole("faculty"));
  app.route(
    "/api/test/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
    marksRoute,
  );
  return app;
}

function makeAdminLifecycleApp(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route(
    "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
    adminMarksLifecycleRoute,
  );
  return app;
}

const MARKS_URL = "/api/test/batch/b1/program/p1/sem/s1/course/c1/marks";
const ADMIN_URL = "/api/admin/batch/b1/program/p1/sem/s1/course/c1/marks";

describe("lock enforcement on locked marks (spec test 2)", () => {
  it("faculty PATCH /marks/:id on a locked-status row → 409", async () => {
    // patchOne catches P0001 → 409 submitted_marks_locked.
    const { client } = supabaseRaising("P0001", "marks_data_locked");
    const app = makeFacultyApp(client);
    const res = await app.request(`${MARKS_URL}/row-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marksObtained: 50 }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("submitted_marks_locked");
  });

  it("admin POST /marks/lock surfaces P0001 marks_data_locked as 409", async () => {
    // runStatusFlip in marksLifecycle already handles P0001 → 409 with the
    // marks_data_locked error code; this test pins that behaviour for spec
    // test 2 coverage.
    const { client } = supabaseRaising("P0001", "marks_data_locked");
    const app = makeAdminLifecycleApp(client);
    const res = await app.request(`${ADMIN_URL}/lock`, {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("marks_data_locked");
  });

  it("admin POST /marks/unlock without reason → 400 validation_failed", async () => {
    // Schema-validation branch fires before the DB write; we use a no-rows
    // update response so the test exercises the validator rather than the
    // 409 path.
    const { client } = supabaseNoRows();
    const app = makeAdminLifecycleApp(client);
    const res = await app.request(`${ADMIN_URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      fields?: { path: string; message: string }[];
    };
    expect(body.error).toBe("validation_failed");
    expect(body.fields?.some((f) => f.path === "reason")).toBe(true);
  });
});
