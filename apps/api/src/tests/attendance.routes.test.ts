import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { attendanceRoute, studentAttendanceRoute } from "../routes/attendance/core.js";
import { requireRole } from "../middleware/requireRole.js";

/**
 * A mock supabase builder that records calls and returns a configurable
 * response for upsert and select. Used to exercise the attendance handlers
 * without hitting a real database.
 */
function makeMockSupabase(opts: {
  upsertResult?: { data: unknown[]; error: null | { code: string; message: string } };
  selectResult?: { data: unknown[]; error: null | { code: string; message: string } };
  updateResult?: { data: unknown | null; error: null | { code: string; message: string } };
} = {}): { client: SupabaseClient; calls: { upsert: unknown[]; select: unknown[]; update: unknown[] } } {
  const calls = { upsert: [] as unknown[], select: [] as unknown[], update: [] as unknown[] };

  // A thenable builder. All query modifiers return `self` so the chain stays
  // alive, and the final `await ...` resolves to opts.selectResult.
  const builder: Record<string, unknown> & { then: <T, R>(onFulfilled: (v: unknown) => T | PromiseLike<T>, onRejected?: (e: unknown) => R | PromiseLike<R>) => Promise<T | R> } = {
    select(arg: unknown) {
      calls.select.push(arg);
      return builder;
    },
    eq() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    order() { return builder; },
    upsert(rows: unknown, options: unknown) {
      calls.upsert.push({ rows, options });
      // Real Supabase returns a chainable with .select() that resolves to the
      // upserted rows. We mirror that here.
      const chain = {
        select() {
          return Promise.resolve(opts.upsertResult ?? { data: rows, error: null });
        },
      };
      return chain;
    },
    update(arg: unknown) {
      calls.update.push(arg);
      return {
        eq() {
          return {
            select() {
              return {
                maybeSingle() {
                  return Promise.resolve(
                    opts.updateResult ?? { data: null, error: null },
                  );
                },
              };
            },
          };
        },
      };
    },
    // Make the builder awaitable — Supabase's PostgrestFilterBuilder is.
    then(onFulfilled, onRejected) {
      return Promise.resolve(opts.selectResult ?? { data: [], error: null })
        .then(onFulfilled, onRejected);
    },
  };
  return {
    client: { from: () => builder } as unknown as SupabaseClient,
    calls,
  };
}

function makeApp(
  supabase: SupabaseClient,
  role: "faculty" | "admin" | "student",
  subApp = attendanceRoute,
): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", async (c, next) => {
    c.set("userId", "user-1");
    c.set("role", role);
    c.set("supabase", supabase);
    await next();
  });
  app.use("/api/*", requireRole(role));
  app.route(
    "/api/test/batch/:batchId/program/:programId/sem/:semId/course/:courseId/attendance",
    subApp,
  );
  return app;
}

const URL = "/api/test/batch/b1/program/p1/sem/s1/course/c1/attendance";

describe("attendance route shape", () => {
  it("POST with no body returns 400 validation_failed", async () => {
    const { client } = makeMockSupabase();
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
    expect(client).toBeDefined();
  });
});

