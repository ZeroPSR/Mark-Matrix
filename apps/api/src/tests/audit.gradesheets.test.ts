import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGradesheetsRoute } from "../routes/admin/gradesheets.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient, userId = "admin-1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
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

describe("gradesheets audit", () => {
  it("POST /lock emits lock audit keyed by semId", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "g1", sem_id: "s1", status: "locked", locked_by: "admin-1", locked_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "lock",
      p_entity: "gradesheet",
      p_entity_id: "s1",
    });
  });

  it("POST /publish emits publish audit keyed by semId", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "g1", sem_id: "s1", status: "published", published_by: "admin-1", published_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/publish`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "publish",
      p_entity: "gradesheet",
      p_entity_id: "s1",
    });
  });

  it("POST /unlock emits unlock audit and captures reason in new_value", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "g1", sem_id: "s1", status: "compiled", unlocked_by: "admin-1", unlocked_at: "2026-09-30T10:00:00Z", unlock_reason: "wrong totals" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "wrong totals" }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args["p_action"]).toBe("unlock");
    const newVal = auditCalls[0]!.args["p_new_value"] as Record<string, unknown>;
    expect(newVal["unlock_reason"]).toBe("wrong totals");
  });

  it("POST /lock with no rows flipped emits no audit rows", async () => {
    const { supabase, calls } = makeAuditMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(409);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(0);
  });
});
