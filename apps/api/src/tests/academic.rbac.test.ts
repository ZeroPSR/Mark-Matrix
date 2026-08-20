import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBatchesRoute } from "../routes/admin/batches.js";
import { requireRole } from "../middleware/requireRole.js";

function makeFakeSupabase(): SupabaseClient {
  return {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  } as unknown as SupabaseClient;
}

function makeApp(role: "admin" | "faculty" | "student" | null): Hono<AppEnv> {
  const supabase = makeFakeSupabase();
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    if (role !== null) {
      c.set("userId", "user-1");
      c.set("role", role);
      c.set("supabase", supabase);
    }
    await next();
  });
  app.use("/api/admin/*", requireRole("admin"));
  app.route("/api/admin/batches", adminBatchesRoute);
  return app;
}

describe("admin routes are admin-only", () => {
  it.each([
    ["faculty"],
    ["student"],
  ] as const)("forbids %s from POSTing", async (role) => {
    const app = makeApp(role);
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", startYear: 2023 }),
    });
    expect(res.status).toBe(403);
  });

  it("forbids anonymous POSTs", async () => {
    const app = makeApp(null);
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", startYear: 2023 }),
    });
    expect([401, 403]).toContain(res.status);
  });
});