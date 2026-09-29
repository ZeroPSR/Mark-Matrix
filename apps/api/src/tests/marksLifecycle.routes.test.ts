import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminMarksLifecycleRoute } from "../routes/admin/marksLifecycle.js";

/**
 * Mock supabase for the lifecycle routes. The routes run three UPDATE
 * statements (approve, lock, unlock). Each uses .update({...}).eq(...).eq(...).
 * The mock records the update args + filters so tests can assert.
 *
 * The builder is chainable (eq/select/update return the same builder so the
 * `.update(...).eq(...).eq(...).select("id")` chain stays alive) and also
 * thenable (so the trailing `await` resolves to the configured updateReturns).
 */
function makeMockSupabase(opts: {
  // What the .update() call should yield back as data.
  updateReturns?: { data: { id: string }[] | null; error: null | { code: string; message: string } };
} = {}): {
  client: SupabaseClient;
  calls: { update: { arg: unknown }[]; eq: { col: string; val: unknown }[] };
} {
  const updateReturns = opts.updateReturns ?? { data: [{ id: "row-1" }, { id: "row-2" }], error: null };
  const calls = { update: [] as { arg: unknown }[], eq: [] as { col: string; val: unknown }[] };

  const builder = (table: string): unknown => {
    const b: Record<string, unknown> = {
      select() { return b; },
      eq(col: string, val: unknown) { calls.eq.push({ col, val }); return b; },
      update(arg: unknown) {
        calls.update.push({ arg });
        // Return the chainable so .eq()/.select() can be called after us.
        return b;
      },
      // Terminal await resolves to the configured response. If the table
      // isn't `marks`, surface an unexpected_table error so misrouted calls
      // are obvious in test output.
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        if (table !== "marks") {
          return Promise.resolve({
            data: null,
            error: { code: "unexpected_table", message: table },
          }).then(onFulfilled, onRejected);
        }
        return Promise.resolve(updateReturns).then(onFulfilled, onRejected);
      },
    };
    return b;
  };
  return { client: { from: (t: string) => builder(t) } as unknown as SupabaseClient, calls };
}

function mountAsAdmin(supabase: SupabaseClient, userId = "admin-1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", "admin");
    await next();
  });
  app.route(
    "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
    adminMarksLifecycleRoute,
  );
  return app;
}

const URL = "/api/admin/batch/b1/program/p1/sem/s1/course/c1/marks";

describe("admin marks lifecycle", () => {
  beforeEach(() => {});

  it("POST /approve flips submitted rows and stamps approved_by/at", async () => {
    const { client, calls } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/approve`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = await res.json() as { approved: number; approvedBy: string };
    expect(body.approved).toBe(2);
    expect(body.approvedBy).toBe("admin-1");

    expect(calls.update).toHaveLength(1);
    const upd = calls.update[0]!.arg as Record<string, unknown>;
    expect(upd["status"]).toBe("approved");
    expect(upd["approved_by"]).toBe("admin-1");
    expect(typeof upd["approved_at"]).toBe("string");
  });

  it("POST /approve rejects bad JSON with 400", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("POST /approve surfaces no-rows-matched as 409 invalid_state_transition", async () => {
    const { client } = makeMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/approve`, { method: "POST", body: "{}" });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invalid_state_transition");
  });

  it("POST /lock flips approved rows and stamps locked_by/at", async () => {
    const { client, calls } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const body = await res.json() as { locked: number; lockedBy: string };
    expect(body.locked).toBe(2);
    expect(body.lockedBy).toBe("admin-1");

    const upd = calls.update[0]!.arg as Record<string, unknown>;
    expect(upd["status"]).toBe("locked");
    expect(upd["locked_by"]).toBe("admin-1");
    expect(typeof upd["locked_at"]).toBe("string");
  });

  it("POST /lock surfaces P0001 marks_data_locked as 409", async () => {
    const { client } = makeMockSupabase({
      updateReturns: { data: null, error: { code: "P0001", message: "marks_data_locked" } },
    });
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("marks_data_locked");
  });

  it("POST /unlock requires reason (400 when missing)", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string; fields?: { path: string; message: string }[] };
    expect(body.error).toBe("validation_failed");
    expect(body.fields?.some((f) => f.path === "reason")).toBe(true);
  });

  it("POST /unlock rejects empty reason as 400", async () => {
    const { client } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "   " }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /unlock with reason flips locked->approved", async () => {
    const { client, calls } = makeMockSupabase();
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "faculty typo" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { unlocked: number; unlockedBy: string };
    expect(body.unlocked).toBe(2);
    expect(body.unlockedBy).toBe("admin-1");

    const upd = calls.update[0]!.arg as Record<string, unknown>;
    expect(upd["status"]).toBe("approved");
    // After unlock we clear locked_by / locked_at so the row is back to
    // "approved" with no stale lock metadata.
    expect(upd["locked_by"]).toBeNull();
    expect(upd["locked_at"]).toBeNull();
  });

  it("POST /unlock with no locked rows returns 409 invalid_state_transition", async () => {
    const { client } = makeMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(client);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "x" }),
    });
    expect(res.status).toBe(409);
  });
});