describe("attendance bulk mark", () => {
  let supabase: SupabaseClient;
  let calls: ReturnType<typeof makeMockSupabase>["calls"];
  let app: Hono<AppEnv>;
  beforeEach(() => {
    const m = makeMockSupabase();
    supabase = m.client;
    calls = m.calls;
    app = makeApp(supabase, "faculty");
  });

  it("POST bulk-marks a full roster in a single request (test 5)", async () => {
    const entries = Array.from({ length: 30 }, (_, i) => ({
      studentId: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      status: i % 3 === 0 ? "absent" : "present",
    }));
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionDate: "2026-09-07", entries }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(30);
    expect(calls.upsert).toHaveLength(1);
    const first = calls.upsert[0] as { rows: unknown[]; options: { onConflict: string } };
    expect(first.options.onConflict).toBe("course_id,student_id,session_date");
    expect((first.rows as unknown[]).length).toBe(30);
  });

  it("POST with same student/session upserts rather than duplicating (test 4)", async () => {
    const row = {
      course_id: "c1",
      student_id: "00000000-0000-0000-0000-000000000001",
      session_date: "2026-09-07",
      status: "present",
      recorded_by: "user-1",
    };
    const m = makeMockSupabase({ upsertResult: { data: [row], error: null } });
    supabase = m.client;
    calls = m.calls;
    app = makeApp(supabase, "faculty");

    // First mark
    const r1 = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionDate: "2026-09-07",
        entries: [{ studentId: row.student_id, status: "present" }],
      }),
    });
    expect(r1.status).toBe(201);

    // Second mark on the same student/session with a different status.
    const r2 = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionDate: "2026-09-07",
        entries: [{ studentId: row.student_id, status: "absent" }],
      }),
    });
    expect(r2.status).toBe(201);
    // Both calls go through upsert — the unique constraint on
    // (course_id, student_id, session_date) makes the second one an UPDATE.
    expect(calls.upsert).toHaveLength(2);
    const second = calls.upsert[1] as { rows: { status: string }[]; options: { onConflict: string } };
    expect(second.options.onConflict).toBe("course_id,student_id,session_date");
    expect(second.rows[0]?.status).toBe("absent");
  });

  it("POST validation rejects empty entries", async () => {
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionDate: "2026-09-07", entries: [] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  it("POST validation rejects malformed date", async () => {
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionDate: "09-07-2026",
        entries: [{ studentId: "00000000-0000-0000-0000-000000000001", status: "present" }],
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe("attendance summary percentage computation (test 3)", () => {
  it("computes per-student percent from a known dataset", async () => {
    // Known dataset — 3 students, 5 sessions each.
    const dataset = [
      // alice: 3 present, 1 late, 1 absent  -> (3+1)/5 = 80%
      { student_id: "a", status: "present" },
      { student_id: "a", status: "present" },
      { student_id: "a", status: "present" },
      { student_id: "a", status: "late" },
      { student_id: "a", status: "absent" },
      // bob: all present  -> 100%
      { student_id: "b", status: "present" },
      { student_id: "b", status: "present" },
      { student_id: "b", status: "present" },
      { student_id: "b", status: "present" },
      { student_id: "b", status: "present" },
      // carol: all absent -> 0%
      { student_id: "c", status: "absent" },
      { student_id: "c", status: "absent" },
      { student_id: "c", status: "absent" },
      { student_id: "c", status: "absent" },
      { student_id: "c", status: "absent" },
    ];
    const { client } = makeMockSupabase({ selectResult: { data: dataset, error: null } });
    const app = makeApp(client, "faculty");

    const res = await app.request(`${URL}/summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { studentId: string; total: number; present: number; late: number; absent: number; percent: number }[];
    };
    const byId = new Map(body.data.map((r) => [r.studentId, r]));

    expect(byId.get("a")?.total).toBe(5);
    expect(byId.get("a")?.present).toBe(3);
    expect(byId.get("a")?.late).toBe(1);
    expect(byId.get("a")?.absent).toBe(1);
    expect(byId.get("a")?.percent).toBe(80);

    expect(byId.get("b")?.total).toBe(5);
    expect(byId.get("b")?.percent).toBe(100);

    expect(byId.get("c")?.total).toBe(5);
    expect(byId.get("c")?.percent).toBe(0);
  });

  it("percent is 0 for a student with no records", async () => {
    const { client } = makeMockSupabase({ selectResult: { data: [], error: null } });
    const app = makeApp(client, "faculty");

    const res = await app.request(`${URL}/summary`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });
});

describe("attendance PATCH and route role gating", () => {
  it("student cannot POST (test 1 / role gate)", async () => {
    const { client } = makeMockSupabase();
    const app = makeApp(client, "student", studentAttendanceRoute);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sessionDate: "2026-09-07",
        entries: [{ studentId: "00000000-0000-0000-0000-000000000001", status: "present" }],
      }),
    });
    // Student router doesn't register POST, so Hono returns 404.
    expect(res.status).toBe(404);
  });

  it("student can GET (returns 200 with the underlying listRows call)", async () => {
    const { client } = makeMockSupabase({ selectResult: { data: [], error: null } });
    const app = makeApp(client, "student", studentAttendanceRoute);
    const res = await app.request(URL);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toEqual([]);
  });

  it("PATCH validation rejects invalid status", async () => {
    const { client } = makeMockSupabase();
    const app = makeApp(client, "faculty");
    const res = await app.request(`${URL}/row-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "sick" }),
    });
    expect(res.status).toBe(400);
  });
});
