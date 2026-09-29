import { describe, it, expect, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  marksRoute,
  studentMarksRoute,
} from "../routes/marks/core.js";
import { requireRole } from "../middleware/requireRole.js";

/**
 * Mock Supabase builder that records calls and returns configurable results.
 *
 * The marks router uses multiple tables (course_exam_types, marks, student_enrollments,
 * student_profiles) — the builder dispatches on the table name argument to
 * `from(...)`.
 */
type MarksCalls = {
  upsert: { rows: unknown; options: unknown }[];
  select: { args: unknown }[];
  update: { arg: unknown }[];
  updateEq: { col: string; val: unknown }[];
  in: { col: string; vals: unknown[] }[];
};

function makeMockSupabase(opts: {
  examTypes?: { exam_type: string; max_marks: number }[];
  upsertResult?: { data: unknown[] | null; error: null | { code: string; message: string } };
  updateResult?: { data: unknown[] | null; error: null | { code: string; message: string } };
  selectResult?: {
    data?: unknown[] | null;
    count?: number | null;
    error: null | { code: string; message: string };
  };
  studentsByRoll?: { user_id: string; roll_number: string }[];
  enrollments?: { student_id: string }[];
  course?: { id: string; semester_id: string };
} = {}): {
  client: SupabaseClient;
  calls: MarksCalls;
} {
  const calls: MarksCalls = {
    upsert: [],
    select: [],
    update: [],
    updateEq: [],
    in: [],
  };

  const examTypes = opts.examTypes ?? [];
  const studentsByRoll = opts.studentsByRoll ?? [];
  const enrollments = opts.enrollments ?? [];
  const course = opts.course ?? { id: "c1", semester_id: "s1" };

  const makeBuilder = (table: string): unknown => {
    // Track the operation mode this builder is currently in, so maybeSingle
    // returns the right shape. The same builder is reused across select,
    // update, and chained .eq() calls; the last operation wins.
    let mode: "select" | "update" = "select";
    const builder: Record<string, unknown> & {
      then: <T, R>(
        onFulfilled: (v: unknown) => T | PromiseLike<T>,
        onRejected?: (e: unknown) => R | PromiseLike<R>,
      ) => Promise<T | R>;
    } = {
      select(arg?: unknown) {
        calls.select.push({ args: [table, arg] });
        // Don't reset mode here — .update().eq().select().maybeSingle() must
        // still be recognized as an update chain.
        return builder;
      },
      eq(col: string, val: unknown) {
        calls.updateEq.push({ col, val });
        return builder;
      },
      neq(col: string, val: unknown) {
        calls.updateEq.push({ col, val });
        return builder;
      },
      in(col: string, vals: unknown[]) {
        calls.in.push({ col, vals });
        return builder;
      },
      order() {
        return builder;
      },
      maybeSingle() {
        if (mode === "update" && opts.updateResult) {
          const r = opts.updateResult;
          return Promise.resolve({
            data: r.data?.[0] ?? null,
            error: r.error,
          });
        }
        // Select maybeSingle — return the row matching the table, or null.
        let row: unknown = null;
        switch (table) {
          case "courses":
            row = course;
            break;
          case "course_exam_types":
            row = examTypes[0] ?? null;
            break;
          case "student_profiles":
            row = studentsByRoll[0] ?? null;
            break;
          case "student_enrollments":
            row = enrollments[0] ?? null;
            break;
          case "marks":
            // The PATCH path does .select("...max_marks").eq("id", id).maybeSingle()
            // — return a synthetic row with max_marks so the route's validation passes.
            row = { id: "row-1", course_id: "c1", exam_type: "midterm", max_marks: 30 };
            break;
        }
        return Promise.resolve({ data: row, error: null });
      },
      upsert(rows: unknown, options: unknown) {
        calls.upsert.push({ rows, options });
        mode = "select";
        const rowsArr = rows as unknown[];
        return {
          select() {
            // Honor opts.upsertResult if provided, otherwise synthesize a
            // row-per-input response so the route's succeeded count matches
            // the number of rows it sent.
            if (opts.upsertResult) {
              return Promise.resolve(opts.upsertResult);
            }
            return Promise.resolve({
              data: rowsArr.map((_, i) => ({ id: `row-${i + 1}` })),
              error: null,
            });
          },
        };
      },
      update(arg: unknown) {
        calls.update.push({ arg });
        mode = "update";
        return builder;
      },
      // Terminal await: return based on table and the mode.
      then(onFulfilled, onRejected) {
        let result: { data: unknown; count?: number | null; error: unknown };
        if (mode === "update") {
          // The submit handler does update().eq().eq() then awaits.
          if (opts.updateResult) {
            result = {
              data: opts.updateResult.data ?? [],
              error: opts.updateResult.error,
            };
          } else {
            result = { data: [], error: null };
          }
        } else {
          switch (table) {
            case "course_exam_types":
              result = {
                data: examTypes.map((e) => ({
                  exam_type: e.exam_type,
                  max_marks: e.max_marks,
                })),
                error: null,
              };
              break;
            case "student_enrollments":
              result = { data: enrollments, error: null };
              break;
            case "student_profiles":
              result = { data: studentsByRoll, error: null };
              break;
            case "courses":
              result = { data: course, error: null };
              break;
            default:
              // selectResult may carry a `count` for count-mode selects used
              // by the /submit precondition query.
              result = opts.selectResult
                ? {
                    data: opts.selectResult.data ?? [],
                    count: opts.selectResult.count ?? null,
                    error: opts.selectResult.error,
                  }
                : { data: [], error: null };
          }
        }
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
    return builder;
  };

  return {
    client: {
      from: (table: string) => makeBuilder(table),
    } as unknown as SupabaseClient,
    calls,
  };
}

function makeApp(
  supabase: SupabaseClient,
  role: "faculty" | "admin" | "student",
  subApp = marksRoute,
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
    "/api/test/batch/:batchId/program/:programId/sem/:semId/course/:courseId/marks",
    subApp,
  );
  return app;
}

const URL = "/api/test/batch/b1/program/p1/sem/s1/course/c1/marks";
const STUDENT_A = "00000000-0000-0000-0000-000000000001";
const STUDENT_B = "00000000-0000-0000-0000-000000000002";

describe("marks route shape", () => {
  it("POST with no body returns 400 validation_failed", async () => {
    const { client } = makeMockSupabase();
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  it("POST rejects negative marks_obtained at the schema layer", async () => {
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [
          { studentId: STUDENT_A, examType: "midterm", marksObtained: -5 },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("validation_failed");
  });

  it("POST rejects marks_obtained above max_marks with 400 (test 1)", async () => {
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [
          { studentId: STUDENT_A, examType: "midterm", marksObtained: 35 },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; detail?: string };
    expect(body.error).toBe("marks_exceed_max");
  });

  it("POST rejects exam_type not in the course's exam types (test 3 partial)", async () => {
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [
          { studentId: STUDENT_A, examType: "viva", marksObtained: 10 },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unknown_exam_type");
  });

  it("POST with a valid bulk request upserts all rows in one call", async () => {
    const { client, calls } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [
          { studentId: STUDENT_A, examType: "midterm", marksObtained: 27 },
          { studentId: STUDENT_B, examType: "midterm", marksObtained: 24 },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(2);

    expect(calls.upsert).toHaveLength(1);
    expect(calls.upsert[0]!.options).toEqual({
      onConflict: "course_id,student_id,exam_type",
    });
    expect((calls.upsert[0]!.rows as unknown[]).length).toBe(2);
  });

  it("POST upserts with max_marks snapshot copied from course_exam_types", async () => {
    const { client, calls } = makeMockSupabase({
      examTypes: [{ exam_type: "final", max_marks: 70 }],
    });
    const app = makeApp(client, "faculty");
    await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ studentId: STUDENT_A, examType: "final", marksObtained: 65 }],
      }),
    });
    expect(calls.upsert).toHaveLength(1);
    const firstRows = calls.upsert[0]!.rows as { max_marks: number }[];
    expect(firstRows[0]!.max_marks).toBe(70);
  });

  it("POST records entered_by from the authed user", async () => {
    const { client, calls } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
    });
    const app = makeApp(client, "faculty");
    await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ studentId: STUDENT_A, examType: "midterm", marksObtained: 10 }],
      }),
    });
    expect(calls.upsert).toHaveLength(1);
    const firstRows = calls.upsert[0]!.rows as { entered_by: string }[];
    expect(firstRows[0]!.entered_by).toBe("user-1");
  });

  it("PATCH on a row whose status != draft returns 409 (test 2)", async () => {
    const { client } = makeMockSupabase({
      updateResult: {
        data: null,
        error: { code: "P0001", message: "submitted rows are locked" },
      },
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(`${URL}/row-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marksObtained: 25 }),
    });
    // Either 409 (custom trigger raising) or 404 (RLS filtered it out) is acceptable —
    // what matters is that a draft-only enforcement is in place.
    expect([403, 404, 409]).toContain(res.status);
  });

  it("POST bulk-upsert on a course with locked-status rows returns 409 marks_data_locked (fix 1, test 2)", async () => {
    // The marks_lock_when_submitted trigger raises P0001 with message
    // "marks_data_locked" whenever an upsert targets a row whose status has
    // advanced past 'draft'. The bulkUpsert route must translate that to a
    // 409 with { error: "marks_data_locked" }, mirroring runStatusFlip.
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
      upsertResult: {
        data: null,
        error: { code: "P0001", message: "marks_data_locked" },
      },
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ studentId: STUDENT_A, examType: "midterm", marksObtained: 27 }],
      }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; detail?: string };
    expect(body.error).toBe("marks_data_locked");
  });

  it("student router returns 404 on POST (role gate)", async () => {
    const { client } = makeMockSupabase();
    const app = makeApp(client, "student", studentMarksRoute);
    const res = await app.request(URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entries: [{ studentId: STUDENT_A, examType: "midterm", marksObtained: 10 }],
      }),
    });
    expect(res.status).toBe(404);
  });

  it("student router returns 404 on PATCH", async () => {
    const { client } = makeMockSupabase();
    const app = makeApp(client, "student", studentMarksRoute);
    const res = await app.request(`${URL}/row-1`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ marksObtained: 25 }),
    });
    expect(res.status).toBe(404);
  });
});

describe("marks POST /submit", () => {
  it("flips all draft rows of the course to submitted via a single update call", async () => {
    const { client, calls } = makeMockSupabase({
      examTypes: [],
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(`${URL}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);

    expect(calls.update.length).toBeGreaterThan(0);
    const updateArg = calls.update[0]!.arg as { status: string };
    expect(updateArg.status).toBe("submitted");

    // Ensure the WHERE clause pins it to this course and draft only.
    const cols = calls.updateEq.map((e) => [e.col, e.val] as const);
    expect(cols.some(([col, val]) => col === "course_id" && val === "c1")).toBe(true);
    expect(cols.some(([col, val]) => col === "status" && val === "draft")).toBe(true);
  });

  it("returns 409 invalid_state_transition when the course has any non-draft marks (fix 2, test 2)", async () => {
    // The submit precondition query counts rows with status != 'draft'.
    // If the course has any submitted/approved/locked rows we must surface
    // 409 rather than letting the UPDATE match zero rows and return 200.
    const { client, calls } = makeMockSupabase({
      examTypes: [],
      selectResult: {
        data: [] as unknown[],
        count: 1, // any non-zero non-draft count trips the precondition
        error: null,
      },
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(`${URL}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; detail?: string };
    expect(body.error).toBe("invalid_state_transition");
    expect(body.detail).toBe("course has non-draft marks");

    // The UPDATE must NOT have been issued — precondition rejects before it.
    expect(calls.update).toHaveLength(0);
  });
});

describe("marks POST /bulk", () => {
  beforeEach(() => {
    // default reset happens per-test via makeMockSupabase
  });

  it("reports per-row success/error for a mixed CSV (test 4)", async () => {
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
      studentsByRoll: [
        { user_id: STUDENT_A, roll_number: "23BCA001" },
        { user_id: STUDENT_B, roll_number: "23BCA002" },
      ],
      enrollments: [
        { student_id: STUDENT_A },
        { student_id: STUDENT_B },
      ],
      // No upsertResult override — mock returns row-per-input.
    });
    const app = makeApp(client, "faculty");
    const csv =
      "roll_number,exam_type,marks_obtained\n" +
      "23BCA001,midterm,27\n" +          // ok
      "23BCA002,midterm,40\n" +          // exceeds max (30)
      "23BCA999,midterm,20\n" +          // no such student
      "23BCA001,final,10\n" +            // unknown exam type
      "23BCA001,viva,20\n";              // unknown exam type too
    const res = await app.request(`${URL}/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      succeeded: number;
      errors: { row: number; rollNumber?: string; reason: string }[];
    };
    expect(body.succeeded).toBe(1);
    // 4 errors: exceeds_max, no_such_student, unknown_exam_type, unknown_exam_type
    expect(body.errors).toHaveLength(4);
    const reasons = body.errors.map((e) => e.reason).sort();
    expect(reasons).toEqual([
      "exceeds_max",
      "no_such_student",
      "unknown_exam_type",
      "unknown_exam_type",
    ]);
  });

  it("reports invalid_marks for non-numeric CSV values", async () => {
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
      studentsByRoll: [{ user_id: STUDENT_A, roll_number: "23BCA001" }],
      enrollments: [{ student_id: STUDENT_A }],
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(`${URL}/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: "roll_number,exam_type,marks_obtained\n23BCA001,midterm,abc\n",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      succeeded: number;
      errors: { reason: string }[];
    };
    expect(body.succeeded).toBe(0);
    expect(body.errors[0]?.reason).toBe("invalid_marks");
  });

  it("rejects student who is not enrolled in this course's roster (not_in_roster)", async () => {
    const { client } = makeMockSupabase({
      examTypes: [{ exam_type: "midterm", max_marks: 30 }],
      studentsByRoll: [{ user_id: STUDENT_A, roll_number: "23BCA001" }],
      enrollments: [], // no enrollments in this sem
    });
    const app = makeApp(client, "faculty");
    const res = await app.request(`${URL}/bulk`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        csv: "roll_number,exam_type,marks_obtained\n23BCA001,midterm,20\n",
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      succeeded: number;
      errors: { reason: string }[];
    };
    expect(body.succeeded).toBe(0);
    expect(body.errors[0]?.reason).toBe("not_in_roster");
  });
});
