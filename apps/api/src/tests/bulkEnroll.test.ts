import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminBulkEnrollRoute } from "../routes/admin/bulkEnroll.js";

function makeFakeSupabase(opts?: {
  sem?: { id: string; program_id: string; batch_id: string } | null;
  students?: { user_id: string; roll_number: string }[];
  existing?: { student_id: string }[];
}): SupabaseClient {
  const sem = opts?.sem ?? null;
  const students = opts?.students ?? [];
  const existing = opts?.existing ?? [];

  // The route expects `programs: { batch_id }` on the semesters row, but tests
  // express the row in the friendlier `{ batch_id }` shape. Translate on the
  // way out of the fake rather than touching the route.
  const semRow = sem
    ? { id: sem.id, program_id: sem.program_id, programs: { batch_id: sem.batch_id } }
    : null;

  const from = (t: string): unknown => {
    if (t === "semesters") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: semRow, error: null }),
          }),
        }),
      };
    }
    if (t === "student_enrollments") {
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: existing, error: null }),
        }),
        insert: () => Promise.resolve({ error: null }),
      };
    }
    if (t === "student_profiles") {
      return {
        select: () => ({
          in: () => Promise.resolve({ data: students, error: null }),
        }),
      };
    }
    return null;
  };

  return { from } as unknown as SupabaseClient;
}

function makeApp(supabase: SupabaseClient): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("userId", "admin");
    c.set("role", "admin");
    c.set("supabase", supabase);
    await next();
  });
  app.route("/api/admin/enrollments/bulk", adminBulkEnrollRoute);
  return app;
}

describe("POST /api/admin/enrollments/bulk", () => {
  it("enrolls valid rows and reports missing students per row", async () => {
    const supabase = makeFakeSupabase({
      sem: { id: "00000000-0000-0000-0000-000000000001", program_id: "p-1", batch_id: "b-1" },
      students: [{ user_id: "u-1", roll_number: "23BCA001" }],
    });
    const app = makeApp(supabase);
    const csv = "roll_number\n23BCA001\n23BCA999\n";
    const res = await app.request("/api/admin/enrollments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ semId: "00000000-0000-0000-0000-000000000001", csv }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { enrolled: number; errors: { row: number; reason: string }[] };
    expect(body.enrolled).toBe(1);
    expect(body.errors).toEqual([
      { row: 3, rollNumber: "23BCA999", reason: "no_such_student" },
    ]);
  });

  it("flags already-enrolled students as errors", async () => {
    const supabase = makeFakeSupabase({
      sem: { id: "00000000-0000-0000-0000-000000000001", program_id: "p-1", batch_id: "b-1" },
      students: [{ user_id: "u-1", roll_number: "23BCA001" }],
      existing: [{ student_id: "u-1" }],
    });
    const app = makeApp(supabase);
    const csv = "roll_number\n23BCA001\n";
    const res = await app.request("/api/admin/enrollments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ semId: "00000000-0000-0000-0000-000000000001", csv }),
    });
    const body = (await res.json()) as { enrolled: number; errors: { reason: string }[] };
    expect(body.enrolled).toBe(0);
    expect(body.errors[0]?.reason).toBe("already_enrolled");
  });

  it("returns 400 when semId is missing", async () => {
    const supabase = makeFakeSupabase();
    const app = makeApp(supabase);
    const res = await app.request("/api/admin/enrollments/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv: "roll_number\n23BCA001\n" }),
    });
    expect(res.status).toBe(400);
  });
});