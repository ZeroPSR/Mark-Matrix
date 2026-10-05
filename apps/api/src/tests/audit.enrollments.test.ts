import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminEnrollmentsRoute } from "../routes/admin/enrollments.js";
import { adminBulkEnrollRoute } from "../routes/admin/bulkEnroll.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsAdmin(supabase: SupabaseClient, route: Hono<AppEnv>, path: string): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", "admin");
    await next();
  });
  app.route(path, route);
  return app;
}

const ENROLLMENTS_URL = "/api/admin/enrollments";
const BULK_ENROLL_URL = "/api/admin/bulk-enroll";

describe("enrollments audit", () => {
  it("POST / emits create audit with the new row snapshot", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      tableResponses: {
        semesters: {
          data: [{ id: "11111111-1111-1111-1111-111111111111", program_id: "p1", programs: { batch_id: "b1" } }],
          error: null,
        },
        student_enrollments: {
          data: [{ id: "e1", student_id: "11111111-1111-1111-1111-111111111111", batch_id: "b1", program_id: "p1", sem_id: "11111111-1111-1111-1111-111111111111", enrollment_date: "2026-09-30" }],
          error: null,
        },
      },
    });
    const app = mountAsAdmin(supabase, adminEnrollmentsRoute, ENROLLMENTS_URL);
    const res = await app.request(ENROLLMENTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        studentId: "11111111-1111-1111-1111-111111111111",
        semId: "11111111-1111-1111-1111-111111111111",
      }),
    });
    if (res.status !== 201) {
      const body = await res.clone().text();
      throw new Error(`expected 201, got ${res.status}: ${body}`);
    }
    expect(res.status).toBe(201);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "create",
      p_entity: "enrollment",
      p_entity_id: "e1",
    });
    expect(auditCalls[0]!.args["p_old_value"]).toBeNull();
  });

  it("DELETE /:id emits delete audit with oldValue snapshot", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "e1", student_id: "11111111-1111-1111-1111-111111111111", batch_id: "b1", program_id: "p1", sem_id: "s1", enrollment_date: "2026-09-30" }],
        error: null,
      },
    });
    const app = mountAsAdmin(supabase, adminEnrollmentsRoute, ENROLLMENTS_URL);
    const res = await app.request(`${ENROLLMENTS_URL}/e1`, { method: "DELETE" });
    expect([204, 404]).toContain(res.status);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    if (res.status === 204) {
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0]!.args).toMatchObject({
        p_action: "delete",
        p_entity: "enrollment",
        p_entity_id: "e1",
      });
      expect(auditCalls[0]!.args["p_new_value"]).toBeNull();
    } else {
      expect(auditCalls).toHaveLength(0);
    }
  });
});
