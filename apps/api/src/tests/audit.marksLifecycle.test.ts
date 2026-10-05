import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminMarksLifecycleRoute } from "../routes/admin/marksLifecycle.js";
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
    "/api/admin/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
    adminMarksLifecycleRoute,
  );
  return app;
}

const URL = "/api/admin/batch/b1/program/p1/sem/s1/course/c1/marks";

describe("marks lifecycle audit", () => {
  it("POST /approve emits approve audit per flipped row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [
          { id: "m1", course_id: "c1", student_id: "11111111-1111-1111-1111-111111111111", exam_type: "midterm", status: "approved", marks_obtained: 80, max_marks: 100, entered_by: "f1", updated_at: "2026-09-30T10:00:00Z" },
          { id: "m2", course_id: "c1", student_id: "22222222-2222-2222-2222-222222222222", exam_type: "midterm", status: "approved", marks_obtained: 70, max_marks: 100, entered_by: "f1", updated_at: "2026-09-30T10:00:00Z" },
        ],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/approve`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls.every((c) => c.args["p_action"] === "approve")).toBe(true);
    expect(auditCalls.every((c) => c.args["p_entity"] === "marks")).toBe(true);
    expect(auditCalls.map((c) => c.args["p_entity_id"]).sort()).toEqual(["m1", "m2"]);
  });

  it("POST /lock emits lock audit per flipped row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "m1", status: "locked", course_id: "c1", student_id: "11111111-1111-1111-1111-111111111111", exam_type: "midterm", marks_obtained: 80, max_marks: 100, entered_by: "f1", updated_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/lock`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args["p_action"]).toBe("lock");
  });

  it("POST /unlock emits unlock audit and captures reason in new_value", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "m1", status: "approved", course_id: "c1", student_id: "11111111-1111-1111-1111-111111111111", exam_type: "midterm", marks_obtained: 80, max_marks: 100, entered_by: "f1", updated_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: "faculty typo" }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args["p_action"]).toBe("unlock");
    const newVal = auditCalls[0]!.args["p_new_value"] as Record<string, unknown>;
    expect(newVal["unlock_reason"]).toBe("faculty typo");
  });

  it("POST /approve with no rows flipped emits no audit rows", async () => {
    const { supabase, calls } = makeAuditMockSupabase({ updateReturns: { data: [], error: null } });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/approve`, { method: "POST", body: "{}" });
    expect(res.status).toBe(409);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(0);
  });
});
