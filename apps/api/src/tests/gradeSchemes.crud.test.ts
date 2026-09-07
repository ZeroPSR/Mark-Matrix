import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../env.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminGradeSchemesRoute } from "../routes/admin/gradeSchemes.js";

type SchemeRow = {
  id: string;
  scheme_group: string;
  scope: "course" | "program";
  course_id: string | null;
  program_id: string | null;
  grade_label: string;
  min_marks: number;
  max_marks: number;
  grade_point: number;
  is_passing: boolean;
  created_at: string;
  updated_at: string;
};

type DepRow = { id: string; grade_scheme_id: string };

function makeMockSupabase(opts: {
  existing?: SchemeRow[];
  dependents?: DepRow[];
  deleted?: { id: string }[];
} = {}): SupabaseClient {
  const store = [...(opts.existing ?? [])];
  const deps = [...(opts.dependents ?? [])];
  const deleted: { id: string }[] = [];

  const builder = (table: string): unknown => {
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let pendingInsert: unknown = undefined;
    let pendingUpdate: unknown = undefined;
    const eqFilters: Array<{ col: string; val: unknown }> = [];
    let wantsCount = false;
    const b: Record<string, unknown> & { then?: unknown } = {
      select(arg1?: unknown, arg2?: unknown) {
        // Detect the count pattern: select("id", { count: "exact", head: true })
        const opts =
          arg2 && typeof arg2 === "object"
            ? arg2
            : arg1 && typeof arg1 === "object"
              ? arg1
              : null;
        if (opts && "count" in (opts as Record<string, unknown>)) {
          wantsCount = true;
        }
        // Do not reset mode here: chains like `insert().select()` and
        // `update().select()` use the trailing select() to add a RETURNING
        // clause, not to switch from insert/update to a plain select.
        return b;
      },
      insert(arg: unknown) { mode = "insert"; pendingInsert = arg; return b; },
      update(arg: unknown) { mode = "update"; pendingUpdate = arg; return b; },
      delete() { mode = "delete"; return b; },
      eq(col: string, val: unknown) {
        eqFilters.push({ col, val });
        return b;
      },
      order() { return b; },
      async single() {
        if (mode === "insert") {
          const ins = pendingInsert as Partial<SchemeRow>;
          const row: SchemeRow = {
            id: `new-${store.length + 1}`,
            scheme_group: ins.scheme_group ?? "g1",
            scope: ins.scope ?? "course",
            course_id: ins.course_id ?? null,
            program_id: ins.program_id ?? null,
            grade_label: ins.grade_label ?? "A",
            min_marks: Number(ins.min_marks ?? 0),
            max_marks: Number(ins.max_marks ?? 100),
            grade_point: Number(ins.grade_point ?? 9),
            is_passing: ins.is_passing ?? true,
            created_at: "2026-09-07T00:00:00Z",
            updated_at: "2026-09-07T00:00:00Z",
          };
          store.push(row);
          return { data: row, error: null };
        }
        if (mode === "update") {
          const id = eqFilters.find((f) => f.col === "id")?.val as string;
          const upd = pendingUpdate as Partial<SchemeRow>;
          const row = store.find((r) => r.id === id);
          if (!row) return { data: null, error: { code: "PGRST116", message: "not found" } };
          Object.assign(row, upd, { updated_at: "2026-09-07T00:00:00Z" });
          return { data: row, error: null };
        }
        return { data: null, error: { code: "unexpected", message: "single only in insert/update paths" } };
      },
      async maybeSingle() {
        // Apply a pending UPDATE first — `.update().select()` chains reset
        // mode to "select" but the update is still pending and must land on
        // the row before we return it.
        if (pendingUpdate !== undefined) {
          const id = eqFilters.find((f) => f.col === "id")?.val as string;
          const upd = pendingUpdate as Partial<SchemeRow>;
          const row = store.find((r) => r.id === id);
          pendingUpdate = undefined;
          if (!row) return { data: null, error: null };
          Object.assign(row, upd, { updated_at: "2026-09-07T00:00:00Z" });
          return { data: row, error: null };
        }
        if (mode === "select") {
          if (table === "course_grades") return { data: null, error: null };
          let rows = store;
          for (const f of eqFilters) rows = rows.filter((r) => (r as Record<string, unknown>)[f.col] === f.val);
          return { data: rows[0] ?? null, error: null };
        }
        return { data: null, error: null };
      },
      // List endpoint (no .single())
      async then<T>(onFulfilled: (v: { data?: unknown[]; count?: number; error: null }) => T): Promise<T> {
        if (mode === "select") {
          if (wantsCount && table === "course_grades") {
            const id = eqFilters.find((f) => f.col === "grade_scheme_id")?.val as string;
            const count = deps.filter((d) => d.grade_scheme_id === id).length;
            return onFulfilled({ count, error: null });
          }
          let rows = store;
          for (const f of eqFilters) rows = rows.filter((r) => (r as Record<string, unknown>)[f.col] === f.val);
          return onFulfilled({ data: rows, error: null });
        }
        if (mode === "delete") {
          const id = eqFilters.find((f) => f.col === "id")?.val as string;
          const row = store.find((r) => r.id === id);
          if (row) {
            store.splice(store.indexOf(row), 1);
            deleted.push({ id });
          }
          return onFulfilled({ data: [], error: null });
        }
        return onFulfilled({ data: [], error: null });
      },
    };
    return b;
  };

  return { from: builder } as unknown as SupabaseClient;
}

