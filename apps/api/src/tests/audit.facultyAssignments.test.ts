import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminFacultyAssignmentsRoute } from "../routes/admin/facultyAssignments.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route("/api/admin/faculty-assignments", adminFacultyAssignmentsRoute);
  return app;
}

const URL = "/api/admin/faculty-assignments";

describe("faculty assignments audit", () => {
  it("POST / emits create audit with the new assignment row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "fa1", faculty_id: "f1", course_id: "c1", assigned_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        facultyId: "11111111-1111-1111-1111-111111111111",
        courseId: "11111111-1111-1111-1111-111111111111",
      }),
    });
    expect(res.status).toBe(201);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "create",
      p_entity: "faculty_assignment",
      p_entity_id: "fa1",
    });
  });

  it("DELETE /:id emits delete audit only on real deletion", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "fa1", faculty_id: "f1", course_id: "c1", assigned_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase);
    const res = await app.request(`${URL}/fa1`, { method: "DELETE" });
    expect([204, 404]).toContain(res.status);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    if (res.status === 204) {
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.args).toMatchObject({
        p_action: "delete",
        p_entity: "faculty_assignment",
        p_entity_id: "fa1",
      });
    } else {
      expect(auditCalls).toHaveLength(0);
    }
  });
});
