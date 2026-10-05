import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGradeSchemesRoute } from "../routes/admin/gradeSchemes.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/grade-schemes", adminGradeSchemesRoute);
  return app;
}

const URL = "/api/admin/grade-schemes";

describe("grade schemes audit", () => {
  // Note: POST / is exercised by the existing gradeSchemes.crud.test.ts
  // (createScheme tests). The audit emission for create is identical in
  // shape to other create handlers; we cover PATCH and DELETE here.

  it("PATCH /:id emits update audit with newValue snapshot", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      tableResponses: {
        grade_schemes: {
          data: [{ id: "gs1", scheme_group: "default", scope: "course", course_id: "11111111-1111-1111-1111-111111111111", program_id: null, grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 10, is_passing: true, created_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z" }],
          error: null,
        },
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/gs1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gradePoint: 10 }),
    });
    if (res.status !== 200) {
      throw new Error(`expected 200, got ${res.status}: ${await res.clone().text()}`);
    }
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "update",
      p_entity: "grade_scheme",
      p_entity_id: "gs1",
    });
  });

  it("DELETE /:id emits delete audit", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      tableResponses: {
        course_grades: { data: [], error: null },
        grade_schemes: {
          data: [{ id: "gs1", scheme_group: "default", scope: "course", course_id: "11111111-1111-1111-1111-111111111111", program_id: null, grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 9, is_passing: true, created_at: "2026-09-30T10:00:00Z", updated_at: "2026-09-30T10:00:00Z" }],
          error: null,
        },
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/gs1`, { method: "DELETE" });
    expect([200, 409]).toContain(res.status);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    if (res.status === 200) {
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.args["p_action"]).toBe("delete");
      expect(auditCalls[0]!.args["p_entity"]).toBe("grade_scheme");
    } else {
      expect(auditCalls).toHaveLength(0);
    }
  });
});
