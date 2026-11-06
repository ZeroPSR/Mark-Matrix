import { describe, it, expect, vi, beforeEach } from "vitest";
import app from "../index.js";

// The admin's course list, with each course's semester hierarchy.
//
// The flat CRUD course list at `/api/admin/courses` returns a row carrying
// only a `semesterId`, and the pages that build marks/attendance/lifecycle
// URLs from a course need the whole hierarchy. This endpoint is that list —
// the same shape `CourseWithSemester` in the shared package declares, which
// is what stopped the pages and the API drifting apart.

const mockGetUser = vi.fn();

/** A course as the hierarchy endpoint's join returns it. */
const HIERARCHY_ROWS = [
  {
    id: "c1",
    code: "CS101",
    title: "Intro to CS",
    credits: 3,
    semesters: {
      id: "s1",
      number: 1,
      program_id: "p1",
      programs: { id: "p1", batch_id: "b1" },
    },
  },
];

/** A course as the flat CRUD endpoint returns it. */
const FLAT_ROWS = [
  {
    id: "c1",
    semester_id: "s1",
    code: "CS101",
    title: "Intro to CS",
    credits: 3,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
  },
];

function makeClient(): unknown {
  let selectedCols = "*";
  const chain = {
    select(cols?: string) {
      selectedCols = cols ?? "*";
      return chain;
    },
    eq() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({ data: FLAT_ROWS[0], error: null });
    },
    then(
      onFulfilled?: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      const rows = selectedCols.includes("semesters!inner") ? HIERARCHY_ROWS : FLAT_ROWS;
      return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
    },
  };
  return {
    auth: { getUser: (...args: unknown[]) => mockGetUser(...args) },
    from: () => chain,
  };
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => makeClient(),
}));

const env = {
  ENVIRONMENT: "test",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_ANON_KEY: "test-anon",
  SUPABASE_SERVICE_ROLE_KEY: "test-svc",
};

const AUTH = { authorization: "Bearer valid.jwt.xyz" };

function asRole(role: "admin" | "faculty" | "student"): void {
  mockGetUser.mockResolvedValueOnce({
    data: { user: { id: `${role}-1`, app_metadata: { role } } },
    error: null,
  });
}

beforeEach(() => mockGetUser.mockReset());

describe("admin course hierarchy", () => {
  it("returns each course with its semester hierarchy", async () => {
    asRole("admin");
    const res = await app.request("/api/admin/courses/hierarchy", { headers: AUTH }, env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { id: string; code: string; semester: { id: string; number: number; programId: string; batchId: string } }[];
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.semester).toEqual({
      id: "s1",
      number: 1,
      programId: "p1",
      batchId: "b1",
    });
  });

  it("is not shadowed by the courses CRUD's GET /:id", async () => {
    // The CRUD route answers `/api/admin/courses/:id`, and "hierarchy" is a
    // valid-looking id. If the CRUD matched it, the response would be a
    // course-not-found instead of the list.
    asRole("admin");
    const res = await app.request("/api/admin/courses/hierarchy", { headers: AUTH }, env);
    const body = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(body.data)).toBe(true);
  });

  it("leaves the flat CRUD course list working", async () => {
    asRole("admin");
    const list = await app.request("/api/admin/courses", { headers: AUTH }, env);
    expect(list.status).toBe(200);

    asRole("admin");
    const one = await app.request("/api/admin/courses/c1", { headers: AUTH }, env);
    expect(one.status).toBe(200);
  });

  it("is admin-only", async () => {
    asRole("faculty");
    const res = await app.request("/api/admin/courses/hierarchy", { headers: AUTH }, env);
    expect(res.status).toBe(403);

    asRole("student");
    const student = await app.request("/api/admin/courses/hierarchy", { headers: AUTH }, env);
    expect(student.status).toBe(403);
  });
});
