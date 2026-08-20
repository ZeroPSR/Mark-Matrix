import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBatchesRoute } from "../routes/admin/batches.js";

function makeFakeSupabase(): SupabaseClient {
  const created: Record<string, unknown> = {};
  const builder = {
    select() { return builder; },
    insert(row: Record<string, unknown>) {
      const id = `id-${Math.random().toString(36).slice(2, 8)}`;
      const out = { id, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...row };
      Object.assign(created, out);
      // The route does `from(t).insert(row).select().single()`; build a
      // chainable object so `.select()` returns self and `.single()` awaits.
      const chain = {
        select() { return chain; },
        single() { return Promise.resolve({ data: out, error: null }); },
      };
      return chain;
    },
    update() { return { eq() { return { select() { return { maybeSingle() { return Promise.resolve({ data: null, error: null }); } }; } }; } }; },
    delete() { return { eq() { return Promise.resolve({ data: null, error: null }); } }; },
    eq() { return builder; },
    maybeSingle() { return Promise.resolve({ data: null, error: null }); },
  };
  // The route calls `supabase.from(table).insert(...)`; expose a `from` that
  // hands back the builder regardless of table name.
  return { from: () => builder } as unknown as SupabaseClient;
}

function makeApp(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("userId", "test-user");
    c.set("role", "admin");
    c.set("supabase", supabase);
    await next();
  });
  app.route("/api/admin/batches", adminBatchesRoute);
  return app;
}

describe("admin /api/admin/batches CRUD", () => {
  let supabase: SupabaseClient;
  let app: Hono<AppEnv>;
  beforeEach(() => { supabase = makeFakeSupabase(); app = makeApp(supabase); });

  it("POST creates a batch and returns 201", async () => {
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "BCA 2023", startYear: 2023 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { name: string; startYear: number } };
    expect(body.data.name).toBe("BCA 2023");
    expect(body.data.startYear).toBe(2023);
  });

  it("POST rejects an invalid year with 400 validation_failed", async () => {
    const res = await app.request("/api/admin/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "X", startYear: 1999 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("validation_failed");
  });
});