import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attendanceRoute } from "../routes/attendance/core.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsFaculty(supabase: SupabaseClient, userId = "faculty-1"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/faculty/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", userId);
    c.set("role", "faculty");
    await next();
  });
  app.route(
    "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
    attendanceRoute,
  );
  return app;
}

const URL = "/api/faculty/batch/b1/program/p1/sem/s1/course/c1/attendance";

describe("attendance audit", () => {
  it("POST / emits one audit row per upserted attendance row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [
          { id: "a1", course_id: "c1", student_id: "11111111-1111-1111-1111-111111111111", session_date: "2026-09-30", status: "present", recorded_by: "faculty-1", created_at: "2026-09-30T10:00:00Z" },
          { id: "a2", course_id: "c1", student_id: "22222222-2222-2222-2222-222222222222", session_date: "2026-09-30", status: "absent", recorded_by: "faculty-1", created_at: "2026-09-30T10:00:00Z" },
        ],
        error: null,
      },
    });
    const app = mountAsFaculty(supabase);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionDate: "2026-09-30",
        entries: [
          { studentId: "11111111-1111-1111-1111-111111111111", status: "present" },
          { studentId: "22222222-2222-2222-2222-222222222222", status: "absent" },
        ],
      }),
    });
    expect(res.status).toBe(201);

    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "create",
      p_entity: "attendance",
      p_entity_id: "a1",
    });
    expect(auditCalls[1]!.args).toMatchObject({
      p_action: "create",
      p_entity: "attendance",
      p_entity_id: "a2",
    });
  });

  it("PATCH /:id emits an update audit row with before/after snapshots", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "a1", status: "present", course_id: "c1", student_id: "s1", session_date: "2026-09-30", recorded_by: "faculty-1", created_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsFaculty(supabase);
    const res = await app.request(`${URL}/a1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "present" }),
    });
    expect(res.status).toBe(200);

    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "update",
      p_entity: "attendance",
      p_entity_id: "a1",
    });
    expect(auditCalls[0]!.args["p_new_value"]).toMatchObject({ status: "present" });
  });

  it("POST / that fails validation emits no audit rows", async () => {
    const { supabase, calls } = makeAuditMockSupabase();
    const app = mountAsFaculty(supabase);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionDate: "2026-09-30", entries: [] }),
    });
    expect(res.status).toBe(400);
    expect(calls.rpc).toHaveLength(0);
  });
});
