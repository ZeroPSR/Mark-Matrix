import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminUsersRoute } from "../routes/admin/users.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/users", adminUsersRoute);
  return app;
}

const URL = "/api/admin/users";

describe("users audit", () => {
  it("PATCH /:userId emits update audit with before/after snapshots", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      tableResponses: {
        profiles: {
          data: [{ user_id: "u-target", name: "Alice Updated", role: "faculty" }],
          error: null,
        },
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/u-target`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "faculty", name: "Alice Updated" }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "update",
      p_entity: "user",
      p_entity_id: "u-target",
    });
    const newVal = auditCalls[0]!.args["p_new_value"] as Record<string, unknown>;
    expect(newVal["role"]).toBe("faculty");
    expect(newVal["name"]).toBe("Alice Updated");
  });

  it("PATCH /:userId with no matching row emits no audit rows", async () => {
    const { supabase, calls } = makeAuditMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/u-nonexistent`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "student" }),
    });
    expect(res.status).toBe(404);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(0);
  });
});

describe("users route email extension", () => {
  it("GET / returns 200 after the cycle-8b email extension (Review Focus item 4)", async () => {
    // Cycle 8b: GET /api/admin/users now also returns `email` from auth.users
    // (via service-role client). This test pins that the route still responds
    // 200 with the profiles data after the email merge is wired in.
    const { supabase } = makeAuditMockSupabase({
      tableResponses: {
        profiles: {
          data: [{ user_id: "u1", name: "Alice", role: "faculty" }],
          error: null,
        },
      },
    });
    const app = new Hono<AppEnv>();
    app.use("/api/admin/*", async (c, next) => {
      c.set("supabase", supabase);
      c.set("userId", "admin-1");
      c.set("role", "admin");
      await next();
    });
    app.route("/api/admin/users", adminUsersRoute);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
  });
});
