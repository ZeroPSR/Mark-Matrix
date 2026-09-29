import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGradesheetsRoute } from "../routes/admin/gradesheets.js";

/** Spy on console.log so we can assert the notification stub fires. */
const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

function makeMockSupabase(opts: {
  updateReturns?: {
    data: { id: string }[] | null;
    error: null | { code: string; message: string };
  };
  totalCreditsRows?: { total_credits: number }[];
  // CGPA-recompute rows from gradesheets (the second/third select against the
  // table). Empty by default so the recompute pass is a no-op.
  cgpaRows?: unknown[];
} = {}): { client: SupabaseClient } {
  const updateReturns = opts.updateReturns ?? {
    data: [{ id: "g1" }, { id: "g2" }],
    error: null,
  };
  const totalCreditsRows = opts.totalCreditsRows ?? [
    { total_credits: 7 },
    { total_credits: 7 },
  ];
  const cgpaRows = opts.cgpaRows ?? [];
  // Counts how many times `then()` has been called on a gradesheets builder.
  // Publish route call order on gradesheets:
  //   1st: the UPDATE (in runStatusFlip) — return `updateReturns`.
  //   2nd: the recomputeCgpas SELECT — return `cgpaRows` (empty by default
  //        so the recompute is a no-op).
  //   3rd: the total_credits read — return `totalCreditsRows`.
  // Lock/unlock routes only hit the table once (UPDATE), so calls > 1
  // don't fire on those routes.
  let gradesheetsCalls = 0;

  const builder = (table: string): unknown => {
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
      update() {
        // Return the chainable so .eq().eq().select() can be called.
        return b;
      },
      then<T>(
        onFulfilled: (v: unknown) => T,
      ): Promise<T> {
        if (table === "gradesheets") {
          gradesheetsCalls++;
          if (gradesheetsCalls === 1) {
            return Promise.resolve(updateReturns).then(onFulfilled);
          }
          if (gradesheetsCalls === 2) {
            return Promise.resolve({ data: cgpaRows, error: null }).then(onFulfilled);
          }
          return Promise.resolve({ data: totalCreditsRows, error: null }).then(onFulfilled);
        }
        if (table === "scores") {
          return Promise.resolve({ data: [], error: null }).then(onFulfilled);
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      },
    };
    return b;
  };
  return { client: { from: (t: string) => builder(t) } as unknown as SupabaseClient };
}

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
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

describe("gradesheets publish", () => {
  beforeEach(() => {
    logSpy.mockClear();
  });

  it("POST /lock flips compiled->locked for all rows in sem", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { locked: number };
    expect(body.locked).toBe(2);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("POST /publish flips locked->published AND fires the notification stub", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/publish`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { published: number };
    expect(body.published).toBe(2);

    // Exactly one [notify] line, with the published semId, the student count, and the total credits.
    const notifyCalls = logSpy.mock.calls.filter((c) =>
      String(c[0] ?? "").startsWith("[notify]"),
    );
    expect(notifyCalls).toHaveLength(1);
    expect(String(notifyCalls[0]![0])).toContain("semId=s1");
    expect(String(notifyCalls[0]![0])).toContain("studentCount=2");
    expect(String(notifyCalls[0]![0])).toContain("totalCredits=14");
  });

  it("POST /publish with no locked rows returns 409", async () => {
    const { client } = makeMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/publish`, { method: "POST", body: "{}" });
    expect(res.status).toBe(409);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("POST /unlock without reason returns 400", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /unlock with reason flips published->compiled", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "wrong student count" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { unlocked: number };
    expect(body.unlocked).toBe(2);
  });
});
