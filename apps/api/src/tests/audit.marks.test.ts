import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { marksRoute } from "../routes/marks/core.js";
import { makeAuditMockSupabase } from "./helpers/auditMock.js";

function mountAsFaculty(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/faculty/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "faculty-1");
    c.set("role", "faculty");
    await next();
  });
  app.route(
    "/api/faculty/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
    marksRoute,
  );
  return app;
}

const URL = "/api/faculty/batch/b1/program/p1/sem/s1/course/c1/marks";

describe("marks audit", () => {
  it("POST / (bulkUpsert) emits create audit per upserted row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [
          { id: "m1", course_id: "c1", student_id: "11111111-1111-1111-1111-111111111111", exam_type: "midterm", marks_obtained: 70, max_marks: 100, entered_by: "faculty-1", status: "draft", updated_at: "2026-09-30T10:00:00Z" },
          { id: "m2", course_id: "c1", student_id: "22222222-2222-2222-2222-222222222222", exam_type: "midterm", marks_obtained: 80, max_marks: 100, entered_by: "faculty-1", status: "draft", updated_at: "2026-09-30T10:00:00Z" },
        ],
        error: null,
      },
    });
    const app = mountAsFaculty(supabase);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [
          { studentId: "11111111-1111-1111-1111-111111111111", examType: "midterm", marksObtained: 70 },
          { studentId: "22222222-2222-2222-2222-222222222222", examType: "midterm", marksObtained: 80 },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of auditCalls) {
      expect(["create", "update"]).toContain(call.args["p_action"]);
      expect(call.args["p_entity"]).toBe("marks");
    }
  });

  it("PATCH /:id emits update audit with newValue snapshot", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [{ id: "m1", course_id: "c1", exam_type: "midterm", marks_obtained: 75, max_marks: 100, student_id: "11111111-1111-1111-1111-111111111111", entered_by: "faculty-1", status: "draft", updated_at: "2026-09-30T10:00:00Z" }],
        error: null,
      },
    });
    const app = mountAsFaculty(supabase);
    const res = await app.request(`${URL}/m1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marksObtained: 75 }),
    });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0]!.args).toMatchObject({
      p_action: "update",
      p_entity: "marks",
      p_entity_id: "m1",
    });
  });

  it("POST /submit emits submit audit per flipped row", async () => {
    const { supabase, calls } = makeAuditMockSupabase({
      updateReturns: {
        data: [
          { id: "m1", course_id: "c1", student_id: "11111111-1111-1111-1111-111111111111", exam_type: "midterm", marks_obtained: 80, max_marks: 100, entered_by: "faculty-1", status: "submitted", updated_at: "2026-09-30T10:00:00Z" },
          { id: "m2", course_id: "c1", student_id: "22222222-2222-2222-2222-222222222222", exam_type: "midterm", marks_obtained: 90, max_marks: 100, entered_by: "faculty-1", status: "submitted", updated_at: "2026-09-30T10:00:00Z" },
        ],
        error: null,
      },
    });
    const app = mountAsFaculty(supabase);
    const res = await app.request(`${URL}/submit`, { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
    const auditCalls = calls.rpc.filter((c) => c.name === "audit_log_write");
    expect(auditCalls).toHaveLength(2);
    expect(auditCalls.every((c) => c.args["p_action"] === "submit")).toBe(true);
  });
});