function makeApp(supabase: SupabaseClient, role: "admin" | "faculty" | "student" = "admin"): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/admin/*", async (c, next) => {
    c.set("supabase", supabase);
    c.set("userId", "admin-1");
    c.set("role", role);
    await next();
  });
  app.route("/api/admin/grade-schemes", adminGradeSchemesRoute);
  return app;
}

describe("admin grade-schemes CRUD", () => {
  const courseUuid = "00000000-0000-0000-0000-000000000001";
  const programUuid = "00000000-0000-0000-0000-000000000002";

  it("GET / lists schemes filtered by scope/courseId", async () => {
    const supabase = makeMockSupabase({
      existing: [
        { id: "s1", scheme_group: "FY24", scope: "course", course_id: courseUuid, program_id: null,
          grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 9, is_passing: true,
          created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" },
      ],
    });
    const res = await makeApp(supabase).request(`/api/admin/grade-schemes?scope=course&courseId=${courseUuid}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it("POST / creates a band with no overlap", async () => {
    const supabase = makeMockSupabase({
      existing: [
        { id: "s1", scheme_group: "FY24", scope: "course", course_id: courseUuid, program_id: null,
          grade_label: "B", min_marks: 60, max_marks: 80, grade_point: 8, is_passing: true,
          created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" },
      ],
    });
    const res = await makeApp(supabase).request("/api/admin/grade-schemes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemeGroup: "FY24",
        scope: "course",
        courseId: courseUuid,
        gradeLabel: "A",
        minMarks: 80,
        maxMarks: 100,
        gradePoint: 9,
        isPassing: true,
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as { data: { gradeLabel: string } };
    expect(body.data.gradeLabel).toBe("A");
  });

  it("POST / rejects overlapping band in same scheme_group", async () => {
    const supabase = makeMockSupabase({
      existing: [
        { id: "s1", scheme_group: "FY24", scope: "course", course_id: courseUuid, program_id: null,
          grade_label: "B", min_marks: 60, max_marks: 80, grade_point: 8, is_passing: true,
          created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" },
      ],
    });
    const res = await makeApp(supabase).request("/api/admin/grade-schemes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemeGroup: "FY24",
        scope: "course",
        courseId: courseUuid,
        gradeLabel: "A",
        minMarks: 70, // overlaps 60-80
        maxMarks: 90,
        gradePoint: 9,
      }),
    });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("overlapping_band");
  });

  it("POST / rejects mismatched scope/anchor", async () => {
    const supabase = makeMockSupabase();
    const res = await makeApp(supabase).request("/api/admin/grade-schemes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        schemeGroup: "FY24",
        scope: "course",
        programId: programUuid, // wrong — scope=course needs courseId
        gradeLabel: "A",
        minMarks: 80,
        maxMarks: 100,
        gradePoint: 9,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("PATCH /:id updates fields", async () => {
    const supabase = makeMockSupabase({
      existing: [
        { id: "s1", scheme_group: "FY24", scope: "course", course_id: courseUuid, program_id: null,
          grade_label: "B", min_marks: 60, max_marks: 80, grade_point: 8, is_passing: true,
          created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" },
      ],
    });
    const res = await makeApp(supabase).request("/api/admin/grade-schemes/s1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gradePoint: 8.5 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { gradePoint: number } };
    expect(body.data.gradePoint).toBe(8.5);
  });

  it("DELETE /:id returns 409 has_dependents when course_grades reference it", async () => {
    const supabase = makeMockSupabase({
      existing: [
        { id: "s1", scheme_group: "FY24", scope: "course", course_id: courseUuid, program_id: null,
          grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 9, is_passing: true,
          created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" },
      ],
      dependents: [{ id: "cg1", grade_scheme_id: "s1" }],
    });
    const res = await makeApp(supabase).request("/api/admin/grade-schemes/s1", { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("has_dependents");
  });

  it("DELETE /:id succeeds when no dependents", async () => {
    const supabase = makeMockSupabase({
      existing: [
        { id: "s1", scheme_group: "FY24", scope: "course", course_id: courseUuid, program_id: null,
          grade_label: "A", min_marks: 80, max_marks: 100, grade_point: 9, is_passing: true,
          created_at: "2026-09-07T00:00:00Z", updated_at: "2026-09-07T00:00:00Z" },
      ],
    });
    const res = await makeApp(supabase).request("/api/admin/grade-schemes/s1", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});